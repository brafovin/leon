// Definition der fünf Horizon-Welten: Höhenfunktion, Licht, Farben, Props, Wetter.

const S = 1900;                       // Kantenlänge einer Welt in Metern
const falloff = (x, z, inner, outer) => {
  const d = Math.hypot(x, z);
  if (d < inner) return 1;
  if (d > outer) return 0;
  const t = (d - inner) / (outer - inner);
  return 1 - t * t * (3 - 2 * t);
};

export const WORLDS = [
  {
    id: "bay",
    name: "Horizon Bay",
    tagline: "Mediterrane Küstenstraßen, Klippen und türkisblaues Wasser.",
    card: "linear-gradient(160deg,#2ec5ff,#0f7bd6 45%,#f5c26b)",
    seed: 1337,
    size: S,
    weather: { type: "none", label: "Sonnig · 28°C" },
    sky: {
      top: 0x2f7fe0, bottom: 0xbfe6ff, sun: 0xfff2d0,
      elev: 0.62, azim: 0.9, sunI: 2.6, hemi: 0.75,
      fog: 0xbcd9ee, fogNear: 320, fogFar: 1750, stars: false,
      cloud: 0.42, cloudColor: 0xffffff,
    },
    water: { level: -6, color: 0x1b7fa8, opacity: 0.86 },
    terrain: {
      amp: 78, freq: 0.0016,
      colLow: 0xd9c99a, colMid: 0x5f8f45, colHigh: 0x8c9a86, colRock: 0x7a7264,
      sandBand: 8, rockSlope: 0.55,
      height(n, x, z) {
        const base = n.fbm(x * 0.0016, z * 0.0016, 5) * 0.62 + n.ridged(x * 0.0009, z * 0.0009, 3) * 0.42;
        const coast = falloff(x, z, 620, 1050);
        return (base * 0.6 + 0.42) * 78 * (0.25 + coast * 0.9) - 16;
      },
    },
    props: { kind: "palm", count: 700, tint: 0x4f7a34 },
    track: { seed: 21, radius: 560, wobble: 0.34, width: 13 },
  },

  {
    id: "alps",
    name: "Alpen Gipfel",
    tagline: "Serpentinen im Schnee, Nadelwälder und eisiger Gegenwind.",
    card: "linear-gradient(160deg,#dff0ff,#9dbcd8 40%,#4d6785)",
    seed: 8842,
    size: S,
    weather: { type: "snow", label: "Schneefall · -6°C" },
    sky: {
      top: 0x3f6c9e, bottom: 0xdfeaf5, sun: 0xffe9d2,
      elev: 0.36, azim: -1.5, sunI: 1.9, hemi: 0.85,
      fog: 0xcdddea, fogNear: 180, fogFar: 1250, stars: false,
      cloud: 0.72, cloudColor: 0xe8eef6,
    },
    water: null,
    terrain: {
      amp: 190, freq: 0.0013,
      colLow: 0x4c5a48, colMid: 0x86917f, colHigh: 0xf4f8ff, colRock: 0x6d6a68,
      sandBand: -999, rockSlope: 0.62, snowLine: 62,
      height(n, x, z) {
        const r = n.ridged(x * 0.0013, z * 0.0013, 5);
        const f = n.fbm(x * 0.0026, z * 0.0026, 4);
        return (r * 0.78 + f * 0.28 + 0.25) * 190;
      },
    },
    props: { kind: "pine", count: 1100, tint: 0x24402c },
    track: { seed: 77, radius: 540, wobble: 0.42, width: 12 },
  },

  {
    id: "neon",
    name: "Neon City",
    tagline: "Nasser Asphalt, Wolkenkratzer und Nachtrennen unter Neonlicht.",
    card: "linear-gradient(160deg,#12043a,#5b12b0 45%,#ff2e78)",
    seed: 5150,
    size: S,
    weather: { type: "rain", label: "Regen · Nacht" },
    sky: {
      top: 0x05030f, bottom: 0x2a1150, sun: 0x9b7bff,
      elev: 0.12, azim: 2.4, sunI: 0.7, hemi: 0.5, night: true,
      fog: 0x14082c, fogNear: 90, fogFar: 900, stars: true,
      cloud: 0.5, cloudColor: 0x4a3a7a,
    },
    water: null,
    terrain: {
      amp: 26, freq: 0.0018,
      colLow: 0x24242f, colMid: 0x2d2d3b, colHigh: 0x3a3a4c, colRock: 0x21212c,
      sandBand: -999, rockSlope: 0.8,
      height(n, x, z) {
        return n.fbm(x * 0.0018, z * 0.0018, 3) * 26;
      },
    },
    props: { kind: "city", count: 460, tint: 0x1d1d2b },
    track: { seed: 404, radius: 570, wobble: 0.5, width: 14 },
  },

  {
    id: "dunes",
    name: "Sahara Dünen",
    tagline: "Endlose Dünen, Canyons und Sonnenuntergang im Sandsturm.",
    card: "linear-gradient(160deg,#ffd28a,#e08b3c 45%,#8c3d1f)",
    seed: 9001,
    size: S,
    weather: { type: "sand", label: "Sandsturm · 41°C" },
    sky: {
      top: 0xb85a2a, bottom: 0xffce8a, sun: 0xffb469,
      elev: 0.13, azim: 2.0, sunI: 2.3, hemi: 0.7,
      fog: 0xe8a765, fogNear: 150, fogFar: 1200, stars: false,
      cloud: 0.3, cloudColor: 0xffd9a8,
    },
    water: null,
    terrain: {
      amp: 62, freq: 0.0022,
      colLow: 0xe8c98f, colMid: 0xd9a95f, colHigh: 0xf0dcae, colRock: 0x9c6b3f,
      sandBand: -999, rockSlope: 0.7,
      height(n, x, z) {
        const dunes = Math.sin(x * 0.011 + n.fbm(x * 0.0012, z * 0.0012, 3) * 5.5) * 0.5 + 0.5;
        const big = n.fbm(x * 0.0022, z * 0.0022, 4);
        return dunes * 22 + big * 62 + n.ridged(x * 0.0007, z * 0.0007, 3) * 26;
      },
    },
    props: { kind: "cactus", count: 520, tint: 0x5c7a3a },
    track: { seed: 512, radius: 590, wobble: 0.3, width: 15 },
  },

  {
    id: "island",
    name: "Tropen Insel",
    tagline: "Vulkanhänge, Lagunen und Sonnenaufgang über dem Riff.",
    card: "linear-gradient(160deg,#ffd6a0,#37c9a9 45%,#0f6f8c)",
    seed: 424242,
    size: S,
    weather: { type: "none", label: "Sonnenaufgang · 24°C" },
    sky: {
      top: 0x2a5fa8, bottom: 0xffd2a6, sun: 0xffd9a0,
      elev: 0.2, azim: -0.6, sunI: 2.2, hemi: 0.7,
      fog: 0xd9dfe0, fogNear: 260, fogFar: 1600, stars: false,
      cloud: 0.55, cloudColor: 0xffe0c2,
    },
    water: { level: -4, color: 0x16a3ad, opacity: 0.8 },
    terrain: {
      amp: 120, freq: 0.0018,
      colLow: 0xefdcae, colMid: 0x3f7a3a, colHigh: 0x5d5147, colRock: 0x554b43,
      sandBand: 7, rockSlope: 0.58,
      height(n, x, z) {
        const island = falloff(x, z, 480, 900);
        const volcano = Math.max(0, 1 - Math.hypot(x + 180, z - 220) / 420);
        const base = n.fbm(x * 0.0018, z * 0.0018, 5) * 0.5 + 0.5;
        return (base * 62 + volcano * volcano * 150) * island - 14 + island * 12;
      },
    },
    props: { kind: "tropical", count: 820, tint: 0x2f7a45 },
    track: { seed: 88, radius: 470, wobble: 0.3, width: 13 },
  },
];

export const worldById = (id) => WORLDS.find((w) => w.id === id) || WORLDS[0];
