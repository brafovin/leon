// Kleine Mathe-/Noise-Helfer ohne externe Abhängigkeiten.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const invLerp = (a, b, v) => clamp((v - a) / (b - a || 1e-6), 0, 1);
/** Framerate-unabhängiges Annähern (t = "Anteil pro Sekunde"). */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Deterministischer PRNG (mulberry32). */
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Value-Noise mit fBm – schnell genug für Terrain-Aufbau. */
export class Noise {
  constructor(seed = 1) {
    const rng = makeRng(seed);
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  _hash(x, y) {
    return this.p[(this.p[x & 255] + (y & 255)) & 255] / 255;
  }
  /** Value-Noise in [-1,1]. */
  noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smoothstep(xf), v = smoothstep(yf);
    const a = this._hash(xi, yi), b = this._hash(xi + 1, yi);
    const c = this._hash(xi, yi + 1), d = this._hash(xi + 1, yi + 1);
    return (lerp(lerp(a, b, u), lerp(c, d, u), v) - 0.5) * 2;
  }
  fbm(x, y, octaves = 4, lacunarity = 2.02, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
  /** Ridged fBm – erzeugt Grate/Bergkämme. */
  ridged(x, y, octaves = 4) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise2(x * freq, y * freq));
      sum += amp * (n * n);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return (sum / norm) * 2 - 1;
  }
}

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return "–";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const c = Math.floor((sec * 100) % 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}
