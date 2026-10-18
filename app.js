/* Rutineitor 2000 — rutina semanal con checklist, sin internet. */
'use strict';

const BUILD = 'dev'; // lo reemplaza scripts/build.mjs al publicar
const LOG_KEY = 'r2k.log.v1';
const REST_KEY = 'r2k.rest.v1';
const THEME_KEY = 'r2k.theme';
const SFX_KEY = 'r2k.sfx';
const AB_KEY = 'r2k.ab.v1';
const NOTES_KEY = 'r2k.notes.v1';
const TIMES_KEY = 'r2k.times.v1';
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
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtLong = (d) => { const s = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
const fmtShort = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

/* ---------- Semana A / B ----------
   Las semanas se alternan desde routine.abInicio (lunes de la primera semana A).
   Si cambias a mano una semana, se guarda en r2k.ab.v1 ({ "lunes": "A"|"B" }) y la
   alternancia sigue desde ahí; las semanas anteriores no cambian (el historial cuadra). */
let abOverrides = (() => { try { return JSON.parse(localStorage.getItem(AB_KEY)) || {}; } catch { return {}; } })();
function weekLetter(w = 0) {
  const mon = ymd(dateFor(0, w));
  const refs = [[state.routine.abInicio, 'A'], ...Object.entries(abOverrides)].filter(([k]) => k && k <= mon).sort();
  if (!refs.length) return 'A';
  const [k, letter] = refs[refs.length - 1];
  const weeks = Math.round((parseYmd(mon) - parseYmd(k)) / 604800000);
  return (weeks % 2 === 0) === (letter === 'A') ? 'A' : 'B';
}
function setWeekLetter(letter) {
  abOverrides[ymd(dateFor(0))] = letter;
  try { localStorage.setItem(AB_KEY, JSON.stringify(abOverrides)); } catch {}
}
// El día con los ejercicios de la semana que toca (w = semanas desde la actual).
function dayView(i, w = 0) {
  const d = state.routine.days[i];
  return weekLetter(w) === 'B' && d.exercisesB ? { ...d, exercises: d.exercisesB } : d;
}

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
/* Duración real: hora de la primera y la última serie marcada del día (r2k.times.v1).
   Solo se mide al marcar el día de hoy, para no inventar tiempos al ponerte al corriente. */
let times = (() => { try { return JSON.parse(localStorage.getItem(TIMES_KEY)) || {}; } catch { return {}; } })();
function stampTime(dateKey) {
  if (dateKey !== ymd(new Date())) return;
  const now = Date.now(), t = (times[dateKey] ||= { a: now, b: now });
  t.b = now;
  try { localStorage.setItem(TIMES_KEY, JSON.stringify(times)); } catch {}
}
function workoutMin(dateKey) {
  const t = times[dateKey];
  return t && t.b > t.a ? Math.max(1, Math.round((t.b - t.a) / 60000)) : 0;
}

function toggleSet(dateKey, ex, i) {
  const n = setsOf(ex);
  const day = (log[dateKey] ||= {});
  const arr = (day[ex.id] ||= Array(n).fill(0));
  arr[i] = arr[i] ? 0 : 1;
  if (arr[i]) stampTime(dateKey);
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
    const p = dayProgress(dayView(i), ymd(dateFor(i)));
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
    ? `<div class="thumb cardio">${CARDIO_ICON}${noteDot(ex)}</div>`
    : `<button class="thumb" data-open="${ex.id}" aria-label="Ver cómo se hace"><img src="images/${ex.img}/0.webp" alt="" loading="lazy" width="72" height="72">${noteDot(ex)}</button>`;
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
  const day = dayView(state.dayIdx);
  const date = dateFor(state.dayIdx);
  const dateKey = ymd(date);
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
  const day = dayView(state.dayIdx);
  const date = dateFor(state.dayIdx), dateKey = ymd(date);
  const p = dayProgress(day, dateKey);
  const min = workoutMin(dateKey);
  $('#dayDate').innerHTML = `${esc(fmtLong(date))} · ${min ? `⏱ ${min} min` : `~${day.minutes} min`} <span class="wk-badge">Semana ${weekLetter()}</span>`;
  $('#progFill').style.width = `${Math.round(p.pct * 100)}%`;
  $('#progText').textContent = `${p.done}/${p.total} series`;
  $('#doneMsg').hidden = p.done < p.total;
  renderTabs();
}

function refreshCard(exId) {
  const day = dayView(state.dayIdx);
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

/* ---------- Notas: ¿lo pude hacer? ----------
   Por ejercicio: s = 'ok' (lo hice) | 'adapt' (lo adapté) | 'no' (no se puede), más una nota.
   Se guarda con nombre e inventario para que el respaldo exportado se entienda solo. */
const NOTE_OPTS = [['ok', '✅', 'Lo hice'], ['adapt', '🔧', 'Lo adapté'], ['no', '❌', 'No se puede']];
let notes = (() => { try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch { return {}; } })();
function saveNotes() {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }
  catch { toast('No se pudo guardar la nota'); }
}
const noteEmoji = (ex) => { const n = notes[ex.id]; return n ? NOTE_OPTS.find((o) => o[0] === n.s)[1] : '📝'; };
const noteDot = (ex) => {
  const n = notes[ex.id];
  return n && n.s !== 'ok' ? `<span class="note-dot ${n.s}" aria-label="${n.s === 'no' ? 'No se puede' : 'Adaptado'}"></span>` : '';
};
function notePanelHTML(ex) {
  const n = notes[ex.id] || {};
  return `<div class="note-panel" id="notePanel" hidden>
    <p class="note-q">¿Pudiste hacerlo como está descrito?</p>
    <div class="note-opts">${NOTE_OPTS.map(([s, e, t]) => `<button data-note="${s}" aria-pressed="${n.s === s}">${e} ${t}</button>`).join('')}</div>
    <textarea id="noteText" rows="2" placeholder="¿Qué cambiaste o por qué no se pudo?"${n.s === 'adapt' || n.s === 'no' ? '' : ' hidden'}>${esc(n.note || '')}</textarea>
  </div>`;
}
function setNote(ex, s) {
  const prev = notes[ex.id];
  if (prev && prev.s === s) delete notes[ex.id]; // tocar la misma opción otra vez la quita
  else notes[ex.id] = { s, note: (prev && prev.note) || '', name: ex.name, inv: ex.inv ?? null, fecha: ymd(new Date()) };
  saveNotes();
  const n = notes[ex.id];
  document.querySelectorAll('[data-note]').forEach((b) => b.setAttribute('aria-pressed', !!n && b.dataset.note === n.s));
  $('#noteText').hidden = !n || n.s === 'ok';
  if (!$('#noteText').hidden) $('#noteText').focus();
  $('.note-btn').textContent = noteEmoji(ex);
  renderDay(); // actualiza el puntito de la tarjeta
}
function onNoteClick(e) {
  if (e.target.closest('[data-note-toggle]')) {
    const p = $('#notePanel');
    p.hidden = !p.hidden;
    sfx(p.hidden ? 'close' : 'open');
    if (!p.hidden) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return true;
  }
  const b = e.target.closest('[data-note]');
  if (!b) return false;
  setNote(dayView(state.dayIdx).exercises.find((x) => x.id === state.sheetEx), b.dataset.note);
  sfx('tap');
  return true;
}

/* ---------- Detalle del ejercicio ---------- */
function openExercise(exId) {
  state.sheetEx = exId;
  const day = dayView(state.dayIdx);
  const ex = day.exercises.find((e) => e.id === exId);
  const dateKey = ymd(dateFor(state.dayIdx));
  const img = ex.img
    ? `<div class="anim" id="anim"><img src="images/${ex.img}/0.webp" alt="Posición inicial"><img class="f1" src="images/${ex.img}/1.webp" alt="Posición final"><span class="anim-label" id="animLabel">Inicio</span></div>`
    : '';
  const meta = ex.type === 'cardio'
    ? `<strong>${esc(ex.duration)}</strong>`
    : `<strong>${ex.sets} series × ${esc(ex.reps)}</strong>${ex.variant ? ' · ' + esc(ex.variant) : ''}`;
  const g = groupOf(day, ex);
  const pos = g ? g.indexOf(ex) : -1;
  // Pie del modal: anterior/siguiente del día; en superserie, "siguiente" es el que sigue del grupo.
  const k = day.exercises.indexOf(ex);
  const prev = day.exercises[k - 1];
  const next = g ? g[(pos + 1) % g.length] : day.exercises[k + 1];
  $('#sheetBody').innerHTML = `${img}
    ${g ? `<p class="ss-badge">Superserie ${esc(ex.ss)} · ${pos + 1} de ${g.length}</p>` : ''}
    <div class="s-head"${img || g ? '' : ' style="margin-top:36px"'}>
      <h2 class="s-name">${esc(ex.name)}</h2>
      <button class="note-btn" data-note-toggle aria-label="Anotar si lo pudiste hacer">${noteEmoji(ex)}</button>
    </div>
    <p class="s-meta">${meta}</p>
    ${notePanelHTML(ex)}
    <ul class="tips">${(ex.tips || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="s-sets-label">${ex.type === 'cardio' ? 'Marca al terminar' : 'Marca cada serie al terminarla'}</p>
    <div class="sets">${setButtons(dateKey, ex)}</div>
    <nav class="s-nav">
      ${prev ? `<button class="s-prev" data-open="${prev.id}">Anterior<b>‹ ${esc(prev.name)}</b></button>` : '<span></span>'}
      ${next ? `<button class="s-next${g ? ' ss' : ''}" data-open="${next.id}">${g ? 'Sigue en la superserie' : 'Siguiente'}<b>${esc(next.name)} ›</b></button>` : ''}
    </nav>`;
  const sheet = $('#sheet');
  if (!sheet.open) { sheet.showModal(); sfx('open'); } else sfx('move');
  sheet.scrollTop = 0;
  renderRest();
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
    const p = dayProgress(dayView(i), ymd(dateFor(i)));
    const pct = Math.round(p.pct * 100);
    const min = workoutMin(ymd(dateFor(i)));
    return `<button class="wk-cell${pct === 100 ? ' full' : ''}" data-goto="${i}"><b>${DAY_SHORT[i]}</b><span>${pct}%</span>${min ? `<small>⏱ ${min}′</small>` : ''}</button>`;
  }).join('');
  let rows = `<div class="hist-row"><span class="hist-head lbl">Semana</span>${DAY_SHORT.map((d) => `<span class="hist-head">${d}</span>`).join('')}</div>`;
  for (let w = -1; w >= -8; w--) {
    const cells = days.map((d, i) => {
      const pct = Math.round(dayProgress(dayView(i, w), ymd(dateFor(i, w))).pct * 100);
      return `<span class="hist-dot" title="${pct}%"><i style="height:${pct}%"></i></span>`;
    }).join('');
    rows += `<div class="hist-row"><span>${fmtShort(dateFor(0, w))} <small>${weekLetter(w)}</small></span>${cells}</div>`;
  }
  const L = weekLetter(), other = L === 'A' ? 'B' : 'A';
  $('#weekBody').innerHTML = `<div class="ab-row"><span>Esta semana toca <b class="wk-badge">Semana ${L}</b></span>
      <button class="ab-switch" data-ab="${other}">Cambiar a ${other}</button></div>
    <p class="hist-title">Esta semana (desde el ${fmtShort(dateFor(0))})</p>
    <div class="week-now">${now}</div><p class="hist-title">Semanas anteriores</p>${rows}`;
  if (!$('#week').open) $('#week').showModal();
}

/* ---------- Respaldo ---------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'rutineitor2000', exported: new Date().toISOString(), log, ab: abOverrides, notas: notes, tiempos: times }, null, 1)], { type: 'application/json' });
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
    if (data.notas && typeof data.notas === 'object') { notes = { ...notes, ...data.notas }; saveNotes(); }
    if (data.tiempos && typeof data.tiempos === 'object') {
      times = { ...data.tiempos, ...times };
      try { localStorage.setItem(TIMES_KEY, JSON.stringify(times)); } catch {}
    }
    if (data.ab && typeof data.ab === 'object') {
      abOverrides = { ...abOverrides, ...data.ab };
      try { localStorage.setItem(AB_KEY, JSON.stringify(abOverrides)); } catch {}
    }
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
  // Cuenta regresiva: 3 bips cortos y suaves en los últimos 3 s (si alcanzan a sonar).
  [3, 2, 1].forEach((s) => {
    const t = t0 - s;
    if (t <= ctx.currentTime + 0.05) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.15);
    chime.push(o);
  });
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
function sleepAudio() {
  if (Date.now() < sfxBusyUntil) return; // no cortes un efecto que está sonando (se duerme al terminar)
  if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
}

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
    const ex = dayView(rest.day).exercises.find((e) => e.id === rest.exId);
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
  // En el modal no repitas "Ahora: X" si el botón de la superserie ya lleva a X.
  if (rest && rest.mode === 'next' && $('#sheetBody .s-next.ss')?.dataset.open === rest.exId) $('#sheetRest').hidden = true;
  if (rest && rest.mode === 'rest') { tickRest(); restTick = setInterval(tickRest, 250); }
}
function tickRest() {
  const left = restSecsLeft();
  document.querySelectorAll('.rest-time').forEach((t) => {
    t.textContent = mmss(left);
    t.classList.toggle('ending', left > 0 && left <= 3);
  });
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
  if (a !== 'go') sfx('tap');
  if (a === 'skip') clearRest();
  else if (a === 'go') {
    const { day, exId } = rest;
    clearRest();
    if (day !== state.dayIdx) { state.dayIdx = day; renderDay(); }
    openExercise(exId);
  } else adjustRest(+a);
}

/* ---------- Tema ---------- */
const THEME_BG = { hc: '#000000', synth: '#12061f', gb: '#5b3f8f' };
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

/* ---------- Efectos de sonido (estilo Game Boy) ----------
   Onda cuadrada, como el canal de pulso del Game Boy, generada con Web Audio:
   no hay archivos de audio. Cada sonido es una lista de [frecuencia Hz, duración s]
   (frecuencia 0 = silencio). Melodías originales, volumen bajo para no tapar tu música. */
const SFX = {
  mark: [[1318.5, 0.045], [1760, 0.07]],
  unmark: [[880, 0.045], [587.3, 0.08]],
  tap: [[1568, 0.04]],
  move: [[1046.5, 0.035], [1318.5, 0.05]],
  open: [[784, 0.04], [1174.7, 0.07]],
  close: [[1174.7, 0.04], [784, 0.07]],
  exercise: [[523.3, 0.07], [659.3, 0.07], [784, 0.07], [1046.5, 0.07], [1318.5, 0.22]],
  day: [[392, 0.09], [523.3, 0.09], [659.3, 0.09], [784, 0.18], [0, 0.05], [659.3, 0.09], [784, 0.09], [1046.5, 0.12], [1318.5, 0.12], [1568, 0.5]],
};
let sfxOn = (() => { try { return localStorage.getItem(SFX_KEY) !== '0'; } catch { return true; } })();
let sfxSleep = null, sfxBusyUntil = 0;
function sfx(name) {
  if (!sfxOn) return;
  const ctx = audio(); if (!ctx) return;
  let t = ctx.currentTime + 0.01;
  for (const [freq, dur] of SFX[name]) {
    if (freq) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.05, t);
      g.gain.setValueAtTime(0.05, t + dur * 0.7);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    }
    t += dur;
  }
  // Duerme el audio al terminar, salvo que haya un descanso con su aviso programado.
  const ms = (t - ctx.currentTime) * 1000;
  sfxBusyUntil = Math.max(sfxBusyUntil, Date.now() + ms + 100);
  clearTimeout(sfxSleep);
  sfxSleep = setTimeout(() => { if (!rest || rest.mode !== 'rest') sleepAudio(); }, ms + 1500);
}
function renderSfxBtn() {
  const b = $('#sfxBtn');
  b.setAttribute('aria-pressed', sfxOn);
  b.querySelector('small').textContent = sfxOn ? 'Activados · sonidos retro al tocar y al completar' : 'Desactivados';
}
function setSfx(on) {
  sfxOn = on;
  try { localStorage.setItem(SFX_KEY, on ? '1' : '0'); } catch {}
  renderSfxBtn();
  sfx('tap');
}

/* ---------- Logros ----------
   Al completar un ejercicio baja un aviso tipo "trofeo"; al completar el día, una
   celebración a pantalla completa. Frases y emojis en data/logros.json, al azar.
   Son popovers: viven en la "capa superior" del navegador, así se ven encima del modal. */
const LOGROS_DEFAULT = {
  ejercicio: { titulo: 'Logro desbloqueado', emojis: ['🔥'], frases: ['Ah, bárbaro'] },
  dia: { titulo: 'Día completado', emojis: ['🏆'], frases: ['Eres leyenda, Rey'] },
};
const lastPick = {};
function pick(key, arr) { // al azar, sin repetir el anterior
  let i = Math.floor(Math.random() * arr.length);
  if (arr.length > 1 && i === lastPick[key]) i = (i + 1) % arr.length;
  lastPick[key] = i;
  return arr[i];
}
function showLayer(el) {
  // Con el modal abierto, todo lo de afuera es "inerte": tocar el aviso cerraría el modal.
  // Por eso el aviso se mueve dentro del modal mientras esté abierto.
  const host = $('#sheet').open ? $('#sheet') : document.body;
  if (el.parentNode !== host) host.append(el);
  if (el.showPopover) { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); }
  else el.hidden = false;
}
function hideLayer(el) {
  if (el.hidePopover) { if (el.matches(':popover-open')) el.hidePopover(); }
  else el.hidden = true;
}
let trophyTimer;
function celebrate(kind) {
  const L = (state.logros || LOGROS_DEFAULT)[kind];
  const emoji = pick(kind + 'e', L.emojis), frase = pick(kind + 'f', L.frases);
  if (navigator.vibrate) navigator.vibrate(kind === 'dia' ? [40, 60, 40, 60, 120] : [30, 50, 60]);
  if (kind === 'ejercicio') {
    const t = $('#trophy');
    t.innerHTML = `<span class="tr-emoji">${emoji}</span>
      <span class="tr-text"><small>🏆 ${esc(L.titulo)}</small><b class="flashy">${esc(frase)}</b></span>`;
    showLayer(t);
    clearTimeout(trophyTimer);
    trophyTimer = setTimeout(() => hideLayer(t), 3200);
    return;
  }
  hideLayer($('#trophy'));
  const colors = ['#ff2bd6', '#22e4ff', '#ffe259', '#d2fa3c', '#ff7a6b', '#8b3dff'];
  let confetti = '';
  for (let i = 0; i < 48; i++) {
    confetti += `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.6).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s;--x:${Math.round(Math.random() * 120 - 60)}px;--r:${Math.round(Math.random() * 720)}deg"></i>`;
  }
  const p = $('#party');
  p.innerHTML = `<div class="confetti">${confetti}</div>
    <div class="party-box"><span class="party-emoji">${emoji}</span>
    <p class="party-title flashy">${esc(L.titulo)}</p><p class="party-frase">${esc(frase)}</p>
    ${workoutMin(ymd(dateFor(state.dayIdx))) ? `<p class="party-time">⏱ en ${workoutMin(ymd(dateFor(state.dayIdx)))} min</p>` : ''}
    <small>Toca para cerrar</small></div>`;
  showLayer(p);
  setTimeout(() => hideLayer(p), 6000);
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, onClick, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  t.onclick = () => { t.hidden = true; onClick && onClick(); };
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- Saltar al siguiente ejercicio ----------
   Al completar un ejercicio desde la lista: la tarjeta destella, la lista se desliza al
   siguiente pendiente y este entra con un barrido de luz y la etiqueta "SIGUE". */
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function flashClass(el, cls, ms) {
  el.classList.remove(cls); void el.offsetWidth; // reinicia la animación si ya estaba
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
function jumpToNext(day, ex, dateKey) {
  const list = day.exercises, k = list.indexOf(ex);
  const pending = (e) => marks(dateKey, e).filter(Boolean).length < setsOf(e);
  const next = [...list.slice(k + 1), ...list.slice(0, k)].find(pending);
  const card = (e) => $('#list').querySelector(`.sets [data-ex="${e.id}"]`)?.closest('.card');
  const from = card(ex), to = next && card(next);
  if (from) flashClass(from, 'just-done', 700);
  if (!to) return;
  const still = reduceMotion();
  setTimeout(() => {
    to.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => flashClass(to, 'up-next', 1800), still ? 0 : 250);
  }, still ? 0 : 550);
}

/* ---------- Eventos ---------- */
function onSetClick(e) {
  const b = e.target.closest('.set');
  if (!b) return false;
  const day = dayView(state.dayIdx);
  const ex = day.exercises.find((x) => x.id === b.dataset.ex);
  const dateKey = ymd(dateFor(state.dayIdx));
  toggleSet(dateKey, ex, +b.dataset.i);
  refreshCard(ex.id);
  const on = !!marks(dateKey, ex)[+b.dataset.i];
  const exDone = on && marks(dateKey, ex).filter(Boolean).length >= setsOf(ex);
  const p = dayProgress(day, dateKey);
  sfx(!on ? 'unmark' : p.done >= p.total ? 'day' : exDone ? 'exercise' : 'mark');
  if (on && p.done >= p.total) celebrate('dia');
  else if (exDone) {
    celebrate('ejercicio');
    if (b.closest('#list')) jumpToNext(day, ex, dateKey);
  }
  afterMark(day, ex, on);
  // En el modal de una superserie, resalta el botón para cambiar de ejercicio.
  const nx = b.closest('#sheetBody')?.querySelector('.s-next.ss');
  if (nx && rest && rest.mode === 'next') { nx.classList.remove('nudge'); void nx.offsetWidth; nx.classList.add('nudge'); }
  return true;
}
function bind() {
  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    state.dayIdx = +t.dataset.day; renderDay(); window.scrollTo({ top: 0 }); sfx('move');
  });
  $('#list').addEventListener('click', (e) => {
    if (onSetClick(e)) return;
    const o = e.target.closest('[data-open]'); if (o) openExercise(o.dataset.open);
  });
  $('#sheetBody').addEventListener('click', (e) => {
    if (onNoteClick(e) || onSetClick(e)) return;
    const o = e.target.closest('[data-open]'); if (o) openExercise(o.dataset.open);
  });
  $('#sheetBody').addEventListener('input', (e) => {
    const n = notes[state.sheetEx];
    if (e.target.id !== 'noteText' || !n) return;
    n.note = e.target.value; n.fecha = ymd(new Date());
    saveNotes();
  });
  $('#restBar').addEventListener('click', onRestClick);
  $('#sheetRest').addEventListener('click', onRestClick);
  $('#themePick').addEventListener('click', (e) => { const b = e.target.closest('[data-theme-set]'); if (b) { setTheme(b.dataset.themeSet); sfx('tap'); } });
  $('#sfxBtn').addEventListener('click', () => setSfx(!sfxOn));
  $('#trophy').addEventListener('click', () => hideLayer($('#trophy')));
  $('#party').addEventListener('click', () => hideLayer($('#party')));
  $('#weekBody').addEventListener('click', (e) => {
    const s = e.target.closest('[data-ab]');
    if (s) {
      setWeekLetter(s.dataset.ab); clearRest(); renderDay(); renderWeek(); sfx('tap');
      return;
    }
    const g = e.target.closest('[data-goto]'); if (!g) return;
    state.dayIdx = +g.dataset.goto; $('#week').close(); renderDay();
  });
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    d.addEventListener('close', () => { if (d.id === 'sheet') clearInterval(state.animTimer); resetArm(); sfx('close'); });
  });
  $('#weekBtn').addEventListener('click', () => { renderWeek(); sfx('open'); });
  $('#menuBtn').addEventListener('click', () => { $('#menu').showModal(); sfx('open'); });
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
    // Android "despierta" la app desde recientes sin recargarla: busca versión nueva al volver
    // a primer plano (solo descarga sw.js; lo demás únicamente si de verdad cambió).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
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
  fetch('data/logros.json').then((r) => r.json()).then((d) => { state.logros = d; }).catch(() => {});
  if (!HTMLElement.prototype.showPopover) ['#trophy', '#party'].forEach((s) => { $(s).hidden = true; });
  bind();
  try { applyTheme(localStorage.getItem(THEME_KEY) || 'auto'); } catch { applyTheme('auto'); }
  renderSfxBtn();
  renderDay();
  renderRest();
  registerSW();
}
init();
