// Vault index: all pages in memory, kept in sync with the folder of .md files.
import { parseFM, parsePage, serializePage, extractLinks, extractTags, plainText, countWords, parseBlocks, serializeBlocks } from './md.js';

const api = window.api.vault;
export const pages = new Map();        // path -> page
export let dirs = new Set();
export const docs = new Map();        // PDF files (papers) kept next to the notes: path -> {path,name,dir,props,links,...}
export let vaultPath = '';
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } });

export const baseName = (p) => p.replace(/^.*\//, '').replace(/\.md$/i, '');
export const dirName = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const keyOf = (p) => p.replace(/\.md$/i, '');
const cleanName = (s) => (s || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim().slice(0, 100) || 'Untitled';

function indexPage(path, src, mtime) {
  const { props, body } = parseFM(src);
  const tags = new Set(extractTags(body));
  (Array.isArray(props.tags) ? props.tags : (props.tags ? String(props.tags).split(/[ ,]+/) : [])).forEach(t => t && tags.add(String(t).replace(/^#/, '')));
  const page = {
    path, name: baseName(path), dir: dirName(path), mtime, props, body, src,
    links: extractLinks(body), tags: [...tags], text: plainText(body), words: countWords(body)
  };
  pages.set(path, page);
  return page;
}

// ---------- manual order (drag pages / folders to reorder) — saved in .jimmy/order.json so it travels with the notes
let manualOrder = {};                  // parentKey -> [childKey, …]
const ORDER_FILE = '.jimmy/order.json';
async function loadOrder() { try { const raw = await api.read(ORDER_FILE); manualOrder = (raw && JSON.parse(raw)) || {}; } catch (e) { manualOrder = {}; } }
let orderTimer = null;
function saveOrder() { clearTimeout(orderTimer); orderTimer = setTimeout(() => { try { api.write(ORDER_FILE, JSON.stringify(manualOrder)); } catch (e) { /* ignore */ } }, 250); }
export function setChildOrder(parentKey, keys) { manualOrder[parentKey || ''] = keys.slice(); saveOrder(); }
function remapOrder(oldKey, newKey) {
  const mk = (k) => (k === oldKey || k.startsWith(oldKey + '/') ? newKey + k.slice(oldKey.length) : k);
  const out = {}; for (const [p, list] of Object.entries(manualOrder)) out[mk(p)] = list.map(mk);
  manualOrder = out; saveOrder();
}
// the keys of the items directly inside a folder / page, in the order the sidebar shows them
export function childKeys(parentKey) {
  let arr = buildTree();
  if (parentKey) { let cur = ''; for (const seg of parentKey.split('/')) { cur = cur ? cur + '/' + seg : seg; const n = arr.find(x => x.key === cur); if (!n) return []; arr = n.children; } }
  return arr.map(n => n.key);
}

export async function init() {
  const info = await api.info();
  vaultPath = info.path;
  await loadOrder();
  await reload();
}
export async function reload() {
  const { files, dirs: ds, docs: dl } = await api.list();
  dirs = new Set(ds);
  docs.clear();
  (dl || []).forEach((d) => docs.set(d.path, { path: d.path, name: baseName(d.path.replace(/\.pdf$/i, '')) + '.pdf', dir: dirName(d.path), mtime: d.mtime, size: d.size, props: { icon: '📕' }, links: [], tags: [], text: '', src: '', body: '', words: 0, isDoc: true }));
  const seen = new Set();
  await Promise.all(files.map(async (f) => {
    seen.add(f.path);
    const old = pages.get(f.path);
    if (old && old.mtime === f.mtime) return;
    const src = await api.read(f.path);
    if (src != null) indexPage(f.path, src, f.mtime);
  }));
  for (const p of [...pages.keys()]) if (!seen.has(p)) pages.delete(p);
  emit('reload');
}

// ---------- lookup ----------
let nameCache = null;
function nameMap() {
  if (nameCache) return nameCache;
  nameCache = new Map();
  for (const p of pages.values()) {
    const k = p.name.toLowerCase();
    if (!nameCache.has(k)) nameCache.set(k, p);
    nameCache.set(keyOf(p.path).toLowerCase(), p);
  }
  for (const d of docs.values()) { if (!nameCache.has(d.name.toLowerCase())) nameCache.set(d.name.toLowerCase(), d); nameCache.set(d.path.toLowerCase(), d); }
  return nameCache;
}
onChange(() => { nameCache = null; backCache = null; });
export function resolve(name) {
  if (!name) return null;
  return nameMap().get(name.trim().toLowerCase().replace(/\.md$/, '')) || null;
}
export const exists = (name) => !!resolve(name);

let backCache = null;
export function backlinks(path) {
  if (!backCache) {
    backCache = new Map();
    for (const p of pages.values()) {
      for (const l of p.links) {
        const t = resolve(l);
        if (t && t.path !== p.path) { if (!backCache.has(t.path)) backCache.set(t.path, []); backCache.get(t.path).push(p); }
      }
    }
  }
  return backCache.get(path) || [];
}
// pages that mention this page's name in text but don't link to it
export function unlinkedMentions(path) {
  const p = pages.get(path); if (!p) return [];
  const n = p.name.toLowerCase();
  if (n.length < 3) return [];
  const linked = new Set(backlinks(path).map(x => x.path));
  return [...pages.values()].filter(q => q.path !== path && !linked.has(q.path) && q.text.toLowerCase().includes(n));
}
export function allTags() {
  const m = new Map();
  for (const p of pages.values()) for (const t of p.tags) { if (!m.has(t)) m.set(t, []); m.get(t).push(p); }
  return m;
}
export function allLinksGraph() {
  const nodes = [...pages.values()].map(p => ({ id: p.path, name: p.name, tags: p.tags, links: 0 }));
  const idx = new Map(nodes.map(n => [n.id, n]));
  const edges = [];
  for (const p of pages.values()) {
    for (const l of p.links) {
      const t = resolve(l);
      if (t && t.path !== p.path) { edges.push({ a: p.path, b: t.path }); idx.get(p.path).links++; idx.get(t.path).links++; }
    }
  }
  return { nodes, edges };
}

// ---------- tree ----------
// node: {key, path|null, name, children[], kind}
export function buildTree() {
  const nodes = new Map();
  const getNode = (key) => {
    if (!nodes.has(key)) nodes.set(key, { key, name: key.replace(/^.*\//, ''), path: null, children: [], kind: 'folder' });
    return nodes.get(key);
  };
  for (const d of dirs) getNode(d);
  for (const p of pages.values()) { const n = getNode(keyOf(p.path)); n.path = p.path; n.kind = 'page'; n.page = p; }
  for (const d of docs.values()) { nodes.set(d.path, { key: d.path, name: d.name, path: null, children: [], kind: 'doc', doc: d }); }
  const roots = [];
  for (const n of nodes.values()) {
    const parentKey = n.key.includes('/') ? n.key.slice(0, n.key.lastIndexOf('/')) : '';
    if (parentKey && nodes.has(parentKey)) nodes.get(parentKey).children.push(n);
    else roots.push(n);
  }
  const sortFn = (a, b) => {
    const oa = a.page && a.page.props.order != null ? +a.page.props.order : 1e9;
    const ob = b.page && b.page.props.order != null ? +b.page.props.order : 1e9;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  };
  const rank = (pk, k) => { const l = manualOrder[pk]; const i = l ? l.indexOf(k) : -1; return i < 0 ? 1e9 : i; };
  const rec = (arr, pk) => { arr.sort((a, b) => { const ra = rank(pk, a.key), rb = rank(pk, b.key); return ra !== rb ? ra - rb : sortFn(a, b); }); arr.forEach(n => rec(n.children, n.key)); };
  rec(roots, '');
  return roots;
}

// ---------- mutations ----------
function uniquePath(dir, title, ignore) {
  const name = cleanName(title);
  let candidate = name, i = 2;
  const ignoreKey = ignore ? keyOf(ignore) : null;
  const taken = (c) => {
    const k = (dir ? dir + '/' : '') + c;
    return (pages.has(k + '.md') && k + '.md' !== ignore) || (dirs.has(k) && k !== ignoreKey) || [...pages.values()].some(p => p.path !== ignore && p.name.toLowerCase() === c.toLowerCase());
  };
  while (taken(candidate)) candidate = name + ' ' + i++;
  return (dir ? dir + '/' : '') + candidate + '.md';
}

export async function savePage(path, props, blocks) {
  const src = serializePage(props, blocks);
  const mtime = await api.write(path, src);
  indexPage(path, src, mtime);
  emit('save:' + path);
  return src;
}
export async function saveRaw(path, src) {
  const mtime = await api.write(path, src);
  indexPage(path, src, mtime);
  emit('save:' + path);
}

export async function createPage(parentKey, title, opts = {}) {
  const path = uniquePath(parentKey || '', title || 'Untitled');
  const props = Object.assign({ created: new Date().toISOString().slice(0, 10) }, opts.props || {});
  const blocks = opts.blocks || [];
  const src = serializePage(props, blocks);
  const mtime = await api.write(path, src);
  if (parentKey && !dirs.has(parentKey)) dirs.add(parentKey);
  indexPage(path, src, mtime);
  emit('create');
  return path;
}

export async function createFromTemplateSrc(parentKey, title, src) {
  const path = uniquePath(parentKey || '', title);
  const { props, body } = parseFM(src);
  props.created = new Date().toISOString().slice(0, 10);
  await saveRaw(path, serializePage(props, parseBlocks(body)));
  if (parentKey) dirs.add(parentKey);
  emit('create');
  return path;
}

export async function renamePage(path, newTitle) {
  const p = pages.get(path); if (!p) return path;
  const oldName = p.name;
  const dir = p.dir;
  const target = uniquePath(dir, newTitle, path);
  const newName = baseName(target);
  if (newName === oldName) return path;
  await api.rename(path, target);
  const oldKey = keyOf(path), newKey = keyOf(target);
  if (dirs.has(oldKey)) await api.rename(oldKey, newKey);
  remapOrder(oldKey, newKey);
  // rewrite wikilinks everywhere
  const re = new RegExp('\\[\\[' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\]|#])', 'gi');
  await reload();
  for (const q of pages.values()) {
    if (re.test(q.src)) { re.lastIndex = 0; await api.write(q.path, q.src.replace(re, '[[' + newName)); }
    re.lastIndex = 0;
  }
  await reload();
  return target;
}

export async function movePage(path, newParentKey) {
  const p = pages.get(path); if (!p) return path;
  const key = keyOf(path);
  if (newParentKey === key || (newParentKey || '').startsWith(key + '/')) return path;
  if ((p.dir || '') === (newParentKey || '')) return path;
  const target = uniquePath(newParentKey || '', p.name, path);
  await api.rename(path, target);
  if (dirs.has(key)) await api.rename(key, keyOf(target));
  remapOrder(key, keyOf(target));
  if (newParentKey) await api.mkdir(newParentKey);
  await reload();
  return target;
}

// ---------- folders & generic tree operations (a "key" is a path without .md) ----------
const isPageKey = (key) => pages.has(key + '.md');
const subKeys = (key) => [...new Set([...dirs, ...[...pages.keys()].map(keyOf)])].filter(k => k === key || k.startsWith(key + '/'));
function uniqueKey(parentKey, name, ignoreKey) {
  const base = cleanName(name); let c = base, i = 2;
  const taken = (n) => { const k = (parentKey ? parentKey + '/' : '') + n; return k !== ignoreKey && (dirs.has(k) || pages.has(k + '.md')); };
  while (taken(c)) c = base + ' ' + i++;
  return (parentKey ? parentKey + '/' : '') + c;
}
export async function createFolder(parentKey, name) {
  const key = uniqueKey(parentKey || '', name || 'New folder');
  await api.mkdir(key);
  dirs.add(key);
  emit('create');
  return key;
}
export async function renameFolder(key, newName) {
  const parent = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
  const target = uniqueKey(parent, newName, key);
  if (target === key) return key;
  await api.rename(key, target);
  remapOrder(key, target);
  await reload();
  return target;
}
// move a page OR a plain folder under another folder/page
export async function moveKey(key, newParentKey) {
  if (isPageKey(key)) return keyOf(await movePage(key + '.md', newParentKey));
  if (!dirs.has(key)) return key;
  const parent = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
  if ((newParentKey || '') === parent || (newParentKey || '') === key || (newParentKey || '').startsWith(key + '/')) return key;
  const target = uniqueKey(newParentKey || '', key.replace(/^.*\//, ''));
  await api.rename(key, target);
  remapOrder(key, target);
  await reload();
  return target;
}
// copy a page / folder together with everything inside it
export async function copyKey(key, newParentKey) {
  const name = key.replace(/^.*\//, '');
  const sameSpot = (key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '') === (newParentKey || '');
  const root = uniqueKey(newParentKey || '', sameSpot ? name + ' copy' : name);
  const mapKey = (k) => root + k.slice(key.length);
  const keys = subKeys(key).sort((a, b) => a.length - b.length);
  for (const k of keys) {
    if (pages.has(k + '.md')) {
      const nk = mapKey(k);
      const path = nk + '.md';          // a copy keeps the same names, just in the new place
      const src = pages.get(k + '.md').src;
      const { props } = parseFM(src);
      if (k === key) { delete props.favorite; delete props.order; }
      const { blocks } = parsePage(src);
      await savePageAt(path, Object.assign({}, props, { created: new Date().toISOString().slice(0, 10) }), blocks);
    } else { await api.mkdir(mapKey(k)); dirs.add(mapKey(k)); }
  }
  if (!keys.some(k => k === key)) { await api.mkdir(root); dirs.add(root); }
  await reload();
  return root;
}
async function savePageAt(path, props, blocks) { const src = serializePage(props, blocks); const mt = await api.write(path, src); indexPage(path, src, mt); }
export async function deleteKey(key) {
  if (isPageKey(key)) return deletePage(key + '.md');
  await api.trash(key); dirs.delete(key); await reload();
}
export const countUnder = (key) => subKeys(key).filter(k => k !== key && pages.has(k + '.md')).length;

export async function deletePage(path) {
  const key = keyOf(path);
  await api.trash(path);
  if (dirs.has(key)) await api.trash(key);
  await reload();
}

export async function setProps(path, patch) {
  const p = pages.get(path); if (!p) return;
  const props = Object.assign({}, p.props, patch);
  const { blocks } = parsePage(p.src);
  await savePage(path, props, blocks);
}

export async function saveImage(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
  const name = (file.name && file.name !== 'image.png') ? file.name : 'pasted-' + Date.now() + '.png';
  return api.saveAsset(name, btoa(bin));
}
export async function saveDataUrl(dataUrl, name) {
  const b64 = dataUrl.split(',')[1];
  return api.saveAsset(name, b64);
}
export const assetUrl = (rel) => {
  if (/^(https?:|data:|file:)/.test(rel)) return rel;
  const base = vaultPath.replace(/\\/g, '/');
  return 'file:///' + encodeURI(base + '/' + rel).replace(/^\/+/, '').replace(/#/g, '%23');
};

export function todayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
export const dailyPath = (key) => 'Daily/' + key + '.md';
export function recentPages(n = 8) {
  return [...pages.values()].filter(p => !p.path.startsWith('Templates/')).sort((a, b) => b.mtime - a.mtime).slice(0, n);
}
export function search(query, limit = 40) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const res = [];
  for (const p of pages.values()) {
    const hay = (p.name + ' ' + p.text).toLowerCase();
    if (!terms.every(t => hay.includes(t))) continue;
    let score = 0;
    const nm = p.name.toLowerCase();
    if (nm === q) score += 100; else if (nm.startsWith(q)) score += 50; else if (nm.includes(q)) score += 30;
    if (p.tags.some(t => t.toLowerCase() === q.replace('#', ''))) score += 20;
    const idx = p.text.toLowerCase().indexOf(terms[0]);
    const snippet = idx >= 0 ? (idx > 40 ? '…' : '') + p.text.slice(Math.max(0, idx - 40), idx + 100) : '';
    res.push({ page: p, score, snippet });
  }
  return res.sort((a, b) => b.score - a.score || b.page.mtime - a.page.mtime).slice(0, limit);
}
export function fuzzyPages(query, limit = 12) {
  const q = query.toLowerCase().trim();
  const arr = [...pages.values(), ...docs.values()];
  if (!q) return arr.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  const out = [];
  for (const p of arr) {
    const n = p.name.toLowerCase(), full = keyOf(p.path).toLowerCase();
    let sc = 0;
    if (n === q) sc = 1000; else if (n.startsWith(q)) sc = 500; else if (n.includes(q)) sc = 300; else if (full.includes(q)) sc = 150;
    else {
      let i = 0; for (const ch of n) if (ch === q[i]) i++;
      if (i === q.length) sc = 50;
    }
    if (sc) out.push({ p, sc });
  }
  return out.sort((a, b) => b.sc - a.sc).slice(0, limit).map(x => x.p);
}
export { serializeBlocks };
