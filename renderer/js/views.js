// Non-editor views: Home dashboard (customizable widgets), Calendar, Tags, Tag results.
import * as vault from './vault.js';
import { icon } from './icons.js';
import { mascotSVG, hasMascot } from './mascots.js';
import { h, escHtml, debounce, confirmDialog, toast, ago } from './ui.js';
import { widgetCard, pickWidget, newInstance, miniCalendar } from './widgets.js';

const HOME_FILE = '.jimmy/home.json';
const DEFAULT_LAYOUT = () => ['favorites:2', 'study', 'markets', 'recent', 'todos', 'calendar', 'portfolio', 'clock', 'stats', 'tags', 'templates'].map((s) => { const [k, w] = s.split(':'); const i = newInstance(k); if (w) i.w = +w; return i; });

let layout = null;
async function loadLayout() {
  if (layout) return layout;
  try { const raw = await window.api.vault.read(HOME_FILE); if (raw) { const j = JSON.parse(raw); if (Array.isArray(j.widgets)) { layout = j.widgets; return layout; } } } catch (e) { /* default */ }
  layout = DEFAULT_LAYOUT(); return layout;
}
const persist = debounce(() => { try { window.api.vault.write(HOME_FILE, JSON.stringify({ widgets: layout.map(({ save, ...rest }) => rest) }, null, 1)); } catch (e) { /* ignore */ } }, 400);
export const resetLayoutCache = () => { layout = null; };

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}
const THEME_SUB = {
  basic: 'Plan, write and keep track — all in one place.',
  psyduck: 'Quack. Let’s get organized before the headache comes back.',
  yadon: 'Take your time. Everything gets saved… eventually.',
  duo: 'Quack… zzz. One panics, one naps — your notes are in good hands.'
};
const MONTH_LINE = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export async function renderHome(app, view) {
  await loadLayout();
  if (app.state.view.type !== 'home' || !view.isConnected) return;       // navigated away while loading
  view.querySelectorAll('.home').forEach(n => n.remove());
  const theme = app.settings.theme;
  let edit = false;
  const root = h(`<div class="home">
    <div class="hero"><div style="flex:1;min-width:0"><div class="eyebrow">${escHtml(MONTH_LINE())}</div><h1>${greeting()}</h1><p>${escHtml(THEME_SUB[theme] || THEME_SUB.basic)}</p>
      <div class="quick"><button class="btn primary" data-a="new">${icon('plus', 16)} New page</button><button class="btn" data-a="daily">${icon('calendar', 16)} Today’s note</button><button class="btn" data-a="search">${icon('search', 16)} Search</button></div></div>
      ${hasMascot(theme) ? `<div class="mascot-big mascot-anim">${mascotSVG(theme)}</div>` : ''}</div>
    <div class="dash-bar"><h2>Dashboard</h2><span class="muted dash-hint">The <b>⚙</b> on a widget changes what it shows · <b>Customize</b> adds, removes, resizes and reorders widgets</span><span class="grow"></span><button class="btn sm ghost" data-a="add" hidden>${icon('plus', 14)} Add widget</button><button class="btn sm ghost" data-a="reset" hidden>Reset layout</button><button class="btn sm" data-a="edit">${icon('settings', 14)} Customize</button></div>
    <div class="hgrid"></div></div>`);
  const grid = root.querySelector('.hgrid');
  const paint = () => {
    grid.innerHTML = ''; grid.classList.toggle('editing', edit);
    layout.forEach((inst) => {
      const card = widgetCard(inst, {
        edit, save: persist,
        onRemove: () => { layout = layout.filter(x => x !== inst); persist(); paint(); },
        onResize: () => { inst.w = inst.w === 2 ? 1 : 2; persist(); paint(); }
      });
      if (edit) {
        card.draggable = true;
        card.addEventListener('dragstart', (e) => { grid._drag = inst; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', inst.id); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('dragover', (e) => { if (grid._drag) { e.preventDefault(); card.classList.add('over'); } });
        card.addEventListener('dragleave', () => card.classList.remove('over'));
        card.addEventListener('drop', (e) => {
          e.preventDefault(); card.classList.remove('over'); const d = grid._drag; grid._drag = null; if (!d || d === inst) return;
          layout = layout.filter(x => x !== d); layout.splice(layout.indexOf(inst), 0, d); persist(); paint();
        });
      }
      grid.appendChild(card);
    });
    if (!layout.length) grid.innerHTML = '<div class="muted" style="padding:20px">No widgets — click Customize, then Add widget.</div>';
  };
  paint();
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const k = a.dataset.a;
    if (k === 'new') return app.newPage('');
    if (k === 'daily') return app.openDaily();
    if (k === 'search') return app.openSearch();
    if (k === 'edit') { edit = !edit; a.innerHTML = edit ? `${icon('check', 14)} Done` : `${icon('settings', 14)} Customize`; a.classList.toggle('primary', edit); root.querySelector('[data-a=add]').hidden = !edit; root.querySelector('[data-a=reset]').hidden = !edit; return paint(); }
    if (k === 'add') return pickWidget((kind) => { layout.push(newInstance(kind)); persist(); paint(); });
    if (k === 'reset') { if (await confirmDialog('Reset the dashboard to the default widgets?', 'Reset', false)) { layout = DEFAULT_LAYOUT(); persist(); paint(); } }
  });
  view.appendChild(root);
}

export function renderCalendarView(app, view) {
  const root = h('<div class="view-wrap" style="max-width:1100px"><h1>Calendar</h1><p class="muted" style="margin-top:-8px">Click a day to open or create its daily note. Pages with a <code>date:</code> or <code>due:</code> property (YYYY-MM-DD) also appear here.</p><div data-cal></div></div>');
  miniCalendar(root.querySelector('[data-cal]'), true);
  view.appendChild(root);
}

export function renderTagsView(app, view) {
  const tags = [...vault.allTags().entries()].sort((a, b) => b[1].length - a[1].length);
  const root = h(`<div class="view-wrap"><h1>Tags</h1><div class="tag-cloud">${tags.map(([t, ps]) => `<span class="tagchip" data-tag="${escHtml(t)}">#${escHtml(t)} <small>${ps.length}</small></span>`).join('') || '<span class="muted">No tags yet. Type #something in any note, or add tags under a page’s title.</span>'}</div></div>`);
  root.addEventListener('click', (e) => { const g = e.target.closest('[data-tag]'); if (g) app.openView({ type: 'tag', tag: g.dataset.tag }); });
  view.appendChild(root);
}

export function renderTagPage(app, view, tag) {
  const ps = (vault.allTags().get(tag) || []).sort((a, b) => b.mtime - a.mtime);
  const root = h(`<div class="view-wrap"><h1>#${escHtml(tag)} <span class="chip" style="font-size:13px;vertical-align:middle">${ps.length}</span></h1><div class="plist">${ps.map(p => `<div class="prow" data-open="${escHtml(p.path)}"><span class="pi">${p.props.icon ? escHtml(p.props.icon) : icon('file', 16)}</span><span class="pn">${escHtml(p.name)}</span><span class="pd">${escHtml(p.text.slice(0, 80))}</span></div>`).join('')}</div></div>`);
  root.addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (o) app.open(o.dataset.open); });
  view.appendChild(root);
}

export async function renderTrashView(app, view) {
  const root = h('<div class="view-wrap"><h1>Trash</h1><p class="muted" style="margin-top:-8px">Deleted pages wait here (the <code>.trash</code> folder in your vault) until you remove them for good.</p><div data-list></div></div>');
  view.appendChild(root);
  const paint = async () => {
    const items = await window.api.trash.list();
    root.querySelector('[data-list]').innerHTML = items.length
      ? `<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn sm danger" data-empty>Empty trash</button></div><div class="plist">${items.map((it) => `<div class="prow" data-n="${escHtml(it.name)}"><span class="pi">${it.dir ? '' : ''}</span><span class="pn">${escHtml(it.name.replace(/\.md$/, ''))}${it.dir ? ' <span class="chip">folder</span>' : ''}</span><span class="pd">${ago(it.mtime)}</span><button class="btn sm" data-restore>Restore</button><button class="btn sm ghost" data-del>Delete forever</button></div>`).join('')}</div>`
      : '<div class="muted" style="padding:30px 0;text-align:center">Trash is empty.</div>';
  };
  await paint();
  root.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-n]');
    if (e.target.closest('[data-restore]') && row) { const rel = await window.api.trash.restore(row.dataset.n); await vault.reload(); toast('Restored'); if (rel && rel.endsWith('.md')) app.open(rel); else { app.refresh(); paint(); } }
    else if (e.target.closest('[data-del]') && row) { if (await confirmDialog('Delete “' + row.dataset.n + '” permanently? This cannot be undone.', 'Delete forever')) { await window.api.trash.remove(row.dataset.n); paint(); } }
    else if (e.target.closest('[data-empty]')) { if (await confirmDialog('Permanently delete everything in the trash?', 'Empty trash')) { await window.api.trash.empty(); paint(); } }
  });
}
