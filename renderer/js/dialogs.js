// Command palette / quick switcher, global search, settings, template picker.
import * as vault from './vault.js';
import { icon } from './icons.js';
import { mascotSVG, hasMascot, THEMES } from './mascots.js';
import { h, escHtml, modal, promptDialog, toast } from './ui.js';
import { parseFM, parseBlocks } from './md.js';

const hl = (text, q) => {
  const s = escHtml(text); if (!q) return s;
  const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return s;
  return escHtml(text.slice(0, i)) + '<mark>' + escHtml(text.slice(i, i + q.length)) + '</mark>' + escHtml(text.slice(i + q.length));
};

// mode: 'pages' (Ctrl+K) | 'commands' (Ctrl+P)
export function openPalette(app, mode = 'pages') {
  const m = modal(`<input class="pal-input" placeholder="${mode === 'commands' ? 'Type a command…' : 'Jump to a page… (type > for commands)'}"><div class="pal-list"></div><div class="pal-foot"><span>↑↓ navigate</span><span>Enter open</span><span>Esc close</span><span style="margin-left:auto">${mode === 'pages' ? 'Ctrl+Enter: create page' : ''}</span></div>`, {});
  const inp = m.el.querySelector('input'), list = m.el.querySelector('.pal-list');
  if (mode === 'commands') inp.value = '>';
  let items = [], sel = 0;
  const commands = app.commands();
  function build() {
    const raw = inp.value; const cmdMode = raw.startsWith('>');
    const q = (cmdMode ? raw.slice(1) : raw).trim();
    items = [];
    if (cmdMode) {
      commands.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase())).forEach(c => items.push({ ico: c.icon, label: c.name, sub: c.key || '', run: c.run, html: hl(c.name, q) }));
    } else {
      vault.fuzzyPages(q, 10).forEach(p => items.push({ ico: p.props.icon || '📄', emoji: true, label: p.name, sub: p.dir || '', run: () => app.open(p.path), html: hl(p.name, q) }));
      if (q && !vault.exists(q)) items.push({ ico: '✨', emoji: true, label: 'Create “' + q + '”', run: () => app.newPage('', q), html: 'Create “' + escHtml(q) + '”', sub: 'new page' });
      if (q.length > 1) {
        vault.search(q, 5).filter(r => !items.some(i => i.label === r.page.name)).forEach(r => items.push({ ico: '🔎', emoji: true, label: r.page.name, sub: r.snippet.slice(0, 60), run: () => app.open(r.page.path), html: hl(r.page.name, q) }));
      }
    }
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map((it, i) => `<div class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="ico">${it.emoji ? escHtml(it.ico) : icon(it.ico || 'sparkle', 17)}</span><span>${it.html}</span><span class="sub">${escHtml(it.sub || '')}</span></div>`).join('') || '<div class="pal-empty">No results</div>';
  }
  const run = (i) => { const it = items[i]; if (!it) return; m.close(); setTimeout(() => it.run(), 0); };
  inp.addEventListener('input', () => { sel = 0; build(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); build(); list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); build(); list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (e.ctrlKey && mode === 'pages' && inp.value.trim() && !inp.value.startsWith('>')) { m.close(); app.newPage('', inp.value.trim()); } else run(sel); }
  });
  list.addEventListener('click', (e) => { const it = e.target.closest('.pal-item'); if (it) run(+it.dataset.i); });
  inp.focus(); build();
}

export function openSearch(app, initial = '') {
  const m = modal(`<input class="pal-input" placeholder="Search all notes (text, #tags, titles)…"><div class="pal-list" style="min-height:120px"></div><div class="pal-foot"><span>Searches titles, text and tags</span></div>`, { wide: true });
  const inp = m.el.querySelector('input'), list = m.el.querySelector('.pal-list');
  let res = [], sel = 0;
  const paint = () => {
    const q = inp.value.trim();
    res = vault.search(q.replace(/^#/, ''), 40);
    list.innerHTML = res.map((r, i) => `<div class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}" style="align-items:flex-start"><span class="ico">${escHtml(r.page.props.icon || '📄')}</span><span style="min-width:0"><b>${hl(r.page.name, q)}</b><br><span class="muted" style="font-size:13px">${hl(r.snippet, q.split(/\s+/)[0])}</span></span><span class="sub">${escHtml(r.page.dir)}</span></div>`).join('') || `<div class="pal-empty">${q ? 'No matches' : 'Type to search'}</div>`;
  };
  inp.addEventListener('input', () => { sel = 0; paint(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(res.length - 1, sel + 1); paint(); list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && res[sel]) { m.close(); app.open(res[sel].page.path); }
  });
  list.addEventListener('click', (e) => { const it = e.target.closest('.pal-item'); if (it && res[+it.dataset.i]) { m.close(); app.open(res[+it.dataset.i].page.path); } });
  inp.value = initial; inp.focus(); paint();
}

export function pickTemplate(app, cb) {
  const tpls = [...vault.pages.values()].filter(p => p.path.startsWith('Templates/'));
  const m = modal(`<div class="modal-h">Choose a template</div><div class="modal-b"><div class="plist">${tpls.map(p => `<div class="prow" data-p="${escHtml(p.path)}"><span class="pi">${escHtml(p.props.icon || '📄')}</span><span class="pn">${escHtml(p.name)}</span></div>`).join('') || '<div class="muted">No templates yet — add pages to the Templates folder.</div>'}</div></div>`, { center: true, onClose: () => { } });
  m.el.addEventListener('click', (e) => {
    const r = e.target.closest('[data-p]'); if (!r) return;
    const p = vault.pages.get(r.dataset.p); m.close();
    cb(parseBlocks(parseFM(p.src).body));
  });
}

export function openSettings(app) {
  const s = app.settings;
  const m = modal(`<div class="modal-h">Settings <span style="flex:1"></span><button class="iconbtn" data-x>${icon('x', 18)}</button></div><div class="modal-b" data-b></div>`, { wide: true });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  const b = m.el.querySelector('[data-b]');
  function paint() {
    b.innerHTML = `
      <h4 style="margin:0 0 10px;font-family:var(--font-head);font-weight:650;font-size:15px">Theme</h4>
      <div class="theme-pick">${Object.entries(THEMES).map(([k, t]) => `<div class="theme-card ${s.theme === k ? 'on' : ''}" data-theme="${k}"><div class="tm">${hasMascot(k) ? mascotSVG(k) : '<div class="mascot-mark" style="width:70px;height:70px;font-size:32px;margin:0 auto">J</div>'}</div><b>${escHtml(t.label)}</b><small>${escHtml(t.blurb)}</small></div>`).join('')}</div>
      <div class="set-row"><div class="lbl">Appearance<small>Light, dark, or follow Windows</small></div><div class="seg">${['light', 'dark', 'system'].map(v => `<button data-mode="${v}" class="${s.mode === v ? 'on' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div></div>
      <div class="set-row"><div class="lbl">Mascot<small>Show the Psyduck / 야돈 character (themes with one)</small></div><div class="switch ${s.mascot ? 'on' : ''}" data-sw="mascot"></div></div>
      <div class="set-row"><div class="lbl">Background pattern<small>Subtle theme texture behind pages</small></div><div class="switch ${s.pattern ? 'on' : ''}" data-sw="pattern"></div></div>
      <div class="set-row"><div class="lbl">Page width</div><div class="seg">${[['normal', 'Normal'], ['wide', 'Wide'], ['full', 'Full']].map(([v, l]) => `<button data-w="${v}" class="${s.width === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="set-row"><div class="lbl">Font style<small>Headings and body text</small></div><div class="seg">${[['clean', 'Clean'], ['serif', 'Serif'], ['soft', 'Soft']].map(([v, l]) => `<button data-font="${v}" class="${(s.font || 'clean') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="set-row"><div class="lbl">Text size</div><div class="seg">${[['14px', 'S'], ['15px', 'M'], ['17px', 'L']].map(([v, l]) => `<button data-fs="${v}" class="${s.fontSize === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="set-row"><div class="lbl">Accent color<small>Override the theme's main color</small></div><input type="color" data-accent value="${s.accent || '#8c77f2'}" style="width:40px;height:30px;border:0;background:none"><button class="btn sm ghost" data-reset-accent>Reset</button></div>
      <div class="set-row"><div class="lbl">Line spacing<small>How airy the text feels</small></div><div class="seg">${[['1.4', 'Tight'], ['', 'Normal'], ['1.85', 'Relaxed']].map(([v, l]) => `<button data-lh="${v}" class="${(s.lineHeight || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="set-row"><div class="lbl">Formatting toolbar<small>The always-visible bar above your page (like Google Docs)</small></div><div class="switch ${s.toolbar !== false ? 'on' : ''}" data-tb></div></div>
      <div class="set-row"><div class="lbl">Compact mode<small>Smaller spacing between blocks and in the sidebar</small></div><div class="switch ${s.compact ? 'on' : ''}" data-sw="compact"></div></div>
      <div class="set-row"><div class="lbl">Spell check<small>Red underline for misspelled words (applies to pages you open next)</small></div><div class="switch ${s.spell ? 'on' : ''}" data-sw="spell"></div></div>
      <div class="set-row"><div class="lbl">AI assistant<small>Choose the local model, language, style and your own instructions</small></div><button class="btn sm primary" data-ai>Customize…</button></div>
      <h4 style="margin:18px 0 6px;font-family:var(--font-head);font-weight:650;font-size:15px">Vault</h4>
      <div class="set-row"><div class="lbl">Notes folder<small style="word-break:break-all">${escHtml(vault.vaultPath)}</small></div><button class="btn sm" data-open-vault>Open</button><button class="btn sm primary" data-change-vault>Change…</button></div>
      <div class="set-row"><div class="lbl">Back up my notes<small>Copies everything (pages, PDFs, images) to a dated folder in Documents / Jimmy Notes Backups</small></div><button class="btn sm primary" data-backup>Back up now</button></div>
      <div class="set-row"><div class="lbl">Reload from disk<small>Pick up edits made in Obsidian / other apps</small></div><button class="btn sm" data-reload>Reload</button></div>
      <h4 style="margin:18px 0 6px;font-family:var(--font-head);font-weight:650;font-size:15px">Shortcuts</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:13.5px">${[['Ctrl+K', 'Quick switcher'], ['Ctrl+P', 'Command palette'], ['Ctrl+N', 'New page'], ['Ctrl+Shift+F', 'Search all'], ['Alt+D', 'Daily note'],  ['Ctrl+\\', 'Toggle sidebar'], ['Alt+← / →', 'Back / forward'], ['Ctrl+/', 'Source (Markdown) mode'], ['Ctrl+Shift+↑↓', 'Move block'], ['Ctrl+D', 'Duplicate block'], ['Esc', 'Select block'], ['/', 'Insert block menu'], ['[[', 'Link to a page']].map(([k, d]) => `<div><kbd style="background:var(--accent-soft);border-radius:6px;padding:0 6px;font-weight:700">${k}</kbd> ${d}</div>`).join('')}</div>`;
  }
  paint();
  b.addEventListener('click', async (e) => {
    const t = e.target;
    const th = t.closest('.theme-card'); if (th) { s.theme = th.dataset.theme; app.saveSettings(); paint(); return; }
    const md = t.closest('button[data-mode]'); if (md) { s.mode = md.dataset.mode; app.saveSettings(); paint(); return; }
    const sw = t.closest('.switch[data-sw]'); if (sw) { s[sw.dataset.sw] = !s[sw.dataset.sw]; app.saveSettings(); paint(); return; }
    const w = t.closest('button[data-w]'); if (w) { s.width = w.dataset.w; app.saveSettings(); paint(); return; }
    const fnt = t.closest('button[data-font]'); if (fnt) { s.font = fnt.dataset.font; app.saveSettings(); paint(); return; }
    const fs = t.closest('button[data-fs]'); if (fs) { s.fontSize = fs.dataset.fs; app.saveSettings(); paint(); return; }
    const lh = t.closest('button[data-lh]'); if (lh) { s.lineHeight = lh.dataset.lh; app.saveSettings(); paint(); return; }
    if (t.closest('[data-tb]')) { s.toolbar = s.toolbar === false; app.saveSettings(); paint(); return; }
    if (t.closest('[data-ai]')) { m.close(); const { openAiSettings } = await import('./assistant.js'); openAiSettings(); return; }
    if (t.closest('[data-reset-accent]')) { s.accent = ''; app.saveSettings(); paint(); return; }
    if (t.closest('[data-open-vault]')) return window.api.vault.reveal();
    if (t.closest('[data-backup]')) { const r = await window.api.vault.backup(); if (r.ok) { toast('Backed up ✓'); window.api.vault.openPath(r.dest); } else toast('Backup failed: ' + r.error, 4000); return; }
    if (t.closest('[data-reload]')) { await vault.reload(); app.refresh(); return; }
    if (t.closest('[data-change-vault]')) { const p = await window.api.vault.choose(); if (p) { await app.flush(); await vault.init(); await app.afterVaultChange(); paint(); } }
  });
  b.addEventListener('input', (e) => { if (e.target.matches('[data-accent]')) { s.accent = e.target.value; app.saveSettings(); } });
}
