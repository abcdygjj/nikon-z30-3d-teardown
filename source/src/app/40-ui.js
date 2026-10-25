/* =========================================================================
   40 · DOM interface, guided steps, boot
   ========================================================================= */
const catName = (id) => (CATS.find((c) => c.id === id) || {}).name || '';
const pad2 = (n) => String(n).padStart(2, '0');

function buildCatalog() {
  const body = $('#catalogBody');
  const list = Object.values(PARTS).sort((a, b) => a.no - b.no);
  $('#partCount').textContent = list.length;
  CATS.forEach((cat) => {
    const group = document.createElement('div');
    group.className = 'cat-group';
    const title = document.createElement('div');
    title.className = 'cat-title';
    title.innerHTML = `<span>${cat.name}</span><i></i><span style="opacity:.6">${cat.en}</span>`;
    group.appendChild(title);
    list.filter((p) => p.cat === cat.id).forEach((p) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.dataset.id = p.id;
      b.innerHTML = `<span class="no">${pad2(p.no)}</span><span class="nm">${p.name}</span><span class="en">${p.en}</span>`;
      b.addEventListener('click', () => {
        if (p.accessory && !parts.has(p.id)) {
          state.pendingSelect = p.id;
          setAccessory(p.id);
          closeCatalog();
          return;
        }
        selectPart(p.id, true);
        closeCatalog();
      });
      b.addEventListener('pointerenter', () => hoverCatalog(p.id, true));
      b.addEventListener('pointerleave', () => hoverCatalog(p.id, false));
      group.appendChild(b);
    });
    body.appendChild(group);
  });
}

let hoveredItem = null;
function hoverCatalog(id, on) {
  const p = parts.get(id);
  if (!p) return;
  if (on) {
    if (hoveredItem === id) return;
    hoveredItem = id;
    if (state.selected !== id) paintPart(p, 1);
  } else {
    hoveredItem = null;
    if (state.selected !== id) paintPart(p, 0);
  }
}

function markCatalog(id) {
  $$('.item').forEach((el) => el.classList.toggle('active', el.dataset.id === id));
  if (!id) return;
  const el = $(`.item[data-id="${id}"]`);
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function buildRail() {
  const rail = $('#stepRail');
  STEPS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'rail-item';
    b.dataset.step = i;
    b.innerHTML = `<b>${pad2(i + 1)}</b><span>${s.short}</span>`;
    b.addEventListener('click', () => goStep(i));
    rail.appendChild(b);
  });
}

function goStep(i) {
  const n = (i + STEPS.length) % STEPS.length;
  closeCatalog();
  applyStep(n);
}

function updateRail(i) {
  $$('.rail-item').forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle('active', n === i);
    el.classList.toggle('done', n < i);
  });
  const active = $(`.rail-item[data-step="${i}"]`);
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

function updateStepMeta(i) {
  const s = STEPS[i];
  $('#stepNo').textContent = pad2(i + 1);
  $('#stepTitle').textContent = s.title;
  $$('#lensPick button').forEach((b) => {
    b.addEventListener('click', () => changeLens(b.dataset.lens));
  });
  $$('#capPick button').forEach((b) => {
    b.addEventListener('click', () => setBodyCap(b.dataset.cap === 'on'));
  });
  $$('#accPick button').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.acc === 'none') setAccessory('none');
      else setAccessory(b.dataset.acc);
    });
  });

  const range = $('#explodeRange');
  const ev = state.solo ? 0 : s.explode;
  range.value = Math.round(ev * 1000);
  $('#explodeVal').textContent = Math.round(ev * 100) + '%';
}

function renderInfo() {
  const body = $('#infoBody');
  const id = state.selected;
  if (!id) {
    const s = STEPS[state.step];
    const idx = state.step;
    body.innerHTML = `
      <div class="eyebrow"><i></i>GUIDED TEARDOWN</div>
      <div class="i-en" style="margin:0 0 8px">STEP ${pad2(idx + 1)} / ${pad2(STEPS.length)}</div>
      <h2 class="i-title">${s.title}</h2>
      <p class="lead">${s.desc}</p>
      <div class="sec-h">操作要点 <b>PROCEDURE</b></div>
      <ol class="step-list">${s.actions.map((a) => `<li>${a}</li>`).join('')}</ol>
      ${s.warn ? `<div class="warn"><b>注意 / CAUTION</b>${s.warn}</div>` : ''}
      <div class="sec-h" style="margin-top:16px">涉及部件 <b>PARTS</b></div>
      <div class="related">${(s.related || []).map((rid) => {
        const rp = PARTS[rid];
        return rp ? `<button class="chip" data-id="${rid}">${pad2(rp.no)} ${rp.name}</button>` : '';
      }).join('')}</div>
      <button class="backbtn" data-act="next" style="margin-top:18px">下一步：${STEPS[(idx + 1) % STEPS.length].title} →</button>
    `;
    bindInfoLinks();
    return;
  }
  const p = PARTS[id];
  body.innerHTML = `
    <div class="eyebrow"><i></i>${catName(p.cat)} · ${pad2(p.no)} / ${TOTAL_PARTS}</div>
    <h2 class="i-title">${p.name}</h2>
    <div class="i-en">${p.en}</div>
    ${state.solo === id ? '<div class="solo-note">单件拆解 · 再次点击该零件恢复整体</div>' : ''}
    ${p.cat === 'lens' ? `<div class="lensbanner"><span>CURRENT LENS</span>${activeLensProfile().name}</div>` : ''}
    <p class="i-sum">${p.sum}</p>
    <div class="i-tagrow">${p.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
    <div class="hr"></div>
    <div class="sec-h">它的作用 <b>FUNCTION</b></div>
    <ul class="i-func">${p.func.map((f) => `<li>${f}</li>`).join('')}</ul>
    <div class="sec-h" style="margin-top:16px">关键参数 <b>SPEC</b></div>
    <div class="spec">${((p.cat === 'lens' && activeLensProfile().specs && activeLensProfile().specs[id]) || p.specs).map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
    ${p.cat === 'core' ? '<div class="tipbox" style="border-color:rgba(90,169,255,.22);background:rgba(90,169,255,.06);color:#a8c4e8"><b style="color:#7db6ff">查看方式 / VISIBILITY</b>该部件位于机身内部，点击顶部“透视”可隔着外壳看到它，或使用第 5–7 步的拆解视图。</div>' : ''}
    <div class="tipbox"><b>拆装提示 / SERVICE NOTE</b>${p.tip}</div>
    <div class="sec-h" style="margin-top:16px">关联部件 <b>RELATED</b></div>
    <div class="related">${(p.related || []).map((rid) => {
      const rp = PARTS[rid];
      return rp ? `<button class="chip" data-id="${rid}">${pad2(rp.no)} ${rp.name}</button>` : '';
    }).join('')}</div>
    <button class="backbtn" data-act="back">← 返回整体视图</button>
  `;
  bindInfoLinks();
}

function bindInfoLinks() {
  $$('#infoBody .chip').forEach((el) => {
    el.addEventListener('click', () => selectPart(el.dataset.id, true));
  });
  const back = $('#infoBody .backbtn[data-act="back"]');
  if (back) back.addEventListener('click', () => selectPart(null, false));
  const next = $('#infoBody .backbtn[data-act="next"]');
  if (next) next.addEventListener('click', () => goStep(state.step + 1));
}

function bindChrome() {
  $$('.tool').forEach((b) => {
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'xray') {
        setXray(!state.xray);
        b.classList.toggle('on', state.xray);
      } else if (act === 'labels') {
        state.labels = !state.labels;
        b.classList.toggle('on', state.labels);
        updateLabels();
      } else if (act === 'spin') {
        state.spin = !state.spin;
        lastInteract = performance.now();
        b.classList.toggle('on', state.spin);
      } else if (act === 'reset') {
        state.spin = true;
        $('.tool[data-act="spin"]').classList.add('on');
        goStep(0);
      } else if (act === 'catalog') {
        document.body.classList.toggle('catalog-open');
      } else if (act === 'help') {
        openWelcome();
      } else if (act === 'gesture') {
        toggleGesture();
      }
    });
  });

  $('#prevStep').addEventListener('click', () => goStep(state.step - 1));
  $('#nextStep').addEventListener('click', () => goStep(state.step + 1));

  $$('#lensPick button').forEach((b) => {
    b.addEventListener('click', () => changeLens(b.dataset.lens));
  });
  $$('#capPick button').forEach((b) => {
    b.addEventListener('click', () => setBodyCap(b.dataset.cap === 'on'));
  });
  $$('#accPick button').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.acc === 'none') setAccessory('none');
      else setAccessory(b.dataset.acc);
    });
  });

  const range = $('#explodeRange');
  range.addEventListener('input', () => {
    state.explodeTarget = Number(range.value) / 1000;
    $('#explodeVal').textContent = Math.round(Number(range.value) / 10) + '%';
    lastInteract = performance.now();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') { goStep(state.step + 1); }
    else if (e.key === 'ArrowLeft') { goStep(state.step - 1); }
    else if (e.key === ' ') { e.preventDefault(); state.spin = !state.spin; $('.tool[data-act="spin"]').classList.toggle('on', state.spin); lastInteract = performance.now(); }
    else if (e.key.toLowerCase() === 'r') { goStep(0); }
    else if (e.key.toLowerCase() === 'x') { $('.tool[data-act="xray"]').click(); }
    else if (e.key.toLowerCase() === 'l') { $('.tool[data-act="labels"]').click(); }
    else if (e.key.toLowerCase() === 'e') { state.explodeTarget = state.explodeTarget > 0.5 ? 0 : 1; range.value = state.explodeTarget * 1000; $('#explodeVal').textContent = Math.round(state.explodeTarget * 100) + '%'; }
    else if (e.key === 'Escape') {
      const w = $('#welcome');
      if (w && w.classList.contains('show')) { closeWelcome(); return; }
      selectPart(null, false);
    }
    else if (/^[1-9]$/.test(e.key)) { goStep(Number(e.key) - 1); }
  });
}

let welcomeTimer = null;
function openWelcome() {
  const w = $('#welcome');
  if (w) w.classList.add('show');
}
function closeWelcome() {
  const w = $('#welcome');
  if (!w) return;
  w.classList.remove('show');
  try { localStorage.setItem('z30-seen', '1'); } catch (e) { /* file:// may block */ }
}

function closeCatalog() {
  document.body.classList.remove('catalog-open');
}

/* ---------------------------------------------------------------- boot */
function boot() {
  buildCatalog();
  buildRail();

  const bar = $('#bootBar');
  const countEl = $('#bootCount');
  onPartCount = (n) => {
    bar.style.width = Math.min(100, Math.round((n / 32) * 100)) + '%';
    countEl.textContent = `${Math.min(n, 32)} / 32`;
  };

  UI = {
    onSelect(id) {
      markCatalog(id);
      if (state.step >= 0 && !id) markCatalog(null);
      renderInfo();
    },
    onStep(i) {
      updateRail(i);
      updateStepMeta(i);
      renderInfo();
    },
    onLens(profile) {
      $$('#lensPick button').forEach((b) => b.classList.toggle('on', b.dataset.lens === profile.id));
      const cap = $('#capPick');
      if (cap) {
        cap.classList.toggle('show', profile.id === 'none');
        cap.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('on', (b.dataset.cap === 'on') === BODY_CAP);
        });
      }
      $$('.item').forEach((el) => {
        const p = PARTS[el.dataset.id];
        if (p && p.cat === 'lens') el.classList.toggle('off', !parts.has(p.id));
      });
      renderInfo();
    },
    onAcc() {
      const cur = parts.has('flash') ? 'flash' : parts.has('topmic') ? 'topmic' : 'none';
      $$('#accPick button').forEach((b) => b.classList.toggle('on', b.dataset.acc === cur));
      $$('.item').forEach((el) => {
        const p = PARTS[el.dataset.id];
        if (p && p.accessory) el.classList.toggle('off', !parts.has(p.id));
      });
      renderInfo();
    },
  };

  bindChrome();
  initGesture();
  initScene();

  // deep link: ?step=3&spin=0&explode=0.6&part=sensor
  const q = new URLSearchParams(location.search);
  if (q.get('noanim') === '1') document.body.classList.add('noanim');
  const welcome = $('#welcome');
  if (welcome) {
    welcome.addEventListener('click', (e) => { if (e.target === welcome) closeWelcome(); });
    const go = $('#welcomeGo');
    if (go) go.addEventListener('click', closeWelcome);
    let seen = false;
    try { seen = localStorage.getItem('z30-seen') === '1'; } catch (e) { seen = false; }
    if (!seen && q.get('welcome') !== '0') welcomeTimer = setTimeout(openWelcome, 1500);
    if (q.get('help') === '1') { clearTimeout(welcomeTimer); openWelcome(); }
  }

  if (q.get('spin') === '0') {
    state.spin = false;
    $('.tool[data-act="spin"]').classList.remove('on');
  }
  if (q.get('lens') === 'none') {
    changeLens('none');
    if (q.get('cap') === 'on') setTimeout(() => setBodyCap(true), 1300);
  } else if (q.get('lens') && LENSES.some((l) => l.id === q.get('lens')) && q.get('lens') !== ACTIVE_LENS) {
    rebuildLens(q.get('lens'));
    UI.onLens(activeLensProfile());
  }
  if (q.get('acc') && q.get('acc') !== 'none') {
    buildAccessory(q.get('acc'));
    UI.onAcc(ACTIVE_ACC);
  }
  const st = Number(q.get('step'));
  if (st >= 1 && st <= STEPS.length) applyStep(st - 1, true);
  else applyStep(state.step, true);
  if (q.get('explode') !== null) {
    state.explodeTarget = clamp(Number(q.get('explode')), 0, 1);
    state.explode = state.explodeTarget;
    $('#explodeRange').value = state.explode * 1000;
    $('#explodeVal').textContent = Math.round(state.explode * 100) + '%';
    syncTransforms();
  }
  if (q.get('hide')) {
    q.get('hide').split(',').forEach((id) => {
      const p = parts.get(id);
      if (p) p.group.visible = false;
    });
  }
  if (q.get('gesturepanel') === '1') {
    if (!G.panel) initGesture();
    G.panel.classList.add('show');
    const gb = document.querySelector('.tool[data-act="gesture"]');
    if (gb) gb.classList.remove('on');
    gStatus('待机');
  }
  if (q.get('gesturetest') === '1') runGestureTest();
  else if (q.get('gesture') === '1') startGesture();
  if (q.get('dbgswap') === '1') {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:999;left:320px;bottom:130px;color:#6f6;background:#000;font:11px monospace;padding:4px 8px';
    document.body.appendChild(d);
    window.__dbgEl = d;
  }
  if (q.get('swapnow')) {
    const [kind, id] = q.get('swapnow').split(':');
    if (kind === 'lens') changeLens(id); else setAccessory(id);
  }
  if (q.get('swap')) {
    const [kind, id] = q.get('swap').split(':');
    setTimeout(() => {
      if (kind === 'lens') changeLens(id);
      else setAccessory(id);
    }, 700);
  }
  if (q.get('part') && parts.has(q.get('part'))) selectPart(q.get('part'), true);
  if (q.get('toggle') === '1' && q.get('part')) {
    setTimeout(() => selectPart(q.get('part'), true), 1400);
  }
  if (q.get('cam')) {
    const p = q.get('cam').split(',').map(Number);
    const t = (q.get('tgt') || '0.3,-0.2,1.2').split(',').map(Number);
    setView(p, t);
    cam.theta = goal.theta; cam.phi = goal.phi; cam.radius = goal.radius;
    cam.target.copy(goal.target);
    updateCameraFromOrbit(true);
  }
  if (q.get('xray') === '1') {
    setXray(true);
    $('.tool[data-act="xray"]').classList.add('on');
  }

  UI.onAcc(ACTIVE_ACC);
  markCatalog(state.selected);
  updateRail(state.step);
  updateStepMeta(state.step);
  renderInfo();
  updateLabels();

  if (q.get('probe')) {
    const [px, py] = q.get('probe').split(',').map(Number);
    const r = canvas.getBoundingClientRect();
    pointerNDC.x = (px / r.width) * 2 - 1;
    pointerNDC.y = -(py / r.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(scene.children, true).slice(0, 5);
    const d = document.createElement('pre');
    d.style.cssText = 'position:fixed;z-index:999;left:8px;top:8px;color:#6f6;background:#000;font:10px/1.4 monospace;padding:8px';
    d.textContent = hits.map((h) => {
      const o = h.object;
      return `${o.userData.partId || '-'} | ${o.geometry.type} | d=${h.distance.toFixed(2)} | mat=${o.material.type} #${o.material.color ? o.material.color.getHexString() : ''}`;
    }).join('\n');
    document.body.appendChild(d);
  }
  if (q.get('debug') === '1') {
    const txt = [...parts.values()].map((p) =>
      p.id + '@' + p.group.position.toArray().map((v) => v.toFixed(1)).join(',') +
      (p.group.visible ? '' : '!')).join('\n');
    const d = document.createElement('pre');
    d.style.cssText = 'position:fixed;z-index:999;left:8px;top:8px;max-width:640px;max-height:96vh;' +
      'overflow:hidden;color:#6f6;background:rgba(0,0,0,.85);font:9px/1.25 monospace;padding:6px;white-space:pre-wrap';
    d.textContent = txt;
    document.body.appendChild(d);
  }

  setTimeout(() => {
    const b = $('#boot');
    b.classList.add('hide');
    setTimeout(() => { b.style.display = 'none'; }, 800);
  }, 260);
  window.__Z30 = {
    setStep: (n) => applyStep(n - 1, true),
    select: (id) => selectPart(id, true),
    explode: (v) => { state.explodeTarget = v; state.explode = v; $('#explodeRange').value = v * 1000; syncTransforms(); },
    state, parts, camera, scene,
  };
}

boot();
