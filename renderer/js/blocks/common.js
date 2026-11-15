import { icon } from '../icons.js';
import { h, escHtml, confirmDialog } from '../ui.js';

// Shared header/shell for rich blocks. Returns { el, body, tools } — append buttons to `tools`.
export function richShell(b, api, { ico, ph = 'Untitled' }) {
  const data = b.data;
  const el = h(`<div class="rich"><div class="rich-h"><span class="ic-badge">${icon(ico, 17)}</span><div class="rt" contenteditable="true" spellcheck="false" data-ph="${escHtml(ph)}"></div><span class="tools" style="display:flex;gap:2px;align-items:center"></span><button class="iconbtn" data-del title="Delete block">${icon('trash', 16)}</button></div><div class="rich-b"></div></div>`);
  const rt = el.querySelector('.rt');
  rt.textContent = data.title || '';
  rt.addEventListener('input', () => { data.title = rt.textContent; api.changed(); });
  rt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rt.blur(); } e.stopPropagation(); });
  el.querySelector('[data-del]').onclick = async () => { if (await confirmDialog('Delete this block?')) api.remove(); };
  return { el, body: el.querySelector('.rich-b'), tools: el.querySelector('.tools') };
}

export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
export function themeColors() {
  return [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4'), cssVar('--c5'), cssVar('--c6'), '#ff9d6e', '#c4a5ff', '#5ccf95', '#4fc3f7'];
}
export function segmented(options, value, onPick, small = true) {
  const s = h(`<div class="seg ${small ? 'sm' : ''}">${options.map(([v, l]) => `<button data-v="${v}" class="${v === value ? 'on' : ''}">${l}</button>`).join('')}</div>`);
  s.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; s.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); onPick(b.dataset.v); });
  return s;
}
export const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
// Re-run a callback whenever the theme/mode changes (charts need to re-read CSS variables)
export function onTheme(el, fn) {
  const f = () => { if (!el.isConnected) { document.removeEventListener('themechange', f); return; } fn(); };
  document.addEventListener('themechange', f);
}
