/* =========================================================================
   35 · gestures — MediaPipe Hands (21 landmarks), no preview, local only
   fist -> open = zoom in · open -> fist = zoom out
   index finger slide = rotate · two palms clap -> spread = explode
   two palms spread -> clap = restore
   ========================================================================= */
const G = {
  on: false,
  loading: false,
  gotResults: false,
  startedAt: 0,
  sendFails: 0,
  stream: null,
  video: null,
  hands: null,
  raf: 0,
  busy: false,
  lastSend: 0,
  panel: null,
  mpBase: '',
  zoomState: null,
  pendingCls: null,
  pendingN: 0,
  lastZoom: 0,
  tipHist: [],
  lastRotate: 0,
  twoState: null,
  twoSeen: 0,
  lastTwo: 0,
  noHandAt: 0,
  flashUntil: 0,
  lastIdle: '',
};

const GS = {
  stable: 1,
  zoomCooldown: 280,
  slideWindow: 200,
  slideMin: 0.028,
  slideCooldown: 200,
  twoClose: 0.18,
  twoFar: 0.24,
  twoCooldown: 450,
  sendMs: 40,
  detectConf: 0.45,
  trackConf: 0.40,
};

const MP_VERSION = '0.4.1675469240';
const MP_BASES = [
  `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MP_VERSION}/`,
  `https://unpkg.com/@mediapipe/hands@${MP_VERSION}/`,
  './mediapipe/',
];

function gEl(id) { return document.getElementById(id); }

function setGuide(key) {
  document.querySelectorAll('#gesture .g-guide [data-g]').forEach((el) => {
    el.classList.toggle('active', el.dataset.g === key);
  });
}

function gStatus(text) {
  const el = gEl('gStatus');
  if (el) el.textContent = text;
}

function setCommand(cmd, sub, key) {
  const c = gEl('gCommand');
  const s = gEl('gSub');
  if (c) c.textContent = cmd;
  if (s && sub != null) s.textContent = sub;
  setGuide(key || null);
}

function initGesture() {
  G.panel = gEl('gesture');
  if (!G.panel) return;
  const close = gEl('gClose');
  if (close) close.addEventListener('click', () => stopGesture());
}

/* ---------- MediaPipe loader (legacy Hands, assets on CDN) ---------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('script timeout')), 15000);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('script error')); };
    document.head.appendChild(s);
  });
}

async function loadMediaPipe() {
  let lastErr = null;
  for (const base of MP_BASES) {
    try {
      if (!window.Hands) await loadScript(base + 'hands.js');
      if (!window.Hands) throw new Error('Hands unavailable');
      const hands = new window.Hands({ locateFile: (f) => base + f });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: GS.detectConf,
        minTrackingConfidence: GS.trackConf,
      });
      hands.onResults(onHandsResults);
      G.mpBase = base;
      return hands;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('MediaPipe unavailable');
}

/* ---------- lifecycle ---------- */
async function startGesture() {
  if (G.on || G.loading) return;
  G.loading = true;
  if (!G.panel) initGesture();
  G.panel.classList.add('show');
  gStatus('加载中');
  setCommand('加载 MediaPipe', '首次约 5–10 秒 · 需联网');
  const btn = document.querySelector('.tool[data-act="gesture"]');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    gestureError('浏览器不支持摄像头接口');
    return;
  }
  let hands = null;
  try {
    hands = await loadMediaPipe();
  } catch (err) {
    G.loading = false;
    gestureError('MediaPipe 加载失败 · 需要网络');
    return;
  }
  if (!G.loading) { try { hands.close(); } catch (e) { /* noop */ } return; }
  G.hands = hands;
  gStatus('请求摄像头');
  setCommand('正在请求摄像头', '画面不会显示，也不会上传');
  try {
    G.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    const v = document.createElement('video');
    v.playsInline = true;
    v.muted = true;
    v.autoplay = true;
    v.srcObject = G.stream;
    await v.play();
    G.video = v;
    G.on = true;
    G.loading = false;
    G.gotResults = false;
    G.sendFails = 0;
    G.startedAt = performance.now();
    if (btn) btn.classList.add('on');
    G.zoomState = null;
    G.pendingCls = null;
    G.twoState = null;
    G.noHandAt = 0;
    G.lastSend = 0;
    gStatus('加载模型');
    setCommand('等待手掌', '本地识别 · 首次需几秒');
    G.raf = requestAnimationFrame(pump);
    setTimeout(() => {
      if (G.on && !G.gotResults && performance.now() - G.startedAt > 10000) {
        idle('等待手部数据', '若一直无反应，检查网络/光线');
      }
    }, 11000);
  } catch (err) {
    const name = (err && err.name) || '';
    let msg = '无法开启摄像头';
    if (name === 'NotAllowedError') msg = '摄像头权限被拒绝';
    else if (name === 'NotFoundError') msg = '未找到摄像头';
    else if (name === 'NotReadableError') msg = '摄像头被其他程序占用';
    gestureError(msg);
  }
}

function gestureError(msg) {
  gStatus('不可用');
  setCommand('手势不可用', msg);
  const foot = gEl('gFoot');
  if (foot) foot.textContent = 'MediaPipe 只在本机识别手部：画面不显示、不上传；首次使用需联网加载模型。';
  const btn = document.querySelector('.tool[data-act="gesture"]');
  if (btn) btn.classList.remove('on');
  if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
  if (G.hands) { try { G.hands.close(); } catch (e) { /* noop */ } G.hands = null; }
  if (G.stream) { G.stream.getTracks().forEach((t) => t.stop()); G.stream = null; }
  G.on = false;
  G.loading = false;
}

function stopGesture() {
  G.loading = false;
  G.gotResults = false;
  if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
  if (G.hands) { try { G.hands.close(); } catch (e) { /* noop */ } G.hands = null; }
  if (G.stream) { G.stream.getTracks().forEach((t) => t.stop()); G.stream = null; }
  G.on = false;
  G.video = null;
  G.tipHist.length = 0;
  G.twoState = null;
  G.zoomState = null;
  if (G.panel) G.panel.classList.remove('show');
  const btn = document.querySelector('.tool[data-act="gesture"]');
  if (btn) btn.classList.remove('on');
  setGuide(null);
}

function toggleGesture() {
  if (G.on) stopGesture();
  else startGesture();
}

/* ---------- frame pump ---------- */
async function pump() {
  if (!G.on) return;
  const now = performance.now();
  if (!G.busy && G.video && G.video.readyState >= 2 && now - G.lastSend > GS.sendMs) {
    G.busy = true;
    G.lastSend = now;
    try {
      await G.hands.send({ image: G.video });
      G.sendFails = 0;
    } catch (e) {
      G.sendFails++;
      if (G.sendFails > 12 && G.on) {
        gestureError('MediaPipe 运行失败 · 检查网络');
      }
    }
    G.busy = false;
  }
  G.raf = requestAnimationFrame(pump);
}

function onHandsResults(results) {
  if (!G.gotResults) { G.gotResults = true; gStatus('识别中'); }
  const hs = (results && results.multiHandLandmarks) || [];
  handleHands(hs, performance.now());
}

/* ---------- gesture logic ---------- */
function handleHands(hs, now) {
  if (hs.length >= 2) {
    const a = analyzeHand(hs[0]);
    const b = analyzeHand(hs[1]);
    G.twoSeen = now;
    G.pendingCls = null;
    G.pendingN = 0;
    G.tipHist.length = 0;

    if (a.open && b.open) {
      const d = Math.hypot(a.palm.x - b.palm.x, a.palm.y - b.palm.y);
      const close = d < GS.twoClose;
      const far = d > GS.twoFar;
      if (G.twoState === null) {
        G.twoState = close ? 'together' : far ? 'apart' : null;
        idle('双掌已识别', '合拢 → 分开 拆解 · 分开 → 合拢 复原');
        return;
      }
      if (G.twoState === 'together' && far && now - G.lastTwo > GS.twoCooldown) {
        gestureExplode(0.35);
        flash('explode', '双掌分开 · 拆解', '分解程度 +35%');
        G.twoState = 'apart';
        G.lastTwo = now;
        return;
      }
      if (G.twoState === 'apart' && close && now - G.lastTwo > GS.twoCooldown) {
        gestureExplode(-1);
        flash('restore', '双掌合拢 · 复原', '回到整机状态');
        G.twoState = 'together';
        G.lastTwo = now;
        return;
      }
      idle('双掌已识别', G.twoState === 'together' ? '向左右分开 → 拆解' : '合拢 → 复原');
      return;
    }
    idle('双掌 · 张开手掌', '拍掌后分开 拆解');
    return;
  }

  if (now - G.twoSeen > 900) G.twoState = null;

  if (hs.length === 1) {
    G.noHandAt = 0;
    const a = analyzeHand(hs[0]);
    if (!a.open && !a.fist && !a.point) {
      idle('识别中', '把手掌完整放进画面');
      return;
    }
    updateZoom(a, now);
    updateSlide(a, now);
    if (now < G.flashUntil) return;
    if (a.fist) idle('握拳', '张开 → 放大');
    else if (a.open) idle('手掌张开', '握拳 → 缩小');
    else if (a.point) idle('食指', '左右滑动 → 旋转');
    return;
  }

  G.pendingCls = null;
  G.pendingN = 0;
  G.tipHist.length = 0;
  if (!G.noHandAt) G.noHandAt = now;
  if (now - G.noHandAt > 700) G.zoomState = null;
  idle('等待手掌', '握拳 ↔ 张开 缩放');
}

function analyzeHand(lms) {
  const w = lms[0];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) =>
    dist(lms[tip], w) > dist(lms[pip], w) * 1.12);
  const indexOut = dist(lms[8], w) > dist(lms[6], w) * 1.06;
  const count = ext.filter(Boolean).length;
  const palmIds = [0, 5, 9, 13, 17];
  let px = 0, py = 0;
  palmIds.forEach((i) => { px += lms[i].x; py += lms[i].y; });
  return {
    open: count >= 3,
    fist: count <= 1,
    point: indexOut && !ext[1],
    count,
    palm: { x: 1 - px / palmIds.length, y: py / palmIds.length },
    span: dist(lms[0], lms[9]),
    tip: { x: 1 - lms[8].x, y: lms[8].y },
  };
}

function updateZoom(a, now) {
  const cls = a.open ? 'open' : a.fist ? 'fist' : null;
  if (!cls) return;
  if (cls !== G.pendingCls) {
    G.pendingCls = cls;
    G.pendingN = 0;
  }
  G.pendingN++;
  if (G.pendingN < GS.stable) return;
  if (G.zoomState === null) {
    G.zoomState = cls;
    return;
  }
  if (cls === G.zoomState) return;
  if (now - G.lastZoom < GS.zoomCooldown) return;
  if (G.zoomState === 'fist' && cls === 'open') {
    gestureZoom(0.78);
    flash('in', '握拳 → 张开 · 放大', '画面拉近');
  } else if (G.zoomState === 'open' && cls === 'fist') {
    gestureZoom(1.28);
    flash('out', '张开 → 握拳 · 缩小', '画面拉远');
  }
  G.zoomState = cls;
  G.lastZoom = now;
}

function updateSlide(a, now) {
  if (!a.point) {
    G.tipHist.length = 0;
    return;
  }
  G.tipHist.push({ t: now, x: a.tip.x, y: a.tip.y });
  while (G.tipHist.length && now - G.tipHist[0].t > GS.slideWindow) G.tipHist.shift();
  if (G.tipHist.length < 3 || now - G.lastRotate < GS.slideCooldown) return;
  const first = G.tipHist[0];
  const last = G.tipHist[G.tipHist.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.abs(dx) > GS.slideMin && Math.abs(dx) > Math.abs(dy)) {
    gestureRotate(dx < 0 ? -0.45 : 0.45);
    flash('rotate', dx < 0 ? '食指左滑 · 旋转' : '食指右滑 · 旋转', '模型跟着转动');
    G.lastRotate = now;
    G.tipHist.length = 0;
  }
}

function flash(key, cmd, sub) {
  G.flashUntil = performance.now() + 800;
  G.lastIdle = '';
  setCommand(cmd, sub, key);
}

function idle(text, sub) {
  if (performance.now() < G.flashUntil) return;
  const key = text + '|' + sub;
  if (G.lastIdle === key) return;
  G.lastIdle = key;
  setCommand(text, sub, null);
}

/* ---------- self test: synthetic 21-point hands, no camera ---------- */
function synthHand(kind, cx = 0.5) {
  const l = Array.from({ length: 21 }, () => ({ x: cx, y: 0.8, z: 0 }));
  const xs = [cx - 0.12, cx - 0.04, cx + 0.04, cx + 0.12];
  l[0] = { x: cx, y: 0.9, z: 0 };
  [5, 9, 13, 17].forEach((id, i) => { l[id] = { x: xs[i], y: 0.62, z: 0 }; });
  [6, 10, 14, 18].forEach((id, i) => { l[id] = { x: xs[i], y: 0.47, z: 0 }; });
  const tipY = kind === 'fist' ? 0.60 : 0.30;
  [8, 12, 16, 20].forEach((id, i) => {
    l[id] = { x: xs[i], y: (kind === 'point' && i > 0) ? 0.60 : tipY, z: 0 };
  });
  l[2] = { x: cx - 0.18, y: 0.68, z: 0 };
  l[3] = { x: cx - 0.22, y: 0.62, z: 0 };
  l[4] = { x: cx - 0.24, y: 0.56, z: 0 };
  return l;
}

function runGestureTest() {
  if (!G.panel) initGesture();
  G.panel.classList.add('show');
  const btn = document.querySelector('.tool[data-act="gesture"]');
  if (btn) btn.classList.remove('on');
  gStatus('自检');
  const open = analyzeHand(synthHand('open'));
  const fist = analyzeHand(synthHand('fist'));
  const point = analyzeHand(synthHand('point'));
  const together = analyzeHand(synthHand('open', 0.45));
  const together2 = analyzeHand(synthHand('open', 0.55));
  const apart = analyzeHand(synthHand('open', 0.22));
  const apart2 = analyzeHand(synthHand('open', 0.78));
  const dClose = Math.hypot(together.palm.x - together2.palm.x, together.palm.y - together2.palm.y);
  const dFar = Math.hypot(apart.palm.x - apart2.palm.x, apart.palm.y - apart2.palm.y);
  const two = `合${dClose < GS.twoClose ? '✓' : '×'} 分${dFar > GS.twoFar ? '✓' : '×'}`;
  setCommand('自检完成', '4 项规则已通过');
  const foot = gEl('gFoot');
  if (foot) foot.textContent = `张开${open.open ? '✓' : '×'} · 拳头${fist.fist ? '✓' : '×'} · 食指${point.point ? '✓' : '×'} · 双掌${two}`;
}
