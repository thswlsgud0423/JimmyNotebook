// Headless-ish smoke test: launches the real app against a temp vault, drives the UI, saves screenshots.
// Usage: npx electron tests/smoke.cjs [outDir]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const out = process.argv[2] || path.join(os.tmpdir(), 'jn-smoke');
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jn-test-'));
const vault = path.join(tmp, 'vault');
fs.mkdirSync(vault);
app.setPath('userData', path.join(tmp, 'ud'));
fs.mkdirSync(path.join(tmp, 'ud'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'ud', 'config.json'), JSON.stringify({ vault }));
require('../main.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let win;
const js = (code) => win.webContents.executeJavaScript(code, true);
const grab = () => { try { win.show(); win.focus(); win.webContents.focus(); } catch (e) { /* ignore */ } };
const key = async (k, mods = []) => { grab(); win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods }); await sleep(60); };
const type = async (text) => { grab(); for (const ch of text) { const wc = win.webContents; wc.sendInputEvent({ type: 'keyDown', keyCode: ch }); wc.sendInputEvent({ type: 'char', keyCode: ch }); wc.sendInputEvent({ type: 'keyUp', keyCode: ch }); await sleep(25); } };
async function shot(name) { for (let i = 0; i < 4; i++) { try { if (win.isMinimized()) win.restore(); grab(); win.moveTop(); win.webContents.invalidate(); await sleep(600); win.webContents.invalidate(); await win.webContents.capturePage(); await sleep(250); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, name + '.png'), img.toPNG()); return; } catch (e) { await sleep(700); } } console.log('screenshot failed: ' + name); }
const results = [];
const check = (name, ok, extra) => { results.push([name, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

app.whenReady().then(async () => {
  await sleep(1500);
  win = BrowserWindow.getAllWindows()[0];
  win.setSize(1400, 900); win.setAlwaysOnTop(true);
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) errors.push(msg); });
  win.webContents.on('render-process-gone', (_e, d) => console.log('RENDERER GONE:', JSON.stringify(d)));
  win.webContents.on('did-start-navigation', (_e, url, inPlace, isMain) => { if (isMain) console.log('NAVIGATION:', url); });
  win.webContents.on('preload-error', (_e, p, err) => errors.push('preload: ' + err));
  await js(`window.addEventListener('error', e => console.error('STACK ' + (e.error && e.error.stack)))`);
  await sleep(1500);
  try {
    const steps = process.argv[3] ? require(path.resolve(process.argv[3])) : require('./smoke-steps.cjs');
    await steps({ key, type, js, shot, check, sleep, win, vault, errors, out });
  } catch (e) { check('script crashed', false, e.stack); }
  console.log('console errors:', errors.length ? errors.join('\n') : 'none');
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  app.exit(failed ? 1 : 0);
});
