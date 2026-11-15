import { icon } from './icons.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.flush = (...a) => { clearTimeout(t); fn(...a); }; f.cancel = () => clearTimeout(t); return f; };
export const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toast(msg, ms = 2200) {
  const t = h(`<div class="toast">${escHtml(msg)}</div>`);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, ms);
}

let openMenus = [];
export function closeMenus() { openMenus.forEach(m => m.close()); openMenus = []; }
// items: [{label, icon, key, action, danger, sep, header, html}]
export function openMenu(x, y, items, opts = {}) {
  closeMenus();
  const m = h(`<div class="menu ${opts.cls || ''}"></div>`);
  items.forEach((it) => {
    if (it.sep) { m.appendChild(h('<div class="msep"></div>')); return; }
    if (it.header) { m.appendChild(h(`<div class="mh">${escHtml(it.header)}</div>`)); return; }
    const b = h(`<button class="mi ${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon, 16) : ''}<span>${it.html || escHtml(it.label)}</span>${it.key ? `<span class="k">${escHtml(it.key)}</span>` : ''}</button>`);
    b.addEventListener('click', (e) => { e.stopPropagation(); close(); it.action && it.action(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  const off = (e) => { if (!m.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => { document.addEventListener('mousedown', off, true); document.addEventListener('keydown', key, true); }, 0);
  function close() { m.remove(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', key, true); opts.onClose && opts.onClose(); openMenus = openMenus.filter(o => o.close !== close); }
  openMenus.push({ close });
  return { el: m, close };
}
export function menuAt(el, items, opts) { const r = el.getBoundingClientRect(); return openMenu(r.left, r.bottom + 4, items, opts); }

export function modal(html, { wide = false, center = false, onClose } = {}) {
  const wrap = h(`<div><div class="scrim"></div><div class="modal ${wide ? 'wide' : ''} ${center ? 'center' : ''}">${html}</div></div>`);
  $('#overlay').appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', key, true); onClose && onClose(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  wrap.querySelector('.scrim').addEventListener('mousedown', close);
  document.addEventListener('keydown', key, true);
  return { el: wrap.querySelector('.modal'), close };
}

export function promptDialog(title, value = '', placeholder = '') {
  return new Promise((res) => {
    const m = modal(`<div class="modal-h">${escHtml(title)}</div><div class="modal-b"><input class="inp" style="width:100%;font-size:16px" placeholder="${escHtml(placeholder)}"><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-a="c">Cancel</button><button class="btn primary" data-a="ok">OK</button></div></div>`, { center: true, onClose: () => res(null) });
    const inp = m.el.querySelector('input'); inp.value = value; inp.focus(); inp.select();
    const done = (v) => { res(v); m.close(); };
    m.el.querySelector('[data-a=ok]').onclick = () => done(inp.value.trim() || null);
    m.el.querySelector('[data-a=c]').onclick = () => done(null);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim() || null); });
  });
}
export function confirmDialog(msg, okLabel = 'Delete', danger = true, title = 'Are you sure?') {
  return new Promise((res) => {
    const m = modal(`<div class="modal-h">${escHtml(title)}</div><div class="modal-b"><p style="margin:0 0 16px">${escHtml(msg)}</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-a="c">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="ok">${escHtml(okLabel)}</button></div></div>`, { center: true, onClose: () => res(false) });
    m.el.querySelector('[data-a=ok]').onclick = () => { res(true); m.close(); };
    m.el.querySelector('[data-a=c]').onclick = () => { res(false); m.close(); };
    m.el.querySelector('[data-a=ok]').focus();
  });
}

const EMOJI = '📘 📗 📕 📙 📓 📔 📒 📚 📖 📝 ✏️ 🖊️ 📌 📍 📎 🗂️ 🗃️ 📁 📂 📅 📆 🗓️ ⏰ ⏳ 💡 🔍 🎯 🏆 ⭐ 🌟 ✨ 🔥 💎 💰 💵 💳 🏦 📈 📉 📊 💹 🪙 🧾 🛒 🏠 🏡 🌱 🌿 🍀 🌸 🌼 🌻 🌷 🌈 ☀️ 🌙 ☁️ ⚡ 💧 🌊 🫧 🦆 🐥 🐤 🐣 🐱 🐶 🐰 🐻 🐼 🦊 🐸 🦄 🐷 🐙 🦋 🐝 🐢 🦦 🦥 🌸 🍓 🍑 🍒 🍋 🍩 🍪 🧁 🍰 ☕ 🍵 🧋 🍙 🍜 🍕 🎵 🎧 🎮 🎨 🖌️ 🎬 📷 ✈️ 🚀 🚗 🚲 🏃 🧘 💪 🧠 ❤️ 💗 💜 💙 💚 💛 🧡 🤍 😀 😊 🥰 😎 🤓 🤔 😴 🥱 😵‍💫 🫠 🥳 💻 🖥️ ⌨️ 🖱️ 📱 🔧 ⚙️ 🧪 🔬 🧬 🔭 🧮 📐 📏 🗺️ 🧭 🏝️ ⛰️ 🎓 🏫 📜 ✅ ☑️ ❓ ❗ 💬 🔔 🔒 🔑 🧩 🎲 🎁 🪄 🔮 🫧'.split(' ');
export function emojiPicker(x, y, cb, allowRemove = true) {
  const html = `<div style="padding:6px 6px 0;display:flex;gap:6px"><input class="inp" placeholder="Type any emoji…" style="flex:1"><button class="btn sm" data-r>Random</button>${allowRemove ? '<button class="btn sm ghost" data-x>Remove</button>' : ''}</div><div class="emoji-grid">${EMOJI.map(e => `<button>${e}</button>`).join('')}</div>`;
  const menu = openMenu(x, y, [], {});
  menu.el.innerHTML = html;
  const pick = (e) => { menu.close(); cb(e); };
  menu.el.querySelectorAll('.emoji-grid button').forEach(b => b.onclick = () => pick(b.textContent));
  const inp = menu.el.querySelector('input'); inp.focus();
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim()) pick([...inp.value.trim()].slice(0, 2).join('')); });
  menu.el.querySelector('[data-r]').onclick = () => pick(EMOJI[Math.floor(Math.random() * EMOJI.length)]);
  const rm = menu.el.querySelector('[data-x]'); if (rm) rm.onclick = () => pick('');
  return menu;
}

export const COLORS = ['#ff8fb3', '#8c77f2', '#6ccfc0', '#ffc766', '#6db7ff', '#b4e07a', '#ff9d6e', '#c4a5ff', '#ff6b81', '#5ccf95', '#4fc3f7', '#f4b400'];
export const OPT_COLORS = ['#ffd3e0', '#dcd3ff', '#c4f0e6', '#ffe9b3', '#cfe6ff', '#e0f3c4', '#ffd8c4', '#e8dcff'];
export const fmtMoney = (n, cur = 'USD') => {
  if (n == null || isNaN(n)) return '–';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n); } catch (e) { return n.toFixed(2); }
};
export const fmtPct = (n) => (n == null || isNaN(n) ? '–' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%');
export const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago'; return fmtDate(ms);
}
export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function lightbox(src) {
  const wrap = h(`<div class="lightbox"><img src="${escHtml(src)}" alt=""><button class="iconbtn" aria-label="Close">${icon('x', 20)}</button></div>`);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', key, true); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  wrap.addEventListener('click', close); document.addEventListener('keydown', key, true);
  $('#overlay').appendChild(wrap);
}
export function placeCaretEnd(el) {
  if (el.tagName === 'TEXTAREA') { el.focus(); el.setSelectionRange(el.value.length, el.value.length); return; }
  el.focus();
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
export function placeCaretStart(el) {
  if (el.tagName === 'TEXTAREA') { el.focus(); el.setSelectionRange(0, 0); return; }
  el.focus();
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

// Small settings form. fields: [{ key, label, type: text|number|date|select|check, value, options:[{value,label}], hint, placeholder, min }]
// Resolves with { key: value } or null when cancelled. validate(values) may return an error message.
export function formDialog(title, fields, { ok = 'Save', note = '', validate } = {}) {
  return new Promise((res) => {
    const row = (f) => {
      if (f.type === 'check') return `<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" data-k="${f.key}" ${f.value ? 'checked' : ''} style="width:auto;margin:0"> ${escHtml(f.label)}</label>`;
      const ctl = f.type === 'select'
        ? `<select class="inp" data-k="${f.key}" style="display:block;width:100%;margin-top:4px">${f.options.map(o => `<option value="${escHtml(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}</select>`
        : `<input data-k="${f.key}" type="${f.type || 'text'}" value="${escHtml(f.value ?? '')}" placeholder="${escHtml(f.placeholder || '')}" ${f.min != null ? 'min="' + f.min + '"' : ''} autocomplete="off">`;
      return `<label>${escHtml(f.label)}${ctl}${f.hint ? `<small class="muted" style="display:block;margin-top:3px;font-weight:400">${escHtml(f.hint)}</small>` : ''}</label>`;
    };
    const m = modal(`<div class="modal-h">${escHtml(title)}</div><div class="modal-b pf-form">${note ? `<div class="muted" style="margin-bottom:10px">${escHtml(note)}</div>` : ''}${fields.map(row).join('')}<div class="form-err" style="color:#e5484d;font-size:13px;min-height:18px"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px"><button class="btn ghost" data-a="c">Cancel</button><button class="btn primary" data-a="ok">${escHtml(ok)}</button></div></div>`, { center: true, onClose: () => res(null) });
    const get = () => { const v = {}; fields.forEach((f) => { const e = m.el.querySelector(`[data-k="${f.key}"]`); v[f.key] = f.type === 'check' ? e.checked : f.type === 'number' ? (e.value === '' ? null : +e.value) : e.value.trim(); }); return v; };
    const done = () => { const v = get(); const err = validate && validate(v); if (err) { m.el.querySelector('.form-err').textContent = err; return; } res(v); m.close(); };
    m.el.querySelector('[data-a=ok]').onclick = done;
    m.el.querySelector('[data-a=c]').onclick = () => m.close();
    m.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') done(); });
    setTimeout(() => { const f = m.el.querySelector('input:not([type=checkbox]),select'); if (f) { f.focus(); if (f.select) f.select(); } }, 60);
  });
}
