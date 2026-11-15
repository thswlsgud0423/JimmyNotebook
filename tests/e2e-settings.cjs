module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const attr = (name) => js(`document.documentElement.dataset.${name}`);
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings(); window.__app.openView({type:'home'})`);
  await sleep(1200);
  await key('P', ['control']); await sleep(300); await type('settings'); await sleep(300); await key('Enter'); await sleep(700);
  check('settings opens', await js(`!!document.querySelector('.theme-pick')`));
  await shot('110-settings-basic');

  for (const th of ['psyduck', 'yadon', 'duo', 'basic']) {
    await click(`.theme-card[data-theme="${th}"]`); await sleep(350);
    check('theme card → ' + th, (await attr('theme')) === th, await attr('theme'));
    if (th === 'duo') await shot('111-settings-duo');
  }
  await click('button[data-mode="dark"]'); await sleep(300);
  check('appearance → dark', (await attr('mode')) === 'dark');
  await click('button[data-mode="light"]'); await sleep(300);
  check('appearance → light', (await attr('mode')) === 'light');

  await click('button[data-font="serif"]'); await sleep(250);
  check('font style → serif', (await attr('font')) === 'serif');
  await click('button[data-font="clean"]'); await sleep(200);
  check('font style → clean', (await attr('font')) === 'clean');

  await click('button[data-w="wide"]'); await sleep(250);
  check('page width → wide', (await js(`getComputedStyle(document.documentElement).getPropertyValue('--page-width').trim()`)) === '1080px');
  await click('button[data-w="normal"]'); await sleep(200);

  await click('button[data-fs="17px"]'); await sleep(250);
  check('text size → L', (await js(`document.body.style.fontSize`)) === '17px');
  await click('button[data-fs="15px"]'); await sleep(200);

  // mascot / pattern switches (use a theme that has a mascot)
  await click('.theme-card[data-theme="psyduck"]'); await sleep(350);
  await click('.switch[data-sw="mascot"]'); await sleep(250);
  check('mascot switch hides buddy', await js(`document.getElementById('app').classList.contains('no-mascot')`));
  await click('.switch[data-sw="mascot"]'); await sleep(250);
  check('mascot switch shows buddy', !(await js(`document.getElementById('app').classList.contains('no-mascot')`)));
  await click('.switch[data-sw="pattern"]'); await sleep(250);
  check('pattern switch turns texture on', !(await js(`document.getElementById('app').classList.contains('no-pattern')`)));
  await click('.switch[data-sw="pattern"]'); await sleep(250);
  check('pattern switch turns texture off', await js(`document.getElementById('app').classList.contains('no-pattern')`));

  // accent colour
  await js(`(() => { const i = document.querySelector('input[data-accent]'); i.value = '#ff0066'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(300);
  check('accent colour override', (await js(`document.documentElement.style.getPropertyValue('--accent')`)).trim() === '#ff0066');
  await click('[data-reset-accent]'); await sleep(250);
  check('accent reset', (await js(`document.documentElement.style.getPropertyValue('--accent')`)).trim() === '');

  // persisted
  const saved = await js(`JSON.parse(localStorage.getItem('jn.settings'))`);
  check('settings persisted to localStorage', saved.theme === 'psyduck' && saved.font === 'clean' && saved.width === 'normal', JSON.stringify(saved).slice(0, 120));
  await key('Escape'); await sleep(300);
  check('settings closes with Esc', await js(`!document.querySelector('.theme-pick')`));
};
