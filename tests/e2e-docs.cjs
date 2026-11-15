// PDFs in the vault: upload into a folder, open, link from a note, backlinks, summary notes (blank + AI).
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path'), os = require('os'), wc = win.webContents;
  const { BrowserWindow } = require('electron');
  const w = new BrowserWindow({ show: false });
  await w.loadURL('data:text/html,' + encodeURIComponent('<html><body style="font-size:16px"><h1>Effects of Sleep on Memory</h1><p>Authors: A. Kim and B. Lee (2024)</p><p>Purpose. We tested whether 8 hours of sleep improves recall of word lists compared with 4 hours of sleep in 120 university students.</p><p>Method. Students were randomly assigned to an 8-hour group or a 4-hour group and recalled 50 words the next morning.</p><p>Results. The 8-hour group recalled 41 words on average while the 4-hour group recalled 29 words (p &lt; 0.01).</p><p>Limitations. All participants were university students and the study lasted one night only.</p></body></html>'));
  const pdf = await w.webContents.printToPDF({}); w.destroy();
  const fp = path.join(os.tmpdir(), 'sleep-paper.pdf'); fs.writeFileSync(fp, pdf);
  const pdfCount = () => js(`window.__vault.docs.size`);

  fs.mkdirSync(path.join(vault, 'Papers'), { recursive: true });
  await js(`window.__vault.reload()`); await sleep(700);
  const done = await js(`window.api.doc.import('Papers', ${JSON.stringify([fp])})`);
  check('a PDF is copied into the chosen folder', done.length === 1 && fs.existsSync(path.join(vault, 'Papers', 'sleep-paper.pdf')), JSON.stringify(done));
  const done2 = await js(`window.api.doc.import('Papers', ${JSON.stringify([fp])})`);
  check('uploading the same name again does not overwrite', done2[0] === 'Papers/sleep-paper 2.pdf', JSON.stringify(done2));
  fs.unlinkSync(path.join(vault, 'Papers', 'sleep-paper 2.pdf'));
  await js(`window.__vault.reload(); window.__app.settings.expanded = ['Papers']; window.__app.refresh()`); await sleep(900);
  check('the PDF shows in the sidebar inside its folder', await js(`!!document.querySelector('#sidebar .tn-row[data-doc="Papers/sleep-paper.pdf"]')`));
  await shot('98-pdf-sidebar');

  // click it with the real mouse
  const r = await js(`(() => { const r = document.querySelector('#sidebar .tn-row[data-doc]').getBoundingClientRect(); return { x: Math.round(r.left + 60), y: Math.round(r.top + r.height / 2) }; })()`);
  wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await sleep(100); wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await sleep(2500);
  check('clicking it opens the PDF viewer', await js(`!!document.querySelector('#view .docv iframe') && window.__app.state.view.type === 'doc'`));
  check('the tab and breadcrumb show its name', /sleep-paper/.test(await js(`document.querySelector('#topbar .crumbs').textContent`)));
  await shot('99-pdf-viewer');

  // a note links to it
  fs.writeFileSync(path.join(vault, 'MyNote.md'), '# MyNote\n\nI read [[sleep-paper.pdf]] today.\n');
  await js(`window.__vault.reload()`); await sleep(700);
  await js(`window.__app.open('MyNote.md')`); await sleep(1300);
  check('the PDF link is a real (not missing) link', await js(`(() => { const a = document.querySelector('#view a.wikilink'); return !!a && !a.classList.contains('missing'); })()`));
  const lr = await js(`(() => { const r = document.querySelector('#view a.wikilink').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  wc.sendInputEvent({ type: 'mouseMove', x: lr.x, y: lr.y }); await sleep(100); wc.sendInputEvent({ type: 'mouseDown', x: lr.x, y: lr.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: lr.x, y: lr.y, button: 'left', clickCount: 1 }); await sleep(1800);
  check('clicking the link in the note opens the PDF', await js(`window.__app.state.view.type === 'doc'`));
  check('the PDF lists the note that links to it', /Linked notes · 1/.test(await js(`document.querySelector('#view .docv-bar [data-a=links]').textContent`)));

  // blank summary note
  await js(`document.querySelector('#view .docv-bar [data-a=note]').click()`); await sleep(1800);
  const sums = fs.readdirSync(path.join(vault, 'Papers')).filter(f => /^Summary/.test(f));
  check('“New summary note” creates a note next to the PDF', sums.length === 1, sums.join(','));
  check('…that links back to the PDF', sums.length && /\[\[sleep-paper\.pdf\]\]/.test(fs.readFileSync(path.join(vault, 'Papers', sums[0]), 'utf8')));

  // summary with AI -> note
  const up = await fetch('http://127.0.0.1:11434/api/tags').then(r => r.ok).catch(() => false);
  if (up) {
    await js(`window.__app.openView({ type: 'doc', path: 'Papers/sleep-paper.pdf' })`); await sleep(1500);
    await js(`document.querySelector('#view .docv-bar [data-a=sum]').click()`);
    const t0 = Date.now(); await sleep(2000);
    while (Date.now() - t0 < 240000 && (await js(`document.getElementById('aipanel').classList.contains('busy')`))) await sleep(1000);
    await sleep(1500);
    const ai = fs.readdirSync(path.join(vault, 'Papers')).filter(f => /^Summary/.test(f) && !sums.includes(f));
    check('AI summary is saved as a note beside the PDF', ai.length === 1, ai.join(','));
    if (ai.length) { const txt = fs.readFileSync(path.join(vault, 'Papers', ai[0]), 'utf8'); console.log(txt.slice(0, 700)); check('the AI note links back to the PDF', /\[\[sleep-paper\.pdf\]\]/.test(txt)); check('the AI note mentions the real result (41 vs 29)', /41/.test(txt) && /29/.test(txt), txt.slice(0, 200)); }
    await shot('100-ai-summary');
  }
  check('no console errors', errors.length === 0, errors.join(' | '));
};
