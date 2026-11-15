import * as vault from './vault.js';
import { parsePage, parseFM, serializePage, serializeBlocks, mk, headings, countWords, mdToHtml } from './md.js';
import { Editor } from './editor.js';
import { attachToolbar, detachToolbar, showHelp } from './toolbar.js';
import { openHistory, replaceAllIn, countMatches } from './tools.js';
import { showDoc, docMenu, importPdfs } from './docview.js';
import { initAssistant, toggleAssistant, isOpen as aiOpen, openAiSettings } from './assistant.js';
import { icon } from './icons.js';
import { mascotSVG, logoHTML, hasMascot, MASCOT_LINES, THEMES, HAS_ART } from './mascots.js';
import { $, h, escHtml, debounce, toast, openMenu, menuAt, closeMenus, emojiPicker, promptDialog, confirmDialog, ago, fmtDate, placeCaretEnd } from './ui.js';
import { renderHome, renderCalendarView, renderTagsView, renderTagPage, renderTrashView } from './views.js';
import { openPalette, openSearch, openSettings, pickTemplate } from './dialogs.js';
import { templates } from './seed.js';
import { toBlocks } from './importer.js';
import { setLinkApp } from './links.js';
import { newTimeline as timelineData } from './blocks/timeline.js';
import { setApp } from './widgets.js';
import * as study from './study.js';
import { resetLayoutCache } from './views.js';

// ---------------------------------------------------------------- settings
const DEFAULTS = { theme: 'basic', mode: 'system', mascot: true, pattern: false, width: 'normal', fontSize: '15px', font: 'clean', accent: '', sbWidth: 272, sbHidden: false, rightOpen: false, expanded: [], last: null };
const settings = Object.assign({}, DEFAULTS, (() => { try { return JSON.parse(localStorage.getItem('jn.settings') || '{}'); } catch (e) { return {}; } })());
const COVER_NAMES = { auto: 'Match my theme', dunes: 'Dunes', slate: 'Slate', lavender: 'Lavender', sunset: 'Sunset', ocean: 'Ocean', mint: 'Mint', lemon: 'Lemon', sakura: 'Sakura', night: 'Night', duck: 'Psyduck waterfall', pond: 'Psyduck pond', slow: 'Slowpoke lake', duo: 'Psyduck & Slowpoke', meadow: 'Slowpoke meadow', onsen: 'Slowpoke onsen', sea: 'Psyduck sea', swing: 'Psyduck swing', bath: 'Psyduck bath', snow: 'Psyduck snow', boat: 'Slowpoke boat', anniv: '30th anniversary', well: 'The well', ring: 'Slowpoke ring', field: 'Slowpoke field' };
const COVERS = ['auto', 'dunes', 'slate', 'lavender', 'sunset', 'ocean', 'mint', 'lemon', 'sakura', 'night', 'duck', 'pond', 'slow', 'duo', 'meadow', 'onsen', 'sea', 'swing', 'bath', 'snow', 'boat', 'anniv', 'well', 'ring', 'field']
  .filter(c => HAS_ART || ['auto', 'dunes', 'slate', 'lavender', 'sunset', 'ocean', 'mint', 'lemon', 'sakura', 'night'].includes(c));
if (!THEMES[settings.theme]) settings.theme = 'basic';

function applyTheme() {
  const root = document.documentElement;
  const mode = settings.mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.mode;
  root.dataset.theme = settings.theme; root.dataset.mode = mode;
  root.style.setProperty('--page-width', { normal: '820px', wide: '1080px', full: '100%' }[settings.width] || '820px');
  document.body.style.fontSize = settings.fontSize;
  root.style.setProperty('--lh', settings.lineHeight || '');
  document.body.classList.toggle('no-doctools', settings.toolbar === false);
  document.body.classList.toggle('compact', !!settings.compact);
  root.dataset.spell = settings.spell ? 'on' : 'off';
  if (settings.accent) {
    const c = settings.accent; const n = parseInt(c.slice(1), 16); const lum = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
    root.style.setProperty('--accent', c); root.style.setProperty('--accent-soft', `color-mix(in srgb, ${c} 22%, var(--card))`); root.style.setProperty('--accent-ink', lum > 150 ? '#2b2433' : '#fff');
  } else ['--accent', '--accent-soft', '--accent-ink'].forEach(v => root.style.removeProperty(v));
  const app = $('#app'); app.classList.toggle('no-mascot', !settings.mascot); app.classList.toggle('no-pattern', !settings.pattern);
  root.dataset.font = settings.font || 'clean';
  $('#mascot-corner').innerHTML = mascotSVG(settings.theme);
  app.classList.toggle('no-mascot', !settings.mascot || !hasMascot(settings.theme));
  document.dispatchEvent(new Event('themechange'));
  if (typeof renderSidebar === 'function' && vault.pages) renderSidebar();
}
function saveSettings() { try { localStorage.setItem('jn.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } applyTheme(); if (state.view.type === 'home') showHome(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (settings.mode === 'system') applyTheme(); });

// ---------------------------------------------------------------- state
const state = { view: { type: 'home' }, hist: [], hpos: -1, tabs: [{ view: { type: 'home' }, hist: [], hpos: -1 }], tab: 0 };
const closedTabs = [];
let cur = null;             // current page session {path, props, dirty, src}
let editor = null;
let graphStop = null;
let saveTimer = null;

// ---------------------------------------------------------------- editor context
const ctx = {
  exists: vault.exists, resolve: vault.resolve, fuzzyPages: vault.fuzzyPages, assetUrl: vault.assetUrl,
  saveImage: vault.saveImage, saveDataUrl: vault.saveDataUrl, todayKey: () => vault.todayKey(),
  openLink: (name, heading, newTab) => openLink(name, heading, newTab),
  openTag: (tag) => openView({ type: 'tag', tag }),
  createPageByName: async (name) => { if (!vault.exists(name)) await createNamed(name); },
  pickTemplate: (cb) => pickTemplate(app, cb)
};

// ---------------------------------------------------------------- save
function setStatus(txt) { const s = $('#topbar .saved'); if (s) s.textContent = txt; }
async function doSave() {
  if (!cur || !editor || !cur.dirty) return;
  clearTimeout(saveTimer);
  const { path } = cur;
  cur.dirty = false;
  try {
    cur.src = await vault.savePage(path, cur.props, editor.blocks);
    setStatus('Saved ✓'); if (cur && cur.onSaved) cur.onSaved();
  } catch (e) { cur.dirty = true; setStatus('⚠ Save failed'); console.error(e); }
}
const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 700); };
async function flush() { clearTimeout(saveTimer); await doSave(); }
window.addEventListener('blur', () => flush());
window.addEventListener('beforeunload', () => { flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

// ---------------------------------------------------------------- navigation
async function openView(v, push = true) {
  await flush();
  closeMenus();
  if (editor) { editor.destroy(); editor = null; }
  detachToolbar();
  if (graphStop) { graphStop(); graphStop = null; }
  cur = null;
  state.view = v;
  if (push) {
    const last = state.hist[state.hpos];
    if (!last || JSON.stringify(last) !== JSON.stringify(v)) { state.hist = state.hist.slice(0, state.hpos + 1); state.hist.push(v); state.hpos = state.hist.length - 1; }
  }
  syncTab();
  const view = $('#view'); view.innerHTML = ''; view.scrollTop = 0; view.style.overflowY = 'auto';
  $('#app').classList.remove('focus');
  if (v.type === 'home') showHome();
  else if (v.type === 'page') await showPage(v.path, v);
  else if (v.type === 'doc') showDoc(app, view, v.path, v.page);
  else if (v.type === 'calendar') renderCalendarView(app, view);
  else if (v.type === 'trash') await renderTrashView(app, view);
  else if (v.type === 'study') { view.style.overflowY = 'auto'; graphStop = study.renderStudyView(app, view); }
  else if (v.type === 'tags') renderTagsView(app, view);
  else if (v.type === 'tag') renderTagPage(app, view, v.tag);
  if (v.type === 'page') settings.last = v.path; else settings.last = null;
  try { localStorage.setItem('jn.settings', JSON.stringify(settings)); } catch (e) { /* */ }
  renderTopbar(); renderSidebar(); renderRight(); renderTabs();
}
const open = (path, opts) => (/\.pdf$/i.test(path) ? openView({ type: 'doc', path }) : openView(Object.assign({ type: 'page', path }, opts || {})));
async function showHome() { const view = $('#view'); view.innerHTML = ''; await renderHome(app, view); }
function navStep(d) {
  const i = state.hpos + d;
  if (i < 0 || i >= state.hist.length) return;
  state.hpos = i; openView(state.hist[i], false);
}
async function openLink(name, heading, newTab) {
  let p = vault.resolve(name);
  if (p && p.isDoc) { if (newTab) await newTabFn(); const pn = /(\d+)/.exec(heading || ''); return openView({ type: 'doc', path: p.path, page: pn ? +pn[1] : 0 }); }
  if (!p) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return openDaily(name);
    p = vault.pages.get(await createNamed(name));
  }
  if (newTab) return openInNewTab(p.path, heading ? { heading } : {});
  await open(p.path, heading ? { heading } : {});
}

// ---------------------------------------------------------------- tabs
// Each tab remembers what it shows and its own back/forward history. state.hist / state.hpos always belong to the active tab.
function syncTab() { const t = state.tabs[state.tab]; t.view = state.view; t.hist = state.hist; t.hpos = state.hpos; }
function loadTab(i) { state.tab = i; const t = state.tabs[i]; state.hist = t.hist; state.hpos = t.hpos; return openView(t.view, false); }
function tabTitle(t) {
  const v = t.view || { type: 'home' };
  if (v.type === 'doc') { const d = vault.docs.get(v.path); return '📕 ' + (d ? d.name : v.path.replace(/^.*\//, '')); }
  if (v.type === 'page') { const p = vault.pages.get(v.path); return (p && p.props.icon ? p.props.icon + ' ' : '') + (p ? p.name : v.path.replace(/^.*\//, '').replace(/\.md$/, '')); }
  return { home: 'Home', calendar: 'Calendar', study: 'Study timer', trash: 'Trash', tags: 'Tags', tag: '#' + (v.tag || '') }[v.type] || 'New tab';
}
function renderTabs() {
  const bar = $('#tabbar'); if (!bar) return;
  syncTab();
  bar.innerHTML = state.tabs.map((t, i) => `<div class="tab ${i === state.tab ? 'active' : ''}" data-i="${i}" draggable="true" title="${escHtml(tabTitle(t))}"><span class="tab-t">${escHtml(tabTitle(t))}</span><button class="tab-x" data-x title="Close tab (Ctrl+W)">${icon('x', 13)}</button></div>`).join('') +
    `<button class="tab-new" data-new title="New tab (Ctrl+T)">${icon('plus', 15)}</button>`;
  const a = bar.querySelector('.tab.active'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
async function switchTab(i) {
  if (i < 0 || i >= state.tabs.length || i === state.tab) return;
  await flush(); syncTab(); await loadTab(i);
}
async function newTab(view) {
  await flush(); syncTab();
  const v = view || { type: 'home' };
  state.tabs.splice(state.tab + 1, 0, { view: v, hist: [v], hpos: 0 });
  state.tab += 1; state.hist = state.tabs[state.tab].hist; state.hpos = 0;
  await openView(v, false);
}
async function openInNewTab(path, opts) {
  const have = state.tabs.findIndex(t => t.view && t.view.type === 'page' && t.view.path === path);
  if (have >= 0 && !(opts && opts.heading)) return switchTab(have);
  return newTab(Object.assign({ type: 'page', path }, opts || {}));
}
async function closeTabs(idxs) {
  const set = new Set(idxs); if (!set.size) return;
  await flush(); syncTab();
  const activeGone = set.has(state.tab);
  const before = [...set].filter(i => i < state.tab).length;
  state.tabs.forEach((t, i) => { if (set.has(i) && t.view && t.view.type === 'page') { closedTabs.push(t.view); if (closedTabs.length > 20) closedTabs.shift(); } });
  const activeObj = state.tabs[state.tab];
  const keep = state.tabs.filter((t, i) => !set.has(i));
  if (!keep.length) { const v = { type: 'home' }; keep.push({ view: v, hist: [v], hpos: 0 }); }
  state.tabs = keep;
  if (activeGone) await loadTab(Math.min(Math.max(0, state.tab - before), keep.length - 1));
  else { state.tab = keep.indexOf(activeObj); renderTabs(); }
}
const closeTab = (i) => closeTabs([i]);
async function reopenClosedTab() { const v = closedTabs.pop(); if (!v) return toast('No closed tab to reopen'); if (v.type === 'page' && !vault.pages.has(v.path)) return reopenClosedTab(); return newTab(v); }
async function duplicateTab(i) {
  await flush(); syncTab();
  const t = state.tabs[i]; const v = Object.assign({}, t.view);
  const hist = t.hist.slice(0, t.hpos + 1).map(x => Object.assign({}, x)); hist[t.hpos] = v;
  state.tabs.splice(i + 1, 0, { view: v, hist, hpos: t.hpos });
  await loadTab(i + 1);
}
function moveTab(from, to) {
  if (from === to || from < 0 || to < 0 || from >= state.tabs.length || to >= state.tabs.length) return;
  syncTab(); const act = state.tabs[state.tab]; const [t] = state.tabs.splice(from, 1); state.tabs.splice(to, 0, t); state.tab = state.tabs.indexOf(act); renderTabs();
}
function tabMenu(i, ev) {
  const n = state.tabs.length;
  const items = [
    { label: 'New tab', icon: 'plus', key: 'Ctrl+T', action: () => newTab() },
    { label: 'Duplicate tab', icon: 'copy', action: () => duplicateTab(i) },
    { sep: true },
    { label: 'Close tab', icon: 'x', key: 'Ctrl+W', action: () => closeTab(i) }
  ];
  if (n > 1) items.push({ label: 'Close other tabs', icon: 'x', action: () => closeTabs(state.tabs.map((t, k) => k).filter(k => k !== i)) });
  if (i < n - 1) items.push({ label: 'Close tabs to the right', icon: 'x', action: () => closeTabs(state.tabs.map((t, k) => k).filter(k => k > i)) });
  items.push({ sep: true }, { label: 'Reopen closed tab', icon: 'refresh', key: 'Ctrl+Shift+T', action: reopenClosedTab });
  openMenu(ev.clientX, ev.clientY, items);
}
function bindTabs() {
  const bar = $('#tabbar'); let dragI = null;
  bar.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) return newTab();
    const t = e.target.closest('.tab'); if (!t) return;
    if (e.target.closest('[data-x]')) return closeTab(+t.dataset.i);
    switchTab(+t.dataset.i);
  });
  bar.addEventListener('auxclick', (e) => { if (e.button !== 1) return; const t = e.target.closest('.tab'); if (t) { e.preventDefault(); closeTab(+t.dataset.i); } else if (e.target === bar) newTab(); });
  bar.addEventListener('dblclick', (e) => { if (e.target === bar) newTab(); });
  bar.addEventListener('contextmenu', (e) => { e.preventDefault(); const t = e.target.closest('.tab'); if (t) tabMenu(+t.dataset.i, e); else openMenu(e.clientX, e.clientY, [{ label: 'New tab', icon: 'plus', key: 'Ctrl+T', action: () => newTab() }, { label: 'Reopen closed tab', icon: 'refresh', key: 'Ctrl+Shift+T', action: reopenClosedTab }]); });
  bar.addEventListener('wheel', (e) => { if (e.deltaY && bar.scrollWidth > bar.clientWidth) { bar.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  bar.addEventListener('dragstart', (e) => { const t = e.target.closest('.tab'); if (!t) return; dragI = +t.dataset.i; e.dataTransfer.setData('text/plain', 'tab'); e.dataTransfer.effectAllowed = 'move'; });
  bar.addEventListener('dragover', (e) => { if (dragI === null) return; e.preventDefault(); });
  bar.addEventListener('drop', (e) => { if (dragI === null) return; e.preventDefault(); const t = e.target.closest('.tab'); const to = t ? +t.dataset.i : state.tabs.length - 1; const from = dragI; dragI = null; moveTab(from, to); });
  bar.addEventListener('dragend', () => { dragI = null; });
}
async function createNamed(name) {
  const path = await vault.createPage('', name, { props: {} });
  return path;
}

// ---------------------------------------------------------------- page creation
async function newPage(parentKey = '', title = '') {
  await flush();
  const path = await vault.createPage(parentKey, title || 'Untitled');
  if (parentKey) { const set = new Set(settings.expanded); set.add(parentKey); settings.expanded = [...set]; }
  await open(path, { focusTitle: !title });
  if (title) { const first = $('#view .editor [data-nav]'); first && first.focus(); }
}
async function openDaily(key = vault.todayKey()) {
  const path = vault.dailyPath(key);
  if (!vault.pages.has(path)) {
    const tpl = vault.pages.get('Templates/Daily Note.md');
    const t = templates()['Daily Note'];
    const blocks = tpl ? parsePage(tpl.src).blocks : t.blocks;
    const props = Object.assign({}, t.props, { created: key });
    await vault.saveRaw(path, serializePage(props, blocks));
    vault.dirs.add('Daily');
  }
  await open(path);
}
async function newFromTemplate(tplPath) {
  const tpl = vault.pages.get(tplPath); if (!tpl) return;
  const title = await promptDialog('Name for the new page', tpl.name === 'Daily Note' ? vault.todayKey() : '');
  if (!title) return;
  const path = await vault.createFromTemplateSrc('', title, tpl.src);
  await open(path);
}
// a timeline is just a page (a .md file) holding a Timeline block — make as many as you like
async function newTimelinePage(parentKey = '') {
  await flush();
  const name = await promptDialog('Name your timeline', '', 'e.g. What I learned in 2026, Project Moonlight, Math log'); if (!name) return;
  const blocks = [{ id: 'tl' + Date.now().toString(36), type: 'timeline', text: '', data: timelineData(name) }, { id: 'tp' + Date.now().toString(36), type: 'p', text: '' }];
  const path = await vault.createPage(parentKey, name, { props: { icon: '🗓️', tags: ['timeline'] }, blocks });
  if (parentKey) expandKey(parentKey);
  await open(path);
  toast('Timeline created — add your first entry above');
}
async function duplicatePage(path) { return duplicateKey(vault.keyOf(path)); }
async function toggleFavorite(path) {
  const p = vault.pages.get(path); if (!p) return;
  if (cur && cur.path === path) { await flush(); cur.props.favorite = !(cur.props.favorite === true); cur.dirty = true; await doSave(); }
  else await vault.setProps(path, { favorite: !(p.props.favorite === true) });
  renderTopbar(); renderSidebar();
}
async function deletePage(path) {
  const p = vault.pages.get(path); if (!p) return;
  const kids = [...vault.pages.keys()].filter(k => k.startsWith(vault.keyOf(path) + '/')).length;
  if (!(await confirmDialog(`Move “${p.name}”${kids ? ` and its ${kids} sub-page(s)` : ''} to the vault's .trash folder?`))) return;
  const wasCur = cur && cur.path === path;
  if (wasCur) { clearTimeout(saveTimer); cur.dirty = false; }
  await vault.deletePage(path);
  if (fileClip && fileClip.key === vault.keyOf(path)) fileClip = null;
  toast('Moved to .trash');
  if (wasCur || (cur && cur.path.startsWith(vault.keyOf(path) + '/'))) openView({ type: 'home' }); else { renderSidebar(); }
}
async function renamePageDialog(path) {
  const p = vault.pages.get(path); if (!p) return;
  const t = await promptDialog('Rename page', p.name); if (!t || t === p.name) return;
  await flush();
  const np = await vault.renamePage(path, t);
  retargetTabs((p) => (p === path ? np : p));
  if (cur && cur.path === path) { cur.path = np; state.view.path = np; state.hist[state.hpos] = state.view; const pg = vault.pages.get(np); cur.src = pg.src; $('#view .page-title').textContent = pg.name; }
  renderTopbar(); renderSidebar(); renderRight();
}

// ---------------------------------------------------------------- page view
async function showPage(path, opts = {}) {
  const page = vault.pages.get(path);
  if (!page) { toast('Page not found'); state.view = { type: 'home' }; return showHome(); }
  const { props, blocks } = parsePage(page.src);
  cur = { path, props, dirty: false, src: page.src };
  const view = $('#view'); view.innerHTML = '';
  const tlOnly = blocks.some(x => x.type === 'timeline') && blocks.every(x => x.type === 'timeline' || (x.type === 'p' && !(x.text || '').trim()));
  const wrap = h(`<div class="page ${props.full || tlOnly ? 'full' : ''} ${tlOnly && !opts.source ? 'tlpage' : ''}"></div>`);
  view.appendChild(wrap);
  // expand ancestors in sidebar
  const parts = vault.keyOf(path).split('/'); const ex = new Set(settings.expanded);
  for (let i = 1; i < parts.length; i++) ex.add(parts.slice(0, i).join('/'));
  settings.expanded = [...ex];

  if (opts.source) return showSource(wrap, page);

  const coverEl = h('<div class="cover"></div>');
  const paintCover = () => {
    coverEl.hidden = !cur.props.cover; wrap.classList.toggle('nocover', !cur.props.cover);
    const c = cur.props.cover || '';
    coverEl.className = 'cover ' + (c && !c.includes('/') ? 'cv-' + c : '');
    coverEl.style.backgroundImage = c.includes('/') ? `url("${vault.assetUrl(c)}")` : '';
  };
  coverEl.innerHTML = `<div class="cover-btns"><button class="btn sm" data-cv="change">Change cover</button><button class="btn sm" data-cv="remove">Remove</button></div>`;
  wrap.appendChild(coverEl);
  const inner = h('<div class="page-inner"></div>'); wrap.appendChild(inner);
  const iconEl = h('<div class="page-icon" title="Change icon"></div>'); inner.appendChild(iconEl);
  const paintIcon = () => { iconEl.textContent = cur.props.icon || ''; iconEl.hidden = !cur.props.icon; };
  const ctl = h(`<div class="page-ctl"><button class="btn" data-c="icon">${icon('sparkle', 15)} Add icon</button><button class="btn" data-c="cover">${icon('image', 15)} Add cover</button><button class="btn" data-c="tag">${icon('tag', 15)} Add tag</button><button class="btn" data-c="template">${icon('file', 15)} Template</button></div>`);
  inner.appendChild(ctl);
  const title = h(`<h1 class="page-title" contenteditable="true" spellcheck="false" data-ph="Untitled"></h1>`); title.textContent = page.name; inner.appendChild(title);
  const tagsEl = h('<div class="page-tags"></div>'); inner.appendChild(tagsEl);
  const meta = h('<div class="page-meta"></div>'); inner.appendChild(meta);
  const edHost = h('<div></div>'); inner.appendChild(edHost);
  paintCover(); paintIcon();

  const paintTags = () => {
    const t = Array.isArray(cur.props.tags) ? cur.props.tags : [];
    tagsEl.innerHTML = t.map(x => `<span class="tagchip" data-tag="${escHtml(x)}">#${escHtml(x)}<span class="x" data-rm="${escHtml(x)}">×</span></span>`).join('');
    ctl.querySelector('[data-c=icon]').hidden = !!cur.props.icon; ctl.querySelector('[data-c=cover]').hidden = !!cur.props.cover;
  };
  const paintMeta = () => { const p = vault.pages.get(cur.path) || page; meta.innerHTML = `<span>Created ${escHtml(String(cur.props.created || fmtDate(p.mtime)))}</span><span>Edited ${ago(p.mtime)}</span><span>${p.words} words</span>`; };
  paintTags(); paintMeta(); cur.onSaved = paintMeta;
  const mutate = async () => { cur.dirty = true; await doSave(); renderTopbar(); renderRight(); paintMeta(); };

  iconEl.onclick = () => { const r = iconEl.getBoundingClientRect(); emojiPicker(r.left, r.bottom + 6, (e) => { cur.props.icon = e; paintIcon(); paintTags(); mutate(); renderSidebar(); }); };
  ctl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return; const k = b.dataset.c; const r = b.getBoundingClientRect();
    if (k === 'icon') emojiPicker(r.left, r.bottom + 6, (e) => { cur.props.icon = e; paintIcon(); paintTags(); mutate(); renderSidebar(); });
    else if (k === 'cover') { cur.props.cover = 'auto'; paintCover(); paintTags(); mutate(); }
    else if (k === 'tag') { const t = await promptDialog('Add a tag', '', 'study, finance, idea…'); if (t) { cur.props.tags = [...new Set([...(cur.props.tags || []), ...t.split(/[ ,]+/).map(x => x.replace(/^#/, '')).filter(Boolean)])]; paintTags(); mutate(); } }
    else if (k === 'template') ctx.pickTemplate((bl) => { if (bl) { editor.blocks.push(...bl); editor.changed(true); editor.render(); } });
  });
  tagsEl.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); cur.props.tags = cur.props.tags.filter(x => x !== rm.dataset.rm); paintTags(); mutate(); return; } const t = e.target.closest('[data-tag]'); if (t) openView({ type: 'tag', tag: t.dataset.tag }); });
  coverEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cv]'); if (!b) return;
    if (b.dataset.cv === 'remove') { cur.props.cover = ''; paintCover(); paintTags(); mutate(); return; }
    const r = b.getBoundingClientRect();
    const items = COVERS.map(c => ({ html: `<span style="display:inline-block;width:46px;height:18px;border-radius:6px;vertical-align:middle;margin-right:8px" class="cv-${c}"></span>${COVER_NAMES[c] || c}`, action: () => { cur.props.cover = c; paintCover(); mutate(); } }));
    items.push({ sep: true }, { label: 'Upload image…', icon: 'upload', action: () => { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.onchange = async () => { if (f.files[0]) { cur.props.cover = await vault.saveImage(f.files[0]); paintCover(); mutate(); } }; f.click(); } });
    openMenu(r.left - 100, r.bottom + 4, items);
  });

  // title editing
  const commitTitle = async () => {
    const t = title.textContent.replace(/\s+/g, ' ').trim();
    const p = vault.pages.get(cur.path);
    if (!t) { title.textContent = p.name; return; }
    if (t === p.name) return;
    await flush();
    const np = await vault.renamePage(cur.path, t);
    retargetTabs((p) => (p === cur.path ? np : p));
    cur.path = np; state.view.path = np; state.hist[state.hpos] = state.view; cur.src = vault.pages.get(np).src;
    title.textContent = vault.pages.get(np).name; renderTopbar(); renderSidebar(); renderRight();
  };
  title.addEventListener('blur', commitTitle);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); const f = edHost.querySelector('[data-nav]'); f && placeCaretEnd(f); } });
  title.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\n/g, ' ')); });

  editor = new Editor(edHost, blocks, {
    ctx, onChange: () => { cur.dirty = true; setStatus('Editing…'); scheduleSave(); }
  });
  attachToolbar(editor);
  // click on empty space under editor focuses the end
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target === inner) { const last = editor.blocks[editor.blocks.length - 1]; if (last.type !== 'p' || last.text) { editor.blocks.push(mk('p')); editor.render(); } editor.focusBlock(editor.blocks[editor.blocks.length - 1], 'end'); } });
  if (opts.focusTitle) { title.focus(); const r = document.createRange(); r.selectNodeContents(title); getSelection().removeAllRanges(); getSelection().addRange(r); }
  if (opts.heading) setTimeout(() => scrollToHeading(opts.heading), 50);
  view.onscroll = () => $('#topbar').classList.toggle('scrolled', view.scrollTop > 40);
}
function scrollToHeading(text) {
  if (!editor) return;
  const t = text.toLowerCase();
  const b = editor.blocks.find(x => /^h[123]$/.test(x.type) && x.text.replace(/[*_`~=]/g, '').toLowerCase() === t);
  if (b) { const el = $(`#view [data-id="${b.id}"]`); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

function showSource(wrap, page) {
  const inner = h(`<div class="page-inner" style="padding-top:24px"><div class="muted" style="margin-bottom:8px">Markdown source — this is exactly the file saved in your vault. Press Ctrl+/ to go back.</div><textarea class="source-ta" spellcheck="false"></textarea></div>`);
  wrap.appendChild(inner);
  const ta = inner.querySelector('textarea'); ta.value = page.src;
  const save = debounce(async () => { await vault.saveRaw(cur.path, ta.value); cur.src = ta.value; setStatus('Saved ✓'); renderRight(); }, 600);
  ta.addEventListener('input', () => { setStatus('Editing…'); save(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } });
  cur.source = true; cur.saveSrc = save;
}
async function toggleSource() {
  if (state.view.type !== 'page') return;
  const wantSource = !state.view.source;
  if (cur && cur.saveSrc) cur.saveSrc.flush && 0;
  await flush();
  const v = { type: 'page', path: cur.path, source: wantSource };
  state.hist[state.hpos] = v; await openView(v, false);
}

// ---------------------------------------------------------------- sidebar
const sidebar = () => $('#sidebar');
let sbScroll = 0;
function renderSidebar() {
  renderTabs();                       // titles change when pages are renamed
  const sb = sidebar(); if (!sb) return;
  const keep = sb.querySelector('.sb-scroll'); if (keep) sbScroll = keep.scrollTop;
  const active = state.view.type === 'page' && cur ? cur.path : null;
  const favs = [...vault.pages.values()].filter(p => p.props.favorite === true).sort((a, b) => a.name.localeCompare(b.name));
  const nav = (id, ic, label, on) => `<button class="nav-item ${on ? 'active' : ''}" data-nav="${id}">${icon(ic, 17)}<span>${label}</span></button>`;
  sb.innerHTML = `
    <div class="sb-head"><div class="sb-logo" title="Home" data-nav="home">${logoHTML(settings.theme)}</div><div class="sb-title">Jimmy Notes<small>${vault.pages.size} pages</small></div><button class="iconbtn" data-act="collapse" title="Hide sidebar (Ctrl+\\)">${icon('panel', 17)}</button></div>
    <button class="sb-search" data-act="search">${icon('search', 16)}<span>Search or jump…</span><kbd>Ctrl K</kbd></button>
    <div class="sb-scroll">
      ${nav('home', 'home', 'Home', state.view.type === 'home')}${nav('daily', 'sun', 'Today’s note', false)}${nav('study', 'timer', 'Study timer', state.view.type === 'study')}${nav('calendar', 'calendar', 'Calendar', state.view.type === 'calendar')}${nav('tags', 'tag', 'Tags', state.view.type === 'tags' || state.view.type === 'tag')}${nav('trash', 'trash', 'Trash', state.view.type === 'trash')}
      ${favs.length ? `<div class="sb-sec">Favorites</div>${favs.map(p => `<div class="tn-row ${active === p.path ? 'active' : ''}" data-open="${escHtml(p.path)}"><span class="tn-caret leaf">${icon('chevron', 14)}</span><span class="tn-icon">${escHtml(p.props.icon || '📄')}</span><span class="tn-name">${escHtml(p.name)}</span></div>`).join('')}` : ''}
      <div class="sb-sec"><span class="grow">Pages</span><button class="iconbtn" data-act="newtimeline" title="New timeline (log what you learn / make)">${icon('calendar', 15)}</button><button class="iconbtn" data-act="addpdf" title="Add a PDF / paper (you can also drag PDFs here)">${icon('upload', 15)}</button><button class="iconbtn" data-act="newfolder" title="New folder">${icon('folder', 15)}</button><button class="iconbtn" data-act="newroot" title="New page">${icon('plus', 15)}</button></div>
      <div class="tree" data-root></div><div class="tree-hint">Right-click empty space for New folder / Paste</div>
    </div>
    <div class="sb-foot"><button class="newpage" data-act="new">${icon('plus', 17)} New page</button><button class="iconbtn" data-act="mode" title="Light / dark">${icon(document.documentElement.dataset.mode === 'dark' ? 'sun' : 'moon', 18)}</button><button class="iconbtn" data-act="settings" title="Settings">${icon('settings', 18)}</button></div>`;
  if (study.isRunning()) { const sn = sb.querySelector('[data-nav=study]'); if (sn) sn.insertAdjacentHTML('beforeend', '<span class="live"></span>'); }
  const treeEl = sb.querySelector('[data-root]');
  const ex = new Set(settings.expanded);
  const build = (nodes, parent) => {
    nodes.forEach((n) => {
      const open = ex.has(n.key); const hasKids = n.children.length > 0;
      const p = n.page;
      if (n.kind === 'doc') { const dr = h(`<div class="tn-row doc ${active === null && state.view.type === 'doc' && state.view.path === n.key ? 'active' : ''}" data-doc="${escHtml(n.key)}"><span class="tn-caret leaf">${icon('chevron', 14)}</span><span class="tn-icon">📕</span><span class="tn-name">${escHtml(n.name)}</span><span class="tn-acts"><button class="iconbtn" data-docmore title="More">${icon('more', 14)}</button></span></div>`); parent.appendChild(dr); return; }
      const row = h(`<div class="tn-row ${active && n.path === active ? 'active' : ''} ${sbSel === n.key ? 'sel' : ''} ${fileClip && fileClip.mode === 'cut' && fileClip.key === n.key ? 'cut' : ''}" data-key="${escHtml(n.key)}" ${n.path ? `data-path="${escHtml(n.path)}"` : ''} draggable="true">
        <span class="tn-caret ${hasKids ? (open ? 'open' : '') : 'leaf'}" data-caret>${icon('chevron', 14)}</span><span class="tn-icon">${n.kind === 'folder' ? '📁' : escHtml(p.props.icon || '📄')}</span>
        <span class="tn-name ${n.kind === 'folder' ? 'folder' : ''}">${escHtml(n.name)}</span>
        <span class="tn-acts"><button class="iconbtn" data-add title="${n.kind === 'folder' ? 'New page in this folder' : 'Add sub-page'}">${icon('plus', 14)}</button><button class="iconbtn" data-more title="More">${icon('more', 14)}</button></span></div>`);
      parent.appendChild(row);
      if (hasKids && open) { const kids = h('<div class="tn-kids"></div>'); parent.appendChild(kids); build(n.children, kids); }
    });
  };
  build(vault.buildTree().filter(n => n.key !== 'Templates' || true), treeEl);
  const scroller = sb.querySelector('.sb-scroll'); scroller.scrollTop = sbScroll;
}
// ---- sidebar state: current selection, "mouse is in the sidebar" (so Ctrl+C/V mean files, not text), file clipboard
let sbSel = '', sbFocus = false, fileClip = null;
const parentOf = (key) => (key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '');
const nameOfKey = (key) => key.replace(/^.*\//, '');
const isFolderKey = (key) => !vault.pages.has(key + '.md') && vault.dirs.has(key);
const persistSettings = () => { try { localStorage.setItem('jn.settings', JSON.stringify(settings)); } catch (e) { /* */ } };
const expandKey = (k) => { if (!k) return; const s = new Set(settings.expanded); s.add(k); settings.expanded = [...s]; };
// keep the open page, expanded folders and selection pointing at the right place after a move / rename
function retargetTabs(fn) {
  syncTab();
  state.tabs.forEach((t) => { const seen = new Set([t.view, ...t.hist]); seen.forEach((v) => { if (v && v.type === 'page') v.path = fn(v.path); if (v && v.focus) v.focus = fn(v.focus); }); });
}
function remapKeys(oldKey, newKey) {
  retargetTabs((p) => (p === oldKey + '.md' || p.startsWith(oldKey + '/') ? newKey + p.slice(oldKey.length) : p));
  if (cur && (cur.path === oldKey + '.md' || cur.path.startsWith(oldKey + '/'))) { const np = newKey + cur.path.slice(oldKey.length); cur.path = np; state.view.path = np; state.hist[state.hpos] = state.view; }
  settings.expanded = settings.expanded.map(k => (k === oldKey || k.startsWith(oldKey + '/') ? newKey + k.slice(oldKey.length) : k));
  if (sbSel === oldKey || sbSel.startsWith(oldKey + '/')) sbSel = newKey + sbSel.slice(oldKey.length);
}

async function newFolder(parentKey = '') {
  const name = await promptDialog(parentKey ? `New folder inside “${nameOfKey(parentKey)}”` : 'New folder', '', 'e.g. School, Money, Ideas'); if (!name) return;
  await flush();
  const key = await vault.createFolder(parentKey, name);
  expandKey(parentKey); sbSel = key; sbFocus = true; persistSettings(); renderSidebar();
  toast(`Folder “${nameOfKey(key)}” created — drag pages into it, or right-click it`);
}
function copyKeyToClip(key, mode) {
  fileClip = { key, mode };
  const p = vault.pages.get(key + '.md');
  if (mode === 'copy' && p) { try { navigator.clipboard.writeText('[[' + p.name + ']]').catch(() => {}); } catch (e) { /* */ } }
  renderSidebar();
  toast(`${mode === 'cut' ? 'Cut' : 'Copied'} “${nameOfKey(key)}” — right-click where you want it and choose Paste (or press Ctrl+V)`, 3200);
}
async function pasteClip(parentKey) {
  if (!fileClip) return toast('Nothing to paste yet — copy or cut a page or folder first');
  if (!vault.pages.has(fileClip.key + '.md') && !vault.dirs.has(fileClip.key)) { fileClip = null; renderSidebar(); return toast('That item no longer exists'); }
  await flush();
  const { key, mode } = fileClip;
  if (mode === 'cut') {
    const nk = await vault.moveKey(key, parentKey);
    if (nk === key) return toast(parentOf(key) === (parentKey || '') ? 'It is already in that place' : 'A folder can’t be moved into itself');
    remapKeys(key, nk); fileClip = null; sbSel = nk; toast('Moved');
  } else {
    const nk = await vault.copyKey(key, parentKey); sbSel = nk; toast('Pasted');
  }
  expandKey(parentKey); persistSettings(); renderSidebar(); renderTopbar(); renderRight();
}
async function duplicateKey(key) {
  await flush();
  const nk = await vault.copyKey(key, parentOf(key)); sbSel = nk; renderSidebar(); toast('Duplicated');
  if (vault.pages.has(nk + '.md')) open(nk + '.md');
}
async function renameKey(key) {
  if (vault.pages.has(key + '.md')) return renamePageDialog(key + '.md');
  const old = nameOfKey(key);
  const t = await promptDialog('Rename folder', old); if (!t || t === old) return;
  await flush();
  const nk = await vault.renameFolder(key, t); remapKeys(key, nk); persistSettings(); renderSidebar(); renderTopbar(); renderRight();
}
async function deleteKey(key) {
  if (vault.pages.has(key + '.md')) return deletePage(key + '.md');
  const n = vault.countUnder(key);
  if (!(await confirmDialog(`Move the folder “${nameOfKey(key)}”${n ? ` and its ${n} page(s)` : ''} to the vault's .trash folder? You can restore it from Trash.`))) return;
  const inside = cur && cur.path.startsWith(key + '/');
  if (inside) { clearTimeout(saveTimer); cur.dirty = false; }
  await vault.deleteKey(key);
  if (fileClip && (fileClip.key === key || fileClip.key.startsWith(key + '/'))) fileClip = null;
  if (sbSel === key) sbSel = '';
  toast('Moved to .trash');
  if (inside) openView({ type: 'home' }); else renderSidebar();
}
async function importDropped(files, parentKey) {
  let n = 0, last = '';
  for (const f of files) {
    const ext = f.name.split('.').pop(), name = f.name.replace(/\.[^.]+$/, '');
    last = await vault.createPage(parentKey, name, { blocks: toBlocks(name, ext, await f.text()), props: { tags: ['imported'] } }); n++;
  }
  expandKey(parentKey); persistSettings(); renderSidebar(); toast(`Imported ${n} file${n > 1 ? 's' : ''}`);
  if (n === 1 && last) open(last);
}

// Ctrl+C / X / V / D, F2, Delete, arrows while the sidebar has the focus
function sidebarKey(e) {
  if (!sbFocus) return false;
  if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return false;
  if (document.querySelector('#overlay .modal, body > .menu')) return false;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  const sel = sbSel && (vault.pages.has(sbSel + '.md') || vault.dirs.has(sbSel)) ? sbSel : '';
  if (mod && !e.shiftKey && k === 'c' && sel) copyKeyToClip(sel, 'copy');
  else if (mod && !e.shiftKey && k === 'x' && sel) copyKeyToClip(sel, 'cut');
  else if (mod && !e.shiftKey && k === 'v') pasteClip(sel ? (isFolderKey(sel) ? sel : parentOf(sel)) : '');
  else if (mod && !e.shiftKey && k === 'd' && sel) duplicateKey(sel);
  else if (e.key === 'F2' && sel) renameKey(sel);
  else if (e.key === 'Delete' && sel) deleteKey(sel);
  else if (e.key === 'Enter' && sel) { vault.pages.has(sel + '.md') ? open(sel + '.md') : toggleExpand(sel); }
  else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && sel) moveSibling(sel, e.key === 'ArrowDown' ? 1 : -1);
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const rows = [...sidebar().querySelectorAll('.tree .tn-row[data-key]')]; if (!rows.length) return false;
    let i = rows.findIndex(r => r.dataset.key === sel); i = i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    sbSel = rows[i].dataset.key; rows.forEach(r => r.classList.toggle('sel', r === rows[i])); rows[i].scrollIntoView({ block: 'nearest' });
  } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && sel) {
    const isOpen = settings.expanded.includes(sel);
    if (e.key === 'ArrowRight' && !isOpen) toggleExpand(sel); else if (e.key === 'ArrowLeft') { if (isOpen) toggleExpand(sel); else if (parentOf(sel)) { sbSel = parentOf(sel); renderSidebar(); } }
  } else return false;
  e.preventDefault(); return true;
}

// put `src` right before / after `target` (moving it into target's folder first if it lives somewhere else)
async function reorderKey(src, target, before) {
  if (src === target || target.startsWith(src + '/')) return toast('A folder can’t be moved into itself');
  await flush();
  const tp = parentOf(target);
  let nk = src;
  if (parentOf(src) !== tp) { nk = await vault.moveKey(src, tp); if (nk !== src) { remapKeys(src, nk); expandKey(tp); } }
  const sibs = vault.childKeys(tp).filter(k => k !== nk);
  const i = sibs.indexOf(target); sibs.splice(i < 0 ? sibs.length : (before ? i : i + 1), 0, nk);
  vault.setChildOrder(tp, sibs);
  sbSel = nk; persistSettings(); renderSidebar(); renderTopbar(); renderRight();
}
// Alt+↑ / Alt+↓ and the menu: move one step among the items next to it
function moveSibling(key, d) {
  const p = parentOf(key); const sibs = vault.childKeys(p); const i = sibs.indexOf(key), j = i + d;
  if (i < 0 || j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  vault.setChildOrder(p, sibs); renderSidebar();
  const r = sidebar().querySelector('.tn-row.sel'); if (r) r.scrollIntoView({ block: 'nearest' });
}
function bindSidebar() {
  const sb = sidebar();
  document.addEventListener('mousedown', (e) => { sbFocus = !!(e.target.closest && e.target.closest('#sidebar')); }, true);
  sb.addEventListener('click', (e) => {
    const t = e.target;
    const rowEl = t.closest('.tn-row[data-key]'); if (rowEl) sbSel = rowEl.dataset.key;
    const caret = t.closest('[data-caret]');
    if (caret) { e.stopPropagation(); const key = caret.closest('.tn-row').dataset.key; toggleExpand(key); return; }
    const add = t.closest('[data-add]'); if (add) { e.stopPropagation(); return newPage(add.closest('.tn-row').dataset.key); }
    const dm = t.closest('[data-docmore]'); if (dm) { e.stopPropagation(); const r = dm.getBoundingClientRect(); return docMenu(app, dm.closest('.tn-row').dataset.doc, r.left, r.bottom + 4); }
    const docRow = t.closest('.tn-row[data-doc]'); if (docRow) { if (e.ctrlKey || e.metaKey) { newTabFn().then(() => open(docRow.dataset.doc)); return; } return open(docRow.dataset.doc); }
    const more = t.closest('[data-more]'); if (more) { e.stopPropagation(); return treeMenu(more.closest('.tn-row'), more); }
    const nav = t.closest('[data-nav]');
    if (nav) { const k = nav.dataset.nav; return k === 'daily' ? openDaily() : openView({ type: k }); }
    const act = t.closest('[data-act]');
    if (act) return ({ search: () => openPalette(app, 'pages'), new: () => newPage(currentParentKey()), newroot: () => newPage(''), newfolder: () => newFolder(''), newtimeline: () => newTimelinePage(''), addpdf: () => importPdfs(app, ''), settings: () => openSettings(app), collapse: toggleSidebar, mode: toggleMode })[act.dataset.act]();
    const row = t.closest('.tn-row');
    if (row && (e.ctrlKey || e.metaKey) && (row.dataset.path || row.dataset.open)) return openInNewTab(row.dataset.path || row.dataset.open);
    if (row) { if (row.dataset.path) open(row.dataset.path); else if (row.dataset.key) toggleExpand(row.dataset.key); else if (row.dataset.open) open(row.dataset.open); }
    const fav = t.closest('[data-open]'); if (fav) open(fav.dataset.open);
  });
  sb.addEventListener('auxclick', (e) => { if (e.button !== 1) return; const row = e.target.closest('.tn-row'); const p = row && (row.dataset.path || row.dataset.open); if (p) { e.preventDefault(); openInNewTab(p); } });
  // right-click: on a page/folder -> its menu; on empty space -> New page / New folder / Paste
  sb.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.sb-head,.sb-search,.sb-foot,.nav-item')) return;
    e.preventDefault(); sbFocus = true;
    const docRow = e.target.closest('.tn-row[data-doc]'); if (docRow) { docMenu(app, docRow.dataset.doc, e.clientX, e.clientY); return; }
    const row = e.target.closest('.tn-row[data-key],.tn-row[data-open]');
    if (row) { if (row.dataset.key) { sbSel = row.dataset.key; sb.querySelectorAll('.tn-row.sel').forEach(x => x.classList.remove('sel')); row.classList.add('sel'); } treeMenu(row, null, e); }
    else blankMenu(e);
  });
  // drag & drop: move pages and folders, or drop .md/.txt/.html files from Explorer to import them
  let dragKey = null;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  sb.addEventListener('dragstart', (e) => { const row = e.target.closest('.tn-row[data-key]'); if (!row) return; dragKey = row.dataset.key; e.dataTransfer.setData('text/plain', dragKey); e.dataTransfer.effectAllowed = 'move'; });
  const clearDrop = () => sb.querySelectorAll('.dragover,.drop-before,.drop-after').forEach(x => x.classList.remove('dragover', 'drop-before', 'drop-after'));
  // top / bottom edge of a row = put it before / after that row; the middle = put it inside
  sb.addEventListener('dragover', (e) => {
    if (!dragKey && !hasFiles(e)) return; e.preventDefault(); clearDrop();
    const row = e.target.closest('.tn-row[data-key]'); if (!row) return;
    const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height;
    row.classList.add(dragKey && y < 0.28 ? 'drop-before' : dragKey && y > 0.72 ? 'drop-after' : 'dragover');
  });
  sb.addEventListener('dragleave', (e) => { if (!sb.contains(e.relatedTarget)) clearDrop(); });
  sb.addEventListener('drop', async (e) => {
    const row = e.target.closest('.tn-row[data-key]');
    const zone = row ? (row.classList.contains('drop-before') ? 'before' : row.classList.contains('drop-after') ? 'after' : 'into') : 'into';
    clearDrop();
    const targetKey = row ? row.dataset.key : '';
    if (!dragKey) {
      const pdfs = [...(e.dataTransfer.files || [])].filter(f => /\.pdf$/i.test(f.name));
      if (pdfs.length) { e.preventDefault(); const dest = row && !(row.dataset.path) ? targetKey : parentOf(targetKey); const ps = pdfs.map(f => window.api.pathOf(f)).filter(Boolean); if (dest) expandKey(dest); persistSettings(); await importPdfs(app, dest, ps); }
      const files = [...(e.dataTransfer.files || [])].filter(f => /\.(md|markdown|txt|html?)$/i.test(f.name));
      if (files.length) { e.preventDefault(); await importDropped(files, targetKey); }
      return;
    }
    e.preventDefault();
    const src = dragKey; dragKey = null;
    if (row && zone !== 'into') return reorderKey(src, targetKey, zone === 'before');
    await flush();
    const nk = await vault.moveKey(src, targetKey);
    if (nk !== src) { remapKeys(src, nk); expandKey(targetKey); persistSettings(); toast('Moved'); renderSidebar(); renderTopbar(); renderRight(); }
    else if (targetKey === src || targetKey.startsWith(src + '/')) toast('A folder can’t be moved into itself');
  });
  sb.addEventListener('dragend', () => { dragKey = null; });
}
function currentParentKey() { return ''; }
function toggleExpand(key) { const s = new Set(settings.expanded); s.has(key) ? s.delete(key) : s.add(key); settings.expanded = [...s]; try { localStorage.setItem('jn.settings', JSON.stringify(settings)); } catch (e) { /* */ } renderSidebar(); }
function blankMenu(ev) {
  const items = [
    { label: 'New page', icon: 'plus', key: 'Ctrl+N', action: () => newPage('') },
    { label: 'New timeline', icon: 'calendar', action: () => newTimelinePage('') },
    { label: 'New folder', icon: 'folder', action: () => newFolder('') },
    { label: 'Add PDF / paper…', icon: 'upload', action: () => importPdfs(app, '') }
  ];
  if (fileClip) items.push({ label: `Paste “${nameOfKey(fileClip.key)}” here`, icon: 'copy', key: 'Ctrl+V', action: () => pasteClip('') });
  items.push({ sep: true }, { label: 'Import notes…', icon: 'upload', action: () => importNotes() },
    { label: 'Collapse all folders', icon: 'arrowup', action: () => { settings.expanded = []; persistSettings(); renderSidebar(); } },
    { label: 'Open vault folder in Explorer', icon: 'folder', action: () => window.api.vault.reveal() });
  openMenu(ev.clientX, ev.clientY, items);
}
function treeMenu(row, anchor, ev) {
  const key = row.dataset.key || vault.keyOf(row.dataset.open || '');
  const path = vault.pages.has(key + '.md') ? key + '.md' : null;
  const folder = !path;
  const items = [];
  if (path) {
    const p = vault.pages.get(path);
    items.push({ label: 'Open', icon: 'file', action: () => open(path) },
      { label: p.props.favorite === true ? 'Remove from favorites' : 'Add to favorites', icon: 'star', action: () => toggleFavorite(path) },
      { label: 'Change icon', icon: 'sparkle', action: () => { const r = row.getBoundingClientRect(); emojiPicker(r.left + 30, r.bottom, async (e2) => { if (cur && cur.path === path) { cur.props.icon = e2; cur.dirty = true; await doSave(); showPageIcon(); } else await vault.setProps(path, { icon: e2 }); renderSidebar(); }); } },
      { label: 'Copy [[link]]', icon: 'link', action: () => { navigator.clipboard.writeText('[[' + p.name + ']]'); toast('Link copied — paste it into any page'); } },
      { sep: true });
  }
  items.push(
    { label: folder ? 'New page in this folder' : 'New sub-page', icon: 'plus', action: () => newPage(key) },
    { label: 'New folder inside', icon: 'folder', action: () => newFolder(key) },
    { label: 'Add PDF / paper here…', icon: 'upload', action: () => importPdfs(app, folder ? key : parentOf(key)).then(() => { if (folder) { expandKey(key); persistSettings(); renderSidebar(); } }) },
    { label: 'New timeline here', icon: 'calendar', action: () => newTimelinePage(folder ? key : parentOf(key)) },
    { sep: true },
    { label: 'Copy', icon: 'copy', key: 'Ctrl+C', action: () => copyKeyToClip(key, 'copy') },
    { label: 'Cut', icon: 'erase', key: 'Ctrl+X', action: () => copyKeyToClip(key, 'cut') });
  if (fileClip) items.push({ label: `Paste “${nameOfKey(fileClip.key)}” inside`, icon: 'download', key: 'Ctrl+V', action: () => pasteClip(key) });
  items.push({ label: 'Duplicate', icon: 'copy', key: 'Ctrl+D', action: () => duplicateKey(key) },
    { label: 'Rename', icon: 'pen', key: 'F2', action: () => renameKey(key) });
  items.push({ label: 'Move up', icon: 'arrowup', key: 'Alt+↑', action: () => moveSibling(key, -1) }, { label: 'Move down', icon: 'arrowdown', key: 'Alt+↓', action: () => moveSibling(key, 1) });
  if (key.includes('/')) items.push({ label: 'Move to top level', icon: 'arrowup', action: async () => { await flush(); const nk = await vault.moveKey(key, ''); if (nk !== key) { remapKeys(key, nk); persistSettings(); renderSidebar(); renderTopbar(); } } });
  items.push({ sep: true }, { label: folder ? 'Delete folder' : 'Delete', icon: 'trash', danger: true, key: 'Del', action: () => deleteKey(key) });
  if (ev) openMenu(ev.clientX, ev.clientY, items); else menuAt(anchor, items);
}
function showPageIcon() { const el = $('#view .page-icon'); if (el && cur) { el.textContent = cur.props.icon || ''; el.hidden = !cur.props.icon; } }
function toggleSidebar() { settings.sbHidden = !settings.sbHidden; $('#app').classList.toggle('sb-hidden', settings.sbHidden); try { localStorage.setItem('jn.settings', JSON.stringify(settings)); } catch (e) { /* */ } renderTopbar(); }
function toggleMode() { const dark = document.documentElement.dataset.mode === 'dark'; settings.mode = dark ? 'light' : 'dark'; saveSettings(); }
function toggleRight() { settings.rightOpen = !settings.rightOpen; $('#app').classList.toggle('rb-open', settings.rightOpen); renderTopbar(); renderRight(); }

// ---------------------------------------------------------------- topbar
function renderTopbar() {
  const tb = $('#topbar'); if (!tb) return;
  const v = state.view;
  let crumbs = '';
  if (v.type === 'page' && cur) {
    const parts = vault.keyOf(cur.path).split('/');
    crumbs = parts.map((seg, i) => { const key = parts.slice(0, i + 1).join('/'); const pg = vault.pages.get(key + '.md'); const last = i === parts.length - 1; return `<span class="${last ? 'cur' : ''}" ${pg && !last ? `data-open="${escHtml(pg.path)}"` : ''}>${pg && pg.props.icon ? escHtml(pg.props.icon) + ' ' : ''}${escHtml(seg)}</span>`; }).join('<span class="sep">/</span>');
  } else if (v.type === 'doc') crumbs = `<span class="cur">📕 ${escHtml(v.path.replace(/\.pdf$/i, '').replace(/\//g, ' / '))}</span>`;
  else crumbs = `<span class="cur">${{ home: 'Home', calendar: 'Calendar', study: 'Study timer', trash: 'Trash', tags: 'Tags', tag: '#' + escHtml(v.tag || '') }[v.type] || ''}</span>`;
  const fav = v.type === 'page' && cur && vault.pages.get(cur.path) && vault.pages.get(cur.path).props.favorite === true;
  tb.innerHTML = `${settings.sbHidden ? `<button class="iconbtn" data-t="sb" title="Show sidebar (Ctrl+\\)">${icon('panel', 18)}</button>` : ''}
    <button class="iconbtn" data-t="back" title="Back (Alt+←)" ${state.hpos <= 0 ? 'style="opacity:.35"' : ''}>${icon('back', 18)}</button><button class="iconbtn" data-t="fwd" title="Forward (Alt+→)" ${state.hpos >= state.hist.length - 1 ? 'style="opacity:.35"' : ''}>${icon('forward', 18)}</button>
    <div class="crumbs">${crumbs}</div><button class="study-pill" data-t="study" title="Open study timer" hidden></button><span class="saved"></span>
    ${v.type === 'page' ? `<button class="iconbtn ${fav ? 'on' : ''}" data-t="fav" title="Favorite">${icon('star', 18)}</button><button class="iconbtn ${v.source ? 'on' : ''}" data-t="src" title="Markdown source (Ctrl+/)">${icon('code', 18)}</button>` : ''}
    <button class="iconbtn ai-btn ${aiOpen() ? 'on' : ''}" data-t="ai" title="AI assistant (Ctrl+J)">${icon('sparkle', 18)}</button>
    <button class="iconbtn ${settings.rightOpen ? 'on' : ''}" data-t="right" title="Outline & backlinks">${icon('link', 18)}</button>
    ${v.type === 'page' ? `<button class="iconbtn" data-t="more" title="More">${icon('more', 18)}</button>` : ''}`;
}
function bindTopbar() {
  $('#topbar').addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]'); if (o) return open(o.dataset.open);
    const b = e.target.closest('[data-t]'); if (!b) return;
    const k = b.dataset.t;
    if (k === 'sb') toggleSidebar(); else if (k === 'back') navStep(-1); else if (k === 'fwd') navStep(1);
    else if (k === 'ai') { toggleAssistant(); renderTopbar(); }
    else if (k === 'study') openView({ type: 'study' });
    else if (k === 'fav') toggleFavorite(cur.path); else if (k === 'src') toggleSource(); else if (k === 'right') toggleRight();
    else if (k === 'more') pageMenu(b);
  });
}
function pageMenu(anchor) {
  if (!cur) return;
  const p = vault.pages.get(cur.path);
  menuAt(anchor, [
    { label: 'Full width', icon: 'layout', action: async () => { cur.props.full = !cur.props.full; cur.dirty = true; await doSave(); $('#view .page').classList.toggle('full', !!cur.props.full); } },
    { label: 'Focus mode', icon: 'focus', action: () => $('#app').classList.toggle('focus') },
    { label: 'Open in new tab', icon: 'file', action: () => openInNewTab(cur.path) },
    { label: 'Rename…', icon: 'pen', action: () => renamePageDialog(cur.path) },
    { label: 'Duplicate', icon: 'copy', action: () => duplicatePage(cur.path) },
    { label: 'Find & replace…', icon: 'search', key: 'Ctrl+H', action: () => openFind(true) },
    { label: 'Version history…', icon: 'timer', action: showHistory },
    { sep: true }, { label: 'Export as PDF…', icon: 'download', action: exportPdf },
    { label: 'Export as Markdown…', icon: 'download', action: async () => { await flush(); const r = await window.api.exportFile(p.name, vault.pages.get(cur.path).src, 'md'); if (r) toast('Saved ' + r); } },
    { label: 'Copy Markdown', icon: 'copy', action: async () => { await flush(); navigator.clipboard.writeText(vault.pages.get(cur.path).src); toast('Copied Markdown'); } },
    { label: 'Show in folder', icon: 'folder', action: () => window.api.vault.reveal() },
    { sep: true }, { label: 'Delete page', icon: 'trash', danger: true, action: () => deletePage(cur.path) }
  ]);
}
function showHistory() {
  if (!cur) return;
  const path = cur.path;
  openHistory(path, { flush, onRestored: async () => { await vault.reload(); await openView(state.view, false); } });
}
async function exportPdf() {
  await flush();
  const prev = document.documentElement.dataset.mode;
  const r = await window.api.exportPdf(cur ? vault.pages.get(cur.path).name : 'page');
  if (r) toast('Saved PDF');
}

// ---------------------------------------------------------------- right panel
const renderRightSoon = debounce(() => renderRight(), 250);
function renderRight() {
  const rb = $('#rightbar'); if (!rb) return;
  if (!settings.rightOpen) { rb.innerHTML = ''; return; }
  if (state.view.type !== 'page' || !cur) { rb.innerHTML = '<div class="rb-sec"><div class="muted">Open a page to see its outline, backlinks and info.</div></div>'; return; }
  const page = vault.pages.get(cur.path); if (!page) return;
  const hs = editor ? headings(editor.blocks) : [];
  const back = vault.backlinks(cur.path), unl = vault.unlinkedMentions(cur.path);
  const out = page.links.map(l => ({ name: l, page: vault.resolve(l) }));
  const item = (p, sub) => `<button class="rb-item" data-open="${escHtml(p.path)}">${escHtml(p.props.icon || '📄')} ${escHtml(p.name)}<small>${escHtml(sub || '')}</small></button>`;
  rb.innerHTML = `
    <div class="rb-sec"><h4>${icon('list', 14)} Outline</h4>${hs.length ? hs.map(x => `<button class="outline-item l${x.level}" data-h="${x.id}">${escHtml(x.text) || '…'}</button>`).join('') : '<div class="muted" style="font-size:13px">Add headings to see an outline.</div>'}</div>
    <div class="rb-sec"><h4>${icon('link', 14)} Backlinks <span class="chip">${back.length}</span></h4>${back.map(p => item(p, p.text.slice(0, 80))).join('') || '<div class="muted" style="font-size:13px">No page links here yet. Type [[' + escHtml(page.name) + ']] elsewhere.</div>'}</div>
    ${unl.length ? `<div class="rb-sec"><h4>Unlinked mentions <span class="chip">${unl.length}</span></h4>${unl.slice(0, 8).map(p => item(p, 'mentions “' + page.name + '”')).join('')}</div>` : ''}
    <div class="rb-sec"><h4>${icon('forward', 14)} Outgoing links <span class="chip">${out.length}</span></h4>${out.map(o => o.page ? item(o.page) : `<button class="rb-item" data-create="${escHtml(o.name)}" style="color:var(--accent2)">+ ${escHtml(o.name)}<small>not created yet</small></button>`).join('') || '<div class="muted" style="font-size:13px">No links in this page.</div>'}</div>
    <div class="rb-sec"><h4>${icon('tag', 14)} Tags</h4>${page.tags.map(t => `<span class="tagchip" data-tag="${escHtml(t)}">#${escHtml(t)}</span>`).join('') || '<span class="muted" style="font-size:13px">No tags.</span>'}</div>
    <div class="rb-sec"><h4>Info</h4><div class="muted" style="font-size:13px;line-height:1.7">${page.words} words · ${page.text.length} chars<br>Edited ${ago(page.mtime)}<br><span style="word-break:break-all">${escHtml(page.path)}</span></div></div>`;
}
function bindRight() {
  $('#rightbar').addEventListener('click', async (e) => {
    const o = e.target.closest('[data-open]'); if (o) return open(o.dataset.open);
    const c = e.target.closest('[data-create]'); if (c) { const pth = await createNamed(c.dataset.create); return open(pth); }
    const t = e.target.closest('[data-tag]'); if (t) return openView({ type: 'tag', tag: t.dataset.tag });
    const hd = e.target.closest('[data-h]'); if (hd) { const el = $(`#view [data-id="${hd.dataset.h}"]`); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  });
}

// ---------------------------------------------------------------- mascot
let bubbleTimer = null;
function bindMascot() {
  $('#mascot-corner').addEventListener('click', () => {
    const lines = MASCOT_LINES[settings.theme] || MASCOT_LINES.basic;
    const mc = $('#mascot-wrap'); mc.querySelectorAll('.bubble').forEach(b => b.remove());
    const b = h(`<div class="bubble">${escHtml(lines[Math.floor(Math.random() * lines.length)])}</div>`); mc.appendChild(b);
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.remove(), 4200);
  });
}

// ---------------------------------------------------------------- commands + shortcuts
function commands() {
  const c = [
    { name: 'New page', icon: 'plus', key: 'Ctrl+N', run: () => newPage('') },
    { name: 'Open today’s daily note', icon: 'sun', key: 'Alt+D', run: () => openDaily() },
    { name: 'Go home', icon: 'home', run: () => openView({ type: 'home' }) },
    { name: 'Open calendar', icon: 'calendar', run: () => openView({ type: 'calendar' }) },
    { name: 'Open study timer', icon: 'timer', run: () => openView({ type: 'study' }) },
    { name: 'Open trash', icon: 'trash', run: () => openView({ type: 'trash' }) },
    { name: 'Find in page', icon: 'search', key: 'Ctrl+F', run: () => openFind() },
    { name: 'Study timer: start / stop', icon: 'timer', key: 'Alt+S', run: () => study.toggle() },
    { name: 'Study timer: focus mode', icon: 'focus', run: () => study.openFocus(app) },
    { name: 'Browse tags', icon: 'tag', run: () => openView({ type: 'tags' }) },
    { name: 'Search all notes', icon: 'search', key: 'Ctrl+Shift+F', run: () => openSearch(app) },
    { name: 'Toggle sidebar', icon: 'panel', key: 'Ctrl+\\', run: toggleSidebar },
    { name: 'Toggle outline / backlinks panel', icon: 'link', run: toggleRight },
    { name: 'Toggle light / dark mode', icon: 'moon', run: toggleMode },
    { name: 'Theme: Default (Notey)', icon: 'sparkle', run: () => { settings.theme = 'basic'; saveSettings(); } },
    ...(HAS_ART ? [
      { name: 'Theme: Psyduck', icon: 'sparkle', run: () => { settings.theme = 'psyduck'; saveSettings(); } },
      { name: 'Theme: 야돈 (Slowpoke)', icon: 'sparkle', run: () => { settings.theme = 'yadon'; saveSettings(); } },
      { name: 'Theme: 고라파덕 & 야돈 (together)', icon: 'sparkle', run: () => { settings.theme = 'duo'; saveSettings(); } }
    ] : []),
    { name: 'Toggle mascot buddy', icon: 'star', run: () => { settings.mascot = !settings.mascot; saveSettings(); } },
    { name: 'Settings', icon: 'settings', run: () => openSettings(app) },
    { name: 'New page from template…', icon: 'file', run: () => pickTemplate(app, async (bl) => { const t = await promptDialog('Page title'); if (!t) return; const pth = await vault.createPage('', t, { blocks: bl }); open(pth); }) },
    { name: 'Import notes (Markdown / text / HTML from Google Docs)…', icon: 'upload', run: importNotes },
    { name: 'Open vault folder', icon: 'folder', run: () => window.api.vault.reveal() },
    { name: 'Reload vault from disk', icon: 'refresh', run: async () => { await vault.reload(); refresh(); toast('Reloaded'); } },
    { name: 'AI assistant (Qwen, local)', icon: 'sparkle', key: 'Ctrl+J', run: () => { toggleAssistant(); renderTopbar(); } },
    { name: 'Customize the AI assistant', icon: 'settings', run: () => openAiSettings() },
    { name: 'Page version history', icon: 'timer', run: () => showHistory() },
    { name: 'Find & replace in page', icon: 'search', key: 'Ctrl+H', run: () => openFind(true) },
    { name: 'Help: how to use Jimmy Notes', icon: 'sparkle', run: () => showHelp() },
    { name: 'New timeline', icon: 'calendar', run: () => newTimelinePage('') },
    { name: 'New tab', icon: 'plus', key: 'Ctrl+T', run: () => newTab() },
    { name: 'Close tab', icon: 'x', key: 'Ctrl+W', run: () => closeTab(state.tab) },
    { name: 'Reopen closed tab', icon: 'refresh', key: 'Ctrl+Shift+T', run: reopenClosedTab },
    { name: 'Next tab', icon: 'forward', key: 'Ctrl+Tab', run: () => switchTab((state.tab + 1) % state.tabs.length) },
    { name: 'Previous tab', icon: 'back', key: 'Ctrl+Shift+Tab', run: () => switchTab((state.tab - 1 + state.tabs.length) % state.tabs.length) },
    { name: 'Open this page in a new tab', icon: 'file', run: () => { if (cur) openInNewTab(cur.path); } },
    { name: 'Back', icon: 'back', key: 'Alt+←', run: () => navStep(-1) },
    { name: 'Forward', icon: 'forward', key: 'Alt+→', run: () => navStep(1) }
  ];
  if (state.view.type === 'page') c.push(
    { name: 'Toggle favorite', icon: 'star', run: () => toggleFavorite(cur.path) },
    { name: 'Toggle Markdown source mode', icon: 'code', key: 'Ctrl+/', run: toggleSource },
    { name: 'Focus mode', icon: 'focus', run: () => $('#app').classList.toggle('focus') },
    { name: 'Export page as PDF', icon: 'download', run: exportPdf },
    { name: 'Rename page', icon: 'pen', run: () => renamePageDialog(cur.path) },
    { name: 'Delete page', icon: 'trash', run: () => deletePage(cur.path) },
    { name: 'Insert template into page', icon: 'file', run: () => ctx.pickTemplate((bl) => { if (bl && editor) { editor.blocks.push(...bl); editor.changed(true); editor.render(); } }) });
  return c;
}
document.addEventListener('keydown', (e) => {
  if (sidebarKey(e)) return;
  const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
  if (mod && !e.altKey && !document.querySelector('.modal, #palette')) {
    if (k === 't' && !e.shiftKey) { e.preventDefault(); return void newTab(); }
    if (k === 't' && e.shiftKey) { e.preventDefault(); return void reopenClosedTab(); }
    if (k === 'w' && !e.shiftKey) { e.preventDefault(); return void closeTab(state.tab); }
    if (e.key === 'Tab' || e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); const d = (e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey)) ? -1 : 1; return void switchTab((state.tab + d + state.tabs.length) % state.tabs.length); }
    if (/^[1-9]$/.test(e.key) && !e.shiftKey) { e.preventDefault(); return void switchTab(e.key === '9' ? state.tabs.length - 1 : Math.min(+e.key - 1, state.tabs.length - 1)); }
  }
  if (mod && !e.shiftKey && k === 'k') { e.preventDefault(); openPalette(app, 'pages'); }
  else if (mod && !e.shiftKey && k === 'p') { e.preventDefault(); openPalette(app, 'commands'); }
  else if (mod && !e.shiftKey && k === 'n') { e.preventDefault(); newPage(''); }
  else if (mod && e.shiftKey && k === 'f') { e.preventDefault(); openSearch(app); }
  else if (mod && !e.shiftKey && k === 'o') { e.preventDefault(); openPalette(app, 'pages'); }
  else if (mod && e.key === '\\') { e.preventDefault(); toggleSidebar(); }
  else if (mod && e.key === '/') { e.preventDefault(); toggleSource(); }
  else if (mod && !e.shiftKey && k === 'f') { e.preventDefault(); openFind(); }
  else if (mod && !e.shiftKey && !e.altKey && k === 'j') { e.preventDefault(); toggleAssistant(); renderTopbar(); }
  else if (mod && !e.shiftKey && !e.altKey && k === 'h') { e.preventDefault(); openFind(true); }
  else if (mod && k === 's') { e.preventDefault(); flush().then(() => toast('Saved ✓', 900)); }
  else if (e.altKey && k === 'd') { e.preventDefault(); openDaily(); }
  else if (e.altKey && k === 's') { e.preventDefault(); study.toggle(); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navStep(-1); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navStep(1); }
}, true);

async function importNotes() {
  const files = await window.api.importPick();
  if (!files.length) return;
  let last = null;
  for (const f of files) { last = await vault.createPage('Imported', f.name, { blocks: toBlocks(f.name, f.ext, f.content), props: { tags: ['imported'] } }); }
  toast('Imported ' + files.length + ' note' + (files.length > 1 ? 's' : '') + ' into “Imported”');
  const s = new Set(settings.expanded); s.add('Imported'); settings.expanded = [...s];
  if (files.length === 1 && last) open(last); else renderSidebar();
}

// ---------------------------------------------------------------- find in page (Ctrl+F)
let findOff = null;
function openFind(withReplace = false) {
  const old = document.getElementById('findbar');
  if (old) { if (withReplace) old.classList.add('rep'); const f = old.querySelector(withReplace && old.querySelector('.rp').value === '' ? '.rp' : 'input'); old.querySelector('input').focus(); old.querySelector('input').select(); return; }
  const bar = h(`<div id="findbar" class="findbar"><input class="inp" placeholder="Find in page" spellcheck="false"><span class="fc muted"></span><button class="iconbtn" data-d="-1" title="Previous (Shift+Enter)">${icon('arrowup', 15)}</button><button class="iconbtn" data-d="1" title="Next (Enter)">${icon('arrowdown', 15)}</button><button class="iconbtn" data-x title="Close (Esc)">${icon('x', 15)}</button><button class="iconbtn" data-tr title="Find & replace (Ctrl+H)">${icon('pen', 15)}</button><span class="rrow"><input class="inp rp" placeholder="Replace with" spellcheck="false"><button class="btn sm" data-aa title="Match upper / lower case">Aa</button><button class="btn sm primary" data-ra>Replace all</button></span></div>`);
  if (withReplace) bar.classList.add('rep');
  document.body.appendChild(bar);
  const inp = bar.querySelector('input'), fc = bar.querySelector('.fc');
  const run = (next, fwd = true) => { if (!inp.value) { window.api.find.stop(); fc.textContent = ''; return; } window.api.find.run(inp.value, { findNext: next, forward: fwd }); setTimeout(() => inp.focus(), 0); };
  if (!findOff) window.api.find.onResult((r) => { const f = document.querySelector('#findbar .fc'); if (f) f.textContent = r.total ? r.active + ' / ' + r.total : 'No results'; });
  findOff = true;
  const close = () => { window.api.find.stop(); bar.remove(); document.removeEventListener('keydown', onEsc, true); };
  const onEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onEsc, true);
  inp.addEventListener('input', () => run(false));
  const rp = bar.querySelector('.rp'); let mcase = false;
  rp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') bar.querySelector('[data-ra]').click(); else if (e.key === 'Escape') close(); });
  bar.querySelector('[data-aa]').onclick = (e) => { mcase = !mcase; e.currentTarget.classList.toggle('on', mcase); };
  bar.querySelector('[data-tr]').onclick = () => { bar.classList.toggle('rep'); (bar.classList.contains('rep') ? rp : inp).focus(); };
  bar.querySelector('[data-ra]').onclick = () => {
    if (!editor || !inp.value) return toast('Type what to find first');
    const n = replaceAllIn(editor.blocks, inp.value, rp.value, mcase);
    if (!n) return toast('Nothing to replace');
    window.api.find.stop(); editor.changed(true); editor.render(); toast('Replaced ' + n + (n === 1 ? ' match' : ' matches'));
  };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') run(true, !e.shiftKey); else if (e.key === 'Escape') close(); });
  bar.addEventListener('click', (e) => { const d = e.target.closest('[data-d]'); if (d) run(true, d.dataset.d === '1'); if (e.target.closest('[data-x]')) close(); });
  const sel = getSelection().toString().trim(); if (sel && sel.length < 60 && !sel.includes('\n')) { inp.value = sel; run(false); }
  inp.focus(); inp.select();
}

// ---------------------------------------------------------------- lifecycle
function refresh() { renderSidebar(); renderTopbar(); renderRight(); if (state.view.type === 'home') showHome(); }
async function afterVaultChange() { resetLayoutCache(); state.hist = []; state.hpos = -1; state.tabs = [{ view: { type: 'home' }, hist: state.hist, hpos: -1 }]; state.tab = 0; await seedIfEmpty(); await openView({ type: 'home' }); }
async function seedIfEmpty() {
  const real = [...vault.pages.keys()];
  if (real.length) return;
  const { seedPages } = await import('./seed.js');
  for (const s of seedPages()) await vault.saveRaw(s.path, s.src);
  await vault.reload();
}

const newTabFn = () => newTab();
const app = {
  settings, saveSettings, open, openView, openLink, openDaily, newPage, newFromTemplate, openSearch: () => openSearch(app), commands, flush, refresh, afterVaultChange,
  get state() { return state; }
};

async function boot() {
  setApp(app); setLinkApp(app);
  initAssistant({ app, getEditor: () => editor, getCur: () => cur });
  applyTheme();
  $('#app').classList.toggle('sb-hidden', settings.sbHidden); $('#app').classList.toggle('rb-open', settings.rightOpen);
  document.documentElement.style.setProperty('--sw', settings.sbWidth + 'px');
  await vault.init();
  study.setStudyApp(app); await study.init();
  let wasRunning = study.isRunning();
  study.subscribe(() => {
    const pill = document.querySelector('#topbar .study-pill');
    const run = study.isRunning();
    if (pill) { pill.hidden = !run || state.view.type === 'study'; if (run) pill.textContent = study.subject(study.data().running.subject).name + ' · ' + study.fmtHMS(study.sessionSeconds()); }
    if (run !== wasRunning) { wasRunning = run; renderSidebar(); renderTopbar(); }
  });
  await seedIfEmpty();
  vault.onChange((what) => { if (typeof what === 'string' && what.startsWith('save:')) { renderSidebarSoon(); renderRightSoon(); } else if (what === 'create' || what === 'reload') renderSidebarSoon(); });
  bindSidebar(); bindTabs(); bindTopbar(); bindRight(); bindMascot();
  // sidebar resizer
  const rz = $('#resizer');
  rz.addEventListener('mousedown', (e) => { e.preventDefault(); rz.classList.add('drag'); const mv = (ev) => { settings.sbWidth = Math.max(200, Math.min(520, ev.clientX)); document.documentElement.style.setProperty('--sw', settings.sbWidth + 'px'); }; const up = () => { rz.classList.remove('drag'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); localStorage.setItem('jn.settings', JSON.stringify(settings)); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); });
  // external edits (Obsidian, sync, …)
  const onExternal = debounce(async () => {
    await vault.reload();
    if (cur && !cur.dirty && state.view.type === 'page' && !state.view.source) {
      const p = vault.pages.get(cur.path);
      if (p && p.src !== cur.src) { const sc = $('#view').scrollTop; await showPage(cur.path); $('#view').scrollTop = sc; }
    }
    refresh();
  }, 600);
  window.api.vault.onChanged(() => onExternal());
  const last = settings.last && vault.pages.has(settings.last) ? settings.last : null;
  await openView(last ? { type: 'page', path: last } : { type: 'home' });
  window.__app = app; window.__vault = vault;
}
const renderSidebarSoon = debounce(() => renderSidebar(), 200);
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', '<pre style="position:fixed;inset:20px;background:#fff;color:#b00;z-index:999;padding:20px;overflow:auto">' + escHtml(String(e && e.stack || e)) + '</pre>'); });
