// Notion-style block editor. Blocks live in `editor.blocks`; markdown text is the source of truth for inline content.
import { mk, uid, mdToHtml, htmlToMd, parseBlocks, serializeBlocks } from './md.js';
import { icon } from './icons.js';
import { h, openMenu, closeMenus, toast, escHtml, placeCaretEnd, placeCaretStart, debounce, emojiPicker } from './ui.js';
import { renderChart, newChart } from './blocks/chart.js';
import { renderDraw, newDraw } from './blocks/draw.js';
import { renderDatabase, newDatabase } from './blocks/database.js';
import { renderPortfolio, newPortfolio } from './blocks/portfolio.js';
import { renderTimer, newTimer, renderFlash, newFlash } from './blocks/extras.js';
import { renderTimeline, newTimeline } from './blocks/timeline.js';
import { highlight, LANGS } from './highlight.js';
import { widgetCard, pickWidget, newInstance, widgetList, WIDGETS } from './widgets.js';
import { lightbox } from './ui.js';
import { linkDialog, linkHTML, openTarget } from './links.js';

export const CALLOUT_ICONS = { note: '📝', tip: '💡', info: 'ℹ️', warning: '⚠️', danger: '🚫', success: '✅', question: '❓', quote: '💬', example: '🧪', idea: '✨', bug: '🐛', todo: '☑️' };
const TEXTY = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'todo', 'quote', 'toggle', 'callout'];
const RICH_TYPES = ['chart', 'draw', 'database', 'portfolio', 'timer', 'flash', 'timeline'];
const MATH_SNIPPETS = [
  ['a⁄b', '\\frac{a}{b}'], ['√', '\\sqrt{x}'], ['xⁿ', 'x^{n}'], ['xₙ', 'x_{n}'], ['Σ', '\\sum_{i=1}^{n} a_i'], ['∫', '\\int_{a}^{b} f(x)\\,dx'], ['lim', '\\lim_{x \\to \\infty} f(x)'],
  ['∂', '\\frac{\\partial f}{\\partial x}'], ['[ ]', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'], ['align', '\\begin{aligned}\n a &= b + c \\\\\n &= d\n\\end{aligned}'], ['cases', 'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}'],
  ['α β', '\\alpha, \\beta, \\gamma, \\theta, \\lambda, \\mu, \\sigma, \\omega'], ['≤ ≠ ≈', '\\le \\ne \\approx \\infty'], ['→ ⇒', '\\to \\Rightarrow \\iff'], ['vec', '\\vec{v}'], ['H₂O', '\\ce{H2O}']
];
const PH = { p: "Type '/' for commands, '[[' to link a page", h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', ul: 'List item', ol: 'List item', todo: 'To-do', quote: 'Quote', toggle: 'Toggle title' };

export const COMMANDS = [
  { title: 'Text', desc: 'Plain paragraph', icon: 'text', kw: 'paragraph plain text', type: 'p' },
  { title: 'Heading 1', desc: 'Big section title', icon: 'heading', kw: 'h1 title', type: 'h1' },
  { title: 'Heading 2', desc: 'Medium heading', icon: 'heading', kw: 'h2 subtitle', type: 'h2' },
  { title: 'Heading 3', desc: 'Small heading', icon: 'heading', kw: 'h3', type: 'h3' },
  { title: 'Bulleted list', desc: 'Simple bullets', icon: 'list', kw: 'ul bullet unordered', type: 'ul' },
  { title: 'Numbered list', desc: '1. 2. 3.', icon: 'olist', kw: 'ol number ordered', type: 'ol' },
  { title: 'To-do list', desc: 'Track tasks with checkboxes', icon: 'todo', kw: 'todo task check', type: 'todo' },
  { title: 'Toggle', desc: 'Collapsible section', icon: 'toggle', kw: 'toggle fold collapse details', type: 'toggle' },
  { title: 'Quote', desc: 'Highlight a quote', icon: 'quote', kw: 'quote cite', type: 'quote' },
  { title: 'Callout', desc: 'Make something stand out', icon: 'callout', kw: 'callout note tip info warning', make: () => ({ type: 'callout', kind: 'note', title: '', text: '' }) },
  { title: 'Divider', desc: 'Visual separator', icon: 'hr', kw: 'divider line hr', make: () => ({ type: 'hr' }) },
  { title: 'Code', desc: 'Code snippet', icon: 'code', kw: 'code snippet', make: () => ({ type: 'code', lang: '', text: '' }) },
  { title: 'Math equation', desc: 'LaTeX formula (KaTeX)', icon: 'type', kw: 'math latex equation formula katex', make: () => ({ type: 'math', text: '' }) },
  { title: 'Table', desc: 'Simple table', icon: 'table', kw: 'table grid', make: () => ({ type: 'table', rows: [['Column 1', 'Column 2', 'Column 3'], ['', '', ''], ['', '', '']] }) },
  { title: 'Image', desc: 'Upload, paste or link', icon: 'image', kw: 'image picture photo', make: () => ({ type: 'image', src: '', alt: '' }) },
  { title: 'Bar chart', desc: 'Compare values', icon: 'chart', kw: 'chart bar graph', make: () => ({ type: 'chart', data: newChart('bar') }) },
  { title: 'Line chart', desc: 'Trends over time', icon: 'chart', kw: 'chart line graph trend', make: () => ({ type: 'chart', data: newChart('line') }) },
  { title: 'Pie chart', desc: 'Parts of a whole', icon: 'pie', kw: 'chart pie donut doughnut', make: () => ({ type: 'chart', data: newChart('pie') }) },
  { title: 'Drawing', desc: 'Sketch with a pen', icon: 'pen', kw: 'draw sketch whiteboard paint', make: () => ({ type: 'draw', data: newDraw() }) },
  { title: 'Database table', desc: 'Rows & typed columns', icon: 'db', kw: 'database table notion collection', make: () => ({ type: 'database', data: newDatabase('table') }) },
  { title: 'Kanban board', desc: 'Drag cards between columns', icon: 'kanban', kw: 'kanban board status project', make: () => ({ type: 'database', data: newDatabase('board') }) },
  { title: 'Portfolio tracker', desc: 'Live stock & crypto prices', icon: 'wallet', kw: 'portfolio stock invest crypto money finance', make: () => ({ type: 'portfolio', data: newPortfolio() }) },
  { title: 'Pomodoro timer', desc: 'Focus sessions', icon: 'timer', kw: 'timer pomodoro focus study', make: () => ({ type: 'timer', data: newTimer() }) },
  { title: 'Timeline', desc: 'A dated log: what you learned, are doing, made', icon: 'calendar', kw: 'timeline log history progress learned learning project made journal', make: () => ({ type: 'timeline', data: newTimeline() }) },
  { title: 'Flashcards', desc: 'Study with flip cards', icon: 'cards', kw: 'flashcards study cards memorize quiz', make: () => ({ type: 'flash', data: newFlash() }) },
  { title: '2 columns', desc: 'Side-by-side layout', icon: 'layout', kw: 'columns layout split two', make: () => ({ type: 'columns', cols: [[mk('p')], [mk('p')]] }) },
  { title: '3 columns', desc: 'Three-column layout', icon: 'layout', kw: 'columns layout three', make: () => ({ type: 'columns', cols: [[mk('p')], [mk('p')], [mk('p')]] }) },
  { title: 'Widget…', desc: 'Clock, habits, countdown, watchlist…', icon: 'sparkle', kw: 'widget dashboard gallery', special: 'widget' },
  { title: 'Table of contents', desc: 'Auto-updating list of headings', icon: 'list', kw: 'toc contents outline headings', make: () => ({ type: 'toc', data: {} }) },
  { title: 'Link to page', desc: 'Type [[ to link a note', icon: 'link', kw: 'link page wikilink mention', special: 'link' },
  { title: "Today's date", desc: 'Insert [[YYYY-MM-DD]] link', icon: 'calendar', kw: 'date today daily', special: 'date' },
  { title: 'Template…', desc: 'Insert a template', icon: 'file', kw: 'template', special: 'template' }
];
widgetList().forEach((w) => COMMANDS.push({ title: 'Widget: ' + w.title, desc: w.desc, icon: w.icon, kw: 'widget ' + w.kind, make: () => ({ type: 'widget', data: newInstance(w.kind) }) }));

function burst(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
export function renderInlineMath(root) {
  if (!window.katex) return;
  root.querySelectorAll('.imath').forEach((s) => {
    try { window.katex.render(s.dataset.tex || s.textContent, s, { throwOnError: false, displayMode: false }); }
    catch (e) { /* keep raw text */ }
  });
}
function renderMathInto(el, tex) {
  if (!window.katex) { el.textContent = tex; return; }
  try { window.katex.render(tex || '\\text{click to add an equation}', el, { throwOnError: true, displayMode: true }); el.classList.remove('math-err'); }
  catch (e) { el.textContent = String(e.message || e).replace(/^KaTeX parse error: /, ''); el.classList.add('math-err'); }
}

function numberRuns(blocks) {
  const counters = []; const out = new Map(); let prev = null;
  blocks.forEach((b) => {
    if (b.type !== 'ol') { prev = b; counters.length = 0; return; }
    const d = b.indent || 0;
    if (!prev || prev.type !== 'ol') counters.length = 0;
    counters.length = d + 1;
    counters[d] = (counters[d] || 0) + 1;
    out.set(b.id, counters[d]);
    prev = b;
  });
  return out;
}

function caretInfo(el) {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return null;
  const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
  const post = document.createRange(); post.selectNodeContents(el); post.setStart(r.endContainer, r.endOffset);
  const wrap = (rng) => { const d = document.createElement('div'); d.appendChild(rng.cloneContents()); return htmlToMd(d).replace(/\n$/, ''); };
  const preText = pre.toString().replace(/​/g, '');
  return { before: wrap(pre), after: wrap(post), collapsed: r.collapsed, atStart: r.collapsed && preText === '', atEnd: r.collapsed && post.toString().replace(/​/g, '') === '', preText, range: r };
}
function setCaretOffset(el, n) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node, left = n;
  while ((node = w.nextNode())) {
    if (node.parentElement.closest('[contenteditable=false]')) { left -= node.length; if (left <= 0) { const r = document.createRange(); r.setStartAfter(node.parentElement.closest('[contenteditable=false]')); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } continue; }
    if (left <= node.length) { const r = document.createRange(); r.setStart(node, left); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; }
    left -= node.length;
  }
  placeCaretEnd(el);
}
function lineEdge(el, up) {
  const sel = getSelection();
  if (!sel.rangeCount) return true;
  const saved = sel.getRangeAt(0).cloneRange();
  const r = saved.cloneRange(); r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect || (rect.width === 0 && rect.height === 0)) { const sp = document.createElement('span'); sp.textContent = '​'; r.insertNode(sp); rect = sp.getBoundingClientRect(); sp.remove(); el.normalize(); sel.removeAllRanges(); sel.addRange(saved); }
  const er = el.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
  return up ? rect.top - er.top < lh * 0.9 : er.bottom - rect.bottom < lh * 0.9;
}

let lastBlockClip = '';   // text of the last block(s) copied inside the editor, so pasting brings back real blocks
export class Editor {
  constructor(host, blocks, { ctx, onChange, parent = null } = {}) {
    this.host = host; this.ctx = ctx; this.onChange = onChange; this.parent = parent;
    this.root = parent ? parent.root : this;
    this.blocks = blocks && blocks.length ? blocks : [mk('p')];
    host.classList.add('editor');
    if (!parent) {
      this.hist = []; this.hi = -1; this.snapSoon = debounce(() => this.snap(), 500);
      this.slash = null; this.focusedBlk = null; this.selBlocks = [];
      this.bind();
      this.snap(true);
    }
    this.render();
  }

  // ---------- history ----------
  snap(force) {
    const s = JSON.stringify(this.blocks);
    if (!force && this.hist[this.hi] === s) return;
    this.hist = this.hist.slice(0, this.hi + 1); this.hist.push(s); if (this.hist.length > 120) this.hist.shift();
    this.hi = this.hist.length - 1;
  }
  undo(redo) {
    this.snap();
    const ni = this.hi + (redo ? 1 : -1);
    if (ni < 0 || ni >= this.hist.length) return;
    const cur = document.activeElement && document.activeElement.closest && document.activeElement.closest('.blk'); const curId = cur && cur.dataset.id;
    this.hi = ni; this.blocks = JSON.parse(this.hist[ni]);
    this.render(); this.onChange && this.onChange(this.blocks);
    const keep = curId && this.host.querySelector(`.blk[data-id="${curId}"] [data-nav]:not(textarea)`);
    const f = keep || this.host.querySelector('[data-nav]:not(textarea)'); if (f) placeCaretEnd(f);
  }
  // keep any "table of contents" blocks in sync with the headings
  refreshToc() {
    const lists = this.host.querySelectorAll('.toc-list'); if (!lists.length) return;
    const hs = [];
    (function walk(bl) { bl.forEach((x) => { if (/^h[123]$/.test(x.type)) hs.push(x); if (x.children) walk(x.children); if (x.cols) x.cols.forEach(walk); }); })(this.blocks);
    const html = hs.length ? hs.map((x) => `<button class="toc-i l${x.type[1]}" data-h="${x.id}">${escHtml(x.text.replace(/[*_`~=]|\[\[|\]\]/g, '') || 'Untitled')}</button>`).join('') : '<div class="muted" style="font-size:13px">Add headings to see them here.</div>';
    lists.forEach((l) => { l.innerHTML = html; });
  }
  // called by any block when its data changes
  changed(structural = false) {
    const r = this.root;
    if (this.parent) { this.parent.changed(structural); return; }
    if (structural) r.snap(); else r.snapSoon();
    r.onChange && r.onChange(r.blocks);
    if (r.host.querySelector('.toc-list')) { clearTimeout(r._tocT); r._tocT = setTimeout(() => r.refreshToc(), 350); }
  }

  // ---------- rendering ----------
  render() {
    this.host.innerHTML = '';
    const nums = numberRuns(this.blocks);
    this.blocks.forEach((b) => this.host.appendChild(this.renderBlock(b, nums.get(b.id))));
    if (!this.parent) this.host.classList.toggle('empty-doc', this.blocks.length === 1 && this.blocks[0].type === 'p' && !this.blocks[0].text);
  }
  txt(b, field, ph, extraCls = '') {
    const d = document.createElement('div');
    d.className = 'txt ' + extraCls; d.contentEditable = 'true'; d.spellcheck = document.documentElement.dataset.spell === 'on';
    d.dataset.txt = field; d.dataset.nav = '1'; d.dataset.ph = ph || '';
    d.innerHTML = mdToHtml(b[field] || '', this.ctx);
    renderInlineMath(d);
    return d;
  }
  renderBlock(b, num) {
    const el = document.createElement('div');
    el.className = 'blk t-' + b.type; el.dataset.id = b.id; el._blk = b; el._ed = this;
    const handle = h(`<div class="blk-handle"><button class="iconbtn add" title="Add block below" tabindex="-1">${icon('plus', 16)}</button><button class="iconbtn drag" title="Drag to move · click for menu" tabindex="-1">${icon('drag', 16)}</button></div>`);
    el.appendChild(handle);
    const body = document.createElement('div'); body.className = 'blk-body'; el.appendChild(body);
    const ind = (b.indent || 0) * 26;
    switch (b.type) {
      case 'p': case 'h1': case 'h2': case 'h3': body.appendChild(this.txt(b, 'text', PH[b.type])); break;
      case 'ul': {
        const row = h(`<div class="row" style="padding-left:${ind}px"><span class="marker">${['•', '◦', '▪'][(b.indent || 0) % 3]}</span></div>`);
        row.appendChild(this.txt(b, 'text', PH.ul)); body.appendChild(row); break;
      }
      case 'ol': {
        const row = h(`<div class="row" style="padding-left:${ind}px"><span class="marker ol">${num || 1}.</span></div>`);
        row.appendChild(this.txt(b, 'text', PH.ol)); body.appendChild(row); break;
      }
      case 'todo': {
        const row = h(`<div class="row ${b.checked ? 'todo-done' : ''}" style="padding-left:${ind}px"><span class="chk ${b.checked ? 'on' : ''}">${icon('check', 14)}</span></div>`);
        row.appendChild(this.txt(b, 'text', PH.todo)); body.appendChild(row); break;
      }
      case 'quote': { const q = h('<div class="qwrap"></div>'); q.appendChild(this.txt(b, 'text', PH.quote)); body.appendChild(q); break; }
      case 'callout': {
        const c = h(`<div class="callout" data-k="${escHtml(b.kind || 'note')}"><span class="cico" title="Change type">${CALLOUT_ICONS[b.kind] || '📝'}</span><div class="cbody"></div></div>`);
        const cb = c.querySelector('.cbody');
        cb.appendChild(this.txt(b, 'title', 'Callout title', 'ctitle'));
        cb.appendChild(this.txt(b, 'text', 'Write something…'));
        body.appendChild(c); break;
      }
      case 'toggle': {
        const head = h(`<div class="tg-head"><span class="tg-caret ${b.open ? 'open' : ''}">${icon('chevron', 16)}</span></div>`);
        head.appendChild(this.txt(b, 'text', PH.toggle));
        const kids = h(`<div class="tg-kids" ${b.open ? '' : 'hidden'}></div>`);
        if (!b.children || !b.children.length) b.children = [mk('p')];
        body.appendChild(head); body.appendChild(kids);
        new Editor(kids, b.children, { ctx: this.ctx, parent: this });
        break;
      }
      case 'code': {
        const w = h(`<div class="code-wrap"><div class="code-bar"><select>${LANGS.map(([v, l]) => `<option value="${v}" ${(b.lang || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="grow"></span><span class="code-meta"></span><button class="iconbtn" data-copy title="Copy code">${icon('copy', 15)}</button></div><div class="code-edit"><pre class="code-hl" aria-hidden="true"></pre><textarea class="code-ta" spellcheck="false" wrap="soft" data-nav="1" data-code="1" rows="1"></textarea></div></div>`);
        const ta = w.querySelector('.code-ta'), pre = w.querySelector('.code-hl'), meta = w.querySelector('.code-meta');
        ta.value = b.text || '';
        const sync = () => { pre.innerHTML = highlight(ta.value, b.lang) + '\n'; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; meta.textContent = ta.value.split('\n').length + ' lines'; };
        w.querySelector('select').onchange = (e) => { b.lang = e.target.value; sync(); this.changed(true); };
        w.querySelector('[data-copy]').onclick = () => { navigator.clipboard.writeText(b.text); toast('Copied code'); };
        ta.addEventListener('input', () => { b.text = ta.value; sync(); this.changed(); });
        requestAnimationFrame(sync); setTimeout(sync, 120);
        body.appendChild(w); break;
      }
      case 'columns': {
        if (!b.cols || !b.cols.length) b.cols = [[mk('p')], [mk('p')]];
        b.cols.forEach(c => { if (!c.length) c.push(mk('p')); });
        const g = h('<div class="cols"><div class="cols-tools"><button class="btn sm ghost" data-a="add">+ Column</button><button class="btn sm ghost" data-a="rm">− Column</button></div></div>');
        b.cols.forEach((c) => { const cell = h('<div class="col-cell"></div>'); g.appendChild(cell); new Editor(cell, c, { ctx: this.ctx, parent: this }); });
        g.querySelector('.cols-tools').addEventListener('click', (e) => {
          const a = e.target.closest('[data-a]'); if (!a) return;
          if (a.dataset.a === 'add' && b.cols.length < 4) b.cols.push([mk('p')]);
          else if (a.dataset.a === 'rm' && b.cols.length > 1) { const last = b.cols.pop(); const keep = last.filter(x => x.type !== 'p' || x.text); b.cols[b.cols.length - 1].push(...keep); }
          this.changed(true); this.refresh(b);
        });
        body.appendChild(g); break;
      }
      case 'toc': {
        const w = h(`<div class="toc-block"><div class="toc-h">${icon('list', 15)}<span>Table of contents</span><button class="iconbtn" data-del title="Remove">${icon('x', 14)}</button></div><div class="toc-list"></div></div>`);
        w.querySelector('[data-del]').onclick = () => this.removeBlock(b);
        w.querySelector('.toc-list').addEventListener('click', (e) => { const a = e.target.closest('[data-h]'); if (!a) return; const t = this.root.host.querySelector(`[data-id="${a.dataset.h}"]`); t && t.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
        body.appendChild(w); setTimeout(() => this.root.refreshToc(), 0); break;
      }
      case 'widget': {
        const d = b.data || (b.data = {});
        if (!WIDGETS[d.kind]) { body.appendChild(h(`<div class="card" style="padding:12px" class="muted">Unknown widget “${escHtml(d.kind || '')}”</div>`)); break; }
        if (!d.id) d.id = 'w' + Date.now().toString(36); if (!d.cfg) d.cfg = (WIDGETS[d.kind].defaults ? WIDGETS[d.kind].defaults() : {});
        body.appendChild(widgetCard(d, { block: true, save: () => this.changed(), onRemove: () => this.removeBlock(b) })); break;
      }
      case 'hr': body.appendChild(h('<hr class="hr-line">')); break;
      case 'math': {
        const w = h(`<div class="math-wrap"><div class="math-block" title="Click to edit LaTeX"></div><div class="math-editor" hidden><div class="math-snips">${MATH_SNIPPETS.map(([l], i) => `<button data-i="${i}">${escHtml(l)}</button>`).join('')}</div><textarea class="math-src" spellcheck="false" placeholder="LaTeX, e.g.  \\int_0^1 x^2\\,dx = \\tfrac13"></textarea><div class="math-live"></div><div class="muted" style="font-size:12px">Ctrl+Enter or Esc to finish · supports align, matrices, cases, \\ce{H2O} chemistry</div></div></div>`);
        const view = w.querySelector('.math-block'), ed = w.querySelector('.math-editor'), ta = w.querySelector('textarea'), live = w.querySelector('.math-live');
        renderMathInto(view, b.text); ta.value = b.text || '';
        const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(64, ta.scrollHeight) + 'px'; };
        const finish = () => { if (ed.hidden) return; ed.hidden = true; view.hidden = false; renderMathInto(view, b.text); };
        view.onclick = () => { view.hidden = true; ed.hidden = false; renderMathInto(live, b.text); grow(); ta.focus(); };
        ta.addEventListener('input', () => { b.text = ta.value; renderMathInto(live, b.text); this.changed(); grow(); });
        w.querySelector('.math-snips').addEventListener('mousedown', (e) => e.preventDefault());
        w.querySelector('.math-snips').addEventListener('click', (e) => {
          const bt = e.target.closest('button'); if (!bt) return; ta.focus();
          document.execCommand('insertText', false, MATH_SNIPPETS[+bt.dataset.i][1]);
        });
        w.addEventListener('focusout', (e) => { if (!w.contains(e.relatedTarget)) finish(); });
        ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); finish(); } });
        if (!b.text) setTimeout(() => { if (w.isConnected && !b.text) view.click(); }, 0);
        body.appendChild(w); break;
      }
      case 'image': this.renderImage(b, body); break;
      case 'table': this.renderTable(b, body); break;
      default:
        if (RICH_TYPES.includes(b.type)) {
          const api = { changed: (s) => this.changed(s), ctx: this.ctx, editor: this, remove: () => this.removeBlock(b), block: b };
          const fn = { chart: renderChart, draw: renderDraw, database: renderDatabase, portfolio: renderPortfolio, timer: renderTimer, flash: renderFlash, timeline: renderTimeline }[b.type];
          body.appendChild(fn(b, api));
        } else body.appendChild(this.txt(b, 'text', ''));
    }
    return el;
  }
  renderImage(b, body) {
    if (!b.src) {
      const ph = h(`<div class="card" style="padding:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${icon('image', 22)}<span class="muted">Add an image:</span><button class="btn sm primary" data-up>Upload</button><input class="inp" placeholder="…or paste an image URL and press Enter" style="flex:1;min-width:180px"></div>`);
      ph.querySelector('[data-up]').onclick = () => {
        const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*';
        f.onchange = async () => { if (f.files[0]) { b.src = await this.ctx.saveImage(f.files[0]); this.changed(true); this.refresh(b); } }; f.click();
      };
      ph.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { b.src = e.target.value.trim(); this.changed(true); this.refresh(b); } });
      body.appendChild(ph); return;
    }
    const w = h(`<div class="img-block ${b.align ? 'al-' + b.align : ''}"><div class="img-wrap"><img alt="" draggable="false"><span class="rz"></span><div class="img-tools"><button data-a="s" title="Small">S</button><button data-a="m" title="Medium">M</button><button data-a="f" title="Full width">Full</button><button data-a="l" title="Align left">${icon('back', 13)}</button><button data-a="c" title="Center">${icon('hr', 13)}</button><button data-a="r" title="Align right">${icon('forward', 13)}</button><button data-a="rep" title="Replace image">${icon('upload', 13)}</button><button data-a="zoom" title="View full size">${icon('focus', 13)}</button></div></div><div class="img-cap txt" contenteditable="true" data-nav="1" data-txt="alt" data-ph="Add a caption…"></div></div>`);
    const img = w.querySelector('img'); img.src = this.ctx.assetUrl(b.src);
    if (b.width) img.style.width = b.width + 'px';
    img.addEventListener('click', () => lightbox(img.src));
    w.querySelector('.img-tools').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return; const k = a.dataset.a;
      if (k === 's') b.width = 240; else if (k === 'm') b.width = 480; else if (k === 'f') b.width = null;
      else if (k === 'l' || k === 'c' || k === 'r') { b.align = k === 'c' ? '' : k; w.className = 'img-block ' + (b.align ? 'al-' + b.align : ''); }
      else if (k === 'zoom') return lightbox(img.src);
      else if (k === 'rep') { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.onchange = async () => { if (f.files[0]) { b.src = await this.ctx.saveImage(f.files[0]); this.changed(true); this.refresh(b); } }; f.click(); return; }
      img.style.width = b.width ? b.width + 'px' : ''; this.changed(true);
    });
    img.onerror = () => { img.alt = 'Image not found: ' + b.src; img.style.padding = '20px'; };
    const cap = w.querySelector('.img-cap'); cap.textContent = b.alt || '';
    const rz = w.querySelector('.rz');
    rz.onmousedown = (e) => {
      e.preventDefault(); const sx = e.clientX, sw = img.getBoundingClientRect().width;
      const mv = (ev) => { b.width = Math.max(80, Math.round(sw + ev.clientX - sx)); img.style.width = b.width + 'px'; };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); this.changed(true); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    };
    body.appendChild(w);
  }
  renderTable(b, body) {
    const w = h(`<div><div class="tbl-wrap"><table class="tbl"></table></div><div class="tbl-tools"><button class="btn sm ghost" data-a="ar">+ Row</button><button class="btn sm ghost" data-a="ac">+ Column</button><button class="btn sm ghost" data-a="dr">− Row</button><button class="btn sm ghost" data-a="dc">− Column</button></div></div>`);
    const t = w.querySelector('table');
    b.rows.forEach((r, ri) => {
      const tr = document.createElement('tr');
      r.forEach((c, ci) => {
        const td = document.createElement('td'); td.contentEditable = 'true'; td.dataset.nav = '1'; td.dataset.cell = ri + ',' + ci;
        td.innerHTML = mdToHtml(c, this.ctx);
        td.addEventListener('input', () => { b.rows[ri][ci] = htmlToMd(td).replace(/\n$/, ''); this.changed(); });
        td.addEventListener('keydown', (e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const cells = [...t.querySelectorAll('td')]; const i = cells.indexOf(td) + (e.shiftKey ? -1 : 1);
            if (i >= cells.length) { b.rows.push(b.rows[0].map(() => '')); this.changed(true); this.refresh(b); const nt = this.host.querySelector(`[data-id="${b.id}"] td[data-cell="${b.rows.length - 1},0"]`); nt && placeCaretStart(nt); }
            else if (cells[i]) placeCaretEnd(cells[i]);
          } else if (e.key === 'Enter') { e.preventDefault(); const nxt = t.querySelector(`td[data-cell="${ri + 1},${ci}"]`); if (nxt) placeCaretEnd(nxt); }
        });
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    w.querySelector('.tbl-tools').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      const k = a.dataset.a; const cols = b.rows[0].length;
      if (k === 'ar') b.rows.push(Array(cols).fill(''));
      if (k === 'ac') b.rows.forEach(r => r.push(''));
      if (k === 'dr' && b.rows.length > 1) b.rows.pop();
      if (k === 'dc' && cols > 1) b.rows.forEach(r => r.pop());
      this.changed(true); this.refresh(b);
    });
    body.appendChild(w);
  }
  refresh(b) {
    const old = this.host.querySelector(`:scope > .blk[data-id="${b.id}"]`);
    if (!old) return this.render();
    const nums = numberRuns(this.blocks);
    old.replaceWith(this.renderBlock(b, nums.get(b.id)));
  }

  // ---------- structure ops ----------
  idx(b) { return this.blocks.indexOf(b); }
  focusBlock(b, pos = 'end') {
    const el = this.host.querySelector(`:scope > .blk[data-id="${b.id}"]`);
    if (!el) return;
    const t = el.querySelector('[data-nav]');
    if (!t) { el.scrollIntoView({ block: 'nearest' }); return; }
    if (pos === 'start') placeCaretStart(t); else if (typeof pos === 'number') { t.focus(); setCaretOffset(t, pos); } else placeCaretEnd(t);
  }
  insertAfter(b, nb, focus = true) {
    const i = this.idx(b);
    const arr = Array.isArray(nb) ? nb : [nb];
    this.blocks.splice(i + 1, 0, ...arr);
    this.changed(true); this.render();
    if (focus) this.focusBlock(arr[0], 'start');
    return arr[0];
  }
  removeBlock(b, focusPrev = true) {
    const i = this.idx(b);
    if (i < 0) return;
    this.blocks.splice(i, 1);
    if (!this.blocks.length) this.blocks.push(mk('p'));
    this.changed(true); this.render();
    if (!focusPrev) return;
    // put the caret in the closest block that has text (a chart / image can't hold the caret) so typing and Ctrl+Z keep working
    const order = []; for (let k = i - 1; k >= 0; k--) order.push(k); for (let k = i; k < this.blocks.length; k++) order.push(k);
    const hit = order.find(k => this.host.querySelector(`:scope > .blk[data-id="${this.blocks[k].id}"] [data-nav]:not(textarea)`));
    this.focusBlock(this.blocks[hit === undefined ? Math.max(0, i - 1) : hit], 'end');
  }
  convert(b, type, extra = {}) {
    const keep = b.text;
    const kids = b.type === 'toggle' && type !== 'toggle' ? b.children : null;
    Object.keys(b).forEach(k => { if (!['id'].includes(k)) delete b[k]; });
    Object.assign(b, { type, text: keep || '' }, extra);
    if (['ul', 'ol', 'todo'].includes(type)) b.indent = extra.indent || 0;
    if (type === 'toggle') { b.children = [mk('p')]; b.open = true; }
    if (type === 'callout') { b.kind = b.kind || 'note'; b.title = ''; }
    if (type === 'todo') b.checked = false;
    this.changed(true); this.render();
    if (kids) this.blocks.splice(this.idx(b) + 1, 0, ...kids), this.render();
    this.focusBlock(b, 'end');
  }
  moveBlock(b, delta) {
    const i = this.idx(b), j = i + delta;
    if (j < 0 || j >= this.blocks.length) return;
    this.blocks.splice(i, 1); this.blocks.splice(j, 0, b);
    this.changed(true); this.render(); this.focusBlock(b, 'end');
  }
  duplicate(b) {
    const copy = JSON.parse(JSON.stringify(b));
    const fix = (x) => { x.id = uid(); (x.children || []).forEach(fix); }; fix(copy);
    this.insertAfter(b, copy, false);
    this.focusBlock(copy, 'end');
  }
  getMarkdown(blocks) { return serializeBlocks(blocks); }

  // ---------- event binding (root only) ----------
  bind() {
    const host = this.host;
    host.addEventListener('input', (e) => this.onInput(e));
    host.addEventListener('keydown', (e) => this.onKey(e));
    host.addEventListener('click', (e) => this.onClick(e));
    host.addEventListener('mousedown', (e) => this.onMouseDown(e));
    host.addEventListener('focusin', (e) => { const bk = e.target.closest && e.target.closest('.blk'); if (bk && bk._blk) this.toolBlkEl = bk; this.onState && this.onState(); });
    host.addEventListener('mouseup', () => host.querySelectorAll('.blk[draggable="true"]').forEach(x => { x.draggable = false; }));
    document.addEventListener('paste', this._pd = (e) => this.onDocPaste(e));
    host.addEventListener('paste', (e) => this.onPaste(e));
    host.addEventListener('focusin', (e) => {
      const blk = e.target.closest && e.target.closest('.blk');
      this.host.querySelectorAll('.blk.focused').forEach(x => x.classList.remove('focused'));
      if (blk) blk.classList.add('focused');
      if (!(this.selBlocks.length && this.selBlocks.includes(e.target))) this.clearSel();   // focusing a selected block itself must not drop the selection
    });
    host.addEventListener('dragstart', (e) => this.onDragStart(e));
    host.addEventListener('dragover', (e) => this.onDragOver(e));
    host.addEventListener('dragleave', (e) => { if (!host.contains(e.relatedTarget)) this.clearDrop(); });
    host.addEventListener('drop', (e) => this.onDrop(e));
    host.addEventListener('dragend', () => { this.clearDrop(); this.dragging = null; host.querySelectorAll('.blk[draggable="true"]').forEach(x => { x.draggable = false; }); });
    document.addEventListener('selectionchange', this._sc = () => this.onSelectionChange());
    // widgets (charts, drawings, databases, images…) have no text cursor: remember the block you last clicked so Ctrl+C / X / V work on it
    document.addEventListener('mousedown', this._md = (e) => { const b = e.target.closest && e.target.closest('.blk'); this.lastBlkEl = b && host.contains(b) ? b : null; if (b && host.contains(b)) this.toolBlkEl = b; if (!host.contains(e.target) && this.selBlocks.length) this.clearSel(); }, true);
    document.addEventListener('keydown', this._kd = (e) => this.onWidgetKey(e));
    host.addEventListener('contextmenu', (e) => {
      const lk = e.target.closest('a.ext, a.wikilink');
      if (lk && host.contains(lk)) { e.preventDefault(); this.linkMenu(lk, e); return; }          // right-click a link: open / edit / remove
      if (e.target.closest('[data-nav],input,textarea,select,[contenteditable="true"],.blk-handle')) return;   // text fields keep the normal Cut / Copy / Paste menu
      const blkEl = e.target.closest('.blk'); if (!blkEl) return;
      e.preventDefault(); this.lastBlkEl = blkEl; this.blockMenu(blkEl, null, e);
    });
  }
  destroy() { document.removeEventListener('selectionchange', this._sc); document.removeEventListener('mousedown', this._md, true); document.removeEventListener('keydown', this._kd); document.removeEventListener('paste', this._pd); this.hideFmt(); this.closeSlash(); }

  // ---------- block clipboard ----------
  copyBlocks(bs, label = 'Copied') {
    const md = serializeBlocks(bs); lastBlockClip = md.trim();
    const ok = () => toast(label + (bs.length > 1 ? ` ${bs.length} blocks` : ' block') + ' — Ctrl+V pastes it anywhere');
    const textOnly = () => navigator.clipboard.writeText(md).then(ok, () => toast('Could not reach the clipboard'));
    const pic = bs.length === 1 ? this.pictureOf(bs[0]) : null;
    if (!pic) return textOnly();
    window.api.copyImage(pic, md).then((done) => (done ? ok() : textOnly()), textOnly);
  }
  pictureOf(b) {
    if (b.type === 'image' && b.src && !/^(https?:|data:|file:)/i.test(b.src)) return { rel: b.src };
    if (b.type === 'chart' || b.type === 'draw') {
      const el = this.host.querySelector(`.blk[data-id="${b.id}"]`); const cv = el && el.querySelector('canvas'); if (!cv) return null;
      try { const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; const g = t.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, t.width, t.height); g.drawImage(cv, 0, 0); return { dataUrl: t.toDataURL('image/png') }; } catch (e) { return null; }
    }
    return null;
  }
  async pasteBlocksAfter(b, ed) {
    let text = '', pic = null;
    try {
      for (const it of await navigator.clipboard.read()) {
        if (!text && it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
        const t = it.types.find(x => x.startsWith('image/')); if (t && !pic) pic = await it.getType(t);
      }
    } catch (e) { try { text = await navigator.clipboard.readText(); } catch (e2) { /* */ } }
    if (pic && !(text.trim() && text.trim() === lastBlockClip)) {
      return this.pastePicture(new File([pic], 'pasted-' + Date.now() + '.' + (pic.type.split('/')[1] || 'png').replace('jpeg', 'jpg'), { type: pic.type }), b, ed);
    }
    const parsed = text && text.trim() ? parseBlocks(text) : [];
    if (!parsed.length) return toast('Nothing to paste — copy a block, some text or an image first');
    const empty = b.type === 'p' && !b.text;
    if (empty) { const i = ed.idx(b); ed.blocks.splice(i, 1, ...parsed); ed.changed(true); ed.render(); ed.focusBlock(parsed[parsed.length - 1], 'end'); }
    else ed.insertAfter(b, parsed, false);
  }
  async pastePicture(file, b, ed) {
    const rel = await this.ctx.saveImage(file);
    const nb = mk('image', { src: rel, alt: '' });
    if (b.type === 'p' && !b.text) { const i = ed.idx(b); ed.blocks.splice(i, 1, nb); ed.changed(true); ed.render(); } else ed.insertAfter(b, nb, false);
    toast('Image pasted — saved in assets/');
  }
  // Ctrl+V with nothing being edited (you just clicked a chart, an image, or empty space): paste a picture or copied blocks there
  onDocPaste(e) {
    this._pasteSeen = true;
    const t = e.target; if (!t || this.host.contains(t)) return;
    if (t.closest && t.closest('input,textarea,select,[contenteditable="true"],.modal,#findbar,#overlay')) return;
    const cd = e.clipboardData; if (!cd) return;
    const text = cd.getData('text/plain');
    const blkEl = this.lastBlkEl && this.lastBlkEl.isConnected ? this.lastBlkEl : null;
    const b = blkEl ? blkEl._blk : this.blocks[this.blocks.length - 1], ed = blkEl ? blkEl._ed : this;
    if (!b) return;
    const it = !text.trim() ? [...(cd.items || [])].find(i => i.type.startsWith('image/')) : null;
    if (it) { const f = it.getAsFile(); if (f) { e.preventDefault(); this.pastePicture(f, b, ed); } return; }
    if (text.trim() && text.trim() === lastBlockClip) { e.preventDefault(); const parsed = parseBlocks(text); if (parsed.length) ed.insertAfter(b, parsed, false); }
  }
  onWidgetKey(e) {
    if (e.defaultPrevented) return;                                                  // someone else (e.g. the sidebar) already used this key
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !this.host.contains(document.activeElement) && this.host.isConnected) {       // Ctrl+Z / Ctrl+Y when focus is on the page background, not in the text
      const k0 = e.key.toLowerCase(), a0 = document.activeElement;
      const typing0 = a0 && a0 !== document.body && a0.closest && a0.closest('input,textarea,select,[contenteditable="true"],#sidebar');
      if (!typing0 && (k0 === 'z' || k0 === 'y') && !document.querySelector('#overlay .modal, body > .menu')) { e.preventDefault(); return this.undo(k0 === 'y' || e.shiftKey); }
    }
    if (this.selBlocks.length && this.selBlocks[0].isConnected && !this.host.contains(document.activeElement)) {   // blocks are selected but the focus drifted: keep Backspace / Ctrl+C working
      const a = document.activeElement; const typing = a && a !== document.body && a.closest && a.closest('input,textarea,select,[contenteditable="true"],[data-nav],#sidebar');
      if (!typing && !document.querySelector('#overlay .modal, body > .menu') && (e.key === 'Backspace' || e.key === 'Delete' || (mod && !e.altKey && ['c', 'x', 'v', 'd'].includes(e.key.toLowerCase())))) return this.onSelKey(e);
    }
    if (!mod || e.shiftKey || e.altKey) return;
    const k = e.key.toLowerCase(); if (k !== 'c' && k !== 'x' && k !== 'v') return;
    const blkEl = this.lastBlkEl; if (!blkEl || !blkEl.isConnected || !blkEl._blk) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.closest && a.closest('input,textarea,select,[contenteditable="true"],[data-nav]')) return;   // real text editing: leave it alone
    if (this.selBlocks.length) return;                                                                                          // block-selection mode has its own keys
    if (document.querySelector('#overlay .modal, body > .menu')) return;
    if (!getSelection().isCollapsed && k !== 'v') return;                                                                       // some plain text is selected: normal copy
    const b = blkEl._blk, ed = blkEl._ed;
    if (k === 'v') { this._pasteSeen = false; setTimeout(() => { if (!this._pasteSeen) this.pasteBlocksAfter(b, ed); }, 220); return; }   // the normal paste event handles it; this is only a fallback
    e.preventDefault();
    if (k === 'c') this.copyBlocks([b]);
    else { this.copyBlocks([b], 'Cut'); ed.removeBlock(b); }
  }

  ctxOfBlock(b) { const el = this.root.host.querySelector(`.blk[data-id="${b.id}"]`); return el ? el._ed : this.root; }
  // the block the user is working in (caret, selected block or last clicked block) — for the toolbar
  currentCtx() {
    const root = this.root; const a = document.activeElement;
    if (a && root.host.contains(a)) { const c = this.ctxOf(a); if (c && c.b) return c; }
    if (root.selBlocks.length && root.selBlocks[0].isConnected) { const e = root.selBlocks[0]; return { el: null, blkEl: e, b: e._blk, ed: e._ed }; }
    const l = root.toolBlkEl; if (l && l.isConnected && l._blk) return { el: null, blkEl: l, b: l._blk, ed: l._ed };
    return null;
  }
  toolbarInsert(it) {
    const root = this.root; let c = this.currentCtx();
    if (!c) { let last = root.blocks[root.blocks.length - 1]; if (!last || last.type !== 'p' || last.text) { last = mk('p'); root.blocks.push(last); root.changed(true); root.render(); } const e = root.host.querySelector(`.blk[data-id="${last.id}"]`); c = { el: e && e.querySelector('[data-txt]'), b: last, ed: root }; }
    this.runCommand(it, c.b, c.ed, c.el && c.el.dataset.txt ? c.el : null);
  }
  toolbarStyle(type) {
    const c = this.currentCtx(); if (!c) return toast('Click in your text first');
    if (!TEXTY.includes(c.b.type)) return toast('Pick a block of text first');
    const t = c.b.type === type && type !== 'p' ? 'p' : type;
    if (c.b.type !== t) c.ed.convert(c.b, t);
  }
  ctxOf(target) {
    const t = target.closest && target.closest('[data-nav]');
    const blkEl = target.closest && target.closest('.blk');
    if (!blkEl) return null;
    return { el: t, blkEl, b: blkEl._blk, ed: blkEl._ed, field: t && t.dataset.txt };
  }

  onInput(e) {
    const c = this.ctxOf(e.target);
    if (!c || !c.el) return;
    const { el, b, ed, field } = c;
    if (el.dataset.cell || el.dataset.code) return;
    if (!field) return;
    let md = htmlToMd(el).replace(/\n$/, '');
    // markdown block shortcuts (only on plain paragraphs)
    if (b.type === 'p' && field === 'text') {
      const plain = el.textContent.replace(/​/g, '');
      let m;
      if ((m = plain.match(/^(#{1,3}) $/))) return ed.convertClean(b, 'h' + m[1].length);
      if (/^[-*+] $/.test(plain)) return ed.convertClean(b, 'ul');
      if (/^1[.)] $/.test(plain)) return ed.convertClean(b, 'ol');
      if (/^\[ ?\] $/.test(plain)) return ed.convertClean(b, 'todo');
      if (/^> $/.test(plain)) return ed.convertClean(b, 'quote');
      if (/^!> $/.test(plain)) return ed.convertClean(b, 'callout');
    }
    b[field] = md;
    this.inlineShortcuts(el, e);
    b[field] = htmlToMd(el).replace(/\n$/, '');
    this.updateEmpty();
    this.triggerMenus(el);
    ed.changed();
  }
  updateEmpty() {
    if (this.blocks.length === 1 && this.blocks[0].type === 'p') this.host.classList.toggle('empty-doc', !this.blocks[0].text);
    else this.host.classList.remove('empty-doc');
  }
  convertClean(b, type) {
    b.text = ''; this.convert(b, type);
  }

  inlineShortcuts(el, e) {
    if (!e || e.inputType !== 'insertText') return;
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const node = r.startContainer;
    if (node.nodeType !== 3 || node.parentElement.closest('code')) return;
    const before = node.data.slice(0, r.startOffset);
    // group 1 = optional prefix char (kept), group 2 = inner text
    // [[wikilink]] and $math$ typed live
    let wm = before.match(/\[\[([^\[\]\n]+)\]\]$/);
    if (wm && e.data === ']') {
      const [target, alias] = wm[1].split('|'); const name = target.split('#')[0].trim(); const head = target.includes('#') ? target.split('#')[1] : '';
      const rr = document.createRange(); rr.setStart(node, before.length - wm[0].length); rr.setEnd(node, r.startOffset);
      sel.removeAllRanges(); sel.addRange(rr);
      const page = this.ctx.resolve(name);
      document.execCommand('insertHTML', false, `<a class="wikilink${page ? '' : ' missing'}" data-target="${escHtml(page ? page.name : name)}" data-heading="${escHtml(head)}" contenteditable="false">${escHtml((alias || wm[1]).trim())}</a>&#8203;`);
      return;
    }
    wm = before.match(/(^|[^$\\])\$([^$\s][^$\n]*?)\$$/);
    if (wm && e.data === '$' && window.katex) {
      const rr = document.createRange(); rr.setStart(node, before.length - wm[2].length - 2); rr.setEnd(node, r.startOffset);
      sel.removeAllRanges(); sel.addRange(rr);
      document.execCommand('insertHTML', false, `<span class="imath" contenteditable="false" data-tex="${escHtml(wm[2])}">${escHtml(wm[2])}</span>&#8203;`);
      renderInlineMath(el);
      return;
    }
    const tg = before.match(/(^|\s)#([\wÀ-￿/-]+) $/);
    if (tg && e.data === ' ' && !/^\d+$/.test(tg[2])) {
      const rr = document.createRange(); rr.setStart(node, before.length - tg[2].length - 2); rr.setEnd(node, r.startOffset);
      sel.removeAllRanges(); sel.addRange(rr);
      document.execCommand('insertHTML', false, `<span class="tag" data-tag="${escHtml(tg[2])}">#${escHtml(tg[2])}</span>&nbsp;`);
      return;
    }
    const pats = [
      [/()\*\*([^*\s][^*]*?)\*\*$/, 'b'], [/()~~([^~\s][^~]*?)~~$/, 's'], [/()==([^=\s][^=]*?)==$/, 'mark'],
      [/(^|[^*\w])\*([^*\s][^*]*?)\*$/, 'i'], [/()`([^`]+)`$/, 'code']
    ];
    for (const [re, tag] of pats) {
      const m = before.match(re);
      if (!m) continue;
      const inner = m[2];
      const startOff = before.length - (m[0].length - m[1].length);
      const rr = document.createRange(); rr.setStart(node, startOff); rr.setEnd(node, r.startOffset);
      sel.removeAllRanges(); sel.addRange(rr);
      document.execCommand('insertHTML', false, `<${tag}>${escHtml(inner)}</${tag}>&#8203;`);
      return;
    }
  }

  // ---------- slash / wikilink menus ----------
  triggerMenus(el) {
    const ci = caretInfo(el);
    if (!ci || !ci.collapsed) { this.closeSlash(); return; }
    const t = ci.preText;
    let m = t.match(/\[\[([^\]\n]*)$/);
    if (m) { this.openPicker('link', el, m[1], m[0].length); return; }
    m = t.match(/(?:^|\s)\/([\w:.\-][\w:.\- ]{0,28}|)$/);
    if (m && !el.dataset.cell && el.closest('.blk')._blk.type !== 'code') { this.openPicker('slash', el, m[1], m[1].length + 1); return; }
    this.closeSlash();
  }
  closeSlash() { if (this.slash) { this.slash.menu.close(); this.slash = null; } }
  openPicker(kind, el, query, removeLen) {
    const q = query.toLowerCase();
    let items;
    if (kind === 'slash') {
      const score = (c) => {                       // best matches first: title prefix > word prefix > title > keyword prefix > keyword
        const t = c.title.toLowerCase();
        if (t.startsWith(q)) return 0; if (t.split(/[\s:]+/).some(w => w.startsWith(q))) return 1; if (t.includes(q)) return 2;
        if (c.kw.split(' ').some(w => w.startsWith(q))) return 3; if (c.kw.includes(q)) return 4; return 9;
      };
      items = q ? COMMANDS.filter(c => score(c) < 9).sort((a, b) => score(a) - score(b)).slice(0, 20) : COMMANDS.slice(0, 20);
    } else {
      const names = this.ctx.fuzzyPages(query, 8).map(p => ({ title: p.name, desc: p.dir || 'Page', page: p }));
      items = names;
      if (query.trim() && !this.ctx.exists(query.trim())) items.push({ title: 'Create “' + query.trim() + '”', desc: 'New page', create: query.trim() });
    }
    if (!items.length) { this.closeSlash(); return; }
    const sel = getSelection(); const rr = sel.getRangeAt(0).cloneRange(); rr.collapse(true);
    let rect = rr.getClientRects()[0] || el.getBoundingClientRect();
    const mk2 = items.map((it) => ({
      html: kind === 'slash' ? `<span style="display:flex;gap:9px;align-items:center"><span class="ic-badge">${icon(it.icon, 17)}</span><span><span class="ttl">${escHtml(it.title)}</span><span class="desc">${escHtml(it.desc)}</span></span></span>` : `<span><span class="ttl">${it.page && it.page.props.icon ? escHtml(it.page.props.icon) + ' ' : ''}${escHtml(it.title)}</span><span class="desc">${escHtml(it.desc)}</span></span>`,
      action: () => { }, _it: it
    }));
    const prevIdx = this.slash && this.slash.kind === kind ? Math.min(this.slash.idx, items.length - 1) : 0;
    this.closeSlash();
    const menu = openMenu(rect.left, rect.bottom + 6, mk2, { cls: 'slash-menu' });
    this.slash = { kind, el, items, idx: prevIdx, menu, removeLen, blk: el.closest('.blk') };
    // intercept clicks
    menu.el.querySelectorAll('.mi').forEach((b, i) => { b.onclick = (ev) => { ev.stopPropagation(); this.slash.idx = i; this.applyPicker(); }; b.onmousedown = (ev) => ev.preventDefault(); });
    menu.el.addEventListener('mousedown', (ev) => ev.preventDefault());
    this.paintSlash();
  }
  paintSlash() {
    const s = this.slash; if (!s) return;
    [...s.menu.el.querySelectorAll('.mi')].forEach((b, i) => { b.classList.toggle('sel', i === s.idx); if (i === s.idx) b.scrollIntoView({ block: 'nearest' }); });
  }
  async applyPicker() {
    const s = this.slash; if (!s) return;
    const it = s.items[s.idx]; const kind = s.kind; const el = s.el; const { b, ed } = this.ctxOf(el);
    this.closeSlash();
    // remove typed trigger text before caret
    const sel = getSelection(); const r = sel.getRangeAt(0);
    const rr = document.createRange(); rr.setStart(r.startContainer, Math.max(0, r.startOffset - s.removeLen)); rr.setEnd(r.startContainer, r.startOffset);
    if (kind === 'link') {
      let name = it.page ? it.page.name : it.create;
      if (it.create) { await this.ctx.createPageByName(name); }
      sel.removeAllRanges(); sel.addRange(rr);
      document.execCommand('insertHTML', false, `<a class="wikilink" data-target="${escHtml(name)}" data-heading="" contenteditable="false">${escHtml(name)}</a>&#8203;`);
      const f = this.ctxOf(el); b[f.field] = htmlToMd(el).replace(/\n$/, ''); ed.changed(true);
      return;
    }
    sel.removeAllRanges(); sel.addRange(rr); rr.deleteContents();
    const field = el.dataset.txt; b[field] = htmlToMd(el).replace(/\n$/, '');
    return this.runCommand(it, b, ed, el);
  }
  // Insert / convert using a command from COMMANDS (used by the slash menu and the toolbar)
  runCommand(it, b, ed, el) {
    if (!el && (it.special === 'link' || it.special === 'date')) { const np = mk('p'); ed.insertAfter(b, np, true); b = np; ed = this.ctxOfBlock(np); el = ed.host.querySelector(`.blk[data-id="${np.id}"] [data-txt]`); el && el.focus(); if (!el) return; }
    const empty = !b.text && !b.title, field = el && el.dataset.txt;
    if (it.special === 'link') { document.execCommand('insertText', false, '[['); b[field] = htmlToMd(el); this.triggerMenus(el); return; }
    if (it.special === 'date') { const d = this.ctx.todayKey(); document.execCommand('insertText', false, `[[${d}]]`); b[field] = htmlToMd(el).replace(/\n$/, ''); el.innerHTML = mdToHtml(b[field], this.ctx); placeCaretEnd(el); ed.changed(true); return; }
    if (it.special === 'template') { this.ctx.pickTemplate((blocks) => { if (blocks) { if (empty) { const i = ed.idx(b); ed.blocks.splice(i, 1, ...blocks); ed.changed(true); ed.render(); } else ed.insertAfter(b, blocks); } }); return; }
    if (it.type && TEXTY.includes(b.type) && empty) { ed.convert(b, it.type); return; }
    if (it.special === 'widget') { pickWidget((kind) => { const inst = newInstance(kind); delete inst.save; const wb = mk('widget', { data: inst }); if (empty && TEXTY.includes(b.type)) { ed.blocks.splice(ed.idx(b), 1, wb); ed.changed(true); ed.render(); } else ed.insertAfter(b, wb, false); const lastB = ed.blocks[ed.blocks.length - 1]; if (lastB.type !== 'p') { ed.blocks.push(mk('p')); ed.render(); } }); return; }
    const made = it.make ? it.make() : null;
    const nb = it.type ? mk(it.type, it.type === 'toggle' ? { children: [mk('p')], open: true } : (['ul', 'ol', 'todo'].includes(it.type) ? { indent: 0 } : {})) : Object.assign(mk(made.type), made);
    if (nb.type === 'callout' && !nb.kind) nb.kind = 'note';
    if (empty && TEXTY.includes(b.type)) ed.blocks.splice(ed.idx(b), 1, nb); else ed.blocks.splice(ed.idx(b) + 1, 0, nb);
    const last = ed.blocks[ed.blocks.length - 1];
    if (last === nb || (last.type !== 'p')) ed.blocks.push(mk('p'));   // always keep a paragraph after non-text blocks
    ed.changed(true);                                                  // one undo step for the whole insert
    ed.render();
    const target = ed.blocks[ed.idx(nb)] || nb;
    if (nb.type === 'image') { const el2 = ed.host.querySelector(`[data-id="${nb.id}"] [data-up]`); el2 && el2.click(); }
    else ed.focusBlock(target, 'end');
  }

  // ---------- keyboard ----------
  onKey(e) {
    const root = this;
    if (e.isComposing || e.keyCode === 229) return;      // Korean / Japanese / Chinese IME composition in progress
    if (this.slash) {
      const s = this.slash;
      if (e.key === 'ArrowDown') { e.preventDefault(); s.idx = (s.idx + 1) % s.items.length; return this.paintSlash(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); s.idx = (s.idx - 1 + s.items.length) % s.items.length; return this.paintSlash(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return this.applyPicker(); }
      if (e.key === 'Escape') { e.preventDefault(); return this.closeSlash(); }
    }
    const mod = e.ctrlKey || e.metaKey;
    const inTA = e.target.tagName === 'TEXTAREA';            // code / math textareas keep their native undo
    if (!inTA && mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); return root.undo(false); }
    if (!inTA && mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); return root.undo(true); }
    // block selection mode
    if (this.selBlocks.length && !e.target.closest('[data-nav]')) return this.onSelKey(e);
    const c = this.ctxOf(e.target);
    if (!c || !c.el) return;
    const { el, b, ed } = c;
    if (el.dataset.code && !(mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) return this.onCodeKey(e, c);
    if (e.key === 'Escape') { e.preventDefault(); document.activeElement.blur(); this.selectBlock(c.blkEl); return; }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); return ed.moveBlock(b, e.key === 'ArrowUp' ? -1 : 1); }
    if (mod && e.key.toLowerCase() === 'd' && !e.shiftKey) { e.preventDefault(); return ed.duplicate(b); }
    if (mod && e.key === 'Enter' && b.type === 'todo') { e.preventDefault(); b.checked = !b.checked; ed.changed(true); ed.refresh(b); return ed.focusBlock(b, 'end'); }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); return this.linkFromSelection(); }
    if (mod && e.key.toLowerCase() === 'h' && e.shiftKey) { e.preventDefault(); return this.wrapSelection('mark'); }
    if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); return this.wrapSelection('code'); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); document.execCommand('strikeThrough'); return; }
    if (el.dataset.cell) return;               // table cells have own handler
    if (el.dataset.code) return this.onCodeKey(e, c);
    if (el.classList.contains('img-cap')) { if (e.key === 'Enter') { e.preventDefault(); b.alt = el.textContent; ed.insertAfter(b, mk('p')); } else b.alt = el.textContent; return; }
    if (!c.field) return;
    const ci = caretInfo(el);
    if (!ci) return;

    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      e.preventDefault();
      // callout title -> jump to body
      if (b.type === 'callout' && c.field === 'title') { const body = c.blkEl.querySelector('[data-txt=text]'); return body && placeCaretStart(body); }
      // markdown block shortcuts on Enter
      if (b.type === 'p' && /^---+$/.test(ci.before + ci.after)) { b.text = ''; ed.convert(b, 'hr'); ed.insertAfter(b, mk('p')); return; }
      const fence = b.type === 'p' && (ci.before + ci.after).match(/^```([\w+#-]*)$/);
      if (fence) { b.text = ''; Object.assign(b, { type: 'code', lang: fence[1] === 'js' ? 'js' : fence[1], text: '' }); ed.changed(true); ed.render(); return ed.focusBlock(b, 'end'); }
      if (['ul', 'ol', 'todo', 'quote'].includes(b.type) && !ci.before && !ci.after) {
        if ((b.indent || 0) > 0) { b.indent--; ed.changed(true); ed.render(); return ed.focusBlock(b, 'end'); }
        return ed.convert(b, 'p');
      }
      const before = ci.before, after = ci.after;
      b[c.field] = before;
      let nb;
      if (['ul', 'ol', 'todo'].includes(b.type)) nb = mk(b.type, { text: after, indent: b.indent || 0, checked: false });
      else if (b.type === 'toggle') {
        nb = mk('p', { text: after });
        if (b.open) { b.children.unshift(nb); ed.changed(true); ed.render(); const kid = ed.host.querySelector(`[data-id="${nb.id}"]`); return kid && placeCaretStart(kid.querySelector('[data-nav]')); }
      } else if (b.type === 'quote') nb = mk('quote', { text: after });
      else if (b.type === 'callout') nb = mk('p', { text: after });
      else nb = mk('p', { text: after });
      ed.insertAfter(b, nb, false); ed.focusBlock(nb, 'start');
      return;
    }
    if (e.key === 'Backspace' && ci.atStart) {
      if (b.type === 'callout' && c.field === 'text' && (b.title || b.text)) { if (!b.text) { e.preventDefault(); const t = c.blkEl.querySelector('[data-txt=title]'); return placeCaretEnd(t); } return; }
      e.preventDefault();
      if (['ul', 'ol', 'todo'].includes(b.type) && (b.indent || 0) > 0) { b.indent--; ed.changed(true); ed.render(); return ed.focusBlock(b, 'start'); }
      if (b.type !== 'p') { return ed.convert(b, 'p'); }
      const i = ed.idx(b);
      if (i === 0) {
        if (ed.parent && !b.text && ed.blocks.length === 1) return;
        return;
      }
      const prev = ed.blocks[i - 1];
      if (TEXTY.includes(prev.type) && prev.type !== 'toggle' && prev.type !== 'callout') {
        const plen = (() => { const d = document.createElement('div'); d.innerHTML = mdToHtml(prev.text, this.ctx); return d.textContent.length; })();
        prev.text += b.text; ed.blocks.splice(i, 1); ed.changed(true); ed.render(); return ed.focusBlock(prev, plen);
      }
      if (!b.text) { ed.blocks.splice(i, 1); ed.changed(true); ed.render(); return ed.focusBlock(prev, 'end'); }
      // previous is hr/image/rich: select it
      return ed.selectBlock(ed.host.querySelector(`:scope > .blk[data-id="${prev.id}"]`));
    }
    if (e.key === 'Delete' && ci.atEnd) {
      const i = ed.idx(b), next = ed.blocks[i + 1];
      if (next && ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'todo', 'quote'].includes(next.type) && c.field === 'text') {
        e.preventDefault(); const plen = el.textContent.length; b.text += next.text; ed.blocks.splice(i + 1, 1); ed.changed(true); ed.render(); ed.focusBlock(b, plen);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (['ul', 'ol', 'todo'].includes(b.type)) {
        const i = ed.idx(b), prev = ed.blocks[i - 1];
        if (e.shiftKey) { if ((b.indent || 0) > 0) b.indent--; }
        else if (prev && ['ul', 'ol', 'todo'].includes(prev.type) && (b.indent || 0) <= (prev.indent || 0) && (b.indent || 0) < 5) b.indent = (b.indent || 0) + 1;
        const off = ci.preText.length;
        ed.changed(true); ed.render(); ed.focusBlock(b, off);
      } else if (!e.shiftKey && b.type === 'p') { document.execCommand('insertText', false, '    '); }
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && !e.shiftKey && !mod && ci.collapsed && (e.key === 'ArrowLeft' ? ci.atStart : lineEdge(el, true))) {
      if (this.navigate(el, -1, e.key === 'ArrowUp')) e.preventDefault();
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && !e.shiftKey && !mod && ci.collapsed && (e.key === 'ArrowRight' ? ci.atEnd : lineEdge(el, false))) {
      if (this.navigate(el, 1, e.key === 'ArrowDown')) e.preventDefault();
      return;
    }
  }
  navigate(el, dir, keepX) {
    const all = [...this.host.querySelectorAll('[data-nav]')].filter(x => !x.closest('[hidden]'));
    const i = all.indexOf(el);
    const t = all[i + dir];
    if (!t) return false;
    if (dir < 0) placeCaretEnd(t); else placeCaretStart(t);
    return true;
  }
  // keyboard handling inside a code block <textarea>
  onCodeKey(e, c) {
    const { el: ta, b, ed } = c;
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
    const ins = (t) => document.execCommand('insertText', false, t);
    const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    if (e.key === 'Escape') { e.preventDefault(); ta.blur(); this.selectBlock(c.blkEl); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (s !== en && v.slice(s, en).includes('\n') || e.shiftKey) {            // indent / outdent selected lines
        const ls = v.lastIndexOf('\n', s - 1) + 1; const block = v.slice(ls, en);
        const out = e.shiftKey ? block.replace(/^( {1,2}|\t)/gm, '') : block.replace(/^/gm, '  ');
        ta.setSelectionRange(ls, en); ins(out); ta.setSelectionRange(ls, ls + out.length);
      } else ins('  ');
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const i = ed.idx(b); const nx = ed.blocks[i + 1]; if (nx && nx.type === 'p' && !nx.text) return ed.focusBlock(nx, 'start'); return ed.insertAfter(b, mk('p')); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const ls = v.lastIndexOf('\n', s - 1) + 1; const line = v.slice(ls, s); const indent = line.match(/^\s*/)[0];
      const more = /[{(\[:]\s*$/.test(line) ? '  ' : '';
      const nextCh = v[s], closes = (line.trimEnd().slice(-1) === '{' && nextCh === '}') || (line.trimEnd().slice(-1) === '(' && nextCh === ')') || (line.trimEnd().slice(-1) === '[' && nextCh === ']');
      ins('\n' + indent + more + (closes ? '\n' + indent : ''));
      if (closes) ta.setSelectionRange(ta.selectionStart - indent.length - 1, ta.selectionStart - indent.length - 1);
      return;
    }
    if (PAIRS[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const close = PAIRS[e.key];
      if (s !== en) { e.preventDefault(); ins(e.key + v.slice(s, en) + close); return; }
      if (v[s] === e.key && (close === e.key || e.key === ')' )) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
      const prev = v[s - 1] || ''; const quote = close === e.key;
      if (quote && /[\w]/.test(prev)) return;                   // apostrophes inside words
      e.preventDefault(); ins(e.key + close); ta.setSelectionRange(s + 1, s + 1); return;
    }
    if (')]}'.includes(e.key) && v[s] === e.key && s === en) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
    if (e.key === 'Backspace' && s === en) {
      if (!b.text) { e.preventDefault(); return ed.convert(b, 'p'); }
      const pr = v[s - 1], nx2 = v[s]; if (pr && PAIRS[pr] === nx2) { e.preventDefault(); ta.setSelectionRange(s - 1, s + 1); ins(''); return; }
    }
    if (e.key === 'ArrowUp' && s === en && v.lastIndexOf('\n', s - 1) === -1) { if (this.navigate(ta, -1)) e.preventDefault(); return; }
    if (e.key === 'ArrowDown' && s === en && v.indexOf('\n', s) === -1) { e.preventDefault(); if (!this.navigate(ta, 1)) ed.insertAfter(b, mk('p')); return; }
  }

  // ---------- block selection (Esc) ----------
  selectBlock(blkEl) { this.clearSel(); if (!blkEl) return; blkEl.classList.add('sel'); this.selBlocks = [blkEl]; this.host.focus && 0; blkEl.tabIndex = -1; blkEl.focus({ preventScroll: true }); }
  clearSel() { this.selBlocks.forEach(x => x.classList.remove('sel')); this.selBlocks = []; }
  onSelKey(e) {
    const cur = this.selBlocks[this.selBlocks.length - 1]; const ed = cur._ed; const b = cur._blk;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault(); const gone = this.selBlocks.map(x => [x._ed, x._blk]); this.clearSel();
      return gone.forEach(([ged, gb], i) => ged.removeBlock(gb, i === gone.length - 1));
    }
    if (e.key === 'Enter') { e.preventDefault(); this.clearSel(); return ed.focusBlock(b, 'end'); }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this.clearSel(); return ed.duplicate(b); }
    if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
      e.preventDefault(); const bs = this.selBlocks.map(x => x._blk); const cut = e.key.toLowerCase() === 'x';
      this.copyBlocks(bs, cut ? 'Cut' : 'Copied');
      if (cut) { this.clearSel(); bs.forEach(x => ed.removeBlock(x)); } return;
    }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); this.clearSel(); return this.pasteBlocksAfter(b, ed); }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault(); const all = [...this.host.querySelectorAll(':scope > .blk')];
      this.clearSel(); all.forEach(x => { x.classList.add('sel'); x.tabIndex = -1; }); this.selBlocks = all; if (all.length) all[all.length - 1].focus({ preventScroll: true }); return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const all = [...this.host.querySelectorAll('.blk')];
      const i = all.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : -1);
      if (all[i]) { if (e.shiftKey) { all[i].classList.add('sel'); this.selBlocks.push(all[i]); all[i].tabIndex = -1; all[i].focus({ preventScroll: true }); } else this.selectBlock(all[i]); all[i].scrollIntoView({ block: 'nearest' }); }
    }
  }

  // ---------- mouse ----------
  onMouseDown(e) {
    if (e.button !== 0) return;
    const grip = e.target.closest('.blk-handle .drag');
    if (grip) { e.preventDefault(); this.armDrag(e, grip.closest('.blk')); return; }       // drag by the grip (click without moving = menu)
    if (e.target.closest('.blk-handle')) return;
    const blkEl = e.target.closest('.blk');
    if (!blkEl || !blkEl._blk || NO_CLICK_SELECT.includes(blkEl._blk.type) || e.target.closest(INTERACTIVE_SEL)) return;
    if (blkEl._blk.type === 'draw' && e.target.closest('canvas, .draw-canvas-wrap')) return;      // drawing, not grabbing
    this.selectBlock(blkEl); this.armDrag(e, blkEl);                                          // click selects, press-and-move drags
  }
  // Mouse-based drag & drop of whole blocks (works with charts, code, tables… and between columns / toggles)
  armDrag(e, blkEl) {
    if (!blkEl || !blkEl._blk) return;
    const sx = e.clientX, sy = e.clientY, view = document.getElementById('view');
    let started = false, ghost = null, target = null, before = true;
    const label = () => { const b = blkEl._blk; const t = (b.text || (b.data && b.data.title) || '').toString().replace(/\s+/g, ' ').slice(0, 40); return (b.type === 'p' ? 'Text' : b.type) + (t ? ' · ' + t : ''); };
    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        started = true; blkEl.classList.add('drag-src'); document.body.classList.add('blk-dragging');
        ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.textContent = label(); document.body.appendChild(ghost);
        try { getSelection().removeAllRanges(); } catch (err) { /* */ }
      }
      ghost.style.left = ev.clientX + 14 + 'px'; ghost.style.top = ev.clientY + 10 + 'px';
      const vr = view.getBoundingClientRect();
      if (ev.clientY < vr.top + 50) view.scrollTop -= 16; else if (ev.clientY > vr.bottom - 50) view.scrollTop += 16;
      this.clearDrop(); target = null;
      const under = document.elementFromPoint(ev.clientX, ev.clientY); const tb = under && under.closest && under.closest('.blk');
      if (tb && tb !== blkEl && !blkEl.contains(tb) && this.host.contains(tb)) {
        const r = tb.getBoundingClientRect(); before = ev.clientY < r.top + r.height / 2;
        tb.classList.add(before ? 'drop-before' : 'drop-after'); target = tb;
      }
    };
    const finish = (drop) => {
      document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); document.removeEventListener('keydown', esc, true);
      if (!started) return;
      ghost && ghost.remove(); blkEl.classList.remove('drag-src'); document.body.classList.remove('blk-dragging'); this.clearDrop();
      this._swallowClick = true; setTimeout(() => { this._swallowClick = false; }, 80);
      if (drop && target) this.dropBlock(blkEl, target, before);
    };
    const up = () => finish(true);
    const esc = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); finish(false); } };
    document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', up, true); document.addEventListener('keydown', esc, true);
  }
  dropBlock(srcEl, tb, before) {
    const { _blk: b, _ed: sed } = srcEl; const { _blk: tblk, _ed: ted } = tb;
    if (tblk === b || tb.closest('.blk[data-id="' + b.id + '"]')) return;        // never into itself
    sed.blocks.splice(sed.idx(b), 1); if (!sed.blocks.length) sed.blocks.push(mk('p'));
    let ti = ted.idx(tblk); if (!before) ti++;
    ted.blocks.splice(ti, 0, b);
    sed.changed(true); if (sed !== ted) sed.render(); ted.render(); this.root.render();
  }
  onClick(e) {
    if (this._swallowClick) { this._swallowClick = false; e.preventDefault(); return; }
    const t = e.target;
    const wl = t.closest('.wikilink');
    if (wl) { e.preventDefault(); this.ctx.openLink(wl.dataset.target, wl.dataset.heading, e.ctrlKey || e.metaKey); return; }
    const tg = t.closest('.tag');
    if (tg) { this.ctx.openTag(tg.dataset.tag); return; }
    const ex = t.closest('a.ext');
    if (ex) { e.preventDefault(); openTarget(ex.dataset.href, { relink: (u) => { ex.dataset.href = u; const f = ex.closest('[data-txt], td'); f && f.dispatchEvent(new Event('input', { bubbles: true })); } }); return; }
    const add = t.closest('.blk-handle .add');
    if (add) {
      const blkEl = add.closest('.blk'); const { _blk: b, _ed: ed } = blkEl;
      const nb = mk('p'); ed.insertAfter(b, nb, true);
      setTimeout(() => { const el = ed.host.querySelector(`[data-id="${nb.id}"] [data-txt]`); if (el) { el.focus(); document.execCommand('insertText', false, '/'); } }, 0);
      return;
    }
    const drag = t.closest('.blk-handle .drag');
    if (drag) { this.blockMenu(drag.closest('.blk'), drag); return; }
    const chk = t.closest('.chk');
    if (chk) { const blkEl = chk.closest('.blk'); const b = blkEl._blk; b.checked = !b.checked; blkEl._ed.changed(true); chk.classList.toggle('on', b.checked); chk.parentElement.classList.toggle('todo-done', b.checked); if (b.checked) burst(chk); return; }
    const car = t.closest('.tg-caret');
    if (car) { const blkEl = car.closest('.blk'); const b = blkEl._blk; b.open = !b.open; car.classList.toggle('open', b.open); blkEl.querySelector('.tg-kids').hidden = !b.open; blkEl._ed.changed(true); return; }
    const cico = t.closest('.cico');
    if (cico) {
      const blkEl = cico.closest('.blk'); const b = blkEl._blk; const r = cico.getBoundingClientRect();
      openMenu(r.left, r.bottom + 4, Object.keys(CALLOUT_ICONS).map(k => ({ html: `${CALLOUT_ICONS[k]} ${k}`, action: () => { b.kind = k; blkEl._ed.changed(true); blkEl._ed.refresh(b); } })));
      return;
    }
    // click below the last block: focus/create trailing paragraph
    if (t === this.host) {
      const last = this.blocks[this.blocks.length - 1];
      if (last.type !== 'p' || last.text) { const nb = mk('p'); this.blocks.push(nb); this.changed(true); this.render(); this.focusBlock(nb, 'start'); }
      else this.focusBlock(last, 'end');
    }
  }
  blockMenu(blkEl, anchor, ev) {
    const b = blkEl._blk, ed = blkEl._ed; const r = anchor ? anchor.getBoundingClientRect() : { left: ev.clientX, bottom: ev.clientY - 4 };
    const turn = (type, label, ic) => ({ label, icon: ic, action: () => ed.convert(b, type) });
    const items = [];
    if (TEXTY.includes(b.type)) {
      items.push({ header: 'Turn into' }, turn('p', 'Text', 'text'), turn('h1', 'Heading 1', 'heading'), turn('h2', 'Heading 2', 'heading'), turn('h3', 'Heading 3', 'heading'), turn('ul', 'Bulleted list', 'list'), turn('ol', 'Numbered list', 'olist'), turn('todo', 'To-do', 'todo'), turn('toggle', 'Toggle', 'toggle'), turn('quote', 'Quote', 'quote'), turn('callout', 'Callout', 'callout'), { sep: true });
    }
    items.push(
      { label: 'Copy', icon: 'copy', key: 'Ctrl+C', action: () => this.copyBlocks([b]) },
      { label: 'Cut', icon: 'erase', key: 'Ctrl+X', action: () => { this.copyBlocks([b], 'Cut'); ed.removeBlock(b); } },
      { label: 'Paste below', icon: 'download', key: 'Ctrl+V', action: () => this.pasteBlocksAfter(b, ed) },
      { label: 'Duplicate', icon: 'copy', key: 'Ctrl+D', action: () => ed.duplicate(b) },
      { label: 'Move up', icon: 'arrowup', key: 'Ctrl+Shift+↑', action: () => ed.moveBlock(b, -1) },
      { label: 'Move down', icon: 'arrowdown', key: 'Ctrl+Shift+↓', action: () => ed.moveBlock(b, 1) },
      { sep: true }, { label: 'Delete', icon: 'trash', danger: true, action: () => ed.removeBlock(b) });
    openMenu(r.left, r.bottom + 4, items);
  }

  // ---------- formatting toolbar ----------
  onSelectionChange() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { this.hideFmt(); return; }
    const r = sel.getRangeAt(0);
    const n = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentElement : r.commonAncestorContainer;
    if (!n || !this.host.contains(n) || !n.closest('.txt, td') || n.closest('.rt')) { this.hideFmt(); return; }
    this.showFmt(r.getBoundingClientRect());
  }
  showFmt(rect) {
    if (!this.fmt) {
      this.fmt = h(`<div class="fmt-bar">
        <button data-c="bold" title="Bold (Ctrl+B)"><b>B</b></button><button data-c="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button data-c="strike" title="Strikethrough"><s>S</s></button><button data-c="underline" title="Underline (Ctrl+U)"><u>U</u></button>
        <button data-c="code" title="Inline code (Ctrl+E)">&lt;/&gt;</button><button data-c="mark" title="Highlight (Ctrl+Shift+H)">🖍</button>
        <span class="sep"></span><button data-c="link" title="Link to a page">[[ ]]</button><button data-c="url" title="Link to a website, file or page (Ctrl+L)">${icon('link', 15)}</button><button data-c="clear" title="Clear formatting">Tx</button></div>`);
      this.fmt.addEventListener('mousedown', (e) => e.preventDefault());
      this.fmt.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.fmtCmd(b.dataset.c); });
      document.body.appendChild(this.fmt);
    }
    this.fmt.hidden = false;
    const w = this.fmt.offsetWidth || 280;
    this.fmt.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px';
    this.fmt.style.top = Math.max(8, rect.top - 46) + 'px';
  }
  hideFmt() { if (this.fmt) this.fmt.hidden = true; }
  wrapSelection(tag) {
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const anc = (r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentElement : r.commonAncestorContainer).closest(tag);
    if (anc) { const t = document.createTextNode(anc.textContent); anc.replaceWith(t); const rr = document.createRange(); rr.selectNodeContents(t); sel.removeAllRanges(); sel.addRange(rr); this.fireInput(); return; }
    document.execCommand('insertHTML', false, `<${tag}>${escHtml(sel.toString())}</${tag}>`);
  }
  fireInput() { const n = getSelection().anchorNode; const el = n && (n.nodeType === 3 ? n.parentElement : n).closest('[data-txt], td'); if (el) el.dispatchEvent(new Event('input', { bubbles: true })); }
  fmtCmd(c) {
    if (c === 'bold' || c === 'italic' || c === 'underline') document.execCommand(c);
    else if (c === 'strike') document.execCommand('strikeThrough');
    else if (c === 'code' || c === 'mark') this.wrapSelection(c);
    else if (c === 'clear') { document.execCommand('removeFormat'); }
    else if (c === 'link') {
      const sel = getSelection(); const txt = sel.toString().trim(); if (!txt) return;
      const page = this.ctx.resolve(txt);
      document.execCommand('insertHTML', false, `<a class="wikilink${page ? '' : ' missing'}" data-target="${escHtml(page ? page.name : txt)}" data-heading="" contenteditable="false">${escHtml(txt)}</a>&#8203;`);
    } else if (c === 'url') { this.linkFromSelection(); return; }
  }
  // add a link (website / file / page / app screen) at the caret or around the selected text
  async linkFromSelection() {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const el = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
    if (!el || !el.closest || !this.host.contains(el) || !el.closest('.txt, td')) return toast('Click inside some text first, then press Ctrl+L');
    const edit = el.closest('[contenteditable="true"]');
    const saved = sel.getRangeAt(0).cloneRange(); const txt = sel.toString();
    const r = await linkDialog({ title: 'Add a link', text: txt, target: '' });
    if (!r || r.remove) return;
    edit && edit.focus();
    const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(saved);
    document.execCommand('insertHTML', false, linkHTML(r.text, r.target));
    this.fireInput();
  }
  linkMenu(a, ev) {
    const wiki = a.classList.contains('wikilink');
    const target = () => (wiki ? '[[' + a.dataset.target + ']]' : (a.dataset.href || a.getAttribute('href') || ''));
    const field = a.closest('[data-txt], td');
    const touch = () => field && field.dispatchEvent(new Event('input', { bubbles: true }));
    openMenu(ev.clientX, ev.clientY, [
      { label: 'Open link', icon: 'link', action: () => openTarget(target(), { relink: (u) => { a.dataset.href = u; touch(); } }) },
      { label: 'Edit link…', icon: 'pen', action: async () => {
        const r = await linkDialog({ title: 'Edit link', text: a.textContent, target: target(), canRemove: true });
        if (!r) return;
        if (r.remove) a.replaceWith(document.createTextNode(a.textContent));
        else { const t = document.createElement('template'); t.innerHTML = linkHTML(r.text, r.target).trim(); a.replaceWith(t.content.firstElementChild); }
        touch();
      } },
      { label: 'Copy address', icon: 'copy', action: () => { navigator.clipboard.writeText(target()).then(() => toast('Address copied'), () => {}); } },
      { sep: true },
      { label: 'Remove link (keep the text)', icon: 'erase', action: () => { a.replaceWith(document.createTextNode(a.textContent)); touch(); } }
    ]);
  }


  // ---------- paste / drop ----------
  async onPaste(e) {
    this._pasteSeen = true;
    const cd0 = e.clipboardData; const txt0 = cd0.getData('text/plain');
    const picItem = !txt0.trim() ? [...(cd0.items || [])].find(i => i.type.startsWith('image/')) : null;
    const picFile = picItem ? picItem.getAsFile() : null;                       // must be taken before any await
    if (this.selBlocks.length && !(e.target.closest && e.target.closest('[data-nav]'))) {       // blocks are selected: paste right after them
      e.preventDefault();
      if (picFile) { const last = this.selBlocks[this.selBlocks.length - 1]; const { _blk: sb0, _ed: sed0 } = last; this.clearSel(); return this.pastePicture(picFile, sb0, sed0); }
      const t = e.clipboardData.getData('text/plain'); const parsed = t && t.trim() ? parseBlocks(t) : [];
      if (parsed.length) { const last = this.selBlocks[this.selBlocks.length - 1]; const { _blk: sb, _ed: sed } = last; this.clearSel(); sed.insertAfter(sb, parsed, false); }
      return;
    }
    const c = this.ctxOf(e.target);
    if (!c || !c.el) return;                    // widgets / inputs paste natively
    if (c.el.dataset.code) return;              // code pastes as plain text natively
    if (picFile) { e.preventDefault(); return this.pastePicture(picFile, c.b, c.ed); }
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    if (c.el && c.el.dataset.cell) { document.execCommand('insertText', false, text.replace(/\n/g, ' ')); return; }
    if ((/\n/.test(text.trim()) || text.trim() === lastBlockClip) && c.field === 'text') {
      const parsed = parseBlocks(text);
      if (parsed.length) {
        const ci = caretInfo(c.el);
        const empty = !c.b.text;
        if (empty) { const i = c.ed.idx(c.b); c.ed.blocks.splice(i, 1, ...parsed); c.ed.changed(true); c.ed.render(); c.ed.focusBlock(parsed[parsed.length - 1], 'end'); }
        else c.ed.insertAfter(c.b, parsed, false);
        return;
      }
    }
    if (/^https?:\/\/\S+$/.test(text.trim()) && !getSelection().isCollapsed) { const t = getSelection().toString(); document.execCommand('insertHTML', false, `<a class="ext" href="${escHtml(text.trim())}" data-href="${escHtml(text.trim())}">${escHtml(t)}</a>&#8203;`); return; }
    document.execCommand('insertText', false, text);
  }

  // ---------- drag & drop ----------
  onDragStart(e) {
    const g = e.target.closest && e.target.closest('.blk-handle .drag');
    const blkEl = g ? g.closest('.blk') : (e.target.classList && e.target.classList.contains('blk') && e.target.draggable ? e.target : null);
    if (!blkEl) return;
    this.dragging = { b: blkEl._blk, ed: blkEl._ed, el: blkEl };
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'block');
    try { e.dataTransfer.setDragImage(blkEl, 0, 0); } catch (err) { /* ignore */ }
  }
  clearDrop() { this.host.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); }
  onDragOver(e) {
    const hasFiles = e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    if (!this.dragging && !hasFiles) return;
    e.preventDefault();
    this.clearDrop();
    const blkEl = e.target.closest && e.target.closest('.blk');
    if (!blkEl) return;
    const r = blkEl.getBoundingClientRect();
    blkEl.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  }
  async onDrop(e) {
    const blkEl = e.target.closest && e.target.closest('.blk');
    const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
    const before = blkEl && blkEl.classList.contains('drop-before');
    this.clearDrop();
    if (files.length && blkEl) {
      e.preventDefault();
      const nbs = [];
      for (const f of files) nbs.push(mk('image', { src: await this.ctx.saveImage(f), alt: '' }));
      const { _blk: tb, _ed: ted } = blkEl; if (before) { const i = ted.idx(tb); ted.blocks.splice(i, 0, ...nbs); ted.changed(true); ted.render(); } else ted.insertAfter(tb, nbs, false);
      return;
    }
    if (!this.dragging || !blkEl) return;
    e.preventDefault();
    const { b, ed: sed } = this.dragging; this.dragging = null;
    const { _blk: tb, _ed: ted } = blkEl;
    if (tb === b) return;
    // don't drop a toggle into its own children
    if (b.type === 'toggle' && blkEl.closest('.blk[data-id="' + b.id + '"]')) return;
    sed.blocks.splice(sed.idx(b), 1); if (!sed.blocks.length) sed.blocks.push(mk('p'));
    let ti = ted.idx(tb); if (!before) ti++;
    ted.blocks.splice(ti, 0, b);
    sed.changed(true); if (sed !== ted) sed.render(); ted.render(); this.root.render();
  }
}

// click selects these blocks (Backspace deletes, Ctrl+C copies) and press-and-move drags them. Text-like blocks keep the caret instead (use their grip on the left).
const NO_CLICK_SELECT = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'todo', 'quote', 'callout', 'toggle', 'columns', 'math'];
const INTERACTIVE_SEL = 'button,input,textarea,select,a,label,summary,[contenteditable="true"],[data-nav],.rz,.img-tools,.code-ta,pre,.math-block';
