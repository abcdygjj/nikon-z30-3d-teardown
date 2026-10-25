/* =========================================================================
   20 · build the camera — every part is a group registered with its metadata
   ========================================================================= */
let PSCENE = null;
let PROGRESS = null;

function reg(id, g, opts = {}) {
  const info = PARTS[id];
  if (!info) throw new Error('unknown part ' + id);
  g.traverse((o) => {
    if (o.isMesh) {
      o.userData.partId = id;
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  PSCENE.add(g);
  const mats = new Set();
  g.traverse((o) => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
  });
  const box = new THREE.Box3().setFromObject(g);
  const center = box.getCenter(new THREE.Vector3());
  const p = {
    id, info, group: g, mats: [...mats],
    baseLabel: opts.center ? center : info.anchorV.clone(),
    dir: opts.dir ? new THREE.Vector3(...opts.dir).normalize() : info.dir.clone(),
    dist: opts.dist !== undefined ? opts.dist : info.dist,
    delay: opts.delay !== undefined ? opts.delay : info.delay,
    isLens: info.cat === 'lens', isAcc: info.cat === 'acc', focusR: info.focusR,
  };
  parts.set(id, p);
  if (PROGRESS) PROGRESS(parts.size);
  return p;
}

/* ---------------------------------------------------------------- shell */
function buildFront() {
  const g = new THREE.Group();
  const shape = roundedRectPath(11.9, 7.35, 0.55);
  const hole = new THREE.Path();
  hole.absarc(0.95, 0.05, 2.86, 0, TAU, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.24, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1,
    bevelSegments: 2, curveSegments: 30,
  });
  geo.center();
  const m = M.shell({ color: 0x121418, roughness: 0.6 });
  g.add(mesh(geo, m, 0, 0, 2.12));

  // Nikon wordmark sits on the front top-right, above the mount (reference photos)
  g.add(decal(logoNikon, 1.72, 0.4, 3.55, 3.02, 2.36));
  // thin panel seam along the top edge of the front cover
  g.add(mesh(roundedBox(10.6, 0.035, 0.03, 0.01), M.plastic({ color: 0x0a0b0d, roughness: 0.9 }), 0, 3.24, 2.345));

  reg('front', g);
}

function buildRear() {
  const g = new THREE.Group();
  const shape = roundedRectPath(11.9, 7.35, 0.55);
  const hole = roundedRectPath(6.95, 4.55, 0.32, 0.6, -0.02, THREE.Path);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2, bevelEnabled: true, bevelSize: 0.09, bevelThickness: 0.09,
    bevelSegments: 2, curveSegments: 30,
  });
  geo.center();
  const m = M.shell({ color: 0x101216, roughness: 0.62 });
  g.add(mesh(geo, m, 0, 0, -2.19));

  // thumb rest
  const thumb = mesh(roundedBox(1.7, 2.6, 0.18, 0.42), M.leather(),
    -5.55, 1.35, -2.43);
  g.add(thumb);

  // small vents / screws
  const screwMat = M.metal({ color: 0x55595f, roughness: 0.45 });
  [[-5.35, -3.0], [5.35, -3.0], [-5.35, 3.0], [5.35, 3.0]].forEach(([x, y]) => {
    const s = mesh(cyl(0.09, 0.09, 0.05, 16), screwMat, x, y, -2.42);
    s.rotation.x = Math.PI / 2;
    g.add(s);
  });

  reg('rear', g);
}

function buildTop() {
  const g = new THREE.Group();
  const m = M.shell({ color: 0x0d0f12, roughness: 0.8, clearcoat: 0.02, envMapIntensity: 0.55 });
  g.add(mesh(roundedBox(11.9, 0.42, 4.5, 0.19, 3), m, 0, 3.47, 0));
  g.add(mesh(roundedBox(5.2, 0.44, 2.2, 0.21, 3), m, -3.9, 3.47, 3.2));

  // strap lugs with the red accent ring seen in the photos
  const metal = M.metal({ color: 0x5c6168, roughness: 0.3 });
  [-1, 1].forEach((sgn) => {
    const lug = mesh(new THREE.TorusGeometry(0.3, 0.1, 10, 24), metal, sgn * 6.02, 2.85, -0.5);
    lug.rotation.y = Math.PI / 2;
    g.add(lug);
    const red = mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 28),
      new THREE.MeshPhysicalMaterial({ color: 0x9e2b22, roughness: 0.5 }), sgn * 5.95, 2.85, -0.5);
    red.rotation.y = Math.PI / 2;
    g.add(red);
    g.add(mesh(roundedBox(0.5, 0.55, 0.7, 0.16), m, sgn * 5.85, 2.9, -0.5));
  });

  const lip = M.shell({ color: 0x1d1f24 });
  g.add(mesh(roundedBox(11.5, 0.16, 0.4, 0.08), lip, 0, 3.29, 2.15));

  // ISO and exposure-compensation buttons on the grip top
  const btnMat = M.plastic({ color: 0x232529, roughness: 0.42, clearcoat: 0.35 });
  const topLabel = (tex, w, h, x, z) => {
    const m = mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 3.699, z);
    g.add(m);
  };
  [[-2.55, 2.78, 'ISO'], [-2.55, 2.18, '+/-']].forEach(([x, z, label]) => {
    g.add(mesh(cyl(0.29, 0.29, 0.17, 32), btnMat, x, 3.72, z));
    g.add(mesh(cyl(0.21, 0.21, 0.03, 28), M.plastic({ color: 0x26282c, roughness: 0.4, clearcoat: 0.3 }), x, 3.815, z));
    g.add(mesh(new THREE.TorusGeometry(0.25, 0.018, 8, 28), M.metal({ color: 0x3a3d42, roughness: 0.45 }), x, 3.812, z).rotateX(Math.PI / 2));
    topLabel(iconTex(label, { size: 30 }), 0.5, 0.5, x + 0.52, z);
  });

  // power switch legends around the shutter collar
  topLabel(iconTex('OFF', { size: 26 }), 0.52, 0.52, -3.55, 3.55);
  topLabel(iconTex('ON', { size: 26 }), 0.52, 0.52, -4.35, 1.55);

  // microphone grille: two rows of perforations near the front edge
  const micGrille = makeTex(256, 64, (gg, w, h) => {
    gg.clearRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 18; c++) {
      gg.fillStyle = 'rgba(8,8,10,.9)';
      gg.beginPath(); gg.arc(8 + c * 14, 18 + r * 26, 3.4, 0, TAU); gg.fill();
    }
  });
  const mg = mesh(new THREE.PlaneGeometry(2.6, 0.55), new THREE.MeshBasicMaterial({ map: micGrille, transparent: true }));
  mg.rotation.x = -Math.PI / 2;
  mg.position.set(0.55, 3.695, 1.55);
  g.add(mg);

  reg('top', g);
}

function buildGrip() {
  const g = new THREE.Group();
  const body = M.shell({ color: 0x0e1013, roughness: 0.64, clearcoat: 0.08 });
  // rounder and slightly deeper than the old block, per the side photo
  g.add(mesh(roundedBox(5.0, 7.05, 5.0, 1.42, 5), body, -3.9, -0.075, 1.85));

  // pebbled rubber front panel
  const pad = mesh(roundedBox(4.3, 5.9, 0.26, 0.62),
    M.leather(), -3.95, -0.4, 4.5);
  g.add(pad);

  // textured rubber wraps the thumb side too
  g.add(mesh(roundedBox(0.5, 4.4, 2.8, 0.2),
    M.leather(), -6.3, -0.3, 2.7));

  // Z 30 badge on the grip side, low and toward the rear (as in 4d15)
  const badge = decal(badgeZ30Side, 0.62, 0.62, -6.44, -2.25, 0.95);
  badge.rotation.y = -Math.PI / 2;
  g.add(badge);

  reg('grip', g);
}

function buildBottom() {
  const g = new THREE.Group();
  const m = M.shell({ color: 0x121418, roughness: 0.62 });
  g.add(mesh(roundedBox(11.9, 0.24, 4.52, 0.1, 2), m, 0, -3.6, 0));

  // metal tripod plate
  const plate = mesh(roundedBox(4.7, 0.1, 2.95, 0.22, 3), M.metal({ color: 0x2c2f34, roughness: 0.38 }),
    0, -3.725, 0);
  g.add(plate);
  g.add(mesh(cyl(0.62, 0.62, 0.14, 40), M.metal({ color: 0x8a9098 }), 0, -3.77, 0));
  g.add(mesh(cyl(0.36, 0.36, 0.12, 32), M.plastic({ color: 0x08090a }), 0, -3.8, 0));

  // plate screws + body screws
  const screw = (x, z, y = -3.74) => {
    const s = mesh(cyl(0.11, 0.11, 0.035, 18), M.metal({ color: 0x777d85, roughness: 0.4 }), x, y, z);
    g.add(s);
    g.add(mesh(roundedBox(0.1, 0.012, 0.02, 0.005), M.plastic({ color: 0x0a0b0d }), x, y - 0.018, z));
  };
  [[-1.9, -1.05], [1.9, -1.05], [-1.9, 1.05], [1.9, 1.05]].forEach(([x, z]) => screw(x, z, -3.775));
  [[-5.25, -1.7], [5.25, -1.7], [-5.25, 1.7], [5.25, 1.7]].forEach(([x, z]) => screw(x, z, -3.73));

  // battery / card door with a recessed seam and label
  g.add(mesh(roundedBox(3.6, 0.05, 3.6, 0.18), M.shell({ color: 0x0f1012 }), -3.9, -3.735, 0.9));
  g.add(mesh(roundedBox(3.45, 0.06, 3.45, 0.16), M.shell({ color: 0x1a1c20 }), -3.9, -3.745, 0.9));
  const dl = mesh(new THREE.PlaneGeometry(1.9, 0.95),
    new THREE.MeshBasicMaterial({ map: doorLabelTex, transparent: true, opacity: 0.9 }));
  dl.rotation.x = Math.PI / 2;
  dl.position.set(-3.9, -3.78, 0.55);
  g.add(dl);
  g.add(mesh(roundedBox(0.75, 0.08, 0.3, 0.05), M.metal({ color: 0x777d85 }), -2.6, -3.77, 1.7));
  g.add(mesh(roundedBox(0.22, 0.05, 0.16, 0.03), M.plastic({ color: 0x111214 }), -2.6, -3.805, 1.7));

  // holographic QC sticker
  const holo = mesh(new THREE.PlaneGeometry(0.75, 0.75),
    new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, opacity: 0.8 }));
  holo.rotation.x = Math.PI / 2;
  holo.rotation.z = -0.12;
  holo.position.set(2.05, -3.78, 1.4);
  g.add(holo);

  // rubber feet
  const foot = M.rubber({ color: 0x0c0d0f, bumpScale: 0.02 });
  [[-2.2, -1.4], [4.6, -1.4], [-2.2, 1.6], [4.6, 1.6]].forEach(([x, z]) => {
    g.add(mesh(cyl(0.16, 0.16, 0.06, 20), foot, x, -3.75, z));
  });

  reg('bottom', g);
}

function buildMount() {
  const g = new THREE.Group();
  const cx = 0.95, cy = 0.05;
  const chrome = M.chrome({ color: 0xb9bec6, roughness: 0.2 });
  const dark = M.metal({ color: 0x2a2d31, roughness: 0.4 });

  // outer ring
  const outer = mesh(zcyl(3.15, 3.15, 0.56, 96, true), chrome, cx, cy, 2.55);
  g.add(outer);
  // front bezel
  const bezel = mesh(new THREE.RingGeometry(2.72, 3.16, 96), M.metal({ color: 0x4a4e54, roughness: 0.28 }),
    cx, cy, 2.835);
  g.add(bezel);
  // inner throat
  g.add(mesh(zcyl(2.7, 2.7, 0.62, 96, true), M.plastic({ color: 0x0b0c0e, roughness: 0.8 }), cx, cy, 2.5));
  // rear flange
  g.add(mesh(new THREE.RingGeometry(2.42, 3.12, 96), dark, cx, cy, 2.27));

  // bayonet tabs
  const tabMat = M.metal({ color: 0x8d939b, roughness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const tab = mesh(roundedBox(0.95, 0.3, 0.16, 0.06), tabMat, cx + Math.cos(a) * 2.62, cy + Math.sin(a) * 2.62, 2.82);
    tab.rotation.z = a;
    g.add(tab);
  }

  // lens release button
  const btn = mesh(cyl(0.25, 0.25, 0.2, 32), M.metal({ color: 0x2f3237, roughness: 0.35 }),
    cx + 3.35, cy - 1.35, 2.45);
  btn.rotation.x = Math.PI / 2;
  g.add(btn);
  const bRing = mesh(new THREE.TorusGeometry(0.27, 0.04, 8, 32), M.chrome(), cx + 3.35, cy - 1.35, 2.37);
  g.add(bRing);
  g.add(mesh(cyl(0.09, 0.09, 0.03, 16), new THREE.MeshBasicMaterial({ color: 0xb8332a }),
    cx + 3.35, cy - 1.35, 2.56));

  // mount screws
  const sMat = M.metal({ color: 0x555a61 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const s = mesh(cyl(0.075, 0.075, 0.04, 14), sMat, cx + Math.cos(a) * 2.95, cy + Math.sin(a) * 2.95, 2.86);
    s.rotation.x = Math.PI / 2;
    g.add(s);
  }

  reg('mount', g);
}

function buildContacts() {
  const g = new THREE.Group();
  const gold = M.gold();
  for (let i = 0; i < 11; i++) {
    const a = (200 + i * 14) * Math.PI / 180;
    const x = 0.95 + Math.cos(a) * 2.52, y = 0.05 + Math.sin(a) * 2.52;
    const c = mesh(roundedBox(0.12, 0.1, 0.09, 0.02), gold, x, y, 2.47);
    c.rotation.z = a + Math.PI / 2;
    g.add(c);
  }
  // flex tail
  const flex = mesh(roundedBox(1.6, 0.55, 0.06, 0.05), M.flex({ color: 0xb4642b }),
    0.95, -2.15, 2.35);
  g.add(flex);
  reg('contacts', g);
}

function buildScreen() {
  const g = new THREE.Group();
  const bezel = M.plastic({ color: 0x0e0f12, roughness: 0.55 });
  g.add(mesh(roundedBox(6.85, 4.5, 0.24, 0.14), bezel, 0.6, -0.02, -2.46));

  const scr = new THREE.Mesh(
    new THREE.PlaneGeometry(6.25, 3.95),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  );
  scr.rotation.y = Math.PI;
  scr.position.set(0.6, -0.02, -2.588);
  g.add(scr);

  // hinge
  const metal = M.metal({ color: 0x4b4f55, roughness: 0.35 });
  // vari-angle hinge on the left edge (viewed from the back), matching the photos
  const hinge = mesh(cyl(0.15, 0.15, 4.6, 24), metal, 4.2, -0.02, -2.5);
  g.add(hinge);
  g.add(mesh(roundedBox(0.5, 3.6, 0.16, 0.05), metal, 3.99, -0.02, -2.5));
  g.add(mesh(cyl(0.2, 0.2, 0.14, 24), metal, 4.2, 2.28, -2.5));
  g.add(mesh(cyl(0.2, 0.2, 0.14, 24), metal, 4.2, -2.32, -2.5));
  g.add(mesh(roundedBox(0.7, 0.5, 0.2, 0.08), metal, 4.2, 0.02, -2.4));

  reg('screen', g);
}

function buildModeDial() {
  const g = new THREE.Group();
  const knurl = M.metal({ color: 0x24262a, roughness: 0.4, bumpMap: knurlTex, bumpScale: 0.012 });
  const d = mesh(cyl(1.02, 1.02, 0.52, 64), knurl, 4.1, 3.9, 0.4);
  g.add(d);
  g.add(mesh(cyl(1.07, 1.01, 0.1, 64), M.metal({ color: 0x3a3d42 }), 4.1, 3.62, 0.4));
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.99, 64),
    new THREE.MeshBasicMaterial({ map: modeDialTex, transparent: true, toneMapped: false }));
  face.rotation.x = -Math.PI / 2;
  face.position.set(4.1, 4.17, 0.4);
  g.add(face);
  // index mark
  g.add(mesh(roundedBox(0.06, 0.03, 0.22, 0.02), M.metal({ color: 0xffd60a }),
    4.1, 3.685, 1.52));
  reg('modeDial', g);
}

function buildCommandDial() {
  const g = new THREE.Group();
  const knurl = M.metal({ color: 0x2b2d32, roughness: 0.38, bumpMap: knurlTex, bumpScale: 0.014 });
  const d = mesh(cyl(0.75, 0.75, 0.38, 48), knurl, 5.15, 2.8, -1.9);
  d.rotation.z = Math.PI / 2;
  g.add(d);
  const cap = mesh(cyl(0.52, 0.52, 0.4, 40), M.metal({ color: 0x191a1d, roughness: 0.3 }),
    5.35, 2.8, -1.9);
  cap.rotation.z = Math.PI / 2;
  g.add(cap);
  g.add(mesh(roundedBox(0.3, 1.9, 0.2, 0.05), M.plastic({ color: 0x131417 }), 5.35, 2.8, -1.9));
  reg('commandDial', g);
}

function buildShutterBtn() {
  const g = new THREE.Group();
  const metal = M.plastic({ color: 0x141619, roughness: 0.55, clearcoat: 0.2 });
  g.add(mesh(cyl(0.98, 0.98, 0.1, 48), M.plastic({ color: 0x111214 }), -3.5, 3.7, 2.5));
  g.add(mesh(new THREE.TorusGeometry(0.94, 0.03, 8, 48), M.metal({ color: 0x4c5058, roughness: 0.35 }),
    -3.5, 3.755, 2.5).rotateX(Math.PI / 2));
  g.add(mesh(cyl(0.62, 0.62, 0.16, 40), metal, -3.5, 3.82, 2.5));
  const dome = mesh(new THREE.SphereGeometry(0.62, 32, 16, 0, TAU, 0, Math.PI / 2),
    M.plastic({ color: 0x15171a, roughness: 0.55, clearcoat: 0.15 }), -3.5, 3.9, 2.5);
  dome.scale.y = 0.22;
  g.add(dome);
  // power lever
  const lever = mesh(roundedBox(0.95, 0.16, 0.36, 0.07), metal, -2.75, 3.75, 2.5);
  g.add(lever);
  g.add(mesh(cyl(0.11, 0.11, 0.18, 16), metal, -2.4, 3.75, 2.5));
  g.add(mesh(roundedBox(0.5, 0.03, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: 0xcfd3da }),
    -2.75, 3.835, 2.5));
  reg('shutterBtn', g);
}

function buildHotshoe() {
  const g = new THREE.Group();
  const metal = M.metal({ color: 0x3a3d42, roughness: 0.38 });
  g.add(mesh(roundedBox(2.6, 0.14, 2.3, 0.06), M.plastic({ color: 0x131417 }), 0.55, 3.7, -0.2));
  [-1.05, 1.05].forEach((dx) => {
    g.add(mesh(roundedBox(0.26, 0.2, 2.35, 0.05), metal, 0.55 + dx, 3.82, -0.2));
    g.add(mesh(roundedBox(0.44, 0.07, 2.35, 0.02), metal, 0.55 + dx * 0.86, 3.9, -0.2));
  });
  g.add(mesh(roundedBox(0.5, 0.06, 0.6, 0.02), M.gold(), 0.55, 3.8, -0.2));
  const pin = M.gold();
  [-0.3, 0, 0.3].forEach((dz) => {
    g.add(mesh(cyl(0.05, 0.05, 0.05, 12), pin, 0.55, 3.82, -0.2 + dz));
  });
  reg('hotshoe', g);
}

function buildMic() {
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.85 });

  // port for the mic
  g.add(mesh(roundedBox(0.8, 0.05, 0.2, 0.03), m, 0.9, 3.69, 1.15));
  reg('mic', g);
}

function buildRecBtn() {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.3, 0.3, 0.16, 32), M.metal({ color: 0x2a2c30 }), -3.55, 3.72, 1.45));
  g.add(mesh(cyl(0.22, 0.22, 0.14, 32), new THREE.MeshPhysicalMaterial({
    color: 0x8d1f18, roughness: 0.3, clearcoat: 1,
  }), -3.55, 3.82, 1.45));
  g.add(mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: 0xd8392a }),
    -3.55, 3.805, 1.45).rotateX(Math.PI / 2));
  reg('recBtn', g);
}

function buildButtons() {
  const g = new THREE.Group();
  const cap = M.plastic({ color: 0x24262a, roughness: 0.45, clearcoat: 0.4 });
  const defs = [
    [2.62, 1.3, 0.42, 'DISP', 24], [1.76, 0.98, 0.36, 'play', 0], [1.06, 0.98, 0.36, 'trash', 0],
    [0.32, 0.82, 0.32, 'AE-L', 18], [-0.42, 0.9, 0.32, 'i', 40], [-1.16, 0.98, 0.36, 'MENU', 18],
    [-1.9, 0.9, 0.32, 'OK', 22], [-2.64, 0.98, 0.36, '?', 34],
  ];
  defs.forEach(([y, w, h, label, size]) => {
    g.add(mesh(roundedBox(w, h, 0.16, 0.07), cap, -4.35, y, -2.46));
    const t = iconTex(label, { size: size || 24, shape: label === 'play' ? 'play' : label === 'trash' ? 'trash' : undefined });
    const ic = mesh(new THREE.PlaneGeometry(Math.min(w * 0.62, 0.55), Math.min(w * 0.62, 0.55)),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.9 }));
    ic.rotation.y = Math.PI;
    ic.position.set(-4.35, y, -2.552);
    g.add(ic);
    if (label === 'DISP' || label === 'AE-L') {
      g.add(mesh(roundedBox(w * 0.55, 0.03, 0.02, 0.01), M.plastic({ color: 0x111214 }), -4.35, y - h * 0.62, -2.552));
    }
  });
  // zoom rocker
  const rocker = mesh(roundedBox(1.1, 0.36, 0.18, 0.14), cap, -4.35, -2.78, -2.47);
  g.add(rocker);
  g.add(mesh(roundedBox(0.05, 0.24, 0.05, 0.02), M.plastic({ color: 0x111214 }), -4.35, -2.78, -2.56));
  g.add(mesh(cyl(0.11, 0.11, 0.04, 16), M.metal({ color: 0x777d85 }), -4.8, -2.78, -2.56));
  reg('buttons', g);
}

function buildPorts() {
  const g = new THREE.Group();
  const rubber = M.rubber({ color: 0x101113, bumpScale: 0.02 });
  const cover = mesh(roundedBox(0.16, 2.95, 1.75, 0.18), rubber, 6.02, -0.35, 0.55);
  g.add(cover);
  g.add(mesh(roundedBox(0.1, 0.3, 0.7, 0.06), rubber, 6.06, 1.25, 0.55));
  g.add(mesh(cyl(0.05, 0.05, 0.06, 12), M.metal({ color: 0x6a7078 }), 6.09, -1.8, 0.55));
  const lbl = mesh(new THREE.PlaneGeometry(1.35, 2.6),
    new THREE.MeshBasicMaterial({ map: portLabelTex, transparent: true, opacity: 0.85 }));
  lbl.rotation.y = Math.PI / 2;
  lbl.position.set(6.108, -0.35, 0.55);
  g.add(lbl);
  reg('ports', g);
}

/* ---------------------------------------------------------------- core */
function buildChassis() {
  const g = new THREE.Group();
  const metal = M.metal({ color: 0x2b2e33, roughness: 0.45, metalness: 0.9 });
  const dark = M.metal({ color: 0x24272b, roughness: 0.55 });

  // outer frame
  g.add(mesh(roundedBox(0.3, 6.5, 4.15, 0.1), metal, 5.78, 0, -0.05));
  g.add(mesh(roundedBox(0.3, 6.5, 4.15, 0.1), metal, -5.78, 0, -0.05));
  g.add(mesh(roundedBox(11.55, 0.3, 4.15, 0.1), metal, 0, 3.22, -0.05));
  g.add(mesh(roundedBox(11.55, 0.3, 4.15, 0.1), metal, 0, -3.25, -0.05));

  // ribs
  g.add(mesh(roundedBox(0.22, 6.0, 3.2, 0.08), dark, -2.55, 0, -0.2));
  g.add(mesh(roundedBox(5.0, 0.22, 3.2, 0.08), dark, 2.6, 2.35, -0.2));

  // lens mount support
  const ring = mesh(new THREE.TorusGeometry(3.05, 0.28, 12, 64), metal, 0.95, 0.05, 2.05);
  g.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    g.add(mesh(roundedBox(0.55, 0.55, 0.4, 0.1), metal,
      0.95 + Math.cos(a) * 3.0, 0.05 + Math.sin(a) * 3.0, 1.95));
  }

  // sensor cradle
  g.add(mesh(roundedBox(5.4, 4.2, 0.3, 0.12), dark, 0.95, 0.05, 0.62));
  // tripod nut
  g.add(mesh(cyl(0.62, 0.62, 0.5, 32), M.metal({ color: 0x9aa0a8 }), 0, -3.0, 0));

  // port sockets
  const socket = M.plastic({ color: 0x0a0b0d, roughness: 0.5 });
  g.add(mesh(roundedBox(0.5, 0.32, 0.95, 0.12), socket, 5.66, 0.5, 0.55));
  g.add(mesh(roundedBox(0.4, 0.26, 0.65, 0.08), socket, 5.66, -0.3, 0.55));
  const jack = mesh(cyl(0.22, 0.22, 0.3, 24), socket, 5.66, -1.0, 0.55);
  jack.rotation.z = Math.PI / 2;
  g.add(jack);
  g.add(mesh(cyl(0.27, 0.27, 0.12, 24), M.metal({ color: 0x8b9199 }), 5.55, -1.0, 0.55).rotateZ(Math.PI / 2));

  // battery cage
  g.add(mesh(roundedBox(0.14, 5.0, 4.2, 0.05), dark, -3.2, -0.55, 0.9));

  reg('chassis', g);
}

function buildShutterUnit() {
  const g = new THREE.Group();
  const metal = M.metal({ color: 0x3e4248, roughness: 0.4 });
  const dark = M.plastic({ color: 0x0c0d0f, roughness: 0.7 });
  const z = 1.4;

  g.add(mesh(roundedBox(5.2, 0.55, 0.34, 0.1), metal, 0.95, 2.05, z));
  g.add(mesh(roundedBox(5.2, 0.55, 0.34, 0.1), metal, 0.95, -1.95, z));
  g.add(mesh(roundedBox(0.55, 3.9, 0.34, 0.1), metal, -1.55, 0.05, z));
  g.add(mesh(roundedBox(0.55, 3.9, 0.34, 0.1), metal, 3.45, 0.05, z));

  // curtains (hidden when the mount is open so the CMOS is visible)
  const c1 = mesh(roundedBox(2.95, 1.05, 0.04, 0.02), dark, 0.95, 0.72, z + 0.1);
  c1.userData.shutterBlade = true; g.add(c1);
  const c2 = mesh(roundedBox(2.95, 0.9, 0.04, 0.02), dark, 0.95, -0.62, z + 0.13);
  c2.userData.shutterBlade = true; g.add(c2);
  // blades
  for (let i = 0; i < 4; i++) {
    const b = mesh(roundedBox(2.8, 0.34, 0.02, 0.01), M.metal({ color: 0x60666d, roughness: 0.25 }),
      0.95, 0.55 - i * 0.28, z + 0.17);
    b.rotation.z = (i - 1.5) * 0.02;
    b.userData.shutterBlade = true;
    g.add(b);
  }
  // motor + flex
  const motor = mesh(cyl(0.32, 0.32, 0.75, 24), M.metal({ color: 0x2a2d31 }), 3.75, -1.5, z);
  motor.rotation.x = Math.PI / 2;
  g.add(motor);
  g.add(mesh(roundedBox(0.22, 1.3, 0.05, 0.02), M.flex(), 3.75, -0.85, z - 0.2));
  g.add(mesh(roundedBox(3.4, 0.22, 0.06, 0.02), M.flex(), 0.95, -2.32, z - 0.1));

  reg('shutterUnit', g);
}

function buildSensor() {
  const g = new THREE.Group();
  const cx = 0.95, cy = 0.05;
  // package pcb
  g.add(mesh(roundedBox(4.7, 3.7, 0.16, 0.08), M.pcb({ color: 0x2f5f45 }), cx, cy, 0.8));
  g.add(mesh(roundedBox(3.3, 2.35, 0.18, 0.06), M.plastic({ color: 0x14161a, roughness: 0.5 }), cx, cy, 0.92));
  // die
  const die = mesh(roundedBox(2.36, 1.58, 0.05, 0.01), M.sensor(), cx, cy, 1.02);
  g.add(die);
  // gold bond ring
  const gold = M.gold();
  g.add(mesh(roundedBox(2.62, 0.09, 0.04, 0.01), gold, cx, cy + 0.86, 1.0));
  g.add(mesh(roundedBox(2.62, 0.09, 0.04, 0.01), gold, cx, cy - 0.86, 1.0));
  g.add(mesh(roundedBox(0.09, 1.82, 0.04, 0.01), gold, cx + 1.32, cy, 1.0));
  g.add(mesh(roundedBox(0.09, 1.82, 0.04, 0.01), gold, cx - 1.32, cy, 1.0));
  // stiffener + flex
  g.add(mesh(roundedBox(4.2, 0.25, 0.2, 0.05), M.metal({ color: 0x5a6068 }), cx, -1.75, 0.82));
  g.add(mesh(roundedBox(2.4, 1.3, 0.05, 0.05), M.flex(), cx, -2.5, 0.8));
  reg('sensor', g);
}

function buildOlpf() {
  const g = new THREE.Group();
  const cx = 0.95, cy = 0.05;
  g.add(mesh(roundedBox(3.55, 2.65, 0.1, 0.05), M.metal({ color: 0x4a4f56, roughness: 0.35 }), cx, cy, 1.1));
  g.add(mesh(roundedBox(3.0, 2.1, 0.06, 0.02), M.glass({ color: 0x16324a, roughness: 0.08 }), cx, cy, 1.16));
  g.add(mesh(roundedBox(2.4, 1.6, 0.02, 0.01), new THREE.MeshPhysicalMaterial({
    color: 0x1d4a63, roughness: 0.05, metalness: 0.4, iridescence: 1, iridescenceIOR: 1.4,
    transparent: true, opacity: 0.85,
  }), cx, cy, 1.19));
  reg('olpf', g);
}

function buildBoard() {
  const g = new THREE.Group();
  const cx = 1.0;
  const board = mesh(roundedBox(7.4, 5.15, 0.12, 0.05), M.pcb(), cx, 0, -1.15);
  g.add(board);

  const chip = M.plastic({ color: 0x0d0d10, roughness: 0.6 });
  const capMat = M.metal({ color: 0x6f757d, roughness: 0.5 });

  // EXPEED 6
  g.add(mesh(roundedBox(1.85, 1.85, 0.14, 0.03), chip, cx + 0.55, 0.55, -1.28));
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: expeedTex, toneMapped: false }));
  lbl.rotation.y = Math.PI;
  lbl.position.set(cx + 0.55, 0.55, -1.36);
  g.add(lbl);

  // RAM / PMIC / misc
  g.add(mesh(roundedBox(1.15, 0.95, 0.12, 0.02), chip, cx + 2.55, -1.35, -1.27));
  g.add(mesh(roundedBox(1.0, 0.75, 0.1, 0.02), chip, cx - 1.55, 1.55, -1.26));
  g.add(mesh(roundedBox(0.8, 0.6, 0.1, 0.02), chip, cx - 1.4, -1.7, -1.26));
  for (let i = 0; i < 6; i++) {
    g.add(mesh(cyl(0.16, 0.16, 0.18, 16), capMat, cx + 2.9, 1.95 - i * 0.42, -1.27).rotateX(Math.PI / 2));
  }
  // connectors
  g.add(mesh(roundedBox(1.0, 0.28, 0.2, 0.03), M.plastic({ color: 0x202226 }), cx - 0.6, 2.25, -1.25));
  g.add(mesh(roundedBox(0.9, 0.28, 0.2, 0.03), M.plastic({ color: 0x202226 }), cx + 1.95, 2.25, -1.25));
  g.add(mesh(roundedBox(0.7, 0.3, 0.18, 0.03), M.plastic({ color: 0x202226 }), cx + 3.0, 0.1, -1.25));
  // coin cell
  const cell = mesh(cyl(0.52, 0.52, 0.14, 32), M.chrome({ color: 0x9aa0a8 }), cx - 1.3, -0.4, -1.3);
  cell.rotation.x = Math.PI / 2;
  g.add(cell);
  g.add(mesh(roundedBox(0.1, 2.4, 0.06, 0.02), M.flex(), cx + 3.4, 0.4, -1.22));
  reg('board', g);
}

function buildShield() {
  const g = new THREE.Group();
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0x9aa0a8, roughness: 0.55, metalness: 1.0, envMapIntensity: 1.2,
  });
  g.add(mesh(roundedBox(7.2, 4.95, 0.07, 0.06), steel, 1.0, 0, -1.72));
  // stamped ribs
  for (let i = 0; i < 4; i++) {
    g.add(mesh(roundedBox(5.6, 0.09, 0.08, 0.03), M.metal({ color: 0x6f757d }),
      1.0, 1.75 - i * 1.15, -1.78));
  }
  // cut corner + holes
  for (let i = 0; i < 8; i++) {
    g.add(mesh(cyl(0.13, 0.13, 0.08, 12), M.plastic({ color: 0x0a0b0c }),
      3.9, 1.9 - i * 0.5, -1.72));
  }
  g.add(mesh(roundedBox(0.9, 0.5, 0.1, 0.04), M.flex(), 1.0, -2.1, -1.78));
  reg('shield', g);
}

function buildBattery() {
  const g = new THREE.Group();
  const shell = M.plastic({ color: 0x1a1b1e, roughness: 0.62 });
  g.add(mesh(roundedBox(1.55, 4.7, 4.0, 0.22), shell, -4.0, -0.55, 0.9));
  // label on -X face
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.0),
    new THREE.MeshBasicMaterial({ map: batteryTex, toneMapped: false }));
  lbl.rotation.y = -Math.PI / 2;
  lbl.position.set(-4.79, -0.55, 0.9);
  g.add(lbl);
  // contacts
  const gold = M.gold();
  for (let i = 0; i < 4; i++) {
    g.add(mesh(roundedBox(0.16, 0.05, 0.22, 0.02), gold, -4.35 + i * 0.3, 1.82, 1.4));
  }
  // latch
  g.add(mesh(roundedBox(0.5, 0.25, 0.3, 0.06), M.plastic({ color: 0x2e3136 }), -3.55, 1.75, 2.2));
  reg('battery', g);
}

function buildSdCard() {
  const g = new THREE.Group();
  const card = mesh(roundedBox(0.2, 2.3, 3.1, 0.06), M.plastic({ color: 0x1b2330, roughness: 0.55 }),
    -5.5, -1.9, 0.9);
  g.add(card);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.7),
    new THREE.MeshBasicMaterial({ map: makeTex(256, 192, (c, w, h) => {
      c.fillStyle = '#1c2a3c'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8ebf1'; c.font = '700 34px "Segoe UI", sans-serif'; c.fillText('SanDisk', 14, 46);
      c.fillStyle = '#5aa9ff'; c.font = '700 52px "Segoe UI", sans-serif'; c.fillText('64GB', 14, 110);
      c.fillStyle = '#9aa1ad'; c.font = '500 20px "Segoe UI", sans-serif'; c.fillText('UHS-I  V30', 14, 150);
    }), toneMapped: false }));
  lbl.rotation.y = -Math.PI / 2;
  lbl.position.set(-5.61, -1.9, 0.9);
  g.add(lbl);
  g.add(mesh(roundedBox(0.06, 0.35, 0.2, 0.02), M.plastic({ color: 0x0b0c0e }), -5.62, -0.85, 0.3));
  reg('sdcard', g);
}

function buildAntenna() {
  const g = new THREE.Group();
  const meander = makeTex(256, 512, (c, w, h) => {
    c.fillStyle = '#b06020'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e0a24a'; c.lineWidth = 10;
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const y = 30 + i * 50;
      c.moveTo(40, y); c.lineTo(w - 40, y);
      if (i < 8) { c.lineTo(w - 40, y + 50); }
    }
    c.stroke();
    c.fillStyle = '#3a2a18'; c.fillRect(20, 440, 60, 40);
  });
  const sheet = mesh(roundedBox(0.05, 3.7, 1.15, 0.02), new THREE.MeshPhysicalMaterial({
    map: meander, color: 0xffffff, roughness: 0.6, metalness: 0.3,
  }), 5.55, 1.2, -1.55);
  g.add(sheet);
  g.add(mesh(roundedBox(0.12, 0.5, 0.5, 0.04), M.plastic({ color: 0x15171a }), 5.56, -0.75, -1.55));
  reg('antenna', g);
}

function buildSpeaker() {
  const g = new THREE.Group();
  const sp = mesh(cyl(0.62, 0.62, 0.22, 32), M.plastic({ color: 0x111214 }), 5.52, -2.35, -1.0);
  sp.rotation.z = Math.PI / 2;
  g.add(sp);
  const grille = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({ map: grilleTex, transparent: true }));
  grille.rotation.y = Math.PI / 2;
  grille.position.set(5.64, -2.35, -1.0);
  g.add(grille);
  g.add(mesh(roundedBox(0.7, 0.9, 0.9, 0.1), M.plastic({ color: 0x1a1c20 }), 5.1, -2.35, -1.0));
  reg('speaker', g);
}

/* ---------------------------------------------------------------- boot */
function buildCamera(scene, onProgress) {
  PSCENE = scene;
  PROGRESS = onProgress;
  parts.clear();

  const order = [
    'front', 'rear', 'top', 'grip', 'bottom', 'mount', 'contacts', 'screen',
    'modeDial', 'commandDial', 'shutterBtn', 'hotshoe', 'mic', 'recBtn', 'buttons', 'ports',
    'chassis', 'shutterUnit', 'sensor', 'olpf', 'board', 'shield', 'battery', 'sdcard', 'antenna', 'speaker',
  ];
  const builders = {
    front: buildFront, rear: buildRear, top: buildTop, grip: buildGrip, bottom: buildBottom,
    mount: buildMount, contacts: buildContacts, screen: buildScreen,
    modeDial: buildModeDial, commandDial: buildCommandDial, shutterBtn: buildShutterBtn,
    hotshoe: buildHotshoe, mic: buildMic, recBtn: buildRecBtn, buttons: buildButtons, ports: buildPorts,
    chassis: buildChassis, shutterUnit: buildShutterUnit, sensor: buildSensor, olpf: buildOlpf,
    board: buildBoard, shield: buildShield, battery: buildBattery, sdcard: buildSdCard,
    antenna: buildAntenna, speaker: buildSpeaker,
  };
  order.forEach((id) => builders[id]());
  buildLensSet(LENSES[0]);
  return parts;
}
