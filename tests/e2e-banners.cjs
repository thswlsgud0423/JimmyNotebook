module.exports = async ({ js, shot, check, sleep, errors }) => {
  const set = async (theme, mode) => { await js(`window.__app.settings.theme='${theme}'; window.__app.settings.mode='${mode}'; window.__app.saveSettings();`); await sleep(500); };
  for (const th of ['duo', 'psyduck', 'yadon', 'basic']) {
    await set(th, 'light'); await js(`window.__app.openView({type:'home'})`); await sleep(1500);
    const bg = await js(`getComputedStyle(document.querySelector('.hero')).backgroundImage.includes('banners/bg-')`);
    check('hero uses the painted backdrop (' + th + ')', bg);
    await shot('140-home-' + th);
  }
  await set('duo', 'dark'); await js(`window.__app.openView({type:'home'})`); await sleep(1500); await shot('141-home-duo-dark');
  await set('duo', 'light');
  await js(`window.__app.open('Writing Guide.md')`); await sleep(1400);
  await js(`document.querySelector('#view [data-cv=change]').click()`); await sleep(300);
  await js(`[...document.querySelectorAll('.menu .mi')].find(b => /Psyduck & Slowpoke/.test(b.textContent)).click()`); await sleep(1000);
  await shot('142-cover-duo');
  await set('psyduck', 'light'); await js(`document.querySelector('#view [data-cv=change]').click()`); await sleep(300);
  await js(`[...document.querySelectorAll('.menu .mi')].find(b => /Psyduck waterfall/.test(b.textContent)).click()`); await sleep(1000);
  await shot('143-cover-psyduck');
  await set('yadon', 'dark'); await js(`document.querySelector('#view [data-cv=change]').click()`); await sleep(300);
  await js(`[...document.querySelectorAll('.menu .mi')].find(b => /Slowpoke lake/.test(b.textContent)).click()`); await sleep(1000);
  await shot('144-cover-yadon-dark');
  await set('duo', 'light'); await js(`window.__app.openView({type:'study'})`); await sleep(1500); await shot('145-study-duo');
  check('no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
};
