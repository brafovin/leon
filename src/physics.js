import * as THREE from "three";
import { clamp, lerp, damp, wrapAngle } from "./util.js";

const GEARS = [0.12, 0.24, 0.38, 0.54, 0.75, 1.0]; // Anteil der Höchstgeschwindigkeit pro Gang
const RPM_IDLE = 900, RPM_MAX = 7400;
// Rollwiderstand: konstanter Anteil + geschwindigkeitsabhängiger Anteil (m/s²)
const ROLL_CONST_ROAD = 0.25, ROLL_LIN_ROAD = 0.012;
const ROLL_CONST_OFF = 3.0, ROLL_LIN_OFF = 0.06;

/** Arcade-Fahrphysik: griffig, driftfreudig, aber nachvollziehbar. */
export class CarPhysics {
  constructor(spec, terrain, track, props) {
    this.spec = spec;
    this.terrain = terrain;
    this.track = track;
    this.props = props;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();      // Weltgeschwindigkeit (XZ)
    this.yaw = 0;
    this.yawRate = 0;
    this.vy = 0;
    this.steer = 0;
    this.gear = 1;
    this.rpm = RPM_IDLE;
    this.speed = 0;
    this.vLong = 0;
    this.vLat = 0;
    this.slip = 0;
    this.airborne = false;
    this.onRoad = true;
    this.boost = 1;
    this.boosting = false;
    this.wheelAngle = 0;
    this.crash = 0;

    this.topSpeed = spec.topKmh / 3.6;
    // Luftwiderstand so wählen, dass die angegebene Höchstgeschwindigkeit
    // im höchsten Gang tatsächlich erreicht wird (inkl. Rollwiderstand).
    const peak = spec.accel * 0.98;
    this.dragK = Math.max(
      0.0002,
      (peak - ROLL_CONST_ROAD - ROLL_LIN_ROAD * this.topSpeed) / (this.topSpeed * this.topSpeed)
    );
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._norm = new THREE.Vector3();
  }

  placeOnTrack(indexOffset = 0, lateral = 0) {
    const s = this.track.sample(indexOffset, lateral);
    this.pos.set(s.x, s.y + 0.4, s.z);
    this.yaw = s.yaw;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.vLong = this.vLat = this.speed = 0;
    this.yawRate = 0;
    this.gear = 1;
    this.rpm = RPM_IDLE;
  }

  respawn() {
    const n = this.track.nearest(this.pos.x, this.pos.z);
    this.placeOnTrack(n.i, 0);
  }

  update(dt, input) {
    const sub = 2;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this._step(h, input);
    this._updateDrivetrain(dt);
  }

  _step(dt, input) {
    const spec = this.spec;
    const fwd = this._fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this.vLong = this.vel.x * fwd.x + this.vel.z * fwd.z;
    this.vLat = this.vel.x * right.x + this.vel.z * right.z;
    this.speed = Math.hypot(this.vLong, this.vLat);

    // --- Untergrund ---
    const near = this.track.nearest(this.pos.x, this.pos.z);
    this.onRoad = near.dist < this.track.width + 1.5;
    const surfGrip = this.onRoad ? 1 : 0.68;
    const rollConst = this.onRoad ? ROLL_CONST_ROAD : ROLL_CONST_OFF;
    const rollLin = this.onRoad ? ROLL_LIN_ROAD : ROLL_LIN_OFF;
    const grip = spec.grip * surfGrip;

    // --- Lenkung (bei hohem Tempo begrenzt) ---
    const maxSteer = spec.steer * (1 - clamp(this.speed / (this.topSpeed * 0.85), 0, 0.7));
    const target = input.steer * maxSteer;
    this.steer = damp(this.steer, target, this.airborne ? 4 : 11, dt);
    this.wheelAngle = this.steer;

    // --- Boost ---
    this.boosting = input.boost && this.boost > 0.02 && this.vLong > 2;
    if (this.boosting) this.boost = clamp(this.boost - dt * 0.24, 0, 1);
    else this.boost = clamp(this.boost + dt * (Math.abs(this.slip) > 0.25 ? 0.16 : 0.075), 0, 1);

    // --- Antrieb ---
    const gearIdx = this.gear - 1;
    const gearTop = this.topSpeed * GEARS[clamp(gearIdx, 0, GEARS.length - 1)];
    const gearBottom = gearIdx > 0 ? this.topSpeed * GEARS[gearIdx - 1] : 0;
    const rev = clamp((this.vLong - gearBottom) / (gearTop - gearBottom || 1), 0, 1.1);
    // Drehmomentkurve: unten kräftig, oben abfallend
    const torque = 0.55 + 0.75 * Math.sin(Math.min(rev, 1) * Math.PI * 0.85);
    // Kurze Gänge unten für Antritt, langer Gang oben für Vmax
    const gearMul = lerp(1.25, 1.0, gearIdx / (GEARS.length - 1));

    let force = 0;
    if (input.throttle > 0 && !this.airborne) {
      force += input.throttle * spec.accel * torque * gearMul * (this.boosting ? 1.45 : 1);
      if (this.vLong > this.topSpeed * (this.boosting ? 1.08 : 1)) force = 0;
    }
    if (input.brake > 0) {
      if (this.vLong > 0.6) force -= input.brake * spec.brake;
      else if (!this.airborne) force -= input.brake * spec.accel * 0.42;   // Rückwärtsgang
    }
    if (this.vLong < -12) force = Math.max(force, 0);

    // Luft- und Rollwiderstand
    force -= this.dragK * this.vLong * Math.abs(this.vLong);
    force -= rollLin * this.vLong;
    if (Math.abs(this.vLong) > 0.4) force -= Math.sign(this.vLong) * rollConst;
    else if (input.throttle === 0 && input.brake === 0) this.vLong *= 0.94;
    if (input.handbrake) force -= clamp(this.vLong, -1, 1) * 6;

    // Hangabtrieb
    this.terrain.normalAt(this.pos.x, this.pos.z, this._norm);
    const slopeFwd = -(this._norm.x * fwd.x + this._norm.z * fwd.z) / Math.max(this._norm.y, 0.2);
    if (!this.airborne) force += slopeFwd * 9.81 * 0.85;

    this.vLong += force * dt;

    // --- Seitenführung / Drift ---
    let latRate = 9.5 * grip;
    if (input.handbrake) latRate *= 0.2;
    if (spec.drive === "rwd" && input.throttle > 0.8 && this.speed > 9) latRate *= 1 / spec.drift;
    if (this.airborne) latRate = 0.4;
    this.vLat -= this.vLat * clamp(latRate * dt, 0, 1);

    // --- Gierbewegung ---
    const wheelbase = spec.wheelbase;
    let targetYaw = (this.vLong / wheelbase) * Math.tan(this.steer) * clamp(grip + 0.25, 0, 1.35);
    if (input.handbrake && this.speed > 4) targetYaw *= 1.75;
    if (this.airborne) targetYaw = this.yawRate * 0.98 + input.steer * 0.5 * dt;
    this.yawRate = damp(this.yawRate, targetYaw, this.airborne ? 2 : 12, dt);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);

    // Gegenkraft aus der Querbewegung (Auto "schiebt" beim Drift)
    this.vLat += -this.yawRate * this.vLong * dt * 0.45;

    // --- Neue Weltgeschwindigkeit / Position ---
    this.vel.set(
      fwd.x * this.vLong + right.x * this.vLat, 0,
      fwd.z * this.vLong + right.z * this.vLat
    );
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // Weltgrenze
    const lim = this.terrain.size / 2 - 20;
    if (Math.abs(this.pos.x) > lim || Math.abs(this.pos.z) > lim) {
      this.pos.x = clamp(this.pos.x, -lim, lim);
      this.pos.z = clamp(this.pos.z, -lim, lim);
      this.vLong *= 0.4;
    }

    // --- Höhe / Sprünge ---
    const groundY = this.terrain.heightAt(this.pos.x, this.pos.z);
    this.vy -= 22 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= groundY) {
      if (this.airborne && this.vy < -8) this.crash = Math.min(1, this.crash + 0.3);
      this.pos.y = groundY;
      this.vy = 0;
      this.airborne = false;
    } else if (this.pos.y > groundY + 0.35) {
      this.airborne = true;
    }
    // Auf Bergkuppen abheben
    if (!this.airborne && this.speed > 14) {
      const ahead = this.terrain.heightAt(
        this.pos.x + this.vel.x * 0.12, this.pos.z + this.vel.z * 0.12);
      if (ahead < groundY - 0.9) this.vy = (ahead - groundY) * 1.6;
    }

    // --- Hindernisse ---
    const hit = this.props.hit(this.pos.x, this.pos.z, 1.25);
    if (hit) {
      this.pos.x += hit.nx * hit.push;
      this.pos.z += hit.nz * hit.push;
      const dot = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (dot < 0) {
        this.vLong *= hit.solid.r > 2 ? 0.35 : 0.72;
        this.vLat *= 0.4;
        this.crash = Math.min(1, this.crash + (hit.solid.r > 2 ? 0.6 : 0.25));
        this.vel.x -= hit.nx * dot * 1.2;
        this.vel.z -= hit.nz * dot * 1.2;
      }
    }

    this.slip = this.speed > 3 ? Math.atan2(this.vLat, Math.abs(this.vLong) + 1) : 0;
    this.crash = Math.max(0, this.crash - dt * 1.2);
  }

  _updateDrivetrain(dt) {
    const idx = this.gear - 1;
    const gearTop = this.topSpeed * GEARS[clamp(idx, 0, GEARS.length - 1)];
    const gearBottom = idx > 0 ? this.topSpeed * GEARS[idx - 1] : 0;
    const v = Math.abs(this.vLong);
    const rev = clamp((v - gearBottom) / (gearTop - gearBottom || 1), 0, 1.15);
    const targetRpm = lerp(RPM_IDLE + 500, RPM_MAX, rev) * (this.boosting ? 1.03 : 1);
    this.rpm = damp(this.rpm, Math.max(RPM_IDLE, targetRpm), 9, dt);

    if (rev > 0.98 && this.gear < GEARS.length) this.gear++;
    else if (rev < 0.06 && this.gear > 1) this.gear--;
  }

  get kmh() { return Math.abs(this.vLong) * 3.6; }
  get drifting() { return Math.abs(this.slip) > 0.22 && this.speed > 9; }
}

/** KI-Gegner: folgt der Ideallinie mit gedrosseltem Kurventempo. */
export class Rival {
  constructor(track, terrain, spec, skill, lateral, startIdx) {
    this.track = track;
    this.terrain = terrain;
    this.spec = spec;
    this.skill = skill;              // 0.85 … 1.05
    this.lateral = lateral;
    this.f = startIdx;               // Fließkomma-Index auf der Mittellinie
    this.speed = 0;
    this.lap = 0;
    this.prevF = startIdx;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.wheelSpin = 0;
    this.targetLat = lateral;
    this.t = Math.random() * 10;
  }

  update(dt) {
    const n = this.track.n;
    const i = Math.floor(this.f) % n;
    const curve = this.track.curvature(i, 18);
    const top = (this.spec.topKmh / 3.6) * 0.78 * this.skill;
    const targetSpeed = clamp(top * (1 - Math.min(curve * 3.4, 0.72)), 12, top);
    const accel = this.speed < targetSpeed ? this.spec.accel * 0.85 : -this.spec.brake * 0.55;
    this.speed = clamp(this.speed + accel * dt, 0, top);

    // leichte Linienvariation, damit die Gegner lebendig wirken
    this.t += dt;
    this.targetLat = this.lateral + Math.sin(this.t * 0.35) * 2.2;

    const segLen = this.track.length / n;
    this.prevF = this.f;
    this.f += (this.speed * dt) / segLen;
    if (this.f >= n) { this.f -= n; this.lap++; }

    const s = this.track.sample(this.f, this.targetLat);
    this.pos.set(s.x, Math.max(s.y, this.terrain.heightAt(s.x, s.z)) + 0.05, s.z);
    this.yaw = s.yaw;
    this.wheelSpin -= (this.speed * dt) / this.spec.wheelR;
  }

  /** Gesamtfortschritt in Streckenlängen (für die Platzierung). */
  progress() { return this.lap + this.f / this.track.n; }
}
