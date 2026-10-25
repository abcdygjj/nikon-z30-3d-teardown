/* =========================================================================
   35 · hand gestures — one right hand, four swipe directions
   left = zoom in · right = zoom out · down = explode · up = rotate
   camera frames never leave this file: no preview, no upload, text only
   ========================================================================= */
const G = {
  on: false,
  stream: null,
  video: null,
  timer: null,
  proc: null,
  pctx: null,
  panel: null,
  path: [],
  swipe: [],
  lastSwipe: 0,
  flash: 0,
};
const GW = 160, GH = 120;
const SWIPE_MS = 300;
const SWIPE_MIN = 0.07;
const SWIPE_COOLDOWN = 420;

function gEl(id) { return document.getElementById(id); }

function setGuide(key) {
  document.querySelectorAll('#gesture .g-guide [data-g]').forEach((el) => {
    el.classList.toggle('active', el.dataset.g === key);
  });
  document.querySelectorAll('#gCompass i').forEach((el) => {
    el.classList.toggle('on', el.dataset.d === key);
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
  G.proc = document.createElement('canvas');
  G.proc.width = GW; G.proc.height = GH;
  G.pctx = G.proc.getContext('2d', { willReadFrequently: true });
  const close = gEl('gClose');
  if (close) close.addEventListener('click', () => stopGesture());
}

async function startGesture() {
  if (G.on) return;
  if (!G.panel) initGesture();
  G.panel.classList.add('show');
  gStatus('识别中');
  setCommand('正在请求摄像头', '画面不会显示，也不会上传');
  const btn = document.querySelector('.tool[data-act="gesture"]');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    gestureError('浏览器不支持摄像头接口');
    return;
  }
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
    if (btn) btn.classList.add('on');
    setCommand('等待右手', '右手入镜 · 挥动或画圈');
    G.timer = setInterval(processFrame, 33);
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
  setCommand('摄像头不可用', msg + ' · 请用 https 或 localhost 打开');
  const foot = gEl('gFoot');
  if (foot) foot.textContent = '摄像头只在本机识别手部：不显示画面、不上传、不保存。';
  const btn = document.querySelector('.tool[data-act="gesture"]');
  if (btn) btn.classList.remove('on');
  if (G.timer) { clearInterval(G.timer); G.timer = null; }
  if (G.stream) { G.stream.getTracks().forEach((t) => t.stop()); G.stream = null; }
  G.on = false;
}

function stopGesture() {
  if (G.timer) { clearInterval(G.timer); G.timer = null; }
  if (G.stream) { G.stream.getTracks().forEach((t) => t.stop()); G.stream = null; }
  G.on = false;
  G.video = null;
  G.path.length = 0;
  G.swipe.length = 0;
  if (G.panel) G.panel.classList.remove('show');
  const btn = document.querySelector('.tool[data-act="gesture"]');
  if (btn) btn.classList.remove('on');
  setGuide(null);
}

function toggleGesture() {
  if (G.on) stopGesture();
  else startGesture();
}

/* ---------- frame loop (30 fps) ---------- */
function processFrame() {
  const v = G.video;
  if (!v || v.readyState < 2) return;
  const p = G.pctx;
  p.save();
  p.translate(GW, 0); p.scale(-1, 1);
  p.drawImage(v, 0, 0, GW, GH);
  p.restore();
  const img = p.getImageData(0, 0, GW, GH);
  const mask = skinMask(img.data, GW, GH);
  const hands = findBlobs(mask, GW, GH);
  const hand = pickHand(hands, GW, GH);
  if (!hand) {
    G.path.length = 0;
    G.swipe.length = 0;
    setCommand('等待右手', '右手入镜 · 挥动或画圈');
    return;
  }
  trackHand(hand);
}

function trackHand(hand) {
  const now = performance.now();
  const x = hand.cx / GW, y = hand.cy / GH;
  G.path.push({ t: now, x, y });
  while (G.path.length && now - G.path[0].t > 650) G.path.shift();
  G.swipe.push({ t: now, x, y });
  while (G.swipe.length && now - G.swipe[0].t > 300) G.swipe.shift();

  // circle first: a loop must not be mistaken for a swipe
  const circ = detectCircle(G.path);
  if (circ) {
    const step = Math.max(-0.12, Math.min(0.12, circ.delta * 0.75));
    gestureRotate(step);
    setCommand('画圈 · 旋转', '继续画圈，模型跟着转', 'circle');
    G.lastSwipe = now;
    G.swipe.length = 0;
    return;
  }

  if (G.swipe.length < 2 || now - G.lastSwipe < SWIPE_COOLDOWN) return;
  const first = G.swipe[0], last = G.swipe[G.swipe.length - 1];
  const dir = dirOf(last.x - first.x, last.y - first.y);
  if (!dir) {
    setCommand('右手已识别', '左右挥放大/缩小 · 下挥拆解 · 画圈旋转');
    return;
  }
  G.lastSwipe = now;
  G.swipe.length = 0;
  if (dir === 'left') {
    gestureZoom(0.72);
    flashDir('left', '右手向左挥 · 放大', '放大中');
  } else if (dir === 'right') {
    gestureZoom(1.38);
    flashDir('right', '右手向右挥 · 缩小', '缩小中');
  } else if (dir === 'down') {
    gestureExplode(0.28);
    flashDir('down', '右手向下挥 · 拆解', '拆解中');
  }
}

function detectCircle(pts) {
  if (pts.length < 9) return null;
  const n = pts.length;
  const first = pts[0], last = pts[n - 1];
  const dur = (last.t - first.t) / 1000;
  if (dur < 0.35) return null;
  // path length vs net displacement: a loop comes back near its start
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const net = Math.hypot(last.x - first.x, last.y - first.y);
  if (len < 0.15 || net / len > 0.55) return null;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  const rs = [], as = [];
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy;
    rs.push(Math.hypot(dx, dy));
    as.push(Math.atan2(dy, dx));
  }
  const meanR = rs.reduce((a, b) => a + b, 0) / n;
  if (meanR < 0.05) return null;
  const sd = Math.sqrt(rs.reduce((a, r) => a + (r - meanR) * (r - meanR), 0) / n);
  if (sd / meanR > 0.4) return null;
  let sum = 0, lastDelta = 0;
  for (let i = 1; i < n; i++) {
    let d = as[i] - as[i - 1];
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    sum += d;
    lastDelta = d;
  }
  if (Math.abs(sum) < 1.1) return null;
  if (Math.abs(lastDelta) < 0.004) return null;
  return { delta: lastDelta, sum, cv: sd / meanR };
}

function dirOf(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax > ay && ax > SWIPE_MIN) return dx < 0 ? 'left' : 'right';
  if (ay > ax && ay > SWIPE_MIN) return dy > 0 ? 'down' : null;
  return null;
}

function flashDir(dir, cmd, sub) {
  setCommand(cmd, sub, dir);
  G.flash = performance.now();
  setTimeout(() => {
    if (performance.now() - G.flash > 450) {
      setGuide(null);
      if (G.on) setCommand('等待右手', '右手入镜 · 挥动或画圈');
    }
  }, 620);
}

/* ---------- image analysis ---------- */
function skinMask(data, w, h) {
  const m = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (y > 42 && cb > 72 && cb < 134 && cr > 132 && cr < 181 && r > g && r > b) m[p] = 1;
  }
  return m;
}

function findBlobs(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const blobs = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    seen[i] = 1;
    let area = 0, sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      area++; sx += x; sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    if (area > w * h * 0.0035) {
      blobs.push({ area, cx: sx / area, cy: sy / area, minX, maxX, minY, maxY });
    }
  }
  return blobs.sort((a, b) => b.area - a.area);
}

function pickHand(blobs, w, h) {
  let list = blobs.slice();
  // drop a face-like blob: large, oval, in the upper half
  if (list.length >= 2) {
    const upper = list.slice().sort((a, b) => a.cy - b.cy)[0];
    const bw = upper.maxX - upper.minX + 1;
    const bh = upper.maxY - upper.minY + 1;
    const fill = upper.area / (bw * bh);
    const ratio = bw / bh;
    if (upper.cy < h * 0.5 && upper.area > w * h * 0.045 && fill > 0.55 && ratio > 0.55 && ratio < 1.45) {
      list = list.filter((b) => b !== upper);
    }
  }
  const hand = list[0];
  if (!hand) return null;
  // a single large blob in the upper frame is likely a face, not a hand
  if (hand.cy < h * 0.3 && hand.area > w * h * 0.05) return null;
  return hand;
}

/* ---------- self test: face + hand, then four directions ---------- */
function maskFromDraw(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  draw(g);
  const d = g.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  return m;
}

function runGestureTest() {
  if (!G.panel) initGesture();
  G.panel.classList.add('show');
  const btn = document.querySelector('.tool[data-act="gesture"]');
  if (btn) btn.classList.remove('on');
  gStatus('自检');
  const mask = maskFromDraw(GW, GH, (g) => {
    g.beginPath(); g.arc(80, 16, 19, 0, TAU); g.fill();
    g.beginPath(); g.arc(82, 88, 16, 0, TAU); g.fill();
  });
  const all = findBlobs(mask, GW, GH);
  const hand = pickHand(all, GW, GH);
  const circle = [], line = [];
  for (let i = 0; i <= 24; i++) {
    const a = i / 24 * TAU * 1.05;
    circle.push({ x: 0.5 + 0.12 * Math.cos(a), y: 0.5 + 0.12 * Math.sin(a), t: i * 33 });
  }
  for (let i = 0; i <= 10; i++) line.push({ x: 0.3 + i * 0.04, y: 0.62, t: i * 33 });
  const c = detectCircle(circle), l = detectCircle(line);
  setCommand('自检完成', `脸+手→${hand ? 1 : 0} 只手 · 画圈:${c ? '是' : '否'} · 直线:${l ? '是' : '否'}`);
  const foot = gEl('gFoot');
  if (foot) foot.textContent = '自检：合成“脸 + 右手”，并验证圆形轨迹与直线轨迹的区分。';
}
