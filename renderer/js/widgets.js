// Widget catalog. Widgets work both on the Home dashboard and as blocks inside any page ( /widget ).
// render(body, inst, api): inst = { id, kind, w, cfg }  ·  api = { save(), app }
import * as vault from './vault.js';
import { icon } from './icons.js';
import { h, escHtml, ago, fmtMoney, fmtPct, promptDialog, formDialog, openMenu, modal, toast, debounce } from './ui.js';
import { liveSummary } from './blocks/portfolio.js';
import { renderStudyWidget } from './study.js';
import { themeColors, cssVar } from './blocks/common.js';
import { openStock } from './blocks/stock.js';
import { linkDialog, openTarget, describe, iconFor } from './links.js';

let app = null;
export const setApp = (a) => { app = a; };
const cover = (c) => (c && !c.includes('/') ? 'cv-' + c : 'cv-slate');
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- helpers shared with views ----------
export function allTodos(limit = 8) {
  const out = [];
  for (const p of vault.pages.values()) {
    if (p.path.startsWith('Templates/')) continue;
    const lines = p.src.split('\n');
    lines.forEach((ln, i) => { const m = ln.match(/^(\s*)- \[ \] (.+)$/); if (m && out.length < 300) out.push({ text: m[2], page: p, line: i }); });
  }
  return { list: out.slice(0, limit), total: out.length };
}
async function checkTodo(t) {
  const p = vault.pages.get(t.page.path); if (!p) return;
  const lines = p.src.split('\n');
  if (!/^(\s*)- \[ \] /.test(lines[t.line] || '')) { await vault.reload(); return; }
  lines[t.line] = lines[t.line].replace('- [ ] ', '- [x] ');
  await vault.saveRaw(p.path, lines.join('\n'));
}
async function editTodoLine(t, text) {
  const p = vault.pages.get(t.page.path); if (!p) return;
  const lines = p.src.split('\n'); const m = (lines[t.line] || '').match(/^(\s*[-*+] \[ \] )/);
  if (!m) { await vault.reload(); return; }
  lines[t.line] = m[1] + text; await vault.saveRaw(p.path, lines.join('\n'));
}
async function deleteTodoLine(t) {
  const p = vault.pages.get(t.page.path); if (!p) return;
  const lines = p.src.split('\n'); if (!/^\s*[-*+] \[ \] /.test(lines[t.line] || '')) { await vault.reload(); return; }
  lines.splice(t.line, 1); await vault.saveRaw(p.path, lines.join('\n'));
}
async function addTodoLine(pageName, text) {
  let p = vault.resolve(pageName);
  if (!p) { const path = await vault.createPage('', pageName, { props: { icon: '✅' } }); p = vault.pages.get(path); }
  const src = p.src.endsWith('\n') ? p.src : p.src + '\n';
  await vault.saveRaw(p.path, src + '- [ ] ' + text + '\n');
}
// every Portfolio block in the vault: [{ key, page, idx, d, title }]
function findPortfolios() {
  const out = [];
  for (const p of vault.pages.values()) {
    let i = 0;
    for (const m of p.body.matchAll(/```portfolio\n([\s\S]*?)\n```/g)) {
      try { const d = JSON.parse(m[1]); out.push({ key: p.path + '#' + i, page: p, idx: i, d, title: d.title || 'Portfolio' }); } catch (e) { /* skip broken block */ }
      i++;
    }
  }
  return out;
}
export function miniCalendar(container, big = false) {
  let ref = new Date();
  const wrap = h(`<div class="cal ${big ? 'cal-big' : ''}"></div>`); container.appendChild(wrap);
  const daily = new Set([...vault.pages.keys()].filter(k => k.startsWith('Daily/')).map(k => k.slice(6, 16)));
  function paint() {
    const y = ref.getFullYear(), m = ref.getMonth(); const first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay()); const today = vault.todayKey();
    let html = `<div class="cal-head"><b>${MONTHS[m]} ${y}</b><button class="iconbtn" data-p>${icon('back', 16)}</button><button class="iconbtn" data-t title="Today">${icon('calendar', 15)}</button><button class="iconbtn" data-n>${icon('forward', 16)}</button></div><div class="cal-grid">` + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); const k = vault.todayKey(d); let ev = '';
      if (big) {
        const names = [...vault.pages.values()].filter(p => p.props.date === k || p.props.due === k).slice(0, 3);
        ev = names.map(p => `<span class="ev" data-open="${escHtml(p.path)}">${escHtml(p.name)}</span>`).join('');
        if (daily.has(k)) ev = `<span class="ev" data-open="${escHtml(vault.dailyPath(k))}">Daily note</span>` + ev;
      }
      html += `<div class="day ${d.getMonth() !== m ? 'other' : ''} ${k === today ? 'today' : ''} ${daily.has(k) ? 'has' : ''}" data-d="${k}"><span class="dn">${d.getDate()}</span>${ev}</div>`;
    }
    wrap.innerHTML = html + '</div>';
  }
  paint();
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-p]')) { ref = new Date(ref.getFullYear(), ref.getMonth() - 1, 1); return paint(); }
    if (e.target.closest('[data-n]')) { ref = new Date(ref.getFullYear(), ref.getMonth() + 1, 1); return paint(); }
    if (e.target.closest('[data-t]')) { ref = new Date(); return paint(); }
    const op = e.target.closest('[data-open]'); if (op) { e.stopPropagation(); return app.open(op.dataset.open); }
    const day = e.target.closest('[data-d]'); if (day) app.openDaily(day.dataset.d);
  });
}

const QUOTES = [
  ['The secret of getting ahead is getting started.', 'Mark Twain'], ['What we think, we become.', 'Buddha'], ['Well begun is half done.', 'Aristotle'],
  ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'], ['It always seems impossible until it’s done.', 'Nelson Mandela'], ['Do the hard jobs first. The easy jobs will take care of themselves.', 'Dale Carnegie'],
  ['Compound interest is the eighth wonder of the world.', 'attributed to Einstein'], ['Be fearful when others are greedy, and greedy when others are fearful.', 'Warren Buffett'],
  ['The expert in anything was once a beginner.', 'Helen Hayes'], ['Not all those who wander are lost.', 'J.R.R. Tolkien'], ['Learning never exhausts the mind.', 'Leonardo da Vinci'],
  ['Quality is not an act, it is a habit.', 'Will Durant'], ['A goal without a plan is just a wish.', 'Antoine de Saint-Exupéry'], ['천 리 길도 한 걸음부터', 'Korean proverb'], ['시작이 반이다', 'Korean proverb']
];

// ---------- catalog ----------
export const WIDGETS = {
  favorites: { title: 'Favorites', desc: 'Pinned pages as cards', icon: 'star', w: 2, render(body) {
    const favs = [...vault.pages.values()].filter(p => p.props.favorite === true);
    body.innerHTML = favs.length ? `<div class="gallery">${favs.map(p => `<div class="gcard" data-open="${escHtml(p.path)}"><div class="gc ${cover(p.props.cover)}"></div><div class="gb"><span class="gi">${escHtml(p.props.icon || '')}</span><b>${escHtml(p.name)}</b><span class="gt">${ago(p.mtime)}</span></div></div>`).join('')}</div>` : '<div class="muted">Star a page (the star in the top bar) to pin it here.</div>';
  } },
  recent: { title: 'Recently edited', desc: 'Last pages you touched', icon: 'file', w: 1, defaults: () => ({ count: 7 }), configure: true, render(body, inst) {
    const n = (inst && inst.cfg && inst.cfg.count) || 7;
    body.innerHTML = '<div class="plist">' + (vault.recentPages(n).map(p => `<div class="prow" data-open="${escHtml(p.path)}"><span class="pi">${p.props.icon ? escHtml(p.props.icon) : icon('file', 16)}</span><span class="pn">${escHtml(p.name)}</span><span class="pd">${ago(p.mtime)}</span></div>`).join('') || '<div class="muted">No pages yet — press “New page” to start.</div>') + '</div>';
  }, async config(inst) {
    const v = await formDialog('Recently edited', [{ key: 'count', label: 'How many pages to show', type: 'select', value: inst.cfg.count || 7, options: [5, 7, 10, 15, 25].map(x => ({ value: x, label: String(x) })) }]);
    if (!v) return false; inst.cfg.count = +v.count; return true;
  } },
  todos: { title: 'Open to-dos', desc: 'Your tasks from every page — add, edit, tick or delete them here', icon: 'todo', w: 1, defaults: () => ({ inbox: 'To-dos', expanded: false }), configure: true, render(body, inst) {
    const cfg = inst.cfg; if (!cfg.inbox) cfg.inbox = 'To-dos';
    const LIM = cfg.expanded ? 400 : 8;
    const everything = allTodos(2000); const ib = vault.resolve(cfg.inbox);      // tasks from your inbox page come first so a new one is always visible
    const ordered = ib ? [...everything.list.filter(x => x.page.path === ib.path), ...everything.list.filter(x => x.page.path !== ib.path)] : everything.list;
    const t = { list: ordered.slice(0, LIM), total: everything.total };
    body.innerHTML = '<div class="plist todo-list">' + (t.list.map((x, i) => `<div class="prow todo-row" data-i="${i}"><span class="chk" data-i="${i}" title="Mark done">${icon('check', 12)}</span><input class="todo-edit" value="${escHtml(x.text)}" data-i="${i}" spellcheck="false" title="Click to edit"><span class="pd todo-src" data-open="${escHtml(x.page.path)}" title="Open ${escHtml(x.page.name)}">${escHtml(x.page.name)}</span><button class="iconbtn todo-del" data-i="${i}" title="Delete">${icon('x', 13)}</button></div>`).join('') || '<div class="muted" style="padding:2px 0 6px">Nothing open — add your first to-do below.</div>') + '</div>'
      + (t.total > LIM ? `<button class="btn sm ghost" data-more style="margin-top:6px">Show all ${t.total}</button>` : (cfg.expanded && t.total > 8 ? '<button class="btn sm ghost" data-less style="margin-top:6px">Show fewer</button>' : ''))
      + `<div class="todo-add"><input class="inp" placeholder="Add a to-do…  (saved in “${escHtml(cfg.inbox)}”)" spellcheck="false"><button class="btn sm primary" data-add>Add</button></div>`;
    const again = () => setTimeout(() => WIDGETS.todos.render(body, inst), 60);
    // edit text in place → written back into the page's Markdown line
    body.querySelectorAll('.todo-edit').forEach((inp) => {
      const item = t.list[+inp.dataset.i]; const orig = item.text;
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); else if (e.key === 'Escape') { inp.value = orig; inp.blur(); } });
      inp.addEventListener('blur', async () => { const v = inp.value.trim(); if (!v || v === orig) { inp.value = orig; return; } await editTodoLine(item, v); again(); });
    });
    body.querySelectorAll('.chk').forEach(c => c.onclick = async (e) => { e.stopPropagation(); c.classList.add('on'); await checkTodo(t.list[+c.dataset.i]); again(); });
    body.querySelectorAll('.todo-del').forEach(b => b.onclick = async (e) => { e.stopPropagation(); await deleteTodoLine(t.list[+b.dataset.i]); toast('To-do deleted'); again(); });
    const more = body.querySelector('[data-more]'); if (more) more.onclick = () => { cfg.expanded = true; inst.save && inst.save(); WIDGETS.todos.render(body, inst); };
    const less = body.querySelector('[data-less]'); if (less) less.onclick = () => { cfg.expanded = false; inst.save && inst.save(); WIDGETS.todos.render(body, inst); };
    const addInp = body.querySelector('.todo-add input');
    const add = async () => { const v = addInp.value.trim(); if (!v) return; await addTodoLine(cfg.inbox, v); again(); };
    addInp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); });
    body.querySelector('[data-add]').onclick = add;
  }, async config(inst) {
    const names = [...vault.pages.values()].filter(p => !p.path.startsWith('Templates/')).map(p => p.name).sort((a, b) => a.localeCompare(b));
    const cur = inst.cfg.inbox || 'To-dos';
    const v = await formDialog('Open to-dos', [
      { key: 'pick', label: 'Save new to-dos in this page', type: 'select', value: names.includes(cur) ? cur : '', options: [{ value: '', label: '— a new page (type its name below) —' }, ...names.map(n => ({ value: n, label: n }))] },
      { key: 'name', label: 'New page name', value: names.includes(cur) ? '' : cur, placeholder: 'To-dos', hint: 'Only used when “a new page” is selected above. It is created the first time you add a to-do.' }
    ], { note: 'The widget always lists open to-dos from every page. This only decides where the ones you add here are saved.', validate: (x) => (!x.pick && !x.name ? 'Pick a page or type a name' : '') });
    if (!v) return false; inst.cfg.inbox = v.pick || v.name; return true;
  } },
  calendar: { title: 'Calendar', desc: 'Month view with daily notes', icon: 'calendar', w: 1, render(body) { miniCalendar(body); } },
  stats: { title: 'Vault stats', desc: 'Pages, words and links', icon: 'chart', w: 1, render(body) {
    const words = [...vault.pages.values()].reduce((a, p) => a + p.words, 0), links = [...vault.pages.values()].reduce((a, p) => a + p.links.length, 0);
    body.innerHTML = `<div class="statrow"><div class="stat"><b>${vault.pages.size}</b><span>Pages</span></div><div class="stat"><b>${words.toLocaleString()}</b><span>Words</span></div><div class="stat"><b>${links}</b><span>Links</span></div></div>`;
  } },
  tags: { title: 'Tags', desc: 'Browse by tag', icon: 'tag', w: 1, defaults: () => ({ count: 20 }), configure: true, render(body, inst) {
    const tags = [...vault.allTags().entries()].sort((a, b) => b[1].length - a[1].length).slice(0, (inst && inst.cfg && inst.cfg.count) || 20);
    body.innerHTML = tags.map(([t, ps]) => `<span class="tagchip" data-tag="${escHtml(t)}">#${escHtml(t)} · ${ps.length}</span>`).join('') || '<span class="muted">Add #tags to a page (type # in the Tags row under a page title) and they show up here.</span>';
  }, async config(inst) {
    const v = await formDialog('Tags', [{ key: 'count', label: 'How many tags to show', type: 'select', value: inst.cfg.count || 20, options: [10, 20, 40, 80].map(x => ({ value: x, label: String(x) })) }]);
    if (!v) return false; inst.cfg.count = +v.count; return true;
  } },
  cards: { title: 'Flashcards due', desc: 'Spaced-repetition cards waiting for you, from every deck in your notes', icon: 'cards', w: 1, render(body) {
    const decks = [];
    for (const p of vault.pages.values()) {
      const re = /```flash\n([\s\S]*?)\n```/g; let m;
      while ((m = re.exec(p.src))) { try { const d = JSON.parse(m[1]); const cards = (d.cards || []).filter((c) => c.q); if (!cards.length) continue; const today = dayKey(new Date()); const due = cards.filter((c) => !c.due || c.due <= today).length; decks.push({ p, title: d.title || 'Flashcards', total: cards.length, due }); } catch (e) { /* skip broken block */ } }
    }
    if (!decks.length) { body.innerHTML = '<div class="muted">No flashcard decks yet. Type <b>/flashcards</b> in a page, or ask the AI assistant to “make flashcards”.</div>'; return; }
    const total = decks.reduce((a, d) => a + d.due, 0);
    body.innerHTML = `<div style="font-size:26px;font-weight:800">${total} <span class="muted" style="font-size:14px;font-weight:600">due today</span></div>` + decks.sort((a, b) => b.due - a.due).slice(0, 6).map((d) => `<div class="tagchip" data-open="${escHtml(d.p.path)}" style="display:flex;justify-content:space-between;gap:8px"><span>${escHtml(d.title)} <span class="muted">· ${escHtml(d.p.name)}</span></span><b>${d.due}/${d.total}</b></div>`).join('');
    body.querySelectorAll('[data-open]').forEach((x) => x.onclick = () => app.open(x.dataset.open));
  } },
  templates: { title: 'New from template', desc: 'One-click page templates', icon: 'file', w: 1, render(body) {
    body.innerHTML = [...vault.pages.values()].filter(p => p.path.startsWith('Templates/')).map(p => `<span class="tagchip" data-tpl="${escHtml(p.path)}">${escHtml(p.props.icon || '')} ${escHtml(p.name)}</span>`).join('') || '<span class="muted">Put pages in the Templates folder.</span>';
  } },
  portfolio: { title: 'Portfolio snapshot', desc: 'Total wealth, today and gain / loss — for the portfolio and account you choose', icon: 'wallet', w: 1, defaults: () => ({ target: 'auto', cur: 'auto' }), configure: true, render(body, inst) {
    const cfg = inst.cfg; if (!cfg.target) cfg.target = 'auto'; if (!cfg.cur) cfg.cur = 'auto';
    const all = findPortfolios();
    if (!all.length) { body.innerHTML = '<div class="muted">No portfolio yet. Open a page and type <b>/portfolio</b> to add a portfolio tracker — it will show here.</div>'; return; }
    // what to show: 'auto' = the only portfolio, or everything when there are several
    let items, label, sub;
    const accName = (p, id) => { const a = (p.d.accounts || []).find(x => x.id === id); return a ? a.name : null; };
    if (cfg.target === 'all' || (cfg.target === 'auto' && all.length > 1)) { items = all.map(p => ({ d: p.d, acct: null })); label = 'All portfolios'; sub = all.length + ' portfolios combined'; }
    else {
      const [key, acct] = (cfg.target === 'auto' ? all[0].key : cfg.target).split('::');
      const p = all.find(x => x.key === key) || all[0]; const aid = acct && acct !== 'all' && accName(p, acct) ? acct : null;
      items = [{ d: p.d, acct: aid }]; label = p.title; sub = p.page.name + (aid ? ' · ' + accName(p, aid) : (p.d.accounts || []).length > 1 ? ' · all accounts' : '');
    }
    const first = all.find(x => x.d.base) || all[0];
    const target = cfg.cur !== 'auto' ? cfg.cur : (items.length === 1 ? (items[0].d.base || 'USD') : (first.d.base || 'USD'));
    body.innerHTML = `<div class="pfw-head"><b>${escHtml(label)}</b><small>${escHtml(sub)}</small></div><div class="pfw-grid"><div class="stat big"><b>…</b><span>Total wealth</span></div></div>
      <div class="pfw-foot"><button class="btn sm ghost" data-choose>Change portfolio…</button>${items.length === 1 ? `<button class="btn sm ghost" data-openpf="${escHtml(all.find(x => x.d === items[0].d).page.path)}">Open page</button>` : ''}</div>`;
    body.querySelector('[data-choose]').onclick = async () => { if (await WIDGETS.portfolio.config(inst)) { inst.save && inst.save(); WIDGETS.portfolio.render(body, inst); } };
    const op = body.querySelector('[data-openpf]'); if (op) op.onclick = () => app && app.open(op.dataset.openpf);
    const grid = body.querySelector('.pfw-grid');
    if (!items.some(x => (x.d.holdings || []).length || (x.d.cash || []).length)) { grid.innerHTML = '<div class="muted" style="grid-column:1/-1">This portfolio is empty. Open it and add your holdings.</div>'; return; }
    const stamp = (inst._pfStamp = (inst._pfStamp || 0) + 1);
    liveSummary(items, target).then((r) => {
      if (stamp !== inst._pfStamp || !body.isConnected) return;
      const sg = (v) => (v >= 0 ? '+' : '−') + fmtMoney(Math.abs(v), target);
      grid.innerHTML = `<div class="stat big"><b>${fmtMoney(r.total, target)}</b><span>Total wealth · ${escHtml(target)}${r.cash ? ' · incl. ' + fmtMoney(r.cash, target) + ' cash' : ''}</span></div>
        <div class="stat"><b class="${r.day >= 0 ? 'pos' : 'neg'}">${r.n ? sg(r.day) : '–'}</b><span>Today${r.dayPct != null && r.n ? ' · ' + fmtPct(r.dayPct) : ''}</span></div>
        <div class="stat"><b class="${r.pl >= 0 ? 'pos' : 'neg'}">${r.cost ? sg(r.pl) : '–'}</b><span>${r.cost ? 'Gain / loss · ' + fmtPct(r.plPct) : 'Gain / loss — add what you paid'}</span></div>`
        + (r.missing ? `<div class="pfw-note" style="grid-column:1/-1">${r.missing} holding(s) have no live price right now and are not counted.</div>` : '');
    }).catch(() => { if (body.isConnected) grid.innerHTML = '<div class="muted" style="grid-column:1/-1">Could not load prices — check your connection.</div>'; });
    if (!inst._pfIv) inst._pfIv = setInterval(() => { if (!body.isConnected) { clearInterval(inst._pfIv); inst._pfIv = null; return; } if (document.visibilityState === 'visible') WIDGETS.portfolio.render(body, inst); }, 90000);
  }, async config(inst) {
    const all = findPortfolios(); if (!all.length) { toast('No portfolio yet — add a Portfolio block to a page first'); return false; }
    const opts = [{ value: 'auto', label: all.length > 1 ? 'Automatic — everything combined' : 'Automatic' }];
    if (all.length > 1) opts.push({ value: 'all', label: 'All portfolios combined' });
    all.forEach((p) => { const n = (p.d.accounts || []).length; opts.push({ value: p.key, label: p.title + ' — ' + p.page.name + (n > 1 ? ' (all accounts)' : '') }); if (n > 1) p.d.accounts.forEach(a => opts.push({ value: p.key + '::' + a.id, label: '      ' + p.title + ' → ' + a.name + ' (' + a.cur + ')' })); });
    const cur = inst.cfg.target || 'auto';
    const v = await formDialog('Portfolio snapshot', [
      { key: 'target', label: 'Which portfolio / account to show', type: 'select', value: opts.some(o => o.value === cur) ? cur : 'auto', options: opts },
      { key: 'cur', label: 'Show amounts in', type: 'select', value: inst.cfg.cur || 'auto', options: [{ value: 'auto', label: 'Automatic (the portfolio’s own currency)' }, ...['USD', 'KRW', 'EUR', 'JPY', 'GBP', 'CAD', 'AUD', 'CNY'].map(c => ({ value: c, label: c }))], hint: 'Other currencies are converted at the live exchange rate.' }
    ]);
    if (!v) return false; inst.cfg.target = v.target; inst.cfg.cur = v.cur; return true;
  } },
  clock: { title: 'Clock', desc: 'Time and date', icon: 'timer', w: 1, defaults: () => ({ h24: false }), render(body, inst) {
    body.innerHTML = '<div class="clock"><div class="t"></div><div class="d"></div></div>';
    const t = body.querySelector('.t'), d = body.querySelector('.d');
    const tick = (first) => { if (first !== true && !body.isConnected) { clearInterval(iv); return; } const n = new Date(); t.textContent = n.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !inst.cfg.h24 }); d.textContent = n.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); };
    const iv = setInterval(tick, 1000); tick(true);
    body.querySelector('.clock').onclick = () => { inst.cfg.h24 = !inst.cfg.h24; tick(); app && inst.save && inst.save(); };
    body.title = 'Click to switch 12/24h';
  } },
  markets: { title: 'Markets', desc: 'Exchange rates (USD, EUR, JPY → KRW) and stock indices — S&P 500, NASDAQ, KOSPI, KOSDAQ…', icon: 'chart', w: 1,
    defaults: () => ({ items: [{ sym: 'USDKRW=X', label: 'USD → KRW' }, { sym: 'EURKRW=X', label: 'EUR → KRW' }, { sym: 'JPYKRW=X', label: '100 JPY → KRW', mult: 100 }, { sym: '^GSPC', label: 'S&P 500' }, { sym: '^IXIC', label: 'NASDAQ' }, { sym: '^KS11', label: '코스피 KOSPI' }, { sym: '^KQ11', label: '코스닥 KOSDAQ' }, { sym: '^DJI', label: 'Dow Jones' }, { sym: '^N225', label: 'Nikkei 225' }] }),
    render(body, inst) {
      const cfg = inst.cfg; if (!cfg.items) cfg.items = WIDGETS.markets.defaults().items;
      let quotes = {}, updated = null, iv = null;
      const spark = (v, up) => { if (!v || v.length < 2) return ''; const w = 54, hh = 20, mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1; return `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}"><polyline points="${v.map((x, i) => (i / (v.length - 1) * w).toFixed(1) + ',' + (hh - 2 - (x - mn) / rg * (hh - 4)).toFixed(1)).join(' ')}" fill="none" stroke="${up ? '#27ae7a' : '#e5484d'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`; };
      const fmtN = (n) => (n == null ? '–' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      function paint() {
        body.innerHTML = `<div class="mk">${cfg.items.map((it, i) => {
          const x = quotes[it.sym]; const m = it.mult || 1; const ok = x && x.ok; const pr = ok ? x.price * m : null; const ch = ok && x.prevClose ? (x.price - x.prevClose) / x.prevClose * 100 : null;
          return `<div class="mk-row" data-i="${i}" title="Open chart, history and news"><span class="mk-l"><b>${escHtml(it.label || it.sym)}</b></span><span class="mk-s">${ok ? spark(x.spark, x.spark[x.spark.length - 1] >= x.spark[0]) : ''}</span><span class="mk-p">${ok ? fmtN(pr) : (x ? '–' : '…')}</span><span class="mk-c ${ch >= 0 ? 'pos' : 'neg'}">${ch != null ? fmtPct(ch) : ''}</span><button class="iconbtn mk-x" data-rm="${i}" title="Remove">${icon('x', 12)}</button></div>`;
        }).join('')}</div><div class="mk-add"><input class="inp" placeholder="Add ticker (e.g. ^GDAXI, USDJPY=X, GC=F)"><button class="btn sm" data-add>Add</button><button class="btn sm ghost" data-reset title="Back to the default list">Reset</button></div><div class="muted" style="font-size:11.5px;margin-top:6px">${updated ? 'Updated ' + new Date(updated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' · ' : ''}Yahoo Finance, may be delayed</div>`;
      }
      async function load() {
        try { const res = await window.api.price.quotes(cfg.items.map(x => x.sym)); quotes = Object.assign(quotes, res); updated = Date.now(); } catch (e) { /* offline */ }
        if (body.isConnected) paint();
      }
      const save = () => { inst.save && inst.save(); };
      body.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm]'); if (rm) { cfg.items.splice(+rm.dataset.rm, 1); save(); paint(); return; }
        if (e.target.closest('[data-reset]')) { cfg.items = WIDGETS.markets.defaults().items; save(); paint(); load(); return; }
        if (e.target.closest('[data-add]')) { const inp = body.querySelector('.mk-add input'); const s = inp.value.trim().toUpperCase(); if (s && !cfg.items.some(x => x.sym === s)) { cfg.items.push({ sym: s, label: s }); save(); paint(); load(); } return; }
        const row = e.target.closest('.mk-row'); if (row) { const it = cfg.items[+row.dataset.i]; if (it) openStock(it.sym, { quote: quotes[it.sym], label: it.label }); }
      });
      body.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.matches('.mk-add input')) body.querySelector('[data-add]').click(); });
      paint(); load();
      iv = setInterval(() => { if (!body.isConnected) { clearInterval(iv); return; } if (document.visibilityState === 'visible') load(); }, 60000);
    } },
  quote: { title: 'Quote of the day', desc: 'A little push', icon: 'quote', w: 1, defaults: () => ({ shift: 0 }), render(body, inst) {
    const day = Math.floor(Date.now() / 864e5); const q = QUOTES[(day + (inst.cfg.shift || 0)) % QUOTES.length];
    body.innerHTML = `<div class="quote"><p>“${escHtml(q[0])}”</p><span>— ${escHtml(q[1])}</span></div><button class="btn sm ghost" data-next style="margin-top:8px">Another</button>`;
    body.querySelector('[data-next]').onclick = () => { inst.cfg.shift = (inst.cfg.shift || 0) + 1; WIDGETS.quote.render(body, inst); inst.save && inst.save(); };
  } },
  countdown: { title: 'Countdown', desc: 'Days until an event', icon: 'calendar', w: 1, defaults: () => ({ title: 'Exam', date: dayKey(new Date(Date.now() + 30 * 864e5)) }), configure: true, render(body, inst) {
    const c = inst.cfg; const days = Math.ceil((new Date(c.date + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5);
    body.innerHTML = `<div class="countdown"><b>${isNaN(days) ? '–' : Math.abs(days)}</b><span>${days < 0 ? 'days since' : days === 0 ? 'today' : 'days until'}</span><div class="ct">${escHtml(c.title)}</div><div class="muted" style="font-size:12px">${escHtml(c.date)}</div></div>`;
  }, async config(inst) {
    const v = await formDialog('Countdown', [{ key: 'title', label: 'Event name', value: inst.cfg.title }, { key: 'date', label: 'Date', type: 'date', value: inst.cfg.date }], { validate: (x) => (!x.date ? 'Pick a date' : '') });
    if (!v) return false; inst.cfg.title = v.title || 'Event'; inst.cfg.date = v.date; return true;
  } },
  progress: { title: 'Progress', desc: 'Goal tracker with a bar', icon: 'chart', w: 1, defaults: () => ({ label: 'My goal', value: 0, goal: 10, unit: '' }), configure: true, render(body, inst) {
    const c = inst.cfg; const pct = c.goal ? Math.min(100, Math.round(c.value / c.goal * 100)) : 0;
    body.innerHTML = `<div class="progress"><div class="pl"><b>${escHtml(c.label)}</b><span>${c.value} / ${c.goal} ${escHtml(c.unit || '')}</span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="pb"><button class="btn sm ghost" data-d="-1">−</button><span class="muted">${pct}%</span><button class="btn sm ghost" data-d="1">+</button></div></div>`;
    body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { c.value = Math.max(0, c.value + +b.dataset.d); WIDGETS.progress.render(body, inst); inst.save && inst.save(); });
  }, async config(inst) {
    const v = await formDialog('Progress', [{ key: 'label', label: 'What are you tracking?', value: inst.cfg.label }, { key: 'value', label: 'Done so far', type: 'number', value: inst.cfg.value }, { key: 'goal', label: 'Goal', type: 'number', value: inst.cfg.goal, min: 1 }, { key: 'unit', label: 'Unit (optional)', value: inst.cfg.unit || '', placeholder: 'pages, km, books…' }], { validate: (x) => (!(x.goal >= 1) ? 'The goal must be at least 1' : '') });
    if (!v) return false; inst.cfg.label = v.label || 'My goal'; inst.cfg.value = Math.max(0, v.value || 0); inst.cfg.goal = v.goal; inst.cfg.unit = v.unit; return true;
  } },
  habits: { title: 'Habit tracker', desc: 'Last 7 days, with streaks', icon: 'check', w: 2, defaults: () => ({ habits: [{ name: 'Study 1h', days: {} }, { name: 'Exercise', days: {} }, { name: 'Read', days: {} }] }), render(body, inst) {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
    const streak = (hb) => { let s = 0; const d = new Date(); if (!hb.days[dayKey(d)]) d.setDate(d.getDate() - 1); while (hb.days[dayKey(d)]) { s++; d.setDate(d.getDate() - 1); } return s; };
    body.innerHTML = `<table class="habits"><tr><th></th>${days.map(d => `<th>${['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]}<small>${d.getDate()}</small></th>`).join('')}<th>Streak</th><th></th></tr>${inst.cfg.habits.map((hb, i) => `<tr><td class="hn" data-ren="${i}" title="Click to rename" style="cursor:text">${escHtml(hb.name)}</td>${days.map(d => `<td><span class="hc ${hb.days[dayKey(d)] ? 'on' : ''}" data-i="${i}" data-d="${dayKey(d)}"></span></td>`).join('')}<td class="hs">${streak(hb)}</td><td><button class="iconbtn" data-rm="${i}">${icon('x', 13)}</button></td></tr>`).join('')}</table><button class="btn sm ghost" data-add style="margin-top:8px">+ Habit</button>`;
    body.querySelectorAll('.hc').forEach(c => c.onclick = () => { const hb = inst.cfg.habits[+c.dataset.i]; if (hb.days[c.dataset.d]) delete hb.days[c.dataset.d]; else hb.days[c.dataset.d] = true; WIDGETS.habits.render(body, inst); inst.save && inst.save(); });
    body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { inst.cfg.habits.splice(+b.dataset.rm, 1); WIDGETS.habits.render(body, inst); inst.save && inst.save(); });
    body.querySelectorAll('[data-ren]').forEach(c => c.onclick = async () => { const hb = inst.cfg.habits[+c.dataset.ren]; const n = await promptDialog('Rename habit', hb.name); if (n) { hb.name = n; WIDGETS.habits.render(body, inst); inst.save && inst.save(); } });
    body.querySelector('[data-add]').onclick = async () => { const n = await promptDialog('New habit'); if (n) { inst.cfg.habits.push({ name: n, days: {} }); WIDGETS.habits.render(body, inst); inst.save && inst.save(); } };
  } },
  study: { title: 'Study timer', desc: 'Stopwatch by subject with daily goal', icon: 'timer', w: 1, render(body) { renderStudyWidget(body); } },
  timer: { title: 'Focus timer', desc: 'Pomodoro — you choose the focus / break minutes', icon: 'timer', w: 1, defaults: () => ({ work: 25, rest: 5 }), configure: true, render(body, inst) {
    const W = (inst.cfg && inst.cfg.work) || 25, R = (inst.cfg && inst.cfg.rest) || 5;
    const st = (WIDGETS.timer._s = WIDGETS.timer._s || {})[inst.id] || ((WIDGETS.timer._s)[inst.id] = { mode: 'work', left: W * 60, running: false });
    body.innerHTML = '<div class="ptimer"><div class="tt"></div><div class="tm"></div><div class="pb"><button class="btn primary sm" data-go>Start</button><button class="btn ghost sm" data-reset>Reset</button></div></div>';
    const tt = body.querySelector('.tt'), tm = body.querySelector('.tm'), go = body.querySelector('[data-go]');
    const paint = () => { tt.textContent = pad(Math.floor(st.left / 60)) + ':' + pad(st.left % 60); tm.textContent = st.mode === 'work' ? 'Focus' : 'Break'; go.textContent = st.running ? 'Pause' : 'Start'; };
    const tick = () => { st.left--; if (st.left <= 0) { toast(st.mode === 'work' ? 'Focus session done — take a break' : 'Break over', 3500); st.mode = st.mode === 'work' ? 'rest' : 'work'; st.left = (st.mode === 'work' ? W : R) * 60; } if (body.isConnected) paint(); };
    go.onclick = () => { st.running = !st.running; clearInterval(st.iv); if (st.running) st.iv = setInterval(tick, 1000); paint(); };
    body.querySelector('[data-reset]').onclick = () => { st.running = false; clearInterval(st.iv); st.mode = 'work'; st.left = W * 60; paint(); };
    paint();
  }, async config(inst) {
    const v = await formDialog('Focus timer', [{ key: 'work', label: 'Focus minutes', type: 'number', value: inst.cfg.work || 25, min: 1 }, { key: 'rest', label: 'Break minutes', type: 'number', value: inst.cfg.rest || 5, min: 1 }], { validate: (x) => (!(x.work >= 1 && x.rest >= 1) ? 'Enter at least 1 minute' : '') });
    if (!v) return false; inst.cfg.work = Math.round(v.work); inst.cfg.rest = Math.round(v.rest); const st = WIDGETS.timer._s && WIDGETS.timer._s[inst.id]; if (st) { clearInterval(st.iv); delete WIDGETS.timer._s[inst.id]; } return true;
  } },
  quicknote: { title: 'Quick note', desc: 'Scratchpad that auto-saves', icon: 'pen', w: 1, defaults: () => ({ text: '' }), render(body, inst) {
    const ta = h('<textarea class="wg-note" placeholder="Jot something down…" spellcheck="false"></textarea>'); ta.value = inst.cfg.text || ''; body.appendChild(ta);
    ta.addEventListener('input', () => { inst.cfg.text = ta.value; inst.save && inst.save(); }); ta.addEventListener('keydown', (e) => e.stopPropagation());
  } },
  watchlist: { title: 'Watchlist', desc: 'Live prices — and how each pick has done since you added it', icon: 'chart', w: 2, defaults: () => ({ items: [], chart: false }), render(body, inst) {
    const cfg = inst.cfg;
    if (!cfg.items) cfg.items = [];
    if (cfg.symbols) { cfg.symbols.forEach((s) => { if (!cfg.items.some(x => x.sym === s)) cfg.items.push({ sym: s, added: Date.now(), base: null }); }); delete cfg.symbols; inst.save && inst.save(); }   // migrate the old list
    let quotes = {}, chart = null, hist = {};
    const dayStr = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const pct = (it) => { const q = quotes[it.sym]; return q && q.ok && it.base ? (q.price / it.base - 1) * 100 : null; };
    const cls = (v) => (v == null ? '' : v >= 0 ? 'pos' : 'neg');
    const rangeFor = (days) => (days <= 28 ? '1mo' : days <= 85 ? '3mo' : days <= 170 ? '6mo' : days <= 350 ? '1y' : days <= 700 ? '2y' : '5y');

    function paint() {
      const rows = cfg.items.map((it, i) => {
        const x = quotes[it.sym]; const ch = x && x.ok && x.prevClose ? (x.price - x.prevClose) / x.prevClose * 100 : null; const sp = pct(it);
        const days = Math.max(0, Math.floor((Date.now() - it.added) / 864e5));
        return `<tr><td class="clickable" data-open="${i}" title="Open chart, key data and news"><b>${escHtml(it.sym)}</b><small class="muted" style="display:block;max-width:150px;overflow:hidden;text-overflow:ellipsis">${escHtml((x && x.name) || '')}</small></td>
          <td>${x && x.ok ? fmtMoney(x.price, x.currency) : (x ? '–' : '…')}</td><td class="${cls(ch)}">${ch != null ? fmtPct(ch) : ''}</td>
          <td class="since ${cls(sp)}" data-since="${i}" title="Added ${dayStr(it.added)}${it.base ? ' at ' + it.base : ''} — click to change the start">${sp != null ? '<b>' + fmtPct(sp) + '</b>' : '<span class="muted">…</span>'}<small class="muted" style="display:block;font-size:11px">${days}d · since ${dayStr(it.added)}</small></td>
          <td><button class="iconbtn" data-rm="${i}">${icon('x', 12)}</button></td></tr>`;
      }).join('');
      const vals = cfg.items.map(pct).filter(v => v != null);
      const avg = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
      const best = vals.length ? cfg.items.filter(it => pct(it) === Math.max(...vals))[0] : null, worst = vals.length ? cfg.items.filter(it => pct(it) === Math.min(...vals))[0] : null;
      body.innerHTML = `<table class="pf wl"><tr><th style="text-align:left">Ticker</th><th>Price</th><th>Day</th><th>Since added</th><th></th></tr>${rows}</table>
        ${avg != null ? `<div class="wl-sum"><span>Average since added <b class="${cls(avg)}">${fmtPct(avg)}</b></span>${best && vals.length > 1 ? `<span>Best <b class="${cls(pct(best))}">${escHtml(best.sym)} ${fmtPct(pct(best))}</b></span><span>Worst <b class="${cls(pct(worst))}">${escHtml(worst.sym)} ${fmtPct(pct(worst))}</b></span>` : ''}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px"><input class="inp" placeholder="Add ticker (tracking starts now)" style="flex:1;min-width:0"><button class="btn sm" data-add>Add</button><button class="btn sm ${cfg.chart ? 'primary' : 'ghost'}" data-chart>${icon('chart', 13)} Performance</button></div>
        ${cfg.chart ? '<div class="wl-chart"><canvas></canvas><div class="muted wl-note" style="font-size:12px"></div></div>' : ''}`;
      const inp = body.querySelector('input'); inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); });
      body.querySelector('[data-add]').onclick = add;
      body.querySelector('[data-chart]').onclick = () => { cfg.chart = !cfg.chart; inst.save && inst.save(); paint(); if (cfg.chart) drawChart(); };
      body.querySelectorAll('[data-open]').forEach(c => c.onclick = () => { const it = cfg.items[+c.dataset.open]; if (it) openStock(it.sym, { quote: quotes[it.sym] }); });
      body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { cfg.items.splice(+b.dataset.rm, 1); inst.save && inst.save(); paint(); if (cfg.chart) drawChart(); });
      body.querySelectorAll('[data-since]').forEach(c => c.onclick = (e) => {
        const i = +c.dataset.since; const r = c.getBoundingClientRect();
        openMenu(r.left, r.bottom + 2, [
          { label: 'Set start date…', icon: 'calendar', action: () => setSince(i) },
          { label: 'Restart from today', icon: 'refresh', action: () => { cfg.items[i].added = Date.now(); cfg.items[i].base = quotes[cfg.items[i].sym] && quotes[cfg.items[i].sym].ok ? quotes[cfg.items[i].sym].price : null; inst.save && inst.save(); paint(); if (cfg.chart) drawChart(); } }
        ]);
      });
      if (chart) { chart.destroy(); chart = null; }
    }
    function add() {
      const inp = body.querySelector('input'); const s = inp.value.trim().toUpperCase();
      if (s && !cfg.items.some(x => x.sym === s)) { cfg.items.push({ sym: s, added: Date.now(), base: null }); inst.save && inst.save(); load(); } else if (s) toast(s + ' is already on the list');
    }
    async function setSince(i) {
      const it = cfg.items[i]; const v = await promptDialog('Track ' + it.sym + ' since (YYYY-MM-DD)', new Date(it.added).toISOString().slice(0, 10));
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      const t0 = new Date(v + 'T00:00:00').getTime(); if (isNaN(t0) || t0 > Date.now()) { toast('Pick a date in the past'); return; }
      const h2 = await window.api.price.history(it.sym, rangeFor((Date.now() - t0) / 864e5 + 5));
      if (!h2 || !h2.t) { toast('Could not load history for ' + it.sym); return; }
      const k = h2.t.findIndex((t, j) => t * 1000 >= t0 && h2.c[j] != null);
      if (k < 0) { toast('No price data on/after that date'); return; }
      it.added = h2.t[k] * 1000; it.base = h2.c[k]; inst.save && inst.save(); paint(); if (cfg.chart) drawChart(); toast('Now tracking ' + it.sym + ' from ' + dayStr(it.added));
    }
    async function drawChart() {
      const cv = body.querySelector('.wl-chart canvas'); if (!cv) return;
      const note = body.querySelector('.wl-note');
      const oldest = Math.min(...cfg.items.map(x => x.added)); const days = (Date.now() - oldest) / 864e5;
      const range = rangeFor(days + 3);
      const out = [];
      await Promise.all(cfg.items.map(async (it) => {
        if (!it.base) return;
        const key = it.sym + '|' + range; if (!hist[key]) hist[key] = await window.api.price.history(it.sym, range);
        const hh = hist[key]; if (!hh || !hh.t) return;
        const t0 = new Date(it.added).setHours(0, 0, 0, 0); const pts = [];
        hh.t.forEach((t, j) => { if (t * 1000 >= t0 - 864e5 * 0.5 && hh.c[j] != null) pts.push({ x: Math.max(0, Math.round((t * 1000 - t0) / 864e5)), y: +((hh.c[j] / it.base - 1) * 100).toFixed(2) }); });
        const q = quotes[it.sym]; if (q && q.ok) pts.push({ x: Math.max(0, +((Date.now() - t0) / 864e5).toFixed(2)), y: +((q.price / it.base - 1) * 100).toFixed(2) });
        if (pts.length) out.push({ it, pts });
      }));
      if (!body.isConnected || !window.Chart) return;
      const cv2 = body.querySelector('.wl-chart canvas'); if (!cv2) return;
      if (!out.length || Math.max(...out.map(o => o.pts[o.pts.length - 1].x)) < 1) { note.textContent = 'The performance chart fills in as days go by — each line starts at 0% on the day you added the ticker.'; }
      else note.textContent = 'X axis = days since you added each ticker; every line starts at 0%. Dashed = average.';
      const pal = themeColors(); const text = cssVar('--text'), muted = cssVar('--muted'), line = cssVar('--line');
      const maxX = Math.max(1, ...out.map(o => o.pts[o.pts.length - 1].x));
      const avgPts = []; for (let x = 0; x <= Math.ceil(maxX); x++) { const ys = out.map(o => { const p = o.pts.filter(pp => pp.x <= x); return p.length && o.pts[o.pts.length - 1].x >= x - 0.01 ? p[p.length - 1].y : null; }).filter(v => v != null); if (ys.length) avgPts.push({ x, y: +(ys.reduce((a, v) => a + v, 0) / ys.length).toFixed(2) }); }
      const ds = out.map((o, i) => ({ label: o.it.sym, data: o.pts, borderColor: pal[i % pal.length], backgroundColor: pal[i % pal.length], borderWidth: 2, pointRadius: o.pts.length < 12 ? 3 : 0, tension: .25 }));
      if (out.filter(o => o.pts[o.pts.length - 1].x >= 1).length > 1) ds.push({ label: 'Average', data: avgPts, borderColor: text, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: .25 });
      chart = new window.Chart(cv2, { type: 'line', data: { datasets: ds }, options: { parsing: false, responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, interaction: { mode: 'nearest', intersect: false }, plugins: { legend: { position: 'bottom', labels: { color: text, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { title: (c) => 'Day ' + Math.round(c[0].parsed.x), label: (c) => ` ${c.dataset.label}: ${fmtPct(c.parsed.y)}` } } }, scales: { x: { type: 'linear', min: 0, title: { display: true, text: 'days since added', color: muted }, ticks: { color: muted, precision: 0 }, grid: { display: false } }, y: { ticks: { color: muted, callback: (v) => v + '%' }, grid: { color: line } } } } });
    }
    const load = async () => {
      paint();
      try {
        quotes = await window.api.price.quotes(cfg.items.map(x => x.sym));
        let changed = false;
        cfg.items.forEach((it) => { const q = quotes[it.sym]; if (q && q.ok && !it.base) { it.base = q.price; if (!it.added) it.added = Date.now(); changed = true; } });   // first price seen = starting point
        if (changed) inst.save && inst.save();
        if (body.isConnected) { paint(); if (cfg.chart) setTimeout(drawChart, 30); }
      } catch (e) { /* offline */ }
    };
    load(); const iv = setInterval(() => { if (!body.isConnected) clearInterval(iv); else load(); }, 60000);
  } },
  links: { title: 'Quick links', desc: 'Pages, files, websites and app screens', icon: 'link', w: 1, defaults: () => ({ items: [] }), render(body, inst) {
    body.innerHTML = '<div class="plist">' + (inst.cfg.items.map((x, i) => `<div class="prow" data-i="${i}" title="${escHtml(describe(x.u) || x.u)}"><span class="pi">${icon(iconFor(x.u), 15)}</span><span class="pn">${escHtml(x.t)}</span><button class="iconbtn" data-edit="${i}" title="Edit">${icon('pen', 12)}</button><button class="iconbtn" data-rm="${i}" title="Remove">${icon('x', 12)}</button></div>`).join('') || '<div class="muted">Add your favorite pages, files, websites or app screens for one-click access.</div>') + '</div><button class="btn sm ghost" data-add style="margin-top:8px">+ Link</button>';
    const ask = async (it) => {
      const v = await linkDialog({ title: it ? 'Edit link' : 'New link', text: it ? it.t : '', target: it ? it.u : '', textLabel: 'Title' });
      return v && !v.remove ? { t: v.text, u: v.target } : null;
    };
    body.querySelectorAll('.prow').forEach(r => r.onclick = (e) => { if (e.target.closest('[data-rm],[data-edit]')) return; const x = inst.cfg.items[+r.dataset.i]; openTarget(x.u, { relink: (u) => { x.u = u; inst.save && inst.save(); WIDGETS.links.render(body, inst); } }); });
    body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { inst.cfg.items.splice(+b.dataset.rm, 1); WIDGETS.links.render(body, inst); inst.save && inst.save(); });
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => { const i = +b.dataset.edit; const n = await ask(inst.cfg.items[i]); if (n) { inst.cfg.items[i] = n; WIDGETS.links.render(body, inst); inst.save && inst.save(); } });
    body.querySelector('[data-add]').onclick = async () => { const n = await ask(null); if (n) { inst.cfg.items.push(n); WIDGETS.links.render(body, inst); inst.save && inst.save(); } };
  } },
  photo: { title: 'Photo', desc: 'Vision board / favorite picture — click the picture to change it', icon: 'image', w: 1, defaults: () => ({ src: '', caption: '' }), configure: true, async config(inst) {
    const v = await formDialog('Photo', [{ key: 'caption', label: 'Caption', value: inst.cfg.caption || '' }, ...(inst.cfg.src ? [{ key: 'rm', label: 'Remove the picture', type: 'check', value: false }] : [])]);
    if (!v) return false; inst.cfg.caption = v.caption; if (v.rm) inst.cfg.src = ''; return true;
  }, render(body, inst) {
    if (!inst.cfg.src) { body.innerHTML = '<div class="photo-empty">Click to add a picture</div>'; body.firstChild.onclick = () => pick(); return; }
    body.innerHTML = `<img class="photo" alt="" title="Click to change the picture" style="cursor:pointer" src="${escHtml(vault.assetUrl(inst.cfg.src))}"><div class="muted" style="font-size:12px;margin-top:4px;text-align:center">${escHtml(inst.cfg.caption || '')}</div>`;
    body.querySelector('img').onclick = () => pick();
    function pick() { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.onchange = async () => { if (f.files[0]) { inst.cfg.src = await vault.saveImage(f.files[0]); WIDGETS.photo.render(body, inst); inst.save && inst.save(); } }; f.click(); }
  } }
};
export const widgetList = () => Object.entries(WIDGETS).map(([kind, w]) => ({ kind, ...w }));
export function newInstance(kind) {
  const w = WIDGETS[kind];
  return { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind, w: w.w || 1, cfg: w.defaults ? w.defaults() : {} };
}

// Gallery modal. cb(kind)
export function pickWidget(cb) {
  const m = modal(`<div class="modal-h">Add a widget</div><div class="modal-b"><div class="wg-gallery">${widgetList().map(w => `<button class="wg-card" data-k="${w.kind}"><span class="ic-badge">${icon(w.icon, 18)}</span><b>${escHtml(w.title)}</b><small>${escHtml(w.desc)}</small></button>`).join('')}</div></div>`, { wide: true });
  m.el.addEventListener('click', (e) => { const c = e.target.closest('[data-k]'); if (c) { m.close(); cb(c.dataset.k); } });
}

// Render a widget card (used by Home and by page blocks). opts: { edit, onRemove, onResize, onConfig }
export function widgetCard(inst, { save, edit = false, onRemove, onResize, block = false } = {}) {
  const def = WIDGETS[inst.kind];
  const el = h(`<div class="card widget wgt ${inst.w === 2 ? 'w2' : ''} ${block ? 'wgt-block' : ''}" data-id="${inst.id}"><h3>${icon(def.icon, 16)}<span class="grow">${escHtml(def.title)}</span><span class="wgt-tools"></span></h3><div class="wgt-body"></div></div>`);
  const tools = el.querySelector('.wgt-tools'), body = el.querySelector('.wgt-body');
  inst.save = save || (() => { });
  if (def.configure) { const b = h(`<button class="iconbtn" title="Configure">${icon('settings', 14)}</button>`); b.onclick = async (e) => { e.stopPropagation(); if (await def.config(inst)) { def.render(body, inst); inst.save(); } }; tools.appendChild(b); }
  if (edit || block) {
    if (onResize) { const b = h(`<button class="iconbtn" title="Wider / narrower">${icon('layout', 14)}</button>`); b.onclick = (e) => { e.stopPropagation(); onResize(); }; tools.appendChild(b); }
    if (onRemove) { const b = h(`<button class="iconbtn" title="Remove">${icon('x', 14)}</button>`); b.onclick = (e) => { e.stopPropagation(); onRemove(); }; tools.appendChild(b); }
  }
  def.render(body, inst);
  body.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]'); if (o && app) return app.open(o.dataset.open);
    const g = e.target.closest('[data-tag]'); if (g && app) return app.openView({ type: 'tag', tag: g.dataset.tag });
    const tp = e.target.closest('[data-tpl]'); if (tp && app) return app.newFromTemplate(tp.dataset.tpl);
  });
  return el;
}
