// Small page tools people ask for in Docs / Notion / Obsidian: word count, find & replace, version history.
import { h, modal, toast, escHtml, confirmDialog } from './ui.js';

// ---------- word count ----------
const plain = (s) => String(s || '').replace(/!?\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (m, a, b) => b || a).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~=#>]|\\/g, ' ');
function walkText(blocks, fn) {
  (blocks || []).forEach((b) => {
    if (b.type === 'code' || b.type === 'math') return;
    if (b.text) fn(b.text); if (b.title && typeof b.title === 'string') fn(b.title);
    if (b.rows) b.rows.forEach((r) => r.forEach((c) => c && fn(c)));
    if (b.children) walkText(b.children, fn);
    if (b.cols) b.cols.forEach((c) => walkText(c, fn));
  });
}
export function wordStats(blocks) {
  let words = 0, chars = 0;
  walkText(blocks, (t) => { const s = plain(t).trim(); if (!s) return; words += (s.match(/\S+/g) || []).length; chars += s.replace(/\s/g, '').length; });
  return { words, chars, mins: Math.max(1, Math.round(words / 220)) };
}
export const countText = (t) => { const s = String(t || '').trim(); return s ? (s.match(/\S+/g) || []).length : 0; };

// ---------- find & replace (on the page's text, including tables, toggles and columns) ----------
const rx = (find, matchCase) => new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
export function countMatches(blocks, find, matchCase) {
  if (!find) return 0; let n = 0; const r = rx(find, matchCase);
  walkText(blocks, (t) => { n += (t.match(r) || []).length; });
  return n;
}
export function replaceAllIn(blocks, find, rep, matchCase) {
  if (!find) return 0; let n = 0; const r = rx(find, matchCase);
  const sub = (t) => t.replace(r, () => { n++; return rep; });
  (function go(bl) {
    (bl || []).forEach((b) => {
      if (b.type === 'code' || b.type === 'math') return;
      if (b.text) b.text = sub(b.text);
      if (b.title && typeof b.title === 'string') b.title = sub(b.title);
      if (b.rows) b.rows = b.rows.map((row) => row.map((c) => (c ? sub(c) : c)));
      if (b.children) go(b.children);
      if (b.cols) b.cols.forEach(go);
    });
  })(blocks);
  return n;
}

// ---------- version history ----------
const ago = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};
export async function openHistory(path, { flush, onRestored }) {
  await flush();
  const list = await window.api.history.list(path);
  const m = modal(`<div class="modal-h">Version history</div><div class="modal-b vh">
    <div class="muted" style="margin-bottom:8px">Jimmy Notes keeps earlier versions of this page automatically. Pick one to preview it, then restore it. Your current version is kept too, so restoring can be undone.</div>
    ${list.length ? `<div class="vh-wrap"><div class="vh-list">${list.map((v, i) => `<button class="vh-i" data-n="${escHtml(v.name)}"><b>${i === 0 ? 'Previous version' : escHtml(ago(v.ts))}</b><small>${i === 0 ? escHtml(ago(v.ts)) + ' · ' : ''}${Math.max(1, Math.round(v.size / 5))} words approx.</small></button>`).join('')}</div>
    <div class="vh-view"><pre class="vh-pre muted">Select a version on the left.</pre><div style="text-align:right;margin-top:8px"><button class="btn primary" data-a="restore" disabled>Restore this version</button></div></div></div>` : '<div class="muted" style="padding:14px 0">No earlier versions yet. They appear after you edit this page a few times.</div>'}
  </div>`, { wide: true });
  let sel = null;
  const pre = m.el.querySelector('.vh-pre'), btn = m.el.querySelector('[data-a=restore]');
  m.el.querySelectorAll('.vh-i').forEach((b) => b.onclick = async () => {
    m.el.querySelectorAll('.vh-i').forEach((x) => x.classList.toggle('on', x === b)); sel = b.dataset.n;
    const src = await window.api.history.read(path, sel); pre.textContent = src == null ? '(could not read)' : src; pre.classList.remove('muted'); btn.disabled = false;
  });
  if (btn) btn.onclick = async () => {
    if (!sel) return; if (!(await confirmDialog('Replace this page with the selected version? The current text is saved in the history first.', 'Restore', false, 'Restore this version?'))) return;
    const ok = await window.api.history.restore(path, sel); m.close();
    if (ok) { toast('Restored'); onRestored && onRestored(); } else toast('Could not restore');
  };
}
