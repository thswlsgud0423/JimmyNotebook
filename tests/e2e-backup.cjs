module.exports = async ({ js, check, sleep, vault, win, errors }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path');
  fs.writeFileSync(path.join(vault, 'BackMe.md'), '# BackMe\n\nimportant\n');
  await js(`window.__vault.reload()`); await sleep(700);
  const r = await js(`window.api.vault.backup()`);
  check('backup succeeds', r.ok, JSON.stringify(r));
  if (r.ok) { check('the backup contains the notes', fs.existsSync(path.join(r.dest, 'BackMe.md'))); fs.rmSync(r.dest, { recursive: true, force: true }); }
  await js(`document.querySelector('#sidebar [data-act=settings]').click()`); await sleep(600);
  check('Settings has the new options', await js(`/Back up my notes/.test(document.querySelector('.modal').innerText) && /Spell check/.test(document.querySelector('.modal').innerText) && /Compact mode/.test(document.querySelector('.modal').innerText)`));
  check('no console errors', errors.length === 0, errors.join(' | '));
};
