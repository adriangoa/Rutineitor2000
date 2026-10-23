/* Rutineitor 2000 — rutina semanal con checklist, sin internet. */
'use strict';

const BUILD = 'dev'; // lo reemplaza scripts/build.mjs al publicar
const LOG_KEY = 'r2k.log.v1';
const REST_KEY = 'r2k.rest.v1';
const THEME_KEY = 'r2k.theme';
const SFX_KEY = 'r2k.sfx';
const SHAMUCO_KEY = 'r2k.shamuco';
const AB_KEY = 'r2k.ab.v1';
const NOTES_KEY = 'r2k.notes.v1';
const TIMES_KEY = 'r2k.times.v1';
const BACKUP_KEY = 'r2k.backup.v1';
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
  renderShamuco(dateKey, p.pct);
  renderTabs();
  renderCover();
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

/* ---------- Rachas ----------
   Un día cuenta como cumplido con ≥ 80 % de sus series (saltarte el cardio no rompe la racha).
   Sábados y domingos no cuentan; hoy no rompe la racha mientras no termine. */
const STREAK_PCT = 0.8;
function dayOk(d) {
  const wd = weekdayIdx(d);
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd);
  const w = Math.round((mon - baseMonday()) / 604800000);
  return dayProgress(dayView(wd, w), ymd(d)).pct >= STREAK_PCT;
}
function streakDays() {
  const now = new Date();
  let n = 0;
  for (let k = 0; k < 400; k++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k);
    if (weekdayIdx(d) > 4) continue;
    if (dayOk(d)) n++;
    else if (k === 0) continue; // hoy todavía no termina
    else break;
  }
  return n;
}
function streakWeeks() {
  let n = 0;
  for (let w = 0; w > -60; w--) {
    const full = [0, 1, 2, 3, 4].every((i) => dayOk(dateFor(i, w)));
    if (full) n++;
    else if (w === 0) continue; // la semana actual todavía no termina
    else break;
  }
  return n;
}
const isMilestone = (n) => n === 3 || (n >= 5 && n % 5 === 0);
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

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
  const sd = streakDays(), sw = streakWeeks();
  const streak = sd
    ? `<div class="streak"><span class="streak-fire">🔥</span><div><b>Racha de ${plural(sd, 'día', 'días')}</b>
        <small>${sw ? `${plural(sw, 'semana completa', 'semanas completas')} seguidas` : 'Días cumplidos con 80 % o más de las series'}</small></div></div>`
    : `<div class="streak off"><span class="streak-fire">🔥</span><div><b>Empieza tu racha hoy</b>
        <small>Cuenta cada día que completes el 80 % o más de las series</small></div></div>`;
  $('#weekBody').innerHTML = `${streak}<div class="ab-row"><span>Esta semana toca <b class="wk-badge">Semana ${L}</b></span>
      <button class="ab-switch" data-ab="${other}">Cambiar a ${other}</button></div>
    <p class="hist-title">Esta semana (desde el ${fmtShort(dateFor(0))})</p>
    <div class="week-now">${now}</div><p class="hist-title">Semanas anteriores</p>${rows}`;
  if (!$('#week').open) $('#week').showModal();
}

/* ---------- Respaldo ---------- */
/* Recordatorio: el registro vive solo en el celular. Si pasan 4 semanas sin exportar (o desde el
   primer registro si nunca has exportado), al abrir sale un aviso, máximo uno al día (r2k.backup.v1). */
const BACKUP_DAYS = 28;
let backupInfo = (() => { try { return JSON.parse(localStorage.getItem(BACKUP_KEY)) || {}; } catch { return {}; } })();
function saveBackupInfo() { try { localStorage.setItem(BACKUP_KEY, JSON.stringify(backupInfo)); } catch {} }
const daysSince = (key) => Math.round((parseYmd(ymd(new Date())) - parseYmd(key)) / 86400000);
function renderBackupBtn() {
  const last = backupInfo.last;
  const txt = !last ? 'Aún no has exportado ninguno' : daysSince(last) === 0 ? 'Último respaldo: hoy' : `Último respaldo: hace ${plural(daysSince(last), 'día', 'días')}`;
  $('#exportBtn small').textContent = `${txt} · descarga todo tu registro`;
}
function checkBackupReminder() {
  const first = Object.keys(log).sort()[0];
  const ref = backupInfo.last || first;
  const today = ymd(new Date());
  if (!ref || daysSince(ref) < BACKUP_DAYS || backupInfo.nag === today) return;
  if (!$('#toast').hidden) return; // no tapes el aviso de actualización
  backupInfo.nag = today; saveBackupInfo();
  const weeks = Math.floor(daysSince(ref) / 7);
  toast(`📦 ${backupInfo.last ? `Hace ${weeks} semanas que no respaldas` : 'Aún no respaldas'} tu registro · Toca para exportar`, exportBackup, 10000);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'rutineitor2000', exported: new Date().toISOString(), log, ab: abOverrides, notas: notes, tiempos: times }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rutineitor-respaldo-${ymd(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Respaldo descargado');
  backupInfo.last = ymd(new Date()); saveBackupInfo(); renderBackupBtn();
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
  // Cuenta regresiva: 3 bips cortos en los últimos 3 s (si alcanzan a sonar).
  [3, 2, 1].forEach((s) => {
    const t = t0 - s;
    if (t <= ctx.currentTime + 0.05) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.21, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.15);
    chime.push(o);
  });
  // "Ding-dong" grave (mi5 → do5), con caída suave.
  [[659.25, 0], [523.25, 0.32]].forEach(([freq, dt]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0 + dt);
    g.gain.linearRampToValueAtTime(0.48, t0 + dt + 0.02);
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
    const ex = dayView(rest.day).exercises.find((e) => e.id === rest.exId) || { name: '' };
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
  // En la portada la superserie ya cambia sola de ejercicio: el aviso "Ahora: X" sobra.
  if (rest && rest.mode === 'next' && coverMQ.matches) $('#restBar').hidden = true;
  document.body.classList.toggle('resting', !$('#restBar').hidden);
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
    if (coverMQ.matches) coverShow(exId, 1); else openExercise(exId);
  } else adjustRest(+a);
}

/* ---------- Modo portada (pantalla externa del Razr) ----------
   Se activa en pantallas muy bajitas (la externa mide 469 × 318; el cel abierto nunca baja de 411 de alto).
   Un ejercicio a la vez con botones grandes, flechas ‹ › y avance automático. */
const coverMQ = matchMedia('(max-height: 360px)');
function coverDay() { return dayView(state.dayIdx); }
const coverPending = (e, dateKey) => marks(dateKey, e).filter(Boolean).length < setsOf(e);
function coverCurrent() {
  const day = coverDay(), dateKey = ymd(dateFor(state.dayIdx));
  return day.exercises.find((e) => e.id === state.coverEx)
    || day.exercises.find((e) => coverPending(e, dateKey)) || day.exercises[day.exercises.length - 1];
}
function renderCover(dir = 0) {
  if (!coverMQ.matches) return;
  const day = coverDay(), date = dateFor(state.dayIdx), dateKey = ymd(date);
  const p = dayProgress(day, dateKey);
  const ex = coverCurrent();
  state.coverEx = ex.id;
  const k = day.exercises.indexOf(ex), g = groupOf(day, ex);
  const head = `<div class="cv-head"><b>${DAY_SHORT[state.dayIdx]} · ${esc(day.focus)}</b><span class="wk-badge">${weekLetter()}</span>
    <span class="cv-prog"><i style="width:${Math.round(p.pct * 100)}%"></i></span><span class="cv-count">${p.done}/${p.total}</span></div>`;
  if (p.done >= p.total) {
    const min = workoutMin(dateKey), sd = streakDays();
    $('#cover').innerHTML = `${head}<div class="cv-done"><span>🏆</span><b>Día completo</b>
      <small>${min ? `⏱ ${min} min` : ''}${min && sd >= 2 ? ' · ' : ''}${sd >= 2 ? `🔥 ${sd} días seguidos` : ''}</small></div>`;
    return;
  }
  const img = ex.type === 'cardio'
    ? `<div class="cv-img cardio">${CARDIO_ICON}</div>`
    : `<button class="cv-img" data-cv-flip aria-label="Ver posición final"><img src="images/${ex.img}/0.webp" alt=""><img class="f1" src="images/${ex.img}/1.webp" alt=""></button>`;
  const meta = ex.type === 'cardio' ? esc(ex.duration) : `${ex.sets} × ${esc(ex.reps)}${ex.variant ? ' · ' + esc(ex.variant) : ''}`;
  $('#cover').innerHTML = `${head}
    <div class="cv-main">
      <button class="cv-nav" data-cv-nav="-1" aria-label="Ejercicio anterior"${k === 0 ? ' disabled' : ''}>‹</button>
      <div class="cv-card${dir ? (dir > 0 ? ' in-next' : ' in-prev') : ''}">
        ${img}
        <div class="cv-info">
          ${g ? `<span class="ss-badge">Superserie ${esc(ex.ss)} · ${g.indexOf(ex) + 1} de ${g.length}</span>` : `<span class="cv-num">${k + 1} de ${day.exercises.length}</span>`}
          <span class="cv-name">${esc(ex.name)}</span>
          <span class="cv-meta">${meta}</span>
        </div>
        <div class="cv-sets sets">${setButtons(dateKey, ex)}</div>
      </div>
      <button class="cv-nav" data-cv-nav="1" aria-label="Ejercicio siguiente"${k === day.exercises.length - 1 ? ' disabled' : ''}>›</button>
    </div>`;
}
function coverShow(exId, dir = 1) { state.coverEx = exId; renderCover(dir); }
// Después de marcar una serie en la portada: en superserie alterna al que sigue del grupo con series
// pendientes; si el ejercicio quedó completo, pasa al siguiente pendiente del día.
function coverAfterMark(ex, on) {
  if (!on) return;
  const day = coverDay(), dateKey = ymd(dateFor(state.dayIdx));
  const g = groupOf(day, ex);
  let target = null;
  if (g) {
    const i = g.indexOf(ex);
    target = [...g.slice(i + 1), ...g.slice(0, i)].find((e) => coverPending(e, dateKey));
  }
  if (!target && !coverPending(ex, dateKey)) {
    const k = day.exercises.indexOf(ex);
    target = [...day.exercises.slice(k + 1), ...day.exercises.slice(0, k)].find((e) => coverPending(e, dateKey));
  }
  if (target && target !== ex) setTimeout(() => coverShow(target.id, 1), reduceMotion() ? 0 : 600);
}
function onCoverClick(e) {
  if (onSetClick(e)) return;
  const n = e.target.closest('[data-cv-nav]');
  if (n) {
    const day = coverDay(), k = day.exercises.findIndex((x) => x.id === state.coverEx) + +n.dataset.cvNav;
    if (day.exercises[k]) { coverShow(day.exercises[k].id, +n.dataset.cvNav); sfx('move'); }
    return;
  }
  const f = e.target.closest('[data-cv-flip]');
  if (f) f.classList.toggle('show1');
}

/* ---------- Tema ---------- */
/* Temas de temporada: cada uno es un tema CSS ([data-theme="<id>"]) y, opcional, frases y emojis
   propios en logros.json → temporadas.<id>. Para agregar uno: entrada aquí + CSS + (opcional) frases.
   "season-auto" elige el de la fecha actual según `months`; si no hay, usa el automático normal. */
const SEASONS = {
  halloween: { name: 'Halloween', icon: '🎃', months: [10], bg: '#0f0a14' },
};
const THEME_BG = { hc: '#000000', synth: '#12061f', gb: '#5b3f8f', ...Object.fromEntries(Object.entries(SEASONS).map(([k, s]) => [k, s.bg])) };
const seasonForDate = (d = new Date()) => Object.keys(SEASONS).find((k) => SEASONS[k].months.includes(d.getMonth() + 1)) || null;
const isSeasonChoice = (t) => t === 'season-auto' || !!SEASONS[t];
let themeChoice = 'auto';
// Temporada activa (la elegida o la de la fecha), para las frases de los logros.
const activeSeason = () => { const t = themeChoice === 'season-auto' ? seasonForDate() : themeChoice; return SEASONS[t] ? t : null; };
function renderSeasonPick() {
  const now = seasonForDate();
  $('#seasonPick').innerHTML = `<button data-theme-set="season-auto">Automático por fecha<small>${now ? `Ahora: ${SEASONS[now].icon} ${SEASONS[now].name}` : 'Este mes no hay tema; usa el normal'}</small></button>`
    + Object.entries(SEASONS).map(([k, s]) => `<button data-theme-set="${k}">${s.icon} ${esc(s.name)}</button>`).join('');
}
function applyTheme(t) {
  themeChoice = t;
  const root = document.documentElement;
  const r = t === 'season-auto' ? seasonForDate() : t; // el tema que de verdad se pinta
  if (THEME_BG[r]) root.dataset.theme = r; else delete root.dataset.theme;
  // El script del <head> no conoce las fechas: le dejamos resuelto el tema automático de temporada.
  try { localStorage.setItem(THEME_KEY + '.auto', THEME_BG[r] ? r : 'auto'); } catch {}
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas[0].content = THEME_BG[r] || '#0d0e0b';
  metas[1].content = THEME_BG[r] || '#f3f3ee';
  renderSeasonPick();
  $('#seasonPick').hidden = !isSeasonChoice(t);
  document.querySelectorAll('[data-theme-set]').forEach((b) => {
    const v = b.dataset.themeSet;
    b.setAttribute('aria-pressed', v === 'season' ? isSeasonChoice(t) : v === t || (v === 'auto' && !THEME_BG[t] && !isSeasonChoice(t)));
  });
}
function setTheme(t) {
  if (t === 'season') t = isSeasonChoice(themeChoice) ? themeChoice : 'season-auto';
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

/* ---------- Shamuco (mascota) ----------
   Demonio de caricatura dibujado en SVG desde código (sin imágenes ni datos). Recibe el
   progreso del día p (0 a 1) y de ahí calcula cada medida: de flaquito y kawaii a mamado.
   Al 100 % hace flex. Se apaga en ⋮ Opciones (r2k.shamuco = "0"). */
function shamucoSVG(p, flex = false) {
  const L = (a, b) => +(a + (b - a) * p).toFixed(1);   // de a (0 %) a b (100 %)
  const C = (x) => Math.max(0, Math.min(1, x));
  const skin = '#e8392f', shade = '#b8231d', hi = '#ff8a75', ink = '#2a0b0b', horn = '#3b3846';
  const cx = 100, ground = 214;
  const legH = L(18, 26), legW = L(10, 22);
  const hip = ground - legH;
  const bh = L(44, 80);          // alto del torso
  const top = hip - bh;          // hombros
  const sw = L(24, 66);          // medio ancho de hombros
  const ww = L(22, 32);          // medio ancho de cintura
  const hr = L(40, 26);          // radio de la cabeza (grande de chiquito = kawaii)
  const hy = top - hr * 0.6;
  const at = L(7, 20);           // grosor de brazos
  const bulge = L(0, 10);        // bíceps
  const er = L(13, 8);           // ojos
  const hl = L(10, 30);          // largo de cuernos
  const m = C((p - 0.35) / 0.65); // qué tan marcados se ven los músculos
  const s = [];

  // Junta piezas en una silueta con contorno: primero todas en negro más gruesas, luego el color encima.
  const lump = (parts, fill) => {
    const draw = (color, extra) => parts.map(([tag, a, w]) => w
      ? `<${tag} ${a} fill="none" stroke="${color}" stroke-width="${w + extra}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<${tag} ${a} fill="${color}"${extra ? ` stroke="${color}" stroke-width="${extra}" stroke-linejoin="round"` : ''}/>`).join('');
    return draw(ink, 6) + draw(fill, 0);
  };

  // Sombra en el piso
  s.push(`<ellipse cx="${cx}" cy="${ground + 2}" rx="${L(34, 60)}" ry="6" fill="#000" opacity=".18"/>`);

  // Cola con punta de flecha (detrás del cuerpo)
  const tx = cx + ww * 0.6, ty = hip - 6, px = tx + 46, py = ty - 38;
  s.push(lump([['path', `d="M${tx} ${ty} C${tx + 40} ${ty + 20} ${tx + 58} ${ty - 10} ${px} ${py}"`, L(4, 6)]], skin));
  s.push(lump([['path', `d="M${px} ${py - 14} Q${px + 13} ${py - 2} ${px + 9} ${py + 6} L${px} ${py + 1} L${px - 9} ${py + 6} Q${px - 13} ${py - 2} ${px} ${py - 14} Z"`]], skin));

  // Cuernos (antes de la cabeza para que la base quede tapada)
  [-1, 1].forEach((d) => {
    const bx = cx + d * hr * 0.5, by = hy - hr * 0.72;
    s.push(`<path d="M${bx + d * 8} ${by + 4} Q${bx + d * (8 + hl * 0.6)} ${by - hl * 0.4} ${bx + d * hl * 0.35} ${by - hl} Q${bx + d * hl * 0.15} ${by - hl * 0.45} ${bx - d * 6} ${by + 4} Z" fill="${horn}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`);
    s.push(`<path d="M${bx + d * 2} ${by - 1} Q${bx + d * hl * 0.3} ${by - hl * 0.4} ${bx + d * hl * 0.3} ${by - hl * 0.75}" fill="none" stroke="#77738a" stroke-width="2" stroke-linecap="round"/>`);
  });

  // Piernas y pies
  s.push(lump([-1, 1].flatMap((d) => {
    const lx = cx + d * ww * 0.5;
    return [['rect', `x="${lx - legW / 2}" y="${hip - 8}" width="${legW}" height="${legH + 6}" rx="${legW / 2}"`],
            ['ellipse', `cx="${lx + d * 4}" cy="${ground - 3}" rx="${legW * 0.75 + 3}" ry="${L(5, 7)}"`]];
  }), skin));

  // Torso + cuello + orejas + cabeza, como una sola silueta
  const ew = L(20, 12);
  s.push(lump([
    ['polygon', `points="${cx - hr * 0.55},${hy + hr * 0.4} ${cx + hr * 0.55},${hy + hr * 0.4} ${cx + sw * 0.55},${top + 6} ${cx - sw * 0.55},${top + 6}"`],
    ['path', `d="M${cx - sw} ${top + 12} Q${cx - sw} ${top} ${cx - sw + 16} ${top} L${cx + sw - 16} ${top} Q${cx + sw} ${top} ${cx + sw} ${top + 12} Q${cx + ww + 6} ${hip - 14} ${cx + ww} ${hip} Q${cx} ${hip + 10} ${cx - ww} ${hip} Q${cx - ww - 6} ${hip - 14} ${cx - sw} ${top + 12} Z"`],
    ...[-1, 1].map((d) => {
      const ox = cx + d * hr * 0.9, oy = hy;
      return ['path', `d="M${ox} ${oy - 9} Q${ox + d * ew * 0.7} ${oy - 12} ${ox + d * ew} ${oy - 20} Q${ox + d * ew * 0.55} ${oy + 6} ${ox} ${oy + 10} Z"`];
    }),
    ['ellipse', `cx="${cx}" cy="${hy}" rx="${hr}" ry="${hr * 0.92}"`],
  ], skin));
  // Brillos (estilo caricatura)
  s.push(`<ellipse cx="${cx - hr * 0.4}" cy="${hy - hr * 0.55}" rx="${hr * 0.28}" ry="${hr * 0.12}" fill="${hi}" transform="rotate(-25 ${cx - hr * 0.4} ${hy - hr * 0.55})"/>`);
  [-1, 1].forEach((d) => s.push(`<ellipse cx="${cx + d * sw * 0.62}" cy="${top + 6}" rx="${sw * 0.18}" ry="3.5" fill="${hi}" opacity=".8"/>`));

  // Músculos: pecho, línea central y cuadritos (aparecen con el progreso)
  if (m > 0) {
    s.push(`<g fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" opacity="${m}">
      <path d="M${cx - sw * 0.75} ${top + bh * 0.36} Q${cx - sw * 0.35} ${top + bh * 0.48} ${cx - 1} ${top + bh * 0.34}"/>
      <path d="M${cx + sw * 0.75} ${top + bh * 0.36} Q${cx + sw * 0.35} ${top + bh * 0.48} ${cx + 1} ${top + bh * 0.34}"/>
      <path d="M${cx} ${top + bh * 0.14} V${top + bh * 0.36} M${cx} ${top + bh * 0.48} V${hip - 18}"/>
      ${[0.55, 0.68, 0.8].map((f) => `<path d="M${cx - ww * 0.55} ${top + bh * f} q${ww * 0.27} 3 ${ww * 0.5} 0 M${cx + ww * 0.55} ${top + bh * f} q${-ww * 0.27} 3 ${-ww * 0.5} 0"/>`).join('')}
    </g>`);
    [-1, 1].forEach((d) => s.push(`<ellipse cx="${cx + d * sw * 0.38}" cy="${top + bh * 0.24}" rx="${sw * 0.22}" ry="${bh * 0.06}" fill="${hi}" opacity="${m * 0.7}"/>`));
  }

  // Taparrabo gris de chiquito → cinturón con hebilla y taparrabo de cuero de mamado
  if (p < 0.7) {
    s.push(`<path d="M${cx - ww - 3} ${hip - 16} L${cx + ww + 3} ${hip - 16} L${cx + ww + 1} ${hip} Q${cx} ${hip + 10} ${cx - ww - 1} ${hip} Z" fill="#7b7b88" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`);
    s.push(`<path d="M${cx - ww * 0.4} ${hip - 13} q4 6 2 12 M${cx + ww * 0.3} ${hip - 13} q-3 6 0 12" fill="none" stroke="#55555f" stroke-width="2"/>`);
  } else {
    const fl = hip + 22;
    s.push(`<path d="M${cx - ww * 0.55} ${hip - 8} L${cx + ww * 0.55} ${hip - 8} L${cx + ww * 0.5} ${fl} l-6 -5 l-5 6 l-6 -5 l-5 5 L${cx - ww * 0.5} ${fl} Z" fill="#c9a26b" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`);
    s.push(`<rect x="${cx - ww - 4}" y="${hip - 20}" width="${ww * 2 + 8}" height="11" rx="3" fill="#5a3a22" stroke="${ink}" stroke-width="3"/>`);
    s.push(`<rect x="${cx - 7}" y="${hip - 22}" width="14" height="15" rx="2" fill="#e0b33c" stroke="${ink}" stroke-width="2.5"/>`);
    s.push(`<rect x="${cx - 3}" y="${hip - 18}" width="6" height="7" fill="#5a3a22"/>`);
  }

  // Brazos: colgando o haciendo flex
  const arm = (d) => {
    const shx = cx + d * (sw - at * 0.3), shy = top + at * 0.6;
    let ex, ey, hx, hy2;
    if (flex) { ex = shx + d * L(26, 34); ey = shy + 4; hx = ex - d * 2; hy2 = ey - L(36, 54); }
    else { ex = shx + d * L(4, 12); ey = shy + L(22, 30); hx = ex + d * 2; hy2 = ey + L(20, 26); }
    const parts = [['path', `d="M${shx} ${shy} L${ex} ${ey} L${hx} ${hy2}"`, at]];
    let bx, by, br;
    if (bulge > 1) {
      bx = flex ? (shx + ex) / 2 : (shx * 0.45 + ex * 0.55);
      by = flex ? shy - bulge * 1.1 : (shy * 0.45 + ey * 0.55);
      br = at / 2 + bulge;
      parts.push(['ellipse', `cx="${bx}" cy="${by}" rx="${br * (flex ? 1 : 0.8)}" ry="${br * (flex ? 0.8 : 1)}"`]);
    }
    parts.push(['circle', `cx="${hx}" cy="${hy2}" r="${at / 2 + 3}"`]);
    s.push(lump(parts, skin));
    if (bx) s.push(`<ellipse cx="${bx - d * br * 0.2}" cy="${by - br * 0.35}" rx="${br * 0.4}" ry="${br * 0.18}" fill="${hi}" opacity="${m}"/>`);
    // Nudillos
    const k = flex ? 1 : -1;
    s.push(`<path d="M${hx - at * 0.3} ${hy2 + k * at * 0.1} h${at * 0.6} M${hx - at * 0.3} ${hy2 - k * at * 0.2} h${at * 0.6}" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/>`);
    // Muñequeras de cuero (mamado): banda corta justo antes del puño, con extremos rectos para no tapar la mano
    if (p >= 0.7) {
      const len = Math.hypot(hx - ex, hy2 - ey), ux = (hx - ex) / len, uy = (hy2 - ey) / len;
      const e2 = len - (at / 2 + 3), e1 = e2 - 7;
      const seg = `d="M${ex + ux * e1} ${ey + uy * e1} L${ex + ux * e2} ${ey + uy * e2}"`;
      s.push(`<path ${seg} stroke="${ink}" stroke-width="${at + 9}"/><path ${seg} stroke="#5a3a22" stroke-width="${at + 3}"/>`);
    }
  };
  arm(-1); arm(1);

  // Cara
  const ey = hy + hr * 0.02;
  [-1, 1].forEach((d) => {
    const ex = cx + d * hr * 0.38;
    s.push(`<ellipse cx="${ex}" cy="${ey}" rx="${er}" ry="${er * 1.15}" fill="#fff" stroke="${ink}" stroke-width="2.5"/>`);
    s.push(`<circle cx="${ex - d * er * 0.2 * p}" cy="${ey + er * 0.15}" r="${er * L(0.62, 0.42)}" fill="${ink}"/>`);
    if (p < 0.6) s.push(`<circle cx="${ex - er * 0.2}" cy="${ey - er * 0.2}" r="${er * 0.22}" fill="#fff"/>`);
    // Párpado + ceja de enojo: la parte de adentro baja conforme avanza
    const a = C((p - 0.25) / 0.6), kk = a * er * 1.1;
    const ix = ex - d * er * 1.35, ox = ex + d * er * 1.35;
    const yo = ey - er * 1.25 + kk * 0.2, yi = ey - er * 1.25 + kk;
    if (a > 0) s.push(`<polygon points="${ox},${yo} ${ix},${yi} ${ix},${ey - er * 2.3} ${ox},${ey - er * 2.3}" fill="${skin}"/>`);
    if (p > 0.15) s.push(`<path d="M${ox} ${yo - 1} L${ix} ${yi - 1}" stroke="${ink}" stroke-width="${L(3, 6)}" stroke-linecap="round" opacity="${C((p - 0.15) * 5)}"/>`);
  });
  // Nariz
  s.push(`<ellipse cx="${cx}" cy="${hy + hr * 0.3}" rx="${L(4, 6)}" ry="${L(3.5, 5)}" fill="${shade}" stroke="${ink}" stroke-width="2"/>`);
  // Boca: sonrisa traviesa con un colmillo → bocota con dientes de sierra
  const my = hy + hr * 0.5;
  if (p < 0.35) {
    s.push(`<path d="M${cx - 8} ${my - 2} Q${cx} ${my + 6} ${cx + 8} ${my - 2}" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>`);
    s.push(`<path d="M${cx + 2} ${my + 1.5} l2.5 5 l2.5 -5.8 Z" fill="#fff" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>`);
    s.push([-1, 1].map((d) => `<ellipse cx="${cx + d * hr * 0.62}" cy="${ey + er * 1.45}" rx="7" ry="4" fill="#ff9a8a" opacity="${1 - p * 2.5}"/>`).join(''));
  } else {
    const mw = L(6, 17), mh = L(5, 12);
    s.push(`<path d="M${cx - mw} ${my - 3} Q${cx} ${my + 1} ${cx + mw} ${my - 3} Q${cx + mw * 0.6} ${my + mh} ${cx} ${my + mh} Q${cx - mw * 0.6} ${my + mh} ${cx - mw} ${my - 3} Z" fill="#5a0f12" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
    const n = 5, x0 = cx - mw * 0.8, w = (mw * 1.6) / n, tip = my + L(2, 5);
    let pts = `${x0},${my - 2}`;
    for (let i = 0; i < n; i++) pts += ` ${x0 + (i + 0.5) * w},${tip} ${x0 + (i + 1) * w},${my - 2}`;
    s.push(`<polygon points="${pts}" fill="#fff" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>`);
    [-1, 1].forEach((d) => s.push(`<path d="M${cx + d * mw * 0.45 - 3} ${my + mh * 0.9} L${cx + d * mw * 0.45} ${my + mh * 0.4} L${cx + d * mw * 0.45 + 3} ${my + mh * 0.9} Z" fill="#fff" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>`));
  }
  // Gotita de sudor a media rutina
  if (p > 0.2 && p < 0.9) s.push(`<path d="M${cx + hr * 0.95} ${hy - hr * 0.6} q-7 10 0 13 q7 -3 0 -13 z" fill="#8fd8ff" stroke="${ink}" stroke-width="2"/>`);

  return `<svg viewBox="-20 20 240 205">${s.join('')}</svg>`;
}
let shamucoOn = (() => { try { return localStorage.getItem(SHAMUCO_KEY) !== '0'; } catch { return true; } })();
let shamucoLast = null; // { key, p } lo último dibujado, para saber si creció
function renderShamuco(dateKey, p) {
  const el = $('#shamuco');
  el.hidden = !shamucoOn;
  if (!shamucoOn) return;
  const prev = shamucoLast;
  shamucoLast = { key: dateKey, p };
  if (prev && prev.key === dateKey && prev.p === p) return; // nada cambió: no redibujar
  el.innerHTML = shamucoSVG(p, p >= 1);
  // Saltito solo cuando crece en el mismo día (no al cambiar de pestaña)
  if (prev && prev.key === dateKey && p > prev.p && !reduceMotion()) flashClass(el, 'grow', 500);
}
function renderShamucoBtn() {
  const b = $('#shamucoBtn');
  b.setAttribute('aria-pressed', shamucoOn);
  b.querySelector('small').textContent = shamucoOn ? 'Activado · crece y se pone mamado conforme haces tus series' : 'Desactivado';
}
function setShamuco(on) {
  shamucoOn = on;
  try { localStorage.setItem(SHAMUCO_KEY, on ? '1' : '0'); } catch {}
  shamucoLast = null;
  renderShamucoBtn();
  updateProgress();
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
// Emoji animado (Noto Animated Emoji, CC BY 4.0) si está en logros.json → "animados"; si no, el del sistema.
const emojiCode = (e) => [...e].map((c) => c.codePointAt(0).toString(16)).filter((h) => h !== 'fe0f').join('_');
function emojiHTML(e) {
  const code = emojiCode(e);
  if (!((state.logros && state.logros.animados) || []).includes(code)) return e;
  return `<img class="anim-emoji" src="images/emoji/${code}.webp" alt="${esc(e)}" onerror="this.replaceWith(this.alt)">`;
}
let trophyTimer;
function celebrate(kind) {
  const season = activeSeason();
  const base = (state.logros || LOGROS_DEFAULT)[kind];
  // En temporada, sus frases/emojis/título reemplazan a los normales (si los tiene en logros.json).
  const L = { ...base, ...(season && state.logros?.temporadas?.[season]?.[kind]) };
  const emoji = pick(kind + 'e' + season, L.emojis), frase = pick(kind + 'f' + season, L.frases);
  if (navigator.vibrate) navigator.vibrate(kind === 'dia' ? [40, 60, 40, 60, 120] : [30, 50, 60]);
  if (kind === 'ejercicio') {
    const t = $('#trophy');
    t.innerHTML = `<span class="tr-emoji">${emojiHTML(emoji)}</span>
      <span class="tr-text"><small>🏆 ${esc(L.titulo)}</small><b class="flashy">${esc(frase)}</b></span>`;
    showLayer(t);
    clearTimeout(trophyTimer);
    trophyTimer = setTimeout(() => hideLayer(t), 3200);
    return;
  }
  hideLayer($('#trophy'));
  const sd = streakDays();
  // Colores del confeti: los del tema (--confetti en CSS) o los de siempre.
  const themed = getComputedStyle(document.documentElement).getPropertyValue('--confetti').trim();
  const colors = themed ? themed.split(/\s+/) : ['#ff2bd6', '#22e4ff', '#ffe259', '#d2fa3c', '#ff7a6b', '#8b3dff'];
  let confetti = '';
  for (let i = 0; i < 48; i++) {
    confetti += `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.6).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s;--x:${Math.round(Math.random() * 120 - 60)}px;--r:${Math.round(Math.random() * 720)}deg"></i>`;
  }
  const p = $('#party');
  p.innerHTML = `<div class="confetti">${confetti}</div>
    <div class="party-box"><span class="party-emoji">${emojiHTML(emoji)}</span>
    <p class="party-title flashy">${esc(L.titulo)}</p><p class="party-frase">${esc(frase)}</p>
    ${workoutMin(ymd(dateFor(state.dayIdx))) ? `<p class="party-time">⏱ en ${workoutMin(ymd(dateFor(state.dayIdx)))} min</p>` : ''}
    ${sd >= 2 ? `<p class="party-streak">🔥 ${isMilestone(sd) ? `<span class="flashy">¡Racha de ${sd} días!</span>` : `${sd} días seguidos`}</p>` : ''}
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
  const inCover = !!b.closest('#cover'); // antes de redibujar (la portada se redibuja al marcar)
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
  if (inCover) coverAfterMark(ex, on);
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
  $('#cover').addEventListener('click', onCoverClick);
  $('#installGo').addEventListener('click', () => { startInstall(); sfx('tap'); });
  $('#installLater').addEventListener('click', () => { snoozeInstall(); sfx('close'); });
  $('#installBtn').addEventListener('click', () => { startInstall(); sfx('tap'); });
  $('#shareBtn').addEventListener('click', () => { shareApp(); sfx('tap'); });
  $('#genBtn').addEventListener('click', openGenerator);
  $('#genAgain').addEventListener('click', () => { draft = generateRoutine(); renderDraft(); sfx('move'); });
  $('#genUse').addEventListener('click', useDraft);
  $('#genTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-gen-week]'); if (b) { draftWeek = b.dataset.genWeek; renderDraft(); sfx('tap'); } });
  $('#origBtn').addEventListener('click', backToOriginal);
  $('#welcomeNext').addEventListener('click', () => {
    if (welcomeStep < WELCOME.length - 1) { welcomeStep++; renderWelcome(); sfx('move'); }
    else $('#welcome').close();
  });
  $('#welcomeSkip').addEventListener('click', () => $('#welcome').close());
  $('#welcome').addEventListener('close', () => { markWelcome(); setTimeout(maybeShowInstallBar, 700); });
  coverMQ.addEventListener('change', () => { state.coverEx = null; renderDay(); });
  $('#sheetRest').addEventListener('click', onRestClick);
  ['#themePick', '#seasonPick'].forEach((s) => $(s).addEventListener('click', (e) => { const b = e.target.closest('[data-theme-set]'); if (b) { setTheme(b.dataset.themeSet); sfx('tap'); } }));
  $('#sfxBtn').addEventListener('click', () => setSfx(!sfxOn));
  $('#shamucoBtn').addEventListener('click', () => setShamuco(!shamucoOn));
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
  $('#menuBtn').addEventListener('click', () => {
    // Tamaño útil de pantalla: sirve para ajustar el modo de la pantalla externa del Razr.
    $('#screenText').textContent = `Pantalla: ${innerWidth} × ${innerHeight} · densidad ${devicePixelRatio}x`;
    $('#menu').showModal(); sfx('open');
  });
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ''; $('#menu').close(); });
  $('#resetBtn').addEventListener('click', () => {
    const b = $('#resetBtn');
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.firstChild.textContent = '¿Seguro? Toca otra vez'; return; }
    delete log[ymd(dateFor(state.dayIdx))]; saveLog(); renderDay(); $('#menu').close(); toast('Día reiniciado');
  });
}
function resetArm() {
  const b = $('#resetBtn'); b.classList.remove('armed'); b.firstChild.textContent = 'Reiniciar este día';
  const o = $('#origBtn'); o.classList.remove('armed'); o.firstChild.textContent = 'Volver a la rutina original';
}

/* ---------- Instalar como app ----------
   Si la abren desde el navegador (no instalada) sale un banner abajo. En Chrome/Android el botón
   lanza la instalación nativa (beforeinstallprompt); si no se puede, muestra los pasos según el navegador. */
const INSTALL_KEY = 'r2k.install.v1';
const UA = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => {
  installPrompt = null; $('#installBar').hidden = true; renderInstallUI();
  toast('¡Listo! Ábrela desde tu pantalla de inicio');
});
function renderInstallUI() { $('#installBtn').hidden = isStandalone(); }
function installSnoozed() {
  try { return (JSON.parse(localStorage.getItem(INSTALL_KEY)) || {}).until > Date.now(); } catch { return false; }
}
function maybeShowInstallBar() {
  if (isStandalone() || installSnoozed()) return;
  $('#installBar').hidden = false;
}
function snoozeInstall() { // "Ahora no": no vuelve a salir en 7 días
  try { localStorage.setItem(INSTALL_KEY, JSON.stringify({ until: Date.now() + 7 * 86400000 })); } catch {}
  $('#installBar').hidden = true;
}
async function startInstall() {
  $('#installBar').hidden = true;
  if ($('#menu').open) $('#menu').close();
  if (installPrompt) {
    const p = installPrompt;
    installPrompt = null; // solo se puede usar una vez
    try {
      await p.prompt();
      if ((await p.userChoice).outcome !== 'accepted') snoozeInstall();
      return;
    } catch { /* si el navegador no deja lanzarla, mostramos los pasos */ }
  }
  showInstallHelp();
}
function showInstallHelp() {
  const android = /Android/i.test(UA), samsung = /SamsungBrowser/i.test(UA);
  const chrome = /Chrome\//.test(UA) && !/EdgA|OPR|SamsungBrowser|Firefox/.test(UA);
  let steps, note = '';
  if (isIOS) {
    steps = ['Toca el botón <b>Compartir</b> (el cuadrito con la flecha hacia arriba; en Safari está abajo y en Chrome arriba a la derecha).',
      'Elige <b>Agregar a inicio</b>. Si no aparece, desliza la lista hacia abajo o ábrela en Safari.',
      'Toca <b>Agregar</b> y ábrela desde el ícono nuevo.'];
    note = 'En iPhone la app funciona, pero iOS no permite vibración en apps web y el aviso de fin de descanso podría no sonar con la pantalla apagada.';
  } else if (samsung) {
    steps = ['Toca el menú <b>☰</b> (abajo a la derecha).', 'Elige <b>Agregar página a</b> → <b>Pantalla de inicio</b>.', 'Ábrela desde el ícono nuevo.'];
  } else if (android && chrome) {
    steps = ['Toca el menú <b>⋮</b> (arriba a la derecha).', 'Elige <b>Agregar a la pantalla principal</b> → <b>Instalar</b>.',
      'Ábrela una vez desde el ícono: desde ahí funciona sin internet.'];
  } else if (android) {
    steps = ['Abre esta liga en <b>Chrome</b>.', 'En Chrome: menú <b>⋮</b> → <b>Agregar a la pantalla principal</b> → <b>Instalar</b>.'];
  } else {
    steps = ['Ábrela en tu celular: con <b>Chrome</b> en Android o <b>Safari</b> en iPhone.', 'Desde el menú del navegador, agrégala a tu pantalla de inicio.'];
  }
  $('#installBody').innerHTML = `<ol class="install-steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>`
    + (note ? `<p class="install-note">⚠️ ${note}</p>` : '');
  $('#installHelp').showModal();
}

/* ---------- Bienvenida ----------
   Tres pantallas cortas la primera vez que abren la app. Si ya hay registros (alguien que ya la usaba),
   se da por vista y no sale. Al cerrarla aparece, si aplica, el banner para instalar. */
const WELCOME_KEY = 'r2k.welcome.v1';
const WELCOME = [
  { e: '💪', t: 'Esto es Rutineitor 2000',
    p: 'Tu rutina de lunes a viernes. La app abre en el día de hoy: toca <b>1, 2, 3…</b> para marcar cada serie que termines.' },
  { e: '⏱', t: 'Descanso y logros',
    p: 'Al marcar una serie arranca el descanso y suena un aviso suave al terminar, aunque apagues la pantalla. Completa ejercicios para desbloquear logros 🏆 y cuida tu racha 🔥.' },
  { e: '📝', t: 'Aprende y anota',
    p: 'Toca la foto de un ejercicio para ver cómo se hace. Con 📝 anota si lo pudiste hacer. Tu registro se guarda solo en tu cel; en ⋮ puedes exportar un respaldo.' },
];
let welcomeStep = 0;
const welcomeSeen = () => { try { return !!localStorage.getItem(WELCOME_KEY); } catch { return true; } };
function markWelcome() { try { localStorage.setItem(WELCOME_KEY, '1'); } catch {} }
function renderWelcome() {
  const w = WELCOME[welcomeStep];
  $('#welcomeBody').innerHTML = `<div class="wl-slide"><span class="wl-emoji">${w.e}</span><h2 class="wl-title">${w.t}</h2><p class="wl-text">${w.p}</p></div>`;
  $('#welcomeDots').innerHTML = WELCOME.map((_, i) => `<i${i === welcomeStep ? ' class="on"' : ''}></i>`).join('');
  $('#welcomeNext').textContent = welcomeStep === WELCOME.length - 1 ? '¡A darle!' : 'Siguiente';
  $('#welcomeSkip').hidden = welcomeStep === WELCOME.length - 1;
}
function maybeWelcome() {
  if (welcomeSeen()) return false;
  if (Object.keys(log).length) { markWelcome(); return false; } // ya la usaba: no es nuevo
  welcomeStep = 0; renderWelcome();
  $('#welcome').showModal();
  return true;
}

/* ---------- Generar nueva rutina ----------
   Mismos días y grupos que la original: por cada "hueco" de data/generador.json se sortea un ejercicio,
   para la semana A y la B. Sin repetir ejercicio en la semana ni dos variantes del mismo (inv) en un día,
   y procurando que la B no repita a la A. Se guarda completa en el cel (r2k.custom.v1) y reemplaza a la
   original solo aquí; "Volver a la rutina original" la borra. */
const CUSTOM_KEY = 'r2k.custom.v1';
let generator = null, draft = null, draftWeek = 'A';
const exKey = (e) => `${e.inv}:${e.img || e.id}`; // mismo ejercicio aunque tenga otro id (p. ej. con superserie)
function catalog() {
  const m = new Map();
  for (const d of state.baseRoutine.days) for (const e of [...d.exercises, ...(d.exercisesB || [])]) if (!m.has(e.id)) m.set(e.id, e);
  return m;
}
const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
function generateWeek(avoid = new Set()) {
  const cat = catalog(), used = new Set(), week = {};
  for (const d of state.baseRoutine.days) {
    const invs = new Set();
    week[d.id] = (generator.dias[d.id] || []).map((slot) => {
      const opts = slot.de.map((id) => cat.get(id)).filter(Boolean);
      const free = (e) => !used.has(exKey(e)) && !(e.inv && invs.has(e.inv));
      // Preferencia: libre y distinto de la otra semana → libre → cualquiera.
      const pick = randomOf([opts.filter((e) => free(e) && !avoid.has(exKey(e))), opts.filter(free), opts].find((p) => p.length));
      used.add(exKey(pick));
      if (pick.inv) invs.add(pick.inv);
      const ex = { ...pick };
      if (slot.ss) { ex.ss = slot.ss; delete ex.rest; } else delete ex.ss; // en superserie cuenta el descanso por omisión
      return ex;
    });
  }
  return { week, used };
}
function generateRoutine() {
  const a = generateWeek(), b = generateWeek(a.used);
  return { creado: ymd(new Date()), base: state.baseRoutine.version, A: a.week, B: b.week };
}
function loadCustom() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)); } catch { return null; } }
function saveCustom(c) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(c)); } catch {} }
// Si la original subió de versión desde que se generó esta rutina, avisa una vez por versión.
function checkRoutineUpdate() {
  const c = state.custom, v = state.baseRoutine.version;
  if (!c) return;
  if (!c.base) { c.base = v; saveCustom(c); return; } // generada antes de que existiera este aviso
  if (v <= c.base || c.avisado >= v || !$('#toast').hidden) return;
  c.avisado = v; saveCustom(c);
  toast('🆕 La rutina original se actualizó · Toca para ver opciones', () => $('#menuBtn').click(), 10000);
}
function applyCustom(c) {
  const base = state.baseRoutine;
  state.custom = c;
  state.routine = c
    ? { ...base, days: base.days.map((d) => ({ ...d, exercises: c.A[d.id] || d.exercises, exercisesB: c.B[d.id] || d.exercisesB })) }
    : base;
  $('#versionText').textContent = `Rutina v${base.version}${c ? ` · generada el ${fmtShort(parseYmd(c.creado))}` : ''} · build ${BUILD}`;
  $('#origBtn').hidden = !c;
}
function renderDraft() {
  document.querySelectorAll('[data-gen-week]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.genWeek === draftWeek));
  $('#genBody').innerHTML = state.baseRoutine.days.map((d, i) => `<div class="gen-day">
      <b>${DAY_SHORT[i]} · ${esc(d.focus)}</b>
      <ol>${draft[draftWeek][d.id].map((e) => `<li>${esc(e.name)}${e.ss ? ` <span class="gen-ss">SS ${esc(e.ss)}</span>` : ''}</li>`).join('')}</ol>
    </div>`).join('');
}
async function openGenerator() {
  if ($('#menu').open) $('#menu').close();
  try { generator ||= await (await fetch('data/generador.json')).json(); }
  catch { toast('No se pudo cargar el generador'); return; }
  draft = generateRoutine(); draftWeek = 'A';
  renderDraft();
  $('#genDialog').showModal(); sfx('open');
}
function useDraft() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(draft)); } catch { toast('No se pudo guardar la rutina'); return; }
  applyCustom(draft);
  clearRest(); state.coverEx = null;
  renderDay();
  $('#genDialog').close();
  sfx('exercise'); toast('Rutina nueva lista 💪');
}
function backToOriginal() {
  const b = $('#origBtn');
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.firstChild.textContent = '¿Seguro? Toca otra vez'; return; }
  try { localStorage.removeItem(CUSTOM_KEY); } catch {}
  applyCustom(null);
  clearRest(); state.coverEx = null;
  renderDay(); $('#menu').close();
  toast('Volviste a la rutina original');
}

/* ---------- Compartir con un amigo ----------
   Menú nativo de compartir del cel (WhatsApp, etc.); si no existe, copia la liga. */
async function shareApp() {
  const url = new URL('./', location.href).href; // la raíz de la app, sin #/?
  const data = { title: 'Rutineitor 2000', text: '💪 Mi app de rutina de gym. Ábrela y agrégala a tu pantalla de inicio:', url };
  if (navigator.share) {
    try { await navigator.share(data); } catch { /* canceló */ }
    return;
  }
  try { await navigator.clipboard.writeText(url); toast('Liga copiada, pégala donde quieras'); }
  catch { toast(url, null, 8000); }
}

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
    state.routine = state.baseRoutine = await res.json();
  } catch {
    $('#dayTitle').textContent = 'No se pudo cargar la rutina';
    return;
  }
  const wd = weekdayIdx();
  state.dayIdx = wd <= 4 ? wd : 0;
  fetch('data/logros.json').then((r) => r.json()).then((d) => { state.logros = d; }).catch(() => {});
  if (!HTMLElement.prototype.showPopover) ['#trophy', '#party'].forEach((s) => { $(s).hidden = true; });
  bind();
  applyCustom(loadCustom()); // rutina generada en este cel, si hay
  // Por omisión, tema de temporada según la fecha (si este mes no hay, se ve el normal).
  try { applyTheme(localStorage.getItem(THEME_KEY) || 'season-auto'); } catch { applyTheme('season-auto'); }
  renderSfxBtn();
  renderShamucoBtn();
  renderDay();
  renderRest();
  renderBackupBtn();
  renderInstallUI();
  if (!maybeWelcome()) setTimeout(maybeShowInstallBar, 1500);
  registerSW();
  setTimeout(checkBackupReminder, 2500);
  setTimeout(checkRoutineUpdate, 3200);
}
init();
