import * as THREE from "three";

/**
 * Fahrzeugliste. Der BMW M5 ist von Anfang an freigeschaltet,
 * alles andere wird mit Credits aus Rennen gekauft.
 */
export const CARS = [
  {
    id: "m5", name: "BMW M5 Competition", brand: "BMW", price: 0, style: "sedan",
    color: 0x1c3f8c, accent: 0x0d1b30, ps: 625, drive: "awd",
    topKmh: 305, accel: 8.6, grip: 1.0, mass: 1900, brake: 15.5, steer: 0.62, drift: 0.78,
    L: 5.0, W: 1.95, H: 1.47, wheelR: 0.37, track: 1.66, wheelbase: 2.98,
    kidney: true, quadPipes: true, spoiler: "lip",
  },
  {
    id: "m3", name: "BMW M3 Touring", brand: "BMW", price: 48000, style: "sedan",
    color: 0x1f4d3a, accent: 0x101c17, ps: 510, drive: "awd",
    topKmh: 290, accel: 8.2, grip: 0.98, mass: 1800, brake: 15.0, steer: 0.64, drift: 0.8,
    L: 4.79, W: 1.9, H: 1.44, wheelR: 0.36, track: 1.62, wheelbase: 2.86,
    kidney: true, quadPipes: true, spoiler: "lip",
  },
  {
    id: "stang", name: "Ford Mustang GT", brand: "Ford", price: 62000, style: "muscle",
    color: 0xcf2f1c, accent: 0x1a1a1c, ps: 460, drive: "rwd",
    topKmh: 250, accel: 7.2, grip: 0.88, mass: 1750, brake: 13.5, steer: 0.6, drift: 1.35,
    L: 4.79, W: 1.92, H: 1.38, wheelR: 0.37, track: 1.64, wheelbase: 2.72,
    stripes: true, quadPipes: false, spoiler: "duck",
  },
  {
    id: "supra", name: "Toyota GR Supra", brand: "Toyota", price: 78000, style: "coupe",
    color: 0xf05a1e, accent: 0x141414, ps: 387, drive: "rwd",
    topKmh: 250, accel: 7.4, grip: 0.94, mass: 1520, brake: 14.5, steer: 0.68, drift: 1.2,
    L: 4.38, W: 1.87, H: 1.29, wheelR: 0.35, track: 1.6, wheelbase: 2.47,
    spoiler: "duck",
  },
  {
    id: "gt3", name: "Porsche 911 GT3", brand: "Porsche", price: 135000, style: "coupe",
    color: 0xe9e9ef, accent: 0x15151a, ps: 510, drive: "rwd",
    topKmh: 318, accel: 8.8, grip: 1.12, mass: 1435, brake: 17.5, steer: 0.7, drift: 1.0,
    L: 4.57, W: 1.85, H: 1.28, wheelR: 0.36, track: 1.6, wheelbase: 2.46,
    spoiler: "wing",
  },
  {
    id: "huracan", name: "Lamborghini Huracán", brand: "Lamborghini", price: 210000, style: "super",
    color: 0xbdea1d, accent: 0x101010, ps: 640, drive: "awd",
    topKmh: 325, accel: 9.6, grip: 1.16, mass: 1420, brake: 18.0, steer: 0.66, drift: 0.85,
    L: 4.52, W: 1.93, H: 1.17, wheelR: 0.35, track: 1.67, wheelbase: 2.62,
    spoiler: "wing",
  },
  {
    id: "chiron", name: "Bugatti Chiron", brand: "Bugatti", price: 420000, style: "super",
    color: 0x1a63b8, accent: 0x0a0a0c, ps: 1500, drive: "awd",
    topKmh: 420, accel: 11.5, grip: 1.2, mass: 1995, brake: 19.0, steer: 0.55, drift: 0.7,
    L: 4.54, W: 2.04, H: 1.21, wheelR: 0.38, track: 1.74, wheelbase: 2.71,
    spoiler: "wing",
  },
];

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

/** Seitensilhouetten (normiert: x = -0.5…0.5 der Länge, y = 0…1 der Höhe). */
const PROFILES = {
  sedan: [
    [-0.5, 0.18], [-0.5, 0.62], [-0.42, 0.68], [-0.26, 0.94], [-0.05, 1.0],
    [0.12, 0.99], [0.2, 0.76], [0.36, 0.66], [0.47, 0.58], [0.5, 0.4],
    [0.48, 0.2], [0.4, 0.14], [-0.4, 0.14],
  ],
  coupe: [
    [-0.5, 0.2], [-0.49, 0.66], [-0.36, 0.82], [-0.12, 0.99], [0.06, 0.98],
    [0.18, 0.72], [0.34, 0.62], [0.47, 0.55], [0.5, 0.38], [0.47, 0.18],
    [0.38, 0.12], [-0.4, 0.13],
  ],
  super: [
    [-0.5, 0.24], [-0.48, 0.6], [-0.34, 0.72], [-0.14, 0.98], [0.04, 0.97],
    [0.16, 0.6], [0.34, 0.5], [0.48, 0.44], [0.5, 0.3], [0.45, 0.14],
    [0.36, 0.1], [-0.42, 0.12],
  ],
  muscle: [
    [-0.5, 0.2], [-0.5, 0.66], [-0.38, 0.76], [-0.16, 0.97], [0.06, 0.98],
    [0.16, 0.78], [0.34, 0.72], [0.47, 0.66], [0.5, 0.42], [0.48, 0.2],
    [0.4, 0.14], [-0.4, 0.14],
  ],
};

function bodyGeometry(spec) {
  const prof = PROFILES[spec.style] || PROFILES.sedan;
  const shape = new THREE.Shape();
  prof.forEach(([x, y], i) => {
    const px = x * spec.L, py = y * spec.H;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: spec.W, bevelEnabled: true, bevelThickness: 0.09,
    bevelSize: 0.12, bevelSegments: 3, curveSegments: 2,
  });
  geo.translate(0, 0, -spec.W / 2);

  // Karosserie zur Front/Heck und zum Dach hin verjüngen
  const pos = geo.attributes.position;
  const halfL = spec.L / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const tx = Math.min(1, Math.abs(x) / halfL);
    let f = 1 - Math.pow(tx, 3) * 0.12;                  // Nase/Heck schmaler
    if (y > spec.H * 0.6) f *= 1 - ((y - spec.H * 0.6) / (spec.H * 0.4)) * 0.14; // Dach schmaler
    pos.setZ(i, z * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Vertex-Farben: Lack, Glas, Schweller
  const paint = new THREE.Color(spec.color);
  const glass = new THREE.Color(0x0b1016);
  const accent = new THREE.Color(spec.accent);
  const col = new Float32Array(pos.count * 3);
  const beltline = spec.H * 0.64;      // Unterkante der Scheiben
  const roofY = spec.H * 0.9;           // darüber ist wieder Dach (Lack)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let c = paint;
    const inCabin = x > -spec.L * 0.32 && x < spec.L * 0.24;
    if (y > beltline && y < roofY && inCabin) c = glass;              // Seitenscheiben
    if (y > beltline && y < roofY && x > spec.L * 0.1 && x < spec.L * 0.26) c = glass; // Frontscheibe
    if (y >= roofY) c = paint;                                       // Dach
    if (y < spec.H * 0.2) c = accent;
    if (spec.stripes && Math.abs(z) < spec.W * 0.16) c = accent;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

function makeWheel(spec) {
  const g = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(spec.wheelR, spec.wheelR, spec.wheelR * 0.72, 20);
  tireGeo.rotateX(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95 }));
  tire.castShadow = true;
  g.add(tire);

  const rimGeo = new THREE.CylinderGeometry(spec.wheelR * 0.66, spec.wheelR * 0.66, spec.wheelR * 0.76, 16);
  rimGeo.rotateX(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({
    color: 0x9aa0aa, roughness: 0.32, metalness: 0.9,
  }));
  g.add(rim);

  // Speichen
  const spokeGeo = new THREE.BoxGeometry(spec.wheelR * 1.2, 0.06, spec.wheelR * 0.8);
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x6f757f, roughness: 0.3, metalness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(spokeGeo, spokeMat);
    s.rotation.z = (i / 5) * Math.PI;
    g.add(s);
  }
  // Bremssattel
  const cal = new THREE.Mesh(
    new THREE.BoxGeometry(spec.wheelR * 0.28, spec.wheelR * 0.8, spec.wheelR * 0.2),
    new THREE.MeshStandardMaterial({ color: 0xd62b2b, roughness: 0.4, metalness: 0.3 })
  );
  cal.position.set(-spec.wheelR * 0.55, 0, 0);
  g.add(cal);
  return g;
}

/**
 * Baut ein komplettes Auto. Modell-Vorwärtsachse ist +X; die äußere Gruppe
 * dreht das Modell so, dass +Z (Weltvorwärts bei yaw = 0) stimmt.
 */
export function buildCar(spec) {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.y = -Math.PI / 2;
  root.add(model);

  const tilt = new THREE.Group();      // Nick-/Wankbewegung nur für die Karosserie
  model.add(tilt);

  const body = new THREE.Mesh(bodyGeometry(spec), new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.34, metalness: 0.3,
    clearcoat: 0.85, clearcoatRoughness: 0.14, envMapIntensity: 0.95,
  }));
  body.castShadow = true;
  body.position.y = spec.wheelR * 0.52;
  tilt.add(body);

  // Fensterband ("Glashaus"): leicht breiter als die Dachpartie, damit es sichtbar wird
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x090e14, roughness: 0.12, metalness: 0.1,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3,
  });
  const cabinFront = spec.L * 0.24, cabinRear = -spec.L * 0.32;
  const beltY = spec.H * 0.63, roofY = spec.H * 0.86;
  const green = new THREE.Mesh(
    new THREE.BoxGeometry(cabinFront - cabinRear, roofY - beltY, spec.W * 0.845),
    glassMat
  );
  green.position.set((cabinFront + cabinRear) / 2, (beltY + roofY) / 2 + spec.wheelR * 0.52, 0);
  green.castShadow = true;
  tilt.add(green);

  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.6, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb9c0c9, roughness: 0.25, metalness: 1 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + spec.wheelR * 0.52, z);
    m.castShadow = true;
    tilt.add(m);
    return m;
  };

  const noseX = spec.L * 0.5;
  const tailX = -spec.L * 0.5;

  // Scheinwerfer + Rücklichter
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 2.2, roughness: 0.2,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x4a0d10, emissive: 0xff1c1c, emissiveIntensity: 1.4, roughness: 0.3,
  });
  const lampGeo = new THREE.BoxGeometry(0.12, 0.16, 0.46);
  const heads = [], tails = [];
  for (const s of [-1, 1]) {
    heads.push(add(lampGeo, headMat, noseX - 0.06, spec.H * 0.42, s * spec.W * 0.32));
    tails.push(add(new THREE.BoxGeometry(0.1, 0.14, 0.58), tailMat, tailX + 0.05, spec.H * 0.46, s * spec.W * 0.3));
  }

  // BMW-Niere bzw. Kühlergrill
  if (spec.kidney) {
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.1, 0.42, 0.3), dark, noseX - 0.03, spec.H * 0.34, s * 0.19);
      add(new THREE.BoxGeometry(0.04, 0.46, 0.34), chrome, noseX - 0.06, spec.H * 0.34, s * 0.19);
    }
  } else {
    add(new THREE.BoxGeometry(0.08, 0.26, spec.W * 0.5), dark, noseX - 0.04, spec.H * 0.3, 0);
  }
  // Lufteinlässe vorne
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, 0.16, 0.34), dark, noseX - 0.08, spec.H * 0.16, s * spec.W * 0.3);
  }

  // Außenspiegel
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.22, 0.09, 0.13), dark, spec.L * 0.1, spec.H * 0.66, s * (spec.W * 0.52));
  }

  // Heckflügel
  if (spec.spoiler === "wing") {
    add(new THREE.BoxGeometry(0.42, 0.06, spec.W * 0.86), dark, tailX + 0.34, spec.H * 0.92, 0);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.1, 0.26, 0.06), dark, tailX + 0.34, spec.H * 0.79, s * spec.W * 0.32);
    }
  } else if (spec.spoiler === "duck") {
    add(new THREE.BoxGeometry(0.3, 0.07, spec.W * 0.8), dark, tailX + 0.22, spec.H * 0.7, 0);
  } else {
    add(new THREE.BoxGeometry(0.24, 0.05, spec.W * 0.78), dark, tailX + 0.16, spec.H * 0.64, 0);
  }

  // Auspuff
  const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.2, 10);
  pipeGeo.rotateZ(Math.PI / 2);
  const pipes = spec.quadPipes ? [-0.42, -0.28, 0.28, 0.42] : [-0.34, 0.34];
  for (const z of pipes) add(pipeGeo, chrome, tailX - 0.06, spec.H * 0.12, z * spec.W);

  // Räder
  const wheels = [];
  const wb = spec.wheelbase / 2, tr = spec.track / 2;
  for (const [fx, fz, front] of [[wb, tr, true], [wb, -tr, true], [-wb, tr, false], [-wb, -tr, false]]) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(fx, spec.wheelR, fz);
    const spin = makeWheel(spec);
    steerPivot.add(spin);
    model.add(steerPivot);
    wheels.push({ pivot: steerPivot, spin, front });
  }

  root.userData = { spec, wheels, tilt, body, heads, tails, headMat: headMat.clone(), tailMat };
  root.userData.tailMat = tailMat;
  return root;
}
