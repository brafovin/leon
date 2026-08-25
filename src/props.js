import * as THREE from "three";
import { makeRng } from "./util.js";
import { QUALITY } from "./device.js";

/**
 * Streut Bäume / Felsen / Hochhäuser über die Welt (InstancedMesh),
 * hält Straße und Wasser frei und liefert grobe Kollisionszylinder.
 */
export class Props {
  constructor(world, terrain, track) {
    this.group = new THREE.Group();
    this.solids = [];        // {x,z,r} – Hindernisse mit Kollision
    this.cell = 45;
    this.grid = new Map();

    const rng = makeRng(world.seed + 17);
    const kind = world.props.kind;
    const waterY = world.water ? world.water.level : -Infinity;
    const half = world.size / 2 - 60;
    const norm = new THREE.Vector3();

    // 1) Gültige Positionen sammeln
    const spots = [];
    const need = Math.round(world.props.count * QUALITY.propScale);
    let guard = 0;
    while (spots.length < need && guard++ < need * 30) {
      const x = (rng() * 2 - 1) * half;
      const z = (rng() * 2 - 1) * half;
      const y = terrain.heightAt(x, z);
      if (y < waterY + 2.5) continue;
      const near = track.nearest(x, z);
      const minDist = kind === "city" ? track.width + 22 : track.width + 7;
      if (near.dist < minDist) continue;
      terrain.normalAt(x, z, norm);
      const flatNeed = kind === "city" ? 0.94 : 0.86;
      if (norm.y < flatNeed) continue;
      spots.push({ x, y, z, r: rng(), a: rng() * Math.PI * 2 });
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const euler = new THREE.Euler();
    const put = (mesh, i, px, py, pz, sx, sy, sz, ry, col) => {
      q.setFromAxisAngle(yAxis, ry);
      m.compose(v.set(px, py, pz), q, sc.set(sx, sy, sz));
      mesh.setMatrixAt(i, m);
      if (col) mesh.setColorAt(i, col);
    };
    const putRot = (mesh, i, px, py, pz, s1, rx, ry, rz, col) => {
      q.setFromEuler(euler.set(rx, ry, rz, "YXZ"));
      m.compose(v.set(px, py, pz), q, sc.set(s1, s1, s1));
      mesh.setMatrixAt(i, m);
      if (col) mesh.setColorAt(i, col);
    };

    const inst = (geo, mat, n) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.castShadow = kind !== "city";
      im.receiveShadow = true;
      im.frustumCulled = true;
      this.group.add(im);
      return im;
    };

    const tint = new THREE.Color(world.props.tint);
    const c = new THREE.Color();

    if (kind === "city") {
      const body = inst(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.35 }),
        spots.length
      );
      const win = inst(
        new THREE.BoxGeometry(1.02, 1, 1.02),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
        spots.length * 3
      );
      const neon = [0xff2e78, 0x20e3ff, 0x7b2ff7, 0xffe14d, 0x39ff88];
      let wi = 0;
      spots.forEach((s, i) => {
        const w = 12 + s.r * 22;
        const d = 12 + rng() * 22;
        const h = 22 + Math.pow(rng(), 2) * 150;
        c.setHex(0x20202c).offsetHSL(0, 0, (rng() - 0.5) * 0.06);
        put(body, i, s.x, s.y + h / 2 - 1, s.z, w, h, d, s.a, c);
        // leuchtende Fensterbänder
        for (let k = 0; k < 3; k++) {
          const bandY = s.y + h * (0.25 + k * 0.24);
          c.setHex(neon[(rng() * neon.length) | 0]).multiplyScalar(0.8 + rng() * 0.6);
          put(win, wi++, s.x, bandY, s.z, w * 0.99, 1.1 + rng() * 1.6, d * 0.99, s.a, c);
        }
        this.addSolid(s.x, s.z, Math.max(w, d) * 0.62);
      });
      win.count = wi;
      body.instanceColor.needsUpdate = true;
      win.instanceColor.needsUpdate = true;
      win.instanceMatrix.needsUpdate = true;
      body.instanceMatrix.needsUpdate = true;
    } else if (kind === "pine") {
      const trunk = inst(new THREE.CylinderGeometry(0.28, 0.42, 3, 5),
        new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }), spots.length);
      const crown = inst(new THREE.ConeGeometry(1, 1, 7),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: false }), spots.length);
      spots.forEach((s, i) => {
        const h = 7 + s.r * 9;
        put(trunk, i, s.x, s.y + 1.5, s.z, 1, 1, 1, s.a);
        c.copy(tint).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.1);
        if (s.y > 95) c.lerp(new THREE.Color(0xe9f2ff), 0.55);   // verschneite Wipfel
        put(crown, i, s.x, s.y + 2.4 + h / 2, s.z, 2 + s.r * 1.4, h, 2 + s.r * 1.4, s.a, c);
        this.addSolid(s.x, s.z, 1.4);
      });
      crown.instanceColor.needsUpdate = true;
    } else if (kind === "cactus") {
      const body = inst(new THREE.CylinderGeometry(0.55, 0.7, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), spots.length);
      const arm = inst(new THREE.CylinderGeometry(0.34, 0.4, 1, 7),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), spots.length * 2);
      const rock = inst(new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 1, flatShading: true }),
        Math.floor(spots.length * 0.5));
      let ai = 0, ri = 0;
      spots.forEach((s, i) => {
        if (s.r < 0.45) {   // Felsbrocken statt Kaktus
          if (ri < rock.count) {
            put(rock, ri++, s.x, s.y + 0.6 + s.r * 2, s.z, 2 + s.r * 5, 1.6 + s.r * 4, 2 + s.r * 5, s.a);
            this.addSolid(s.x, s.z, 2.6);
          }
          put(body, i, s.x, -900, s.z, 0.01, 0.01, 0.01, 0);
          return;
        }
        const h = 3.5 + s.r * 4;
        c.copy(tint).offsetHSL(0, 0, (rng() - 0.5) * 0.12);
        put(body, i, s.x, s.y + h / 2, s.z, 1, h, 1, s.a, c);
        for (let k = 0; k < 2; k++) {
          if (rng() < 0.45) continue;
          const side = k ? 1 : -1;
          put(arm, ai++, s.x + side * 0.9, s.y + h * 0.62, s.z, 1, h * 0.45, 1, s.a, c);
        }
        this.addSolid(s.x, s.z, 1.1);
      });
      arm.count = ai;
      rock.count = ri;
      body.instanceColor.needsUpdate = true;
      arm.instanceColor.needsUpdate = true;
    } else {
      // palm / tropical: Palmen mit Wedeln, Büsche und Felsen
      const trunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 1, 6);
      const trunk = inst(trunkGeo,
        new THREE.MeshStandardMaterial({ color: 0x7a6244, roughness: 1 }), spots.length);

      // Wedel: Kegel, dessen Basis im Ursprung sitzt und der nach +Y zeigt
      const frondGeo = new THREE.ConeGeometry(0.42, 3.4, 4);
      frondGeo.translate(0, 1.7, 0);
      const FRONDS = 6;
      const frond = inst(frondGeo,
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }),
        spots.length * FRONDS);

      const bush = inst(new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), spots.length);
      const rock = inst(new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ color: 0x8b8479, roughness: 1, flatShading: true }),
        Math.floor(spots.length * 0.3));

      let fi = 0, ri = 0, bi = 0;
      spots.forEach((s, i) => {
        if (s.r < 0.16 && ri < rock.count) {
          put(rock, ri++, s.x, s.y + 0.5 + s.r * 3, s.z, 2 + s.r * 6, 1.5 + s.r * 5, 2 + s.r * 6, s.a);
          this.addSolid(s.x, s.z, 2.4);
          put(trunk, i, s.x, -900, s.z, 0.01, 0.01, 0.01, 0);
          return;
        }
        c.copy(tint).offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.14);

        if (s.r > 0.42) {
          // Palme: leicht geneigter Stamm + Krone aus Wedeln
          const h = 6.5 + s.r * 7;
          const lean = (rng() - 0.5) * 0.16;
          trunk.setMatrixAt(i, m.compose(
            v.set(s.x + Math.sin(lean) * h * 0.5, s.y + h / 2, s.z),
            q.setFromEuler(euler.set(lean, s.a, lean * 0.6, "YXZ")),
            sc.set(1, h, 1)));
          const topX = s.x + Math.sin(lean) * h;
          const topZ = s.z + Math.sin(lean * 0.6) * h * 0.4;
          for (let k = 0; k < FRONDS; k++) {
            const ang = s.a + (k / FRONDS) * Math.PI * 2;
            putRot(frond, fi++, topX, s.y + h, topZ, 0.85 + s.r * 0.5,
              1.05 + rng() * 0.35, ang, 0, c);
          }
          this.addSolid(s.x, s.z, 1.1);
        } else {
          // Busch
          const h = 1.2 + s.r * 2.4;
          put(trunk, i, s.x, s.y + h * 0.3, s.z, 0.5, h * 0.6, 0.5, s.a);
          put(bush, bi++, s.x, s.y + h * 0.75, s.z,
            1.6 + s.r * 2.6, 1.2 + s.r * 1.8, 1.6 + s.r * 2.6, s.a, c);
          this.addSolid(s.x, s.z, 1.3);
        }
      });
      frond.count = fi;
      rock.count = ri;
      bush.count = bi;
      frond.instanceColor.needsUpdate = true;
      bush.instanceColor.needsUpdate = true;
    }

    for (const child of this.group.children) child.instanceMatrix.needsUpdate = true;
  }

  addSolid(x, z, r) {
    const id = this.solids.length;
    this.solids.push({ x, z, r });
    const k = (Math.floor(x / this.cell) + 512) * 4096 + (Math.floor(z / this.cell) + 512);
    let l = this.grid.get(k);
    if (!l) this.grid.set(k, (l = []));
    l.push(id);
  }

  /** Nächstes überlappendes Hindernis für einen Kreis (Auto). */
  hit(x, z, radius) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const l = this.grid.get((cx + a + 512) * 4096 + (cz + b + 512));
        if (!l) continue;
        for (const id of l) {
          const s = this.solids[id];
          const dx = x - s.x, dz = z - s.z;
          const rr = s.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.001;
            return { nx: dx / d, nz: dz / d, push: rr - d, solid: s };
          }
        }
      }
    }
    return null;
  }
}
