import { clamp, lerp, formatTime } from "./util.js";

/** Zeichnet Tacho und Minimap auf 2D-Canvas und steuert die DOM-Anzeigen. */
export class Hud {
  constructor() {
    this.dial = document.getElementById("dial");
    this.dctx = this.dial.getContext("2d");
    this.map = document.getElementById("minimap");
    this.mctx = this.map.getContext("2d");
    this.el = {
      world: document.getElementById("hudWorld"),
      weather: document.getElementById("hudWeather"),
      raceBox: document.getElementById("raceBox"),
      lap: document.getElementById("hudLap"),
      time: document.getElementById("hudTime"),
      pos: document.getElementById("hudPos"),
      credits: document.getElementById("hudCredits"),
      boost: document.getElementById("boostbar"),
      toast: document.getElementById("toast"),
      hint: document.getElementById("hint"),
    };
    this.toastTimer = 0;
    this.shownKmh = 0;
  }

  setWorld(world) {
    this.el.world.textContent = world.name;
    this.el.weather.textContent = world.weather.label;
  }

  setCredits(cr) { this.el.credits.textContent = cr.toLocaleString("de-DE"); }

  toast(text, color = "#fff", ms = 1600) {
    const t = this.el.toast;
    t.textContent = text;
    t.style.color = color;
    t.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  }

  hint(text) {
    this.el.hint.innerHTML = text;
    this.el.hint.style.opacity = text ? "1" : "0";
  }

  race(on, lap, laps, time, pos, total) {
    this.el.raceBox.classList.toggle("hidden", !on);
    if (!on) return;
    this.el.lap.textContent = `${clamp(lap, 1, laps)}/${laps}`;
    this.el.time.textContent = formatTime(time);
    this.el.pos.textContent = `${pos}/${total}`;
  }

  drawDial(car, dt) {
    const c = this.dctx;
    const W = this.dial.width, H = this.dial.height;
    c.clearRect(0, 0, W, H);

    const cx = W - 108, cy = H - 26, R = 92;
    const a0 = Math.PI * 0.82, a1 = Math.PI * 2.22;
    const rpmN = clamp((car.rpm - 800) / 6600, 0, 1);

    // Hintergrundbogen
    c.lineWidth = 13;
    c.lineCap = "round";
    c.strokeStyle = "rgba(255,255,255,.13)";
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();

    // Füllung mit Verlauf
    const grad = c.createLinearGradient(cx - R, 0, cx + R, 0);
    grad.addColorStop(0, "#20e3ff");
    grad.addColorStop(0.55, "#7b2ff7");
    grad.addColorStop(1, "#ff2e78");
    c.strokeStyle = grad;
    c.beginPath(); c.arc(cx, cy, R, a0, a0 + (a1 - a0) * rpmN); c.stroke();

    // Roter Bereich
    c.lineWidth = 4;
    c.strokeStyle = "rgba(255,46,120,.85)";
    c.beginPath(); c.arc(cx, cy, R + 11, a0 + (a1 - a0) * 0.86, a1); c.stroke();

    // Skalenstriche
    c.strokeStyle = "rgba(255,255,255,.35)";
    c.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (a1 - a0) * (i / 8);
      const s = i % 2 === 0 ? 15 : 8;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
      c.lineTo(cx + Math.cos(a) * (R - 12 - s), cy + Math.sin(a) * (R - 12 - s));
      c.stroke();
    }

    // Tempo, weich nachlaufend
    this.shownKmh = lerp(this.shownKmh, car.kmh, clamp(dt * 12, 0, 1));
    c.textAlign = "right";
    c.fillStyle = "#fff";
    c.font = "700 52px Segoe UI, system-ui, sans-serif";
    c.fillText(String(Math.round(this.shownKmh)), cx + 44, cy - 4);
    c.font = "600 14px Segoe UI, system-ui, sans-serif";
    c.fillStyle = "rgba(255,255,255,.6)";
    c.fillText("km/h", cx + 44, cy + 16);

    // Gang
    const gearTxt = car.vLong < -0.6 ? "R" : car.kmh < 1 ? "N" : String(car.gear);
    c.textAlign = "center";
    c.fillStyle = car.boosting ? "#20e3ff" : "#fff";
    c.font = "800 40px Segoe UI, system-ui, sans-serif";
    c.fillText(gearTxt, cx - 62, cy - 8);
    c.font = "600 10px Segoe UI, system-ui, sans-serif";
    c.fillStyle = "rgba(255,255,255,.5)";
    c.fillText("GANG", cx - 62, cy + 10);

    this.el.boost.style.width = `${car.boost * 100}%`;
  }

  drawMap(track, car, rivals, activeCheck) {
    const c = this.mctx;
    const W = this.map.width, H = this.map.height;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const range = 420;                        // sichtbarer Radius in Metern
    const k = (W / 2 - 12) / range;
    const sy = Math.sin(car.yaw), cyaw = Math.cos(car.yaw);
    const tf = (x, z) => {
      const dx = x - car.pos.x, dz = z - car.pos.z;
      // in Auto-Koordinaten drehen: Fahrtrichtung zeigt auf der Karte nach oben
      const along = dx * sy + dz * cyaw;
      const side = dx * cyaw - dz * sy;
      return [cx + side * k, cy - along * k];
    };

    c.save();
    c.beginPath(); c.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); c.clip();

    // Strecke
    c.lineWidth = 5;
    c.strokeStyle = "rgba(255,255,255,.75)";
    c.beginPath();
    let started = false;
    for (let i = 0; i <= track.n; i += 3) {
      const p = track.pts[i % track.n];
      const [px, py] = tf(p.x, p.z);
      if (Math.abs(px - cx) > W || Math.abs(py - cy) > H) { started = false; continue; }
      if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
    }
    c.stroke();

    // Nächster Checkpoint
    if (activeCheck != null) {
      const p = track.pts[track.checkIdx[activeCheck]];
      const [px, py] = tf(p.x, p.z);
      c.fillStyle = "#20e3ff";
      c.beginPath(); c.arc(px, py, 5, 0, Math.PI * 2); c.fill();
    }

    // Gegner
    c.fillStyle = "#ff2e78";
    for (const r of rivals) {
      const [px, py] = tf(r.pos.x, r.pos.z);
      c.beginPath(); c.arc(px, py, 4, 0, Math.PI * 2); c.fill();
    }
    c.restore();

    // Spieler (immer mittig, nach oben gerichtet)
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(cx, cy - 9); c.lineTo(cx + 6, cy + 7); c.lineTo(cx, cy + 4); c.lineTo(cx - 6, cy + 7);
    c.closePath(); c.fill();
  }
}
