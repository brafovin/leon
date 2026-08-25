import { Game } from "./game.js";
import { WORLDS, worldById } from "./worlds.js";
import { CARS, carById } from "./cars.js";
import { formatTime } from "./util.js";

// ------------------------------------------------------------- Spielstand
const KEY = "fh6-save-v1";
const defaultSave = () => ({ credits: 15000, owned: ["m5"], car: "m5", world: "bay", best: {} });
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s || !Array.isArray(s.owned)) return defaultSave();
    return { ...defaultSave(), ...s };
  } catch { return defaultSave(); }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* Privatmodus */ }
}
const save = loadSave();

// ------------------------------------------------------------------- Setup
const canvas = document.getElementById("scene");
const game = new Game(canvas);
window.__game = game;                    // Debug-Zugriff in der Browser-Konsole

const el = (id) => document.getElementById(id);
const ui = {
  loading: el("loading"), loadbar: el("loadbar"), loadtext: el("loadtext"),
  menu: el("menu"), worlds: el("worlds"), carPicker: el("carPicker"),
  credits: el("creditsView"), play: el("playBtn"), hud: el("hud"),
  pause: el("pause"), resume: el("resumeBtn"), toMenu: el("menuBtn"),
  result: el("result"), resPos: el("resPos"), resTitle: el("resTitle"),
  resTime: el("resTime"), resBest: el("resBest"), resCr: el("resCr"),
  again: el("againBtn"), roam: el("roamBtn"),
};

let selectedWorld = save.world;
let selectedCar = save.car;

// ------------------------------------------------------------------- Menü
function renderWorlds() {
  ui.worlds.innerHTML = "";
  WORLDS.forEach((w, i) => {
    const d = document.createElement("div");
    d.className = "wcard" + (w.id === selectedWorld ? " sel" : "");
    d.style.background = w.card;
    const best = save.best[w.id];
    d.innerHTML = `
      <div class="num">WELT ${String(i + 1).padStart(2, "0")}</div>
      <h3>${w.name}</h3>
      <p>${w.tagline}</p>
      <div class="best">${best ? "BESTE RUNDE " + formatTime(best) : "NOCH KEINE BESTZEIT"}</div>`;
    d.onclick = () => { selectedWorld = w.id; renderWorlds(); };
    ui.worlds.appendChild(d);
  });
}

function renderCars() {
  ui.carPicker.innerHTML = "";
  for (const c of CARS) {
    const owned = save.owned.includes(c.id);
    const d = document.createElement("div");
    d.className = "ccard" + (c.id === selectedCar ? " sel" : "") + (owned ? "" : " locked");
    d.innerHTML = `
      <b>${c.name}</b>
      <span>${c.ps} PS · ${c.topKmh} km/h · ${c.drive.toUpperCase()}</span>
      <i>${owned ? "IM BESITZ" : c.price.toLocaleString("de-DE") + " CR"}</i>`;
    d.onclick = () => {
      if (owned) { selectedCar = c.id; }
      else if (save.credits >= c.price) {
        save.credits -= c.price;
        save.owned.push(c.id);
        selectedCar = c.id;
        persist();
      } else {
        ui.credits.parentElement.animate(
          [{ color: "#ff2e78" }, { color: "#fff" }], { duration: 700 });
        return renderCars();
      }
      renderMenu();
    };
    ui.carPicker.appendChild(d);
  }
}

function renderMenu() {
  ui.credits.textContent = save.credits.toLocaleString("de-DE");
  game.hud.setCredits(save.credits);
  renderWorlds();
  renderCars();
}

// -------------------------------------------------------- Welt laden/starten
let loading = false;
async function enterWorld(worldId, carId) {
  if (loading) return;
  loading = true;
  ui.menu.classList.add("hidden");
  ui.result.classList.add("hidden");
  ui.loading.classList.remove("hidden");
  ui.loadbar.style.width = "0%";

  save.world = worldId;
  save.car = carId;
  persist();

  await game.loadWorld(worldById(worldId), carById(carId), (pct, label) => {
    ui.loadbar.style.width = pct + "%";
    ui.loadtext.textContent = label;
  });

  game.snapCamera();
  game.state = "drive";
  game.clock.getDelta();                  // Zeitsprung nach dem Laden verwerfen
  ui.loading.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  game.hud.setCredits(save.credits);
  game.hud.hint("<b>ENTER</b> Rennen starten · <b>W A S D</b> fahren · <b>SHIFT</b> Boost · <b>ESC</b> Menü");
  game.audio.start();
  loading = false;
}

window.__backToMenu = () => backToMenu();
function backToMenu() {
  game.abortRace();
  game.state = "menu";
  ui.hud.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.result.classList.add("hidden");
  ui.menu.classList.remove("hidden");
  renderMenu();
}

// ------------------------------------------------------------- Renn-Ergebnis
game.onRaceEnd = (res) => {
  const reward = [12000, 7000, 4000, 2500][res.pos - 1] || 2000;
  save.credits += reward;
  if (isFinite(res.best) && (!save.best[res.world] || res.best < save.best[res.world])) {
    save.best[res.world] = res.best;
  }
  persist();
  game.hud.setCredits(save.credits);

  ui.resPos.textContent = "P" + res.pos;
  ui.resTitle.textContent = res.pos === 1 ? "Sieg beim Horizon-Festival!" : "Rennen beendet";
  ui.resTime.textContent = formatTime(res.time);
  ui.resBest.textContent = formatTime(res.best);
  ui.resCr.textContent = "+" + reward.toLocaleString("de-DE") + " CR";
  ui.result.classList.remove("hidden");
  game.state = "paused";
};

// Skill-Punkte aus Drifts und Sprüngen werden direkt zu Credits
game.onSkill = (pts) => {
  save.credits += pts;
  persist();
  game.hud.setCredits(save.credits);
};

// --------------------------------------------------------------- Steuerung
game.input.on("escape", () => {
  if (game.state === "drive") {
    game.state = "paused";
    game.input.enabled = false;
    ui.pause.classList.remove("hidden");
  } else if (game.state === "paused" && !ui.result.classList.contains("hidden")) {
    // Ergebnisfenster: Escape führt zurück ins Menü
    backToMenu();
  } else if (game.state === "paused") {
    resume();
  }
});
game.input.on("enter", () => {
  if (game.state === "drive" && !game.race) {
    game.startRace();
    game.hud.toast("RENNEN STARTET", "#ff2e78", 1200);
  }
});

function resume() {
  ui.pause.classList.add("hidden");
  game.state = "drive";
  game.input.enabled = !(game.race && game.race.countdown > 0);
  game.clock.getDelta();
}

ui.play.onclick = () => enterWorld(selectedWorld, selectedCar);
ui.resume.onclick = resume;
ui.toMenu.onclick = backToMenu;
ui.again.onclick = () => {
  ui.result.classList.add("hidden");
  game.state = "drive";
  game.clock.getDelta();
  game.startRace();
};
ui.roam.onclick = () => {
  ui.result.classList.add("hidden");
  game.state = "drive";
  game.clock.getDelta();
  game.hud.hint("<b>ENTER</b> neues Rennen · <b>ESC</b> Menü");
};
addEventListener("pointerdown", () => game.audio.start(), { once: true });

// ------------------------------------------------------------ Hauptschleife
function frame() {
  requestAnimationFrame(frame);
  if (game.state === "loading") return;
  if (game.car) game.update();
}
renderMenu();
ui.loading.classList.add("hidden");
ui.menu.classList.remove("hidden");
frame();
