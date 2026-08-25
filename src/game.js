import * as THREE from "three";
import { Noise, clamp, lerp, damp } from "./util.js";
import { Track } from "./track.js";
import { Terrain } from "./terrain.js";
import { Props } from "./props.js";
import { createSkyDome, createStars, Weather } from "./sky.js";
import { buildCar, carById, CARS } from "./cars.js";
import { CarPhysics, Rival } from "./physics.js";
import { Hud } from "./hud.js";
import { Input } from "./input.js";
import { Engine } from "./audio.js";
import { QUALITY, isPhone, isWeak } from "./device.js";
import { PostFX } from "./postfx.js";

const LAPS = 2;
const CAM_MODES = [
  { name: "chase", dist: 8.6, height: 3.3, look: 2.2 },
  { name: "far", dist: 13.5, height: 5.2, look: 3.0 },
  { name: "hood", dist: -0.2, height: 1.25, look: 12 },
  { name: "cinema", dist: 11, height: 3.4, look: 1.8 },
];

export class Game {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.post = new PostFX(this.renderer, { bloom: !isWeak });
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, 6000);
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();

    this.hud = new Hud();
    this.input = new Input();
    this.audio = new Engine();

    this.quality = 2;          // 2 = voll, 1 = reduziert, 0 = minimal
    this.frameAcc = 0;
    this.frameCount = 0;
    this.camMode = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.state = "menu";
    this.time = 0;
    this.rivals = [];
    this.rivalMeshes = [];
    this.race = null;
    this.onRaceEnd = null;
    this.onSkill = null;
    this.skill = { drift: 0, air: 0, chain: 0, cool: 0, airTime: 0 };

    addEventListener("resize", () => this.resize());
    this.resize();

    this.input.on("camera", () => {
      if (this.state !== "drive") return;
      this.camMode = (this.camMode + 1) % CAM_MODES.length;
      this.hud.toast(["VERFOLGER", "WEIT", "COCKPIT", "KINO"][this.camMode], "#20e3ff", 900);
    });
    this.input.on("reset", () => {
      if (this.state !== "drive" || !this.car) return;
      this.car.respawn();
      this.hud.toast("ZURÜCKGESETZT", "#20e3ff", 800);
    });
    this.input.on("mute", () => {
      const m = this.audio.toggleMute();
      this.hud.toast(m ? "SOUND AUS" : "SOUND AN", "#20e3ff", 800);
    });
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setSize(innerWidth, innerHeight, this.renderer.getPixelRatio());
  }

  // ------------------------------------------------------------------ Welt
  async loadWorld(world, carSpec, progress = () => {}) {
    this.state = "loading";
    this.disposeWorld();
    this.world = world;

    const step = async (pct, label) => {
      progress(pct, label);
      await new Promise((r) => setTimeout(r, 16));
    };

    await step(6, "Gelände wird geformt…");
    const noise = new Noise(world.seed);
    const heightFn = (x, z) => world.terrain.height(noise, x, z);

    await step(16, "Strecke wird gebaut…");
    this.track = new Track(world, heightFn);

    await step(30, "Höhenfeld wird berechnet…");
    this.terrain = new Terrain(world, noise, this.track);

    await step(52, "Landschaft wird texturiert…");
    const ground = this.terrain.buildMesh();
    this.scene.add(ground);
    this.water = this.terrain.buildWater();
    if (this.water) this.scene.add(this.water);

    await step(64, "Asphalt wird verlegt…");
    this.scene.add(this.track.buildMesh(world));
    this.buildGates();

    await step(76, "Vegetation wird gepflanzt…");
    this.props = new Props(world, this.terrain, this.track);
    this.scene.add(this.props.group);

    await step(88, "Licht & Wetter…");
    this.buildSky();
    this.buildDust();

    await step(94, "Fahrzeug wird geliefert…");
    this.setCar(carSpec);
    this.buildRivals();

    this.hud.setWorld(world);
    this.time = 0;
    await step(100, "Bereit");
  }

  buildSky() {
    const s = this.world.sky;
    const dir = new THREE.Vector3(
      Math.cos(s.azim) * Math.cos(s.elev * Math.PI / 2),
      Math.sin(s.elev * Math.PI / 2),
      Math.sin(s.azim) * Math.cos(s.elev * Math.PI / 2)
    ).normalize();
    this.sunDir = dir;

    this.scene.fog = new THREE.Fog(s.fog, s.fogNear, s.fogFar);
    this.scene.background = new THREE.Color(s.fog);

    this.sky = createSkyDome(this.world, dir);
    this.scene.add(this.sky);
    if (s.stars) { this.stars = createStars(this.world.seed); this.scene.add(this.stars); }

    const sun = new THREE.DirectionalLight(s.sun, s.sunI);
    sun.castShadow = true;
    sun.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
    const d = QUALITY.shadowRange;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.5;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // Bodenfarbe des Hemisphere-Lichts = Geländefarbe, sonst wirken
    // abgewandte Flächen unnatürlich hell (Himmelsfarbe von unten).
    this.scene.add(new THREE.HemisphereLight(s.top, this.world.terrain.colMid, s.hemi));
    if (s.night) this.scene.add(new THREE.AmbientLight(0x3b2a68, 0.7));

    this.buildEnvironment();

    this.weather = new Weather(this.world.weather.type);
    if (this.weather.obj) this.scene.add(this.weather.obj);
  }

  /** Erzeugt aus den Himmelsfarben eine Umgebungs-Map (Lackreflexionen). */
  buildEnvironment() {
    const s = this.world.sky;
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 128;
    const c = cv.getContext("2d");
    const grad = c.createLinearGradient(0, 0, 0, cv.height);
    const top = new THREE.Color(s.top), bot = new THREE.Color(s.bottom);
    const fog = new THREE.Color(s.fog);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(0.48, `#${bot.getHexString()}`);
    grad.addColorStop(0.52, `#${fog.getHexString()}`);
    grad.addColorStop(1, `#${fog.clone().multiplyScalar(0.45).getHexString()}`);
    c.fillStyle = grad;
    c.fillRect(0, 0, cv.width, cv.height);

    // Sonne als heller Fleck
    const az = ((Math.atan2(this.sunDir.z, this.sunDir.x) / (Math.PI * 2)) + 0.5) * cv.width;
    const el = (1 - (this.sunDir.y * 0.5 + 0.5)) * cv.height;
    const sun = c.createRadialGradient(az, el, 1, az, el, 34);
    const sc = new THREE.Color(s.sun);
    sun.addColorStop(0, `#${sc.getHexString()}`);
    sun.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = sun;
    c.fillRect(0, 0, cv.width, cv.height);

    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    if (this.envRT) this.envRT.dispose();
    this.envRT = pmrem.fromEquirectangular(tex);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();
    tex.dispose();
  }

  buildGates() {
    const g = new THREE.Group();
    this.gates = [];
    const w = this.track.width + 1.6;
    for (let c = 0; c < this.track.checkCount; c++) {
      const i = this.track.checkIdx[c];
      const p = this.track.pts[i], n = this.track.nor[i];
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0e1b26, emissive: 0x20e3ff, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.6,
      });
      const grp = new THREE.Group();
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 0.5), mat);
        pillar.position.set(p.x + n.x * side * w, p.y + 3.2, p.z + n.z * side * w);
        grp.add(pillar);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.5, 0.7, 0.4), mat);
      bar.position.set(p.x, p.y + 6.2, p.z);
      bar.rotation.y = Math.atan2(this.track.tan[i].x, this.track.tan[i].z);
      grp.add(bar);
      g.add(grp);
      this.gates.push({ grp, mat, x: p.x, y: p.y, z: p.z });
    }
    this.gateGroup = g;
    g.visible = false;
    this.scene.add(g);
  }

  buildDust() {
    const N = QUALITY.dust;
    const pos = new Float32Array(N * 3).fill(-9999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const tint = { dunes: 0xe6cd9a, alps: 0xffffff, neon: 0x9fc9ff, bay: 0xcbbf98, island: 0xd8c9a4 };
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: tint[this.world.id] || 0xcccccc, size: 1.7, transparent: true,
      opacity: 0.5, depthWrite: false, sizeAttenuation: true,
    }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.dust = {
      pts, geo, n: N, i: 0,
      vel: new Float32Array(N * 3),
      life: new Float32Array(N),
    };
  }

  spawnDust(x, y, z, vx, vz, strength) {
    const d = this.dust;
    const i = d.i = (d.i + 1) % d.n;
    const a = d.geo.attributes.position.array;
    a[i * 3] = x + (Math.random() - 0.5) * 1.2;
    a[i * 3 + 1] = y + 0.25;
    a[i * 3 + 2] = z + (Math.random() - 0.5) * 1.2;
    d.vel[i * 3] = -vx * 0.12 + (Math.random() - 0.5) * 2.4;
    d.vel[i * 3 + 1] = 1.4 + Math.random() * 2.2 * strength;
    d.vel[i * 3 + 2] = -vz * 0.12 + (Math.random() - 0.5) * 2.4;
    d.life[i] = 0.9 + Math.random() * 0.7;
  }

  updateDust(dt) {
    const d = this.dust;
    if (!d) return;
    const a = d.geo.attributes.position.array;
    for (let i = 0; i < d.n; i++) {
      if (d.life[i] <= 0) continue;
      d.life[i] -= dt;
      if (d.life[i] <= 0) { a[i * 3 + 1] = -9999; continue; }
      a[i * 3] += d.vel[i * 3] * dt;
      a[i * 3 + 1] += d.vel[i * 3 + 1] * dt;
      a[i * 3 + 2] += d.vel[i * 3 + 2] * dt;
      d.vel[i * 3 + 1] -= 1.6 * dt;
      d.vel[i * 3] *= 1 - dt * 1.5;
      d.vel[i * 3 + 2] *= 1 - dt * 1.5;
    }
    d.geo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------- Fahrzeuge
  setCar(spec) {
    if (this.carMesh) {
      this.scene.remove(this.carMesh);
      disposeTree(this.carMesh);
    }
    this.carSpec = spec;
    this.carMesh = buildCar(spec);
    this.scene.add(this.carMesh);

    this.car = new CarPhysics(spec, this.terrain, this.track, this.props);
    this.car.placeOnTrack(0, 0);

    if (this.world.sky.night) this.carMesh.userData.headMat.emissiveIntensity = 3.2;

    // Scheinwerferkegel in dunklen Welten
    if (this.world.sky.night && !this.headlight) {
      this.headlight = new THREE.SpotLight(0xfff0d0, 1400, 150, 0.34, 0.45, 1.3);
      this.headlight.target = new THREE.Object3D();
      this.wideLight = new THREE.SpotLight(0xdfe6ff, 380, 60, 0.85, 0.9, 1.2);
      this.wideLight.target = this.headlight.target;
      this.scene.add(this.headlight, this.headlight.target, this.wideLight);
    }
  }

  buildRivals() {
    for (const m of this.rivalMeshes) { this.scene.remove(m); disposeTree(m); }
    this.rivalMeshes = [];
    this.rivals = [];
    const palette = [0xe23b2c, 0xf5c518, 0x2ec4b6];
    const pool = CARS.filter((c) => c.id !== this.carSpec.id).slice(0, 5);
    for (let i = 0; i < 3; i++) {
      const base = pool[(i * 2) % pool.length];
      const spec = { ...base, color: palette[i], stripes: false };
      const mesh = buildCar(spec);
      mesh.visible = false;
      this.scene.add(mesh);
      this.rivalMeshes.push(mesh);
      this.rivals.push(new Rival(this.track, this.terrain, spec, 0.94 + i * 0.05, (i - 1) * 3.4, 0));
    }
  }

  // ---------------------------------------------------------------- Rennen
  startRace() {
    const grid = [-4, 4, -4, 4];
    this.car.placeOnTrack(this.track.n - 8, grid[0]);
    this.rivals.forEach((r, i) => {
      r.f = (this.track.n - 8 - (i + 1) * 5 + this.track.n) % this.track.n;
      r.lap = 0;
      r.speed = 0;
      r.lateral = grid[i + 1];
      this.rivalMeshes[i].visible = true;
      r.update(0.001);
    });
    this.gateGroup.visible = true;
    this.race = {
      lap: 1, next: 0, time: 0, bestLap: Infinity, lapStart: 0,
      countdown: 3.4, finished: false, playerProgress: 0,
    };
    this.input.enabled = false;
    this.hud.hint("");
  }

  endRace(pos) {
    const r = this.race;
    r.finished = true;
    this.input.enabled = true;
    this.gateGroup.visible = false;
    this.rivalMeshes.forEach((m) => (m.visible = false));
    const res = { pos, total: this.rivals.length + 1, time: r.time, best: r.bestLap, world: this.world.id };
    this.race = null;
    this.hud.race(false);
    if (this.onRaceEnd) this.onRaceEnd(res);
  }

  abortRace() {
    if (!this.race) return;
    this.race = null;
    this.input.enabled = true;
    this.gateGroup.visible = false;
    this.rivalMeshes.forEach((m) => (m.visible = false));
    this.hud.race(false);
  }

  updateRace(dt) {
    const r = this.race;
    if (!r) return;

    if (r.countdown > 0) {
      const before = Math.ceil(r.countdown);
      r.countdown -= dt;
      const now = Math.ceil(r.countdown);
      if (now !== before) {
        if (now > 0) this.hud.toast(String(now), "#fff", 700);
        else this.hud.toast("LOS!", "#20e3ff", 900);
      }
      if (r.countdown <= 0) this.input.enabled = true;
      return;
    }

    r.time += dt;
    for (const rv of this.rivals) rv.update(dt);

    // Checkpoint erreicht?
    const g = this.gates[r.next];
    const dx = this.car.pos.x - g.x, dz = this.car.pos.z - g.z;
    if (dx * dx + dz * dz < 26 * 26 && Math.abs(this.car.pos.y - g.y) < 14) {
      r.next++;
      if (r.next >= this.gates.length) {
        r.next = 0;
        const lapTime = r.time - r.lapStart;
        r.lapStart = r.time;
        if (lapTime < r.bestLap) r.bestLap = lapTime;
        r.lap++;
        if (r.lap > LAPS) { this.endRace(this.position()); return; }
        this.hud.toast(`RUNDE ${r.lap} / ${LAPS}`, "#20e3ff", 1400);
      } else {
        this.hud.toast("CHECKPOINT", "#ffffff", 550);
      }
    }

    // Gates leuchten: nur der nächste ist hell
    this.gates.forEach((gate, i) => {
      const active = i === r.next;
      gate.mat.emissiveIntensity = damp(
        gate.mat.emissiveIntensity, active ? 1.6 + Math.sin(this.time * 6) * 0.4 : 0.18, 6, dt);
      gate.mat.emissive.setHex(active ? 0x20e3ff : 0x2b3f52);
    });

    const near = this.track.nearest(this.car.pos.x, this.car.pos.z);
    r.playerProgress = (r.lap - 1) + near.i / this.track.n;
    this.hud.race(true, r.lap, LAPS, r.time, this.position(), this.rivals.length + 1);
  }

  position() {
    if (!this.race) return 1;
    let p = 1;
    for (const rv of this.rivals) if (rv.progress() > this.race.playerProgress) p++;
    return p;
  }

  // ----------------------------------------------------------------- Frame
  /** Fällt bei schwacher Hardware automatisch auf niedrigere Qualität zurück. */
  checkPerformance(dt) {
    this.frameAcc += dt;
    this.frameCount++;
    if (this.frameAcc < 2) return;
    const fps = this.frameCount / this.frameAcc;
    window.__fps = Math.round(fps);
    this.frameAcc = 0;
    this.frameCount = 0;
    if (fps < 32 && this.quality === 2) {
      this.quality = 1;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, isPhone ? 1 : 1.25));
      this.renderer.shadowMap.enabled = false;
      this.post.bloom = false;
      this.post.setSize(innerWidth, innerHeight, this.renderer.getPixelRatio());
      this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      this.hud.toast("GRAFIK REDUZIERT", "#20e3ff", 1200);
    } else if (fps < 22 && this.quality === 1) {
      this.quality = 0;
      this.renderer.setPixelRatio(isPhone ? 0.7 : 0.75);
      this.post.enabled = false;
      if (this.weather && this.weather.obj) this.weather.obj.visible = false;
    }
  }

  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.checkPerformance(dt);
    if (!this.car) return;

    const driving = this.state === "drive";
    const input = this.input.sample();
    if (driving) {
      this.car.update(dt, input);
      this.updateRace(dt);
    }

    this.syncCarMesh(this.carMesh, this.car, dt);
    this.rivals.forEach((r, i) => {
      const m = this.rivalMeshes[i];
      if (!m.visible) return;
      m.position.copy(r.pos);
      m.rotation.y = r.yaw;
      m.userData.wheels.forEach((w) => {
        w.spin.rotation.z = r.wheelSpin;
      });
    });

    if (driving) this.updateSkill(dt);

    // Staub / Rauch
    if (driving && !this.car.airborne && this.car.speed > 6) {
      const strength = (this.car.drifting ? 1 : 0) + (this.car.onRoad ? 0 : 0.8);
      if (strength > 0 && Math.random() < clamp(strength * this.car.speed * 0.035, 0, 0.9)) {
        const back = -1.4;
        this.spawnDust(
          this.car.pos.x + Math.sin(this.car.yaw) * back,
          this.car.pos.y,
          this.car.pos.z + Math.cos(this.car.yaw) * back,
          this.car.vel.x, this.car.vel.z, strength
        );
      }
    }
    this.updateDust(dt);

    this.updateCamera(dt, driving);
    if (this.weather) this.weather.update(dt, this.camera.position, this.time);
    if (this.sky) {
      this.sky.position.copy(this.camera.position);
      this.sky.userData.mat.uniforms.time.value = this.time;
    }
    if (this.stars) this.stars.position.copy(this.camera.position);
    if (this.water) {
      this.water.position.x = this.camera.position.x;
      this.water.position.z = this.camera.position.z;
      Terrain.animateWater(this.water, this.time);
    }

    // Sonne/Schatten folgen dem Auto
    if (this.sun) {
      this.sun.target.position.copy(this.car.pos);
      this.sun.position.copy(this.car.pos).addScaledVector(this.sunDir, 220);
    }
    if (this.headlight) {
      const f = new THREE.Vector3(Math.sin(this.car.yaw), 0, Math.cos(this.car.yaw));
      this.headlight.position.copy(this.car.pos).addScaledVector(f, 1.6).add(new THREE.Vector3(0, 0.85, 0));
      this.headlight.target.position.copy(this.car.pos).addScaledVector(f, 42).add(new THREE.Vector3(0, 0.2, 0));
      this.wideLight.position.copy(this.headlight.position);
    }

    this.audio.update(this.car, dt);
    this.hud.drawDial(this.car, dt);
    this.hud.drawMap(this.track, this.car, this.race ? this.rivals : [], this.race ? this.race.next : null);

    this.post.render(this.scene, this.camera);
  }

  /** Drift- und Sprungbonus im Stil der Skill-Ketten aus Horizon. */
  updateSkill(dt) {
    const car = this.car;
    const sk = this.skill;

    if (car.airborne) {
      sk.airTime += dt;
    } else if (sk.airTime > 0.45) {
      sk.chain += Math.round(sk.airTime * 260);
      this.hud.toast(`SPRUNG +${Math.round(sk.airTime * 260)}`, "#ffe14d", 900);
      sk.cool = 0;
      sk.airTime = 0;
    } else {
      sk.airTime = 0;
    }

    if (car.drifting && !car.airborne) {
      sk.chain += Math.abs(car.slip) * car.speed * dt * 7;
      sk.cool = 0;
    } else {
      sk.cool += dt;
      if (sk.chain > 60 && sk.cool > 0.7) {
        const pts = Math.round(sk.chain);
        this.hud.toast(`SKILL +${pts}`, "#20e3ff", 1100);
        if (this.onSkill) this.onSkill(pts);
        sk.chain = 0;
      } else if (sk.cool > 0.7) {
        sk.chain = 0;
      }
    }
  }

  syncCarMesh(mesh, car, dt) {
    mesh.position.copy(car.pos);
    mesh.rotation.y = car.yaw;

    // Karosserie an den Hang anlegen + Nicken/Wanken
    const n = this.terrain.normalAt(car.pos.x, car.pos.z);
    const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
    const right = new THREE.Vector3(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
    const pitchTerrain = Math.asin(clamp(-(n.x * fwd.x + n.z * fwd.z), -1, 1));
    const rollTerrain = Math.asin(clamp(-(n.x * right.x + n.z * right.z), -1, 1));

    const accel = (car.vLong - (mesh.userData.prevLong || 0)) / Math.max(dt, 1e-3);
    mesh.userData.prevLong = car.vLong;
    const squat = clamp(-accel * 0.0025, -0.06, 0.06);
    const lean = clamp(car.yawRate * car.speed * 0.0035 + car.vLat * 0.012, -0.16, 0.16);

    const tilt = mesh.userData.tilt;
    tilt.rotation.z = damp(tilt.rotation.z, pitchTerrain + squat, 8, dt);
    tilt.rotation.x = damp(tilt.rotation.x, -(rollTerrain + lean), 8, dt);
    mesh.rotation.x = 0;

    // Räder: Lenkeinschlag + Abrollen
    mesh.userData.wheelSpin = (mesh.userData.wheelSpin || 0) - (car.vLong * dt) / car.spec.wheelR;
    for (const w of mesh.userData.wheels) {
      if (w.front) w.pivot.rotation.y = car.wheelAngle;
      w.spin.rotation.z = mesh.userData.wheelSpin;
    }
    // Bremslichter
    mesh.userData.tailMat.emissiveIntensity = damp(
      mesh.userData.tailMat.emissiveIntensity,
      this.input.state.brake > 0 ? 6 : this.world.sky.night ? 2.6 : 1.8, 12, dt);
  }

  updateCamera(dt, driving) {
    const mode = CAM_MODES[this.camMode];
    const car = this.car;
    const speedN = clamp(car.speed / 75, 0, 1);

    let targetPos, targetLook;
    if (mode.name === "cinema" && !driving) {
      const a = this.time * 0.25;
      targetPos = new THREE.Vector3(
        car.pos.x + Math.cos(a) * mode.dist, car.pos.y + mode.height, car.pos.z + Math.sin(a) * mode.dist);
      targetLook = car.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    } else {
      // Kamera hinter der Bewegungsrichtung (bei Drift schaut man ins Kurveninnere)
      const moveYaw = car.speed > 6 ? Math.atan2(car.vel.x, car.vel.z) : car.yaw;
      const yaw = lerp(car.yaw, moveYaw, mode.name === "hood" ? 0 : 0.35);
      const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      targetPos = car.pos.clone()
        .addScaledVector(back, -mode.dist - speedN * 1.6)
        .add(new THREE.Vector3(0, mode.height + speedN * 0.5, 0));
      targetLook = car.pos.clone()
        .addScaledVector(back, mode.look)
        .add(new THREE.Vector3(0, mode.name === "hood" ? 1.1 : 1.4, 0));

      // Kamera nicht im Boden versinken lassen
      const gy = this.terrain.heightAt(targetPos.x, targetPos.z) + 1.2;
      if (targetPos.y < gy) targetPos.y = gy;
    }

    const rate = mode.name === "hood" ? 40 : 7 + speedN * 4;
    this.camPos.lerp(targetPos, 1 - Math.exp(-rate * dt));
    this.camLook.lerp(targetLook, 1 - Math.exp(-(rate + 4) * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    const fov = 62 + speedN * 12 + (car.boosting ? 6 : 0);
    this.camera.fov = damp(this.camera.fov, fov, 5, dt);
    this.camera.updateProjectionMatrix();
  }

  snapCamera() {
    const back = new THREE.Vector3(Math.sin(this.car.yaw), 0, Math.cos(this.car.yaw));
    this.camPos.copy(this.car.pos).addScaledVector(back, -9).add(new THREE.Vector3(0, 3.4, 0));
    this.camLook.copy(this.car.pos).add(new THREE.Vector3(0, 1.2, 0));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  disposeWorld() {
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      const c = this.scene.children[i];
      this.scene.remove(c);
      disposeTree(c);
    }
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    this.scene.environment = null;
    this.carMesh = null;
    this.rivalMeshes = [];
    this.rivals = [];
    this.headlight = null;
    this.wideLight = null;
    this.sun = null;
    this.water = null;
    this.stars = null;
    this.sky = null;
    this.dust = null;
  }
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
}
