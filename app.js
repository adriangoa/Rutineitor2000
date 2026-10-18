/* Rutineitor 2000 — rutina semanal con checklist, sin internet. */
'use strict';

const BUILD = 'dev'; // lo reemplaza scripts/build.mjs al publicar
const LOG_KEY = 'r2k.log.v1';
const REST_KEY = 'r2k.rest.v1';
const THEME_KEY = 'r2k.theme';
const DEFAULT_REST = 90; // segundos
const DAY_SHORT = ['L', 'M', 'Mi', 'J', 'V'];

const $ = (s) => document.querySelector(s);
const state = { routine: null, dayIdx: 0, animTimer: null };
let log = loadLog();

/* ---------- Almacenamiento ---------- */
function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY)) || {}; } catch { return {}; }
}
function saveLog() {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); }
  catch { toast('No se pudo guardar el progreso en este dispositivo'); }
}

/* ---------- Fechas ---------- */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function weekdayIdx(d = new Date()) { return (d.getDay() + 6) % 7; } // 0 = lunes
function baseMonday() {
  const now = new Date();
  const m = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  m.setDate(m.getDate() - weekdayIdx(now));
  if (weekdayIdx(now) > 4) m.setDate(m.getDate() + 7); // fin de semana: muestra la semana que viene
  return m;
}
function dateFor(dayIdx, weekOffset = 0) {
  const d = baseMonday();
  d.setDate(d.getDate() + dayIdx + weekOffset * 7);
  return d;
}
const fmtLong = (d) => { const s = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
const fmtShort = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

/* ---------- Progreso ---------- */
const setsOf = (ex) => (ex.type === 'cardio' ? 1 : ex.sets);
function marks(dateKey, ex) { return (log[dateKey] && log[dateKey][ex.id]) || []; }
function dayProgress(day, dateKey) {
  let total = 0, done = 0;
  for (const ex of day.exercises) {
    const n = setsOf(ex);
    total += n;
    const m = marks(dateKey, ex);
    for (let i = 0; i < n; i++) if (m[i]) done++;
  }
  return { total, done, pct: total ? done / total : 0 };
}
function toggleSet(dateKey, ex, i) {
  const n = setsOf(ex);
  const day = (log[dateKey] ||= {});
  const arr = (day[ex.id] ||= Array(n).fill(0));
  arr[i] = arr[i] ? 0 : 1;
  if (!arr.some(Boolean)) delete day[ex.id];
  if (!Object.keys(day).length) delete log[dateKey];
  saveLog();
  if (navigator.vibrate) navigator.vibrate(arr[i] ? 18 : 8);
}

// Ejercicios de la misma superserie (son consecutivos en routine.json).
function groupOf(day, ex) { return ex.ss ? day.exercises.filter((e) => e.ss === ex.ss) : null; }

/* ---------- Render ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CARDIO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>';

function renderTabs() {
  const today = weekdayIdx();
  $('#tabs').innerHTML = state.routine.days.map((d, i) => {
    const p = dayProgress(d, ymd(dateFor(i)));
    return `<button class="tab${i === today ? ' today' : ''}" role="tab" data-day="${i}" aria-selected="${i === state.dayIdx}">
      <span class="t-day">${DAY_SHORT[i]}</span><span class="t-focus">${esc(d.focus.split(/[ ,]/)[0])}</span>
      <span class="t-bar"><i style="width:${Math.round(p.pct * 100)}%"></i></span></button>`;
  }).join('');
}

function setButtons(dateKey, ex) {
  const m = marks(dateKey, ex);
  if (ex.type === 'cardio') {
    return `<button class="set wide" data-ex="${ex.id}" data-i="0" aria-pressed="${!!m[0]}">${m[0] ? 'Hecho' : 'Marcar'}</button>`;
  }
  let h = '';
  for (let i = 0; i < ex.sets; i++) {
    h += `<button class="set" data-ex="${ex.id}" data-i="${i}" aria-pressed="${!!m[i]}" aria-label="Serie ${i + 1}">${i + 1}</button>`;
  }
  return h;
}

function cardHTML(ex, n, dateKey) {
  const m = marks(dateKey, ex);
  const done = m.filter(Boolean).length >= setsOf(ex);
  const thumb = ex.type === 'cardio'
    ? `<div class="thumb cardio">${CARDIO_ICON}</div>`
    : `<button class="thumb" data-open="${ex.id}" aria-label="Ver cómo se hace"><img src="images/${ex.img}/0.webp" alt="" loading="lazy" width="72" height="72"></button>`;
  const meta = ex.type === 'cardio'
    ? `<strong>${esc(ex.duration)}</strong>`
    : `<strong>${ex.sets} × ${esc(ex.reps)}</strong>${ex.variant ? esc(ex.variant) : ''}`;
  return `<li class="card${done ? ' done' : ''}">
    ${thumb}
    <div class="c-body">
      <button class="c-top" data-open="${ex.id}"><span class="c-num">${n}</span><span class="c-name">${esc(ex.name)}</span></button>
      <p class="c-meta">${meta}</p>
      <div class="sets">${setButtons(dateKey, ex)}</div>
    </div></li>`;
}

function renderDay() {
  const day = state.routine.days[state.dayIdx];
  const date = dateFor(state.dayIdx);
  const dateKey = ymd(date);
  $('#dayDate').textContent = `${fmtLong(date)} · ~${day.minutes} min`;
  $('#dayTitle').textContent = day.focus;

  let html = '', n = 0;
  const exs = day.exercises;
  for (let i = 0; i < exs.length; i++) {
    const ex = exs[i];
    if (ex.ss) {
      const group = [];
      while (i < exs.length && exs[i].ss === ex.ss) group.push(exs[i++]);
      i--;
      html += `<li class="group"><span class="group-label"><b>SUPERSERIE ${esc(ex.ss)}</b> alterna sin descanso</span>
        <ol class="list">${group.map((g) => cardHTML(g, ++n, dateKey)).join('')}</ol></li>`;
    } else {
      html += cardHTML(ex, ++n, dateKey);
    }
  }
  $('#list').innerHTML = html;
  updateProgress();
}

function updateProgress() {
  const day = state.routine.days[state.dayIdx];
  const p = dayProgress(day, ymd(dateFor(state.dayIdx)));
  $('#progFill').style.width = `${Math.round(p.pct * 100)}%`;
  $('#progText').textContent = `${p.done}/${p.total} series`;
  $('#doneMsg').hidden = p.done < p.total;
  renderTabs();
}

function refreshCard(exId) {
  const day = state.routine.days[state.dayIdx];
  const ex = day.exercises.find((e) => e.id === exId);
  const dateKey = ymd(dateFor(state.dayIdx));
  document.querySelectorAll(`.sets [data-ex="${exId}"]`).forEach((b) => {
    const on = !!marks(dateKey, ex)[+b.dataset.i];
    b.setAttribute('aria-pressed', on);
    if (ex.type === 'cardio') b.textContent = on ? 'Hecho' : 'Marcar';
  });
  const done = marks(dateKey, ex).filter(Boolean).length >= setsOf(ex);
  const card = $('#list').querySelector(`.sets [data-ex="${exId}"]`)?.closest('.card');
  if (card) card.classList.toggle('done', done);
  updateProgress();
}

/* ---------- Detalle del ejercicio ---------- */
function openExercise(exId) {
  const day = state.routine.days[state.dayIdx];
  const ex = day.exercises.find((e) => e.id === exId);
  const dateKey = ymd(dateFor(state.dayIdx));
  const img = ex.img
    ? `<div class="anim" id="anim"><img src="images/${ex.img}/0.webp" alt="Posición inicial"><img class="f1" src="images/${ex.img}/1.webp" alt="Posición final"><span class="anim-label" id="animLabel">Inicio</span></div>`
    : '';
  const meta = ex.type === 'cardio'
    ? `<strong>${esc(ex.duration)}</strong>`
    : `<strong>${ex.sets} series × ${esc(ex.reps)}</strong>${ex.variant ? ' · ' + esc(ex.variant) : ''}${ex.inv ? ` · Inventario #${ex.inv}` : ''}`;
  $('#sheetBody').innerHTML = `${img}
    <h2 class="s-name"${img ? '' : ' style="margin-top:36px"'}>${esc(ex.name)}</h2>
    <p class="s-meta">${meta}</p>
    <ul class="tips">${(ex.tips || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="s-sets-label">${ex.type === 'cardio' ? 'Marca al terminar' : 'Marca cada serie al terminarla'}</p>
    <div class="sets">${setButtons(dateKey, ex)}</div>`;
  const sheet = $('#sheet');
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  clearInterval(state.animTimer);
  if (ex.img) {
    let f = 0;
    state.animTimer = setInterval(() => {
      f = 1 - f;
      $('#anim')?.classList.toggle('show1', !!f);
      const l = $('#animLabel'); if (l) l.textContent = f ? 'Final' : 'Inicio';
    }, 1100);
  }
}

/* ---------- Semana / historial ---------- */
function renderWeek() {
  const days = state.routine.days;
  const now = days.map((d, i) => {
    const p = dayProgress(d, ymd(dateFor(i)));
    const pct = Math.round(p.pct * 100);
    return `<button class="wk-cell${pct === 100 ? ' full' : ''}" data-goto="${i}"><b>${DAY_SHORT[i]}</b><span>${pct}%</span></button>`;
  }).join('');
  let rows = `<div class="hist-row"><span class="hist-head lbl">Semana</span>${DAY_SHORT.map((d) => `<span class="hist-head">${d}</span>`).join('')}</div>`;
  for (let w = -1; w >= -8; w--) {
    const cells = days.map((d, i) => {
      const pct = Math.round(dayProgress(d, ymd(dateFor(i, w))).pct * 100);
      return `<span class="hist-dot" title="${pct}%"><i style="height:${pct}%"></i></span>`;
    }).join('');
    rows += `<div class="hist-row"><span>${fmtShort(dateFor(0, w))}</span>${cells}</div>`;
  }
  $('#weekBody').innerHTML = `<p class="hist-title">Esta semana (desde el ${fmtShort(dateFor(0))})</p>
    <div class="week-now">${now}</div><p class="hist-title">Semanas anteriores</p>${rows}`;
  $('#week').showModal();
}

/* ---------- Respaldo ---------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'rutineitor2000', exported: new Date().toISOString(), log }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rutineitor-respaldo-${ymd(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Respaldo descargado');
}
async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'rutineitor2000' || typeof data.log !== 'object') throw new Error();
    for (const [date, exs] of Object.entries(data.log)) log[date] = { ...(log[date] || {}), ...exs };
    saveLog(); renderDay();
    toast('Respaldo importado');
  } catch { toast('Ese archivo no es un respaldo válido'); }
}

/* ---------- Descanso entre series ----------
   Se guarda la hora de término (no los segundos restantes): si Android congela la
   página con la pantalla apagada, al volver la cuenta sigue correcta. El sonido se
   programa en el reloj de Web Audio desde que marcas la serie, que no depende de los
   timers de JavaScript. Es un tono corto y suave: Chrome lo mezcla con tu música. */
let rest = loadRest(); // { mode: 'rest', day, end, total } | { mode: 'next', day, exId }
let restTick = null, audioCtx = null, chime = [];

function loadRest() {
  try {
    const r = JSON.parse(localStorage.getItem(REST_KEY));
    return r && (r.mode === 'next' || r.end > Date.now()) ? r : null;
  } catch { return null; }
}
function saveRest() {
  try { rest ? localStorage.setItem(REST_KEY, JSON.stringify(rest)) : localStorage.removeItem(REST_KEY); } catch {}
}

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx ||= new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
function scheduleChime(endMs) {
  cancelChime();
  const ctx = audio(); if (!ctx) return;
  const t0 = ctx.currentTime + Math.max(0, (endMs - Date.now()) / 1000);
  // "Ding-dong" grave (mi5 → do5), volumen bajo y con caída suave.
  [[659.25, 0], [523.25, 0.32]].forEach(([freq, dt]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0 + dt);
    g.gain.linearRampToValueAtTime(0.32, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 1.1);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + dt); o.stop(t0 + dt + 1.2);
    chime.push(o);
  });
}
function cancelChime() {
  chime.forEach((o) => { try { o.stop(); } catch {} });
  chime = [];
}
function sleepAudio() { if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {}); }

const restSecsLeft = () => Math.max(0, Math.ceil((rest.end - Date.now()) / 1000));
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function startRest(secs) {
  rest = { mode: 'rest', day: state.dayIdx, end: Date.now() + secs * 1000, total: secs };
  scheduleChime(rest.end);
  saveRest(); renderRest();
}
function adjustRest(delta) {
  rest.end += delta * 1000;
  if (rest.end <= Date.now()) { clearRest(); return; }
  rest.total = Math.max(rest.total, restSecsLeft());
  scheduleChime(rest.end);
  saveRest(); renderRest();
}
function clearRest() {
  rest = null; cancelChime(); sleepAudio();
  saveRest(); renderRest();
}

// Qué hacer después de marcar una serie.
function afterMark(day, ex, on) {
  if (!on) return;
  const g = groupOf(day, ex);
  if (g && g.indexOf(ex) < g.length - 1) {
    rest = { mode: 'next', day: state.dayIdx, exId: g[g.indexOf(ex) + 1].id };
    cancelChime(); saveRest(); renderRest();
    return;
  }
  const p = dayProgress(day, ymd(dateFor(state.dayIdx)));
  if (ex.type === 'cardio' || p.done >= p.total) { clearRest(); return; }
  startRest((g ? g[g.length - 1] : ex).rest || DEFAULT_REST);
}

function restHTML() {
  if (rest.mode === 'next') {
    const ex = state.routine.days[rest.day].exercises.find((e) => e.id === rest.exId);
    return `<button class="rest-go" data-rest="go">Ahora, sin descanso<b>${esc(ex.name)} ›</b></button>
      <button class="rest-btn" data-rest="skip" aria-label="Cerrar">✕</button>`;
  }
  return `<div class="rest-info"><span class="rest-label">Descanso</span><span class="rest-time"></span></div>
    <button class="rest-btn" data-rest="-15">−15</button>
    <button class="rest-btn" data-rest="15">+15</button>
    <button class="rest-btn" data-rest="skip">Saltar</button>
    <span class="rest-track"><i class="rest-fill"></i></span>`;
}
function renderRest() {
  clearInterval(restTick);
  const boxes = [$('#restBar'), $('#sheetRest')];
  document.body.classList.toggle('resting', !!rest);
  boxes.forEach((b) => {
    b.hidden = !rest;
    b.classList.remove('over');
    b.classList.toggle('next', !!rest && rest.mode === 'next');
    b.innerHTML = rest ? restHTML() : '';
  });
  if (rest && rest.mode === 'rest') { tickRest(); restTick = setInterval(tickRest, 250); }
}
function tickRest() {
  const left = restSecsLeft();
  document.querySelectorAll('.rest-time').forEach((t) => { t.textContent = mmss(left); });
  document.querySelectorAll('.rest-fill').forEach((f) => { f.style.width = `${(left / rest.total) * 100}%`; });
  if (left > 0) return;
  clearInterval(restTick);
  if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  document.querySelectorAll('.rest').forEach((b) => b.classList.add('over'));
  document.querySelectorAll('.rest-label').forEach((l) => { l.textContent = '¡Listo! Siguiente serie'; });
  const done = rest;
  setTimeout(() => {
    if (rest !== done) return;
    rest = null; saveRest(); renderRest(); sleepAudio();
  }, 5000);
}
function onRestClick(e) {
  const b = e.target.closest('[data-rest]'); if (!b) return;
  const a = b.dataset.rest;
  if (a === 'skip') clearRest();
  else if (a === 'go') {
    const { day, exId } = rest;
    clearRest();
    if (day !== state.dayIdx) { state.dayIdx = day; renderDay(); }
    openExercise(exId);
  } else adjustRest(+a);
}

/* ---------- Tema ---------- */
const THEME_BG = { hc: '#000000', synth: '#12061f' };
function applyTheme(t) {
  const root = document.documentElement;
  if (THEME_BG[t]) root.dataset.theme = t; else delete root.dataset.theme;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas[0].content = THEME_BG[t] || '#0d0e0b';
  metas[1].content = THEME_BG[t] || '#f3f3ee';
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.themeSet === (THEME_BG[t] ? t : 'auto')));
}
function setTheme(t) {
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  applyTheme(t);
}

/* ---------- Pantalla encendida (respaldo, desde Opciones) ---------- */
let wakeLock = null;
async function toggleWake() {
  const btn = $('#wakeBtn');
  if (wakeLock) { await wakeLock.release(); wakeLock = null; btn.setAttribute('aria-pressed', 'false'); toast('La pantalla puede apagarse'); return; }
  if (!('wakeLock' in navigator)) { toast('Tu navegador no permite mantener la pantalla encendida'); return; }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    btn.setAttribute('aria-pressed', 'true'); toast('Pantalla encendida mientras entrenas');
    wakeLock.addEventListener('release', () => { if (document.visibilityState !== 'visible') return; wakeLock = null; btn.setAttribute('aria-pressed', 'false'); });
  } catch { toast('No se pudo mantener la pantalla encendida'); }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && $('#wakeBtn').getAttribute('aria-pressed') === 'true') {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }
});

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, onClick, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  t.onclick = () => { t.hidden = true; onClick && onClick(); };
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- Eventos ---------- */
function onSetClick(e) {
  const b = e.target.closest('.set');
  if (!b) return false;
  const day = state.routine.days[state.dayIdx];
  const ex = day.exercises.find((x) => x.id === b.dataset.ex);
  const dateKey = ymd(dateFor(state.dayIdx));
  toggleSet(dateKey, ex, +b.dataset.i);
  refreshCard(ex.id);
  afterMark(day, ex, !!marks(dateKey, ex)[+b.dataset.i]);
  return true;
}
function bind() {
  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    state.dayIdx = +t.dataset.day; renderDay(); window.scrollTo({ top: 0 });
  });
  $('#list').addEventListener('click', (e) => {
    if (onSetClick(e)) return;
    const o = e.target.closest('[data-open]'); if (o) openExercise(o.dataset.open);
  });
  $('#sheetBody').addEventListener('click', onSetClick);
  $('#restBar').addEventListener('click', onRestClick);
  $('#sheetRest').addEventListener('click', onRestClick);
  $('#themePick').addEventListener('click', (e) => { const b = e.target.closest('[data-theme-set]'); if (b) setTheme(b.dataset.themeSet); });
  $('#weekBody').addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]'); if (!g) return;
    state.dayIdx = +g.dataset.goto; $('#week').close(); renderDay();
  });
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    d.addEventListener('close', () => { if (d.id === 'sheet') clearInterval(state.animTimer); resetArm(); });
  });
  $('#weekBtn').addEventListener('click', renderWeek);
  $('#menuBtn').addEventListener('click', () => $('#menu').showModal());
  $('#wakeBtn').addEventListener('click', toggleWake);
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ''; $('#menu').close(); });
  $('#resetBtn').addEventListener('click', () => {
    const b = $('#resetBtn');
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.firstChild.textContent = '¿Seguro? Toca otra vez'; return; }
    delete log[ymd(dateFor(state.dayIdx))]; saveLog(); renderDay(); $('#menu').close(); toast('Día reiniciado');
  });
}
function resetArm() { const b = $('#resetBtn'); b.classList.remove('armed'); b.firstChild.textContent = 'Reiniciar este día'; }

/* ---------- Service worker (modo sin internet) ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller; // primera visita: no recargar
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (w) => toast('Hay una versión nueva de tu rutina · Toca para actualizar', () => w.postMessage('skipWaiting'), 0);
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

/* ---------- Inicio ---------- */
async function init() {
  try {
    const res = await fetch('data/routine.json');
    state.routine = await res.json();
  } catch {
    $('#dayTitle').textContent = 'No se pudo cargar la rutina';
    return;
  }
  const wd = weekdayIdx();
  state.dayIdx = wd <= 4 ? wd : 0;
  $('#versionText').textContent = `Rutina v${state.routine.version} · build ${BUILD}`;
  bind();
  try { applyTheme(localStorage.getItem(THEME_KEY) || 'auto'); } catch { applyTheme('auto'); }
  renderDay();
  renderRest();
  registerSW();
}
init();
