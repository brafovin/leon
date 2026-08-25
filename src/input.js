import { clamp } from "./util.js";

/** Tastatur + Gamepad. `state` wird pro Frame gelesen, `on*`-Callbacks feuern einmalig. */
export class Input {
  constructor() {
    this.keys = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.actions = {};       // name -> callback
    this.enabled = true;

    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(k)) e.preventDefault();
      const map = {
        Escape: "escape", Enter: "enter", KeyR: "reset",
        KeyC: "camera", KeyM: "mute", KeyP: "escape",
      };
      if (map[k] && this.actions[map[k]]) this.actions[map[k]]();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }

  on(name, fn) { this.actions[name] = fn; }

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
    return s;
  }
}
