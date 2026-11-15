// Renders the Notey mascot into build/icon.png + build/icon.ico.   Run: npx electron build/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'mascots.js'), 'utf8');
  const svg = src.split('const BASIC = `')[1].split('`;')[0];
  const html = `<html><body style="margin:0;background:transparent"><div style="width:256px;height:256px;border-radius:56px;background:linear-gradient(135deg,#efe9ff,#ffd9ec);display:grid;place-items:center;overflow:hidden"><div style="width:214px;margin-top:6px">${svg.replace('class="mascot basic"', 'style="width:100%"')}</div></div></body></html>`;
  const win = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, webPreferences: { offscreen: false } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 600));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const png = img.toPNG();
  fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
  // ICO with one PNG-compressed 256x256 image
  const hdr = Buffer.alloc(22);
  hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
  hdr[6] = 0; hdr[7] = 0; hdr[8] = 0; hdr[9] = 0; hdr.writeUInt16LE(1, 10); hdr.writeUInt16LE(32, 12);
  hdr.writeUInt32LE(png.length, 14); hdr.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([hdr, png]));
  console.log('icon written', png.length);
  app.quit();
});
