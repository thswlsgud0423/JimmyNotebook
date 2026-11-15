// Import .md / .txt / .html (e.g. Google Docs "Web page (.html, zipped)" or Markdown downloads) into the vault.
import { parseBlocks } from './md.js';

const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'TABLE', 'TR', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR']);

export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,head').forEach(n => n.remove());
  const out = [];
  const inline = (n) => {
    let s = '';
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) { s += c.nodeValue.replace(/\s+/g, ' '); return; }
      if (c.nodeType !== 1) return;
      const t = c.tagName; const st = (c.getAttribute('style') || '').replace(/\s/g, '').toLowerCase();
      let inner = inline(c);
      if (t === 'BR') { s += '\n'; return; }
      if (!inner.trim()) { s += inner; return; }
      const bold = t === 'B' || t === 'STRONG' || /font-weight:(bold|[6-9]00)/.test(st);
      const ital = t === 'I' || t === 'EM' || /font-style:italic/.test(st);
      const strike = t === 'S' || t === 'DEL' || /line-through/.test(st);
      if (t === 'CODE') inner = '`' + inner + '`';
      if (t === 'A' && c.getAttribute('href') && /^https?:/.test(c.getAttribute('href'))) inner = '[' + inner + '](' + c.getAttribute('href') + ')';
      const lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0]; let core = inner.trim();
      if (bold) core = '**' + core + '**'; if (ital) core = '*' + core + '*'; if (strike) core = '~~' + core + '~~';
      s += lead + core + trail;
    });
    return s;
  };
  const walk = (n, depth = 0, listType = null) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) { if (c.nodeValue.trim()) out.push(c.nodeValue.trim()); return; }
      if (c.nodeType !== 1) return;
      const t = c.tagName;
      if (/^H[1-6]$/.test(t)) { out.push('#'.repeat(Math.min(3, +t[1])) + ' ' + inline(c).trim(), ''); return; }
      if (t === 'P') { const s = inline(c).trim(); if (s) out.push(s, ''); return; }
      if (t === 'UL' || t === 'OL') { let i = 1; c.childNodes.forEach((li) => { if (li.tagName !== 'LI') return; const clone = li.cloneNode(true); clone.querySelectorAll('ul,ol').forEach(x => x.remove()); out.push('  '.repeat(depth) + (t === 'OL' ? (i++) + '. ' : '- ') + inline(clone).trim()); li.querySelectorAll(':scope > ul, :scope > ol').forEach(sub => walk({ childNodes: [sub] }, depth + 1)); }); out.push(''); return; }
      if (t === 'BLOCKQUOTE') { out.push(inline(c).trim().split('\n').map(l => '> ' + l).join('\n'), ''); return; }
      if (t === 'PRE') { out.push('```\n' + c.textContent.replace(/\n$/, '') + '\n```', ''); return; }
      if (t === 'HR') { out.push('---', ''); return; }
      if (t === 'IMG') { const src = c.getAttribute('src') || ''; if (/^https?:/.test(src)) out.push('![](' + src + ')', ''); return; }
      if (t === 'TABLE') {
        const rows = [...c.querySelectorAll('tr')].map(tr => [...tr.children].map(td => inline(td).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')));
        if (rows.length) { const w = Math.max(...rows.map(r => r.length)); rows.forEach(r => { while (r.length < w) r.push(''); }); out.push('| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- |').join('')); rows.slice(1).forEach(r => out.push('| ' + r.join(' | ') + ' |')); out.push(''); }
        return;
      }
      if (t === 'DIV' || t === 'BODY' || t === 'SECTION' || t === 'ARTICLE' || t === 'SPAN') {
        if ([...c.children].some(x => BLOCK.has(x.tagName))) walk(c, depth); else { const s = inline(c).trim(); if (s) out.push(s, ''); }
        return;
      }
      walk(c, depth);
    });
  };
  walk(doc.body);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toBlocks(name, ext, content) {
  const e = ext.toLowerCase();
  let md = content;
  if (e === 'html' || e === 'htm') md = htmlToMarkdown(content);
  else if (e === 'txt') md = content.split(/\r?\n\r?\n/).map(p => p.replace(/\r?\n/g, '\n')).join('\n\n');
  md = md.replace(/^---\n[\s\S]*?\n---\n/, '');       // drop foreign front matter (we add our own)
  return parseBlocks(md);
}
