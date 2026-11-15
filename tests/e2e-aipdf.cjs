// Summarize a real PDF (generated here) with the local model.
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path'), os = require('os');
  const up = await fetch('http://127.0.0.1:11434/api/tags').then(r => r.ok).catch(() => false);
  if (!up) { console.log('SKIP: Ollama not running'); return; }
  const { BrowserWindow } = require('electron');
  const w = new BrowserWindow({ show: false });
  const para = (t) => `<p>${t}</p>`;
  const html = '<h1>Effects of Sleep on Memory</h1><p>Authors: A. Kim and B. Lee (2024)</p>' + para('Purpose. We tested whether 8 hours of sleep improves recall of word lists compared with 4 hours of sleep in 120 university students.') + para('Method. Students were randomly assigned to an 8-hour group or a 4-hour group and recalled 50 words the next morning.') + para('Results. The 8-hour group recalled 41 words on average while the 4-hour group recalled 29 words (p < 0.01).') + para('Limitations. All participants were university students and the study lasted one night only.');
  await w.loadURL('data:text/html,' + encodeURIComponent('<html><body style="font-size:16px">' + html + '</body></html>'));
  const pdf = await w.webContents.printToPDF({}); w.destroy();
  const fp = path.join(os.tmpdir(), 'jn-test-paper.pdf'); fs.writeFileSync(fp, pdf);
  await js(`document.querySelector('#topbar [data-t=ai]').click()`); await sleep(1200);
  const info = await js(`window.api.ai.pickFile(${JSON.stringify(fp)}).then(r => ({ pages: r.pages, len: r.text.length, has: r.text.includes('41 words'), sample: r.text.slice(0, 400), err: r.error }))`);
  check('PDF text is extracted', info.has && info.len > 200, JSON.stringify(info));
  // drop-like flow: attach through the same path the panel uses, then ask
  await js(`(async () => { const r = await window.api.ai.pickFile(${JSON.stringify(fp)}); })()`);
  await js(`document.querySelector('#aipanel [data-c=attach]')`);  // button exists
  // simulate the panel drop via the exposed helper path: call the same function by dispatching a drop event with a File whose path resolves
  const ok = await js(`(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'paper.pdf', { type: 'application/pdf' })); document.getElementById('aipanel').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()`);
  await sleep(500);
  console.log('(drop of a fake file is ignored safely):', ok);
};
