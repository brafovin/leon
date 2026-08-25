import { clamp, lerp } from "./util.js";

/** Synthetischer Motor-, Reifen- und Windsound (WebAudio, keine Assets). */
export class Engine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);

    // --- Motor: drei Sägezähne + Tiefpass ---
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 900;
    this.filter.Q.value = 4;
    this.engineGain.connect(this.filter);
    this.filter.connect(this.master);

    this.oscs = [];
    for (const [type, mul, gain] of [["sawtooth", 1, 0.5], ["square", 0.5, 0.25], ["sawtooth", 2.01, 0.12]]) {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.engineGain);
      o.start();
      this.oscs.push({ o, mul });
    }

    // --- Rauschquelle für Reifen / Wind ---
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = "bandpass";
    this.tireFilter.frequency.value = 1800;
    this.tireFilter.Q.value = 1.2;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    noise.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.master);

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "lowpass";
    this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);

    noise.start();
    this.ready = true;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, ctx.currentTime, 0.4);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.15);
    return this.muted;
  }

  update(car, dt) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const rpmN = clamp((car.rpm - 800) / 6600, 0, 1);
    const base = lerp(34, 190, rpmN) * (1 + car.gear * 0.02);
    for (const { o, mul } of this.oscs) {
      o.frequency.setTargetAtTime(base * mul, t, 0.03);
    }
    const load = clamp(0.22 + rpmN * 0.55 + (car.boosting ? 0.2 : 0), 0, 0.9);
    this.engineGain.gain.setTargetAtTime(load * 0.5, t, 0.06);
    this.filter.frequency.setTargetAtTime(lerp(600, 4200, rpmN), t, 0.06);

    const screech = car.drifting ? clamp(Math.abs(car.slip) * 1.5, 0, 1) : 0;
    const gravel = car.onRoad ? 0 : clamp(car.speed / 40, 0, 0.6);
    this.tireGain.gain.setTargetAtTime((screech * 0.16 + gravel * 0.1) * (car.airborne ? 0 : 1), t, 0.05);
    this.tireFilter.frequency.setTargetAtTime(gravel > 0 ? 700 : 1500 + screech * 900, t, 0.08);

    this.windGain.gain.setTargetAtTime(clamp(car.speed / 90, 0, 1) * 0.09, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(300 + car.speed * 12, t, 0.15);
  }
}
