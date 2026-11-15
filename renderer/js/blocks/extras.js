import { icon } from '../icons.js';
import { h, escHtml, toast } from '../ui.js';
import { richShell } from './common.js';

// ---------------- Pomodoro timer ----------------
export const newTimer = () => ({ title: 'Focus timer', work: 25, rest: 5, sessions: 0 });
const timers = new Map(); // id -> {mode, left, running, t}

function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 1100].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'sine'; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + i * 0.18; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.start(t); o.stop(t + 0.18); });
  } catch (e) { /* no audio */ }
}

export function renderTimer(b, api) {
  const d = b.data;
  const { el, body } = richShell(b, api, { ico: 'timer', ph: 'Timer' });
  let st = timers.get(b.id);
  if (!st) { st = { mode: 'work', left: d.work * 60, running: false, iv: null }; timers.set(b.id, st); }
  const R = 62, C = 2 * Math.PI * R;
  body.innerHTML = `<div class="timer"><div class="ring"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--line)" stroke-width="12"/><circle class="prog" cx="75" cy="75" r="${R}" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><div class="tt">25:00</div></div>
  <div class="tcol"><div class="mode" style="font-weight:800"></div><div style="display:flex;gap:6px"><button class="btn primary" data-go>Start</button><button class="btn ghost" data-reset>Reset</button><button class="btn ghost" data-skip>Skip</button></div>
  <div style="display:flex;gap:10px;align-items:center;font-size:13px" class="muted">Work <input class="inp" data-w type="number" min="1" max="180" value="${d.work}" style="width:62px"> Break <input class="inp" data-r type="number" min="1" max="60" value="${d.rest}" style="width:62px"> min</div>
  <div class="muted" data-s></div></div></div>`;
  const tt = body.querySelector('.tt'), prog = body.querySelector('.prog'), mode = body.querySelector('.mode'), go = body.querySelector('[data-go]'), sess = body.querySelector('[data-s]');
  const total = () => (st.mode === 'work' ? d.work : d.rest) * 60;
  function paint() {
    const m = Math.floor(st.left / 60), s = st.left % 60;
    tt.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    prog.setAttribute('stroke-dashoffset', String(C * (1 - st.left / total())));
    prog.setAttribute('stroke', st.mode === 'work' ? 'var(--accent)' : 'var(--c3)');
    mode.textContent = st.mode === 'work' ? '📚 Focus time' : '☕ Break time';
    go.textContent = st.running ? 'Pause' : 'Start';
    sess.textContent = '🍅 ' + (d.sessions || 0) + ' sessions completed';
  }
  function tick() {
    if (!el.isConnected && !st.running) return;
    st.left--;
    if (st.left <= 0) {
      beep();
      if (st.mode === 'work') { d.sessions = (d.sessions || 0) + 1; api.changed(true); toast('Focus session done! Time for a break 🎉', 4000); st.mode = 'rest'; } else { toast('Break over — back to it! 💪', 4000); st.mode = 'work'; }
      st.left = total();
    }
    if (el.isConnected) paint();
  }
  go.onclick = () => { st.running = !st.running; if (st.running) st.iv = setInterval(tick, 1000); else clearInterval(st.iv); paint(); };
  body.querySelector('[data-reset]').onclick = () => { st.running = false; clearInterval(st.iv); st.left = total(); paint(); };
  body.querySelector('[data-skip]').onclick = () => { st.mode = st.mode === 'work' ? 'rest' : 'work'; st.left = total(); paint(); };
  body.querySelector('[data-w]').oninput = (e) => { d.work = Math.max(1, +e.target.value || 25); if (!st.running && st.mode === 'work') st.left = d.work * 60; api.changed(); paint(); };
  body.querySelector('[data-r]').oninput = (e) => { d.rest = Math.max(1, +e.target.value || 5); if (!st.running && st.mode === 'rest') st.left = d.rest * 60; api.changed(); paint(); };
  body.addEventListener('keydown', (e) => e.stopPropagation());
  if (st.running) { clearInterval(st.iv); st.iv = setInterval(tick, 1000); }
  paint();
  return el;
}

// ---------------- Flashcards ----------------
export const newFlash = () => ({ title: 'Flashcards', cards: [], i: 0 });
// --- spaced repetition (SM-2 light): each card remembers when it is due again
const dayStr = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const isDue = (c) => !c.due || c.due <= dayStr();
export const isNew = (c) => !c.reps;
export function grade(c, g) {                // g: 0 again, 1 hard, 2 good, 3 easy
  c.ease = c.ease || 2.5; c.reps = (c.reps || 0); c.ivl = c.ivl || 0;
  if (g === 0) { c.ease = Math.max(1.3, c.ease - 0.2); c.ivl = 0; c.reps = Math.max(0, c.reps); c.lapses = (c.lapses || 0) + 1; c.due = dayStr(); return c; }
  if (g === 1) { c.ease = Math.max(1.3, c.ease - 0.15); c.ivl = Math.max(1, Math.round((c.ivl || 1) * 1.2)); }
  else if (g === 2) c.ivl = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.ivl * c.ease);
  else { c.ease += 0.1; c.ivl = c.reps === 0 ? 4 : Math.round(Math.max(c.ivl, 1) * c.ease * 1.3); }
  c.reps++; c.due = dayStr(Date.now() + c.ivl * 864e5); return c;
}
export const dueCount = (cards) => (cards || []).filter((c) => c.q && isDue(c)).length;

export function renderFlash(b, api) {
  const d = b.data;
  if (!d.cards) d.cards = [];
  const { el, body, tools } = richShell(b, api, { ico: 'cards', ph: 'Deck name' });
  let editing = false, flipped = false, order = d.cards.map((_, i) => i), study = false, queue = [], done = 0;
  const editBtn = h(`<button class="iconbtn" title="Edit cards">${icon('pen', 16)}</button>`);
  tools.appendChild(editBtn);
  editBtn.onclick = () => { editing = !editing; editBtn.classList.toggle('on', editing); paint(); };
  const startStudy = () => { study = true; flipped = false; done = 0; queue = d.cards.map((c, i) => [c, i]).filter(([c]) => c.q && isDue(c)).sort((a, b2) => (isNew(a[0]) - isNew(b2[0]))).map(([, i]) => i); paint(); };
  function paintStudy() {
    body.innerHTML = '';
    if (!queue.length) {
      const next = d.cards.filter((c) => c.due && c.due > dayStr()).map((c) => c.due).sort()[0];
      body.appendChild(h(`<div class="flash-done"><div style="font-size:30px">🎉</div><b>${done ? 'Session finished — ' + done + ' card' + (done === 1 ? '' : 's') + ' reviewed' : 'Nothing due right now'}</b><div class="muted">${next ? 'Next cards are due ' + next : 'Add more cards, or come back tomorrow.'}</div><button class="btn sm" data-back>Back to the deck</button></div>`));
      body.querySelector('[data-back]').onclick = () => { study = false; paint(); }; return;
    }
    const c = d.cards[queue[0]];
    const w = h(`<div class="flash"><div class="muted" style="text-align:center">${queue.length} left · ${isNew(c) ? 'new card' : 'review'}</div><div class="fcard ${flipped ? 'flip' : ''}"><div class="fi"><div class="face">${escHtml(c.q)}</div><div class="face back">${escHtml(c.a)}</div></div></div>
      ${flipped ? `<div class="flash-grade"><button class="btn sm" data-g="0" title="I did not know it — show again today">Again</button><button class="btn sm" data-g="1" title="Hard — see it soon">Hard</button><button class="btn sm primary" data-g="2" title="I knew it">Good</button><button class="btn sm" data-g="3" title="Too easy — see it much later">Easy</button></div>` : '<div style="text-align:center"><button class="btn primary" data-show>Show answer</button> <button class="btn sm ghost" data-exit>Stop</button></div>'}</div>`);
    const reveal = () => { flipped = true; paintStudy(); };
    w.querySelector('.fcard').onclick = () => { if (!flipped) reveal(); };
    const sh = w.querySelector('[data-show]'); if (sh) sh.onclick = reveal;
    const ex = w.querySelector('[data-exit]'); if (ex) ex.onclick = () => { study = false; paint(); };
    w.querySelectorAll('[data-g]').forEach((bt) => bt.onclick = () => { const g = +bt.dataset.g; const i = queue.shift(); grade(d.cards[i], g); if (g === 0) queue.splice(Math.min(3, queue.length), 0, i); else done++; flipped = false; api.changed(true); paintStudy(); });
    body.appendChild(w);
  }
  function paint() {
    if (study && !editing) return paintStudy();
    body.innerHTML = '';
    if (editing) {
      const w = h('<div class="flash-edit"></div>');
      d.cards.forEach((c, i) => {
        w.appendChild(h(`<input class="inp" data-q="${i}" placeholder="Question" value="${escHtml(c.q)}">`));
        w.appendChild(h(`<input class="inp" data-a="${i}" placeholder="Answer" value="${escHtml(c.a)}">`));
        w.appendChild(h(`<button class="iconbtn" data-d="${i}">${icon('x', 14)}</button>`));
      });
      body.appendChild(w);
      const add = h('<div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm ghost">+ Card</button><button class="btn sm ghost" data-bulk>Bulk add (Q :: A per line)</button></div>');
      body.appendChild(add);
      w.addEventListener('input', (e) => { const t = e.target; if (t.dataset.q != null) d.cards[+t.dataset.q].q = t.value; if (t.dataset.a != null) d.cards[+t.dataset.a].a = t.value; api.changed(); });
      w.addEventListener('keydown', (e) => e.stopPropagation());
      w.addEventListener('click', (e) => { const x = e.target.closest('[data-d]'); if (x) { d.cards.splice(+x.dataset.d, 1); order = d.cards.map((_, i) => i); api.changed(true); paint(); } });
      add.querySelector('.btn').onclick = () => { d.cards.push({ q: '', a: '' }); order = d.cards.map((_, i) => i); api.changed(true); paint(); };
      add.querySelector('[data-bulk]').onclick = async () => {
        let txt = ''; try { txt = await navigator.clipboard.readText(); } catch (e) { /* */ }
        const lines = txt.split(/\r?\n/).map(l => l.split(/\s*::\s*|\t/)).filter(p => p.length >= 2);
        if (!lines.length) { toast('Copy lines like  Question :: Answer  first, then click again'); return; }
        lines.forEach(([q, a]) => d.cards.push({ q: q.trim(), a: a.trim() })); order = d.cards.map((_, i) => i); api.changed(true); paint(); toast('Added ' + lines.length + ' cards');
      };
      return;
    }
    if (!d.cards.length) { body.innerHTML = '<div class="muted" style="text-align:center;padding:16px">No cards yet — click the pencil to add some.</div>'; return; }
    d.i = Math.min(d.i || 0, order.length - 1);
    const c = d.cards[order[d.i]];
    const w = h(`<div class="flash"><div class="fcard ${flipped ? 'flip' : ''}"><div class="fi"><div class="face">${escHtml(c.q)}</div><div class="face back">${escHtml(c.a)}</div></div></div>
      <div style="text-align:center;margin-bottom:6px"><button class="btn sm primary" data-study title="Spaced repetition: cards come back when you are about to forget them">🧠 Study due cards · ${dueCount(d.cards)} due</button></div>
      <div style="display:flex;gap:8px;justify-content:center;align-items:center"><button class="btn sm ghost" data-p>${icon('back', 14)}</button><span class="muted">${d.i + 1} / ${order.length} · click card to flip</span><button class="btn sm ghost" data-n>${icon('forward', 14)}</button><button class="btn sm ghost" data-sh>Shuffle</button></div></div>`);
    w.querySelector('[data-study]').onclick = startStudy;
    w.querySelector('.fcard').onclick = (e) => { flipped = !flipped; e.currentTarget.classList.toggle('flip', flipped); };
    w.querySelector('[data-p]').onclick = () => { d.i = (d.i - 1 + order.length) % order.length; flipped = false; paint(); };
    w.querySelector('[data-n]').onclick = () => { d.i = (d.i + 1) % order.length; flipped = false; paint(); };
    w.querySelector('[data-sh]').onclick = () => { order = order.map(v => [Math.random(), v]).sort((a, b2) => a[0] - b2[0]).map(x => x[1]); d.i = 0; flipped = false; paint(); };
    body.appendChild(w);
  }
  paint();
  return el;
}
