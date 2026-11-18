// Study timer (열품타-style): stopwatch per subject, daily goal, D-day, stats, heat-map, focus mode.
// Data lives in the vault at .jimmy/study.json so it travels with your notes. A running timer survives restarts.
import { icon } from './icons.js';
import { h, escHtml, debounce, toast, promptDialog, formDialog, openMenu, confirmDialog, modal } from './ui.js';
import { mascotSVG, hasMascot, STUDY_LINES } from './mascots.js';
import { themeColors, cssVar } from './blocks/common.js';
import { linkDialog, openTarget, describe } from './links.js';

const FILE = '.jimmy/study.json';
const COLORS = ['#4f5bd5', '#d9a02b', '#d6607f', '#4a9a9a', '#8b74c6', '#5f8fc7', '#7aa36a', '#d9694a'];
let D = null; let appRef = null; let iv = null; let beat = 0;
const subs = new Set();
export const setStudyApp = (a) => { appRef = a; };
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const startOfDay = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
export const fmtHMS = (sec) => { sec = Math.max(0, Math.floor(sec)); return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor(sec % 3600 / 60)) + ':' + pad(sec % 60); };
export const fmtHM = (sec) => { if (sec > 0 && sec < 60) return Math.floor(sec) + 's'; const m = Math.round(sec / 60); const hh = Math.floor(m / 60); return hh ? hh + 'h ' + pad(m % 60) + 'm' : m + 'm'; };
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const theme = () => document.documentElement.dataset.theme || 'basic';

const DEFAULT = () => ({ v: 1, subjects: [{ id: 's1', name: 'Study', color: COLORS[0] }, { id: 's2', name: 'Reading', color: COLORS[1] }], sessions: [], goalMin: 240, dday: null, running: null, lastSeen: 0, notified: '', lastSubject: 's1' });
const persist = debounce(() => { try { window.api.vault.write(FILE, JSON.stringify(D)); } catch (e) { /* ignore */ } }, 400);

export async function init() {
  try { const raw = await window.api.vault.read(FILE); D = raw ? Object.assign(DEFAULT(), JSON.parse(raw)) : DEFAULT(); } catch (e) { D = DEFAULT(); }
  if (D.running) {                                   // app was closed while the timer ran
    const gap = Date.now() - (D.lastSeen || D.running.start);
    if (D.lastSeen && gap > 3 * 60e3) { finish(D.running, D.lastSeen); D.running = null; setTimeout(() => toast('Study timer was stopped when the app closed — session saved up to the last check-in.', 5000), 1500); }
  }
  clearInterval(iv); iv = setInterval(tick, 1000);
}
function finish(r, end) { if (end - r.start >= 10e3) D.sessions.push({ id: uid(), s: r.subject, a: r.start, b: end }); }
function emit() { subs.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); }
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const csubs = new Set();
export const onChange = (fn) => { csubs.add(fn); return () => csubs.delete(fn); };
function changed() { csubs.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); emit(); }

function beep() {
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(); [523, 659, 784].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + i * 0.16; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.start(t); o.stop(t + 0.16); }); } catch (e) { /* no audio */ }
}
function tick() {
  if (D && D.running) {
    if (++beat % 20 === 0) { D.lastSeen = Date.now(); persist(); }
    const today = dayKey(Date.now());
    if (D.goalMin && D.notified !== today && todaySeconds() >= D.goalMin * 60) { D.notified = today; persist(); beep(); toast(STUDY_LINES.goal[theme()] || STUDY_LINES.goal.basic, 4500); }
  }
  emit();
}

// ---------- data access ----------
export const data = () => D;
export const subject = (id) => D.subjects.find((s) => s.id === id) || { id, name: 'Deleted subject', color: '#999' };
export const isRunning = () => !!(D && D.running);
export const current = () => (D.running ? D.running.subject : (D.subjects.some((s) => s.id === D.lastSubject) ? D.lastSubject : D.subjects[0] && D.subjects[0].id));
export const sessionSeconds = () => (D && D.running ? (Date.now() - D.running.start) / 1000 : 0);

function slices(a, b) {
  const out = []; let t = a;
  while (t < b) { const d = new Date(t); const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); const e = Math.min(b, next); out.push([dayKey(t), (e - t) / 1000]); t = e; }
  return out;
}
export function allSessions() { const list = D.sessions.slice(); if (D.running) list.push({ id: 'run', s: D.running.subject, a: D.running.start, b: Date.now(), running: true }); return list; }
export function todaySeconds(subjectId) {
  const t0 = startOfDay(Date.now()); let sum = 0;
  for (const s of allSessions()) { if (s.b <= t0) continue; if (subjectId && s.s !== subjectId) continue; sum += (Math.min(s.b, Date.now()) - Math.max(s.a, t0)) / 1000; }
  return sum;
}
// map dayKey -> { total, by:{subjectId:seconds} }
export function dayMap() {
  const m = {};
  for (const s of allSessions()) for (const [k, sec] of slices(s.a, s.b)) { const e = m[k] || (m[k] = { total: 0, by: {} }); e.total += sec; e.by[s.s] = (e.by[s.s] || 0) + sec; }
  return m;
}
export function stats() {
  const m = dayMap(); const now = new Date(); const today = dayKey(now);
  const keys = Object.keys(m); let total = 0, best = 0, bestKey = '';
  keys.forEach((k) => { total += m[k].total; if (m[k].total > best) { best = m[k].total; bestKey = k; } });
  const sumDays = (n) => { let s = 0; for (let i = 0; i < n; i++) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); s += (m[dayKey(d)] || { total: 0 }).total; } return s; };
  const wk = (() => { const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)); let s = 0; for (let i = 0; i < 7; i++) s += (m[dayKey(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i))] || { total: 0 }).total; return s; })();
  const month = keys.filter((k) => k.startsWith(today.slice(0, 7))).reduce((a, k) => a + m[k].total, 0);
  let streak = 0; const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!(m[dayKey(d)] && m[dayKey(d)].total >= 60)) d.setDate(d.getDate() - 1);
  while (m[dayKey(d)] && m[dayKey(d)].total >= 60) { streak++; d.setDate(d.getDate() - 1); }
  const hrs = total / 3600; const level = Math.floor(Math.sqrt(2 * hrs)) + 1; const lo = ((level - 1) ** 2) / 2, hi = (level ** 2) / 2;
  return { map: m, total, best, bestKey, week: wk, month, streak, avg30: sumDays(30) / 30, level, levelPct: Math.min(1, (hrs - lo) / (hi - lo)), hrs, nextHrs: hi };
}
const LEVEL_NAMES = ['Newcomer', 'Learner', 'Student', 'Regular', 'Scholar', 'Expert', 'Master', 'Sage', 'Legend'];
export const levelName = (lv) => LEVEL_NAMES[Math.min(LEVEL_NAMES.length - 1, lv - 1)];

// ---------- actions ----------
export function start(id) {
  if (D.running) stop(true);
  D.running = { subject: id, start: Date.now() }; D.lastSubject = id; D.lastSeen = Date.now(); persist(); changed();
  toast(STUDY_LINES.start[theme()] || STUDY_LINES.start.basic, 1800);
}
export function stop(silent) {
  const r = D.running; if (!r) return;
  finish(r, Date.now()); D.running = null; persist(); changed();
  if (!silent) toast(STUDY_LINES.stop[theme()] || STUDY_LINES.stop.basic, 1800);
}
// throw the running timer away without saving it (e.g. you forgot to stop it)
export function discard() { if (!D.running) return; D.running = null; persist(); changed(); toast('Timer reset — that time was not saved.', 2200); }
// delete every saved session that touches one day
export function clearDay(key) { const t0 = new Date(key + 'T00:00:00').getTime(), t1 = t0 + 864e5; D.sessions = D.sessions.filter((s) => !(s.b > t0 && s.a < t1)); persist(); changed(); }
export function toggle() { if (D.running) stop(); else start(current()); }
export function addManual(id, minutes) { const end = Date.now(); D.sessions.push({ id: uid(), s: id, a: end - minutes * 60000, b: end }); persist(); changed(); }
export function deleteSession(id) { D.sessions = D.sessions.filter((s) => s.id !== id); persist(); changed(); }
export function addSubject(name) { const s = { id: uid(), name, color: COLORS[D.subjects.length % COLORS.length] }; D.subjects.push(s); persist(); changed(); return s; }
export function removeSubject(id) { if (D.running && D.running.subject === id) stop(true); D.subjects = D.subjects.filter((s) => s.id !== id); persist(); changed(); }
export function setGoal(min) { D.goalMin = min; D.notified = ''; persist(); changed(); }
export function setDday(v) { D.dday = v; persist(); changed(); }
const parseHours = (s) => { const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*h?(?:\s*(\d+)\s*m?)?$/i); if (m) return Math.round((+m[1]) * 60 + (m[2] ? +m[2] : 0)); const n = parseFloat(s); return isNaN(n) ? null : Math.round(n * 60); };

// ---------- shared UI pieces ----------
export function ddayText() {
  if (!D.dday) return '';
  const days = Math.ceil((new Date(D.dday.date + 'T00:00:00') - startOfDay(Date.now())) / 864e5);
  return 'D' + (days === 0 ? '-Day' : days > 0 ? '-' + days : '+' + Math.abs(days)) + ' · ' + D.dday.title;
}
function subjectChip(s) { return `<span class="st-chip" style="--c:${s.color}"><i></i>${escHtml(s.name)}</span>`; }

// ---------- compact widget (Home / page block) ----------
export function renderStudyWidget(body) {
  const born = Date.now();
  body.innerHTML = '<div class="stw"><div class="stw-time"></div><div class="stw-sub"></div><div class="progress"><div class="bar"><i></i></div></div><div class="stw-row"><select class="inp"></select><button class="btn primary sm" data-go></button></div><button class="btn ghost sm" data-open style="margin-top:8px">Open study timer</button><button class="btn ghost sm" data-mat hidden style="margin-top:6px"></button></div>';
  const mat = body.querySelector('[data-mat]');
  const time = body.querySelector('.stw-time'), sub = body.querySelector('.stw-sub'), bar = body.querySelector('.bar i'), sel = body.querySelector('select'), go = body.querySelector('[data-go]');
  const fill = () => { sel.innerHTML = D.subjects.map((s) => `<option value="${s.id}" ${s.id === current() ? 'selected' : ''}>${escHtml(s.name)}</option>`).join(''); };
  fill();
  const rst = h('<button class="btn sm ghost" title="Reset: throw away the running timer without saving it" hidden>↺</button>'); go.after(rst);
  rst.onclick = async () => { if (await confirmDialog('Reset the running timer? The time you have not saved yet will be thrown away.', 'Reset', true)) discard(); };
  const update = () => {
    if (!body.isConnected && Date.now() - born > 1500) { unsub(); return; }
    const t = todaySeconds(); time.textContent = fmtHMS(t);
    sub.textContent = D.running ? 'Studying · ' + subject(D.running.subject).name : 'Today' + (D.goalMin ? ' · goal ' + fmtHM(D.goalMin * 60) : '');
    bar.style.width = Math.min(100, D.goalMin ? t / (D.goalMin * 60) * 100 : 0) + '%';
    go.textContent = D.running ? 'Stop' : 'Start'; go.classList.toggle('danger', !!D.running); go.classList.toggle('primary', !D.running);
    rst.hidden = !D.running;
    const cs = subject(sel.value || current()); mat.hidden = !(cs && cs.link); if (cs && cs.link) mat.textContent = 'Open “' + cs.name + '” material';
  };
  const unsub = subscribe(update); update();
  go.onclick = () => { if (D.running) stop(); else start(sel.value); };
  mat.onclick = () => { const cs = subject(sel.value || current()); if (cs && cs.link) openTarget(cs.link, { relink: (u) => { cs.link = u; persist(); update(); } }); };
  sel.onchange = () => { update(); D.lastSubject = sel.value; if (D.running) start(sel.value); persist(); };
  body.querySelector('[data-open]').onclick = () => appRef && appRef.openView({ type: 'study' });
}

// ---------- full view ----------
export function renderStudyView(app, view) {
  appRef = app;
  const disposers = [];
  const root = h(`<div class="study">
    <div class="study-head"><h1>Study timer</h1><span class="chip" data-dday></span><span class="grow"></span>
      <button class="btn sm ghost" data-a="dday">${icon('calendar', 14)} D-day</button><button class="btn sm ghost" data-a="goal">${icon('chart', 14)} Daily goal</button><button class="btn sm ghost" data-a="manual">${icon('plus', 14)} Add record</button><button class="btn sm" data-a="focus">${icon('focus', 14)} Focus mode</button></div>
    <div class="study-grid">
      <section class="card st-timer ${hasMascot(app.settings.theme) ? 'has-m' : ''}">
        <div class="st-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" fill="none" stroke="var(--accent-soft)" stroke-width="12"/><circle class="st-arc" cx="100" cy="100" r="88" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="553" stroke-dashoffset="553" transform="rotate(-90 100 100)"/></svg>
          <div class="st-center"><div class="st-lab">Today</div><div class="st-big">00:00:00</div><div class="st-goal"></div></div></div>
        <div class="st-right">
          <div class="st-now"></div>
          <div class="st-btns"><button class="st-play" data-a="toggle"></button><button class="btn ghost st-reset" data-a="reset" title="Throw away the running timer without saving it" hidden>${icon('undo', 15)} Reset</button></div>
          <div class="st-level"><div class="lv"></div><div class="bar"><i></i></div><div class="muted lvs"></div></div>
        </div>
        ${hasMascot(app.settings.theme) ? `<div class="st-mascot mascot-anim">${mascotSVG(app.settings.theme)}</div>` : ''}
      </section>
      <section class="card st-subj"><h3>${icon('book', 15)}<span class="grow">Subjects</span><button class="iconbtn" data-a="addsub" title="Add subject">${icon('plus', 15)}</button></h3><div class="st-sl"></div></section>
      <section class="card st-log"><h3>${icon('list', 15)}<span class="grow" data-logtitle>Today’s sessions</span><button class="iconbtn" data-a="clearday" title="Delete all saved time for this day">${icon('trash', 15)}</button></h3><div class="st-ll"></div></section>
      <section class="card st-stats"><h3>${icon('chart', 15)}<span class="grow">Statistics</span><div class="seg sm"><button data-r="7" class="on">Week</button><button data-r="30">Month</button></div></h3>
        <div class="statrow st-tiles"></div>
        <div class="st-charts"><div class="st-bar"><canvas></canvas></div><div class="st-pie"><canvas></canvas></div></div>
        <div class="st-hm-wrap"><div class="muted" style="font-size:12px;margin:10px 0 6px">Last 20 weeks — click a day to see its sessions</div><div class="st-hm"></div></div>
      </section>
    </div></div>`);
  view.appendChild(root);
  let range = 7, selDay = dayKey(Date.now()), charts = [];
  const q = (s) => root.querySelector(s);
  const ring = q('.st-arc'), big = q('.st-big'), goalEl = q('.st-goal'), nowEl = q('.st-now'), playBtn = q('.st-play');

  function paintLive() {
    const t = todaySeconds(); big.textContent = fmtHMS(t);
    const gs = D.goalMin * 60; ring.setAttribute('stroke-dashoffset', String(553 * (1 - (gs ? Math.min(1, t / gs) : 0))));
    goalEl.textContent = gs ? Math.min(100, Math.round(t / gs * 100)) + '% of ' + fmtHM(gs) : 'No goal set';
    const s = subject(current());
    nowEl.innerHTML = D.running ? `<div class="muted">Studying</div><div class="st-cur">${subjectChip(s)}<b>${fmtHMS(sessionSeconds())}</b></div>` : `<div class="muted">Ready</div><div class="st-cur">${subjectChip(s)}</div>`;
    playBtn.innerHTML = D.running ? `${icon('x', 22)}<span>Stop</span>` : `${icon('forward', 22)}<span>Start</span>`;
    playBtn.classList.toggle('on', !!D.running);
    root.classList.toggle('running', !!D.running); q('.st-reset').hidden = !D.running;
    root.querySelectorAll('[data-sub-time]').forEach((el) => { el.textContent = fmtHM(todaySeconds(el.dataset.subTime)); });
    const dd = q('[data-dday]'); dd.textContent = ddayText(); dd.hidden = !D.dday;
  }
  function paintSubjects() {
    const wrap = q('.st-sl'); const st = stats();
    wrap.innerHTML = D.subjects.map((s) => { const tot = Object.values(st.map).reduce((a, d) => a + (d.by[s.id] || 0), 0); return `<div class="st-s ${s.id === current() ? 'sel' : ''}" data-id="${s.id}"><span class="dot" style="background:${s.color}"></span><div class="nm"><b>${escHtml(s.name)}</b><small>Total ${fmtHM(tot)}</small></div><span class="tm" data-sub-time="${s.id}"></span>${s.link ? `<button class="iconbtn lnk" title="Open ${escHtml(describe(s.link))}">${icon('link', 16)}</button>` : ''}<button class="iconbtn play" title="${D.running && D.running.subject === s.id ? 'Stop' : 'Start'}">${icon(D.running && D.running.subject === s.id ? 'x' : 'forward', 16)}</button><button class="iconbtn more" title="Edit">${icon('more', 16)}</button></div>`; }).join('') || '<div class="muted">Add a subject to start.</div>';
    paintLive();
  }
  function paintLog() {
    const t0 = new Date(selDay + 'T00:00:00').getTime(), t1 = t0 + 864e5;
    const rows = allSessions().filter((s) => s.b > t0 && s.a < t1).sort((a, b) => b.a - a.a);
    q('[data-logtitle]').textContent = selDay === dayKey(Date.now()) ? 'Today’s sessions' : new Date(t0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }) + ' sessions';
    const tm = (t) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    q('.st-ll').innerHTML = rows.map((s) => `<div class="st-row">${subjectChip(subject(s.s))}<span class="rg">${tm(Math.max(s.a, t0))} – ${s.running ? 'now' : tm(Math.min(s.b, t1))}</span><b>${fmtHM((Math.min(s.b, t1, Date.now()) - Math.max(s.a, t0)) / 1000)}</b><button class="iconbtn" data-del="${s.id}" title="${s.running ? 'Reset (throw away this running session)' : 'Delete'}">${icon('trash', 14)}</button></div>`).join('') || '<div class="muted">No sessions yet.</div>';
  }
  function paintStats() {
    const st = stats(); const m = st.map; const now = new Date();
    q('.st-tiles').innerHTML = [['Today', fmtHM(todaySeconds())], ['This week', fmtHM(st.week)], ['This month', fmtHM(st.month)], ['Total', fmtHM(st.total)], ['Streak', st.streak + ' day' + (st.streak === 1 ? '' : 's')], ['Best day', st.best ? fmtHM(st.best) : '–'], ['Avg / day (30d)', fmtHM(st.avg30)]].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
    q('.lv').innerHTML = `<b>Lv ${st.level}</b> · ${levelName(st.level)}`; q('.st-level .bar i').style.width = Math.round(st.levelPct * 100) + '%';
    q('.lvs').textContent = st.hrs.toFixed(1) + 'h studied · next level at ' + st.nextHrs.toFixed(1) + 'h';
    // charts
    charts.forEach((c) => c.destroy()); charts = [];
    if (window.Chart) {
      const days = Array.from({ length: range }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range - 1 - i)));
      const labels = days.map((d) => (range === 7 ? d.toLocaleDateString('en-US', { weekday: 'short' }) : d.getDate()));
      const text = cssVar('--text'), muted = cssVar('--muted'), line = cssVar('--line');
      const ds = D.subjects.map((s) => ({ label: s.name, backgroundColor: s.color, borderRadius: 3, data: days.map((d) => +(((m[dayKey(d)] || { by: {} }).by[s.id] || 0) / 3600).toFixed(2)) }));
      charts.push(new window.Chart(q('.st-bar canvas'), { type: 'bar', data: { labels, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, plugins: { legend: { display: D.subjects.length > 1, position: 'bottom', labels: { color: text, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtHM(c.parsed.y * 3600)}` } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: muted } }, y: { stacked: true, beginAtZero: true, grid: { color: line }, ticks: { color: muted, callback: (v) => v + 'h' }, border: { display: false } } } } }));
      const share = D.subjects.map((s) => days.reduce((a, d) => a + ((m[dayKey(d)] || { by: {} }).by[s.id] || 0), 0));
      if (share.some((v) => v > 0)) charts.push(new window.Chart(q('.st-pie canvas'), { type: 'doughnut', data: { labels: D.subjects.map((s) => s.name), datasets: [{ data: share.map((v) => +(v / 3600).toFixed(2)), backgroundColor: D.subjects.map((s) => s.color), borderColor: cssVar('--card'), borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtHM(c.parsed * 3600)}` } } } } }));
    }
    // heat-map
    const hm = q('.st-hm'); const weeks = 20; const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start0 = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() - today0.getDay() - (weeks - 1) * 7);
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start0.getFullYear(), start0.getMonth(), start0.getDate() + i); if (d > today0) { cells += '<i class="hmc fut"></i>'; continue; }
      const k = dayKey(d); const sec = (m[k] || { total: 0 }).total; const mins = sec / 60; const goal = D.goalMin || 180;
      const lv = mins < 1 ? 0 : mins < goal * 0.25 ? 1 : mins < goal * 0.6 ? 2 : mins < goal ? 3 : 4;
      cells += `<i class="hmc l${lv} ${k === selDay ? 'sel' : ''}" data-k="${k}" title="${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${fmtHM(sec)}"></i>`;
    }
    hm.innerHTML = cells;
  }
  const refreshAll = () => { paintSubjects(); paintLog(); paintStats(); };
  refreshAll();
  const unsub = subscribe(() => { if (!root.isConnected) return; paintLive(); if (D.running && Date.now() % 60000 < 1100) { paintLog(); } });
  disposers.push(unsub);
  disposers.push(onChange(() => { if (root.isConnected) refreshAll(); }));
  disposers.push(() => charts.forEach((c) => c.destroy()));
  const onTheme = () => paintStats(); document.addEventListener('themechange', onTheme); disposers.push(() => document.removeEventListener('themechange', onTheme));

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const a = t.closest('[data-a]');
    if (a) {
      const k = a.dataset.a;
      if (k === 'toggle') { toggle(); refreshAll(); }
      else if (k === 'reset') { if (await confirmDialog('Reset the running timer? The ' + fmtHMS(sessionSeconds()) + ' you have not saved yet will be thrown away.', 'Reset', true)) { discard(); refreshAll(); } }
      else if (k === 'clearday') { const lbl = selDay === dayKey(Date.now()) ? 'today' : selDay; if (await confirmDialog('Delete ALL saved study time for ' + lbl + '? This cannot be undone.', 'Delete', true)) { clearDay(selDay); refreshAll(); } }
      else if (k === 'focus') openFocus(app);
      else if (k === 'goal') { const v = await formDialog('Daily study goal', [{ key: 'h', label: 'Hours per day', type: 'number', value: Math.round(D.goalMin / 6) / 10, min: 0.5, hint: 'For example 4, or 3.5 for three and a half hours.' }], { validate: (x) => (!(x.h >= 0.5 && x.h <= 24) ? 'Enter between 0.5 and 24 hours' : '') }); if (v) { setGoal(Math.round(v.h * 60)); paintStats(); paintLive(); } }
      else if (k === 'dday') {
        const v = await formDialog('D-day', [{ key: 'title', label: 'What are you counting down to?', value: D.dday ? D.dday.title : '', placeholder: 'Final exam' }, { key: 'date', label: 'Date', type: 'date', value: D.dday ? D.dday.date : '' }, ...(D.dday ? [{ key: 'rm', label: 'Remove this D-day', type: 'check', value: false }] : [])], { validate: (x) => (!x.rm && !x.date ? 'Pick a date' : '') });
        if (v) { if (v.rm) setDday(null); else setDday({ title: v.title || 'D-day', date: v.date }); paintLive(); }
      }
      else if (k === 'manual') { const v = await formDialog('Add study time', [{ key: 'min', label: 'Minutes studied just now — ' + subject(current()).name, type: 'number', value: 30, min: 1 }], { ok: 'Add', validate: (x) => (!(x.min >= 1) ? 'Enter at least 1 minute' : '') }); if (v) { addManual(current(), Math.round(v.min)); refreshAll(); } }
      else if (k === 'addsub') { const n = await promptDialog('New subject'); if (n) { const s = addSubject(n); D.lastSubject = s.id; persist(); refreshAll(); } }
      return;
    }
    const row = t.closest('.st-s');
    if (row) {
      const id = row.dataset.id;
      if (t.closest('.lnk')) { const s = subject(id); openTarget(s.link, { relink: (u) => { s.link = u; persist(); refreshAll(); } }); return; }
      if (t.closest('.play')) { if (D.running && D.running.subject === id) stop(); else start(id); refreshAll(); return; }
      if (t.closest('.more')) {
        const s = subject(id); const r = t.closest('.more').getBoundingClientRect();
        openMenu(r.left, r.bottom + 2, [
          { label: 'Rename', icon: 'pen', action: async () => { const n = await promptDialog('Subject name', s.name); if (n) { s.name = n; persist(); refreshAll(); } } },
          { label: 'Change color', icon: 'sparkle', action: () => { const mm = openMenu(r.left, r.bottom + 2, []); mm.el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,28px);gap:8px;padding:8px">' + COLORS.map((c) => `<button class="sw" data-c="${c}" style="background:${c};width:26px;height:26px;border-radius:50%;border:0"></button>`).join('') + '</div>'; mm.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-c]'); if (b) { s.color = b.dataset.c; persist(); mm.close(); refreshAll(); } }); } },
          { label: s.link ? 'Change study material…' : 'Link study material (file or page)…', icon: 'link', action: async () => { const v = await linkDialog({ title: 'Study material for “' + s.name + '”', askText: false, target: s.link || '', canRemove: !!s.link }); if (v) { s.link = v.remove ? '' : v.target; persist(); refreshAll(); } } },
          { sep: true }, { label: 'Delete subject', icon: 'trash', danger: true, action: async () => { if (D.subjects.length > 1 && await confirmDialog('Delete “' + s.name + '”? Past sessions stay in your statistics.')) { removeSubject(id); refreshAll(); } else if (D.subjects.length <= 1) toast('Keep at least one subject'); } }
        ]);
        return;
      }
      D.lastSubject = id; if (D.running) start(id); persist(); refreshAll(); return;
    }
    const del = t.closest('[data-del]'); if (del) { if (del.dataset.del === 'run') discard(); else deleteSession(del.dataset.del); refreshAll(); return; }
    const r = t.closest('[data-r]'); if (r) { range = +r.dataset.r; root.querySelectorAll('[data-r]').forEach((b) => b.classList.toggle('on', b === r)); paintStats(); return; }
    const c = t.closest('.hmc[data-k]'); if (c) { selDay = c.dataset.k; paintLog(); paintStats(); }
  });
  return () => disposers.forEach((fn) => fn());
}

// ---------- focus mode (full screen) ----------
export function openFocus(app) {
  const th = app.settings.theme;
  const wrap = h(`<div class="focus-overlay ${th === 'duo' ? 'duo' : ''}">
    <button class="iconbtn fo-x" title="Exit (Esc)">${icon('x', 22)}</button>
    <div class="fo-body"><div class="fo-subj"></div><div class="fo-time">00:00:00</div><div class="fo-today muted"></div>
      ${hasMascot(th) ? `<div class="fo-mascot mascot-anim">${mascotSVG(th)}</div>` : ''}
      <div class="fo-btns"><button class="btn primary" data-go></button></div><div class="fo-quote muted"></div></div></div>`);
  document.body.appendChild(wrap);
  const time = wrap.querySelector('.fo-time'), subj = wrap.querySelector('.fo-subj'), today = wrap.querySelector('.fo-today'), go = wrap.querySelector('[data-go]'), qt = wrap.querySelector('.fo-quote');
  const upd = () => {
    const s = subject(current()); subj.innerHTML = subjectChip(s);
    time.textContent = fmtHMS(D.running ? sessionSeconds() : todaySeconds());
    today.textContent = (D.running ? 'Session · ' : 'Today · ') + 'total ' + fmtHM(todaySeconds()) + (D.goalMin ? ' / goal ' + fmtHM(D.goalMin * 60) : '');
    go.textContent = D.running ? 'Stop' : 'Start'; go.classList.toggle('danger', !!D.running); go.classList.toggle('primary', !D.running);
    wrap.classList.toggle('running', !!D.running);
    qt.textContent = D.running ? ({ psyduck: '…quack. (studying)', yadon: '…zzz… (studying, slowly)', duo: '고라파덕: Quack… 야돈: …zzz…' }[th] || '') : '';
  };
  upd(); const unsub = subscribe(upd);
  const close = () => { unsub(); document.removeEventListener('keydown', key, true); document.removeEventListener('fullscreenchange', fsc); wrap.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
  const fsc = () => { if (!document.fullscreenElement) close(); };
  go.onclick = () => toggle(); wrap.querySelector('.fo-x').onclick = close;
  document.addEventListener('keydown', key, true); document.addEventListener('fullscreenchange', fsc);
  try { wrap.requestFullscreen().catch(() => { }); } catch (e) { /* ignore */ }
}
