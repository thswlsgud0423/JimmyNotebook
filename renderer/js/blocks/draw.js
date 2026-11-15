import { icon } from '../icons.js';
import { h, toast } from '../ui.js';
import { richShell, cssVar, onTheme } from './common.js';

export const newDraw = () => ({ title: 'Sketch', h: 360, grid: true, strokes: [] });
const W = 900; // logical width
const PEN_COLORS = ['#3b3455', '#ff5b7f', '#ff9d3d', '#f4c20d', '#37c47a', '#3fb4ea', '#8c77f2', '#ffffff'];

// Ramer–Douglas–Peucker to keep saved files small
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b]; const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len; if (d > max) { max = d; idx = i; } }
    if (max > eps) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function drawStroke(ctx, s) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w;
  if (s.t === 'hl') { ctx.globalAlpha = .35; ctx.lineWidth = s.w * 3; }
  const p = s.p;
  if (s.t === 'rect') { ctx.strokeRect(p[0][0], p[0][1], p[1][0] - p[0][0], p[1][1] - p[0][1]); }
  else if (s.t === 'ellipse') { const cx = (p[0][0] + p[1][0]) / 2, cy = (p[0][1] + p[1][1]) / 2; ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(p[1][0] - p[0][0]) / 2, Math.abs(p[1][1] - p[0][1]) / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
  else if (s.t === 'line' || s.t === 'arrow') {
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.stroke();
    if (s.t === 'arrow') { const a = Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]); const L = 10 + s.w * 2; ctx.beginPath(); ctx.moveTo(p[1][0], p[1][1]); ctx.lineTo(p[1][0] - L * Math.cos(a - .45), p[1][1] - L * Math.sin(a - .45)); ctx.moveTo(p[1][0], p[1][1]); ctx.lineTo(p[1][0] - L * Math.cos(a + .45), p[1][1] - L * Math.sin(a + .45)); ctx.stroke(); }
  } else if (s.t === 'text') { ctx.font = `700 ${s.w * 5 + 12}px Nunito, 'Malgun Gothic', sans-serif`; ctx.textBaseline = 'top'; ctx.fillText(s.x, p[0][0], p[0][1]); }
  else {
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my); }
      ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); ctx.stroke();
    }
  }
  ctx.restore();
}
function hit(s, x, y, r) {
  const p = s.p;
  if (s.t === 'text') return Math.abs(x - p[0][0]) < 120 && y > p[0][1] - r && y < p[0][1] + s.w * 5 + 20 && x > p[0][0] - r;
  for (let i = 0; i < p.length; i++) { if (Math.hypot(p[i][0] - x, p[i][1] - y) < r + s.w) return true; if (i && segDist(p[i - 1], p[i], x, y) < r + s.w) return true; }
  return false;
}
function segDist(a, b, x, y) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y); }

export function paintStrokes(canvas, strokes, H, bg) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || W;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssW * (H / W) * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr * cssW / W, 0, 0, dpr * cssW / W, 0, 0);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  strokes.forEach(s => drawStroke(ctx, s));
  return ctx;
}

export function renderDraw(b, api) {
  const d = b.data;
  if (!d.strokes) d.strokes = [];
  const { el, body, tools } = richShell(b, api, { ico: 'pen', ph: 'Drawing title' });
  const redo = [];
  let tool = 'pen', color = PEN_COLORS[0], size = 3;
  const bar = h(`<div class="draw-bar">
    <button class="iconbtn tool on" data-t="pen" title="Pen">${icon('pen', 16)}</button>
    <button class="iconbtn tool" data-t="hl" title="Highlighter">🖍</button>
    <button class="iconbtn tool" data-t="line" title="Line">╱</button>
    <button class="iconbtn tool" data-t="arrow" title="Arrow">➚</button>
    <button class="iconbtn tool" data-t="rect" title="Rectangle">▭</button>
    <button class="iconbtn tool" data-t="ellipse" title="Ellipse">◯</button>
    <button class="iconbtn tool" data-t="text" title="Text">T</button>
    <button class="iconbtn tool" data-t="erase" title="Eraser (removes strokes)">${icon('eraser', 16)}</button>
    <span style="width:1px;height:20px;background:var(--line);margin:0 4px"></span>
    ${PEN_COLORS.map((c, i) => `<button class="sw ${i === 0 ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}
    <input type="color" value="#ff5b7f" title="Custom color" style="width:26px;height:26px;border:0;background:none;padding:0">
    <input type="range" min="1" max="14" value="3" title="Size">
    <span style="flex:1"></span>
    <button class="iconbtn" data-a="undo" title="Undo">${icon('undo', 16)}</button><button class="iconbtn" data-a="redo" title="Redo">${icon('redo', 16)}</button>
    <button class="iconbtn" data-a="grid" title="Toggle grid">${icon('table', 16)}</button>
    <button class="iconbtn" data-a="taller" title="Taller">${icon('arrowdown', 16)}</button>
    <button class="iconbtn" data-a="export" title="Save as image to assets & insert below">${icon('image', 16)}</button>
    <button class="iconbtn" data-a="clear" title="Clear">${icon('trash', 16)}</button></div>`);
  body.appendChild(bar);
  const wrap = h(`<div class="draw-canvas-wrap ${d.grid ? 'grid' : ''}"><canvas></canvas></div>`);
  const canvas = wrap.querySelector('canvas');
  body.appendChild(wrap);
  const setH = () => { wrap.style.height = (wrap.clientWidth || W) * (d.h / W) + 'px'; };
  const repaint = (extra) => { setH(); const ctx = paintStrokes(canvas, d.strokes, d.h); if (extra) drawStroke(ctx, extra); };
  const ro = new ResizeObserver(() => repaint()); ro.observe(wrap);
  requestAnimationFrame(() => repaint());

  bar.addEventListener('click', async (e) => {
    const t = e.target.closest('.tool'); if (t) { tool = t.dataset.t; bar.querySelectorAll('.tool').forEach(x => x.classList.toggle('on', x === t)); canvas.style.cursor = tool === 'text' ? 'text' : tool === 'erase' ? 'cell' : 'crosshair'; }
    const c = e.target.closest('.sw'); if (c) { color = c.dataset.c; bar.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === c)); if (tool === 'erase') bar.querySelector('[data-t=pen]').click(); }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const k = a.dataset.a;
    if (k === 'undo' && d.strokes.length) { redo.push(d.strokes.pop()); }
    else if (k === 'redo' && redo.length) { d.strokes.push(redo.pop()); }
    else if (k === 'clear') { if (d.strokes.length) { redo.length = 0; d.strokes.length = 0; } }
    else if (k === 'grid') { d.grid = !d.grid; wrap.classList.toggle('grid', d.grid); }
    else if (k === 'taller') { d.h = d.h >= 900 ? 300 : d.h + 120; }
    else if (k === 'export') {
      const c2 = document.createElement('canvas'); c2.style.width = W + 'px'; document.body.appendChild(c2);
      c2.style.position = 'absolute'; c2.style.left = '-9999px';
      paintStrokes(c2, d.strokes, d.h, cssVar('--bg')); const url = c2.toDataURL('image/png'); c2.remove();
      const rel = await api.ctx.saveDataUrl(url, (d.title || 'drawing').replace(/\s+/g, '-') + '.png');
      const { mk } = await import('../md.js');
      api.editor.insertAfter(b, mk('image', { src: rel, alt: d.title || 'Drawing' }), false); toast('Saved image to ' + rel); return;
    }
    api.changed(true); repaint();
  });
  bar.querySelector('input[type=color]').addEventListener('input', (e) => { color = e.target.value; bar.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); });
  bar.querySelector('input[type=range]').addEventListener('input', (e) => { size = +e.target.value; });

  // pointer drawing
  let cur = null;
  const pt = (ev) => { const r = canvas.getBoundingClientRect(); return [Math.round((ev.clientX - r.left) * W / r.width * 10) / 10, Math.round((ev.clientY - r.top) * W / r.width * 10) / 10]; };
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const p = pt(ev);
    if (tool === 'text') {
      const inp = h(`<input class="inp" style="position:absolute;left:${ev.offsetX}px;top:${ev.offsetY}px;min-width:140px;z-index:3" placeholder="Type, Enter">`); wrap.appendChild(inp); inp.focus();
      const fin = () => { if (inp.value.trim()) { d.strokes.push({ t: 'text', c: color, w: size, p: [p], x: inp.value }); redo.length = 0; api.changed(true); } inp.remove(); repaint(); };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(); if (e.key === 'Escape') inp.remove(); }); inp.addEventListener('blur', () => inp.isConnected && fin()); return;
    }
    canvas.setPointerCapture(ev.pointerId);
    if (tool === 'erase') { cur = { erase: true }; eraseAt(p); return; }
    cur = { t: tool, c: color, w: size, p: tool === 'pen' || tool === 'hl' ? [p] : [p, p] };
  });
  function eraseAt(p) { const n = d.strokes.length; d.strokes = d.strokes.filter(s => !hit(s, p[0], p[1], 10)); if (d.strokes.length !== n) { b.data.strokes = d.strokes; repaint(); } }
  canvas.addEventListener('pointermove', (ev) => {
    if (!cur) return; const p = pt(ev);
    if (cur.erase) return eraseAt(p);
    if (cur.t === 'pen' || cur.t === 'hl') cur.p.push(p); else cur.p[1] = p;
    repaint(cur);
  });
  const end = () => {
    if (!cur) return;
    if (cur.erase) { api.changed(true); cur = null; return; }
    if (cur.t === 'pen' || cur.t === 'hl') cur.p = simplify(cur.p, 0.7);
    if (cur.p.length > 1 || cur.t === 'pen' || cur.t === 'hl') { d.strokes.push(cur); redo.length = 0; api.changed(true); }
    cur = null; repaint();
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  return el;
}
