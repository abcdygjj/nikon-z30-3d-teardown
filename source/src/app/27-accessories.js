/* =========================================================================
   27 · accessories — hot-shoe flash and shotgun mic, mountable / removable
   ========================================================================= */
const ACC_IDS = ['flash', 'topmic'];
let ACTIVE_ACC = 'none';

function disposeAccessory() {
  ACC_IDS.forEach((id) => {
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

function buildAccessory(id) {
  if (id === 'flash') buildFlash();
  else if (id === 'topmic') buildTopMic();
  ACTIVE_ACC = id;
}

/* ---------------- speedlight ---------------- */
function buildFlash() {
  const g = new THREE.Group();
  const cx = 0.55, cz = -0.2;
  const bodyMat = M.plastic({
    color: 0x131417, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.4,
    bumpMap: peelTex, bumpScale: 0.003,
  });
  const metal = M.metal({ color: 0x35393f, roughness: 0.28 });

  // hot-shoe foot
  g.add(mesh(roundedBox(2.15, 0.16, 1.7, 0.06), metal, cx, 3.9, cz));
  g.add(mesh(roundedBox(2.35, 0.08, 0.5, 0.03), metal, cx, 3.96, cz - 0.55));
  // lock wheel
  const wheel = mesh(cyl(0.42, 0.42, 0.22, 40), M.metal({ color: 0x555a61, roughness: 0.35 }),
    cx, 4.05, cz);
  g.add(wheel);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    g.add(mesh(roundedBox(0.08, 0.1, 0.12, 0.02), metal,
      cx + Math.cos(a) * 0.43, 4.02, cz + Math.sin(a) * 0.43).rotateY(-a));
  }

  // neck between foot and body
  g.add(mesh(roundedBox(2.4, 0.6, 2.0, 0.12), bodyMat, cx, 4.12, cz));
  // body
  g.add(mesh(roundedBox(3.4, 4.5, 2.8, 0.32, 4), bodyMat, cx, 6.45, cz));
  // neck
  g.add(mesh(roundedBox(2.0, 1.4, 1.9, 0.2), bodyMat, cx, 8.75, cz));
  // head (tilted slightly up)
  const head = new THREE.Group();
  head.position.set(cx, 9.85, cz);
  head.rotation.x = -0.1;
  head.add(mesh(roundedBox(4.1, 2.7, 2.8, 0.28, 4), bodyMat, 0, 0, 0));
  head.add(mesh(roundedBox(3.5, 2.1, 0.1, 0.12), M.plastic({ color: 0x0b0c0e, roughness: 0.7 }),
    0, 0, 1.4));
  const fresnel = makeTex(512, 320, (gg, w, h) => {
    gg.fillStyle = '#d9d4c4'; gg.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) {
      gg.fillStyle = 'rgba(120,116,104,.28)'; gg.fillRect(x, 0, 4, h);
    }
    gg.strokeStyle = 'rgba(255,255,255,.5)'; gg.lineWidth = 6;
    gg.strokeRect(4, 4, w - 8, h - 8);
  });
  head.add(mesh(new THREE.PlaneGeometry(3.2, 1.85),
    new THREE.MeshPhysicalMaterial({
      map: fresnel, color: 0x8e8c84, roughness: 0.3, metalness: 0.08,
      emissive: 0x121008, emissiveIntensity: 0.12,
    }), 0, 0, 1.455));
  g.add(head);

  // rear LCD
  const lcd = makeTex(320, 200, (gg, w, h) => {
    gg.fillStyle = '#0a1018'; gg.fillRect(0, 0, w, h);
    gg.fillStyle = '#7fb4e8'; gg.font = '700 34px "Segoe UI", sans-serif';
    gg.fillText('TTL', 18, 46);
    gg.fillText('1/1', 18, 96);
    gg.fillStyle = '#3b5a78'; gg.fillRect(18, 120, 250, 14);
    gg.fillStyle = '#7fb4e8'; gg.fillRect(18, 120, 170, 14);
    gg.font = '500 22px "Segoe UI", sans-serif';
    gg.fillText('24mm', 18, 170);
    gg.textAlign = 'right'; gg.fillText('ZOOM', w - 18, 170);
  });
  const screen = mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshBasicMaterial({ map: lcd, toneMapped: false }),
    cx, 7.0, cz - 1.41);
  screen.rotation.y = Math.PI;
  g.add(screen);
  g.add(mesh(roundedBox(1.75, 1.15, 0.08, 0.05), bodyMat, cx, 7.0, cz - 1.38));

  // buttons
  for (let i = 0; i < 3; i++) {
    g.add(mesh(roundedBox(0.45, 0.2, 0.12, 0.05), M.plastic({ color: 0x25272c, roughness: 0.45 }),
      cx - 0.55 + i * 0.55, 6.05, cz - 1.38));
  }
  // AF assist lamp
  g.add(mesh(new THREE.CircleGeometry(0.16, 24),
    new THREE.MeshBasicMaterial({ color: 0x7a1f18 }), cx, 5.55, cz + 1.42));
  // brand decal
  g.add(decal(makeTex(512, 128, (gg, w, h) => {
    gg.clearRect(0, 0, w, h);
    gg.fillStyle = 'rgba(220,224,230,.85)';
    gg.font = '700 54px "Segoe UI", sans-serif';
    gg.textBaseline = 'middle';
    gg.fillText('SB-500', 10, h / 2);
  }), 1.25, 0.31, cx, 8.0, cz + 1.42));

  // gold contacts under the foot
  for (let i = 0; i < 4; i++) {
    g.add(mesh(roundedBox(0.16, 0.03, 0.1, 0.01), M.gold(), cx - 0.45 + i * 0.3, 3.81, cz + 0.3));
  }

  reg('flash', g, { center: true, dir: [0, 1, 0], dist: 6.5, delay: 0.6 });
}

/* ---------------- shotgun mic ---------------- */
function buildTopMic() {
  const g = new THREE.Group();
  const cx = 0.55, cz = -0.2;
  const bodyMat = M.plastic({ color: 0x15161a, roughness: 0.5, clearcoat: 0.2 });
  const metal = M.metal({ color: 0x3b3f45, roughness: 0.3 });

  // shoe adapter
  g.add(mesh(roundedBox(2.15, 0.16, 1.7, 0.06), metal, cx, 3.9, cz));
  g.add(mesh(roundedBox(0.42, 1.25, 0.42, 0.08), metal, cx, 4.6, cz));
  // cradle
  g.add(mesh(roundedBox(1.6, 0.22, 1.2, 0.08), metal, cx, 5.2, cz));
  [-1, 1].forEach((s) => {
    g.add(mesh(roundedBox(0.14, 0.9, 0.14, 0.04), metal, cx + s * 0.62, 5.55, cz));
  });

  // mic body along Z
  const micZ = 1.9;
  g.add(mesh(zcyl(0.92, 0.92, 7.2, 64), bodyMat, cx, 6.05, micZ));
  g.add(mesh(zcyl(0.96, 0.96, 0.18, 64), metal, cx, 6.05, micZ - 3.55));
  // grille section + foam windscreen
  const grille = makeTex(256, 128, (gg, w, h) => {
    gg.fillStyle = '#1a1c20'; gg.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      gg.fillStyle = 'rgba(120,126,136,.55)';
      gg.beginPath(); gg.arc(x + 4, y + 4, 2.2, 0, TAU); gg.fill();
    }
  }, { repeat: [4, 1] });
  g.add(mesh(zcyl(0.94, 0.94, 1.5, 64), new THREE.MeshPhysicalMaterial({
    map: grille, roughness: 0.55, metalness: 0.4,
  }), cx, 6.05, micZ + 3.9));
  const foam = new THREE.MeshPhysicalMaterial({ color: 0x2b2e34, roughness: 1.0, metalness: 0.0 });
  g.add(mesh(zcyl(1.0, 0.96, 1.9, 64), foam, cx, 6.05, micZ + 5.35));
  const cap = mesh(new THREE.SphereGeometry(1.0, 48, 24, 0, TAU, 0, Math.PI / 2), foam,
    cx, 6.05, micZ + 6.3);
  cap.rotation.x = Math.PI / 2;
  cap.scale.y = 0.7;
  g.add(cap);

  // shock mount rings
  [0.2, 4.3].forEach((dz) => {
    g.add(mesh(new THREE.TorusGeometry(1.02, 0.07, 10, 40), M.rubber({ color: 0x0e0f11 }),
      cx, 6.05, micZ + dz).rotateY(0));
    g.add(mesh(roundedBox(0.1, 1.25, 0.1, 0.04), M.rubber({ color: 0x0e0f11 }),
      cx + 0.72, 5.5, micZ + dz));
  });

  // cable to the mic jack
  const pts = [
    new THREE.Vector3(cx, 6.05, micZ - 3.7),
    new THREE.Vector3(cx + 2.4, 5.5, micZ - 4.1),
    new THREE.Vector3(5.0, 2.6, -2.4),
    new THREE.Vector3(6.35, 0.4, -0.9),
    new THREE.Vector3(6.02, -0.95, 0.5),
  ];
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 72, 0.075, 8, false),
    M.rubber({ color: 0x0d0e10, roughness: 0.85 })
  );
  cable.castShadow = true;
  g.add(cable);
  // 3.5mm plug
  const plug = mesh(zcyl(0.16, 0.16, 0.55, 20), metal, 6.02, -0.95, 0.5);
  plug.rotation.x = 0;
  g.add(plug);

  reg('topmic', g, { center: true, dir: [0, 1, 0], dist: 7, delay: 0.62 });
}
