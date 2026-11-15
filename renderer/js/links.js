// Links that go anywhere: a page, a website, a file on this computer, or a screen of the app (Study timer, Calendar…).
// A target is stored as plain text:  [[Page]]  |  https://…  |  file:///C:/…  |  app:study
import * as vault from './vault.js';
import { h, escHtml, modal, toast, confirmDialog } from './ui.js';

let A = null;                                   // the app object (openLink / openView / openDaily)
export const setLinkApp = (a) => { A = a; };

export const APP_VIEWS = [['study', 'Study timer'], ['calendar', 'Calendar'], ['graph', 'Graph view'], ['tags', 'Tags'], ['trash', 'Trash'], ['home', 'Home'], ['daily', 'Today’s note']];

export const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F').replace(/\(/g, '%28').replace(/\)/g, '%29');
export function pathFromUrl(u) {
  let p = u.replace(/^file:\/\/\//i, ''); try { p = decodeURIComponent(p); } catch (e) { /* keep as is */ }
  if (/^[A-Za-z]:/.test(p) || p.startsWith('//')) return p.replace(/\//g, '\\');
  return '/' + p;
}

// What does this text point at?
export function classify(raw) {
  const s = (raw || '').trim();
  if (!s) return { kind: 'none' };
  const m = s.match(/^\[\[(.+?)\]\]$/); if (m) return { kind: 'page', name: m[1] };
  if (/^app:/i.test(s)) { const id = s.slice(4).trim().toLowerCase(); const v = APP_VIEWS.find(x => x[0] === id); return { kind: 'app', id, label: v ? v[1] : id, ok: !!v }; }
  if (/^https?:\/\//i.test(s)) return { kind: 'web', url: s };
  if (/^file:\/\/\//i.test(s)) return { kind: 'file', path: pathFromUrl(s) };
  if (/^([a-z]:[\\/]|\\\\)/i.test(s)) return { kind: 'file', path: s.replace(/\//g, '\\') };
  const v = APP_VIEWS.find(x => x[1].toLowerCase() === s.toLowerCase() || x[0] === s.toLowerCase());   // typed "Study timer" by hand
  if (v && !vault.resolve(s)) return { kind: 'app', id: v[0], label: v[1], ok: true };
  if (vault.resolve(s)) return { kind: 'page', name: s };
  if (/^www\./i.test(s) || /^[^\s/\\]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return { kind: 'web', url: 'https://' + s };
  return { kind: 'page', name: s };
}
export function normalize(raw) {
  const c = classify(raw);
  return c.kind === 'page' ? '[[' + c.name + ']]' : c.kind === 'web' ? c.url : c.kind === 'file' ? fileUrl(c.path) : c.kind === 'app' ? 'app:' + c.id : '';
}
const baseOf = (p) => p.replace(/^.*[\\/]/, '');
export function describe(raw) {
  const c = classify(raw);
  if (c.kind === 'page') return 'Page “' + c.name + '”' + (vault.resolve(c.name) ? '' : ' (not created yet — it will be made when you open it)');
  if (c.kind === 'web') return 'Website ' + c.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (c.kind === 'file') return 'File “' + baseOf(c.path) + '” on this computer';
  if (c.kind === 'app') return c.ok ? 'App screen “' + c.label + '”' : 'Unknown screen “' + c.id + '”';
  return '';
}
export const defaultLabel = (raw) => { const c = classify(raw); return c.kind === 'page' ? c.name : c.kind === 'file' ? baseOf(c.path) : c.kind === 'app' ? c.label : c.kind === 'web' ? c.url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '') : ''; };
export const iconFor = (raw) => { const c = classify(raw); return c.kind === 'page' ? 'file' : c.kind === 'file' ? 'folder' : c.kind === 'app' ? 'timer' : 'link'; };
const display = (raw) => { const c = classify(raw); return c.kind === 'file' ? c.path : raw || ''; };

// HTML for an inline link inside a text block
export function linkHTML(text, target) {
  const c = classify(target); const t = escHtml(text || defaultLabel(target));
  if (c.kind === 'page') { const pg = vault.resolve(c.name); return `<a class="wikilink${pg ? '' : ' missing'}" data-target="${escHtml(pg ? pg.name : c.name)}" data-heading="" contenteditable="false">${t}</a>&#8203;`; }
  const href = normalize(target);
  return `<a class="ext" ${c.kind === 'web' ? `href="${escHtml(href)}" ` : ''}data-href="${escHtml(href)}">${t}</a>&#8203;`;
}

// Open whatever the target points at. `relink(newTarget)` is called if the user picks a replacement for a missing file.
export async function openTarget(raw, { relink } = {}) {
  const c = classify(raw);
  if (c.kind === 'none') return toast('This link has nothing to open yet — right-click it and choose Edit link');
  if (c.kind === 'web') return window.api.openExternal(c.url);
  if (c.kind === 'page') return A && A.openLink(c.name);
  if (c.kind === 'app') {
    if (!c.ok) return toast('There is no screen called “' + c.id + '” — right-click the link and choose Edit link');
    return c.id === 'daily' ? A.openDaily() : A.openView({ type: c.id });
  }
  const r = await window.api.file.open(c.path);
  if (r.ok) return;
  if (r.blocked) return toast('For safety a program is never launched from a note — its folder was opened instead');
  const msg = r.missing ? 'This file can’t be found (it may have been moved or renamed):' : 'This file couldn’t be opened:';
  if (!(await confirmDialog(msg + ' ' + c.path + ' — pick the correct file now?', 'Choose file…', false, 'File not found'))) return;
  const np = await window.api.file.pick(c.path); if (!np) return;
  relink && relink(fileUrl(np));
  const r2 = await window.api.file.open(np);
  toast(r2.ok ? 'Link updated' : 'Link updated, but that file couldn’t be opened');
}

// Dialog: where should this link go? Resolves { text, target } | { remove: true } | null.
export function linkDialog({ title = 'Link', text = '', target = '', askText = true, canRemove = false, textLabel = 'Text shown' } = {}) {
  return new Promise((res) => {
    const names = [...vault.pages.values()].map(p => p.name).sort().slice(0, 500);
    const m = modal(`<div class="modal-h">${escHtml(title)}</div><div class="modal-b pf-form">
      ${askText ? `<label>${escHtml(textLabel)}<input data-k="text" value="${escHtml(text)}" placeholder="e.g. the Calculus textbook" autocomplete="off"></label>` : ''}
      <label>Where it goes<input data-k="target" list="lk-pages" value="${escHtml(display(target))}" placeholder="https://…   or   [[Page name]]   or a file path" autocomplete="off"><datalist id="lk-pages">${names.map(n => `<option value="[[${escHtml(n)}]]"></option>`).join('')}</datalist></label>
      <div class="lk-row"><button class="btn sm" data-pick>${'📄'} Choose a file…</button><button class="btn sm" data-page>Choose a page…</button><select class="inp" data-screen><option value="">Open an app screen…</option>${APP_VIEWS.map(v => `<option value="app:${v[0]}">${escHtml(v[1])}</option>`).join('')}</select></div>
      <div class="muted lk-what" style="font-size:12.5px;min-height:18px"></div>
      <div class="form-err" style="color:#e5484d;font-size:13px;min-height:18px"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px">${canRemove ? '<button class="btn ghost danger" data-a="rm">Remove link</button>' : ''}<span style="flex:1"></span><button class="btn ghost" data-a="c">Cancel</button><button class="btn primary" data-a="ok">Save</button></div></div>`, { center: true, onClose: () => res(null) });
    const q = (s) => m.el.querySelector(s);
    const tIn = q('[data-k=target]'), xIn = q('[data-k=text]');
    const what = () => { q('.lk-what').textContent = tIn.value.trim() ? '→ ' + describe(tIn.value) : 'You can link to a page, a website, a file on this computer, or a screen of this app.'; };
    tIn.addEventListener('input', what); what();
    q('[data-pick]').onclick = async () => { const p = await window.api.file.pick(classify(tIn.value).kind === 'file' ? classify(tIn.value).path : ''); if (p) { tIn.value = p; what(); if (xIn && !xIn.value.trim()) xIn.value = baseOf(p).replace(/\.[^.]+$/, ''); } };
    q('[data-page]').onclick = () => { tIn.value = '[['; tIn.focus(); what(); try { tIn.showPicker(); } catch (e) { /* older engines: the suggestions appear while typing */ } };
    q('[data-screen]').onchange = (e) => { if (e.target.value) { tIn.value = e.target.value; what(); if (xIn && !xIn.value.trim()) xIn.value = defaultLabel(e.target.value); } };
    const done = (v) => { res(v); m.close(); };
    const save = () => {
      const t = normalize(tIn.value);
      if (!t) { q('.form-err').textContent = 'Tell me where this link should go.'; return; }
      if (classify(t).kind === 'app' && !classify(t).ok) { q('.form-err').textContent = 'That app screen doesn’t exist.'; return; }
      done({ text: xIn ? (xIn.value.trim() || defaultLabel(t)) : '', target: t });
    };
    q('[data-a=ok]').onclick = save; q('[data-a=c]').onclick = () => m.close();
    const rm = q('[data-a=rm]'); if (rm) rm.onclick = () => done({ remove: true });
    m.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } if (e.key === 'Escape') m.close(); });
    setTimeout(() => (xIn && !xIn.value ? xIn : tIn).focus(), 60);
  });
}
