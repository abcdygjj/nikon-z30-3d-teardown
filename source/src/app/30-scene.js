/* =========================================================================
   30 · scene, camera, lighting, interaction, exploded-view engine
   ========================================================================= */
const parts = new Map();
const LENS_DETACH = 5.6;

const state = {
  step: 0,
  selected: null,
  hovered: null,
  explode: 0,
  explodeTarget: 0,
  lens: 0,
  lensTarget: 0,
  park: 0,
  parkTarget: 0,
  swapZ: 0,
  accY: 0,
  pendingSelect: null,
  solo: null,
  soloT: 0,
  soloOffset: new THREE.Vector3(),
  soloCenter: new THREE.Vector3(),
  soloSize: new THREE.Vector3(),
  returnState: null,
  xray: false,
  labels: true,
  spin: true,
  dragging: false,
  ready: false,
};

let renderer, scene, camera, clock;
let canvas, labelRoot, svgRoot;
let UI = null;
let onPartCount = null;

const cam = {
  theta: 0.59, phi: 1.27, radius: 30,
  target: new THREE.Vector3(0.4, -0.2, 1.2),
};
const goal = {
  theta: 0.59, phi: 1.27, radius: 30,
  target: new THREE.Vector3(0.4, -0.2, 1.2),
};

let equipSwap = null;

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let lastInteract = 0;

/* ---------------------------------------------------------------- env */
function studioEnvironment() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x0a0c10);

  const mk = (w, h, color, pos, look) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color[0], color[1], color[2]), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(...look);
    s.add(m);
  };
  // big soft top light
  mk(34, 24, [1.15, 1.18, 1.32], [0, 26, 2], [0, 0, 0]);
  // front-left strip
  mk(10, 26, [2.2, 2.3, 2.5], [-22, 8, 20], [0, 0, 0]);
  // big front fill behind the viewer
  mk(6, 16, [2.0, 2.05, 2.2], [-12, 7, 30], [0, 0, 0]);
  mk(10, 3, [1.1, 1.15, 1.25], [2, 15, 26], [0, 0, 0]);
  // right rim strip
  mk(6, 22, [1.5, 1.6, 1.9], [24, 6, -8], [0, 0, 0]);
  // back kicker
  mk(20, 10, [0.8, 1.0, 1.4], [0, 8, -26], [0, 0, 0]);
  // floor bounce
  mk(40, 40, [0.18, 0.19, 0.22], [0, -8, 0], [0, 0, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.035);
  pmrem.dispose();
  return rt.texture;
}

/* ---------------------------------------------------------------- setup */
function initScene() {
  canvas = $('#c');
  labelRoot = $('#labels');
  svgRoot = $('#leaders');

  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.environment = studioEnvironment();

  camera = new THREE.PerspectiveCamera(22, window.innerWidth / window.innerHeight, 0.1, 400);
  updateCameraFromOrbit(true);

  // lights
  const key = new THREE.DirectionalLight(0xfff2df, 3.15);
  key.position.set(11, 20, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26; key.shadow.camera.right = 26;
  key.shadow.camera.top = 26; key.shadow.camera.bottom = -26;
  key.shadow.camera.near = 1; key.shadow.camera.far = 80;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0xc4d6ee, 0.95);
  fill.position.set(-18, 8, 14);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xd6e4ff, 2.7);
  rim.position.set(-6, 10, -18);
  scene.add(rim);

  const front = new THREE.DirectionalLight(0xeaf0fa, 0.62);
  front.position.set(3, 4, 26);
  scene.add(front);

  scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x232529, 0.7));

  // shadow catcher
  const floorAlpha = makeTex(512, 512, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w / 2);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.5, '#c8c8c8');
    grd.addColorStop(0.82, '#3a3a3a');
    grd.addColorStop(1, '#000000');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { srgb: false });
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(36, 128),
    new THREE.MeshPhysicalMaterial({
      color: 0x161a21, roughness: 0.34, metalness: 0.45, envMapIntensity: 0.95,
      alphaMap: floorAlpha, transparent: true, depthWrite: false,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.16;
  floor.receiveShadow = true;
  floor.renderOrder = -2;
  scene.add(floor);

  // soft contact shadow
  const blobTex = makeTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(0,0,0,.78)');
    grd.addColorStop(0.45, 'rgba(0,0,0,.34)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 17),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0.5, -4.15, 2.2);
  blob.renderOrder = -1;
  scene.add(blob);

  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ opacity: 0.46 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -4.13;
  catcher.receiveShadow = true;
  scene.add(catcher);

  // cyberpunk stage: neon floor grid + rings + coloured rims
  const cyberGridTex = makeTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,240,255,.4)'; g.lineWidth = 1.4;
    const step = 32;
    for (let i = 0; i <= w; i += step) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
    g.strokeStyle = 'rgba(255,42,109,.22)'; g.lineWidth = 2.2;
    for (let i = 0; i <= w; i += step * 4) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
    g.globalCompositeOperation = 'destination-in';
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(0,0,0,.95)');
    grd.addColorStop(0.55, 'rgba(0,0,0,.5)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { srgb: false });
  const cyberGrid = new THREE.Mesh(
    new THREE.CircleGeometry(16.8, 96),
    new THREE.MeshBasicMaterial({
      map: cyberGridTex, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
  );
  cyberGrid.rotation.x = -Math.PI / 2;
  cyberGrid.position.y = -4.115;
  cyberGrid.renderOrder = -1;
  scene.add(cyberGrid);

  [[16.35, 0x00f0ff, 0.5], [16.55, 0x00f0ff, 0.18], [22.4, 0xff2a6d, 0.22]].forEach(([r, col, op]) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.055, 180),
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -4.11;
    scene.add(ring);
  });

  const cyanLight = new THREE.PointLight(0x00e5ff, 22, 55, 1.8);
  cyanLight.position.set(-14, 1.5, 10); scene.add(cyanLight);
  const magentaLight = new THREE.PointLight(0xff2a6d, 18, 50, 1.8);
  magentaLight.position.set(13, 3, -9); scene.add(magentaLight);

  const cyRim = new THREE.DirectionalLight(0x00e5ff, 0.9);
  cyRim.position.set(-18, 5, 10); scene.add(cyRim);
  const mgRim = new THREE.DirectionalLight(0xff2a6d, 0.65);
  mgRim.position.set(16, 3, -12); scene.add(mgRim);

  buildCamera(scene, (n) => { if (onPartCount) onPartCount(n); });

  bindInput();
  applyStep(0, true);
  syncTransforms();

  clock = new THREE.Clock();
  renderer.setAnimationLoop(tick);
  state.ready = true;
}

function resize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateCameraFromOrbit(instant = false) {
  const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
  camera.position.set(
    cam.target.x + cam.radius * sp * Math.sin(cam.theta),
    cam.target.y + cam.radius * cp,
    cam.target.z + cam.radius * sp * Math.cos(cam.theta)
  );
  camera.lookAt(cam.target);
  if (instant) camera.updateMatrixWorld();
}

/* ---------------------------------------------------------------- input */
function bindInput() {
  const dom = renderer.domElement;
  dom.addEventListener('contextmenu', (e) => e.preventDefault());

  let drag = null;
  const pts = new Map();

  dom.addEventListener('pointerdown', (e) => {
    dom.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = {
      id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
      t: performance.now(), moved: 0, pan: e.button === 2 || e.shiftKey,
    };
    state.dragging = false;
    lastInteract = performance.now();
  });

  dom.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (drag && drag.id === e.pointerId && pts.size === 1) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 4) state.dragging = true;
      if (drag.pan) {
        const s = goal.radius * 0.0017;
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        goal.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
      } else {
        goal.theta -= dx * 0.0055;
        goal.phi = clamp(goal.phi - dy * 0.0055, 0.18, 2.92);
      }
      lastInteract = performance.now();
    } else if (pts.size === 2 && drag) {
      const arr = [...pts.values()];
      const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      if (drag.pinch) {
        goal.radius = clamp(goal.radius * (drag.pinch / Math.max(1, d)), 7, 80);
        lastInteract = performance.now();
      }
      drag.pinch = d;
    }

    if (!drag) {
      const p = pick(e);
      setHover(p ? p.id : null, e.clientX, e.clientY);
    }
  });

  const end = (e) => {
    if (pts.has(e.pointerId)) pts.delete(e.pointerId);
    if (drag && drag.id === e.pointerId) {
      if (!state.dragging && performance.now() - drag.t < 700) {
        const p = pick(e);
        if (p) { selectPart(p.id, true); }
        else { selectPart(null, false); }
      }
      drag = null;
      state.dragging = false;
      if (pts.size < 2) drag = null;
    }
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);

  dom.addEventListener('wheel', (e) => {
    e.preventDefault();
    goal.radius = clamp(goal.radius * Math.exp(e.deltaY * 0.0011), 7, 80);
    lastInteract = performance.now();
  }, { passive: false });

  window.addEventListener('resize', resize);
}

function pick(e) {
  const r = canvas.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.partId) o = o.parent;
    if (o) return parts.get(o.userData.partId);
  }
  return null;
}

function setHover(id, x, y) {
  if (state.hovered === id) {
    if (id) positionTip(x, y);
    return;
  }
  const prev = state.hovered ? parts.get(state.hovered) : null;
  if (prev) paintPart(prev, state.selected === prev.id ? 1 : 0);
  state.hovered = id;
  const p = id ? parts.get(id) : null;
  if (p) paintPart(p, 1);
  renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
  const tip = $('#tip');
  if (p) {
    tip.textContent = `${String(p.info.no).padStart(2, '0')} · ${p.info.name}  ${p.info.en}`;
    tip.classList.add('show');
    positionTip(x, y);
  } else tip.classList.remove('show');
}
function positionTip(x, y) {
  const tip = $('#tip');
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

/* ---------------------------------------------------------------- parts */
function paintPart(p, v) {
  if (!p) return;
  p.mats.forEach((m) => {
    if (!m.emissive) return;
    if (v > 0) {
      m.emissive.setHex(0x0f2a4a);
      m.emissiveIntensity = 0.2 * v;
    } else if (m.userData.baseEmissive !== undefined) {
      m.emissive.setHex(m.userData.baseEmissive);
      m.emissiveIntensity = m.userData.baseEmissiveIntensity || 0;
    } else {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    }
  });
}

let BODY_CAP = false;
let bodyCapGroup = null;

const SOLO_BASE = 0.3;
const SOLO_EXTRA = 9.0;

const INTERNAL = new Set(['chassis', 'shutterUnit', 'sensor', 'olpf', 'board', 'shield',
  'battery', 'sdcard', 'antenna', 'speaker', 'contacts', 'lensAperture', 'lensSTM', 'lensVR', 'lensRear']);

function selectPart(id, focus = true) {
  if (id && PARTS[id] && PARTS[id].accessory && !parts.has(id)) {
    state.pendingSelect = id;
    setAccessory(id);
    return;
  }
  if (state.selected === id) {
    // clicking the same part again restores the whole-camera state
    if (state.solo === id) {
      restoreSolo();
      return;
    }
    if (id && focus) focusOn(parts.get(id));
    return;
  }
  const prev = state.selected ? parts.get(state.selected) : null;
  if (prev) paintPart(prev, state.hovered === prev.id ? 1 : 0);

  // leaving a solo part restores the whole-camera step
  if (!id && state.solo) {
    restoreSolo();
    return;
  }

  state.selected = id;
  const p = id ? parts.get(id) : null;
  if (p) {
    p.mats.forEach((m) => {
      if (!m.emissive) return;
      if (m.userData.baseEmissive === undefined) {
        m.userData.baseEmissive = m.emissive.getHex();
        m.userData.baseEmissiveIntensity = m.emissiveIntensity;
      }
    });
    paintPart(p, 1);
    if (focus) enterSolo(p);
  }
  if (UI) UI.onSelect(id);
  if (state.labels) updateLabels();
}

function restoreSolo() {
  const rs = state.returnState;
  state.selected = null;
  state.solo = null;
  state.soloT = 0;
  applyStep(state.step);
  if (rs) {
    state.explodeTarget = rs.explode;
    goal.theta = rs.theta;
    goal.phi = rs.phi;
    goal.radius = rs.radius;
    goal.target.copy(rs.target);
    state.lensTarget = rs.lens;
    state.parkTarget = rs.park;
    setExplodeTarget(rs.explode);
  }
  state.returnState = null;
  syncTransforms();
}

function partBounds(group) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const csum = new THREE.Vector3();
  let wsum = 0;
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    if (o.material && o.material.transparent && (o.material.opacity ?? 1) < 0.35) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
    const s = new THREE.Vector3();
    tmp.getSize(s);
    const area = s.x * s.y + s.y * s.z + s.z * s.x;
    const c = new THREE.Vector3();
    tmp.getCenter(c);
    csum.addScaledVector(c, area);
    wsum += area;
  });
  if (box.isEmpty()) {
    box.setFromObject(group);
    wsum = 0;
  }
  const center = new THREE.Vector3();
  if (wsum > 0) center.copy(csum).divideScalar(wsum);
  else box.getCenter(center);
  return { box, center };
}

function enterSolo(p) {
  if (!state.returnState) {
    state.returnState = {
      explode: state.explodeTarget,
      theta: goal.theta,
      phi: goal.phi,
      radius: goal.radius,
      target: goal.target.clone(),
      lens: state.lensTarget,
      park: state.parkTarget,
    };
  }
  state.solo = p.id;
  state.soloT = 0;
  setExplodeTarget(0);
  state.lensTarget = 0;
  state.parkTarget = 0;
  // show the complete camera, then pull this part out of it
  parts.forEach((q) => { q.group.visible = true; });
  paintPart(p, 1);

  // measure the part in world space, then float it toward the camera
  scene.updateMatrixWorld(true);
  const bounds = partBounds(p.group);
  const box = bounds.box;
  const c = bounds.center;
  const size = box.getSize(new THREE.Vector3());
  const toCam = camera.position.clone().sub(c);
  if (toCam.lengthSq() < 1e-6) toCam.set(0, 0, 1);
  toCam.normalize();
  const push = 4.5 + Math.max(size.x, size.y, size.z) * 0.85;
  state.soloOffset.copy(toCam).multiplyScalar(push);
  state.soloCenter.copy(c).add(state.soloOffset);
  state.soloSize.copy(size);

  focusOn(p);
  if (UI && UI.onSolo) UI.onSolo(p.info.name);
}

function focusOn(p) {
  const isSolo = state.solo === p.id;
  if (isSolo) {
    // center the part's bounding box and fit it with a margin
    goal.target.copy(state.soloCenter);
    goal.theta = cam.theta;
    goal.phi = clamp(cam.phi, 0.35, 2.55);
    const s = state.soloSize;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dv = (s.y / 2) / Math.tan(vFov / 2);
    const dh = (s.x / 2) / Math.tan(hFov / 2);
    const dd = (s.z / 2) / Math.tan(vFov / 2);
    goal.radius = clamp(Math.max(dv, dh, dd) * 1.45 + 2.2, 8, 46);
  } else {
    const w = p.baseLabel.clone().add(p.group.position);
    goal.target.copy(w);
    goal.radius = clamp(p.focusR, 6, 30);
    if (INTERNAL.has(p.id)) goal.radius = Math.max(goal.radius, 18);
    if (p.isLens) goal.radius = clamp(15 + activeLensProfile().len * 1.15, 16, 42);
    if (p.isAcc) goal.radius = Math.max(goal.radius, 24);
  }
  lastInteract = performance.now();
}

function setView(pos, target) {
  goal.target.set(target[0], target[1], target[2]);
  const dx = pos[0] - target[0], dy = pos[1] - target[1], dz = pos[2] - target[2];
  const r = Math.hypot(dx, dy, dz);
  goal.radius = r;
  goal.phi = Math.acos(clamp(dy / r, -1, 1));
  let th = Math.atan2(dx, dz);
  while (th - cam.theta > Math.PI) th -= TAU;
  while (th - cam.theta < -Math.PI) th += TAU;
  goal.theta = th;
  lastInteract = performance.now();
}

function snapCamera() {
  cam.theta = goal.theta; cam.phi = goal.phi; cam.radius = goal.radius;
  cam.target.copy(goal.target);
  updateCameraFromOrbit(true);
}

function finishSelection() {
  if (state.pendingSelect) {
    const id = state.pendingSelect;
    state.pendingSelect = null;
    selectPart(id, true);
  }
}



function setExplodeTarget(v) {
  state.explodeTarget = clamp(v, 0, 1);
  const range = $('#explodeRange');
  if (range) {
    range.value = Math.round(state.explodeTarget * 1000);
    const val = $('#explodeVal');
    if (val) val.textContent = Math.round(state.explodeTarget * 100) + '%';
  }
}

function gestureZoom(f) {
  goal.radius = clamp(goal.radius * f, 7, 80);
  lastInteract = performance.now();
}

function gestureRotate(d) {
  goal.theta += d;
  lastInteract = performance.now();
}

function gestureExplode(d) {
  setExplodeTarget(state.explodeTarget + d);
  lastInteract = performance.now();
}

function buildBodyCap() {
  const g = new THREE.Group();
  const capMat = M.plastic({ color: 0x0a0b0e, roughness: 0.62 });
  g.add(mesh(zcyl(3.16, 3.16, 0.32, 96, true), capMat, 0.95, 0.05, 2.73));
  g.add(mesh(new THREE.CircleGeometry(3.16, 96), capMat, 0.95, 0.05, 2.895));
  g.add(mesh(new THREE.RingGeometry(2.98, 3.16, 96),
    M.metal({ color: 0x3b3f45, roughness: 0.35 }), 0.95, 0.05, 2.9));
  g.add(decal(logoNikon, 1.45, 0.4, 0.95, 0.05, 2.905));
  g.add(mesh(roundedBox(0.55, 0.2, 0.16, 0.05), capMat, 0.95, 3.12, 2.74));
  bodyCapGroup = g;
  const mount = parts.get('mount');
  (mount ? mount.group : scene).add(g);
}

function setBodyCap(on) {
  BODY_CAP = !!on && ACTIVE_LENS === 'none';
  if (BODY_CAP && !bodyCapGroup) buildBodyCap();
  if (bodyCapGroup) bodyCapGroup.visible = BODY_CAP;
  const grp = $('#capPick');
  if (grp) {
    grp.classList.toggle('show', ACTIVE_LENS === 'none');
    grp.classList.toggle('cap-on', BODY_CAP);
    grp.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', (b.dataset.cap === 'on') === BODY_CAP);
    });
  }
}

function openMount(open) {
  const su = parts.get('shutterUnit');
  if (su) su.group.traverse((o) => { if (o.userData.shutterBlade) o.visible = !open; });
  const olpf = parts.get('olpf');
  if (olpf) olpf.group.visible = !open;
}

function changeLens(id) {
  const isNone = id === 'none';
  if (equipSwap || (!isNone && !LENSES.some((l) => l.id === id)) || id === ACTIVE_LENS) return;
  if (state.selected && (parts.get(state.selected) || {}).isLens) selectPart(null, false);
  const prevLen = ACTIVE_LENS === 'none' ? 0 : activeLensProfile().len;
  equipSwap = { kind: 'lens', next: id, phase: 'out', t0: performance.now() };
  setTimeout(() => {
    if (!equipSwap) return;
    if (isNone) {
      disposeLensSet();
      ACTIVE_LENS = 'none';
      state.lensTarget = 0;
      state.parkTarget = 0;
      state.swapZ = 0;
      openMount(true);
      syncTransforms();
      setBodyCap(false);
      goal.target.set(0.95, 0.05, 1.75);
      goal.radius = 15;
      goal.phi = 1.22;
      goal.theta = cam.theta;
      lastInteract = performance.now();
      if (UI) UI.onLens(NONE_LENS);
      setTimeout(() => { if (ACTIVE_LENS === 'none' && UI) UI.onLens(NONE_LENS); }, 1000);
    } else {
      rebuildLens(id);
      const nl = activeLensProfile();
      state.swapZ = 8;
      openMount(false);
      syncTransforms();
      setBodyCap(false);
      if (UI) UI.onLens(nl);
      if (state.step === 0 || state.step === 1 || state.step === 7) {
        applyStep(state.step);
        snapCamera();
      } else {
        goal.radius = clamp(goal.radius + (nl.len - prevLen) * 1.15, 18, 92);
      }
    }
    equipSwap.phase = 'in';
    equipSwap.t0 = performance.now();
  }, 430);
  setTimeout(() => {
    if (!equipSwap) return;
    equipSwap = null;
    state.swapZ = 0;
    syncTransforms();
  }, 900);
}

function setAccessory(id) {
  if (equipSwap || id === ACTIVE_ACC) return;
  if (state.selected && (parts.get(state.selected) || {}).isAcc) selectPart(null, false);
  equipSwap = { kind: 'acc', next: id, phase: 'out', t0: performance.now() };
  setTimeout(() => {
    if (!equipSwap) return;
    const next = equipSwap.next;
    disposeAccessory();
    if (next !== 'none') {
      buildAccessory(next);
      state.accY = 10;
      if (state.step === 0) { applyStep(0); snapCamera(); }
      else {
        goal.radius = clamp(goal.radius + 7, 18, 95);
        goal.target.y += 1.6;
      }
      equipSwap.phase = 'in';
      equipSwap.t0 = performance.now();
      syncTransforms();
    } else {
      ACTIVE_ACC = 'none';
      state.accY = 0;
      equipSwap = null;
      syncTransforms();
      finishSelection();
    }
    if (UI) UI.onAcc(ACTIVE_ACC);
  }, 430);
  setTimeout(() => {
    if (!equipSwap || equipSwap.kind !== 'acc') return;
    equipSwap = null;
    state.accY = 0;
    syncTransforms();
    if (UI) UI.onAcc();
    finishSelection();
  }, 900);
}

function applyStep(i, instant = false) {
  const s = STEPS[clamp(i, 0, STEPS.length - 1)];
  state.step = i;
  state.solo = null;
  state.soloT = 0;
  state.returnState = null;
  state.explodeTarget = s.explode;
  state.lensTarget = s.lens;
  state.parkTarget = s.park || 0;
  applyVisibility(s);
  const lp = activeLensProfile();
  if (s.id === 'overview') {
    const lensK = 1 + Math.max(0, lp.len - 3.45) * 0.05;
    const accK = parts.has('flash') ? 0.22 : parts.has('topmic') ? 0.1 : 0;
    const k = lensK + accK;
    const ty = -0.2 + (parts.has('flash') ? 2.4 : parts.has('topmic') ? 1.0 : 0);
    setView([16.8 * k, 10.5 * k, 39.9 * k], [0.4, ty, 1.2 + (lensK - 1) * 10]);
  } else if (s.id === 'lensoff') {
    const cz = 2.72 + lp.len * 0.5 + LENS_DETACH;
    setView([14 + lp.len * 0.9, 7, cz + 12], [0.8, 0.2, cz - 1]);
  } else if (s.id === 'lensinner') {
    const cz = 2.72 + lp.len * 0.55 + LENS_DETACH;
    const rr = 26 + lp.len * 1.2;
    setView([0.95 + rr, 8, cz], [0.95, -1.2, cz]);
  } else {
    setView(s.view.pos, s.view.target);
  }
  if (s.focus) {
    const p = parts.get(s.focus);
    if (p) {
      state.selected = s.focus;
      paintPart(p, 1);
      if (UI) UI.onSelect(s.focus);
    }
  } else {
    state.selected = null;
    if (UI) UI.onSelect(null);
  }
  if (instant) {
    state.explode = state.explodeTarget;
    state.lens = state.lensTarget;
    cam.theta = goal.theta; cam.phi = goal.phi; cam.radius = goal.radius;
    cam.target.copy(goal.target);
    syncTransforms();
    updateCameraFromOrbit(true);
  }
  if (UI) UI.onStep(i);
  if (state.labels) updateLabels();
}

/* ---------------------------------------------------------------- xray */
function applyVisibility(s) {
  parts.forEach((p) => {
    let vis = true;
    if (s.hideLens && p.isLens) vis = false;
    if (s.hideBody && !p.isLens) vis = false;
    if (s.only && !s.only.includes(p.id)) vis = false;
    p.group.visible = vis;
  });
}

function setXray(on) {
  state.xray = on;
  const shellIds = ['front', 'rear', 'top', 'grip', 'bottom'];
  shellIds.forEach((id) => {
    const p = parts.get(id);
    if (!p) return;
    p.group.visible = true;
    p.mats.forEach((m) => {
      if (m.userData.baseOpacity === undefined) {
        m.userData.baseOpacity = m.opacity;
        m.userData.baseTransparent = m.transparent;
      }
      if (on) {
        m.transparent = true;
        m.opacity = Math.min(m.userData.baseOpacity, 0.16);
        m.depthWrite = false;
      } else {
        m.transparent = m.userData.baseTransparent;
        m.opacity = m.userData.baseOpacity;
        m.depthWrite = !m.userData.baseTransparent;
      }
      m.needsUpdate = true;
    });
  });
}

/* ---------------------------------------------------------------- frame */
function syncTransforms() {
  for (const p of parts.values()) {
    const t = smooth((state.explode - p.delay) / 0.45);
    p.group.position.copy(p.dir).multiplyScalar(p.dist * t);
    if (p.isLens) {
      p.group.position.z += state.lens * LENS_DETACH + state.swapZ;
      p.group.position.x -= state.park * 13;
    }
    if (p.isAcc) p.group.position.y += state.accY;
    if (state.solo === p.id && state.soloT > 0.001) {
      p.group.position.addScaledVector(state.soloOffset, state.soloT);
    }
  }
}

let last = 0;
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now();

  if (state.explode !== state.explodeTarget) {
    state.explode = damp(state.explode, state.explodeTarget, 7, dt);
    if (Math.abs(state.explode - state.explodeTarget) < 0.001) state.explode = state.explodeTarget;
    syncTransforms();
  }
  if (state.lens !== state.lensTarget) {
    state.lens = damp(state.lens, state.lensTarget, 6, dt);
    if (Math.abs(state.lens - state.lensTarget) < 0.001) state.lens = state.lensTarget;
    syncTransforms();
  }
  if (equipSwap) {
    const el = clamp((performance.now() - equipSwap.t0) / 430, 0, 1);
    const e = smooth(el);
    if (equipSwap.kind === 'lens') state.swapZ = equipSwap.phase === 'out' ? 8 * e : 8 * (1 - e);
    else state.accY = equipSwap.phase === 'out' ? 10 * e : 10 * (1 - e);
    syncTransforms();
  }
  if (window.__dbgEl) {
    window.__dbgEl.textContent = `${ACTIVE_LENS} | ${equipSwap ? equipSwap.kind + ':' + equipSwap.phase : '-'} | swapZ=${state.swapZ.toFixed(1)} accY=${state.accY.toFixed(1)}`;
  }

  if (state.solo) {
    if (state.soloT < 0.999) {
      state.soloT = damp(state.soloT, 1, 9, dt);
      if (state.soloT > 0.999) state.soloT = 1;
      syncTransforms();
    }
  } else if (state.soloT > 0.001) {
    state.soloT = 0;
    syncTransforms();
  }

  if (state.park !== state.parkTarget) {
    state.park = damp(state.park, state.parkTarget, 5, dt);
    if (Math.abs(state.park - state.parkTarget) < 0.001) state.park = state.parkTarget;
    syncTransforms();
  }

  if (state.spin && now - lastInteract > 2600 && !dragActive()) {
    goal.theta += dt * 0.085;
  }

  cam.theta = damp(cam.theta, goal.theta, 5.2, dt);
  cam.phi = damp(cam.phi, goal.phi, 5.2, dt);
  cam.radius = damp(cam.radius, goal.radius, 5.2, dt);
  cam.target.x = damp(cam.target.x, goal.target.x, 6, dt);
  cam.target.y = damp(cam.target.y, goal.target.y, 6, dt);
  cam.target.z = damp(cam.target.z, goal.target.z, 6, dt);
  updateCameraFromOrbit();

  if (state.labels) updateLabels(now);
  renderer.render(scene, camera);
  last = now;
}

function dragActive() {
  return state.dragging;
}

/* ---------------------------------------------------------------- labels */
const labelMap = new Map();
const SVGNS = 'http://www.w3.org/2000/svg';

function makeLabel(id) {
  const p = parts.get(id);
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = `<span class="n">${String(p.info.no).padStart(2, '0')}</span><span class="t">${p.info.name}</span>`;
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  el.addEventListener('click', (e) => { e.stopPropagation(); selectPart(id, true); });
  labelRoot.appendChild(el);

  const line = document.createElementNS(SVGNS, 'line');
  const dot = document.createElementNS(SVGNS, 'circle');
  dot.setAttribute('r', '2.6');
  svgRoot.appendChild(line);
  svgRoot.appendChild(dot);
  const rec = { el, line, dot };
  labelMap.set(id, rec);
  return rec;
}

function activeLabelIds() {
  if (!state.labels) return [];
  const s = STEPS[state.step];
  const ids = new Set(s.labels || []);
  if (state.selected) ids.add(state.selected);
  if (state.hovered) ids.add(state.hovered);
  return [...ids].filter((id) => parts.has(id) && parts.get(id).group.visible).slice(0, 8);
}

function updateLabels() {
  const ids = activeLabelIds();
  const W = window.innerWidth, H = window.innerHeight;

  labelMap.forEach((rec, id) => {
    if (!ids.includes(id)) {
      rec.el.style.display = 'none';
      rec.line.style.display = 'none';
      rec.dot.style.display = 'none';
    }
  });

  const placed = [];
  const cx = W / 2, cy = H * 0.46;

  ids.forEach((id) => {
    const p = parts.get(id);
    const rec = labelMap.get(id) || makeLabel(id);
    const w = p.baseLabel.clone().add(p.group.position);
    const v = w.clone().project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.35 || Math.abs(v.y) > 1.3) {
      rec.el.style.display = 'none';
      rec.line.style.display = 'none';
      rec.dot.style.display = 'none';
      return;
    }
    const ax = (v.x * 0.5 + 0.5) * W;
    const ay = (-v.y * 0.5 + 0.5) * H;
    let dx = ax - cx, dy = ay - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    if (Math.abs(dx) < 0.25) dx = dx >= 0 ? 0.25 : -0.25;
    let lx = ax + dx * 88;
    let ly = ay + dy * 68;

    // keep labels clear of the side panels, dock and screen edges
    const padL = W > 1150 ? 362 : 96;
    const padR = W > 1150 ? 452 : 96;
    lx = clamp(lx, padL, W - padR);
    ly = clamp(ly, 110, H - 168);

    for (let k = 0; k < 6; k++) {
      const hit = placed.some((r) => Math.abs(r.x - lx) < r.w && Math.abs(r.y - ly) < 34);
      if (!hit) break;
      ly += ly > ay ? 36 : -36;
    }
    placed.push({ x: lx, y: ly, w: rec.el.offsetWidth * 0.5 + 8 });

    rec.el.style.display = 'flex';
    rec.el.style.left = lx + 'px';
    rec.el.style.top = ly + 'px';
    rec.el.classList.toggle('active', state.selected === id);

    const anchorX = clamp(ax, 0, W), anchorY = clamp(ay, 0, H);
    rec.line.style.display = 'block';
    rec.line.setAttribute('x1', anchorX);
    rec.line.setAttribute('y1', anchorY);
    rec.line.setAttribute('x2', lx);
    rec.line.setAttribute('y2', ly);
    rec.line.classList.toggle('active', state.selected === id);
    rec.dot.style.display = 'block';
    rec.dot.setAttribute('cx', anchorX);
    rec.dot.setAttribute('cy', anchorY);
    rec.dot.classList.toggle('active', state.selected === id);
  });
}
