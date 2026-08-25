import * as THREE from "three";

/**
 * Schlanke Nachbearbeitung ohne Zusatzbibliotheken:
 * Szene -> Rendertarget -> Bloom (halbe Auflösung) -> Vignette & Farbkorrektur.
 */
const QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class PostFX {
  constructor(renderer, { bloom = true } = {}) {
    this.renderer = renderer;
    this.enabled = true;
    this.bloom = bloom;

    const rtOpts = { type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false };
    // Wichtig: three schreibt in Rendertargets immer LINEAR (nicht sRGB).
    // Bloom rechnen wir deshalb linear und wandeln erst im letzten Pass um.
    this.scene = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, samples: 4 });
    this.a = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthBuffer: false });
    this.b = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthBuffer: false });
    for (const rt of [this.scene, this.a, this.b]) {
      rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
    }

    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.geo = new THREE.PlaneGeometry(2, 2);

    this.bright = this._mat({
      uniforms: { tDiffuse: { value: null }, threshold: { value: 0.6 } },
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.25, l), 1.0);
        }`,
    });

    this.blur = this._mat({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) },
                  texel: { value: new THREE.Vector2(1, 1) } },
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 dir, texel; varying vec2 vUv;
        void main() {
          vec2 o = dir * texel;
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227;
          c += (texture2D(tDiffuse, vUv + o * 1.385).rgb
              + texture2D(tDiffuse, vUv - o * 1.385).rgb) * 0.316;
          c += (texture2D(tDiffuse, vUv + o * 3.231).rgb
              + texture2D(tDiffuse, vUv - o * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });

    this.composite = this._mat({
      uniforms: {
        tDiffuse: { value: null }, tBloom: { value: null },
        bloomAmount: { value: 0.35 }, vignette: { value: 0.3 },
        saturation: { value: 1.08 }, contrast: { value: 1.04 },
      },
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tBloom;
        uniform float bloomAmount, vignette, saturation, contrast;
        varying vec2 vUv;

        vec3 lin2srgb(vec3 c) {
          c = max(c, vec3(0.0));
          return mix(c * 12.92,
                     1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
                     step(vec3(0.0031308), c));
        }

        void main() {
          // 1) linear: Szene + Bloom addieren
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          c += texture2D(tBloom, vUv).rgb * bloomAmount;

          // 2) in den Anzeigefarbraum wandeln
          c = lin2srgb(c);

          // 3) Sättigung und Kontrast
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, saturation);
          c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);

          // 4) Vignette
          vec2 d = vUv - 0.5;
          float v = 1.0 - smoothstep(0.5, 1.0, length(d) * 1.42) * vignette;
          gl_FragColor = vec4(c * v, 1.0);
        }`,
    });

    this.quad = new THREE.Mesh(this.geo, this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  _mat(def) {
    return new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, depthTest: false, depthWrite: false, ...def,
    });
  }

  setSize(w, h, dpr) {
    const W = Math.max(1, Math.floor(w * dpr));
    const H = Math.max(1, Math.floor(h * dpr));
    this.scene.setSize(W, H);
    this.a.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    this.b.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    this.blur.uniforms.texel.value.set(2 / W, 2 / H);
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.cam);
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    r.setRenderTarget(this.scene);
    r.clear();
    r.render(scene, camera);

    if (this.bloom) {
      this.bright.uniforms.tDiffuse.value = this.scene.texture;
      this._pass(this.bright, this.a);
      this.blur.uniforms.tDiffuse.value = this.a.texture;
      this.blur.uniforms.dir.value.set(1, 0);
      this._pass(this.blur, this.b);
      this.blur.uniforms.tDiffuse.value = this.b.texture;
      this.blur.uniforms.dir.value.set(0, 1);
      this._pass(this.blur, this.a);
    }

    this.composite.uniforms.tDiffuse.value = this.scene.texture;
    this.composite.uniforms.tBloom.value = this.bloom ? this.a.texture : null;
    this.composite.uniforms.bloomAmount.value = this.bloom ? 0.38 : 0;
    this._pass(this.composite, null);
  }

  dispose() {
    for (const rt of [this.scene, this.a, this.b]) rt.dispose();
    this.geo.dispose();
    for (const m of [this.bright, this.blur, this.composite]) m.dispose();
  }
}
