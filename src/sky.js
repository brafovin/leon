import * as THREE from "three";
import { makeRng } from "./util.js";
import { QUALITY } from "./device.js";

/** Farbverlauf-Himmel mit Sonnenschein, als Kuppel um die Kamera. */
export function createSkyDome(world, sunDir) {
  const s = world.sky;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(s.top) },
      bottomColor: { value: new THREE.Color(s.bottom) },
      sunColor: { value: new THREE.Color(s.sun) },
      sunDir: { value: sunDir.clone().normalize() },
      night: { value: s.night ? 1 : 0 },
      cloud: { value: s.cloud === undefined ? 0.45 : s.cloud },
      cloudCol: { value: new THREE.Color(s.cloudColor || 0xffffff) },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor, bottomColor, sunColor, sunDir, cloudCol;
      uniform float night, cloud, time;
      varying vec3 vDir;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p){
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return s;
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(bottomColor, topColor, pow(h, 0.75));
        float d = max(dot(dir, normalize(sunDir)), 0.0);
        col += sunColor * pow(d, 220.0) * 2.2;                 // Sonnenscheibe
        col += sunColor * pow(d, 6.0) * (night > 0.5 ? 0.12 : 0.35); // Streulicht
        col += sunColor * pow(clamp(1.0 - abs(dir.y) * 2.4, 0.0, 1.0), 3.0) * 0.12;

        // --- Wolkenschicht: fBm auf eine Ebene über dem Horizont projiziert ---
        if (cloud > 0.01 && dir.y > 0.01) {
          // Kuppelprojektion statt Ebene: bleibt auch flach über dem Horizont lesbar
          vec2 uv = dir.xz / (dir.y + 0.55) * 3.2;
          uv += vec2(time * 0.004, time * 0.0016);
          float n = fbm(uv);
          n = mix(n, fbm(uv * 2.7 + 4.0), 0.35);
          n = clamp((n - 0.3) / 0.34, 0.0, 1.0);        // Kontrast auf 0…1 spreizen
          float cover = 1.0 - cloud;
          float dens = smoothstep(cover - 0.08, cover + 0.24, n);
          dens *= smoothstep(0.02, 0.17, dir.y);               // am Horizont ausblenden
          // Unterseite dunkler, sonnenzugewandte Kante heller
          vec3 lit = cloudCol * (0.62 + 0.5 * pow(d, 3.0));
          vec3 shade = mix(cloudCol * 0.42, bottomColor, 0.45);
          vec3 cc = mix(shade, lit, smoothstep(cover, cover + 0.3, n));
          col = mix(col, cc, dens * (night > 0.5 ? 0.55 : 0.92));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 40, 24), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.userData.mat = mat;
  return dome;
}

export function createStars(seed = 7) {
  const rng = makeRng(seed);
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(a) * r * 3600;
    pos[i * 3 + 1] = Math.abs(u) * 3600 + 120;
    pos[i * 3 + 2] = Math.sin(a) * r * 3600;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 9, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false,
  }));
  pts.frustumCulled = false;
  return pts;
}

/** Wetterpartikel, die immer um die Kamera herum "mitfahren". */
export class Weather {
  constructor(type) {
    this.type = type;
    this.obj = null;
    this.box = 130;
    if (type === "none") return;

    const rng = makeRng(99);
    if (type === "rain") {
      this.count = Math.round(2600 * QUALITY.weatherScale);
      const pos = new Float32Array(this.count * 6);
      this.vel = new Float32Array(this.count);
      for (let i = 0; i < this.count; i++) {
        const x = (rng() - 0.5) * this.box * 2, y = rng() * this.box, z = (rng() - 0.5) * this.box * 2;
        pos.set([x, y, z, x + 0.15, y - 2.4, z], i * 6);
        this.vel[i] = 62 + rng() * 34;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      this.obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: 0x9fd8ff, transparent: true, opacity: 0.42, fog: false,
      }));
    } else {
      this.count = Math.round((type === "snow" ? 2400 : 3200) * QUALITY.weatherScale);
      const pos = new Float32Array(this.count * 3);
      this.vel = new Float32Array(this.count);
      for (let i = 0; i < this.count; i++) {
        pos[i * 3] = (rng() - 0.5) * this.box * 2;
        pos[i * 3 + 1] = rng() * this.box;
        pos[i * 3 + 2] = (rng() - 0.5) * this.box * 2;
        this.vel[i] = type === "snow" ? 2.6 + rng() * 3 : 1 + rng() * 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      this.obj = new THREE.Points(geo, new THREE.PointsMaterial({
        color: type === "snow" ? 0xffffff : 0xe8c99a,
        size: type === "snow" ? 0.9 : 0.6,
        transparent: true, opacity: type === "snow" ? 0.9 : 0.5,
        sizeAttenuation: true, fog: false, depthWrite: false,
      }));
    }
    this.obj.frustumCulled = false;
  }

  update(dt, camPos, time) {
    if (!this.obj) return;
    const arr = this.obj.geometry.attributes.position.array;
    const B = this.box;
    if (this.type === "rain") {
      for (let i = 0; i < this.count; i++) {
        const o = i * 6;
        const fall = this.vel[i] * dt;
        arr[o + 1] -= fall; arr[o + 4] -= fall;
        arr[o] += dt * 9; arr[o + 3] += dt * 9;
        if (arr[o + 1] < camPos.y - B * 0.5) {
          const x = camPos.x + (Math.random() - 0.5) * B * 2;
          const z = camPos.z + (Math.random() - 0.5) * B * 2;
          const y = camPos.y + B * 0.55;
          arr[o] = x; arr[o + 1] = y; arr[o + 2] = z;
          arr[o + 3] = x + 0.15; arr[o + 4] = y - 2.4; arr[o + 5] = z;
        }
      }
    } else {
      const drift = this.type === "sand" ? 26 : 3.2;
      for (let i = 0; i < this.count; i++) {
        const o = i * 3;
        arr[o + 1] -= this.vel[i] * dt;
        arr[o] += Math.sin(time * 0.8 + i) * dt * drift * 0.4 + dt * drift;
        arr[o + 2] += Math.cos(time * 0.6 + i * 0.7) * dt * drift * 0.3;
        if (arr[o + 1] < camPos.y - B * 0.5 || Math.abs(arr[o] - camPos.x) > B) {
          arr[o] = camPos.x + (Math.random() - 0.5) * B * 2;
          arr[o + 1] = camPos.y + B * 0.5;
          arr[o + 2] = camPos.z + (Math.random() - 0.5) * B * 2;
        }
      }
    }
    this.obj.geometry.attributes.position.needsUpdate = true;
  }
}
