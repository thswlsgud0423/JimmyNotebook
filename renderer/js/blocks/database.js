import { icon } from '../icons.js';
import { h, escHtml, openMenu, modal, promptDialog, confirmDialog, OPT_COLORS } from '../ui.js';
import { uid } from '../md.js';
import { richShell, segmented } from './common.js';

const TYPES = [['text', 'Text', 'text'], ['number', 'Number', 'chart'], ['select', 'Select', 'list'], ['multi', 'Multi-select', 'tag'], ['date', 'Date', 'calendar'], ['checkbox', 'Checkbox', 'todo'], ['url', 'URL', 'link']];
const opt = (n, i) => ({ n, c: OPT_COLORS[i % OPT_COLORS.length] });

export function newDatabase(view = 'table') {
  const status = { id: uid(), name: 'Status', type: 'select', opts: [opt('To do', 0), opt('Doing', 1), opt('Done', 2)] };
  const cols = [
    { id: uid(), name: 'Name', type: 'text' }, status,
    { id: uid(), name: 'Due', type: 'date' },
    { id: uid(), name: 'Priority', type: 'select', opts: [opt('Low', 2), opt('Medium', 3), opt('High', 0)] },
    { id: uid(), name: 'Notes', type: 'text' }
  ];
  const row = (n, s, p) => ({ id: uid(), v: { [cols[0].id]: n, [status.id]: s, [cols[3].id]: p } });
  return { title: view === 'board' ? 'Board' : 'Table', view, groupBy: status.id, cols, filter: '', rows: [] };
}

function optChip(o) { return `<span class="opt" style="background:${o.c}">${escHtml(o.n)}</span>`; }
function findOpt(col, n) { return (col.opts || []).find(o => o.n === n) || { n, c: OPT_COLORS[0] }; }

export function cellEditor(col, val, set, d, api) {
  const wrap = document.createElement('div');
  const stop = (e) => e.stopPropagation();
  const text = (type) => {
    const i = document.createElement('input'); i.className = 'cell'; i.value = val ?? ''; i.spellcheck = false;
    if (col.type === 'number') { i.style.textAlign = 'right'; i.inputMode = 'decimal'; }
    if (type === 'date') { i.type = 'date'; }
    i.addEventListener('input', () => set(col.type === 'number' ? (i.value === '' ? '' : parseFloat(i.value.replace(/,/g, '')) || 0) : i.value));
    i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
    return i;
  };
  if (col.type === 'checkbox') {
    const c = h(`<label class="cell" style="display:flex;justify-content:center"><input type="checkbox" style="accent-color:var(--accent);width:17px;height:17px" ${val ? 'checked' : ''}></label>`);
    c.querySelector('input').onchange = (e) => set(e.target.checked); return c;
  }
  if (col.type === 'select' || col.type === 'multi') {
    const c = h('<div class="cell" tabindex="0" style="cursor:pointer;min-height:32px"></div>');
    const paint = () => {
      const cur = col.type === 'multi' ? (Array.isArray(val) ? val : []) : (val ? [val] : []);
      c.innerHTML = cur.map(n => optChip(findOpt(col, n))).join('') || '<span class="muted" style="opacity:.5">–</span>';
    };
    paint();
    const pick = (ev) => {
      ev.stopPropagation(); const r = c.getBoundingClientRect();
      const cur = col.type === 'multi' ? (Array.isArray(val) ? val : []) : [val];
      const items = (col.opts || []).map(o => ({ html: `${cur.includes(o.n) ? '✓ ' : ''}${optChip(o)}`, action: () => { if (col.type === 'multi') { val = cur.includes(o.n) ? cur.filter(x => x !== o.n) : [...cur, o.n]; } else val = cur.includes(o.n) ? '' : o.n; set(val); paint(); } }));
      items.push({ sep: true }, { label: 'Add option…', icon: 'plus', action: async () => { const n = await promptDialog('New option'); if (!n) return; col.opts = col.opts || []; col.opts.push(opt(n, col.opts.length)); if (col.type === 'multi') val = [...cur, n]; else val = n; set(val); paint(); api.changed(true); } });
      if (cur.length && cur[0]) items.push({ label: 'Clear', icon: 'x', action: () => { val = col.type === 'multi' ? [] : ''; set(val); paint(); } });
      openMenu(r.left, r.bottom + 2, items);
    };
    c.onclick = pick; c.onkeydown = (e) => { if (e.key === 'Enter') pick(e); e.stopPropagation(); };
    return c;
  }
  if (col.type === 'url') {
    const i = text('text'); i.placeholder = 'https://…'; i.style.color = 'var(--accent2)';
    i.addEventListener('dblclick', () => val && window.api.openExternal(/^https?:/.test(i.value) ? i.value : 'https://' + i.value)); i.title = 'Double-click to open';
    return i;
  }
  return text(col.type);
}

export function renderDatabase(b, api) {
  const d = b.data;
  const { el, body, tools } = richShell(b, api, { ico: d.view === 'board' ? 'kanban' : 'db', ph: 'Database title' });
  const save = (s) => api.changed(s);
  const viewSeg = segmented([['table', 'Table'], ['board', 'Board'], ['gallery', 'Gallery']], d.view, (v) => { d.view = v; save(true); paint(); });
  tools.appendChild(viewSeg);
  const search = h('<input class="inp" placeholder="Filter…" style="width:120px;padding:3px 8px;margin-left:6px">'); search.value = d.filter || '';
  search.addEventListener('input', () => { d.filter = search.value; paint(); }); search.addEventListener('keydown', (e) => e.stopPropagation());
  tools.appendChild(search);
  const area = h('<div></div>'); body.appendChild(area);

  const titleCol = () => d.cols[0];
  const rowTitle = (r) => (titleCol() && r.v[titleCol().id]) || 'Untitled';
  const visibleRows = () => {
    let rows = d.rows.slice();
    const f = (d.filter || '').toLowerCase().trim();
    if (f) rows = rows.filter(r => Object.values(r.v).some(v => String(Array.isArray(v) ? v.join(' ') : v ?? '').toLowerCase().includes(f)));
    if (d.sort && d.cols.find(c => c.id === d.sort.col)) {
      const col = d.cols.find(c => c.id === d.sort.col), dir = d.sort.dir === 'desc' ? -1 : 1;
      rows.sort((a, c) => { const x = a.v[col.id] ?? '', y = c.v[col.id] ?? ''; return (col.type === 'number' ? (x || 0) - (y || 0) : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir; });
    }
    return rows;
  };
  const newRow = (preset = {}) => { const r = { id: uid(), v: Object.assign({}, preset) }; d.rows.push(r); save(true); return r; };

  function openDetail(r) {
    const m = modal(`<div class="modal-h"><span class="ic-badge">${icon('file', 17)}</span><span style="flex:1" data-t></span><button class="iconbtn" data-del title="Delete row">${icon('trash', 16)}</button></div><div class="modal-b" data-b></div>`, { center: true });
    m.el.querySelector('[data-t]').textContent = rowTitle(r);
    const bd = m.el.querySelector('[data-b]');
    d.cols.forEach((col, i) => {
      const row = h(`<div class="set-row"><div class="lbl" style="flex:0 0 130px">${escHtml(col.name)}<small>${col.type}</small></div><div style="flex:1" data-c></div></div>`);
      const ed = cellEditor(col, r.v[col.id], (v) => { r.v[col.id] = v; save(); if (i === 0) m.el.querySelector('[data-t]').textContent = rowTitle(r); }, d, api);
      ed.style.border = '1px solid var(--line)'; ed.style.borderRadius = '9px'; ed.style.background = 'var(--card)';
      row.querySelector('[data-c]').appendChild(ed); bd.appendChild(row);
    });
    m.el.querySelector('[data-del]').onclick = async () => { m.close(); d.rows = d.rows.filter(x => x !== r); save(true); paint(); };
    const origClose = m.close; m.el.parentElement.querySelector('.scrim').addEventListener('mousedown', () => paint());
  }

  function colMenu(col, ev) {
    const r = ev.currentTarget.getBoundingClientRect();
    const items = [
      { label: 'Rename', icon: 'pen', action: async () => { const n = await promptDialog('Column name', col.name); if (n) { col.name = n; save(true); paint(); } } },
      { header: 'Type' }, ...TYPES.map(([t, l, ic]) => ({ label: (col.type === t ? '✓ ' : '') + l, icon: ic, action: () => { col.type = t; if ((t === 'select' || t === 'multi') && !col.opts) col.opts = []; d.rows.forEach(rw => { const v = rw.v[col.id]; if (t === 'multi') rw.v[col.id] = v ? (Array.isArray(v) ? v : [v]) : []; else if (Array.isArray(v)) rw.v[col.id] = v[0] || ''; if (t === 'select' && v && !(col.opts || []).some(o => o.n === rw.v[col.id])) { col.opts.push(opt(rw.v[col.id], col.opts.length)); } }); save(true); paint(); } })),
      { sep: true }, { label: 'Sort ascending', icon: 'arrowup', action: () => { d.sort = { col: col.id, dir: 'asc' }; save(true); paint(); } },
      { label: 'Sort descending', icon: 'arrowdown', action: () => { d.sort = { col: col.id, dir: 'desc' }; save(true); paint(); } }
    ];
    if (d.sort) items.push({ label: 'Clear sort', icon: 'x', action: () => { d.sort = null; save(true); paint(); } });
    if (col.type === 'select') items.push({ label: 'Group board by this', icon: 'kanban', action: () => { d.groupBy = col.id; d.view = 'board'; viewSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === 'board')); save(true); paint(); } });
    if (col.type === 'select' || col.type === 'multi') items.push({ label: 'Edit options…', icon: 'list', action: async () => { const n = await promptDialog('Options (comma separated)', (col.opts || []).map(o => o.n).join(', ')); if (n == null) return; col.opts = n.split(',').map(s => s.trim()).filter(Boolean).map((s, i) => ({ n: s, c: (col.opts || []).find(o => o.n === s)?.c || OPT_COLORS[i % OPT_COLORS.length] })); save(true); paint(); } });
    if (d.cols.length > 1) items.push({ sep: true }, { label: 'Delete column', icon: 'trash', danger: true, action: async () => { if (await confirmDialog('Delete column “' + col.name + '”?')) { d.cols = d.cols.filter(c => c !== col); save(true); paint(); } } });
    openMenu(r.left, r.bottom + 2, items);
  }

  function paintTable() {
    const rows = visibleRows();
    const wrap = h('<div class="db-tbl-wrap"><table class="db"></table></div>');
    const t = wrap.querySelector('table');
    const head = h('<tr><th style="width:34px"></th></tr>');
    d.cols.forEach((c) => {
      const th = h(`<th><div class="th-in">${icon((TYPES.find(x => x[0] === c.type) || [])[2] || 'text', 14)}<span>${escHtml(c.name)}</span>${d.sort && d.sort.col === c.id ? icon(d.sort.dir === 'desc' ? 'arrowdown' : 'arrowup', 12) : ''}</div></th>`);
      th.addEventListener('click', (e) => colMenu(c, e)); head.appendChild(th);
    });
    const addC = h(`<th style="width:40px"><button class="iconbtn" title="Add column">${icon('plus', 14)}</button></th>`);
    addC.onclick = () => { d.cols.push({ id: uid(), name: 'Column ' + (d.cols.length + 1), type: 'text' }); save(true); paint(); };
    head.appendChild(addC); t.appendChild(head);
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const rc = h(`<td class="rowctl"><button class="iconbtn" title="Open row">${icon('panel', 14)}</button></td>`);
      rc.querySelector('button').onclick = () => openDetail(r); tr.appendChild(rc);
      d.cols.forEach((c) => { const td = document.createElement('td'); td.appendChild(cellEditor(c, r.v[c.id], (v) => { r.v[c.id] = v; save(); if (c.type === 'number') updFooter(); }, d, api)); tr.appendChild(td); });
      const del = h(`<td class="rowctl" style="border:0"><button class="iconbtn" title="Delete row">${icon('x', 14)}</button></td>`);
      del.querySelector('button').onclick = () => { d.rows = d.rows.filter(x => x !== r); save(true); paint(); }; tr.appendChild(del);
      t.appendChild(tr);
    });
    const foot = h('<tr class="foot"></tr>'); foot.appendChild(h('<td class="rowctl"></td>'));
    const updFooter = () => { foot.querySelectorAll('[data-f]').forEach(x => { const c = d.cols.find(c2 => c2.id === x.dataset.f); const vals = rows.map(r => r.v[c.id]).filter(v => v !== '' && v != null && !isNaN(+v)).map(Number); x.textContent = vals.length ? 'Σ ' + vals.reduce((a, v) => a + v, 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) + '  ·  avg ' + (vals.reduce((a, v) => a + v, 0) / vals.length).toLocaleString(undefined, { maximumFractionDigits: 2 }) : ''; }); };
    d.cols.forEach(c => foot.appendChild(h(`<td style="padding:4px 10px;font-size:12px;color:var(--muted);font-weight:700;text-align:right" ${c.type === 'number' ? `data-f="${c.id}"` : ''}></td>`)));
    if (d.cols.some(c => c.type === 'number')) { t.appendChild(foot); updFooter(); }
    area.appendChild(wrap);
    const add = h(`<button class="db-add">+ New row</button>`); add.onclick = () => { const r = newRow(); paint(); setTimeout(() => { const last = area.querySelector('table.db tr:nth-last-child(1) input, table.db tr:last-of-type input'); }, 0); };
    area.appendChild(add);
  }

  function paintBoard() {
    let gcol = d.cols.find(c => c.id === d.groupBy && c.type === 'select') || d.cols.find(c => c.type === 'select');
    if (!gcol) { area.innerHTML = '<div class="muted" style="padding:14px">Board view needs a <b>Select</b> column. Change a column type in Table view.</div>'; return; }
    d.groupBy = gcol.id;
    const rows = visibleRows();
    const board = h('<div class="board"></div>');
    const groups = [...(gcol.opts || []).map(o => ({ name: o.n, o })), { name: '', o: null }];
    groups.forEach((g) => {
      const list = rows.filter(r => (r.v[gcol.id] || '') === g.name);
      if (!g.name && !list.length && (gcol.opts || []).length) return;
      const col = h(`<div class="col"><div class="col-h">${g.o ? optChip(g.o) : '<span class="muted">No ' + escHtml(gcol.name) + '</span>'}<span class="n">${list.length}</span></div></div>`);
      list.forEach((r) => {
        const props = d.cols.slice(1).filter(c => c.id !== gcol.id && r.v[c.id] !== '' && r.v[c.id] != null && !(Array.isArray(r.v[c.id]) && !r.v[c.id].length)).slice(0, 3);
        const card = h(`<div class="kcard" draggable="true"><div class="kt">${escHtml(rowTitle(r))}</div><div class="kp">${props.map(c => c.type === 'select' ? optChip(findOpt(c, r.v[c.id])) : c.type === 'checkbox' ? (r.v[c.id] ? '✅ ' + escHtml(c.name) : '') : c.type === 'multi' ? r.v[c.id].map(n => optChip(findOpt(c, n))).join('') : `<span>${c.type === 'date' ? '📅 ' : ''}${escHtml(String(r.v[c.id]))}</span>`).join('')}</div></div>`);
        card.onclick = () => openDetail(r);
        card.ondragstart = (e) => { e.stopPropagation(); card.classList.add('dragging'); e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; board._drag = r; };
        card.ondragend = () => card.classList.remove('dragging');
        col.appendChild(card);
      });
      col.ondragover = (e) => { if (board._drag) { e.preventDefault(); e.stopPropagation(); col.classList.add('over'); } };
      col.ondragleave = () => col.classList.remove('over');
      col.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); col.classList.remove('over'); if (board._drag) { board._drag.v[gcol.id] = g.name; board._drag = null; save(true); paint(); } };
      const add = h('<button class="db-add" style="border:0;border-radius:10px">+ New</button>');
      add.onclick = () => { const r = newRow({ [gcol.id]: g.name }); paint(); openDetail(r); };
      col.appendChild(add); board.appendChild(col);
    });
    const addG = h(`<button class="btn sm ghost" style="flex:none">+ Column</button>`);
    addG.onclick = async () => { const n = await promptDialog('New column name'); if (!n) return; gcol.opts = gcol.opts || []; gcol.opts.push(opt(n, gcol.opts.length)); save(true); paint(); };
    board.appendChild(addG);
    area.appendChild(board);
  }

  function paintGallery() {
    const g = h('<div class="gal"></div>');
    visibleRows().forEach(r => {
      const props = d.cols.slice(1).filter(c => r.v[c.id] !== '' && r.v[c.id] != null && !(Array.isArray(r.v[c.id]) && !r.v[c.id].length)).slice(0, 4);
      const c = h(`<div class="kcard" style="cursor:pointer"><div class="kt">${escHtml(rowTitle(r))}</div><div class="kp">${props.map(p => p.type === 'select' ? optChip(findOpt(p, r.v[p.id])) : p.type === 'checkbox' ? (r.v[p.id] ? '✅' : '⬜') : p.type === 'multi' ? r.v[p.id].map(n => optChip(findOpt(p, n))).join('') : `<span>${escHtml(String(r.v[p.id]))}</span>`).join('')}</div></div>`);
      c.onclick = () => openDetail(r); g.appendChild(c);
    });
    const add = h('<button class="kcard" style="color:var(--muted);font-weight:800;text-align:center;border-style:dashed">+ New</button>'); add.onclick = () => { const r = newRow(); paint(); openDetail(r); }; g.appendChild(add);
    area.appendChild(g);
  }
  function paint() {
    area.innerHTML = '';
    if (d.view === 'board') paintBoard(); else if (d.view === 'gallery') paintGallery(); else paintTable();
  }
  paint();
  return el;
}
