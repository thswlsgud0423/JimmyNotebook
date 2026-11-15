module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const r = await js(`(async () => { const m = await import('./js/importer.js'); return m.htmlToMarkdown('<h1>Title</h1><p>Hello <span style="font-weight:700">bold</span> and <i>it</i> <a href="https://x.io">link</a></p><ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul><ol><li>a</li><li>b</li></ol><table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>'); })()`);
  console.log(r);
  check('html -> markdown', r.includes('# Title') && r.includes('**bold**') && r.includes('*it*') && r.includes('[link](https://x.io)') && r.includes('- one') && r.includes('  - nested') && r.includes('1. a') && r.includes('| A | B |'));
  await js(`window.__app.settings.theme='psyduck'; window.__app.saveSettings(); window.__app.open('Welcome to Jimmy Notes.md')`); await sleep(900);
  await js(`document.querySelectorAll('#view .chk')[1].click()`); await sleep(250);
  await shot('50-todo-burst');
};
