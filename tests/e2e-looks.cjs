module.exports = async ({ js, shot, sleep, check, errors }) => {
  const set = async (theme, mode) => { await js(`window.__app.settings.theme='${theme}'; window.__app.settings.mode='${mode}'; window.__app.saveSettings();`); await sleep(400); };
  await set('basic', 'light'); await js(`window.__app.openView({type:'home'})`); await sleep(1500); await shot('70-basic-home');
  await set('psyduck', 'light'); await js(`window.__app.openView({type:'home'})`); await sleep(1500); await shot('71-psyduck-home');
  await set('yadon', 'light'); await js(`window.__app.openView({type:'home'})`); await sleep(1500); await shot('72-yadon-home');
  await js(`window.__app.open('Writing Guide.md')`); await sleep(2000); await shot('73-guide-top');
  await js(`document.querySelector('#view .t-code').scrollIntoView({block:'start'})`); await sleep(500); await shot('74-guide-code-math');
  await set('psyduck', 'dark'); await js(`window.__app.openView({type:'home'})`); await sleep(1500); await shot('75-psyduck-dark-home');
  check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '));
};
