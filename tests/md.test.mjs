import assert from 'node:assert/strict';
import { parsePage, serializePage, parseBlocks, serializeBlocks, mdToHtml, extractLinks, extractTags, parseFM, serializeFM, countWords } from '../renderer/js/md.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

const rt = (src) => { const { props, blocks } = parsePage(src); return serializePage(props, blocks); };

t('frontmatter roundtrip', () => {
  const src = '---\nicon: 📘\ntags: [study, math]\nfavorite: true\n---\n# Hi\n';
  const { props } = parseFM(src);
  assert.equal(props.icon, '📘'); assert.deepEqual(props.tags, ['study', 'math']); assert.equal(props.favorite, true);
  assert.equal(serializeFM(props), '---\nicon: 📘\ntags: [study, math]\nfavorite: true\n---\n');
});

t('headings, paragraphs, lists', () => {
  const src = '# Title\n\nHello **world**\n\n- a\n- b\n  - c\n\n1. one\n2. two\n\n- [ ] todo\n- [x] done\n';
  assert.equal(rt(src), src);
});

t('callout + quote + hr', () => {
  const src = '> [!tip] Nice\n> body line\n\n> quoted\n\n---\n';
  assert.equal(rt(src), src);
});

t('code block and rich blocks', () => {
  const src = '```js\nconst a = 1;\n```\n\n```chart\n{"type":"pie","labels":["a","b"],"values":[1,2]}\n```\n';
  const b = parseBlocks(src);
  assert.equal(b[0].type, 'code'); assert.equal(b[1].type, 'chart'); assert.deepEqual(b[1].data.values, [1, 2]);
  assert.equal(serializeBlocks(b), src);
});

t('invalid rich JSON falls back to code', () => {
  const b = parseBlocks('```chart\n{oops\n```\n');
  assert.equal(b[0].type, 'code');
});

t('table roundtrip', () => {
  const src = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
  const b = parseBlocks(src);
  assert.equal(b[0].type, 'table'); assert.deepEqual(b[0].rows, [['A', 'B'], ['1', '2']]);
  assert.equal(serializeBlocks(b), src);
});

t('toggle with nested children', () => {
  const src = '<details>\n<summary>More</summary>\n\n- item\n\n<details>\n<summary>Inner</summary>\n\ntext\n\n</details>\n\n</details>\n';
  const b = parseBlocks(src);
  assert.equal(b[0].type, 'toggle'); assert.equal(b[0].children.length, 2); assert.equal(b[0].children[1].type, 'toggle');
  assert.equal(serializeBlocks(b), src);
});

t('images (markdown + obsidian embed)', () => {
  const b = parseBlocks('![cat|200](assets/my cat.png)\n\n![[pic.jpg]]\n'.replace('my cat', 'my%20cat'));
  assert.equal(b[0].src, 'assets/my cat.png'); assert.equal(b[0].width, 200);
  assert.equal(b[1].src, 'assets/pic.jpg');
});

t('empty paragraph preserved mid-document, trimmed at end', () => {
  const blocks = parseBlocks('a\n\n<br>\n\nb\n');
  assert.equal(blocks.length, 3);
  assert.equal(serializeBlocks([...blocks, { id: 'x', type: 'p', text: '' }]), 'a\n\n<br>\n\nb\n');
});

t('ordered list renumbers', () => {
  const b = parseBlocks('1. a\n1. b\n1. c\n');
  assert.equal(serializeBlocks(b), '1. a\n2. b\n3. c\n');
});

t('inline rendering', () => {
  const h = mdToHtml('**b** *i* ~~s~~ ==m== `c<x>` [[Page|alias]] #tag [l](https://x.io)', { exists: () => false });
  assert.ok(h.includes('<b>b</b>')); assert.ok(h.includes('<i>i</i>')); assert.ok(h.includes('<s>s</s>'));
  assert.ok(h.includes('<mark>m</mark>')); assert.ok(h.includes('<code>c&lt;x&gt;</code>'));
  assert.ok(h.includes('data-target="Page"') && h.includes('>alias<') && h.includes('missing'));
  assert.ok(h.includes('data-tag="tag"')); assert.ok(h.includes('href="https://x.io"'));
});

t('html is escaped', () => {
  assert.ok(!mdToHtml('<script>alert(1)</script>').includes('<script>'));
});

t('links and tags extraction ignores code', () => {
  const body = 'see [[A]] and [[B#h|bee]] `[[nope]] #no` #yes\n\n```\n[[also no]] #nope\n```\n';
  assert.deepEqual(extractLinks(body), ['A', 'B']);
  assert.deepEqual(extractTags(body), ['yes']);
});

t('word count handles korean', () => {
  assert.ok(countWords('hello world') === 2);
  assert.ok(countWords('안녕하세요 반갑습니다') >= 4);
});

console.log(`\n${n} tests passed`);

t('math blocks roundtrip', () => {
  const src = '$$\nE = mc^2\n$$\n';
  const b = parseBlocks(src);
  assert.equal(b[0].type, 'math'); assert.equal(b[0].text, 'E = mc^2');
  assert.equal(serializeBlocks(b), src);
  assert.equal(parseBlocks('$$x^2$$')[0].text, 'x^2');
  assert.ok(mdToHtml('a $x^2$ b').includes('data-tex="x^2"'));
});
console.log(`\n${n} tests passed (incl. math)`);

t('columns roundtrip incl. nesting', () => {
  const src = ':::columns\n:::col\n# Left\n\n- a\n- b\n:::col\nRight text\n:::end\n';
  const b = parseBlocks(src);
  assert.equal(b[0].type, 'columns'); assert.equal(b[0].cols.length, 2); assert.equal(b[0].cols[0][0].type, 'h1'); assert.equal(b[0].cols[1][0].text, 'Right text');
  assert.equal(serializeBlocks(b), src);
  const nested = ':::columns\n:::col\n:::columns\n:::col\nx\n:::col\ny\n:::end\n:::col\nz\n:::end\n';
  const nb = parseBlocks(nested);
  assert.equal(nb[0].cols.length, 2); assert.equal(nb[0].cols[0][0].type, 'columns'); assert.equal(nb[0].cols[0][0].cols.length, 2);
});
t('widget block is rich json', () => {
  const src = '```widget\n{"kind":"clock","w":1,"cfg":{"h24":true}}\n```\n';
  const b = parseBlocks(src); assert.equal(b[0].type, 'widget'); assert.equal(b[0].data.kind, 'clock');
  assert.equal(serializeBlocks(b), src);
});
console.log('\ncolumns + widget ok');

t('toc block roundtrip', () => {
  const src = '```toc\n{}\n```\n';
  const b = parseBlocks(src); assert.equal(b[0].type, 'toc'); assert.equal(serializeBlocks(b), src);
});
t('image alignment survives', () => {
  const b = parseBlocks('![cap|300|right](assets/a.png)\n');
  assert.equal(b[0].width, 300); assert.equal(b[0].align, 'right'); assert.equal(b[0].alt, 'cap');
  assert.equal(serializeBlocks(b), '![cap|300|right](assets/a.png)\n');
});
console.log('\ntoc + image align ok');
