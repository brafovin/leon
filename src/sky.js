import * as THREE from "three";
import { makeRng } from "./util.js";

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
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor, bottomColor, sunColor, sunDir;
      uniform float night;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(bottomColor, topColor, pow(h, 0.75));
        float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * pow(d, 220.0) * 2.2;                 // Sonnenscheibe
        col += sunColor * pow(d, 6.0) * (night > 0.5 ? 0.12 : 0.35); // Streulicht
        col += sunColor * pow(clamp(1.0 - abs(vDir.y) * 2.4, 0.0, 1.0), 3.0) * 0.12;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 20), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
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
      this.count = 2600;
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
      this.count = type === "snow" ? 2400 : 3200;
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
