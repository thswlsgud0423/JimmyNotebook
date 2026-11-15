module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.theme='duo'; window.__app.settings.mode='light'; window.__app.saveSettings(); window.__app.openView({type:'home'})`);
  await sleep(1500);
  await shot('90-duo-home');
  await js(`document.querySelector('#sidebar [data-nav=study]').click()`); await sleep(1200);
  check('study view renders', await js(`!!document.querySelector('#view .study .st-ring') && document.querySelectorAll('.st-s').length >= 2`));
  await shot('91-study-idle');
  // add a manual record + a real run
  await js(`document.querySelector('[data-a=toggle]').click()`); await sleep(500);
  check('timer running (pill/live dot)', await js(`document.querySelector('#sidebar .live') !== null`));
  await sleep(11500);
  const t = await js(`document.querySelector('.st-big').textContent`);
  check('big timer counts up', /^00:00:1\d$/.test(t) || /^00:00:0\d$/.test(t) === false, t);
  await shot('92-study-running');
  await js(`document.querySelector('[data-a=toggle]').click()`); await sleep(800);
  await sleep(700);
  const f = path.join(vault, '.jimmy', 'study.json');
  const j = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  check('session saved to .jimmy/study.json', j && j.sessions.length === 1 && j.running === null, j && JSON.stringify(j.sessions));
  // manual record
  await js(`(async () => { const m = await import('./js/study.js'); m.addManual(m.data().subjects[1].id, 95); m.addManual(m.data().subjects[0].id, 50); })()`); await sleep(1500);
  check('heat-map + charts', await js(`document.querySelectorAll('.hmc.l1,.hmc.l2,.hmc.l3,.hmc.l4').length >= 1 && document.querySelectorAll('.st-bar canvas').length === 1`));
  const today = await js(`document.querySelector('.st-big').textContent`);
  check('today total includes manual records (~2h25m)', /^02:(2[4-9]|3[0-1]):/.test(today), today);
  await js(`document.querySelector('.st-stats').scrollIntoView({block:'start'})`); await sleep(500);
  await shot('93-study-stats');
  // focus mode
  await js(`window.scrollTo(0,0); document.querySelector('#view').scrollTop = 0; document.querySelector('[data-a=focus]').click()`); await sleep(900);
  check('focus mode opens', await js(`!!document.querySelector('.focus-overlay .fo-time')`));
  await shot('94-focus');
  await key('Escape'); await sleep(500);
  check('focus mode closes with Esc', await js(`!document.querySelector('.focus-overlay')`));
  // widget on home
  await js(`window.__app.openView({type:'home'})`); await sleep(1500);
  check('study widget on home', await js(`!!document.querySelector('.stw .stw-time') && document.querySelector('.stw-time').textContent !== '00:00:00'`));
  // goal reached toast path & theme variants render
  for (const th of ['psyduck', 'yadon', 'basic']) { await js(`window.__app.settings.theme='${th}'; window.__app.saveSettings(); window.__app.openView({type:'study'})`); await sleep(900); }
  await shot('95-study-basic');
  await js(`window.__app.settings.theme='yadon'; window.__app.settings.mode='dark'; window.__app.saveSettings();`); await sleep(900);
  await shot('96-study-yadon-dark');
};
