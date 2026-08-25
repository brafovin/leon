import * as THREE from "three";
import { makeRng, lerp } from "./util.js";

const clampT = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Geschlossene Rennstrecke: Spline -> gleichmäßig abgetastete Mittellinie
 * (inkl. geglätteter Höhe), Asphalt-Mesh, Leitpfosten und Checkpoints.
 */
export class Track {
  constructor(world, heightFn) {
    const cfg = world.track;
    const rng = makeRng(cfg.seed);
    const CTRL = 14;

    // --- Kontrollpunkte auf einem verzerrten Kreis ---
    const ctrl = [];
    for (let i = 0; i < CTRL; i++) {
      const a = (i / CTRL) * Math.PI * 2;
      const r = cfg.radius * (1 + (rng() - 0.5) * 2 * cfg.wobble);
      ctrl.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(ctrl, true, "catmullrom", 0.5);

    // --- Gleichmäßig abtasten ---
    const N = 900;
    const pts = curve.getSpacedPoints(N);
    pts.pop(); // letzter Punkt == erster
    this.n = pts.length;
    this.width = cfg.width;

    // --- Höhe aus dem Basisterrain, danach mehrfach glätten (sanfte Steigungen) ---
    let ys = pts.map((p) => heightFn(p.x, p.z) + 0.35);
    for (let pass = 0; pass < 26; pass++) {
      const out = new Array(this.n);
      for (let i = 0; i < this.n; i++) {
        const a = ys[(i - 1 + this.n) % this.n], b = ys[i], c = ys[(i + 1) % this.n];
        out[i] = a * 0.25 + b * 0.5 + c * 0.25;
      }
      ys = out;
    }

    this.pts = pts.map((p, i) => new THREE.Vector3(p.x, ys[i], p.z));

    // --- Tangenten, Normalen (in XZ) und Bogenlänge ---
    this.tan = [];
    this.nor = [];
    this.arc = new Float32Array(this.n);
    let len = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.pts[i], b = this.pts[(i + 1) % this.n];
      const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      this.tan.push(t);
      this.nor.push(new THREE.Vector3(-t.z, 0, t.x));
      this.arc[i] = len;
      len += a.distanceTo(b);
    }
    this.length = len;

    // --- Räumliches Raster für schnelle Abstandsabfragen ---
    this.cell = 30;
    this.grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const k = this._key(this.pts[i].x, this.pts[i].z);
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(i);
    }

    // --- Checkpoints ---
    this.checkCount = 12;
    this.checkIdx = [];
    for (let c = 0; c < this.checkCount; c++) {
      this.checkIdx.push(Math.round((c / this.checkCount) * this.n) % this.n);
    }
  }

  _key(x, z) {
    return (Math.floor(x / this.cell) + 512) * 4096 + (Math.floor(z / this.cell) + 512);
  }

  /**
   * Nächster Punkt auf der Mittellinie: {dist, i, y}.
   * Die Höhe wird entlang des Segments interpoliert, damit das eingeebnete
   * Terrain exakt auf Straßenniveau liegt (sonst blitzt Gelände durch den Asphalt).
   */
  nearest(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bestD = Infinity;
    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const list = this.grid.get((cx + a + 512) * 4096 + (cz + b + 512));
        if (!list) continue;
        for (const i of list) {
          const p = this.pts[i];
          const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    if (best < 0) {
      // Fallback: grobe lineare Suche (weit abseits der Strecke)
      for (let i = 0; i < this.n; i += 6) {
        const p = this.pts[i];
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    // Auf die beiden angrenzenden Segmente projizieren und Höhe interpolieren
    const p = this.pts[best];
    let y = p.y, dist = Math.sqrt(bestD);
    for (const j of [(best - 1 + this.n) % this.n, (best + 1) % this.n]) {
      const q = this.pts[j];
      const ex = q.x - p.x, ez = q.z - p.z;
      const len2 = ex * ex + ez * ez;
      if (len2 < 1e-6) continue;
      const t = clampT(((x - p.x) * ex + (z - p.z) * ez) / len2);
      const px = p.x + ex * t, pz = p.z + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (d <= dist) { dist = d; y = p.y + (q.y - p.y) * t; }
    }
    return { dist, i: best, y };
  }

  /** Position auf der Strecke bei Index-Fließkommawert (für KI-Gegner). */
  sample(f, lateral = 0) {
    const i0 = ((Math.floor(f) % this.n) + this.n) % this.n;
    const i1 = (i0 + 1) % this.n;
    const t = f - Math.floor(f);
    const a = this.pts[i0], b = this.pts[i1];
    const nx = lerp(this.nor[i0].x, this.nor[i1].x, t);
    const nz = lerp(this.nor[i0].z, this.nor[i1].z, t);
    return {
      x: lerp(a.x, b.x, t) + nx * lateral,
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t) + nz * lateral,
      yaw: Math.atan2(lerp(this.tan[i0].x, this.tan[i1].x, t), lerp(this.tan[i0].z, this.tan[i1].z, t)),
    };
  }

  /** Krümmung um Index i (0 = gerade, groß = enge Kurve). */
  curvature(i, look = 14) {
    const a = this.tan[((i - look) % this.n + this.n) % this.n];
    const b = this.tan[(i + look) % this.n];
    return 1 - (a.x * b.x + a.z * b.z);
  }

  /** Asphalt, Randlinien, Mittelstreifen und Leitpfosten als Group. */
  buildMesh(world) {
    const g = new THREE.Group();
    const w = this.width;
    const dark = world.sky.night;

    const ribbon = (halfW, yOff, step, dashed, lateral = 0) => {
      const pos = [], idx = [];
      let v = 0;
      const steps = Math.floor(this.n / step);
      for (let s = 0; s <= steps; s++) {
        const i = (s * step) % this.n;
        if (dashed && s % 2 === 1) { v = -1; continue; }
        const p = this.pts[i], nr = this.nor[i];
        const cx = p.x + nr.x * lateral, cz = p.z + nr.z * lateral;
        const base = pos.length / 3;
        pos.push(cx - nr.x * halfW, p.y + yOff, cz - nr.z * halfW);
        pos.push(cx + nr.x * halfW, p.y + yOff, cz + nr.z * halfW);
        if (v >= 0 && base >= 2) {
          idx.push(base - 2, base - 1, base, base - 1, base + 1, base);
        }
        v = base;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    };

    // Asphalt
    const road = new THREE.Mesh(
      ribbon(w, 0.13, 1, false),
      new THREE.MeshStandardMaterial({
        color: dark ? 0x14141c : 0x2b2b31,
        roughness: dark ? 0.35 : 0.92,
        metalness: dark ? 0.35 : 0.0,
      })
    );
    road.receiveShadow = true;
    g.add(road);

    // Schotterrand
    const shoulder = new THREE.Mesh(
      ribbon(w + 2.8, 0.07, 1, false),
      new THREE.MeshStandardMaterial({ color: dark ? 0x22222c : 0x6b6255, roughness: 1 })
    );
    g.add(shoulder);
    g.children.reverse(); // Rand zuerst zeichnen

    // Mittelstreifen (gestrichelt)
    const dash = new THREE.Mesh(
      ribbon(0.28, 0.16, 5, true),
      new THREE.MeshStandardMaterial({
        color: dark ? 0x50e8ff : 0xf3e5a0,
        emissive: dark ? 0x1d6b7d : 0x000000,
        roughness: 0.7,
      })
    );
    g.add(dash);

    // Seitenlinien
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: dark ? 0x2a3a4a : 0x000000, roughness: 0.6,
    });
    for (const side of [-1, 1]) {
      g.add(new THREE.Mesh(ribbon(0.22, 0.16, 1, false, side * (w - 0.55)), lineMat));
    }

    // Leitpfosten
    const postGeo = new THREE.BoxGeometry(0.16, 1.05, 0.16);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xf2f2f2, emissive: dark ? 0x223344 : 0x000000, roughness: 0.6,
    });
    const every = 7;
    const count = Math.floor(this.n / every) * 2;
    const posts = new THREE.InstancedMesh(postGeo, postMat, count);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let s = 0; s < Math.floor(this.n / every); s++) {
      const i = (s * every) % this.n;
      const p = this.pts[i], nr = this.nor[i];
      for (const side of [-1, 1]) {
        m.makeTranslation(p.x + nr.x * side * (w + 1.9), p.y + 0.5, p.z + nr.z * side * (w + 1.9));
        posts.setMatrixAt(k++, m);
      }
    }
    posts.count = k;
    posts.instanceMatrix.needsUpdate = true;
    g.add(posts);

    // Straßenlaternen für Nachtwelten
    if (dark) {
      const every2 = 10;
      const n2 = Math.floor(this.n / every2) * 2;
      const poleGeo = new THREE.BoxGeometry(0.18, 7, 0.18);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2b34, roughness: 0.7, metalness: 0.6 });
      const armGeo = new THREE.BoxGeometry(0.16, 0.16, 1.8);
      const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe3bb });
      const glowGeo = new THREE.SphereGeometry(2.6, 10, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffc98a, transparent: true, opacity: 0.13,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      const poles = new THREE.InstancedMesh(poleGeo, poleMat, n2);
      const arms = new THREE.InstancedMesh(armGeo, poleMat, n2);
      const lamps = new THREE.InstancedMesh(lampGeo, lampMat, n2);
      const glows = new THREE.InstancedMesh(glowGeo, glowMat, n2);
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const vv = new THREE.Vector3();
      const ss = new THREE.Vector3(1, 1, 1);
      let j = 0;
      for (let s2 = 0; s2 < Math.floor(this.n / every2); s2++) {
        const i = (s2 * every2) % this.n;
        const p = this.pts[i], nr = this.nor[i];
        const rot = Math.atan2(nr.x, nr.z);
        for (const side of [-1, 1]) {
          const bx = p.x + nr.x * side * (w + 3.2), bz = p.z + nr.z * side * (w + 3.2);
          qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
          poles.setMatrixAt(j, mm.compose(vv.set(bx, p.y + 3.5, bz), qq, ss));
          arms.setMatrixAt(j, mm.compose(
            vv.set(bx - nr.x * side * 0.9, p.y + 6.9, bz - nr.z * side * 0.9), qq, ss));
          lamps.setMatrixAt(j, mm.compose(
            vv.set(bx - nr.x * side * 1.7, p.y + 6.75, bz - nr.z * side * 1.7), qq, ss));
          glows.setMatrixAt(j, mm.compose(
            vv.set(bx - nr.x * side * 1.7, p.y + 6.75, bz - nr.z * side * 1.7), qq, ss));
          j++;
        }
      }
      poles.count = arms.count = lamps.count = glows.count = j;
      for (const im of [poles, arms, lamps, glows]) { im.instanceMatrix.needsUpdate = true; g.add(im); }
    }

    return g;
  }
}
