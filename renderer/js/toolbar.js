// Always-visible formatting toolbar (like Google Docs) above the page, so every tool can be found by looking.
import { icon } from './icons.js';
import { h, openMenu, modal, toast, escHtml } from './ui.js';
import { COMMANDS } from './editor.js';
import { wordStats, countText } from './tools.js';

const STYLES = [
  ['p', 'Normal text', 'Text'], ['h1', 'Heading 1', 'Big title'], ['h2', 'Heading 2', 'Section'], ['h3', 'Heading 3', 'Sub-section'],
  ['quote', 'Quote', 'Quote'], ['callout', 'Callout box', 'Callout']
];
const GROUPS = [
  ['Basic', ['Text', 'Heading 1', 'Heading 2', 'Heading 3', 'Bulleted list', 'Numbered list', 'To-do list', 'Toggle', 'Quote', 'Callout', 'Divider', 'Code', 'Math equation']],
  ['Tables & charts', ['Table', 'Bar chart', 'Line chart', 'Pie chart', 'Database table', 'Kanban board']],
  ['Media', ['Image', 'Drawing']],
  ['Track & study', ['Timeline', 'Flashcards', 'Pomodoro timer', 'Portfolio tracker']],
  ['Layout', ['2 columns', '3 columns', 'Table of contents']],
  ['More', ['Widget…', 'Link to page', "Today's date", 'Template…']]
];

let bar = null, ed = null;

export function mountToolbar() {
  bar = document.getElementById('doctools');
  if (!bar || bar.dataset.ready) return;
  bar.dataset.ready = '1';
  const B = (c, ttl, inner, cls = '') => `<button class="dt-b ${cls}" data-c="${c}" title="${escHtml(ttl)}">${inner}</button>`;
  bar.innerHTML = `
    ${B('undo', 'Undo (Ctrl+Z)', icon('undo', 16))}${B('redo', 'Redo (Ctrl+Y)', icon('redo', 16))}
    <span class="dt-sep"></span>
    <button class="dt-b dt-style" data-c="style" title="Text style: heading, quote, callout…"><span class="dt-style-t">Normal text</span>${icon('arrowdown', 13)}</button>
    <span class="dt-sep"></span>
    ${B('bold', 'Bold (Ctrl+B)', '<b>B</b>')}${B('italic', 'Italic (Ctrl+I)', '<i>I</i>')}${B('underline', 'Underline (Ctrl+U)', '<u>U</u>')}${B('strike', 'Strikethrough', '<s>S</s>')}${B('code', 'Inline code (select text first)', '&lt;/&gt;')}${B('mark', 'Highlight (select text first)', '<span class="dt-hl">A</span>')}${B('url', 'Add a link (Ctrl+L)', icon('link', 16))}
    <span class="dt-sep"></span>
    ${B('ul', 'Bulleted list', icon('list', 16))}${B('ol', 'Numbered list', icon('olist', 16))}${B('todo', 'To-do list (checkboxes)', icon('todo', 16))}
    <span class="dt-sep"></span>
    <button class="dt-b dt-ins" data-c="insert" title="Insert anything: table, chart, image, timeline, code…">${icon('plus', 15)}<span>Insert</span></button>
    ${B('table', 'Insert a table', icon('table', 16))}${B('chart', 'Insert a chart', icon('chart', 16))}${B('image', 'Insert an image (you can also paste one with Ctrl+V)', icon('image', 16))}${B('timeline', 'Insert a timeline', icon('calendar', 16))}
    <span class="dt-gap"></span><span class="dt-count" title="Words · reading time"></span>
    <button class="dt-b dt-help" data-c="help" title="How to use Jimmy Notes">?<span>Help</span></button>`;
  bar.addEventListener('mousedown', (e) => { if (!e.target.closest('input,select')) e.preventDefault(); });   // keep the caret / selection in the text
  bar.addEventListener('click', (e) => { const b = e.target.closest('.dt-b'); if (b) run(b.dataset.c, b); });
  document.addEventListener('selectionchange', refresh);
}

export function attachToolbar(editor) {
  if (!bar) mountToolbar();
  ed = editor; if (!bar) return;
  bar.hidden = !editor;
  if (editor) editor.onState = refresh;
  refresh();
}
export function detachToolbar() { ed = null; if (bar) bar.hidden = true; }

const cmd = (name) => COMMANDS.find((c) => c.title === name);

function refresh() {
  if (!bar || !ed || bar.hidden) return;
  let c = null; try { c = ed.currentCtx(); } catch (e) { /* */ }
  const t = c && c.b ? c.b.type : '';
  const st = STYLES.find((s) => s[0] === t);
  bar.querySelector('.dt-style-t').textContent = st ? st[1] : ({ ul: 'Bulleted list', ol: 'Numbered list', todo: 'To-do list', toggle: 'Toggle', code: 'Code', table: 'Table', image: 'Image', chart: 'Chart' }[t] || 'Normal text');
  const inText = c && c.el && c.el.dataset && c.el.dataset.txt;
  ['bold', 'italic', 'underline'].forEach((k) => { const b = bar.querySelector(`[data-c=${k}]`); let on = false; try { on = !!inText && document.queryCommandState(k); } catch (e) { /* */ } b.classList.toggle('on', on); });
  ['ul', 'ol', 'todo'].forEach((k) => bar.querySelector(`[data-c=${k}]`).classList.toggle('on', t === k));
  const cnt = bar.querySelector('.dt-count'); const st2 = wordStats(ed.root.blocks); const sel = getSelection(); const sw = sel && !sel.isCollapsed && ed.root.host.contains(sel.anchorNode) ? countText(sel.toString()) : 0;
  cnt.textContent = sw ? sw + ' of ' + st2.words + ' words' : st2.words + (st2.words === 1 ? ' word' : ' words') + ' · ' + st2.mins + ' min read';
  bar.querySelector('[data-c=undo]').classList.toggle('dim', !(ed.root.hi > 0));
  bar.querySelector('[data-c=redo]').classList.toggle('dim', !(ed.root.hi < ed.root.hist.length - 1));
}

function insertMenu(btn) {
  const r = btn.getBoundingClientRect();
  const items = [];
  GROUPS.forEach(([g, names]) => {
    items.push({ header: g });
    names.forEach((n) => { const it = cmd(n); if (it) items.push({ html: `<span class="dt-mi"><b>${escHtml(it.title)}</b><small>${escHtml(it.desc)}</small></span>`, icon: it.icon, action: () => ed.toolbarInsert(it) }); });
  });
  openMenu(r.left, r.bottom + 4, items);
}

function run(c, btn) {
  if (!ed) return;
  const root = ed.root;
  switch (c) {
    case 'undo': root.undo(false); break;
    case 'redo': root.undo(true); break;
    case 'bold': case 'italic': case 'underline': case 'strike': case 'url': {
      const cx = root.currentCtx(); if (!cx || !cx.el || !cx.el.dataset.txt) return toast('Click inside some text first');
      if (document.activeElement !== cx.el && !cx.el.contains(document.activeElement)) cx.el.focus();
      root.fmtCmd(c); break;
    }
    case 'code': case 'mark': {
      if (getSelection().isCollapsed) return toast('Select some text first, then press this');
      root.fmtCmd(c); break;
    }
    case 'ul': case 'ol': case 'todo': root.toolbarStyle(c); break;
    case 'style': {
      const r = btn.getBoundingClientRect();
      openMenu(r.left, r.bottom + 4, STYLES.map(([t, label, hint]) => ({ html: `<span class="dt-mi"><b>${escHtml(label)}</b><small>${escHtml(hint)}</small></span>`, action: () => root.toolbarStyle(t) })));
      break;
    }
    case 'insert': insertMenu(btn); break;
    case 'table': root.toolbarInsert(cmd('Table')); break;
    case 'chart': root.toolbarInsert(cmd('Bar chart')); break;
    case 'image': root.toolbarInsert(cmd('Image')); break;
    case 'timeline': root.toolbarInsert(cmd('Timeline')); break;
    case 'help': showHelp(); break;
  }
  setTimeout(refresh, 30);
}

export function showHelp() {
  const row = (k, t) => `<div class="hp-r"><kbd>${k}</kbd><span>${t}</span></div>`;
  const m = modal(`<div class="modal-h">How to use Jimmy Notes</div><div class="modal-b hp">
    <h4>The toolbar (top of every page)</h4>
    <p>Click in your text, then use the buttons: <b>B</b> bold, <i>I</i> italic, lists, <b>Style</b> for headings. <b>Insert</b> adds tables, charts, images, code, timelines and more. Select some text first for highlight / code / link.</p>
    <h4>Quick ways to add things</h4>
    ${row('/', 'Type a slash on an empty line to see every block you can add')}
    ${row('[[', 'Type two square brackets to link to another page')}
    ${row('# + space', 'Heading. Also “- ” bullet, “1. ” numbers, “[] ” to-do, “&gt; ” quote')}
    ${row('Ctrl+V', 'Paste an image or screenshot straight into your page')}
    <h4>Blocks (charts, images, code, tables…)</h4>
    ${row('Click', 'Click a chart / image / code snippet’s edge to select it (blue outline)')}
    ${row('Backspace', 'Deletes the selected block. Ctrl+Z brings it back')}
    ${row('Drag ⋮⋮', 'Hover a block and drag the ⋮⋮ on its left to move it. Click ⋮⋮ for more options')}
    ${row('Ctrl+C / V', 'Copy and paste whole blocks, even between pages')}
    <h4>Pages &amp; tabs</h4>
    ${row('Ctrl+T', 'New tab. Ctrl+W closes, Ctrl+Tab switches')}
    ${row('Ctrl+K', 'Search every page and run any command')}
    ${row('Drag', 'Drag pages in the left list to reorder or move them into folders')}
    ${row('Right-click', 'Right-click a page in the list for rename, move, delete, new timeline…')}
    <h4>Undo</h4>
    ${row('Ctrl+Z / Y', 'Undo and redo — works for text and for blocks')}
    <div style="text-align:right;margin-top:10px"><button class="btn primary" data-a="ok">Got it</button></div></div>`, { wide: true });
  m.el.querySelector('[data-a=ok]').onclick = () => m.close();
}
