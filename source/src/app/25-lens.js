/* =========================================================================
   25 · lenses — three swappable optical assemblies
   ========================================================================= */
const LENS_CX = 0.95, LENS_CY = 0.05;
const LENS_IDS = ['lensBarrel', 'lensFront', 'lensAperture', 'lensSTM', 'lensVR', 'lensRear'];
let ACTIVE_LENS = 'dx1650';
const NONE_LENS = { id: 'none', name: '无镜头', short: 'NO LENS', focal: '—', len: 0 };

function activeLensProfile() {
  return LENSES.find((l) => l.id === ACTIVE_LENS) || LENSES[0];
}

function buildLensSet(profile) {
  ACTIVE_LENS = profile.id;
  buildLensBarrel(profile);
  buildLensFront(profile);
  buildLensAperture(profile);
  buildLensSTM(profile);
  buildLensVR(profile);
  buildLensRear(profile);
}

function disposeLensSet() {
  LENS_IDS.forEach((id) => {
    const p = parts.get(id);
    if (!p) return;
    PSCENE.remove(p.group);
    p.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    parts.delete(id);
  });
}

function rebuildLens(id) {
  disposeLensSet();
  buildLensSet(LENSES.find((l) => l.id === id) || LENSES[0]);
}

/* ---------------- shared materials ---------------- */
function lensMaterials() {
  return {
    body: M.plastic({
      color: 0x141519, roughness: 0.44, clearcoat: 0.28, clearcoatRoughness: 0.42,
      bumpMap: peelTex, bumpScale: 0.0025, roughnessMap: peelTex, envMapIntensity: 1.1,
    }),
    grip: M.plastic({
      color: 0x181a1e, roughness: 0.74, clearcoat: 0.05,
      bumpMap: grainTex, bumpScale: 0.006,
    }),
    matte: new THREE.MeshPhysicalMaterial({ color: 0x08090b, roughness: 0.95, metalness: 0.0 }),
    metal: M.metal({ color: 0x2a2d32, roughness: 0.32 }),
    chrome: M.chrome({ color: 0xb8bdc6, roughness: 0.16 }),
  };
}

const lensNameCache = new Map();
function lensNameTexture(p) {
  if (lensNameCache.has(p.id)) return lensNameCache.get(p.id);
  const t = makeTex(2048, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(232,236,242,.96)';
    g.font = '700 46px "Segoe UI", Arial, sans-serif';
    g.textBaseline = 'middle';
    const txt = p.marking || p.name;
    for (let i = 0; i < 4; i++) g.fillText(txt, 50 + i * (w / 4), h / 2);
    g.font = '600 30px "Segoe UI", Arial, sans-serif';
    g.fillStyle = 'rgba(206,212,222,.8)';
    g.textAlign = 'right';
    for (let i = 0; i < 4; i++) g.fillText('NIKKOR', w / 4 - 30 + i * (w / 4), h / 2);
  });
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  lensNameCache.set(p.id, t);
  return t;
}

/* ---------------- barrel ---------------- */
function buildLensBarrel(p) {
  const g = new THREE.Group();
  const z0 = 2.72;
  const zEnd = z0 + p.len;
  const r = p.r;
  const m = lensMaterials();

  const zl = clamp(p.len * 0.42, 1.25, 4.0);
  const zoomZ = z0 + 1.08 + zl / 2;
  const fz0 = zoomZ + zl / 2 + 0.06;
  const nr = p.frontR + 0.7;

  // bayonet mount collar
  g.add(mesh(zcyl(2.94, 2.94, 0.42, 128, true), m.metal, LENS_CX, LENS_CY, z0 + 0.21));
  g.add(mesh(new THREE.RingGeometry(2.62, 2.94, 128), m.chrome, LENS_CX, LENS_CY, z0 + 0.425));
  // control ring
  g.add(mesh(ribbedCylinder(3.02, 3.02, 0.48, 96, 0.009, 384), m.grip, LENS_CX, LENS_CY, z0 + 0.7));
  // shoulder
  g.add(mesh(zcyl(3.0, 3.0, 0.22, 128, true), m.body, LENS_CX, LENS_CY, z0 + 1.03));
  // zoom ring
  g.add(mesh(ribbedCylinder(r, r, zl, p.ribs, 0.03, 512), m.grip, LENS_CX, LENS_CY, zoomZ));
  g.add(mesh(zcyl(r - 0.02, r - 0.02, 0.07, 128), m.metal, LENS_CX, LENS_CY, zoomZ - zl / 2 - 0.035));
  g.add(mesh(zcyl(r - 0.02, r - 0.02, 0.07, 128), m.metal, LENS_CX, LENS_CY, zoomZ + zl / 2 + 0.035));
  // front barrel
  g.add(mesh(zcyl(nr, r - 0.02, Math.max(0.45, zEnd - fz0), 128, true), m.body,
    LENS_CX, LENS_CY, (fz0 + zEnd) / 2));
  // name ring
  const ring = new THREE.Mesh(
    zcyl(nr + 0.028, nr + 0.028, 0.52, 160, true),
    new THREE.MeshBasicMaterial({
      map: lensNameTexture(p), transparent: true, alphaTest: 0, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    })
  );
  ring.position.set(LENS_CX, LENS_CY, Math.min(fz0 + 0.34, zEnd - 0.38));
  g.add(ring);
  // white zoom index line at 12 o'clock
  g.add(mesh(roundedBox(0.05, 0.012, 0.62, 0.006),
    new THREE.MeshBasicMaterial({ color: 0xe9ecf1 }), LENS_CX, LENS_CY + nr - 0.01, fz0 + 0.55));
  // front rim
  g.add(mesh(new THREE.TorusGeometry(nr - 0.13, 0.085, 12, 128), m.matte, LENS_CX, LENS_CY, zEnd - 0.02));

  // red index dot
  g.add(mesh(new THREE.CircleGeometry(0.09, 24),
    new THREE.MeshBasicMaterial({ color: 0xc0342a }),
    LENS_CX + 2.55, LENS_CY + 1.5, z0 + 0.5));
  // white alignment dot
  g.add(mesh(new THREE.CircleGeometry(0.075, 24),
    new THREE.MeshBasicMaterial({ color: 0xe6e8ec }),
    LENS_CX, LENS_CY + 3.0, z0 + 0.2));

  // bayonet tabs
  const tab = m.metal;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const t = mesh(roundedBox(0.9, 0.26, 0.16, 0.05), tab,
      LENS_CX + Math.cos(a) * 2.6, LENS_CY + Math.sin(a) * 2.6, z0 + 0.02);
    t.rotation.z = a;
    g.add(t);
  }

  reg('lensBarrel', g, { center: true, dir: [0, -1, 0], dist: 4.3, delay: 0.5 });
}

/* ---------------- front ---------------- */
function buildLensFront(p) {
  const g = new THREE.Group();
  const zEnd = 2.72 + p.len;
  const m = lensMaterials();

  const bezel = mesh(new THREE.CircleGeometry(p.frontR + 0.68, 128), m.matte,
    LENS_CX, LENS_CY, zEnd - 0.16);
  g.add(bezel);

  const R = p.frontR * 5.4;
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x060b12, roughness: 0.08, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.02,
    envMapIntensity: 1.7, iridescence: 0.18, iridescenceIOR: 1.85,
    iridescenceThicknessRange: [240, 520], side: THREE.DoubleSide,
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 32, 0, TAU, 0, Math.asin(p.frontR / R)), glass
  );
  dome.rotation.x = Math.PI / 2;
  dome.position.set(LENS_CX, LENS_CY, zEnd - 0.03 - R);
  g.add(dome);

  // retaining ring
  g.add(mesh(new THREE.TorusGeometry(p.frontR + 0.02, 0.055, 10, 128),
    M.metal({ color: 0x1b1d21, roughness: 0.4 }), LENS_CX, LENS_CY, zEnd - 0.12));

  reg('lensFront', g, { center: true, dir: [0, 0, 1], dist: 3.0 + p.len * 0.2, delay: 0.55 });
}

/* ---------------- aperture ---------------- */
function buildLensAperture(p) {
  const g = new THREE.Group();
  const z = 2.72 + p.len * 0.55;
  const m = lensMaterials();

  g.add(mesh(new THREE.TorusGeometry(2.3, 0.09, 12, 96), m.matte, LENS_CX, LENS_CY, z));
  g.add(mesh(zcyl(2.4, 2.4, 0.16, 96, true), m.body, LENS_CX, LENS_CY, z));
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU;
    const b = mesh(roundedBox(1.7, 0.4, 0.02, 0.008),
      M.metal({ color: 0x22252a, roughness: 0.42 }),
      LENS_CX + Math.cos(a) * 0.6, LENS_CY + Math.sin(a) * 0.6, z + 0.055);
    b.rotation.z = a + 0.35;
    g.add(b);
  }
  g.add(mesh(roundedBox(1.25, 0.16, 0.05, 0.02), M.flex(), LENS_CX - 1.35, LENS_CY - 1.75, z));
  reg('lensAperture', g, { center: true, dir: [0, 0, 1], dist: 2.3 + p.len * 0.12, delay: 0.62 });
}

/* ---------------- STM ---------------- */
function buildLensSTM(p) {
  const g = new THREE.Group();
  const z = 2.72 + p.len * 0.33;
  const m = lensMaterials();

  const motor = mesh(zcyl(0.5, 0.5, 1.3, 32), M.metal({ color: 0x40444a, roughness: 0.34 }),
    LENS_CX - 0.1, LENS_CY - 1.95, z);
  g.add(motor);
  g.add(mesh(zcyl(0.56, 0.56, 0.18, 32), m.body, LENS_CX - 0.1, LENS_CY - 1.95, z - 0.65));
  const screw = mesh(zcyl(0.07, 0.07, 1.6, 16), M.chrome({ color: 0x9aa0a8, roughness: 0.2 }),
    LENS_CX - 0.1, LENS_CY - 1.95, z + 0.9);
  g.add(screw);
  g.add(mesh(roundedBox(0.45, 0.32, 0.3, 0.05), m.body, LENS_CX - 0.1, LENS_CY - 1.6, z + 1.55));
  g.add(mesh(roundedBox(0.7, 0.45, 0.12, 0.04), M.metal({ color: 0x2a2d31 }),
    LENS_CX + 0.55, LENS_CY - 1.95, z));
  g.add(mesh(roundedBox(0.55, 0.14, 0.05, 0.02), M.flex(), LENS_CX + 0.8, LENS_CY - 1.7, z - 0.35));
  reg('lensSTM', g, { center: true, dir: [0.2, -0.45, 1], dist: 1.3, delay: 0.66 });
}

/* ---------------- VR ---------------- */
function buildLensVR(p) {
  const g = new THREE.Group();
  const z = 2.72 + p.len * 0.23;
  const m = lensMaterials();

  g.add(mesh(roundedBox(2.85, 2.85, 0.18, 0.07), M.metal({ color: 0x35393e, roughness: 0.4 }),
    LENS_CX, LENS_CY, z));
  const copper = new THREE.MeshPhysicalMaterial({ color: 0xa9662f, roughness: 0.32, metalness: 0.9 });
  [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]].forEach(([dx, dy]) => {
    g.add(mesh(new THREE.TorusGeometry(0.32, 0.1, 10, 32), copper,
      LENS_CX + dx, LENS_CY + dy, z + 0.1));
    g.add(mesh(roundedBox(0.4, 0.4, 0.1, 0.03), m.matte,
      LENS_CX + dx, LENS_CY + dy, z - 0.07));
  });
  g.add(mesh(zcyl(1.32, 1.32, 0.2, 64), m.body, LENS_CX, LENS_CY, z + 0.12));
  g.add(mesh(zcyl(1.18, 1.18, 0.08, 64), M.glass({ color: 0x08101a, roughness: 0.12 }),
    LENS_CX, LENS_CY, z + 0.24));
  g.add(mesh(roundedBox(1.4, 0.14, 0.05, 0.02), M.flex(), LENS_CX - 1.2, LENS_CY - 0.9, z - 0.06));
  reg('lensVR', g, { center: true, dir: [0, 0.35, 1], dist: 1.6, delay: 0.7 });
}

/* ---------------- rear ---------------- */
function buildLensRear(p) {
  const g = new THREE.Group();
  const m = lensMaterials();

  g.add(mesh(zcyl(1.72, 1.72, 0.1, 64), M.glass({ color: 0x070e18, roughness: 0.08 }),
    LENS_CX, LENS_CY, 3.4));
  g.add(mesh(zcyl(2.22, 2.22, 0.4, 96), m.body, LENS_CX, LENS_CY, 3.24));
  g.add(mesh(new THREE.TorusGeometry(2.33, 0.08, 10, 96), m.metal, LENS_CX, LENS_CY, 3.05));

  const gold = M.gold();
  for (let i = 0; i < 11; i++) {
    const a = (200 + i * 14) * Math.PI / 180;
    const c = mesh(roundedBox(0.1, 0.085, 0.06, 0.015), gold,
      LENS_CX + Math.cos(a) * 2.56, LENS_CY + Math.sin(a) * 2.56, 3.08);
    c.rotation.z = a + Math.PI / 2;
    g.add(c);
  }
  g.add(mesh(roundedBox(1.35, 0.3, 0.05, 0.02), M.flex(), LENS_CX, LENS_CY - 2.05, 3.14));
  reg('lensRear', g, { center: true, dir: [0, 0, 1], dist: 0.8, delay: 0.78 });
}
