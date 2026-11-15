module.exports = async ({ js, shot, check, sleep, errors, key }) => {
  const set = async (mode) => { await js(`window.__app.settings.theme='duo'; window.__app.settings.mode='${mode}'; window.__app.saveSettings();`); await sleep(500); };
  await set('light');
  await js(`window.__app.openView({type:'home'})`); await sleep(1600); await shot('120-duo-home-light');
  await js(`window.__app.openView({type:'study'})`); await sleep(1600); await shot('121-duo-study-light');
  await js(`document.querySelector('[data-a=focus]').click()`); await sleep(1200); await shot('122-duo-focus');
  await key('Escape'); await sleep(500);
  await js(`window.__app.open('Writing Guide.md')`); await sleep(1500);
  await js(`document.querySelector('#view [data-cv=change]').click()`); await sleep(400);
  await js(`document.querySelectorAll('.menu .mi').forEach(b => { if (/^\s*duo\s*$/.test(b.textContent)) b.click(); })`); await sleep(900);
  await shot('123-duo-cover');
  await set('dark');
  await js(`window.__app.openView({type:'home'})`); await sleep(1600); await shot('124-duo-home-dark');
};
