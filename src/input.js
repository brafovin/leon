import { clamp } from "./util.js";
import { isTouch } from "./device.js";

/** Tastatur + Gamepad. `state` wird pro Frame gelesen, `on*`-Callbacks feuern einmalig. */
export class Input {
  constructor() {
    this.keys = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.actions = {};       // name -> callback
    this.enabled = true;
    // Touch-Zustand, wird mit Tastatur/Gamepad zusammengeführt
    this.touch = { steer: 0, steering: false, throttle: 0, brake: 0, handbrake: false, boost: false };

    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(k)) e.preventDefault();
      const map = {
        Escape: "escape", Enter: "enter", KeyR: "reset",
        KeyC: "camera", KeyM: "mute", KeyP: "escape",
      };
      if (map[k]) this.fire(map[k]);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }

  on(name, fn) { this.actions[name] = fn; }

  /** Aktion auslösen – von Tasten und von den Touch-Knöpfen genutzt. */
  fire(name) { if (this.actions[name]) this.actions[name](); }

  /**
   * Touch-Bedienung aktivieren: links eine analoge Lenkfläche
   * (irgendwo antippen und ziehen), rechts Pedale und Aktionsknöpfe.
   */
  initTouch({ zone, stick, knob, gas, brake, drift, boost, race, cam, reset, pause }) {
    if (!isTouch) return false;
    document.body.classList.add("touch");

    // --- Lenkung ---
    const MAX_PX = 72;          // Weg bis zum vollen Einschlag
    let pid = null, startX = 0;
    const reset0 = () => {
      pid = null;
      this.touch.steer = 0;
      this.touch.steering = false;
      stick.classList.remove("on");
      knob.style.transform = "translateX(0px)";
    };
    zone.addEventListener("pointerdown", (e) => {
      if (pid !== null) return;
      pid = e.pointerId;
      startX = e.clientX;
      const r = zone.getBoundingClientRect();
      stick.style.left = `${e.clientX - r.left}px`;
      stick.style.top = `${e.clientY - r.top}px`;
      stick.classList.add("on");
      this.touch.steering = true;
      zone.setPointerCapture(pid);
      e.preventDefault();
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;
      const dx = clamp(e.clientX - startX, -MAX_PX, MAX_PX);
      // nach rechts ziehen = nach rechts lenken (positiver Lenkwert = links)
      this.touch.steer = -dx / MAX_PX;
      knob.style.transform = `translateX(${dx * 0.52}px)`;
      e.preventDefault();
    });
    for (const ev of ["pointerup", "pointercancel"]) {
      zone.addEventListener(ev, (e) => { if (e.pointerId === pid) reset0(); });
    }

    // --- Halte-Knöpfe ---
    const hold = (el, down, up) => {
      if (!el) return;
      const press = (e) => {
        el.classList.add("active");
        el.setPointerCapture(e.pointerId);
        down();
        e.preventDefault();
      };
      const release = () => { el.classList.remove("active"); up(); };
      el.addEventListener("pointerdown", press);
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
        el.addEventListener(ev, release);
      }
    };
    hold(gas, () => (this.touch.throttle = 1), () => (this.touch.throttle = 0));
    hold(brake, () => (this.touch.brake = 1), () => (this.touch.brake = 0));
    hold(drift, () => (this.touch.handbrake = true), () => (this.touch.handbrake = false));
    hold(boost, () => (this.touch.boost = true), () => (this.touch.boost = false));

    // --- Aktionen ---
    const tap = (el, action) => {
      if (!el) return;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.fire(action);
      });
    };
    tap(race, "enter");
    tap(cam, "camera");
    tap(reset, "reset");
    tap(pause, "escape");

    // Beim Verlassen des Tabs alles loslassen
    addEventListener("blur", () => {
      this.touch.throttle = this.touch.brake = 0;
      this.touch.handbrake = this.touch.boost = false;
      reset0();
    });
    return true;
  }

  sample() {
    const k = this.keys;
    const s = this.state;
    if (!this.enabled) {
      s.throttle = s.brake = s.steer = 0;
      s.handbrake = s.boost = false;
      return s;
    }
    const up = k.has("KeyW") || k.has("ArrowUp");
    const down = k.has("KeyS") || k.has("ArrowDown");
    const left = k.has("KeyA") || k.has("ArrowLeft");
    const right = k.has("KeyD") || k.has("ArrowRight");

    s.throttle = up ? 1 : 0;
    s.brake = down ? 1 : 0;
    s.steer = (left ? 1 : 0) - (right ? 1 : 0);
    s.handbrake = k.has("Space");
    s.boost = k.has("ShiftLeft") || k.has("ShiftRight");

    // Gamepad überschreibt die Tastatur, sobald es benutzt wird
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[0];
    if (pad) {
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
      const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      const ax = pad.axes[0] || 0;
      if (rt > 0.05 || lt > 0.05 || Math.abs(ax) > 0.12) {
        s.throttle = Math.max(s.throttle, rt);
        s.brake = Math.max(s.brake, lt);
        s.steer = clamp(-ax, -1, 1);
      }
      if (pad.buttons[0] && pad.buttons[0].pressed) s.handbrake = true;
      if (pad.buttons[1] && pad.buttons[1].pressed) s.boost = true;
    }

    // Touch-Eingaben ergänzen die anderen Quellen
    const t = this.touch;
    if (t.throttle) s.throttle = Math.max(s.throttle, t.throttle);
    if (t.brake) s.brake = Math.max(s.brake, t.brake);
    if (t.steering) s.steer = t.steer;
    if (t.handbrake) s.handbrake = true;
    if (t.boost) s.boost = true;

    return s;
  }
}
