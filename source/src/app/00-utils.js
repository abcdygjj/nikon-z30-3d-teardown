/* =========================================================================
   Nikon Z30 — interactive exploded view
   00 · helpers, procedural textures, materials
   ========================================================================= */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------------- geometry ---------------- */
function roundedRectPath(w, h, r, cx = 0, cy = 0, PathClass = THREE.Shape) {
  const p = new PathClass();
  const x = w / 2, y = h / 2;
  r = Math.min(r, x, y);
  p.moveTo(cx - x + r, cy - y);
  p.lineTo(cx + x - r, cy - y);
  p.quadraticCurveTo(cx + x, cy - y, cx + x, cy - y + r);
  p.lineTo(cx + x, cy + y - r);
  p.quadraticCurveTo(cx + x, cy + y, cx + x - r, cy + y);
  p.lineTo(cx - x + r, cy + y);
  p.quadraticCurveTo(cx - x, cy + y, cx - x, cy + y - r);
  p.lineTo(cx - x, cy - y + r);
  p.quadraticCurveTo(cx - x, cy - y, cx - x + r, cy - y);
  p.closePath();
  return p;
}

/** A box with every edge rounded (extruded rounded rect + bevel). */
function roundedBox(w, h, d, r = 0.15, seg = 3) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const shape = roundedRectPath(w - 2 * r, h - 2 * r, 0.0001);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - 2 * r),
    bevelEnabled: true,
    bevelSize: r,
    bevelThickness: r,
    bevelSegments: seg,
    curveSegments: 10,
    steps: 1,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function cyl(rTop, rBot, h, seg = 64, open = false) {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
}

/** cylinder whose axis runs along Z (for lens barrels, mounts, rings) */
function zcyl(rTop, rBot, h, seg = 64, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}

/** real ribbed/knurled ring along Z: displaces vertices so light catches each rib */
function ribbedCylinder(rTop, rBot, h, teeth = 48, amp = 0.02, seg = 256) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-5) continue;
    const a = Math.atan2(z, x);
    const s = (rr + Math.cos(a * teeth) * amp) / rr;
    pos.setX(i, x * s);
    pos.setZ(i, z * s);
  }
  g.computeVertexNormals();
  g.rotateX(Math.PI / 2);
  return g;
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** thin text decal facing +Z */
function decal(tex, w, h, x, y, z, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false })
  );
  m.position.set(x, y, z);
  m.renderOrder = 3;
  return m;
}

/* ---------------- procedural textures ---------------- */
function makeTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  return t;
}

const leatherTex = makeTex(512, 512, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 0.4 + Math.random() * 2.2;
    const v = 90 + Math.random() * 90 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.globalAlpha = 0.16;
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * h;
    g.strokeStyle = '#5a5a5a'; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }
  g.globalAlpha = 1;
}, { repeat: [7, 7], srgb: false });

const knurlTex = makeTex(1024, 64, (g, w, h) => {
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, h);
  const n = 72;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * w;
    g.fillStyle = i % 2 ? '#e6e6e6' : '#2a2a2a';
    g.fillRect(x, 0, w / n / 2, h);
  }
}, { repeat: [1, 1], srgb: false });

/* fine moulded-plastic "orange peel" — used as micro bump + roughness variation */
const peelTex = makeTex(512, 512, (g, w, h) => {
  g.fillStyle = '#8e8e8e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 0.4 + Math.random() * 1.2;
    const v = 118 + Math.random() * 46 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
}, { repeat: [9, 9], srgb: false });

/* bead-blast texture for the lens rings / rubber */
const grainTex = makeTex(512, 512, (g, w, h) => {
  g.fillStyle = '#909090'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 24000; i++) {
    const v = 70 + Math.random() * 120 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
  }
}, { repeat: [6, 6], srgb: false });

const pcbTex = makeTex(1024, 1024, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#0b3527'); grd.addColorStop(1, '#062419');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  // traces
  g.lineCap = 'round';
  for (let i = 0; i < 190; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    g.strokeStyle = Math.random() > 0.25 ? 'rgba(40,120,90,.55)' : 'rgba(190,150,70,.5)';
    g.lineWidth = Math.random() > 0.85 ? 3 : 1.4;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      if (Math.random() > 0.5) x += (Math.random() - 0.5) * 220; else y += (Math.random() - 0.5) * 220;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // pads
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(205,170,80,.75)' : 'rgba(120,140,120,.45)';
    g.beginPath(); g.arc(x, y, 2 + Math.random() * 4, 0, TAU); g.fill();
  }
  // silkscreen marks
  g.fillStyle = 'rgba(220,230,220,.65)';
  g.font = '600 20px "Segoe UI", sans-serif';
  g.fillText('NIKON  Z30  MAIN PCB', 40, 70);
  g.font = '500 15px "Segoe UI", sans-serif';
  g.fillText('EXPEED 6 · 2090万像素 · APS-C', 40, 98);
});

const screenTex = makeTex(1024, 640, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2b4a63'); sky.addColorStop(0.45, '#7d8b7a');
  sky.addColorStop(0.55, '#5c5a45'); sky.addColorStop(1, '#23241e');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // distant hills
  g.fillStyle = 'rgba(30,42,36,.85)';
  g.beginPath(); g.moveTo(0, 380); g.bezierCurveTo(180, 300, 300, 390, 480, 350);
  g.bezierCurveTo(650, 315, 800, 380, 1024, 330); g.lineTo(1024, 640); g.lineTo(0, 640); g.fill();
  g.fillStyle = 'rgba(16,24,20,.92)';
  g.beginPath(); g.moveTo(0, 470); g.bezierCurveTo(250, 420, 420, 500, 620, 455);
  g.bezierCurveTo(800, 420, 900, 470, 1024, 450); g.lineTo(1024, 640); g.lineTo(0, 640); g.fill();
  // HUD
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
  const ax = 400, ay = 250, aw = 224, ah = 150;
  const c = 26;
  [[ax, ay], [ax + aw, ay], [ax, ay + ah], [ax + aw, ay + ah]].forEach(([x, y], i) => {
    g.beginPath();
    g.moveTo(x + (i % 2 ? -c : c), y); g.lineTo(x, y); g.lineTo(x, y + (i < 2 ? c : -c)); g.stroke();
  });
  g.fillStyle = 'rgba(255,255,255,.95)';
  g.font = '600 22px "Segoe UI", sans-serif';
  g.fillText('AF-C', 40, 52);
  g.fillText('[  209  ]', 40, 84);
  g.textAlign = 'right';
  g.fillText('1/250   F4.0   ISO 400', w - 40, 52);
  g.fillText('4K 30p', w - 40, 84);
  g.textAlign = 'center';
  g.font = '600 26px "Segoe UI", sans-serif';
  g.fillText('+ 0.3', w / 2, h - 34);
  g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 108);
  g.fillStyle = 'rgba(255,214,10,.95)';
  g.font = '700 20px "Segoe UI", sans-serif';
  g.fillText('AUTO', 40, 130);
});

const logoNikon = makeTex(1024, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#e9ebef';
  g.font = '800 152px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '6px';
  g.fillText('Nikon', w / 2, h / 2 + 6);
});
const badgeZ30 = makeTex(512, 160, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#dfe2e8';
  g.font = '600 92px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '10px';
  g.fillText('Z 30', w / 2, h / 2);
});
const batteryTex = makeTex(512, 512, (g, w, h) => {
  g.fillStyle = '#17181b'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#232529'; g.fillRect(0, 0, w, 90);
  g.fillStyle = '#ffd60a'; g.fillRect(0, 0, w, 8);
  g.fillStyle = '#e8ebf1'; g.font = '700 64px "Segoe UI", sans-serif'; g.fillText('EN-EL25', 34, 190);
  g.fillStyle = '#9aa1ad'; g.font = '500 30px "Segoe UI", sans-serif';
  g.fillText('7.6V  1120mAh  8.6Wh', 34, 250);
  g.fillText('Li-ion Battery Pack', 34, 292);
  g.fillStyle = '#6b7280'; g.font = '600 24px "Segoe UI", sans-serif';
  g.fillText('Nikon Corporation · Made in China', 34, 430);
  g.strokeStyle = '#3a3d42'; g.lineWidth = 4; g.strokeRect(20, 20, w - 40, h - 40);
});
const expeedTex = makeTex(256, 256, (g, w, h) => {
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2a2c31'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#d8dce2'; g.textAlign = 'center';
  g.font = '700 46px "Segoe UI", sans-serif';
  g.fillText('EXPEED', w / 2, 118);
  g.font = '800 72px "Segoe UI", sans-serif';
  g.fillText('6', w / 2, 196);
});
const lensRingTex = makeTex(2048, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(168,174,184,.9)';
  g.font = '600 38px "Segoe UI", sans-serif';
  g.textBaseline = 'middle';
  g.fillText('NIKKOR Z DX 16-50mm  1:3.5-6.3 VR', 90, h / 2);
  g.font = '500 28px "Segoe UI", sans-serif';
  g.fillStyle = 'rgba(140,146,156,.7)';
  g.fillText('Ø46', w - 220, h / 2);
});
const grilleTex = makeTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#0a0b0d';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.beginPath(); g.arc(8 + x * 16, 8 + y * 16, 4.2, 0, TAU); g.fill();
  }
});


/* pebbled rubber / leather — the Z30 grip and thumb rest */
const pebbleTex = makeTex(512, 512, (g, w, h) => {
  g.fillStyle = '#5e5e5e'; g.fillRect(0, 0, w, h);
  const s = 15;
  for (let row = -1; row < h / s + 2; row++) {
    for (let col = -1; col < w / s + 2; col++) {
      const ox = (row % 2) * s * 0.5;
      const x = col * s + ox + s * 0.5;
      const y = row * s + s * 0.5;
      const r = s * 0.48;
      const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.5, x, y, r);
      grd.addColorStop(0, '#d2d2d2');
      grd.addColorStop(0.6, '#9a9a9a');
      grd.addColorStop(1, '#2f2f2f');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  }
}, { repeat: [4, 4], srgb: false });

/* dark leather albedo to make the pebble pattern readable at distance */
const pebbleColorTex = makeTex(512, 512, (g, w, h) => {
  g.fillStyle = '#0d0e10'; g.fillRect(0, 0, w, h);
  const s = 15;
  for (let row = -1; row < h / s + 2; row++) {
    for (let col = -1; col < w / s + 2; col++) {
      const ox = (row % 2) * s * 0.5;
      const x = col * s + ox + s * 0.5;
      const y = row * s + s * 0.5;
      const r = s * 0.46;
      const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.5, x, y, r);
      grd.addColorStop(0, '#26272b');
      grd.addColorStop(0.65, '#191a1d');
      grd.addColorStop(1, '#08090b');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  }
}, { repeat: [3, 3] });

/* rubber with a fine, denser pebble for the thumb rest / port cover */
const finePebbleTex = makeTex(512, 512, (g, w, h) => {
  g.fillStyle = '#636363'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 2.6;
    const v = 70 + Math.random() * 120 | 0;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgb(${v + 50},${v + 50},${v + 50})`);
    grd.addColorStop(1, 'rgba(40,40,40,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
}, { repeat: [8, 8], srgb: false });

/* mode dial face: U1 U2 U3 AUTO P S A M (matches the reference photos) */
const modeDialTex = makeTex(512, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#111214';
  g.beginPath(); g.arc(w / 2, h / 2, 250, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 2;
  g.beginPath(); g.arc(w / 2, h / 2, 234, 0, TAU); g.stroke();
  const labels = ['U1', 'U2', 'U3', 'AUTO', 'P', 'S', 'A', 'M'];
  g.textAlign = 'center'; g.textBaseline = 'middle';
  labels.forEach((t, i) => {
    const a = -Math.PI / 2 + (i / labels.length) * TAU;
    g.save();
    g.translate(w / 2 + Math.cos(a) * 182, h / 2 + Math.sin(a) * 182);
    g.rotate(a + Math.PI / 2);
    const auto = t === 'AUTO';
    g.fillStyle = auto ? '#8fe36b' : 'rgba(236,239,244,.92)';
    g.font = auto ? '700 24px "Segoe UI", sans-serif' : '700 34px "Segoe UI", sans-serif';
    g.fillText(t, 0, 0);
    if (auto) {
      g.strokeStyle = 'rgba(143,227,107,.95)'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 40, 11, 0, TAU); g.stroke();
    }
    g.restore();
  });
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.beginPath(); g.moveTo(w / 2, 70); g.lineTo(w / 2 - 9, 48); g.lineTo(w / 2 + 9, 48); g.fill();
});

/* generic white icon / label decal */
function iconTex(text, opts = {}) {
  return makeTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = opts.color || 'rgba(232,236,242,.92)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (opts.shape === 'play') {
      g.beginPath(); g.moveTo(42, 30); g.lineTo(96, 64); g.lineTo(42, 98); g.closePath(); g.fill();
    } else if (opts.shape === 'trash') {
      g.fillRect(38, 38, 52, 58);
      g.clearRect(46, 30, 36, 10);
      g.fillStyle = opts.color || '#e8ecf2';
      g.fillRect(30, 26, 68, 9);
      g.fillStyle = '#141518';
      for (let i = 0; i < 3; i++) g.fillRect(48 + i * 14, 48, 6, 38);
    } else if (opts.shape === 'ok') {
      g.strokeStyle = opts.color || '#e8ecf2'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(34, 66); g.lineTo(56, 88); g.lineTo(96, 42); g.stroke();
    } else {
      g.font = opts.font || `700 ${opts.size || 34}px "Segoe UI", sans-serif`;
      g.fillText(text, w / 2, h / 2);
    }
  });
}

/* rubber port cover labels MIC / HDMI / USB */
const portLabelTex = makeTex(256, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(210,214,221,.8)';
  g.textAlign = 'center';
  g.font = '600 30px "Segoe UI", sans-serif';
  g.fillText('MIC', w / 2, 120);
  g.fillText('HDMI', w / 2, 260);
  g.fillText('USB', w / 2, 400);
  g.strokeStyle = 'rgba(210,214,221,.55)'; g.lineWidth = 3;
  g.strokeRect(60, 160, 136, 44);
  g.strokeRect(70, 300, 116, 40);
  g.beginPath(); g.arc(w / 2, 400, 26, 0, TAU); g.stroke();
});

/* battery / card door label */
const doorLabelTex = makeTex(512, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(205,210,218,.72)';
  g.textAlign = 'center';
  g.font = '600 34px "Segoe UI", sans-serif';
  g.fillText('BATTERY', w / 2, 96);
  g.fillText('CARD', w / 2, 146);
  g.strokeStyle = 'rgba(205,210,218,.5)'; g.lineWidth = 3;
  g.strokeRect(w / 2 - 64, 170, 128, 54);
});

/* side Z 30 badge (stacked, as on the grip side) */
const badgeZ30Side = makeTex(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(238,241,246,.96)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 96px "Segoe UI", Arial, sans-serif';
  g.fillText('Z', w / 2, 92);
  g.font = '800 78px "Segoe UI", Arial, sans-serif';
  g.fillText('30', w / 2, 178);
});

/* holographic QC sticker */
const holoTex = makeTex(256, 256, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#3f5742'); grd.addColorStop(0.25, '#6f9478');
  grd.addColorStop(0.5, '#97a878'); grd.addColorStop(0.75, '#5f7f8f');
  grd.addColorStop(1, '#5f7f8f');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(20,40,30,.55)';
  g.font = '700 26px "Segoe UI", sans-serif';
  g.fillText('QC PASS', 34, 120);
  g.font = '500 20px "Segoe UI", sans-serif';
  g.fillText('NIKON', 34, 156);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
});

/* ---------------- Blender-baked maps ---------------- */
function bakedTex(uri, srgb, rep) {
  const t = new THREE.TextureLoader().load(uri);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
const BODY_NORMAL = bakedTex(BAKED.bodyNormal, false, 4);
const LEATHER_COLOR = bakedTex(BAKED.leatherColor, true, 1.05);
const LEATHER_NORMAL = bakedTex(BAKED.leatherNormal, false, 1.05);
const LEATHER_ROUGH = bakedTex(BAKED.leatherRough, false, 1.05);

/* ---------------- materials ---------------- */
const M = {
  plastic: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0x24262b, roughness: 0.52, metalness: 0.06,
    clearcoat: 0.4, clearcoatRoughness: 0.5, envMapIntensity: 1.1,
  }, o)),
  shell: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0x15171b, roughness: 0.58, metalness: 0.04,
    clearcoat: 0.14, clearcoatRoughness: 0.62, envMapIntensity: 0.9,
    normalMap: BODY_NORMAL, normalScale: new THREE.Vector2(0.9, 0.9),
  }, o)),
  leather: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0xffffff, map: LEATHER_COLOR, roughness: 0.95, roughnessMap: LEATHER_ROUGH,
    metalness: 0.0, normalMap: LEATHER_NORMAL, normalScale: new THREE.Vector2(0.9, 0.9),
    sheen: 0.0, sheenRoughness: 0.9, sheenColor: new THREE.Color(0x2a2d33),
    envMapIntensity: 0.55,
  }, o)),
  rubber: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0x121315, roughness: 0.92, metalness: 0.0,
    bumpMap: pebbleTex, bumpScale: 0.045, roughnessMap: pebbleTex, envMapIntensity: 0.55,
  }, o)),
  metal: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0x3c4046, roughness: 0.32, metalness: 0.95, envMapIntensity: 1.25,
  }, o)),
  chrome: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0xc9ced6, roughness: 0.14, metalness: 1.0, envMapIntensity: 1.4,
  }, o)),
  gold: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0xd8b25a, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.3,
  }, o)),
  glass: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0x122033, roughness: 0.06, metalness: 0.62, envMapIntensity: 2.6,
    clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.28,
    iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 520],
  }, o)),
  sensor: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0x16253c, roughness: 0.18, metalness: 0.72, envMapIntensity: 1.6,
    iridescence: 0.75, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 480],
  }, o)),
  flex: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0xc06a2a, roughness: 0.55, metalness: 0.2, clearcoat: 0.4,
  }, o)),
  pcb: (o = {}) => new THREE.MeshStandardMaterial(Object.assign({
    map: pcbTex, color: 0xffffff, roughness: 0.62, metalness: 0.25, envMapIntensity: 0.7,
  }, o)),
};
