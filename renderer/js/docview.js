// PDF papers that live in the vault next to the notes: viewer, "summary note" helper, linking.
import { h, escHtml, toast, openMenu, confirmDialog } from './ui.js';
import * as vault from './vault.js';
import { mk } from './md.js';
import { summarizeVaultPdf } from './assistant.js';

const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
export const docLink = (d) => '[[' + d.name + ']]';

// A starter note that links back to the paper
export function summaryBlocks(d) {
  const p = (t = '') => mk('p', { text: t }), h2 = (t) => mk('h2', { text: t });
  return [mk('callout', { kind: 'info', title: 'Source', text: docLink(d) }), h2('Why I read this'), p(), h2('Key points'), mk('ul', { text: '' }), h2('Method'), p(), h2('Findings'), mk('ul', { text: '' }), h2('Limitations'), p(), h2('My thoughts'), p()];
}
export async function createSummaryNote(app, path) {
  const d = vault.docs.get(path); if (!d) return;
  const title = 'Summary - ' + d.name.replace(/\.pdf$/i, '');
  const np = await vault.createPage(d.dir, title, { props: { icon: '📝', tags: ['paper', 'summary'] }, blocks: summaryBlocks(d) });
  app.refresh(); await app.open(np); toast('Summary note created — it links to the PDF');
  return np;
}

export async function importPdfs(app, destKey, paths) {
  const done = await window.api.doc.import(destKey || '', paths || null);
  if (!done.length) return [];
  await vault.reload(); app.refresh();
  toast(done.length === 1 ? 'Added “' + done[0].replace(/^.*\//, '') + '”' : 'Added ' + done.length + ' PDFs');
  if (done.length === 1) app.openView({ type: 'doc', path: done[0] });
  return done;
}

export function docMenu(app, path, x, y) {
  const d = vault.docs.get(path); if (!d) return;
  openMenu(x, y, [
    { label: 'Open', icon: 'file', action: () => app.openView({ type: 'doc', path }) },
    { label: 'Summarize with AI → new note', icon: 'sparkle', action: () => summarizeVaultPdf(path) },
    { label: 'New summary note (write it yourself)', icon: 'pen', action: () => createSummaryNote(app, path) },
    { label: 'Copy [[link]]', icon: 'link', action: () => { navigator.clipboard.writeText(docLink(d)); toast('Link copied — paste it into any note'); } },
    { sep: true },
    { label: 'Show in folder', icon: 'folder', action: () => window.api.file.reveal(vault.vaultPath + '\\' + path.replace(/\//g, '\\')) },
    { label: 'Delete PDF', icon: 'trash', danger: true, action: async () => { if (await confirmDialog('Delete “' + d.name + '”? It moves to the Trash.', 'Delete')) { await window.api.vault.trash(path); await vault.reload(); app.refresh(); if (app.state.view.type === 'doc') app.openView({ type: 'home' }); } } }
  ]);
}

export function showDoc(app, view, path, page) {
  view.innerHTML = ''; view.style.overflowY = 'hidden';
  const d = vault.docs.get(path);
  if (!d) { view.appendChild(h('<div class="view-wrap"><h1>File not found</h1><p class="muted">This PDF is no longer in your notes folder.</p></div>')); return; }
  const backs = vault.backlinks(path);
  const root = h(`<div class="docv"><div class="docv-bar">
    <span class="docv-t">📕 <b>${escHtml(d.name)}</b> <small class="muted">${fmtSize(d.size)}${d.dir ? ' · ' + escHtml(d.dir) : ''}</small></span><span class="grow"></span>
    <button class="btn sm primary" data-a="sum" title="Read the PDF with the local AI and write a summary note that links back here">✨ Summarize with AI</button>
    <button class="btn sm" data-a="note" title="A blank summary note with a link to this PDF">📝 New summary note</button>
    <button class="btn sm" data-a="links" title="Notes that link to this PDF">🔗 Linked notes · ${backs.length}</button>
    <span class="docv-pg" title="Jump to a page, or copy a link to that exact page for your notes"><input type="number" min="1" placeholder="page" value="${page || ''}"><button class="btn sm" data-a="go">Go</button><button class="btn sm" data-a="pglink">Copy link to page</button></span>
    <button class="btn sm" data-a="copy" title="Copy a link you can paste into any note">Copy [[link]]</button>
    <button class="btn sm" data-a="ext" title="Open with your PDF app">Open outside</button></div>
    <iframe class="docv-frame" title="${escHtml(d.name)}"></iframe></div>`);
  view.appendChild(root);
  const frame = root.querySelector('iframe'); const pgIn = root.querySelector('.docv-pg input');
  const goto = (n) => { frame.src = vault.assetUrl(path) + (n ? '#page=' + n : ''); };
  goto(page);
  root.querySelector('.docv-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'sum') summarizeVaultPdf(path);
    else if (a === 'note') createSummaryNote(app, path);
    else if (a === 'go') { const n = +pgIn.value; if (n > 0) goto(n); else toast('Type a page number'); }
    else if (a === 'pglink') { const n = +pgIn.value; if (!(n > 0)) return toast('Type a page number first'); navigator.clipboard.writeText('[[' + d.name + '#page=' + n + '|' + d.name.replace(/\.pdf$/i, '') + ' p.' + n + ']]'); toast('Link to page ' + n + ' copied — paste it into a note'); }
    else if (a === 'copy') { navigator.clipboard.writeText(docLink(d)); toast('Link copied — paste it into any note'); }
    else if (a === 'ext') window.api.file.open(vault.vaultPath + '\\' + path.replace(/\//g, '\\'));
    else if (a === 'links') {
      const r = b.getBoundingClientRect();
      openMenu(r.left, r.bottom + 4, backs.length ? backs.map((p) => ({ label: p.name, icon: 'file', action: () => app.open(p.path) })) : [{ label: 'No note links to this PDF yet — paste the link into a note', icon: 'link', action: () => { navigator.clipboard.writeText(docLink(d)); } }]);
    }
  });
}
