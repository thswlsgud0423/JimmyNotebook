// Timeline block: a horizontal mind-map / tree on a zoomable canvas (Prezi-style).
// Each node is a dated note (what you learned, are doing, made…). Scroll = zoom, drag empty space = move,
// drag a card = rearrange (its branch comes along), double-click a card = zoom into it. Lives inside a page.
import { icon } from '../icons.js';
import { h, escHtml, toast, confirmDialog } from '../ui.js';
import { richShell } from './common.js';
import { linkDialog, openTarget, describe, iconFor } from '../links.js';

export const KINDS = [
  { id: 'learned', label: 'Learned', emoji: '📚', color: 'var(--c1)' },
  { id: 'doing', label: 'Doing', emoji: '🛠️', color: 'var(--c3)' },
  { id: 'made', label: 'Made', emoji: '🏗️', color: 'var(--c2)' },
  { id: 'idea', label: 'Idea', emoji: '💡', color: 'var(--c4)' },
  { id: 'milestone', label: 'Milestone', emoji: '⭐', color: 'var(--c5)' }
];
const kindOf = (id) => KINDS.find(k => k.id === id) || KINDS[0];
export const newTimeline = (title = 'My timeline') => ({ title, entries: [], sort: 'new' });

const z = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? MONTHS[+m[2] - 1] + ' ' + +m[3] + ', ' + m[1] : 'No date'; };
const eid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const NW = 260, NWMIN = 160, NWMAX = 900, NHMIN = 70, GAPX = 90, GAPY = 26, KMIN = 0.12, KMAX = 2.6;

export function renderTimeline(b, api) {
  const d = b.data;
  if (!Array.isArray(d.entries)) d.entries = [];
  const { el, body } = richShell(b, api, { ico: 'calendar', ph: 'Timeline name' });
  el.classList.add('tl');

  // --- make the data safe: parents must exist, no loops
  const ids = new Set(d.entries.map(e => e.id));
  d.entries.forEach(e => { if (!e.id) { e.id = eid(); ids.add(e.id); } });
  d.entries.forEach(e => { if (e.parent && !ids.has(e.parent)) e.parent = ''; });
  d.entries.forEach(e => { let p = e, n = 0; while (p && p.parent && n++ < d.entries.length + 2) p = d.entries.find(x => x.id === p.parent); if (n > d.entries.length + 1) e.parent = ''; });
  if (typeof d.rx !== 'number') { d.rx = 0; d.ry = 0; }

  const ent = (id) => d.entries.find(e => e.id === id);
  const kids = (pid) => d.entries.map((e, i) => [e, i]).filter(([e]) => (e.parent || '') === pid)
    .sort((a, c) => (a[0].date || '').localeCompare(c[0].date || '') || a[1] - c[1]).map(([e]) => e);
  const descendants = (id) => { const out = []; const walk = (p) => kids(p).forEach(k => { out.push(k.id); walk(k.id); }); walk(id); return out; };
  const pos = (id) => (id === '' ? { x: d.rx, y: d.ry } : { x: ent(id).x, y: ent(id).y });
  const setPos = (id, x, y) => { if (id === '') { d.rx = x; d.ry = y; } else { const e = ent(id); e.x = x; e.y = y; } };

  // --- canvas shell
  const cv = h(`<div class="tlc" tabindex="-1">
    <div class="tlc-world"><svg class="tlc-edges" width="1" height="1"></svg></div>
    <div class="tlc-bar">
      <button class="btn sm primary" data-t="add" title="Add a new idea to the timeline">${icon('plus', 14)} New idea</button>
      <span class="tlc-sep"></span>
      <button class="iconbtn" data-t="out" title="Zoom out (scroll the mouse wheel down)">−</button><span class="tlc-zoom" data-t="fit" title="Click to fit everything">100%</span><button class="iconbtn" data-t="in" title="Zoom in (scroll the mouse wheel up)">+</button>
      <button class="btn sm" data-t="fit" title="Fit the whole timeline on screen">Fit all</button>
      <button class="btn sm" data-t="tidy" title="Neatly re-arrange the tree">Tidy</button>
      <button class="btn sm" data-t="play" title="Present: fly from card to card like slides (arrow keys, Esc to stop)">▶ Present</button>
      <button class="btn sm" data-t="full" title="Full screen">⛶</button>
    </div>
    <div class="tlc-hint">Scroll to zoom · drag empty space to move · drag a card to rearrange · double-click a card to zoom in · <b>+</b> on a card adds a connected idea</div>
    <div class="tlc-pbar"><button class="btn sm" data-t="prev">◀</button><span class="tlc-pn"></span><button class="btn sm" data-t="next">▶</button><button class="btn sm" data-t="stop">✕ Exit</button></div>
  </div>`);
  body.appendChild(cv);
  const world = cv.querySelector('.tlc-world'), svg = cv.querySelector('.tlc-edges');
  const zoomLbl = cv.querySelector('.tlc-zoom'), pn = cv.querySelector('.tlc-pn');
  const els = new Map();                       // id -> node element ('' = the root)
  let view = { x: 40, y: 40, k: 1 }, connecting = null, pres = null, fitted = false;

  const apply = () => {
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
    zoomLbl.textContent = Math.round(view.k * 100) + '%';
    cv.classList.toggle('lod', view.k < 0.55);
  };
  const size = () => ({ w: cv.clientWidth, h: cv.clientHeight });
  const hOf = (id) => (els.get(id) && els.get(id).offsetHeight) || 120;
  const wOf = (id) => (id === '' ? ((els.get('') && els.get('').offsetWidth) || 200) : ((ent(id) && ent(id).w) || NW));
  let raf = 0;
  const animate = (to, ms = 450) => {
    cancelAnimationFrame(raf);
    const from = { ...view }, t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      // interpolate zoom in log space so it feels even
      view = { k: Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e), x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      apply(); if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  const focusOn = (id, k = 1.25, ms = 450) => {
    const p = pos(id), { w, h: hh } = size(); if (!w) return;
    animate({ k, x: w / 2 - (p.x + wOf(id) / 2) * k, y: hh / 2 - (p.y + hOf(id) / 2) * k }, ms);
  };
  const bounds = () => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    [''].concat(d.entries.map(e => e.id)).forEach(id => { const p = pos(id); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + wOf(id)); y1 = Math.max(y1, p.y + hOf(id)); });
    return { x0, y0, x1, y1 };
  };
  const fit = (ms = 400) => {
    const { w, h: hh } = size(); if (!w) return;
    const bd = bounds(), bw = bd.x1 - bd.x0 + 100, bh = bd.y1 - bd.y0 + 100;
    const k = Math.max(KMIN, Math.min(1.1, w / bw, hh / bh));
    const to = { k, x: (w - (bd.x1 - bd.x0) * k) / 2 - bd.x0 * k, y: (hh - (bd.y1 - bd.y0) * k) / 2 - bd.y0 * k };
    if (ms) animate(to, ms); else { view = to; apply(); }
  };
  const zoomAt = (cx, cy, f) => {
    cancelAnimationFrame(raf);
    const k = Math.max(KMIN, Math.min(KMAX, view.k * f)); f = k / view.k;
    view = { k, x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f }; apply();
  };

  // --- drawing
  function edges() {
    let s = '';
    d.entries.forEach(e => {
      const pid = e.parent || '', pp = pos(pid), c = pos(e.id);
      if (!els.has(e.id) || !els.has(pid) || typeof c.x !== 'number') return;
      const x1 = pp.x + wOf(pid), y1 = pp.y + hOf(pid) / 2, x2 = c.x, y2 = c.y + hOf(e.id) / 2, dx = Math.max(40, (x2 - x1) / 2);
      s += `<path d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}" style="stroke:${kindOf(e.kind).color}"/>`;
    });
    svg.innerHTML = s;
  }
  const place = (id) => { const n = els.get(id), p = pos(id); if (n && typeof p.x === 'number') { n.style.left = p.x + 'px'; n.style.top = p.y + 'px'; } };
  const placeAll = () => { els.forEach((_, id) => place(id)); edges(); };

  function tidy() {
    const memo = new Map();
    const S = (id) => {
      if (memo.has(id)) return memo.get(id);
      const ks = kids(id), own = hOf(id);
      const tot = ks.length ? ks.reduce((s, k) => s + S(k.id), 0) + GAPY * (ks.length - 1) : 0;
      const v = Math.max(own, tot); memo.set(id, v); return v;
    };
    const lay = (id, top, x) => {
      const ks = kids(id), slot = S(id);
      setPos(id, x, top + (slot - hOf(id)) / 2);
      const tot = ks.length ? ks.reduce((s, k) => s + S(k.id), 0) + GAPY * (ks.length - 1) : 0;
      let cy = top + (slot - tot) / 2;
      ks.forEach(k => { lay(k.id, cy, x + wOf(id) + GAPX); cy += S(k.id) + GAPY; });
    };
    const oy = d.ry, ox = d.rx; lay('', 0, ox);
    const dy = oy - d.ry; setPos('', d.rx, d.ry + dy); d.entries.forEach(e => { e.y += dy; });
  }

  function nodeHtml(e) {
    const k = kindOf(e.kind);
    return `<div class="tlc-node" data-id="${e.id}" style="--tc:${k.color}">
      <div class="tlc-grab"><span class="tl-dot" title="${escHtml(k.label)}">${k.emoji}</span>
        <label class="tl-day" title="Change the date">${escHtml(dayLabel(e.date))}<input type="date" value="${escHtml(e.date || '')}" data-k="date"></label>
        <span class="tl-sp"></span>
        ${e.kind === 'doing' ? `<button class="iconbtn" data-a="done" title="Mark as finished (becomes “Made”)">${icon('check', 15)}</button>` : ''}
        <button class="iconbtn" data-a="link" title="Link a page, file or website">${icon('link', 15)}</button>
        <button class="iconbtn" data-a="kind" title="Change type: ${escHtml(k.label)} → next">${icon('tag', 15)}</button>
        <button class="iconbtn" data-a="move" title="Re-connect: hang this idea under another one">${icon('forward', 15)}</button>
        <button class="iconbtn" data-a="del" title="Delete this idea">${icon('x', 15)}</button></div>
      <div class="tl-title" contenteditable="true" spellcheck="false" data-k="text" data-ph="What happened?"></div>
      <div class="tl-note" contenteditable="true" spellcheck="false" data-k="note" data-ph="Details… what you understood, how it went, what's next"></div>
      ${e.link ? `<button class="tl-link" data-a="open" title="${escHtml(describe(e.link))}">${icon(iconFor(e.link), 13)} ${escHtml(describe(e.link).replace(/^(Page|Website|File|App screen) /, '').replace(/ on this computer$/, ''))}</button>` : ''}
      <button class="tlc-plus" data-a="child" title="Add an idea connected to this one">+</button>
      <span class="tlc-rz" title="Drag to resize (double-click to reset)"></span></div>`;
  }

  function paint() {
    [...world.children].forEach(c => { if (c !== svg) c.remove(); });
    els.clear();
    const root = h(`<div class="tlc-node root" data-id=""><span class="tlc-rt"></span><button class="tlc-plus" data-a="child" title="Add an idea">+</button></div>`);
    root.querySelector('.tlc-rt').textContent = '🗺️ ' + (d.title || 'My timeline');
    world.appendChild(root); els.set('', root);
    d.entries.forEach(e => {
      const n = h(nodeHtml(e));
      if (e.w) n.style.width = e.w + 'px';
      if (e.ht) { n.style.minHeight = e.ht + 'px'; n.classList.add('sized'); }
      n.querySelector('[data-k=text]').textContent = e.text || '';
      n.querySelector('[data-k=note]').textContent = e.note || '';
      world.appendChild(n); els.set(e.id, n);
    });
    placeAll();
    cv.classList.toggle('empty', !d.entries.length);
    if (pres != null) markPres();
  }
  const titleInput = el.querySelector('.rt');
  titleInput.addEventListener('input', () => { const r = els.get(''); if (r) r.querySelector('.tlc-rt').textContent = '🗺️ ' + (d.title || 'My timeline'); edges(); });

  // --- adding / editing
  function addChild(pid, focusIt = true) {
    const pp = pos(pid), sibs = kids(pid), parent = pid ? ent(pid) : null;
    const x = pp.x + wOf(pid) + GAPX;
    let y = pp.y + hOf(pid) / 2 - 50;
    if (sibs.length) { const last = sibs.reduce((m, s) => (s.y > m.y ? s : m), sibs[0]); y = last.y + hOf(last.id) + GAPY; }
    const e = { id: eid(), date: todayStr(), kind: parent ? parent.kind : 'learned', text: '', note: '', link: '', parent: pid, x, y };
    d.entries.push(e); api.changed(true); paint();
    if (focusIt) { focusOn(e.id, Math.max(view.k, 1), 350); const t = els.get(e.id).querySelector('[data-k=text]'); setTimeout(() => t && t.focus(), 60); }
    return e;
  }
  const findEntry = (n) => { const it = n.closest('.tlc-node'); return it && it.dataset.id ? ent(it.dataset.id) : null; };
  let edgeRaf = 0;
  world.addEventListener('input', (ev) => {
    const t = ev.target, e = findEntry(t); if (!e) return;
    if (t.dataset.k === 'text') e.text = t.textContent; else if (t.dataset.k === 'note') e.note = t.textContent;
    api.changed(); cancelAnimationFrame(edgeRaf); edgeRaf = requestAnimationFrame(edges);
  });
  world.addEventListener('change', (ev) => { const t = ev.target; if (t.dataset.k === 'date') { const e = findEntry(t); if (e && t.value) { e.date = t.value; api.changed(true); paint(); } } });
  world.addEventListener('paste', (ev) => { if (ev.target.dataset && ev.target.dataset.k) { ev.preventDefault(); ev.stopPropagation(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain')); } });
  world.addEventListener('keydown', (ev) => {
    if (ev.target.dataset && ev.target.dataset.k === 'text') {
      if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); const e = findEntry(ev.target); if (e) addChild(e.id); }
    }
  });
  const stepConnect = (id) => {
    const src = ent(connecting);
    if (id === connecting || descendants(connecting).includes(id)) return toast('Pick a different idea — it can’t hang under itself');
    src.parent = id; connecting = null; cv.classList.remove('connecting'); api.changed(true); tidy(); paint(); toast('Moved. Use “Tidy” any time to neaten the tree.', 1600);
  };
  world.addEventListener('click', async (ev) => {
    const node = ev.target.closest('.tlc-node');
    if (connecting != null && node) { ev.preventDefault(); return stepConnect(node.dataset.id); }
    const a = ev.target.closest('[data-a]'); if (!a) return;
    const e = findEntry(a), act = a.dataset.a;
    if (act === 'child') addChild(node.dataset.id);
    else if (!e) return;
    else if (act === 'del') {
      const hasKids = kids(e.id).length;
      if (!e.text && !e.note && !hasKids || await confirmDialog(hasKids ? 'Delete this idea? Ideas connected to it move up one level.' : 'Delete this idea?', 'Delete', true)) {
        kids(e.id).forEach(k => { k.parent = e.parent || ''; });
        d.entries = d.entries.filter(x => x !== e); api.changed(true); paint();
      }
    }
    else if (act === 'done') { e.kind = 'made'; e.date = todayStr(); api.changed(true); paint(); toast('Nice — marked as made 🎉'); }
    else if (act === 'kind') { const i = KINDS.findIndex(k => k.id === e.kind); e.kind = KINDS[(i + 1) % KINDS.length].id; api.changed(true); paint(); }
    else if (act === 'move') { connecting = e.id; cv.classList.add('connecting'); toast('Now click the idea (or the big title) it should hang under. Esc cancels.', 3200); }
    else if (act === 'link') { const r = await linkDialog({ title: 'Link for this idea', askText: false, target: e.link || '', canRemove: !!e.link }); if (r) { e.link = r.remove ? '' : r.target; api.changed(true); paint(); } }
    else if (act === 'open') openTarget(e.link, { relink: (u) => { e.link = u; api.changed(true); paint(); } });
  });
  world.addEventListener('dblclick', (ev) => {
    const node = ev.target.closest('.tlc-node');
    if (node && ev.target.closest('.tlc-rz')) { const e = ent(node.dataset.id); if (e) { delete e.w; delete e.ht; node.style.width = ''; node.style.minHeight = ''; node.classList.remove('sized'); edges(); api.changed(true); } return; }
    if (!node || ev.target.closest('[contenteditable],button,input')) return;
    if (node.classList.contains('root')) {
      const rt = node.querySelector('.tlc-rt'); rt.textContent = d.title || ''; rt.contentEditable = 'true'; rt.focus();
      const done = () => { rt.contentEditable = 'false'; d.title = rt.textContent.trim() || 'My timeline'; rt.textContent = '🗺️ ' + d.title; titleInput.textContent = d.title; api.changed(true); edges(); };
      rt.addEventListener('blur', done, { once: true }); rt.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); rt.blur(); } });
      return;
    }
    focusOn(node.dataset.id, 1.5);
  });

  // --- mouse: pan the canvas / drag a card (its branch comes with it)
  cv.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || connecting != null) return;
    const t = ev.target;
    const rz = t.closest('.tlc-rz');
    if (rz && pres == null) {
      const node = rz.closest('.tlc-node'), e = ent(node.dataset.id); if (!e) return;
      ev.preventDefault(); ev.stopPropagation();
      const sx = ev.clientX, sy = ev.clientY, w0 = node.offsetWidth, h0 = node.offsetHeight;
      cv.classList.add('resizing');
      const mv = (e2) => {
        e.w = Math.round(Math.max(NWMIN, Math.min(NWMAX, w0 + (e2.clientX - sx) / view.k)));
        e.ht = Math.round(Math.max(NHMIN, h0 + (e2.clientY - sy) / view.k));
        node.style.width = e.w + 'px'; node.style.minHeight = e.ht + 'px'; node.classList.add('sized');
        // children keep their gap if they sat right of this card
        edges();
      };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); cv.classList.remove('resizing'); api.changed(true); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
      return;
    }
    if (t.closest('.tlc-bar,.tlc-pbar,[contenteditable],button,input,label,select')) return;
    const node = t.closest('.tlc-node');
    cv.focus({ preventScroll: true });
    const sx = ev.clientX, sy = ev.clientY; let moved = false;
    let drag = null;
    if (node && pres == null) {
      const id = node.dataset.id;
      const set = id === '' ? [''].concat(d.entries.map(e => e.id)) : (ev.shiftKey ? [id] : [id].concat(descendants(id)));
      drag = set.map(i => ({ id: i, o: { ...pos(i) } }));
    } else if (node) return;
    const orig = { x: view.x, y: view.y };
    cancelAnimationFrame(raf);
    const mv = (e2) => {
      const dx = e2.clientX - sx, dy = e2.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!moved) { moved = true; cv.classList.add(drag ? 'dragging-node' : 'panning'); }
      if (drag) { drag.forEach(({ id, o }) => { setPos(id, o.x + dx / view.k, o.y + dy / view.k); place(id); }); edges(); }
      else { view.x = orig.x + dx; view.y = orig.y + dy; apply(); }
    };
    const up = () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      cv.classList.remove('dragging-node', 'panning');
      if (moved && drag) api.changed(true);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  cv.addEventListener('wheel', (ev) => {
    if (ev.target.closest('.tlc-bar,.tlc-pbar')) return;
    ev.preventDefault(); ev.stopPropagation();
    const r = cv.getBoundingClientRect();
    zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * 0.0016));
  }, { passive: false });

  // --- presenting: fly from card to card
  const order = () => { const out = []; const walk = (p) => kids(p).forEach(k => { out.push(k.id); walk(k.id); }); walk(''); return out; };
  const markPres = () => {
    const seq = order(); const cur = seq[pres];
    els.forEach((n, id) => n.classList.toggle('cur', id === cur));
    pn.textContent = seq.length ? (pres + 1) + ' / ' + seq.length : 'Nothing to present yet';
  };
  const go = (i) => { const seq = order(); if (!seq.length) return markPres(); pres = Math.max(0, Math.min(seq.length - 1, i)); markPres(); focusOn(seq[pres], 1.35, 650); };
  const startPres = () => { if (!d.entries.length) return toast('Add some ideas first'); cv.classList.add('full', 'present'); pres = 0; setTimeout(() => go(0), 80); };
  const stopPres = () => { pres = null; cv.classList.remove('present'); els.forEach(n => n.classList.remove('cur')); fit(300); };

  cv.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { if (connecting != null) { connecting = null; cv.classList.remove('connecting'); } else if (pres != null) stopPres(); else if (cv.classList.contains('full')) { cv.classList.remove('full'); setTimeout(() => fit(250), 50); } return; }
    if (pres != null && !ev.target.closest('[contenteditable]')) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === ' ' || ev.key === 'PageDown') { ev.preventDefault(); go(pres + 1); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || ev.key === 'PageUp') { ev.preventDefault(); go(pres - 1); }
    }
  });
  cv.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-t]'); if (!t) return;
    const { w, h: hh } = size(), c = t.dataset.t;
    if (c === 'add') addChild('');
    else if (c === 'in') zoomAt(w / 2, hh / 2, 1.3);
    else if (c === 'out') zoomAt(w / 2, hh / 2, 1 / 1.3);
    else if (c === 'fit') fit();
    else if (c === 'tidy') { tidy(); placeAll(); api.changed(true); fit(); }
    else if (c === 'play') startPres();
    else if (c === 'next') go((pres || 0) + 1);
    else if (c === 'prev') go((pres || 0) - 1);
    else if (c === 'stop') stopPres();
    else if (c === 'full') { cv.classList.toggle('full'); setTimeout(() => fit(250), 60); }
  });

  paint();
  // measure + lay out once the canvas is on screen and has a size
  const ro = new ResizeObserver(() => {
    if (!cv.clientWidth) return;
    if (!fitted) {
      fitted = true;
      if (d.entries.some(e => typeof e.x !== 'number' || typeof e.y !== 'number')) { tidy(); placeAll(); api.changed(); }
      fit(0);
    }
  });
  ro.observe(cv);
  return el;
}
