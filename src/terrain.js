import * as THREE from "three";
import { clamp, lerp, smoothstep, invLerp } from "./util.js";
import { QUALITY } from "./device.js";
import { grainTexture } from "./textures.js";

/**
 * Höhenfeld der Welt. Das Terrain wird entlang der Strecke eingeebnet,
 * damit die Straße sauber im Gelände liegt.
 */
export class Terrain {
  constructor(world, noise, track) {
    this.world = world;
    this.noise = noise;
    this.size = world.size;
    this.seg = QUALITY.terrainSeg;
    this.half = this.size / 2;
    this.step = this.size / this.seg;
    const N = this.seg + 1;
    this.N = N;
    this.h = new Float32Array(N * N);

    const t = world.terrain;
    const flatW = track.width + 3.0;   // komplett eben (Asphalt + Rand)
    const blend = 20;                  // sanfter Übergang ins Gelände

    for (let j = 0; j < N; j++) {
      const z = -this.half + j * this.step;
      for (let i = 0; i < N; i++) {
        const x = -this.half + i * this.step;
        let y = t.height(noise, x, z);
        const near = track.nearest(x, z);
        if (near.dist < flatW + blend) {
          const k = near.dist <= flatW ? 0 : smoothstep((near.dist - flatW) / blend);
          y = lerp(near.y - 0.14, y, k);
        }
        this.h[j * N + i] = y;
      }
    }
  }

  /** Bilinear interpolierte Geländehöhe. */
  heightAt(x, z) {
    const N = this.N;
    const fx = clamp((x + this.half) / this.step, 0, N - 1.001);
    const fz = clamp((z + this.half) / this.step, 0, N - 1.001);
    const i = fx | 0, j = fz | 0;
    const tx = fx - i, tz = fz - j;
    const h = this.h;
    const a = h[j * N + i], b = h[j * N + i + 1];
    const c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  /** Normale aus zentralen Differenzen – für Neigung des Autos. */
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 2.2;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  buildMesh() {
    const t = this.world.terrain;
    const N = this.N;
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.seg, this.seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const cLow = new THREE.Color(t.colLow);
    const cMid = new THREE.Color(t.colMid);
    const cHigh = new THREE.Color(t.colHigh);
    const cRock = new THREE.Color(t.colRock);
    const tmp = new THREE.Color();

    let minH = Infinity, maxH = -Infinity;
    for (let k = 0; k < this.h.length; k++) {
      if (this.h[k] < minH) minH = this.h[k];
      if (this.h[k] > maxH) maxH = this.h[k];
    }

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const y = this.h[k];
        pos.setY(k, y);

        // Hangneigung
        const hl = this.h[j * N + Math.max(0, i - 1)];
        const hr = this.h[j * N + Math.min(N - 1, i + 1)];
        const hd = this.h[Math.max(0, j - 1) * N + i];
        const hu = this.h[Math.min(N - 1, j + 1) * N + i];
        const slope = clamp(Math.hypot(hr - hl, hu - hd) / (this.step * 2) * 1.4, 0, 1);

        const hn = invLerp(minH, maxH, y);
        if (t.sandBand > -900 && y < t.sandBand) {
          tmp.copy(cLow);
        } else {
          tmp.copy(cMid).lerp(cHigh, smoothstep(clamp((hn - 0.42) / 0.5, 0, 1)));
          if (t.snowLine !== undefined) {
            tmp.lerp(cHigh, smoothstep(clamp((y - t.snowLine) / 55, 0, 1)));
          }
        }
        if (slope > t.rockSlope) {
          tmp.lerp(cRock, smoothstep(clamp((slope - t.rockSlope) / 0.35, 0, 1)));
        }
        // großflächige Farbflecken + feines Rauschen gegen den Flächenlook
        const wx = -this.half + i * this.step, wz = -this.half + j * this.step;
        const patch = this.noise.fbm(wx * 0.0042, wz * 0.0042, 3);
        tmp.offsetHSL(patch * 0.028, patch * 0.13, patch * 0.055);
        const n = 1 + (((i * 73856093) ^ (j * 19349663)) % 100) / 100 * 0.08 - 0.04;
        colors[k * 3] = tmp.r * n;
        colors[k * 3 + 1] = tmp.g * n;
        colors[k * 3 + 2] = tmp.b * n;
      }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const grain = grainTexture();
    grain.repeat.set(this.size / 14, this.size / 14);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.96, metalness: 0, map: grain,
      })
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Animiertes Wasser (nur in Welten mit Meer). */
  buildWater() {
    const w = this.world.water;
    if (!w) return null;
    const geo = new THREE.PlaneGeometry(this.size * 2.4, this.size * 2.4, QUALITY.waterSeg, QUALITY.waterSeg);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: w.color, transparent: true, opacity: w.opacity,
        roughness: 0.14, metalness: 0.55,
      })
    );
    mesh.position.y = w.level;
    mesh.userData.base = geo.attributes.position.array.slice();
    return mesh;
  }

  static animateWater(mesh, time) {
    if (!mesh) return;
    const pos = mesh.geometry.attributes.position;
    const base = mesh.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      pos.array[i * 3 + 1] =
        Math.sin(x * 0.008 + time * 1.1) * 0.9 + Math.cos(z * 0.011 - time * 0.8) * 0.7;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}
