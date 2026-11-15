// Pure markdown <-> block model. No DOM access here (except htmlToMd which takes a node).
// Pages are plain .md files (Obsidian compatible). Rich blocks are stored as fenced code blocks.

export const RICH = ['chart', 'draw', 'database', 'portfolio', 'timer', 'flash', 'timeline', 'widget', 'toc'];
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
let _id = 0;
export const uid = () => 'b' + Date.now().toString(36) + (_id++).toString(36) + Math.random().toString(36).slice(2, 5);

export function mk(type, extra = {}) {
  return Object.assign({ id: uid(), type, text: '' }, extra);
}

// ---------------- frontmatter ----------------
export function parseFM(src) {
  src = src.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---[ \t]*(\n|$)/);
  if (!m) return { props: {}, body: src };
  const props = {};
  const lines = m[1].split('\n');
  let key = null;
  for (const line of lines) {
    const li = line.match(/^\s+-\s+(.*)$/);
    if (li && key) { if (!Array.isArray(props[key])) props[key] = []; props[key].push(unq(li[1])); continue; }
    const kv = line.match(/^([\w\- ]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1].trim();
    const v = kv[2].trim();
    if (v === '') props[key] = '';
    else if (v.startsWith('[') && v.endsWith(']')) props[key] = v.slice(1, -1).split(',').map(s => unq(s.trim())).filter(Boolean);
    else if (v === 'true') props[key] = true;
    else if (v === 'false') props[key] = false;
    else props[key] = unq(v);
  }
  return { props, body: src.slice(m[0].length) };
}
function unq(s) { return s.replace(/^(["'])(.*)\1$/, '$2'); }
export function serializeFM(props) {
  const keys = Object.keys(props).filter(k => props[k] !== undefined && props[k] !== '' && !(Array.isArray(props[k]) && !props[k].length) && props[k] !== false);
  if (!keys.length) return '';
  const out = ['---'];
  for (const k of keys) {
    const v = props[k];
    if (Array.isArray(v)) out.push(`${k}: [${v.map(x => /[,\]\[:]/.test(x) ? JSON.stringify(x) : x).join(', ')}]`);
    else if (typeof v === 'boolean') out.push(`${k}: ${v}`);
    else out.push(`${k}: ${/^[\s"'\[{>|&*!%@`#-]|: | #|\s$/.test(String(v)) ? JSON.stringify(String(v)) : v}`);
  }
  out.push('---', '');
  return out.join('\n');
}

// ---------------- block parsing ----------------
const reFence = /^(\s*)```+\s*([\w+#-]*)\s*(.*)$/;
const reHr = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const reTable = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

export function parseBlocks(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const isStart = (l, n) => reFence.test(l) || /^:::columns/.test(l) || /^\s*\$\$/.test(l) || /^#{1,6}\s/.test(l) || reHr.test(l) || /^\s*[-*+]\s/.test(l) || /^\s*\d+[.)]\s/.test(l) || /^>/.test(l) || /^<details/.test(l) || (/^\s*\|/.test(l) && n != null && reTable.test(n));
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    // fenced
    let m = line.match(reFence);
    if (m && /^\s*```/.test(line)) {
      const lang = m[2]; const buf = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const body = buf.join('\n');
      if (RICH.includes(lang)) {
        try { blocks.push(mk(lang, { data: JSON.parse(body || '{}') })); continue; } catch (e) { /* fall through to code */ }
      }
      blocks.push(mk('code', { lang, text: body }));
      continue;
    }
    // columns  :::columns / :::col / :::end
    if (/^:::columns\s*$/.test(line)) {
      let depth = 1; const inner = []; i++;
      while (i < lines.length) {
        const l = lines[i];
        if (/^:::columns\s*$/.test(l)) depth++;
        else if (/^:::end\s*$/.test(l)) { depth--; if (depth === 0) { i++; break; } }
        inner.push(l); i++;
      }
      const cols = []; let curc = null; let d2 = 0;
      for (const l of inner) {
        if (/^:::columns\s*$/.test(l)) d2++; else if (/^:::end\s*$/.test(l)) d2--;
        if (d2 === 0 && /^:::col\s*$/.test(l)) { curc = []; cols.push(curc); continue; }
        if (!curc) { curc = []; cols.push(curc); }
        curc.push(l);
      }
      const parsed = cols.map(c => parseBlocks(c.join('\n')));
      if (!parsed.length) parsed.push([]);
      blocks.push(mk('columns', { cols: parsed })); continue;
    }
    // math block  $$ ... $$
    if (/^\s*\$\$/.test(line)) {
      const one = line.match(/^\s*\$\$(.+)\$\$\s*$/);
      if (one) { blocks.push(mk('math', { text: one[1].trim() })); i++; continue; }
      const buf = []; const first = line.replace(/^\s*\$\$/, ''); if (first.trim()) buf.push(first);
      i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) buf.push(lines[i++]);
      if (i < lines.length) { const lastLine = lines[i].replace(/\$\$\s*$/, ''); if (lastLine.trim()) buf.push(lastLine); i++; }
      blocks.push(mk('math', { text: buf.join('\n').trim() })); continue;
    }
    // details / toggle
    if (/^<details/.test(line)) {
      let depth = 0; const buf = [];
      let j = i;
      for (; j < lines.length; j++) {
        const l = lines[j];
        depth += (l.match(/<details/g) || []).length;
        depth -= (l.match(/<\/details>/g) || []).length;
        buf.push(l);
        if (depth <= 0) break;
      }
      i = j + 1;
      let inner = buf.join('\n').replace(/^<details[^>]*>\s*/, '').replace(/\s*<\/details>\s*$/, '');
      let summary = 'Toggle';
      const sm = inner.match(/^<summary>([\s\S]*?)<\/summary>\s*/);
      if (sm) { summary = sm[1].trim(); inner = inner.slice(sm[0].length); }
      blocks.push(mk('toggle', { text: summary, open: /<details[^>]*\sopen/.test(buf[0]), children: parseBlocks(inner) }));
      continue;
    }
    // headings
    m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) { blocks.push(mk('h' + Math.min(3, m[1].length), { text: m[2] })); i++; continue; }
    if (reHr.test(line)) { blocks.push(mk('hr')); i++; continue; }
    // todo / list
    m = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s?(.*)$/);
    if (m) { blocks.push(mk('todo', { text: m[3], checked: m[2] !== ' ', indent: Math.floor(m[1].replace(/\t/g, '  ').length / 2) })); i++; continue; }
    m = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (m) { blocks.push(mk('ul', { text: m[2], indent: Math.floor(m[1].replace(/\t/g, '  ').length / 2) })); i++; continue; }
    m = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (m) { blocks.push(mk('ol', { text: m[2], indent: Math.floor(m[1].replace(/\t/g, '  ').length / 2) })); i++; continue; }
    // quote / callout
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      const cm = buf[0].match(/^\[!([\w-]+)\]([+-])?\s*(.*)$/);
      if (cm) blocks.push(mk('callout', { kind: cm[1].toLowerCase(), title: cm[3], fold: cm[2] || '', text: buf.slice(1).join('\n') }));
      else blocks.push(mk('quote', { text: buf.join('\n') }));
      continue;
    }
    // table
    if (/^\s*\|/.test(line) && i + 1 < lines.length && reTable.test(lines[i + 1])) {
      const rows = [];
      const split = (l) => { let t = l.trim(); if (t.startsWith('|')) t = t.slice(1); if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1); return t.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|')); };
      rows.push(split(line)); i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(split(lines[i++]));
      const w = Math.max(...rows.map(r => r.length));
      rows.forEach(r => { while (r.length < w) r.push(''); });
      blocks.push(mk('table', { rows }));
      continue;
    }
    // images
    m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (m) {
      let width = null, align = '';
      const alt = m[1].split('|').filter((tok, ix) => { if (ix === 0) return true; if (/^\d+$/.test(tok)) { width = +tok; return false; } if (tok === 'left' || tok === 'right') { align = tok; return false; } return true; }).join('|');
      let src2 = m[2]; try { src2 = decodeURI(src2); } catch (e) { /* keep */ }
      blocks.push(mk('image', { src: src2, alt, width, align })); i++; continue;
    }
    m = line.match(/^!\[\[([^\]|]+)(?:\|(\d+))?\]\]\s*$/);
    if (m && IMG_EXT.test(m[1])) { blocks.push(mk('image', { src: m[1].includes('/') ? m[1] : 'assets/' + m[1], alt: '', width: m[2] ? +m[2] : null })); i++; continue; }
    if (line.trim() === '<br>') { blocks.push(mk('p')); i++; continue; }
    // paragraph
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !isStart(lines[i], lines[i + 1])) buf.push(lines[i++]);
    blocks.push(mk('p', { text: buf.join('\n') }));
  }
  return blocks;
}

// ---------------- serialization ----------------
export function serializeBlocks(blocks) {
  const out = [];
  const olCount = [];
  const fam = (b) => b.type === 'ol' ? 'ol' : (b.type === 'ul' || b.type === 'todo') ? 'ul' : null;
  let prevFam = null;
  // trim trailing empty paragraphs
  let end = blocks.length;
  while (end > 0 && blocks[end - 1].type === 'p' && !blocks[end - 1].text) end--;
  for (let k = 0; k < end; k++) {
    const b = blocks[k];
    let s;
    const ind = '  '.repeat(b.indent || 0);
    switch (b.type) {
      case 'h1': s = '# ' + b.text; break;
      case 'h2': s = '## ' + b.text; break;
      case 'h3': s = '### ' + b.text; break;
      case 'ul': s = ind + '- ' + b.text; break;
      case 'todo': s = ind + '- [' + (b.checked ? 'x' : ' ') + '] ' + b.text; break;
      case 'ol': {
        const d = b.indent || 0;
        const prev = blocks[k - 1];
        if (!prev || prev.type !== 'ol' || (prev.indent || 0) < d) olCount[d] = 0;
        olCount.length = d + 1;
        olCount[d] = (olCount[d] || 0) + 1;
        s = ind + olCount[d] + '. ' + b.text; break;
      }
      case 'quote': s = b.text.split('\n').map(l => '> ' + l).join('\n'); break;
      case 'callout': s = '> [!' + (b.kind || 'note') + ']' + (b.fold || '') + (b.title ? ' ' + b.title : '') + (b.text ? '\n' + b.text.split('\n').map(l => '> ' + l).join('\n') : ''); break;
      case 'toggle': s = '<details' + (b.open ? ' open' : '') + '>\n<summary>' + b.text + '</summary>\n\n' + serializeBlocks(b.children || []).trim() + '\n\n</details>'; break;
      case 'code': s = '```' + (b.lang || '') + '\n' + b.text + '\n```'; break;
      case 'hr': s = '---'; break;
      case 'columns': s = ':::columns\n' + (b.cols || []).map(c => ':::col\n' + serializeBlocks(c).trim()).join('\n') + '\n:::end'; break;
      case 'math': s = '$$\n' + (b.text || '') + '\n$$'; break;
      case 'image': s = '![' + (b.alt || '') + (b.width ? '|' + b.width : '') + (b.align ? '|' + b.align : '') + '](' + encodeURI(b.src) + ')'; break;
      case 'table': s = b.rows.map((r, ri) => '| ' + r.map(c => (c || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |' + (ri === 0 ? '\n|' + r.map(() => ' --- |').join('') : '')).join('\n'); break;
      case 'p': s = b.text === '' ? '<br>' : b.text; break;
      default:
        if (RICH.includes(b.type)) s = '```' + b.type + '\n' + JSON.stringify(b.data || {}) + '\n```';
        else s = b.text || '';
    }
    const f = b.type === 'ol' ? 'ol' : (b.type === 'ul' || b.type === 'todo') ? 'ul' : null;
    if (out.length) out.push(f && f === prevFam ? '\n' : '\n\n');
    out.push(s);
    prevFam = f;
  }
  return out.join('') + (out.length ? '\n' : '');
}

export function parsePage(src) {
  const { props, body } = parseFM(src);
  return { props, blocks: parseBlocks(body) };
}
export function serializePage(props, blocks) {
  return serializeFM(props) + serializeBlocks(blocks);
}

// ---------------- inline ----------------
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// opts.exists(name) -> bool for wikilink styling
export function mdToHtml(text, opts = {}) {
  if (!text) return '';
  const hold = [];
  const keep = (h) => { hold.push(h); return '\u0000' + (hold.length - 1) + '\u0000'; };
  let s = String(text);
  s = s.replace(/`([^`\n]+)`/g, (_, c) => keep('<code>' + esc(c) + '</code>'));
  s = s.replace(/\$([^$\n]+)\$/g, (_, c) => keep('<span class="imath" contenteditable="false" data-tex="' + esc(c) + '">' + esc(c) + '</span>'));
  s = esc(s);
  s = s.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>').replace(/&lt;br\s*\/?&gt;/g, '<br>');
  s = s.replace(/\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g, (_, t, h, a) => {
    const miss = opts.exists && !opts.exists(t.trim()) ? ' missing' : '';
    return keep('<a class="wikilink' + miss + '" data-target="' + t.trim() + '" data-heading="' + (h || '').slice(1) + '" contenteditable="false">' + (a || t.trim() + (h || '')) + '</a>');
  });
  s = s.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|file:\/\/\/|app:)[^)\s]+)\)/g, (_, t, u) => keep('<a class="ext" ' + (/^https?:/.test(u) ? 'href="' + u + '" ' : '') + 'data-href="' + u + '">' + t + '</a>'));
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<b>$2</b>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
  s = s.replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1<i>$2</i>');
  s = s.replace(/(^|[^_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, '$1<i>$2</i>');
  s = s.replace(/(^|[\s(>])#([\wÀ-￿][\wÀ-￿/-]*)/g, (m, p, t) => /^\d+$/.test(t) ? m : p + '<span class="tag" data-tag="' + t + '">#' + t + '</span>');
  s = s.replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => hold[+n]);
}

// DOM -> markdown for inline content of a contenteditable element
export function htmlToMd(node) {
  let out = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) { out += c.nodeValue.replace(/[​]/g, '').replace(/[ ]/g, ' '); return; }
    if (c.nodeType !== 1) return;
    const tag = c.tagName.toLowerCase();
    const inner = () => htmlToMd(c);
    if (tag === 'br') { out += '\n'; return; }
    if (tag === 'b' || tag === 'strong') { const t = inner(); out += t ? '**' + t + '**' : ''; return; }
    if (tag === 'i' || tag === 'em') { const t = inner(); out += t ? '*' + t + '*' : ''; return; }
    if (tag === 's' || tag === 'strike' || tag === 'del') { const t = inner(); out += t ? '~~' + t + '~~' : ''; return; }
    if (tag === 'u') { const t = inner(); out += t ? '<u>' + t + '</u>' : ''; return; }
    if (tag === 'mark') { const t = inner(); out += t ? '==' + t + '==' : ''; return; }
    if (tag === 'code') { out += '`' + c.textContent + '`'; return; }
    if (tag === 'a' && c.classList.contains('wikilink')) {
      const t = c.dataset.target, h = c.dataset.heading ? '#' + c.dataset.heading : '', txt = c.textContent;
      out += '[[' + t + h + (txt !== t + h ? '|' + txt : '') + ']]'; return;
    }
    if (tag === 'a') { out += '[' + inner() + '](' + (c.dataset.href || c.getAttribute('href') || '') + ')'; return; }
    if (c.classList.contains('imath')) { out += '$' + (c.dataset.tex || c.textContent) + '$'; return; }
    if (tag === 'div' || tag === 'p') { const t = inner(); if (out && !out.endsWith('\n')) out += '\n'; out += t; return; }
    out += inner();
  });
  return out;
}

// ---------------- analysis helpers ----------------
export function stripCode(body) {
  return body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
}
export function extractLinks(body) {
  const out = new Set();
  const s = stripCode(body);
  const re = /(?<!!)\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;
  let m;
  while ((m = re.exec(s))) out.add(m[1].trim());
  return [...out];
}
export function extractTags(body) {
  const out = new Set();
  const s = stripCode(body);
  const re = /(^|[\s(])#([\wÀ-￿][\wÀ-￿/-]*)/g;
  let m;
  while ((m = re.exec(s))) if (!/^\d+$/.test(m[2])) out.add(m[2]);
  return [...out];
}
export function plainText(body) {
  return stripCode(body).replace(/^---[\s\S]*?---/, '').replace(/[#>*_`~=\[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function headings(blocks) {
  const out = [];
  blocks.forEach((b, i) => { if (/^h[123]$/.test(b.type)) out.push({ level: +b.type[1], text: b.text.replace(/[*_`~=]|\[\[|\]\]/g, ''), id: b.id, index: i }); });
  return out;
}
export function countWords(body) {
  const t = plainText(body);
  if (!t) return 0;
  const cjk = (t.match(/[ㄱ-ㆎ가-힣一-鿿぀-ヿ]/g) || []).length;
  const words = t.replace(/[ㄱ-ㆎ가-힣一-鿿぀-ヿ]+/g, ' ').split(/\s+/).filter(Boolean).length;
  return words + Math.ceil(cjk / 2.5);
}
