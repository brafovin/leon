// Geräteerkennung und daraus abgeleitete Qualitätsstufen.
// Handys bekommen weniger Geometrie, kleinere Schatten und weniger Partikel.

const mq = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);

/** Echtes Touch-Gerät (grober Zeiger, kein Hover) – nicht nur ein Touch-Laptop. */
export const isTouch =
  (mq("(pointer: coarse)") && mq("(hover: none)")) ||
  (navigator.maxTouchPoints > 1 && !mq("(hover: hover)"));

const shortSide = Math.min(screen.width, screen.height);
const cores = navigator.hardwareConcurrency || 4;
const mem = navigator.deviceMemory || 4;

export const isPhone = isTouch && shortSide <= 900;
export const isWeak = isPhone || cores <= 4 || mem <= 3;

export const QUALITY = {
  /** Auflösung des Höhenfelds (Quadrate pro Kante). */
  terrainSeg: isWeak ? 256 : 384,
  /** Faktor für die Anzahl der Bäume / Häuser. */
  propScale: isPhone ? 0.45 : isWeak ? 0.7 : 1,
  /** Faktor für Wetterpartikel. */
  weatherScale: isPhone ? 0.4 : isWeak ? 0.7 : 1,
  /** Staubpartikel des Autos. */
  dust: isPhone ? 140 : 320,
  /** Schattenauflösung und -ausdehnung. */
  shadowSize: isPhone ? 1024 : 2048,
  shadowRange: isPhone ? 90 : 150,
  /** Obergrenze für devicePixelRatio. */
  pixelRatio: isPhone ? 1.5 : 2,
  /** Unterteilung der Wasserfläche. */
  waterSeg: isPhone ? 36 : 60,
};

/** Vollbild + Querformat anfordern (nur Handy, nur nach Nutzergeste). */
export async function enterImmersive() {
  if (!isTouch) return;
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
  } catch { /* vom Browser abgelehnt – nicht schlimm */ }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape");
  } catch { /* iOS unterstützt das nicht */ }
}
