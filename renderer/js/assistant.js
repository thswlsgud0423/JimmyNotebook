// Local AI assistant (Ollama / Qwen running on this computer). Nothing leaves the PC except the optional stock-price lookups.
import { h, escHtml, toast, modal, confirmDialog, openMenu } from './ui.js';
import { icon } from './icons.js';
import * as vault from './vault.js';
import { parseBlocks, serializeBlocks, parsePage, serializePage, mk } from './md.js';
import { buildChartConfig } from './blocks/chart.js';

const SUMMARY_PROMPT = 'Summarize the attached document for my notes: Title & authors, Purpose / research question, Method, Key findings (with numbers), Limitations, and 3 takeaways. Use headings and bullets. After each important fact add its page like (p.3), using the [p.N] markers in the text.';
const FLASH_PROMPT = 'Make 8-12 flashcards from this material. Reply with ONLY one ```flash block containing JSON like {"title":"Deck name","cards":[{"q":"Question","a":"Short answer"}]}. Each card tests ONE fact; questions must be answerable from the material only.';

const DEF = { host: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', temp: 0.4, ctx: 8192, lang: 'auto', style: 'balanced', system: '', usePage: true, custom: [] };
let S = null, panel = null, msgs = [], busy = null, doc = null, selCap = null, unChunk = null, seq = 0;
const waiters = new Map();

export function aiCfg() { const s = S.app.settings; if (!s.ai) s.ai = {}; for (const k in DEF) if (s.ai[k] === undefined) s.ai[k] = Array.isArray(DEF[k]) ? [] : DEF[k]; return s.ai; }
const save = () => S.app.saveSettings();

export function initAssistant(opts) { S = opts; }
export const isOpen = () => !!panel && !panel.hidden;
export function toggleAssistant(force) {
  if (!panel) build();
  panel.hidden = force === undefined ? !panel.hidden : !force;
  document.getElementById('app').classList.toggle('ai-open', !panel.hidden);
  if (!panel.hidden) { refreshModels(); setTimeout(() => panel.querySelector('textarea').focus(), 50); }
}
export function askAssistant(prompt, { send = true } = {}) { toggleAssistant(true); const ta = panel.querySelector('textarea'); ta.value = prompt; if (send) sendMsg(); else ta.focus(); }

// ------------------------------------------------------------------ prompts
const GUIDE = `You are the built-in assistant of "Jimmy Notes", a notes app (Notion-style blocks; every page is a Markdown file). You run locally on the user's computer.
Rules: be accurate and concise. Never invent facts, numbers, quotes or sources — say when you are unsure or when information is missing. Always reply in the language of the user's latest message (English message -> English reply, Korean message -> Korean reply) unless they ask for another language.
Page Markdown you can write: "# " headings, "- " bullets, "1. " numbers, "- [ ] " to-dos, "> " quotes, callouts like "> [!tip] Title" then "> text" (kinds: note, tip, info, warning, danger, success, question, example, idea), **bold**, *italic*, ==highlight==, \`code\`, [[Page name]] links, tables with | pipes and a --- header row, code in \`\`\` fences, math as $inline$ or a block between lines containing only $$.
Charts: a fenced block \`\`\`chart containing ONE JSON object: {"kind":"bar","title":"Title","labels":["A","B"],"series":[{"name":"Series","values":[1,2]}]}. kind is one of bar, hbar, line, area, pie, doughnut, radar. Use only numbers the user gave or that you calculated; every series needs one number per label.
Timelines: \`\`\`timeline with {"title":"T","entries":[{"id":"e1","date":"2026-01-31","kind":"learned","text":"What happened","note":"","link":""}],"sort":"new"}; kind is learned, doing, made, idea or milestone.
Math: solve step by step, double-check the arithmetic, and put final formulas in $$ blocks.
Changing files and folders: ONLY when the user asks you to change pages or folders, end your answer with one fenced block \`\`\`actions containing a JSON array. Operations: {"op":"create_page","path":"Folder/Page name","content":"markdown"}, {"op":"append_to_page","page":"Page name","content":"markdown"}, {"op":"rename","from":"Old name or path","to":"New name"}, {"op":"move","from":"Page or folder","to":"Destination folder (empty = top level)"}, {"op":"create_folder","path":"Folder"}, {"op":"delete_page","page":"Page name"}. Use only page and folder names that exist in the list you are given (or new ones you create). The user reviews and approves the actions before anything happens.
Flashcards: a fenced block \`\`\`flash containing {"title":"Deck","cards":[{"q":"Question","a":"Answer"}]}.
When you use facts from the user's notes (given as NOTE EXCERPTS), cite the page like [[Page name]]; when a fact comes from a PDF page use (p.N).
Stocks: use only the market data provided in the message; never guess prices. Give analysis for information only and say it is not financial advice.`;
const STYLE = { concise: 'Keep answers short and to the point.', balanced: '', detailed: 'Give thorough, well-organised answers with reasoning.' };
const LANG = { en: 'Always answer in English.', ko: '항상 한국어로 답하세요.' };

const STOPW = new Set('the a an and or of to in on for with is are was were be been it this that what which who how why when where do does did my me i you your about from as at by can could would should please tell give using use have has had not no yes note notes page pages'.split(' '));
function notesContext(q) {
  const words = [...new Set((q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter((w) => !STOPW.has(w)))].slice(0, 12); if (!words.length) return '';
  const scored = [];
  for (const p of vault.pages.values()) {
    const hay = (p.name + ' ' + p.text).toLowerCase(); let sc = 0;
    words.forEach((w) => { if (p.name.toLowerCase().includes(w)) sc += 4; const m = hay.split(w).length - 1; sc += Math.min(m, 5); });
    if (sc) scored.push([sc, p]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const top = scored.slice(0, 4); if (!top.length) return 'NOTE EXCERPTS: (no page in the vault matches these words)';
  return 'NOTE EXCERPTS from my vault (best matches first; cite as [[Page name]]):\n' + top.map(([, p]) => {
    const low = p.text.toLowerCase(); let at = 0; for (const w of words) { const i = low.indexOf(w); if (i >= 0) { at = i; break; } }
    return `--- [[${p.name}]]\n${p.text.slice(Math.max(0, at - 300), at + 1200)}`;
  }).join('\n');
}
function pageMd(blocks) { return serializeBlocks(blocks || []).trim(); }
function treeList() {
  const pgs = [...vault.pages.values()].map((p) => vault.keyOf(p.path)).slice(0, 250);
  const dirs = [...vault.dirs].slice(0, 80);
  return 'Folders: ' + (dirs.join(', ') || '(none)') + '\nPages: ' + (pgs.join(', ') || '(none)');
}
function systemPrompt(extra) {
  const c = aiCfg();
  let s = GUIDE;
  if (LANG[c.lang]) s += '\n' + LANG[c.lang]; if (STYLE[c.style]) s += '\n' + STYLE[c.style];
  if (c.system.trim()) s += '\nThe user\'s own instructions (follow them): ' + c.system.trim();
  return s + (extra ? '\n\n' + extra : '');
}

// ------------------------------------------------------------------ plumbing to Ollama
function chat(messages, { silent = false, temp, onText } = {}) {
  const c = aiCfg(); const id = 'a' + Date.now() + (seq++);
  if (onText) waiters.set(id, onText);
  const p = window.api.ai.chat(id, { host: c.host, model: c.model, messages, silent: silent || !onText, options: { temperature: temp ?? c.temp, num_ctx: +c.ctx || 8192 } }).finally(() => waiters.delete(id));
  p.id = id; return p;
}
const stopBusy = () => { if (busy) { window.api.ai.stop(busy); } S.cancel = true; };

async function refreshModels() {
  const c = aiCfg(); const sel = panel.querySelector('.ai-model'); const r = await window.api.ai.models(c.host);
  const st = panel.querySelector('.ai-status');
  if (!r.ok) { st.textContent = r.error; st.hidden = false; return; }
  const names = r.models.map((m) => m.name);
  if (!names.length) { st.textContent = 'Ollama is running but has no models. Run: ollama pull qwen2.5:7b'; st.hidden = false; return; }
  if (!names.includes(c.model)) { const q = names.find((n) => /^qwen/i.test(n)) || names[0]; c.model = q; save(); }
  sel.innerHTML = names.map((n) => `<option ${n === c.model ? 'selected' : ''}>${escHtml(n)}</option>`).join('');
  st.hidden = true;
}

// ------------------------------------------------------------------ context: page, selection, stocks, documents
function captureSelection() {
  const ed = S.getEditor(); selCap = null; if (!ed) return;
  const sel = getSelection(); const t = sel && !sel.isCollapsed ? sel.toString().trim() : '';
  if (!t || !ed.host.contains(sel.anchorNode)) return;
  const c = ed.currentCtx ? ed.currentCtx() : null;
  selCap = { text: t, blockId: c && c.b ? c.b.id : null };
}
const STOP = new Set(['I', 'A', 'AI', 'PDF', 'USD', 'KRW', 'THE', 'AND', 'OR', 'IS', 'IT', 'TO', 'OK', 'PC', 'ID', 'CEO', 'ETF', 'EPS', 'GDP', 'US', 'UK', 'EU', 'KR', 'NO', 'YES', 'MD', 'URL', 'CSV', 'API', 'PE', 'ROE']);
const MONEYWORDS = /stock|ticker|share|price|portfolio|holding|earnings|invest|dividend|etf|market|주식|종목|주가|투자|배당|포트폴리오|시세|보유/i;
async function marketContext(text) {
  const ed = S.getEditor(); let syms = new Set();
  const dollars = text.match(/\$[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b/g) || []; dollars.forEach((s) => syms.add(s.slice(1)));
  if (MONEYWORDS.test(text)) (text.match(/\b[A-Z]{2,5}(?:\.[A-Z]{1,2})?\b|\b\d{6}\.(?:KS|KQ)\b/g) || []).forEach((s) => { if (!STOP.has(s)) syms.add(s); });
  if (/portfolio|holding|my stocks|내 주식|포트폴리오|보유/i.test(text) && ed) {
    (function w(bl) { (bl || []).forEach((b) => { if (b.type === 'portfolio' && b.data) (b.data.holdings || []).forEach((hd) => hd.sym && syms.add(hd.sym)); if (b.children) w(b.children); if (b.cols) b.cols.forEach(w); }); })(ed.blocks);
  }
  syms = [...syms].slice(0, 8); if (!syms.length) return '';
  let q; try { q = await window.api.price.quotes(syms); } catch (e) { return 'Market data lookup failed (offline?). Say you could not fetch prices.'; }
  const lines = [];
  for (const s of syms) {
    const r = q[s]; if (!r || !r.ok) continue;
    const chg = r.prevClose ? ((r.price - r.prevClose) / r.prevClose * 100) : null;
    let ln = `${s} (${r.name}, ${r.exchange || '?'}): price ${r.price} ${r.currency || ''}${chg != null ? `, day change ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : ''}`;
    if (r.spark && r.spark.length > 5) { const f = r.spark[0], l = r.spark[r.spark.length - 1]; ln += `, ~1-month move ${((l - f) / f * 100).toFixed(1)}%`; }
    if (syms.length <= 3) {
      try {
        const [d, n] = await Promise.all([window.api.price.detail(s), window.api.price.news(s, r.name)]);
        if (d) ln += `\n  fundamentals: sector ${d.sector || '?'}, market cap ${d.marketCap || '?'}, P/E ${d.pe ?? '?'}, forward P/E ${d.forwardPE ?? '?'}, EPS ${d.eps ?? '?'}, revenue growth ${d.revenueGrowth ?? '?'}, profit margin ${d.profitMargin ?? '?'}, debt/equity ${d.debtToEquity ?? '?'}, 52w range ${d.low52 ?? '?'}–${d.high52 ?? '?'}, analyst target ${d.targetPrice ?? '?'} (${d.recommendation || '?'})${d.summary ? '\n  business: ' + d.summary : ''}`;
        if (n && n.length) ln += '\n  recent headlines: ' + n.slice(0, 6).map((x) => '"' + x.title + '" (' + x.publisher + ')').join('; ');
      } catch (e) { /* optional */ }
    }
    lines.push(ln);
  }
  return lines.length ? 'LIVE MARKET DATA (fetched just now from Yahoo Finance):\n' + lines.join('\n') : 'Market lookup found no data for: ' + syms.join(', ') + '.';
}
const chunks = (t, n) => { const out = []; for (let i = 0; i < t.length; i += n) out.push(t.slice(i, i + n)); return out; };
async function docContext(setStatus) {
  if (!doc) return '';
  if (doc.text.length <= 9000) return `ATTACHED DOCUMENT "${doc.name}" (${doc.pages ? doc.pages + ' pages' : 'text'}):\n${doc.text}`;
  if (!doc.notes) {
    const parts = chunks(doc.text, 6000); const notes = [];
    for (let i = 0; i < parts.length; i++) {
      if (S.cancel) throw new Error('stopped');
      setStatus(`Reading "${doc.name}" — part ${i + 1} of ${parts.length}…`);
      const r = await chat([{ role: 'system', content: 'You condense documents faithfully. Never add information that is not in the text.' }, { role: 'user', content: `Part ${i + 1} of ${parts.length} of "${doc.name}". Write 6–10 bullet points with every key fact, number, method, result and conclusion in this part:\n\n${parts[i]}` }], { silent: true, temp: 0.1 });
      busy = r.id; const res = await r; busy = null;
      if (!res.ok) throw new Error(res.error || 'AI error'); if (res.stopped) throw new Error('stopped');
      notes.push(`[part ${i + 1}]\n${res.text.trim()}`);
    }
    doc.notes = notes.join('\n\n');
  }
  return `ATTACHED DOCUMENT "${doc.name}" (${doc.pages ? doc.pages + ' pages, ' : ''}condensed notes of the full text):\n${doc.notes.slice(0, 11000)}`;
}

// ------------------------------------------------------------------ chat flow
const CHIPS = [
  { t: '✨ Summarize page', p: 'Summarize this page in a clear, well-structured way (key points as bullets, then a one-line takeaway).', page: true },
  { t: '✏️ Fix grammar', p: 'Fix the grammar, spelling and punctuation. Keep the meaning, tone and Markdown formatting. Reply with ONLY the corrected text.', pick: true, edit: true },
  { t: '🎨 Decorate', p: 'Improve the structure and look of this text: add clear headings, short bullets, a callout for the key point, and a few fitting emojis. Do not change the meaning or remove information. Reply with ONLY the Markdown.', pick: true, edit: true },
  { t: '📊 Make a chart', p: 'Make a chart from this data: ', input: true, page: true },
  { t: '🧮 Solve math', p: 'Solve this step by step and verify the result: ', input: true, pick: true },
  { t: '🌐 Translate', p: 'Translate to the other language (Korean ↔ English). Reply with ONLY the translation.', pick: true, edit: true },
  { t: '📄 Summarize a PDF / paper', file: true },
  { t: '📈 Analyze a stock', p: 'Analyze the stock $', input: true, stock: true },
  { t: '🗂 Organize my notes', p: 'Look at my folders and pages and propose a cleaner organization: new folders and which pages to move into them. Give the proposal as actions I can approve.', tree: true },
  { t: '✅ Make to-dos', p: 'Turn this into a to-do list ("- [ ] ") with clear, actionable items. Reply with ONLY the Markdown.', pick: true, edit: true },
  { t: '🃏 Flashcards', p: FLASH_PROMPT, pick: true, page: true },
  { t: '🔎 Ask my notes', p: 'Using my notes, answer: ', input: true, notes: true },
  { t: '💡 Explain simply', p: 'Explain this in simple words, like to a smart 12-year-old, with one everyday example.', pick: true, page: true },
  { t: '✂️ Shorter', p: 'Rewrite this much shorter, keeping every important fact. Reply with ONLY the text.', pick: true, edit: true },
  { t: '➕ Continue writing', p: 'Continue writing this page in the same style and language for another few paragraphs. Reply with ONLY the new text.', page: true },
  { t: '❓ Quiz me', p: 'Write 8 study questions with short answers from this page, as a Markdown list (question in bold, answer under it).', page: true }
];

async function sendMsg(forced) {
  const ta = panel.querySelector('textarea'); const c = aiCfg();
  let text = forced ? forced.p : ta.value.trim(); if (!text || busy) return;
  captureSelection();
  const spec = forced || {};
  const ed = S.getEditor(), cur = S.getCur();
  const hasSel = !!selCap;
  const area = panel.querySelector('.ai-msgs');
  ta.value = ''; autosize(ta);
  const userEl = addMsg('user', text + (hasSel ? '\n\n(selected text attached)' : '')); area.scrollTop = area.scrollHeight;
  const botEl = addMsg('bot', ''); botEl.classList.add('typing'); botEl.querySelector('.ai-body').innerHTML = '<span class="ai-dots"><i></i><i></i><i></i></span>';
  setBusy(true); S.cancel = false;
  const status = (t) => { botEl.querySelector('.ai-body').innerHTML = `<span class="muted">${escHtml(t)}</span>`; };
  let reply = '';
  try {
    const ctxParts = [];
    if (cur && ed && c.usePage && !(spec.pick && hasSel)) {
      const md = pageMd(ed.blocks); const nm = vault.pages.get(cur.path) ? vault.pages.get(cur.path).name : 'page';
      if (md) ctxParts.push(`CURRENT PAGE "${nm}":\n${md.slice(0, 7000)}${md.length > 7000 ? '\n…(page continues)' : ''}`);
    }
    if (hasSel) ctxParts.push('SELECTED TEXT:\n' + selCap.text.slice(0, 6000));
    if (spec.tree || /folder|organi[sz]e|move|rename|delete|폴더|정리|이동|이름|삭제|만들어|create (a )?(page|folder)/i.test(text)) ctxParts.push('MY NOTES:\n' + treeList());
    if (doc) ctxParts.push(await docContext(status));
    if (spec.notes || /my notes|in my vault|내 노트|내 메모|노트에서/i.test(text)) { const ex = notesContext(text); if (ex) ctxParts.push(ex); }
    const mk2 = await marketContext(text + ' ' + (spec.stock ? '$' : ''));
    if (mk2) ctxParts.push(mk2);
    let userContent = text;
    if (spec.edit) userContent = text + '\n\n' + (hasSel ? 'TEXT:\n' + selCap.text : 'TEXT:\n' + (ed ? pageMd(ed.blocks).slice(0, 7000) : ''));
    const history = forced ? [] : msgs.slice(-8);          // one-click actions work on the current page only, not on earlier chat
    const messages = [{ role: 'system', content: systemPrompt(ctxParts.join('\n\n')) }, ...history, { role: 'user', content: userContent }];
    const p = chat(messages, { onText: (t) => { reply += t; botEl.classList.remove('typing'); paintBody(botEl, reply, false); area.scrollTop = area.scrollHeight; } });
    busy = p.id; const res = await p; busy = null;
    if (!res.ok) { botEl.querySelector('.ai-body').innerHTML = `<span class="ai-err">${escHtml(res.error || 'AI error')}</span>`; if (!reply) { msgs.push({ role: 'user', content: text }); return; } }
    reply = res.text || reply;
    msgs.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    botEl.classList.remove('typing'); paintBody(botEl, reply, true, { spec, sel: selCap });
    if (spec.note && res.ok && reply.trim()) await noteFromSummary(spec.note.rel, reply);
  } catch (e) {
    botEl.classList.remove('typing');
    if (String(e.message) === 'stopped') botEl.querySelector('.ai-body').innerHTML = '<span class="muted">Stopped.</span>';
    else botEl.querySelector('.ai-body').innerHTML = `<span class="ai-err">${escHtml(e.message || e)}</span>`;
  } finally { busy = null; setBusy(false); area.scrollTop = area.scrollHeight; }
}

// ------------------------------------------------------------------ rendering replies
const inline = (s) => escHtml(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/==([^=]+)==/g, '<mark>$1</mark>').replace(/\[\[([^\]]+)\]\]/g, (m, t) => `<span class="ai-link${/\.pdf/i.test(t) ? ' pdf' : ''}" data-t="${t.replace(/"/g, '&quot;')}">${t.split('|').pop().replace(/#.*$/, (x) => (/\|/.test(t) ? '' : x))}</span>`);
function mdLite(t) {
  const out = []; const lines = t.split('\n'); let i = 0, list = null;
  const close = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\$\$/.test(l)) { close(); const buf = [l.replace(/^\s*\$\$/, '')]; if (!/\$\$\s*$/.test(l) || l.trim() === '$$') { i++; while (i < lines.length && !/\$\$/.test(lines[i])) buf.push(lines[i++]); buf.push((lines[i] || '').replace(/\$\$.*/, '')); } const tex = buf.join('\n').replace(/\$\$\s*$/, '').trim(); let html = escHtml(tex); try { if (window.katex) html = window.katex.renderToString(tex, { displayMode: true, throwOnError: false }); } catch (e) { /* */ } out.push('<div class="ai-math">' + html + '</div>'); i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { close(); out.push(`<h${m[1].length + 2} class="ai-h">${inline(m[2])}</h${m[1].length + 2}>`); }
    else if ((m = l.match(/^\s*[-*+]\s+\[( |x)\]\s+(.*)/i))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${m[1] === ' ' ? '☐' : '☑'} ${inline(m[2])}</li>`); }
    else if ((m = l.match(/^\s*[-*+]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = l.match(/^>\s?(.*)/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (/^\s*\|.*\|\s*$/.test(l)) {
      close(); const rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); i++; }
      out.push('<table class="ai-tbl">' + rows.map((r, ri) => '<tr>' + r.map((c) => `<${ri ? 'td' : 'th'}>${inline(c)}</${ri ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'); continue;
    }
    else if (!l.trim()) close();
    else { close(); out.push(`<p>${inline(l)}</p>`); }
    i++;
  }
  close(); return out.join('');
}
function splitReply(text) {
  const segs = []; const re = /```([\w-]*)[ \t]*\n([\s\S]*?)(?:```|$)/g; let last = 0, m;
  while ((m = re.exec(text))) { if (m.index > last) segs.push({ t: 'md', s: text.slice(last, m.index) }); segs.push({ t: 'fence', lang: m[1].toLowerCase(), s: m[2] }); last = re.lastIndex; }
  if (last < text.length) segs.push({ t: 'md', s: text.slice(last) });
  return segs;
}
const citeLinks = (t) => { const d = doc && doc.rel && vault.docs.get(doc.rel); return d ? t.replace(/[(\[]\s*p(?:p)?\.?\s*(\d{1,4})(?:\s*[-–,]\s*\d+)?\s*[)\]]/gi, (m, n) => ' [[' + d.name + '#page=' + n + '|p.' + n + ']]') : t; };
const cleanForPage = (text) => { // what to put into the page: drop the actions block, unwrap a single ```markdown fence
  let t = text.replace(/```actions[\s\S]*?(```|$)/g, '').trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/); if (m) t = m[1];
  return citeLinks(t.trim());
};
function paintBody(botEl, text, final, meta) {
  const body = botEl.querySelector('.ai-body'); const segs = splitReply(text); let html = '';
  if (!body._linkBound) { body._linkBound = true; body.addEventListener('click', (e) => { const l = e.target.closest('.ai-link'); if (l) { const t = l.dataset.t || l.textContent; const [nm, hd] = t.split('#'); S.app.openLink(nm.split('|')[0], hd || ''); } }); }
  const holders = [];
  segs.forEach((g, i) => {
    if (g.t === 'md') html += mdLite(g.s);
    else if (g.lang === 'chart' || g.lang === 'timeline' || g.lang === 'flash') { html += `<div class="ai-rich" data-i="${i}"></div>`; holders.push(i); }
    else if (g.lang === 'actions') html += '<div class="ai-act" data-i="' + i + '"></div>';
    else if (g.lang === 'math') html += mdLite('$$\n' + g.s + '\n$$');
    else html += `<pre class="ai-code"><code>${escHtml(g.s)}</code></pre>`;
  });
  body.innerHTML = html;
  if (!final) return;
  botEl._text = text;
  body.querySelectorAll('.ai-rich').forEach((el) => {
    const g = segs[+el.dataset.i]; let d = null; try { d = JSON.parse(g.s); } catch (e) { /* */ }
    if (!d) { el.innerHTML = `<pre class="ai-code"><code>${escHtml(g.s)}</code></pre><div class="ai-err">This block is not valid JSON, so it cannot be added.</div>`; return; }
    if (g.lang === 'flash') {
      const cards = (Array.isArray(d.cards) ? d.cards : []).filter((c) => c && c.q && c.a).map((c) => ({ q: String(c.q), a: String(c.a) }));
      if (!cards.length) { el.innerHTML = '<div class="ai-err">No usable cards in this answer.</div>'; return; }
      el.innerHTML = `<div class="ai-chartbox" style="height:auto;padding:8px"><b>${escHtml(d.title || 'Flashcards')}</b> · ${cards.length} cards<ul style="margin:4px 0 0">${cards.slice(0, 4).map((c) => '<li>' + escHtml(c.q) + '</li>').join('')}${cards.length > 4 ? '<li class="muted">…</li>' : ''}</ul></div><button class="btn sm primary" data-add>Add these flashcards to my page</button>`;
      el.querySelector('[data-add]').onclick = () => insertBlocks([mk('flash', { data: { title: d.title || 'Flashcards', cards, i: 0 } })]);
    } else if (g.lang === 'chart') {
      if (!Array.isArray(d.labels) || !Array.isArray(d.series)) { el.innerHTML = '<div class="ai-err">The chart data is incomplete.</div>'; return; }
      d.series.forEach((s) => { s.values = (s.values || []).map((v) => +v || 0); });
      el.innerHTML = '<div class="ai-chartbox"><canvas></canvas></div><button class="btn sm primary" data-add>Add this chart to my page</button>';
      try { new window.Chart(el.querySelector('canvas'), buildChartConfig(d, false)); } catch (e) { /* preview optional */ }
      el.querySelector('[data-add]').onclick = () => insertBlocks([mk('chart', { data: d })]);
    } else {
      el.innerHTML = `<div class="ai-chartbox muted" style="padding:8px">Timeline “${escHtml(d.title || '')}” · ${(d.entries || []).length} entries</div><button class="btn sm primary" data-add>Add this timeline to my page</button>`;
      el.querySelector('[data-add]').onclick = () => insertBlocks([mk('timeline', { data: Object.assign({ entries: [], sort: 'new' }, d) })]);
    }
  });
  body.querySelectorAll('.ai-act').forEach((el) => {
    const g = segs[+el.dataset.i]; let ops = null; try { ops = JSON.parse(g.s); } catch (e) { /* */ }
    if (!Array.isArray(ops) || !ops.length) { el.remove(); return; }
    el.innerHTML = `<div class="ai-acth">Proposed changes</div><ul>${ops.map((o) => `<li class="${o.op === 'delete_page' ? 'danger' : ''}">${escHtml(describeOp(o))}</li>`).join('')}</ul><button class="btn sm primary" data-run>Run these changes</button><span class="muted"> Nothing happens until you press the button. Deleted pages go to the Trash.</span>`;
    el.querySelector('[data-run]').onclick = async (e) => { e.target.disabled = true; const res = await runOps(ops); el.querySelector('[data-run]').insertAdjacentHTML('afterend', `<div class="ai-done">${escHtml(res)}</div>`); };
  });
  // buttons under the message
  const bar = botEl.querySelector('.ai-bar'); bar.innerHTML = '';
  const content = cleanForPage(text); if (!content) return;
  const add = (label, fn, cls = '') => { const b = h(`<button class="ai-b ${cls}">${label}</button>`); b.onclick = fn; bar.appendChild(b); };
  if (S.getEditor()) {
    add('＋ Insert into page', () => insertBlocks(parseBlocks(content)));
    if (meta && meta.sel) add('↔ Replace selection', () => replaceSelection(meta.sel, content));
    if (meta && meta.spec && meta.spec.edit && !meta.sel) add('↔ Replace page', async () => { if (await confirmDialog('Replace the whole page with this version? You can undo with Ctrl+Z.', 'Replace', false, 'Replace page?')) replacePage(parseBlocks(content)); });
  }
  add('Copy', () => { navigator.clipboard.writeText(content).then(() => toast('Copied')); });
  if (S.getEditor() && /summary|summar|요약/i.test((meta && meta.spec && meta.spec.p) || '') === false) { /* no-op */ }
  add('New page', async () => { const nm = (content.match(/^#\s+(.+)$/m) || [null, 'AI note'])[1].slice(0, 60); const src = doc && doc.rel && vault.docs.get(doc.rel); const path = await vault.createPage(src ? src.dir : '', nm, { blocks: (src ? [mk('callout', { kind: 'info', title: 'Source', text: '[[' + src.name + ']]' })] : []).concat(parseBlocks(content)) }); S.app.refresh(); S.app.open(path); });
}

// ------------------------------------------------------------------ applying results
function insertBlocks(blocks) {
  const ed = S.getEditor(); if (!ed) return toast('Open a page first');
  const root = ed.root; const c = root.currentCtx();
  const target = c ? c.ed : root; const arr = blocks.length ? blocks : [mk('p')];
  if (c) target.blocks.splice(target.idx(c.b) + 1, 0, ...arr); else root.blocks.push(...arr);
  const last = root.blocks[root.blocks.length - 1]; if (last.type !== 'p') root.blocks.push(mk('p'));
  root.changed(true); root.render(); toast('Added to your page');
}
function replacePage(blocks) { const ed = S.getEditor(); if (!ed) return; ed.root.blocks = blocks.length ? blocks : [mk('p')]; ed.root.changed(true); ed.root.render(); toast('Page updated — Ctrl+Z undoes it'); }
function findBlock(blocks, id) { for (const b of blocks || []) { if (b.id === id) return b; const k = findBlock(b.children, id) || (b.cols || []).map((c) => findBlock(c, id)).find(Boolean); if (k) return k; } return null; }
function replaceSelection(sel, content) {
  const ed = S.getEditor(); if (!ed) return; const root = ed.root;
  const b = sel.blockId ? findBlock(root.blocks, sel.blockId) : null;
  const flat = content.replace(/\n+/g, ' ').trim();
  if (b && typeof b.text === 'string') {
    const norm = (s) => s.replace(/\s+/g, ' ');
    const plainText = norm(b.text.replace(/[*_`~=]/g, '')); const needle = norm(sel.text);
    if (b.text.includes(sel.text)) b.text = b.text.replace(sel.text, () => flat);
    else if (plainText === needle) b.text = flat;
    else { toast('Could not find the exact spot — inserted below instead'); return insertBlocks(parseBlocks(content)); }
    root.changed(true); root.render(); return toast('Replaced — Ctrl+Z undoes it');
  }
  insertBlocks(parseBlocks(content));
}

// ------------------------------------------------------------------ file / folder actions (always approved by the user first)
function describeOp(o) {
  switch (o.op) {
    case 'create_page': return `Create page “${o.path}”`;
    case 'append_to_page': return `Add text to “${o.page}”`;
    case 'rename': return `Rename “${o.from}” → “${o.to}”`;
    case 'move': return `Move “${o.from}” → ${o.to ? '“' + o.to + '”' : 'top level'}`;
    case 'create_folder': return `Create folder “${o.path}”`;
    case 'delete_page': return `Delete page “${o.page}” (goes to Trash)`;
    default: return 'Unknown step: ' + JSON.stringify(o).slice(0, 60);
  }
}
const stripMd = (s) => String(s || '').replace(/\.md$/i, '').replace(/^\/+|\/+$/g, '');
async function runOps(ops) {
  await S.app.flush(); let ok = 0; const errs = [];
  for (const o of ops.slice(0, 40)) {
    try {
      if (o.op === 'create_page') { const k = stripMd(o.path); const parent = vault.dirName(k + '.md'); await vault.createPage(parent, vault.baseName(k + '.md'), { blocks: parseBlocks(o.content || '') }); }
      else if (o.op === 'append_to_page') {
        const p = vault.resolve(stripMd(o.page)); if (!p) throw new Error('page not found: ' + o.page);
        const { props, blocks } = parsePage(vault.pages.get(p.path).src); blocks.push(...parseBlocks(o.content || '')); await vault.saveRaw(p.path, serializePage(props, blocks));
      } else if (o.op === 'rename') {
        const from = stripMd(o.from); const p = vault.resolve(from);
        if (p) await vault.renamePage(p.path, stripMd(o.to).replace(/^.*\//, '')); else if (vault.dirs.has(from)) await vault.renameFolder(from, stripMd(o.to).replace(/^.*\//, '')); else throw new Error('not found: ' + o.from);
      } else if (o.op === 'move') {
        const from = stripMd(o.from), to = stripMd(o.to); const p = vault.resolve(from);
        if (to && !vault.dirs.has(to)) await vault.createFolder(vault.dirName(to + '.md'), vault.baseName(to + '.md'));
        if (p) await vault.movePage(p.path, to); else if (vault.dirs.has(from)) await vault.moveKey(from, to); else throw new Error('not found: ' + o.from);
      } else if (o.op === 'create_folder') { const k = stripMd(o.path); await vault.createFolder(vault.dirName(k + '.md'), vault.baseName(k + '.md')); }
      else if (o.op === 'delete_page') { const p = vault.resolve(stripMd(o.page)); if (!p) throw new Error('page not found: ' + o.page); await vault.deletePage(p.path); }
      else throw new Error('unknown step');
      ok++;
    } catch (e) { errs.push(describeOp(o) + ' — ' + (e.message || e)); }
  }
  await vault.reload(); S.app.refresh();
  if (S.getCur() && !vault.pages.get(S.getCur().path)) S.app.openView({ type: 'home' }); else S.app.openView(S.app.state.view, false);
  return `Done: ${ok} step${ok === 1 ? '' : 's'}.` + (errs.length ? ' Problems: ' + errs.join('; ') : '');
}

// ------------------------------------------------------------------ panel UI
function addMsg(role, text) {
  const el = h(`<div class="ai-m ${role}"><div class="ai-body"></div><div class="ai-bar"></div></div>`);
  if (role === 'user') el.querySelector('.ai-body').textContent = text;
  panel.querySelector('.ai-msgs').appendChild(el); panel.querySelector('.ai-empty') && panel.querySelector('.ai-empty').remove(); return el;
}
function setBusy(b) { panel.classList.toggle('busy', b); panel.querySelector('[data-send]').hidden = b; panel.querySelector('[data-stop]').hidden = !b; }
const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
async function attachFile(fp, rel) {
  const r = await window.api.ai.pickFile(fp); if (!r) return;
  if (r.error || !r.text.trim()) return toast(r.error || 'No readable text found (a scanned PDF needs OCR first)');
  doc = { name: r.name, text: r.text, pages: r.pages, notes: null, rel: rel || null }; paintDoc();
  toast('Attached “' + r.name + '” — ask me to summarize it');
}
function paintDoc() {
  const d = panel.querySelector('.ai-doc');
  if (!doc) { d.hidden = true; return; }
  d.hidden = false; d.innerHTML = `📄 <b>${escHtml(doc.name)}</b> <span class="muted">${doc.pages ? doc.pages + ' pages · ' : ''}${Math.round(doc.text.length / 1000)}k characters</span><button class="iconbtn" data-x title="Remove">${icon('x', 14)}</button>`;
  d.querySelector('[data-x]').onclick = () => { doc = null; paintDoc(); };
}
function paintChips() {
  const c = aiCfg(); const box = panel.querySelector('.ai-chips'); box.innerHTML = '';
  [...CHIPS, ...c.custom.map((x) => ({ t: '⭐ ' + x.label, p: x.prompt, pick: true, page: true }))].forEach((ch) => {
    const b = h(`<button class="ai-chip">${escHtml(ch.t)}</button>`);
    b.onclick = async () => {
      if (ch.file) { await attachFile(); if (doc) sendMsg({ p: 'Summarize the attached document for my notes: Title & authors, Purpose / research question, Method, Key findings (with numbers), Limitations, and 3 takeaways. Use headings and bullets.', page: false }); return; }
      if (ch.input) { const ta = panel.querySelector('textarea'); ta.value = ch.p; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); autosize(ta); return; }
      sendMsg(ch);
    };
    b.onmousedown = (e) => e.preventDefault();
    box.appendChild(b);
  });
}
function build() {
  panel = h(`<aside id="aipanel" hidden>
    <div class="ai-h"><span class="ai-t">${icon('sparkle', 16)} AI assistant</span><select class="ai-model" title="Which local model to use"></select>
      <button class="iconbtn" data-c="attach" title="Attach a PDF / paper / text file">${icon('file', 16)}</button><button class="iconbtn" data-c="clear" title="New chat">${icon('plus', 16)}</button><button class="iconbtn" data-c="set" title="Customize the assistant">${icon('settings', 16)}</button><button class="iconbtn" data-c="x" title="Close (Ctrl+J)">${icon('x', 16)}</button></div>
    <div class="ai-status" hidden></div>
    <div class="ai-doc" hidden></div>
    <div class="ai-msgs"><div class="ai-empty"><b>Hi! I run on your computer — private and free.</b><p>I can read your page, fix grammar, make charts, solve math, summarize PDFs and papers, talk about stocks, and organize your pages and folders. Pick a shortcut below, drop a PDF onto this panel, or just ask.</p></div></div>
    <div class="ai-chips"></div>
    <div class="ai-in"><textarea rows="1" placeholder="Ask anything…  (Enter = send, Shift+Enter = new line)"></textarea><button class="btn primary sm" data-send>Send</button><button class="btn sm" data-stop hidden>Stop</button></div>
    <label class="ai-ctx"><input type="checkbox" data-usepage> use the open page as context</label>
  </aside>`);
  document.getElementById('app').appendChild(panel);
  const ta = panel.querySelector('textarea');
  ta.addEventListener('input', () => autosize(ta));
  ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMsg(); } if (e.key === 'Escape') toggleAssistant(false); });
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  panel.addEventListener('mousedown', (e) => { if (!e.target.closest('textarea,select,input')) e.preventDefault(); });   // keep the page selection while clicking buttons
  panel.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); panel.classList.add('drop'); } });
  panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop'); });
  panel.addEventListener('drop', async (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; panel.classList.remove('drop'); if (!f) return; e.preventDefault(); const p = window.api.ai.pathOf(f); if (p) { await attachFile(p); if (doc) sendMsg({ p: 'Summarize the attached document for my notes: Title & authors, Purpose / research question, Method, Key findings (with numbers), Limitations, and 3 takeaways. Use headings and bullets.', page: false }); } });
  panel.querySelector('[data-send]').onclick = () => sendMsg();
  panel.querySelector('[data-stop]').onclick = stopBusy;
  const up = panel.querySelector('[data-usepage]'); up.checked = aiCfg().usePage; up.onchange = () => { aiCfg().usePage = up.checked; save(); };
  panel.querySelector('.ai-model').onchange = (e) => { aiCfg().model = e.target.value; save(); };
  panel.querySelector('.ai-h').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    if (b.dataset.c === 'x') toggleAssistant(false);
    else if (b.dataset.c === 'attach') attachFile();
    else if (b.dataset.c === 'clear') { msgs = []; doc = null; paintDoc(); panel.querySelector('.ai-msgs').innerHTML = '<div class="ai-empty muted">New chat.</div>'; }
    else if (b.dataset.c === 'set') openAiSettings();
  });
  if (!unChunk) unChunk = window.api.ai.onChunk((id, t) => { const f = waiters.get(id); if (f) f(t); });
  paintChips();
}

async function noteFromSummary(rel, reply) {
  const d = vault.docs.get(rel); if (!d) return;
  const body = cleanForPage(reply);
  const blocks = [mk('callout', { kind: 'info', title: 'Source', text: '[[' + d.name + ']]' }), ...parseBlocks(body), mk('h2', { text: 'My thoughts' }), mk('p', { text: '' })];
  const path = await vault.createPage(d.dir, 'Summary - ' + d.name.replace(/\.pdf$/i, ''), { props: { icon: '📝', tags: ['paper', 'summary', 'ai'] }, blocks });
  S.app.refresh(); toast('Summary note created next to the PDF — it links back to it');
  const row = h(`<div class="ai-done">📝 Saved as a note: <button class="ai-b">Open “${escHtml(vault.pages.get(path) ? vault.pages.get(path).name : 'Summary')}”</button></div>`);
  row.querySelector('button').onclick = () => S.app.open(path);
  const last = [...panel.querySelectorAll('.ai-m.bot')].pop(); if (last) last.appendChild(row);
}
export async function summarizeVaultPdf(rel) {
  if (!panel) build(); toggleAssistant(true);
  const abs = vault.vaultPath.replace(/\\/g, '/') + '/' + rel;
  await attachFile(abs, rel); if (!doc) return;
  sendMsg({ p: SUMMARY_PROMPT, page: false, note: { rel } });
}

export function openAiSettings() {
  const c = aiCfg();
  const m = modal(`<div class="modal-h">Customize the AI assistant <span style="flex:1"></span><button class="iconbtn" data-x>${icon('x', 18)}</button></div><div class="modal-b ai-set">
    <div class="set-row"><div class="lbl">Model<small>Any model installed in Ollama (see <code>ollama list</code>)</small></div><select class="inp" data-k="model"></select></div>
    <div class="set-row"><div class="lbl">Reply language</div><div class="seg">${[['auto', 'Same as me'], ['en', 'English'], ['ko', '한국어']].map(([v, l]) => `<button data-lang="${v}" class="${c.lang === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="set-row"><div class="lbl">Answer style</div><div class="seg">${[['concise', 'Short'], ['balanced', 'Balanced'], ['detailed', 'Detailed']].map(([v, l]) => `<button data-style="${v}" class="${c.style === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="set-row"><div class="lbl">Creativity<small>Low = precise (math, grammar) · High = more creative</small></div><input type="range" min="0" max="1" step="0.1" value="${c.temp}" data-k="temp" style="width:160px"> <span data-tv>${c.temp}</span></div>
    <div class="set-row"><div class="lbl">Memory size<small>How much text it can read at once. Bigger = slower, uses more RAM</small></div><div class="seg">${[[4096, 'Small'], [8192, 'Normal'], [16384, 'Large']].map(([v, l]) => `<button data-ctx="${v}" class="${+c.ctx === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div style="margin:10px 0 4px;font-weight:700">Your own instructions<div class="muted" style="font-weight:400;font-size:12.5px">Always followed, e.g. “I am a biology student. Explain simply. Use British spelling.”</div></div>
    <textarea class="inp" data-k="system" rows="3" style="width:100%" placeholder="(optional)">${escHtml(c.system)}</textarea>
    <div style="margin:14px 0 4px;font-weight:700">My shortcut buttons<div class="muted" style="font-weight:400;font-size:12.5px">Add your own one-click prompts (they work on your selected text or the page).</div></div>
    <div data-cust></div>
    <div style="display:flex;gap:6px;margin-top:6px"><input class="inp" data-nl placeholder="Button name" style="width:150px"><input class="inp" data-np placeholder="What should it do? e.g. Rewrite in a friendly tone" style="flex:1"><button class="btn sm primary" data-addc>Add</button></div>
    <div style="margin:14px 0 4px;font-weight:700">Ollama address</div><input class="inp" data-k="host" value="${escHtml(c.host)}" style="width:100%">
    <div class="muted" style="font-size:12.5px;margin-top:4px">Everything runs on your computer through Ollama. Page text is only sent to this address.</div>
  </div>`, { wide: true });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  const sel = m.el.querySelector('select[data-k=model]');
  window.api.ai.models(c.host).then((r) => { const names = r.ok ? r.models.map((x) => x.name) : [c.model]; sel.innerHTML = names.map((n) => `<option ${n === c.model ? 'selected' : ''}>${escHtml(n)}</option>`).join(''); });
  const cust = () => { m.el.querySelector('[data-cust]').innerHTML = c.custom.map((x, i) => `<div class="ai-cu"><b>${escHtml(x.label)}</b><span class="muted">${escHtml(x.prompt)}</span><button class="iconbtn" data-del="${i}">${icon('x', 14)}</button></div>`).join('') || '<div class="muted" style="font-size:13px">None yet.</div>'; };
  cust();
  m.el.addEventListener('click', (e) => {
    const t = e.target;
    const l = t.closest('[data-lang]'); if (l) { c.lang = l.dataset.lang; save(); l.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === l)); }
    const st = t.closest('[data-style]'); if (st) { c.style = st.dataset.style; save(); st.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === st)); }
    const cx = t.closest('[data-ctx]'); if (cx) { c.ctx = +cx.dataset.ctx; save(); cx.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === cx)); }
    const d = t.closest('[data-del]'); if (d) { c.custom.splice(+d.dataset.del, 1); save(); cust(); paintChips(); }
    if (t.closest('[data-addc]')) { const lb = m.el.querySelector('[data-nl]').value.trim(), pr = m.el.querySelector('[data-np]').value.trim(); if (lb && pr) { c.custom.push({ label: lb, prompt: pr }); save(); m.el.querySelector('[data-nl]').value = ''; m.el.querySelector('[data-np]').value = ''; cust(); paintChips(); } else toast('Give the button a name and an instruction'); }
  });
  m.el.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.k; if (!k) return;
    c[k] = k === 'temp' ? +e.target.value : e.target.value; if (k === 'temp') m.el.querySelector('[data-tv]').textContent = e.target.value; save();
    if (k === 'model' && panel) refreshModels();
  });
  m.el.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.k === 'host' && panel) refreshModels(); });
}
