const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, nativeImage, ClipboardItem } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null;
let vaultPath = null;
let watcher = null;
const recentOwnWrites = new Map();

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function loadCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } }
function saveCfg(c) { try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} }

function ensureVault() {
  const cfg = loadCfg();
  vaultPath = process.env.JN_VAULT || cfg.vault || path.join(app.getPath('documents'), 'Jimmy Notes');
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(path.join(vaultPath, 'assets'), { recursive: true });
}

// Resolve a vault-relative path safely (no escaping the vault)
function safe(rel) {
  const p = path.resolve(vaultPath, rel || '');
  if (p !== vaultPath && !p.startsWith(vaultPath + path.sep)) throw new Error('Path outside vault');
  return p;
}

function walk(dir, base, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (rel === 'assets') continue;
      out.dirs.push(rel);
      walk(full, rel, out);
    } else if (e.name.toLowerCase().endsWith('.md')) {
      const st = fs.statSync(full);
      out.files.push({ path: rel, mtime: st.mtimeMs, size: st.size });
    } else if (e.name.toLowerCase().endsWith('.pdf')) {
      const st = fs.statSync(full);
      (out.docs = out.docs || []).push({ path: rel, mtime: st.mtimeMs, size: st.size });
    }
  }
}

function startWatch() {
  if (watcher) { try { watcher.close(); } catch (e) {} watcher = null; }
  let timer = null;
  try {
    watcher = fs.watch(vaultPath, { recursive: true }, (evt, name) => {
      if (!name) return;
      const n = name.replace(/\\/g, '/');
      if (n.startsWith('.') || n.startsWith('assets')) return;
      const t = recentOwnWrites.get(n);
      if (t && Date.now() - t < 1500) return;
      clearTimeout(timer);
      timer = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('vault:changed', n); }, 300);
    });
  } catch (e) {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'Jimmy Notes', backgroundColor: '#fff8f0', icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: true }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('found-in-page', (_e, r) => { if (!win.isDestroyed()) win.webContents.send('find:result', { active: r.activeMatchOrdinal, total: r.matches }); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  // Electron has no right-click menu by default: give every text field Cut / Copy / Paste (+ spelling fixes)
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable && !p.selectionText) return;
    const t = [];
    if (p.isEditable && p.misspelledWord) {
      (p.dictionarySuggestions || []).slice(0, 5).forEach((s) => t.push({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
      if (!t.length) t.push({ label: 'No suggestions', enabled: false });
      t.push({ type: 'separator' });
    }
    if (p.isEditable) t.push({ role: 'cut', enabled: p.editFlags.canCut });
    t.push({ role: 'copy', enabled: p.editFlags.canCopy });
    if (p.isEditable) t.push({ role: 'paste', enabled: p.editFlags.canPaste });
    t.push({ role: 'selectAll' });
    Menu.buildFromTemplate(t).popup({ window: win });
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12')) win.webContents.toggleDevTools();
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

app.whenReady().then(() => {
  ensureVault();
  startWatch();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- IPC: vault ----
ipcMain.handle('vault:info', () => ({ path: vaultPath, sep: path.sep }));
ipcMain.handle('vault:list', () => {
  const out = { files: [], dirs: [] };
  walk(vaultPath, '', out);
  return out;
});
ipcMain.handle('vault:read', (_e, rel) => { try { return fs.readFileSync(safe(rel), 'utf8'); } catch (e) { return null; } });
// ---- version history: before a page is overwritten, its previous text is kept in .jimmy/history/<page>/ (at most one every 5 min, newest 40 kept)
const lastSnap = new Map();
const histDir = (rel) => safe('.jimmy/history/' + rel.replace(/\.md$/i, ''));
function snapshot(rel, force) {
  try {
    if (!/\.md$/i.test(rel) || /^\./.test(rel)) return;
    const p = safe(rel); if (!fs.existsSync(p)) return;
    const now = Date.now(); if (!force && now - (lastSnap.get(rel) || 0) < 5 * 60 * 1000) return;
    const prev = fs.readFileSync(p, 'utf8'); if (!prev.trim()) return;
    const dir = histDir(rel); fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    if (files.length && fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8') === prev) return;
    fs.writeFileSync(path.join(dir, now + '.md'), prev, 'utf8'); lastSnap.set(rel, now);
    files.push(now + '.md'); while (files.length > 40) fs.rmSync(path.join(dir, files.shift()), { force: true });
  } catch (e) { /* history is best-effort */ }
}
ipcMain.handle('history:list', (_e, rel) => {
  try { const dir = histDir(rel); return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse().map(f => ({ name: f, ts: +f.replace('.md', ''), size: fs.statSync(path.join(dir, f)).size })); } catch (e) { return []; }
});
ipcMain.handle('history:read', (_e, rel, name) => { try { return fs.readFileSync(path.join(histDir(rel), path.basename(name)), 'utf8'); } catch (e) { return null; } });
ipcMain.handle('history:restore', (_e, rel, name) => {
  try { const src = fs.readFileSync(path.join(histDir(rel), path.basename(name)), 'utf8'); snapshot(rel, true); recentOwnWrites.set(rel, Date.now()); fs.writeFileSync(safe(rel), src, 'utf8'); return true; } catch (e) { return false; }
});
ipcMain.handle('vault:write', (_e, rel, content) => {
  const p = safe(rel);
  snapshot(rel, false);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  recentOwnWrites.set(rel, Date.now());
  fs.writeFileSync(p, content, 'utf8');
  return fs.statSync(p).mtimeMs;
});
// copy PDFs (papers) into a vault folder; with no paths it opens a file picker
ipcMain.handle('doc:import', async (_e, destRel, given) => {
  let paths = Array.isArray(given) ? given.filter((p) => typeof p === 'string' && /\.pdf$/i.test(p)) : null;
  if (!paths) {
    const r = await dialog.showOpenDialog(win, { title: 'Add PDF files to your notes', properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled) return []; paths = r.filePaths;
  }
  const dir = safe(destRel || ''); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const src of paths) {
    try {
      const base = path.basename(src).replace(/[<>:"/\\|?*]+/g, '_'); const ext = path.extname(base); const stem = base.slice(0, base.length - ext.length);
      let name = base, i = 2; while (fs.existsSync(path.join(dir, name))) name = stem + ' ' + i++ + ext;
      fs.copyFileSync(src, path.join(dir, name)); out.push((destRel ? destRel + '/' : '') + name);
    } catch (err) { /* skip unreadable file */ }
  }
  return out;
});
ipcMain.handle('vault:exists', (_e, rel) => fs.existsSync(safe(rel)));
ipcMain.handle('vault:mkdir', (_e, rel) => { fs.mkdirSync(safe(rel), { recursive: true }); return true; });
ipcMain.handle('vault:rename', (_e, from, to) => {
  const a = safe(from), b = safe(to);
  if (fs.existsSync(b)) throw new Error('Target exists');
  fs.mkdirSync(path.dirname(b), { recursive: true });
  recentOwnWrites.set(from, Date.now()); recentOwnWrites.set(to, Date.now());
  fs.renameSync(a, b);
  return true;
});
ipcMain.handle('vault:trash', (_e, rel) => {
  const a = safe(rel);
  if (!fs.existsSync(a)) return false;
  const trash = path.join(vaultPath, '.trash');
  fs.mkdirSync(trash, { recursive: true });
  let dest = path.join(trash, path.basename(a));
  if (fs.existsSync(dest)) dest = path.join(trash, Date.now() + '-' + path.basename(a));
  recentOwnWrites.set(rel, Date.now());
  fs.renameSync(a, dest);
  return true;
});
ipcMain.handle('vault:saveAsset', (_e, name, b64) => {
  const clean = name.replace(/[^\w.\- ]/g, '_');
  let final = clean, i = 1;
  const ext = path.extname(clean), stem = path.basename(clean, ext);
  while (fs.existsSync(path.join(vaultPath, 'assets', final))) final = stem + '-' + (i++) + ext;
  fs.writeFileSync(path.join(vaultPath, 'assets', final), Buffer.from(b64, 'base64'));
  return 'assets/' + final;
});
// copy a picture (an image block from the vault, or a rendered chart/drawing) to the system clipboard together with its text form
ipcMain.handle('clipboard:copyImage', async (_e, spec, text) => {
  try {
    let img = null;
    if (spec && spec.dataUrl) img = nativeImage.createFromDataURL(spec.dataUrl);
    else if (spec && spec.rel) {
      const root = path.resolve(vaultPath), p = path.resolve(root, spec.rel);
      if (!p.startsWith(root + path.sep)) return false;
      img = nativeImage.createFromPath(p);
    }
    if (!img || img.isEmpty()) return false;
    const items = { 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) };
    if (text) items['text/plain'] = text;
    await clipboard.write([new ClipboardItem(items)]);
    return true;
  } catch (e) { return false; }
});
ipcMain.handle('vault:choose', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Choose your notes folder (vault)' });
  if (r.canceled || !r.filePaths[0]) return null;
  const cfg = loadCfg(); cfg.vault = r.filePaths[0]; saveCfg(cfg);
  vaultPath = r.filePaths[0];
  fs.mkdirSync(path.join(vaultPath, 'assets'), { recursive: true });
  startWatch();
  return vaultPath;
});
ipcMain.handle('vault:backup', () => {
  try {
    const d = new Date(); const z = (n) => String(n).padStart(2, '0');
    const dest = path.join(app.getPath('documents'), 'Jimmy Notes Backups', 'backup-' + d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()));
    fs.cpSync(vaultPath, dest, { recursive: true, filter: (p) => !/[\\/]\.trash([\\/]|$)/.test(p) });
    return { ok: true, dest };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('vault:revealPath', (_e, p) => { try { if (p && fs.existsSync(p)) shell.openPath(p); } catch (e) { /* */ } return true; });
ipcMain.handle('vault:reveal', () => { shell.openPath(vaultPath); return true; });
// ---- links to files on this computer ----
const RISKY_EXT = /\.(exe|bat|cmd|com|msi|ps1|vbs|vbe|js|jse|wsf|wsh|scr|lnk|hta|reg|jar|cpl|msc|dll)$/i;
ipcMain.handle('file:pick', async (_e, start) => {
  let def = app.getPath('documents');
  try { if (start && fs.existsSync(path.dirname(start))) def = path.dirname(start); } catch (e) {}
  const r = await dialog.showOpenDialog(win, { title: 'Choose the file to link to', defaultPath: def, properties: ['openFile'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});
ipcMain.handle('file:open', async (_e, p) => {
  try {
    if (!p || typeof p !== 'string' || !fs.existsSync(p)) return { ok: false, missing: true };
    if (RISKY_EXT.test(p)) { shell.showItemInFolder(p); return { ok: false, blocked: true };   // never launch programs from a note
    }
    const err = await shell.openPath(p);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});
ipcMain.handle('file:reveal', (_e, p) => { try { if (p && fs.existsSync(p)) shell.showItemInFolder(p); } catch (e) {} return true; });
ipcMain.handle('app:openExternal', (_e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); });

// ---- import ----
ipcMain.handle('import:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import notes', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Notes & documents', extensions: ['md', 'markdown', 'txt', 'html', 'htm'] }] });
  if (r.canceled) return [];
  return r.filePaths.slice(0, 200).map((p) => ({ name: path.basename(p, path.extname(p)), ext: path.extname(p).slice(1), content: fs.readFileSync(p, 'utf8') }));
});

// ---- trash (vault/.trash) ----
ipcMain.handle('trash:list', () => {
  const dir = path.join(vaultPath, '.trash');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).map((e) => { const st = fs.statSync(path.join(dir, e.name)); return { name: e.name, dir: e.isDirectory(), mtime: st.mtimeMs, size: st.size }; }).sort((a, b) => b.mtime - a.mtime);
});
ipcMain.handle('trash:restore', (_e, name) => {
  const src = path.join(vaultPath, '.trash', path.basename(name));
  if (!fs.existsSync(src)) return null;
  const ext = path.extname(name), stem = path.basename(name, ext);
  let dest = path.join(vaultPath, name), i = 2;
  while (fs.existsSync(dest)) dest = path.join(vaultPath, stem + ' (restored' + (i > 2 ? ' ' + i : '') + ')' + ext), i++;
  fs.renameSync(src, dest);
  return path.relative(vaultPath, dest).replace(/\\/g, '/');
});
ipcMain.handle('trash:delete', (_e, name) => { const p = path.join(vaultPath, '.trash', path.basename(name)); if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); return true; });
ipcMain.handle('trash:empty', () => { const p = path.join(vaultPath, '.trash'); if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); return true; });

// ---- find in page ----
ipcMain.handle('find:run', (_e, text, opts) => { if (!text) { win.webContents.stopFindInPage('clearSelection'); return 0; } return win.webContents.findInPage(text, opts || {}); });
ipcMain.handle('find:stop', () => { win.webContents.stopFindInPage('clearSelection'); return true; });

// ---- export ----
ipcMain.handle('export:pdf', async (_e, suggested) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: (suggested || 'page') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  fs.writeFileSync(r.filePath, data);
  return r.filePath;
});
ipcMain.handle('export:file', async (_e, suggested, content, ext) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: suggested + '.' + ext, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, content, 'utf8');
  return r.filePath;
});

// ---- live prices (Yahoo Finance public endpoints, no key) ----
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
async function getJSON(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function quoteOne(sym) {
  let lastErr;
  for (const h of ['query1', 'query2']) {
    try {
      const j = await getJSON('https://' + h + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=1mo');
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (!res) throw new Error('No data');
      const m = res.meta;
      const rawCloses = res.indicators.quote[0].close || [];
      const stamps = res.timestamp || [];
      const bars = [];                                                    // non-null daily bars with their exchange-local day
      rawCloses.forEach((c, i) => { if (c != null && stamps[i] != null) bars.push({ c, day: Math.floor((stamps[i] + (m.gmtoffset || 0)) / 86400) }); });
      const closes = bars.map(b => b.c);
      const price = m.regularMarketPrice;
      // Day change = latest price vs the close of the PREVIOUS trading session.
      // (meta.chartPreviousClose is the close before the whole 1-month window — that made +11% "day" changes.)
      const sessionDay = Math.floor(((m.regularMarketTime || stamps[stamps.length - 1] || 0) + (m.gmtoffset || 0)) / 86400);
      let prev = price;
      if (bars.length) {
        const last = bars[bars.length - 1];
        if (last.day === sessionDay) prev = bars.length > 1 ? bars[bars.length - 2].c : price;   // today's bar exists → compare with the bar before it
        else prev = last.c;                                                                      // today's bar not built yet → last full close is "yesterday"
      } else if (m.previousClose != null) prev = m.previousClose;
      return { symbol: sym, price, prevClose: prev, currency: m.currency, name: m.shortName || m.longName || sym, exchange: m.exchangeName, spark: closes.slice(-30), ok: true, time: Date.now() };
    } catch (e) { lastErr = e; }
  }
  return { symbol: sym, ok: false, error: String((lastErr && lastErr.message) || lastErr) };
}
ipcMain.handle('price:quotes', async (_e, symbols) => {
  const uniq = [...new Set((symbols || []).filter(Boolean))].slice(0, 60);
  const res = await Promise.all(uniq.map(quoteOne));
  const map = {};
  res.forEach(r => { map[r.symbol] = r; });
  return map;
});
ipcMain.handle('price:search', async (_e, q) => {
  try {
    const j = await getJSON('https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=8&newsCount=0');
    return (j.quotes || []).filter(x => x.symbol).map(x => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, type: x.quoteType, exchange: x.exchDisp }));
  } catch (e) { return []; }
});
// chart for the stock detail view: key -> [yahoo range, interval]
const CHART_KEYS = { '1D': ['1d', '5m'], '5D': ['5d', '15m'], '1M': ['1mo', '1d'], '6M': ['6mo', '1d'], '1Y': ['1y', '1d'], '5Y': ['5y', '1wk'], MAX: ['max', '1mo'] };
ipcMain.handle('price:chart', async (_e, sym, key) => {
  try {
    const [rg, iv] = CHART_KEYS[key] || CHART_KEYS['1M'];
    const j = await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=' + iv + '&range=' + rg + '&includePrePost=false');
    const r = j.chart.result[0]; const t = [], c = [];
    (r.timestamp || []).forEach((ts, i) => { const v = r.indicators.quote[0].close[i]; if (v != null) { t.push(ts); c.push(v); } });
    return { t, c, currency: r.meta.currency, prevClose: r.meta.chartPreviousClose, gmtoffset: r.meta.gmtoffset || 0, tz: r.meta.exchangeTimezoneName };
  } catch (e) { return null; }
});
// fundamentals need Yahoo's cookie + crumb pair
let _crumb = null;
async function getCrumb(force) {
  if (_crumb && !force && Date.now() - _crumb.at < 3600e3) return _crumb;
  const r0 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const cookie = (r0.headers.getSetCookie ? r0.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ');
  const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
  if (!cr.ok) throw new Error('crumb ' + cr.status);
  _crumb = { crumb: await cr.text(), cookie, at: Date.now() };
  return _crumb;
}
const rawN = (o) => (o && typeof o === 'object' ? (o.raw != null ? o.raw : null) : (typeof o === 'number' ? o : null));
ipcMain.handle('price:detail', async (_e, sym) => {
  try {
    let res = null;
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      const k = await getCrumb(attempt > 0);
      const r = await fetch('https://query1.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(sym) + '?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,price&crumb=' + encodeURIComponent(k.crumb), { headers: { 'User-Agent': UA, Cookie: k.cookie } });
      if (r.status === 401 || r.status === 403) continue;
      const j = await r.json(); res = j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
      break;
    }
    if (!res) return null;
    const sd = res.summaryDetail || {}, ks = res.defaultKeyStatistics || {}, fd = res.financialData || {}, ap = res.assetProfile || {}, pr = res.price || {};
    return {
      name: pr.longName || pr.shortName, type: pr.quoteType, exchange: pr.exchangeName, sector: ap.sector, industry: ap.industry, country: ap.country, website: ap.website,
      marketCap: rawN(pr.marketCap) ?? rawN(sd.marketCap), pe: rawN(sd.trailingPE), forwardPE: rawN(sd.forwardPE), eps: rawN(ks.trailingEps), forwardEps: rawN(ks.forwardEps), pb: rawN(ks.priceToBook),
      roe: rawN(fd.returnOnEquity), roa: rawN(fd.returnOnAssets), profitMargin: rawN(fd.profitMargins), operatingMargin: rawN(fd.operatingMargins), revenueGrowth: rawN(fd.revenueGrowth), earningsGrowth: rawN(fd.earningsGrowth),
      debtToEquity: rawN(fd.debtToEquity), currentRatio: rawN(fd.currentRatio), revenue: rawN(fd.totalRevenue), dividendYield: rawN(sd.dividendYield), payoutRatio: rawN(sd.payoutRatio), beta: rawN(sd.beta),
      high52: rawN(sd.fiftyTwoWeekHigh), low52: rawN(sd.fiftyTwoWeekLow), avgVolume: rawN(sd.averageVolume), targetPrice: rawN(fd.targetMeanPrice), recommendation: fd.recommendationKey, currency: pr.currency || sd.currency,
      summary: ap.longBusinessSummary ? String(ap.longBusinessSummary).slice(0, 420) : ''
    };
  } catch (e) { return null; }
});
const decodeXml = (t) => String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n));
async function googleNews(sym, name) {
  const kr = /\.(KS|KQ)$/i.test(sym) || /[가-힣]/.test(String(name || ''));
  const clean = String(name || '').replace(/[",→]/g, ' ').replace(/\s+/g, ' ').trim();
  let q;
  if (/\.(KS|KQ)$/i.test(sym)) q = sym.replace(/\.(KS|KQ)$/i, '') + ' 주가';
  else if (/^[A-Z]{6}=X$/.test(sym)) q = sym.slice(0, 3) + ' ' + sym.slice(3, 6) + ' exchange rate';
  else if (sym.startsWith('^')) q = (clean || sym) + ' index';
  else q = (clean ? '"' + clean + '" ' : sym + ' ') + 'stock';
  q += ' when:30d';
  const hl = kr ? 'ko' : 'en-US', gl = kr ? 'KR' : 'US';
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch('https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=' + hl + '&gl=' + gl + '&ceid=' + gl + ':' + hl.split('-')[0], { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!r.ok) return [];
    const xml = await r.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const g = (tag) => { const x = m[1].match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return x ? decodeXml(x[1]).trim() : ''; };
      const src = g('source'); let title = g('title'); if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
      return { title, publisher: src, time: Date.parse(g('pubDate')) || 0, link: g('link') };
    }).filter(n => n.title && n.link && n.time);
  } catch (e) { return []; } finally { clearTimeout(t); }
}
ipcMain.handle('price:news', async (_e, sym, name) => {
  const [y, g] = await Promise.all([
    getJSON('https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(sym) + '&quotesCount=0&newsCount=50').then(j => (j.news || []).map(n => ({ title: n.title, publisher: n.publisher, time: (n.providerPublishTime || 0) * 1000, link: n.link }))).catch(() => []),
    googleNews(sym, name)
  ]);
  const seen = new Set(), out = [];
  [...y, ...g].filter(n => n.title && n.link && n.time).sort((a, b2) => b2.time - a.time).forEach((n) => { const k = n.title.toLowerCase().replace(/[^a-z0-9가-힣]/g, '').slice(0, 60); if (!seen.has(k)) { seen.add(k); out.push(n); } });
  return out.slice(0, 120);
});
ipcMain.handle('price:history', async (_e, sym, range) => {
  try {
    const j = await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=' + (range || '6mo'));
    const r = j.chart.result[0];
    return { t: r.timestamp, c: r.indicators.quote[0].close };
  } catch (e) { return null; }
});

// ---------------------------------------------------------------------------- local AI (Ollama on this computer)
const aiCtl = new Map();
const aiBase = (host) => String(host || 'http://127.0.0.1:11434').replace(/\/+$/, '');
ipcMain.handle('ai:models', async (_e, host) => {
  try {
    const r = await fetch(aiBase(host) + '/api/tags', { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    return { ok: true, models: (j.models || []).map((m) => ({ name: m.name, size: m.size, params: m.details && m.details.parameter_size })) };
  } catch (e) { return { ok: false, error: 'Cannot reach Ollama at ' + aiBase(host) + ' — start the Ollama app first.' }; }
});
ipcMain.handle('ai:chat', async (e, id, req) => {
  const ctl = new AbortController(); aiCtl.set(id, ctl);
  let full = '';
  try {
    const r = await fetch(aiBase(req.host) + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ model: req.model, messages: req.messages, stream: true, keep_alive: '30m', options: Object.assign({ temperature: 0.4, num_ctx: 8192 }, req.options || {}) })
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return { ok: false, error: (/not found/i.test(t) ? 'Model "' + req.model + '" is not installed. In a terminal run: ollama pull ' + req.model : 'Ollama error ' + r.status + ' ' + t.slice(0, 200)) }; }
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let nl; while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
        try { const j = JSON.parse(line); const t = j.message && j.message.content; if (t) { full += t; if (!req.silent && !e.sender.isDestroyed()) e.sender.send('ai:chunk', id, t); } } catch (err) { /* partial */ }
      }
    }
    return { ok: true, text: full };
  } catch (err) {
    if (ctl.signal.aborted) return { ok: true, text: full, stopped: true };
    return { ok: false, text: full, error: /fetch failed|ECONNREFUSED/i.test(String(err)) ? 'Cannot reach Ollama — start the Ollama app first.' : String(err.message || err) };
  } finally { aiCtl.delete(id); }
});
ipcMain.handle('ai:stop', (_e, id) => { const c = aiCtl.get(id); if (c) c.abort(); return true; });

async function pdfToText(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  let out = ''; const n = doc.numPages;
  for (let i = 1; i <= n; i++) {
    const pg = await doc.getPage(i); const tc = await pg.getTextContent();
    out += '[p.' + i + ']\n';
    let line = '', lastY = null, lastEnd = null;
    for (const it of tc.items) {
      if (!it.str && !it.hasEOL) continue;
      const y = it.transform[5], x = it.transform[4], fs = Math.abs(it.transform[0]) || 10;
      if (lastY !== null && Math.abs(y - lastY) > fs * 0.5) { out += line.trim() + '\n'; line = ''; lastEnd = null; }
      else if (lastEnd !== null && x - lastEnd > fs * 0.18 && !/^\s/.test(it.str) && !/\s$/.test(line)) line += ' ';
      line += it.str; lastY = y; lastEnd = x + (it.width || 0);
      if (it.hasEOL) { out += line.trim() + '\n'; line = ''; lastY = null; lastEnd = null; }
    }
    out += line.trim() + '\n\n';
  }
  return { text: out, pages: n };
}
ipcMain.handle('ai:pickFile', async (_e, given) => {
  let fp = typeof given === 'string' && given ? given : null;
  if (!fp) {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a paper or document', properties: ['openFile'], filters: [{ name: 'Documents', extensions: ['pdf', 'md', 'txt', 'csv', 'json'] }] });
    if (r.canceled || !r.filePaths[0]) return null; fp = r.filePaths[0];
  }
  const name = path.basename(fp);
  try {
    if (/\.pdf$/i.test(fp)) { const { text, pages } = await pdfToText(fs.readFileSync(fp)); return { name, text, pages }; }
    return { name, text: fs.readFileSync(fp, 'utf8'), pages: 0 };
  } catch (err) { return { name, text: '', error: 'Could not read this file: ' + (err.message || err) }; }
});
