import * as THREE from "three";
import { Noise, clamp } from "./util.js";

// Prozedurale Detailtexturen (im Code erzeugt, keine Dateien).
// Sie liegen multiplikativ über den Vertex-Farben und geben Nahaufnahmen Struktur.
const cache = new Map();

function build(key, size, fill) {
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(size, size);
  fill(img.data, size);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Feines Korn fürs Gelände – hell, damit die Vertex-Farben erhalten bleiben. */
export function grainTexture() {
  return build("grain", 256, (d, n) => {
    const noise = new Noise(4711);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // nahtlos durch Abtastung auf einem Torus-Gitter
        const a = (x / n) * Math.PI * 2, b = (y / n) * Math.PI * 2;
        const v = noise.fbm(Math.cos(a) * 6 + 10, Math.cos(b) * 6 + 10, 3) * 0.5
                + noise.fbm(Math.sin(a) * 13, Math.sin(b) * 13, 2) * 0.5;
        const g = clamp(0.86 + v * 0.2, 0.6, 1) * 255;
        const i = (y * n + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = g;
        d[i + 3] = 255;
      }
    }
  });
}

/** Asphalt: dunkles Korn mit hellen Splittkörnern. */
export function asphaltTexture() {
  return build("asphalt", 256, (d, n) => {
    const noise = new Noise(1234);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const a = (x / n) * Math.PI * 2, b = (y / n) * Math.PI * 2;
        const fine = noise.fbm(Math.cos(a) * 26 + 3, Math.cos(b) * 26 + 3, 3);
        const coarse = noise.fbm(Math.sin(a) * 9, Math.sin(b) * 9, 2);
        let g = 0.78 + fine * 0.26 + coarse * 0.1;
        if (fine > 0.55) g += 0.22;                    // einzelne helle Körner
        g = clamp(g, 0.45, 1.25) * 255;
        const i = (y * n + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = Math.min(255, g);
        d[i + 3] = 255;
      }
    }
  });
}
