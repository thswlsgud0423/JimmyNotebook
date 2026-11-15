import { icon } from '../icons.js';
import { h, escHtml, fmtMoney, fmtPct, openMenu, toast, debounce, modal, confirmDialog } from '../ui.js';
import { openStock } from './stock.js';
import { richShell, themeColors, cssVar, num, onTheme } from './common.js';

const CURRENCIES = ['USD', 'KRW', 'EUR', 'JPY', 'GBP', 'CAD', 'AUD', 'CNY'];
const CACHE_KEY = 'jn.quotes';
const loadCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; } };
const saveCache = (c) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } };
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (t) => { const x = new Date(t); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
const r2 = (v) => Math.round(v * 100) / 100;
const rangeFor = (days) => (days <= 28 ? '1mo' : days <= 85 ? '3mo' : days <= 170 ? '6mo' : days <= 350 ? '1y' : days <= 700 ? '2y' : days <= 1800 ? '5y' : '10y');
const niceDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// A brand-new portfolio is EMPTY — no pretend positions. You add what you really own.
export function newPortfolio() { return { title: 'My portfolio', base: 'USD', accounts: [{ id: 'main', name: 'Main account', cur: 'USD' }], cash: [], holdings: [], history: [] }; }
const RANGES = [['1W', 7], ['1M', 30], ['3M', 91], ['1Y', 365], ['YTD', -1], ['ALL', 0]];
const signed = (v, cur) => (v >= 0 ? '+' : '−') + fmtMoney(Math.abs(v), cur);

// Positions are stored as lots (shares + the price you paid + date). shares / cost are derived.
function sync(hd) {
  if (!Array.isArray(hd.lots)) hd.lots = hd.shares ? [{ shares: +hd.shares, price: hd.cost ?? null, date: '' }] : [];
  hd.lots.forEach((l) => { l.shares = +l.shares || 0; l.price = (l.price === '' || l.price == null || isNaN(+l.price)) ? null : +l.price; l.date = l.date || ''; });
  const priced = hd.lots.filter(l => l.price != null && l.shares > 0);
  const pSh = priced.reduce((a, l) => a + l.shares, 0), pCost = priced.reduce((a, l) => a + l.shares * l.price, 0);
  hd.shares = hd.lots.reduce((a, l) => a + l.shares, 0);
  hd.cost = pSh ? pCost / pSh : null;                           // average price paid (only lots with a price)
  hd.pricedShares = pSh; hd.costBasis = pCost;
  hd.unpriced = hd.lots.filter(l => l.price == null && l.shares > 0).length;
  const dates = hd.lots.filter(l => l.date).map(l => l.date).sort(); hd.firstDate = dates[0] || '';
}

function spark(values, up) {
  if (!values || values.length < 2) return '';
  const w = 70, hh = 24, min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(hh - 2 - (v - min) / rng * (hh - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${hh}"><polyline points="${pts}" fill="none" stroke="${up ? '#27ae7a' : '#e5484d'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function renderPortfolio(b, api) {
  const d = b.data;
  d.holdings = d.holdings || []; d.base = d.base || 'USD'; d.history = d.history || []; d.sales = d.sales || [];
  if (typeof d.cash === 'number') d.cash = d.cash ? [{ cur: d.base, amount: d.cash }] : [];
  if (!Array.isArray(d.cash)) d.cash = [];
  if (!Array.isArray(d.accounts) || !d.accounts.length) d.accounts = [{ id: 'main', name: 'Main account', cur: d.base }];
  const accts = d.accounts, firstId = accts[0].id;
  d.holdings.forEach((hd) => { sync(hd); if (!hd.acct || !accts.some(a => a.id === hd.acct)) hd.acct = firstId; });
  d.cash.forEach((c) => { if (!c.acct || !accts.some(a => a.id === c.acct)) c.acct = firstId; });
  let curAcct = null, range = 'ALL', pieMode = 'holding';                              // curAcct null = all accounts
  const acctById = (id) => accts.find(a => a.id === id) || accts[0];
  const { el, body, tools } = richShell(b, api, { ico: 'wallet', ph: 'Portfolio name' });
  const refreshBtn = h(`<button class="iconbtn" title="Refresh prices">${icon('refresh', 16)}</button>`);
  const baseSel = h(`<select class="inp" style="padding:2px 6px" title="Show totals in this currency">${CURRENCIES.map(c => `<option ${c === d.base ? 'selected' : ''}>${c}</option>`).join('')}</select>`);
  baseSel.addEventListener('keydown', (e) => e.stopPropagation());
  tools.appendChild(h('<span class="muted" style="font-size:12px">Totals in</span>')); tools.appendChild(baseSel); tools.appendChild(refreshBtn);
  body.innerHTML = `<div class="pf-tabs"></div><div class="pf-top"></div><div class="pf-accts"></div><div class="pf-grid"><div class="tbl-area"></div><div class="pie-area"><select class="inp pie-mode" title="Break down by"><option value="holding">By holding</option><option value="currency">By currency</option><option value="account">By account</option></select><canvas></canvas></div></div>
    <div class="pf-actions"><button class="btn sm primary" data-addsym>${icon('plus', 14)} Add holding</button><button class="btn sm ghost" data-addcash title="Add a cash balance (any currency)">+ Cash</button><span class="grow" style="flex:1"></span><button class="btn sm ghost" data-csv title="Save holdings, purchases and cash as a spreadsheet">Export CSV</button></div>
    <div class="pf-real"></div>
    <div class="pf-trend"><div class="pf-trend-h"><b>Wealth over time</b><span class="pf-seg" data-ranges>${RANGES.map(r => `<button data-r="${r[0]}">${r[0]}</button>`).join('')}</span><span class="grow"></span><button class="btn sm ghost" data-rebuild title="Rebuild the past from the dates you bought each position">Rebuild from buy dates</button><button class="btn sm ghost" data-clear>Clear</button></div>
      <div class="pf-chips"></div><div class="pf-trend-c"><canvas></canvas></div><div class="muted pf-note"></div></div>
    <div class="pf-status"></div>`;
  const top = body.querySelector('.pf-top'), tabsEl = body.querySelector('.pf-tabs'), acctsEl = body.querySelector('.pf-accts'), chips = body.querySelector('.pf-chips'), realEl = body.querySelector('.pf-real'), tblArea = body.querySelector('.tbl-area'), pieCanvas = body.querySelector('.pie-area canvas'), status = body.querySelector('.pf-status');
  const trendCanvas = body.querySelector('.pf-trend-c canvas'), trendNote = body.querySelector('.pf-note');
  const inView = (x) => curAcct == null || x.acct === curAcct;
  let quotes = loadCache(), fx = {}, pie = null, trend = null, lastOk = null, timer = null, loading = false, online = null;

  const toBase = (amt, cur) => (!cur || cur === d.base ? amt : (fx[cur] != null ? amt * fx[cur] : null));
  const fromBase = (amt, cur) => (!cur || cur === d.base ? amt : (fx[cur] ? amt / fx[cur] : null));
  function compute(aid = curAcct) {
    let value = 0, costB = 0, plB = 0, day = 0, missing = 0, noBuy = 0;
    const rows = [];
    d.holdings.forEach((hd, i) => {
      if (aid != null && hd.acct !== aid) return;
      const q = quotes[hd.sym]; const cur = q && q.currency;
      const price = q && q.ok !== false ? q.price : null;
      const mv = price != null ? hd.shares * price : null;
      const mvB = mv != null ? toBase(mv, cur) : null;
      let plNative = null, plPct = null, cbB = null, plRowB = null;
      if (price != null && hd.pricedShares > 0) { plNative = hd.pricedShares * price - hd.costBasis; plPct = hd.costBasis ? plNative / hd.costBasis * 100 : null; cbB = toBase(hd.costBasis, cur || d.base); plRowB = toBase(plNative, cur || d.base); }
      const dayB = price != null && q.prevClose != null ? toBase(hd.shares * (price - q.prevClose), cur) : null;
      if (mvB != null) value += mvB; else missing++;
      if (cbB != null && plRowB != null) { costB += cbB; plB += plRowB; }
      if (dayB != null) day += dayB;
      if (hd.unpriced || !hd.pricedShares) noBuy++;
      rows.push({ i, hd, q, price, cur, mv, mvB, plNative, plPct, dayB });
    });
    const cashRows = [];
    d.cash.forEach((c, i) => { if (aid != null && c.acct !== aid) return; cashRows.push({ i, c, amtB: toBase(c.amount || 0, c.cur) }); });
    const cashTotal = cashRows.reduce((a, r) => a + (r.amtB || 0), 0);
    return { rows, value, costB, plB, day, missing, noBuy, cashRows, cashTotal };
  }

  // ---------- history helpers (per account + total) ----------
  function series(aid) {
    const out = [];
    (d.history || []).slice().sort((a, b2) => (a.d < b2.d ? -1 : 1)).forEach((e) => {
      if (aid == null) out.push({ d: e.d, h: e.h, c: e.c, k: e.k || 0 });
      else if (e.a && e.a[aid]) out.push({ d: e.d, h: e.a[aid].h, c: e.a[aid].c, k: e.a[aid].k || 0 });
    });
    const c = compute(aid), today = dayKey(Date.now());
    if (lastOk && !c.missing && c.rows.length) {                  // live point = what you own right now (not saved)
      const live = { d: today, h: r2(c.value), c: r2(c.cashTotal), k: r2(c.costB), live: 1 };
      const i = out.findIndex(x => x.d === today); if (i >= 0) out[i] = live; else out.push(live);
    }
    return out;
  }
  function inRange(pts) {
    const def = RANGES.find(r => r[0] === range) || RANGES[5];
    if (!def[1] && def[0] !== 'YTD') return pts;
    const now = new Date(); const cut = def[0] === 'YTD' ? now.getFullYear() + '-01-01' : dayKey(Date.now() - def[1] * 864e5);
    const i = pts.findIndex(p => p.d >= cut);
    return i < 0 ? [] : pts.slice(i);
  }
  // what happened to your wealth between the first and last point of the range
  function stats(pts) {
    if (pts.length < 2) return null;
    const a = pts[0], z = pts[pts.length - 1];
    const cashOk = a.c != null && z.c != null;
    const w0 = a.h + (cashOk ? a.c : 0), w1 = z.h + (cashOk ? z.c : 0);
    const newMoney = (z.k || 0) - (a.k || 0);
    const market = (z.h - (z.k || 0)) - (a.h - (a.k || 0));
    return { from: a.d, to: z.d, w0, w1, delta: w1 - w0, pct: w0 ? (w1 - w0) / w0 * 100 : null, newMoney, market, cashOk };
  }

  function paint() {
    renderTabs();
    const { rows, value: invested, costB, plB, day, missing, noBuy, cashRows, cashTotal } = compute();
    const total = invested + cashTotal;
    const gainPct = costB ? plB / costB * 100 : null, dayPct = total - day ? day / (total - day) * 100 : null;
    const cashPct = total ? cashTotal / total * 100 : 0;
    const st = stats(inRange(series(curAcct)));
    const rLabel = range === 'ALL' ? 'since start' : range === 'YTD' ? 'this year' : 'last ' + range;
    const acct = curAcct != null ? acctById(curAcct) : null;
    const native = acct && acct.cur !== d.base ? fromBase(total, acct.cur) : null;
    top.innerHTML = `<div class="stat big"><b>${fmtMoney(total, d.base)}</b><span>Total wealth${acct ? ' · ' + escHtml(acct.name) : accts.length > 1 ? ' · all ' + accts.length + ' accounts' : ''}${native != null ? ' · ' + fmtMoney(native, acct.cur) : ''}</span></div>
      <div class="stat"><b class="${st ? (st.delta >= 0 ? 'pos' : 'neg') : ''}">${st ? signed(st.delta, d.base) : '–'}</b><span>${st ? 'Change ' + rLabel + ' · ' + fmtPct(st.pct) : 'Change — builds up over time'}</span></div>
      <div class="stat"><b class="${plB >= 0 ? 'pos' : 'neg'}">${costB ? signed(plB, d.base) : '–'}</b><span>${costB ? 'Gain / loss vs paid · ' + fmtPct(gainPct) : 'Gain / loss — add what you paid'}</span></div>
      <div class="stat"><b class="${day >= 0 ? 'pos' : 'neg'}">${signed(day, d.base)}</b><span>Today ${dayPct != null ? '· ' + fmtPct(dayPct) : ''}</span></div>
      <div class="stat"><b>${fmtMoney(cashTotal, d.base)}</b><span>Cash${total ? ' · ' + cashPct.toFixed(1) + '%' : ''}${missing ? ' · ' + missing + ' without price' : ''}${noBuy ? ' · ' + noBuy + ' need a buy price' : ''}</span></div>`;
    // accounts overview (only when there is more than one)
    if (accts.length > 1 && curAcct == null) {
      const ov = accts.map((a) => { const c = compute(a.id); const tot = c.value + c.cashTotal; return { a, tot, nat: fromBase(tot, a.cur), pl: c.costB ? c.plB / c.costB * 100 : null, plB: c.plB, costB: c.costB, miss: c.missing }; });
      const all = ov.reduce((x, r) => x + r.tot, 0);
      acctsEl.innerHTML = `<table class="pf pfa"><tr><th style="text-align:left">Account</th><th>Currency</th><th>Value (own currency)</th><th>Value (${escHtml(d.base)})</th><th>Share</th><th>Gain / loss</th></tr>${ov.map(r => `<tr data-pick="${escHtml(r.a.id)}"><td class="sym"><b>${escHtml(r.a.name)}</b></td><td>${escHtml(r.a.cur)}</td><td>${r.nat != null ? fmtMoney(r.nat, r.a.cur) : '–'}</td><td>${fmtMoney(r.tot, d.base)}${r.miss ? ' <small class="neg">price missing</small>' : ''}</td><td>${all ? (r.tot / all * 100).toFixed(1) + '%' : ''}</td><td class="${r.plB >= 0 ? 'pos' : 'neg'}">${r.costB ? signed(r.plB, d.base) + ' <small>' + fmtPct(r.pl) + '</small>' : '–'}</td></tr>`).join('')}</table>`;
    } else acctsEl.innerHTML = '';
    if (!d.holdings.length && !d.cash.length) {
      tblArea.innerHTML = `<div class="pf-empty"><b>Nothing here yet</b><p class="muted">Add the positions you actually own. For each one you'll enter the shares and the price you paid, so gain / loss and the wealth trend are real — no sample data. Use <b>+ Account</b> above if you keep money in several brokers or currencies.</p><button class="btn primary" data-addsym2>${icon('plus', 15)} Add your first holding</button></div>`;
    } else if (!rows.length && !cashRows.length) {
      tblArea.innerHTML = `<div class="pf-empty"><b>This account is empty</b><p class="muted">Add a holding or a cash balance to it.</p></div>`;
    } else {
      tblArea.innerHTML = `<table class="pf"><tr><th>Asset</th><th>Shares</th><th>Avg cost</th><th>Price</th><th>Day</th><th>Value</th><th>P/L</th><th>30d</th><th></th></tr>${rows.map((r) => {
        const i = r.i; const q = r.q || {}; const hd = r.hd; const dayPct2 = q.price != null && q.prevClose ? (q.price - q.prevClose) / q.prevClose * 100 : null;
        const sub = [accts.length > 1 && curAcct == null ? escHtml(acctById(hd.acct).name) : '', hd.firstDate ? 'bought ' + niceDate(hd.firstDate) : '', hd.lots.length > 1 ? hd.lots.length + ' lots' : '', hd.unpriced ? '<span class="neg">' + (hd.pricedShares ? hd.unpriced + ' lot(s) missing price' : 'add buy price') + '</span>' : ''].filter(Boolean).join(' · ');
        return `<tr><td class="sym clickable" data-open="${i}" title="Open chart, key data and news"><b>${escHtml(hd.sym)}</b><small>${escHtml(q.name || (q.ok === false ? 'Not found' : '…'))}</small>${sub ? `<small>${sub}</small>` : ''}</td>
          <td class="lotcell" data-lots="${i}" title="Edit lots (shares, price, date)">${hd.shares}</td><td class="lotcell" data-lots="${i}" title="Edit lots">${hd.cost != null ? fmtMoney(hd.cost, r.cur || d.base) : '<span class="neg">–</span>'}</td>
          <td>${r.price != null ? fmtMoney(r.price, r.cur) : '–'}</td><td class="${dayPct2 >= 0 ? 'pos' : 'neg'}">${dayPct2 != null ? fmtPct(dayPct2) : '–'}</td>
          <td>${r.mvB != null ? fmtMoney(r.mvB, d.base) : '–'}</td><td class="${r.plNative >= 0 ? 'pos' : 'neg'}">${r.plNative != null ? (r.plNative >= 0 ? '+' : '') + fmtMoney(r.plNative, r.cur) + '<br><small>' + fmtPct(r.plPct) + '</small>' : '–'}</td>
          <td>${spark(q.spark, q.spark && q.spark[q.spark.length - 1] >= q.spark[0])}</td>
          <td style="white-space:nowrap"><button class="iconbtn" data-buy="${i}" title="Buy more">${icon('plus', 14)}</button><button class="iconbtn sell" data-sell="${i}" title="Sell (records realized gain / loss)">−</button><button class="iconbtn" data-rm="${i}" title="Remove">${icon('x', 14)}</button></td></tr>`;
      }).join('')}${cashRows.map((r) => `<tr class="cashrow"><td class="sym"><b>Cash</b><select class="cursel" data-ccur="${r.i}">${CURRENCIES.map(c => `<option ${c === r.c.cur ? 'selected' : ''}>${c}</option>`).join('')}</select>${accts.length > 1 && curAcct == null ? `<small>${escHtml(acctById(r.c.acct).name)}</small>` : ''}</td>
          <td colspan="2"><input data-ci="${r.i}" value="${r.c.amount ?? 0}" style="width:120px" title="Cash balance in ${escHtml(r.c.cur)}"></td><td></td><td></td>
          <td>${r.amtB != null ? fmtMoney(r.amtB, d.base) : '–'}</td><td class="muted">${total && r.amtB != null ? (r.amtB / total * 100).toFixed(1) + '%' : ''}</td><td></td>
          <td><button class="iconbtn" data-rmc="${r.i}" title="Remove cash row">${icon('x', 14)}</button></td></tr>`).join('')}</table>`;
    }
    drawPie(rows, cashRows);
    paintRealized();
    drawTrend();
    const t = lastOk ? new Date(lastOk).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null;
    status.innerHTML = `<span class="dot ${online ? 'live' : ''}"></span><span>${loading ? 'Updating prices…' : online ? 'Live · updated ' + t : online === false ? 'Offline — showing last saved prices' + (t ? ' (' + t + ')' : '') : (d.holdings.length ? 'Loading…' : '')}</span><span style="margin-left:auto">Prices from Yahoo Finance (may be delayed) · not financial advice</span>`;
  }

  function renderTabs() {
    if (curAcct != null && !accts.some(a => a.id === curAcct)) curAcct = null;
    const multi = accts.length > 1;
    tabsEl.innerHTML = (multi ? `<button class="pf-tab ${curAcct == null ? 'on' : ''}" data-tab="">All accounts</button>` : '') +
      accts.map(a => `<button class="pf-tab ${curAcct === a.id || (!multi) ? 'on' : ''}" data-tab="${escHtml(a.id)}">${escHtml(a.name)} <small>${escHtml(a.cur)}</small></button>`).join('') +
      `<button class="pf-tab add" data-addacct title="Add another account (another broker, bank, currency…)">+ Account</button>` +
      ((curAcct != null || !multi) ? `<button class="iconbtn" data-editacct title="Rename / change currency / delete this account">${icon('pen', 14)}</button>` : '');
    body.querySelectorAll('[data-ranges] button').forEach(bt => bt.classList.toggle('on', bt.dataset.r === range));
  }

  function drawPie(rows, cashRows = []) {
    if (pie) { pie.destroy(); pie = null; }
    const cashTotal = cashRows.reduce((x, r) => x + (r.amtB || 0), 0);
    let data = [];
    if (pieMode === 'holding') {
      data = rows.filter(r => r.mvB != null && r.mvB > 0).map(r => ({ label: r.hd.sym, v: r.mvB }));
      if (cashTotal > 0) data.push({ label: 'Cash', v: cashTotal, cash: true });
    } else {
      const g = new Map(); const add = (k, v) => { if (v > 0) g.set(k, (g.get(k) || 0) + v); };
      rows.forEach(r => add(pieMode === 'currency' ? (r.cur || d.base) : acctById(r.hd.acct).name, r.mvB || 0));
      cashRows.forEach(r => add(pieMode === 'currency' ? r.c.cur : acctById(r.c.acct).name, r.amtB || 0));
      data = [...g.entries()].map(([label, v]) => ({ label, v })).sort((x, y) => y.v - x.v);
    }
    body.querySelector('.pie-area').style.display = data.length ? '' : 'none';
    if (!window.Chart || !data.length) return;
    if (!pieCanvas.isConnected) { setTimeout(() => { if (pieCanvas.isConnected) drawPie(rows, cashRows); }, 60); return; }
    const pal = themeColors(); const sum = data.reduce((a, x) => a + x.v, 0);
    pie = new window.Chart(pieCanvas, {
      type: 'doughnut', data: { labels: data.map(x => x.label), datasets: [{ data: data.map(x => +x.v.toFixed(2)), backgroundColor: data.map((x, i) => x.cash ? cssVar('--muted') : pal[i % pal.length]), borderColor: cssVar('--card'), borderWidth: 3, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', animation: { duration: 500 }, plugins: { legend: { position: 'bottom', labels: { color: cssVar('--text'), usePointStyle: true, pointStyle: 'circle', font: { family: 'Inter', weight: '600' } } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtMoney(c.parsed, d.base)} (${(c.parsed / sum * 100).toFixed(1)}%)` } } } }
    });
  }

  // ---------- wealth over time (real data only) ----------
  function drawTrend() {
    if (trend) { trend.destroy(); trend = null; }
    const all = series(curAcct), pts = inRange(all);
    const wrap = body.querySelector('.pf-trend-c');
    wrap.style.display = pts.length >= 2 ? '' : 'none'; chips.innerHTML = '';
    body.querySelector('[data-clear]').style.display = (d.history || []).length ? '' : 'none';
    if (!d.holdings.length) { trendNote.textContent = 'Appears once you add holdings.'; return; }
    if (pts.length < 2) { trendNote.textContent = all.length >= 2 ? 'No data in this range yet — pick a longer one.' : 'Recording started — a point is saved each day you open this page. Add buy dates and press “Rebuild from buy dates” to see the past.'; return; }
    const st = stats(pts); const cur = d.base;
    chips.innerHTML = `<div class="chip"><span>Wealth ${escHtml(st.cashOk ? '(incl. cash)' : '(holdings)')}</span><b>${fmtMoney(st.w1, cur)}</b><small>from ${fmtMoney(st.w0, cur)}</small></div>
      <div class="chip"><span>Change</span><b class="${st.delta >= 0 ? 'pos' : 'neg'}">${signed(st.delta, cur)}</b><small class="${st.delta >= 0 ? 'pos' : 'neg'}">${fmtPct(st.pct)}</small></div>
      <div class="chip" title="Money you put in (buys) during this range"><span>New money added</span><b>${signed(st.newMoney, cur)}</b><small>buys in range</small></div>
      <div class="chip" title="Change that came from prices moving, not from you adding money"><span>Market gain</span><b class="${st.market >= 0 ? 'pos' : 'neg'}">${signed(st.market, cur)}</b><small>${st.w0 + Math.max(st.newMoney, 0) > 0 ? fmtPct(st.market / (st.w0 + Math.max(st.newMoney, 0)) * 100) + ' · ' : ''}prices only</small></div>`;
    trendNote.textContent = pts.length + ' points · ' + niceDate(pts[0].d) + ' → ' + niceDate(pts[pts.length - 1].d) + (all.some(p => p.c == null) ? ' · cash is only included on days it was recorded' : '');
    if (!window.Chart) return;
    if (!trendCanvas.isConnected) { setTimeout(() => { if (trendCanvas.isConnected) drawTrend(); }, 60); return; }
    const text = cssVar('--text'), muted = cssVar('--muted'), line = cssVar('--line');
    const cashOk = st.cashOk && pts.every(p => p.c != null);
    const tot = pts.map(p => r2(p.h + (cashOk ? p.c : 0)));
    const up = tot[tot.length - 1] >= tot[0], col = up ? '#27ae7a' : '#e5484d';
    const ds = [{ label: cashOk ? 'Total wealth' : 'Holdings value', data: tot, borderColor: col, backgroundColor: col + '1f', fill: true, borderWidth: 2.6, pointRadius: pts.length < 25 ? 3 : 0, tension: .25 }];
    if (pts.some(p => p.k > 0)) ds.push({ label: 'Amount you paid in', data: pts.map(p => (p.k > 0 ? r2(p.k + (cashOk ? p.c : 0)) : null)), borderColor: muted, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, stepped: true, spanGaps: true });
    trend = new window.Chart(trendCanvas, {
      type: 'line', data: { labels: pts.map(p => p.d), datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { color: text, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { title: (c) => niceDate(c[0].label), label: (c) => { const v = c.parsed.y; if (c.datasetIndex === 0) { const dl = v - tot[0], pc = tot[0] ? dl / tot[0] * 100 : 0; return ` ${c.dataset.label}: ${fmtMoney(v, cur)}  (${signed(dl, cur)} · ${fmtPct(pc)} since ${niceDate(pts[0].d)})`; } return ` ${c.dataset.label}: ${fmtMoney(v, cur)}`; } } } },
        scales: { x: { grid: { display: false }, ticks: { color: muted, maxTicksLimit: 7, callback: function (v) { const s = this.getLabelForValue(v); return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } } }, y: { grid: { color: line }, ticks: { color: muted, callback: (v) => fmtMoney(v, cur) } } } }
    });
  }
  function snapEntry(day) {
    const all = compute(null); const e = { d: day, h: r2(all.value), c: r2(all.cashTotal), k: r2(all.costB), a: {} };
    accts.forEach((a) => { const c = compute(a.id); e.a[a.id] = { h: r2(c.value), c: r2(c.cashTotal), k: r2(c.costB) }; });
    return e;
  }
  function recordSnapshot() {
    if (!d.holdings.length) return;
    const e = snapEntry(dayKey(Date.now()));
    const i = d.history.findIndex(x => x.d === e.d);
    if (i >= 0 && !d.history[i].b && Math.abs(d.history[i].h - e.h) < 0.01 && Math.abs((d.history[i].c || 0) - e.c) < 0.01 && d.history[i].a) return;
    if (i >= 0) d.history[i] = e; else d.history.push(e);
    d.history.sort((a, b2) => (a.d < b2.d ? -1 : 1));
    api.changed();
  }
  async function rebuild() {
    const hs = d.holdings.filter(hd => hd.lots.some(l => l.date && l.shares > 0));
    if (!hs.length) { toast('Add the date you bought each position first (click its Shares to edit lots)'); return; }
    const earliest = hs.flatMap(hd => hd.lots.filter(l => l.date).map(l => l.date)).sort()[0];
    const range2 = rangeFor((Date.now() - new Date(earliest + 'T00:00:00')) / 864e5 + 6);
    trendNote.textContent = 'Rebuilding from price history…';
    const sers = {}, fxs = {};
    await Promise.all([...new Set(hs.map(hd => hd.sym))].map(async sym => { sers[sym] = await window.api.price.history(sym, range2); }));
    const curs = [...new Set(hs.map(hd => quotes[hd.sym] && quotes[hd.sym].currency).filter(c => c && c !== d.base))];
    await Promise.all(curs.map(async c => { fxs[c] = await window.api.price.history((c === 'GBp' ? 'GBP' : c) + d.base + '=X', range2); }));
    const daySet = new Set(); hs.forEach(hd => { const s = sers[hd.sym]; if (s && s.t) s.t.forEach(t => daySet.add(dayKey(t * 1000))); });
    const days = [...daySet].sort().filter(x => x >= earliest);
    if (!days.length) { toast('No price history was returned — check your connection and tickers'); drawTrend(); return; }
    const carry = (s) => { const m = new Map(); if (!s || !s.t) return m; const pts = s.t.map((t, i) => [dayKey(t * 1000), s.c[i]]).filter(p => p[1] != null); let k = 0, last = null; days.forEach(day => { while (k < pts.length && pts[k][0] <= day) { last = pts[k][1]; k++; } m.set(day, last); }); return m; };
    const cm = {}; hs.forEach(hd => { cm[hd.sym] = carry(sers[hd.sym]); });
    const fm = {}; curs.forEach(c => { fm[c] = carry(fxs[c]); });
    const fxOn = (cur, day) => { if (!cur || cur === d.base) return 1; let v = fm[cur] && fm[cur].get(day); if (v == null && fm[cur]) v = fm[cur].get(days.find(x => x >= day) || days[days.length - 1]); if (v == null) v = fx[cur === 'GBp' ? 'GBP' : cur]; if (v == null) return null; return cur === 'GBp' ? v * 0.01 : v; };
    const out = [];
    for (const day of days) {
      let hv = 0, kv = 0, any = false; const per = {};
      for (const hd of hs) {
        const cur = quotes[hd.sym] && quotes[hd.sym].currency; const close = cm[hd.sym].get(day); const f = fxOn(cur, day); if (close == null || f == null) continue;
        for (const l of hd.lots) {
          if (!l.date || l.date > day || !(l.shares > 0)) continue; any = true;
          const v = l.shares * close * f; hv += v; const pa = per[hd.acct] || (per[hd.acct] = { h: 0, k: 0 }); pa.h += v;
          if (l.price != null) { const fl = fxOn(cur, l.date) ?? f; const kk = l.shares * l.price * fl; kv += kk; pa.k += kk; }
        }
      }
      if (any && hv > 0) out.push({ d: day, h: r2(hv), k: r2(kv), b: 1, a: Object.fromEntries(Object.entries(per).map(([id, x]) => [id, { h: r2(x.h), k: r2(x.k) }])) });
    }
    const real = d.history.filter(e => !e.b); const realDays = new Set(real.map(e => e.d));
    let merged = [...out.filter(e => !realDays.has(e.d)), ...real].sort((a, b2) => (a.d < b2.d ? -1 : 1));
    if (merged.length > 900) { const step = Math.ceil(merged.length / 900); merged = merged.filter((e, i) => i % step === 0 || i === merged.length - 1); }
    d.history = merged; api.changed(true); paint();
    const skipped = d.holdings.filter(hd => !hd.firstDate).length;
    toast('Rebuilt ' + out.length + ' days of history' + (skipped ? ' — ' + skipped + ' holding(s) without a buy date were skipped' : ''), skipped ? 4500 : 2500);
  }

  // ---------- refresh live prices ----------
  async function refresh() {
    if (loading) return;
    loading = true; paint();
    try {
      const syms = [...new Set(d.holdings.map(x => x.sym))];
      const allCurs = () => new Set([...Object.values(quotes).map(q => q.currency), ...d.cash.map(c => c.cur), ...accts.map(a => a.cur)].filter(Boolean));
      const fxSyms = [...allCurs()].filter(c => c !== d.base).map(c => (c === 'GBp' ? 'GBP' : c) + d.base + '=X');
      const res = syms.length || fxSyms.length ? await window.api.price.quotes([...syms, ...fxSyms]) : {};
      let any = false;
      for (const s of syms) { if (res[s] && res[s].ok) { quotes[s] = res[s]; any = true; } else if (res[s]) quotes[s] = Object.assign({}, quotes[s] || {}, { ok: !!(quotes[s] && quotes[s].price), error: res[s].error }); }
      fx = {};
      for (const c of allCurs()) { const code = c === 'GBp' ? 'GBP' : c; const r = res[code + d.base + '=X']; if (r && r.ok) fx[code] = r.price; }
      if (fx.GBP) fx.GBp = fx.GBP / 100;
      const need = [...allCurs()].filter(c => c && c !== d.base && fx[c] == null && c !== 'GBp');
      if (need.length) { const r2q = await window.api.price.quotes(need.map(c => c + d.base + '=X')); need.forEach(c => { const r = r2q[c + d.base + '=X']; if (r && r.ok) fx[c] = r.price; }); }
      online = any || syms.length === 0; if (any) lastOk = Date.now();
      saveCache(quotes);
      const c = compute(null);
      if (any && !c.missing && d.holdings.length) recordSnapshot();
    } catch (e) { online = false; }
    loading = false; paint();
  }

  // ---------- add holding (asks what you paid) ----------
  function openBuy(prefIdx) {
    const existing = prefIdx != null ? d.holdings[prefIdx] : null; const prefSym = existing ? existing.sym : null;
    const m = modal(`<div class="modal-h">${existing ? 'Buy more ' + escHtml(prefSym) : 'Add a holding'}</div><div class="modal-b pf-form">
      <label>Ticker<input data-f="sym" placeholder="AAPL · 005930.KS · BTC-USD · ALV.DE" autocomplete="off" ${existing ? 'readonly' : ''}><div class="pf-sug"></div></label>
      ${accts.length > 1 && !existing ? `<label>Account<select data-f="acct" class="inp" style="display:block;width:100%;margin-top:4px">${accts.map(a => `<option value="${escHtml(a.id)}" ${a.id === (curAcct || firstId) ? 'selected' : ''}>${escHtml(a.name)} (${escHtml(a.cur)})</option>`).join('')}</select></label>` : ''}
      <div class="pf-row2"><label>Shares / units<input data-f="shares" inputmode="decimal" placeholder="e.g. 10"></label><label>Price you paid per share <small class="cur"></small><input data-f="price" inputmode="decimal" placeholder="e.g. 150.25"></label></div>
      <label>Date bought <span class="muted">(optional — lets the net-worth trend rebuild the past)</span><input data-f="date" type="date"></label>
      <div class="pf-prev muted"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-a="c">Cancel</button><button class="btn primary" data-a="ok">${existing ? 'Add purchase' : 'Add holding'}</button></div></div>`, { center: true });
    const q = (s) => m.el.querySelector(s); const F = (k) => m.el.querySelector(`[data-f=${k}]`);
    const sug = q('.pf-sug'), prev = q('.pf-prev'), curEl = q('.cur');
    F('date').max = dayKey(Date.now());
    let cur = null, nowPrice = null;
    if (existing) F('sym').value = existing.sym;
    const lookup = async () => {
      const s = F('sym').value.trim().toUpperCase(); if (!s) return;
      const r = await window.api.price.quotes([s]); const x = r[s];
      if (x && x.ok) { cur = x.currency; nowPrice = x.price; curEl.textContent = '(' + x.currency + ')'; prev.textContent = x.name + ' — current price ' + fmtMoney(x.price, x.currency); quotes[s] = x; updatePrev(); }
      else { cur = null; nowPrice = null; curEl.textContent = ''; prev.textContent = 'Could not find “' + s + '” — check the ticker.'; }
    };
    const updatePrev = () => { const p = num(F('price').value), n = num(F('shares').value); if (nowPrice != null && p > 0) { const pct = (nowPrice / p - 1) * 100; prev.innerHTML = prev.textContent.split(' — ')[0] + ' — now ' + fmtMoney(nowPrice, cur) + ' · <b class="' + (pct >= 0 ? 'pos' : 'neg') + '">' + fmtPct(pct) + '</b>' + (n > 0 ? ' (' + (pct >= 0 ? '+' : '') + fmtMoney((nowPrice - p) * n, cur) + ')' : '') + ' vs your price'; } };
    F('price').addEventListener('input', updatePrev); F('shares').addEventListener('input', updatePrev);
    F('sym').addEventListener('change', lookup);
    const doSearch = debounce(async () => {
      const v = F('sym').value.trim(); if (v.length < 2 || existing) { sug.innerHTML = ''; return; }
      const res = await window.api.price.search(v);
      sug.innerHTML = res.slice(0, 6).map(x => `<button type="button" data-s="${escHtml(x.symbol)}"><b>${escHtml(x.symbol)}</b> <span class="muted">${escHtml(x.name)} · ${escHtml(x.exchange || x.type || '')}</span></button>`).join('');
    }, 300);
    F('sym').addEventListener('input', doSearch);
    sug.addEventListener('click', (e) => { const bt = e.target.closest('[data-s]'); if (bt) { F('sym').value = bt.dataset.s; sug.innerHTML = ''; lookup(); F('shares').focus(); } });
    m.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target !== F('sym')) q('[data-a=ok]').click(); });
    q('[data-a=c]').onclick = () => m.close();
    q('[data-a=ok]').onclick = async () => {
      const sym = F('sym').value.trim().toUpperCase(); const shares = num(F('shares').value); const priceRaw = F('price').value.trim(); const price = priceRaw === '' ? null : num(priceRaw); const date = F('date').value;
      if (!sym) { toast('Enter a ticker'); F('sym').focus(); return; }
      if (!(shares > 0)) { toast('How many shares / units did you buy?'); F('shares').focus(); return; }
      if (price == null || !(price > 0)) { toast('Enter the price you paid per share — that is what makes gain / loss real'); F('price').focus(); return; }
      const aid = existing ? existing.acct : (F('acct') ? F('acct').value : (curAcct || firstId));
      let hd = existing || d.holdings.find(x => x.sym === sym && x.acct === aid);
      if (!hd) { hd = { sym, acct: aid, lots: [] }; d.holdings.push(hd); }
      hd.lots.push({ shares, price, date }); sync(hd); api.changed(true); m.close(); paint(); await refresh();
      if (quotes[sym] && quotes[sym].ok === false) toast('Could not find ' + sym + ' — check the ticker');
    };
    setTimeout(() => (existing ? F('shares') : F('sym')).focus(), 60);
  }

  // ---------- edit lots ----------
  function openLots(i) {
    const hd = d.holdings[i]; if (!hd) return;
    const m = modal(`<div class="modal-h">${escHtml(hd.sym)} — your purchases</div><div class="modal-b"><div class="muted" style="margin-bottom:8px">Each row is one purchase. Average cost, gain / loss and the trend are calculated from these.</div><table class="pf lots"><tr><th style="text-align:left">Shares</th><th>Price paid</th><th>Date bought</th><th></th></tr></table><div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm ghost" data-add>+ Add purchase</button><span style="flex:1"></span><button class="btn primary" data-done>Done</button></div></div>`, { center: true, onClose: () => { sync(hd); api.changed(true); paint(); } });
    const tb = m.el.querySelector('table');
    const draw = () => { tb.innerHTML = '<tr><th style="text-align:left">Shares</th><th>Price paid</th><th>Date bought</th><th></th></tr>' + hd.lots.map((l, k) => `<tr><td><input data-k="${k}" data-f="shares" value="${l.shares}" style="width:90px;text-align:left"></td><td><input data-k="${k}" data-f="price" value="${l.price ?? ''}" placeholder="required" style="width:110px"></td><td><input data-k="${k}" data-f="date" type="date" value="${l.date}" max="${dayKey(Date.now())}" style="width:150px"></td><td><button class="iconbtn" data-del="${k}">${icon('x', 14)}</button></td></tr>`).join(''); };
    draw();
    m.el.addEventListener('keydown', (e) => e.stopPropagation());
    tb.addEventListener('input', (e) => { const t = e.target; if (t.dataset.k == null) return; const l = hd.lots[+t.dataset.k]; if (t.dataset.f === 'date') l.date = t.value; else if (t.dataset.f === 'price') l.price = t.value.trim() === '' ? null : num(t.value); else l.shares = num(t.value); });
    tb.addEventListener('click', (e) => { const x = e.target.closest('[data-del]'); if (x) { hd.lots.splice(+x.dataset.del, 1); draw(); } });
    m.el.querySelector('[data-add]').onclick = () => { hd.lots.push({ shares: 0, price: null, date: '' }); draw(); };
    m.el.querySelector('[data-done]').onclick = () => m.close();
  }

  // ---------- selling (FIFO) and realized gains ----------
  const realizedB = (aid = curAcct) => d.sales.filter(x => aid == null || x.acct === aid).reduce((t, x) => { const v = toBase(x.pricedSold * x.price - x.cost, x.cur); return t + (v || 0); }, 0);
  function paintRealized() {
    const list = d.sales.filter(x => curAcct == null || x.acct === curAcct);
    if (!list.length) { realEl.innerHTML = ''; return; }
    const r = realizedB();
    realEl.innerHTML = `<span>Realized gains from ${list.length} sale${list.length > 1 ? 's' : ''}: <b class="${r >= 0 ? 'pos' : 'neg'}">${signed(r, d.base)}</b></span><button class="btn sm ghost" data-sales>View sales</button>`;
  }
  function openSell(i) {
    const hd = d.holdings[i]; if (!hd) return;
    const q = quotes[hd.sym] || {}; const cur = q.currency || d.base;
    const m = modal(`<div class="modal-h">Sell ${escHtml(hd.sym)}</div><div class="modal-b pf-form">
      <div class="muted" style="margin-bottom:8px">You hold ${hd.shares}. The oldest purchases are sold first (FIFO) and the gain / loss is recorded.</div>
      <div class="pf-row2"><label>Shares sold<input data-f="shares" inputmode="decimal" value="${hd.shares}"></label><label>Price per share <small>(${escHtml(cur)})</small><input data-f="price" inputmode="decimal" value="${q.price != null ? q.price : ''}"></label></div>
      <label>Date sold<input data-f="date" type="date" value="${dayKey(Date.now())}" max="${dayKey(Date.now())}"></label>
      <label style="display:flex;align-items:center;gap:8px;font-weight:500"><input type="checkbox" data-f="cash" checked style="width:auto;margin:0"> Add the proceeds to this account's ${escHtml(cur)} cash</label>
      <div class="pf-prev muted"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-a="c">Cancel</button><button class="btn primary" data-a="ok">Record sale</button></div></div>`, { center: true });
    const F = (k) => m.el.querySelector(`[data-f=${k}]`), prev = m.el.querySelector('.pf-prev');
    const preview = () => { const n = num(F('shares').value), p = num(F('price').value); if (!(n > 0 && p > 0)) { prev.textContent = ''; return; } const t = fifoCost(hd, Math.min(n, hd.shares)); const gl = t.pricedSold * p - t.cost; prev.innerHTML = t.pricedSold ? `Realized: <b class="${gl >= 0 ? 'pos' : 'neg'}">${gl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(gl), cur)}</b> · proceeds ${fmtMoney(n * p, cur)}` : `Proceeds ${fmtMoney(n * p, cur)} (no buy price recorded for these shares, so no gain / loss)`; };
    m.el.addEventListener('input', preview); preview();
    m.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') m.el.querySelector('[data-a=ok]').click(); });
    m.el.querySelector('[data-a=c]').onclick = () => m.close();
    m.el.querySelector('[data-a=ok]').onclick = () => {
      const n = num(F('shares').value), p = num(F('price').value);
      if (!(n > 0) || n > hd.shares + 1e-9) { toast('You can sell between 0 and ' + hd.shares + ' shares'); return; }
      if (!(p > 0)) { toast('Enter the price you sold at'); return; }
      const t = fifoCost(hd, n, true);
      d.sales.push({ id: Date.now().toString(36), sym: hd.sym, acct: hd.acct, shares: n, price: p, date: F('date').value || dayKey(Date.now()), cur, cost: t.cost, pricedSold: t.pricedSold });
      if (F('cash').checked) { let c = d.cash.find(x => x.acct === hd.acct && x.cur === cur); if (!c) { c = { cur, amount: 0, acct: hd.acct }; d.cash.push(c); } c.amount = r2((c.amount || 0) + n * p); }
      if (!hd.lots.length) d.holdings.splice(d.holdings.indexOf(hd), 1); else sync(hd);
      api.changed(true); m.close(); paint(); toast('Sale recorded');
    };
    setTimeout(() => F('shares').select(), 60);
  }
  // cost of the first n shares (oldest first); apply = actually remove them from the lots
  function fifoCost(hd, n, apply) {
    const lots = hd.lots.map((l, k) => ({ l, k, sh: l.shares })).sort((a, b2) => { const x = a.l.date || '9999', y = b2.l.date || '9999'; return x < y ? -1 : x > y ? 1 : a.k - b2.k; });
    let left = n, cost = 0, pricedSold = 0;
    for (const o of lots) { if (left <= 1e-12) break; const t = Math.min(o.sh, left); if (o.l.price != null) { cost += t * o.l.price; pricedSold += t; } if (apply) o.l.shares = o.sh - t; left -= t; }
    if (apply) hd.lots = hd.lots.filter(l => l.shares > 1e-9);
    return { cost, pricedSold };
  }
  function openSales() {
    const list = d.sales.filter(x => curAcct == null || x.acct === curAcct).slice().reverse();
    const m = modal(`<div class="modal-h">Sales</div><div class="modal-b"><table class="pf lots"><tr><th style="text-align:left">Date</th><th style="text-align:left">Asset</th><th>Shares</th><th>Sold at</th><th>Realized</th><th></th></tr>${list.map(x => { const gl = x.pricedSold ? x.pricedSold * x.price - x.cost : null; return `<tr><td style="text-align:left">${niceDate(x.date)}</td><td style="text-align:left"><b>${escHtml(x.sym)}</b></td><td>${x.shares}</td><td>${fmtMoney(x.price, x.cur)}</td><td class="${gl >= 0 ? 'pos' : 'neg'}">${gl != null ? (gl >= 0 ? '+' : '−') + fmtMoney(Math.abs(gl), x.cur) : '–'}</td><td><button class="iconbtn" data-delsale="${x.id}" title="Remove this record (does not restore the shares)">${icon('x', 14)}</button></td></tr>`; }).join('')}</table><div style="text-align:right;margin-top:10px"><button class="btn primary" data-done>Done</button></div></div>`, { center: true });
    m.el.addEventListener('click', (e) => { const x = e.target.closest('[data-delsale]'); if (x) { d.sales = d.sales.filter(s2 => s2.id !== x.dataset.delsale); api.changed(true); m.close(); paint(); if (d.sales.length) openSales(); } });
    m.el.querySelector('[data-done]').onclick = () => m.close();
  }
  function exportCsv() {
    const q2 = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Type', 'Account', 'Symbol', 'Shares', 'Price paid', 'Date', 'Currency']];
    d.holdings.forEach((hd) => { const cur = (quotes[hd.sym] && quotes[hd.sym].currency) || ''; hd.lots.forEach((l) => rows.push(['Buy', acctById(hd.acct).name, hd.sym, l.shares, l.price ?? '', l.date, cur])); });
    d.sales.forEach((x) => rows.push(['Sell', acctById(x.acct).name, x.sym, x.shares, x.price, x.date, x.cur]));
    d.cash.forEach((c) => rows.push(['Cash', acctById(c.acct).name, '', '', c.amount, '', c.cur]));
    window.api.exportFile((d.title || 'portfolio').replace(/[\\/:*?"<>|]/g, '_'), rows.map(r => r.map(q2).join(',')).join('\n'), 'csv').then((f) => { if (f) toast('Saved ' + f); });
  }

  // ---------- accounts ----------
  function openAcct(a) {
    const m = modal(`<div class="modal-h">${a ? 'Edit account' : 'New account'}</div><div class="modal-b pf-form">
      <label>Name<input data-f="name" placeholder="e.g. Fidelity brokerage · Toss · Bank savings" value="${a ? escHtml(a.name) : ''}"></label>
      <label>Account currency<select data-f="cur" class="inp" style="display:block;width:100%;margin-top:4px">${CURRENCIES.map(c => `<option ${c === (a ? a.cur : d.base) ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <div class="muted" style="font-size:12.5px">Each account can hold stocks in any currency. Everything is converted to <b>${escHtml(d.base)}</b> for the totals (change that with “Totals in” at the top).</div>
      <div style="display:flex;gap:8px;margin-top:12px">${a && accts.length > 1 ? '<button class="btn ghost" data-a="del" style="color:#e5484d">Delete account</button>' : ''}<span style="flex:1"></span><button class="btn ghost" data-a="c">Cancel</button><button class="btn primary" data-a="ok">${a ? 'Save' : 'Add account'}</button></div></div>`, { center: true });
    const F = (k) => m.el.querySelector(`[data-f=${k}]`);
    m.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') m.el.querySelector('[data-a=ok]').click(); });
    m.el.querySelector('[data-a=c]').onclick = () => m.close();
    m.el.querySelector('[data-a=ok]').onclick = () => {
      const name = F('name').value.trim(); if (!name) { toast('Give the account a name'); F('name').focus(); return; }
      if (a) { a.name = name; a.cur = F('cur').value; }
      else { const id = 'a' + Date.now().toString(36); accts.push({ id, name, cur: F('cur').value }); curAcct = id; }
      api.changed(true); m.close(); refresh();
    };
    const del = m.el.querySelector('[data-a=del]');
    if (del) del.onclick = async () => {
      const n = d.holdings.filter(x => x.acct === a.id).length + d.cash.filter(x => x.acct === a.id).length;
      if (!(await confirmDialog('Delete “' + a.name + '”' + (n ? ' and its ' + n + ' holding/cash row(s)?' : '?'), 'Delete'))) return;
      d.holdings = d.holdings.filter(x => x.acct !== a.id); d.cash = d.cash.filter(x => x.acct !== a.id);
      accts.splice(accts.indexOf(a), 1); d.history = d.history.filter(e => !e.b); d.history.forEach(e => { if (e.a) delete e.a[a.id]; });
      curAcct = null; m.close(); api.changed(true); paint();
    };
    setTimeout(() => F('name').focus(), 60);
  }

  // ---------- events ----------
  baseSel.onchange = () => { if (baseSel.value === d.base) return; d.base = baseSel.value; if (d.history.length) { d.history = []; toast('Totals currency changed — the wealth history starts fresh (use Rebuild to restore the past)'); } api.changed(true); refresh(); };
  tblArea.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.ci != null) {
      d.cash[+t.dataset.ci].amount = num(t.value); api.changed();
      const pos = t.selectionStart, ci = t.dataset.ci; paint();
      const nf = tblArea.querySelector(`input[data-ci="${ci}"]`); if (nf) { nf.focus(); try { nf.setSelectionRange(pos, pos); } catch (err) { /* */ } }
    }
  });
  tblArea.addEventListener('keydown', (e) => e.stopPropagation());
  tblArea.addEventListener('click', async (e) => {
    const op = e.target.closest('[data-open]'); if (op) { const hd = d.holdings[+op.dataset.open]; if (hd) openStock(hd.sym, { quote: quotes[hd.sym], holding: hd, base: d.base }); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { const hd = d.holdings[+rm.dataset.rm]; if (hd && await confirmDialog('Remove ' + hd.sym + ' from this portfolio?', 'Remove')) { d.holdings.splice(+rm.dataset.rm, 1); api.changed(true); paint(); } return; }
    const rc = e.target.closest('[data-rmc]'); if (rc) { d.cash.splice(+rc.dataset.rmc, 1); api.changed(true); paint(); return; }
    const sl = e.target.closest('[data-sell]'); if (sl) { openSell(+sl.dataset.sell); return; }
    const bu = e.target.closest('[data-buy]'); if (bu) { openBuy(+bu.dataset.buy); return; }
    const lo = e.target.closest('[data-lots]'); if (lo) { openLots(+lo.dataset.lots); return; }
    if (e.target.closest('[data-addsym2]')) openBuy();
  });
  acctsEl.addEventListener('click', (e) => { const r = e.target.closest('[data-pick]'); if (r) { curAcct = r.dataset.pick; paint(); } });
  tabsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-addacct]')) { openAcct(null); return; }
    if (e.target.closest('[data-editacct]')) { openAcct(acctById(curAcct != null ? curAcct : firstId)); return; }
    const t = e.target.closest('[data-tab]'); if (t) { curAcct = t.dataset.tab === '' ? null : t.dataset.tab; paint(); }
  });
  body.querySelector('[data-ranges]').addEventListener('click', (e) => { const bt = e.target.closest('[data-r]'); if (bt) { range = bt.dataset.r; paint(); } });
  tblArea.addEventListener('change', (e) => { const s = e.target.closest('[data-ccur]'); if (s) { d.cash[+s.dataset.ccur].cur = s.value; api.changed(true); refresh(); } });
  body.querySelector('[data-addsym]').onclick = () => openBuy();
  body.querySelector('[data-addcash]').onclick = () => { const ac = curAcct || firstId; d.cash.push({ cur: acctById(ac).cur, amount: 0, acct: ac }); api.changed(true); paint(); const ins = tblArea.querySelectorAll('input[data-ci]'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } };
  body.querySelector('[data-rebuild]').onclick = () => rebuild();
  body.querySelector('[data-csv]').onclick = () => exportCsv();
  realEl.addEventListener('click', (e) => { if (e.target.closest('[data-sales]')) openSales(); });
  body.querySelector('.pie-mode').addEventListener('change', (e) => { pieMode = e.target.value; paint(); });
  body.querySelector('[data-clear]').onclick = async () => { if (await confirmDialog('Delete the recorded net-worth history? (It starts recording again from today.)', 'Clear history')) { d.history = []; api.changed(true); drawTrend(); } };
  refreshBtn.onclick = () => { refresh(); };

  paint(); refresh();
  timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); return; } if (document.visibilityState === 'visible') refresh(); }, 60000);
  onTheme(el, () => paint());
  return el;
}

// Value of one or several portfolio blocks right now, converted into `target`. items: [{ d, acct }] (acct null = all accounts)
export async function liveSummary(items, target) {
  const hds = [], cashes = [];
  items.forEach(({ d, acct }) => {
    const accts = Array.isArray(d.accounts) && d.accounts.length ? d.accounts : [{ id: 'main' }]; const first = accts[0].id;
    (d.holdings || []).forEach((hd) => { const c = JSON.parse(JSON.stringify(hd)); sync(c); c.acct = c.acct && accts.some(a => a.id === c.acct) ? c.acct : first; if (acct == null || c.acct === acct) hds.push(c); });
    const cl = Array.isArray(d.cash) ? d.cash : (typeof d.cash === 'number' && d.cash ? [{ cur: d.base || 'USD', amount: d.cash }] : []);
    cl.forEach((c) => { const a = c.acct && accts.some(x => x.id === c.acct) ? c.acct : first; if (acct == null || a === acct) cashes.push(c); });
  });
  const syms = [...new Set(hds.map(x => x.sym))];
  const quotes = syms.length ? await window.api.price.quotes(syms) : {};
  const curs = new Set([...cashes.map(c => c.cur), ...syms.map(s => quotes[s] && quotes[s].currency)].filter(Boolean));
  const fxSyms = [...curs].filter(c => c !== target).map(c => (c === 'GBp' ? 'GBP' : c) + target + '=X');
  const fxRes = fxSyms.length ? await window.api.price.quotes(fxSyms) : {};
  const fx = {}; curs.forEach((c) => { const code = c === 'GBp' ? 'GBP' : c; const r = fxRes[code + target + '=X']; if (r && r.ok) fx[code] = r.price; });
  if (fx.GBP) fx.GBp = fx.GBP / 100;
  const conv = (a, c) => (!c || c === target ? a : fx[c] != null ? a * fx[c] : null);
  let value = 0, day = 0, cost = 0, pl = 0, n = 0, missing = 0, noBuy = 0;
  hds.forEach((hd) => {
    const q = quotes[hd.sym]; if (!q || !q.ok) { missing++; return; }
    const mv = conv(hd.shares * q.price, q.currency); if (mv == null) { missing++; return; }
    value += mv; n++;
    const dd = q.prevClose != null ? conv(hd.shares * (q.price - q.prevClose), q.currency) : null; if (dd != null) day += dd;
    if (hd.pricedShares > 0) { const cb = conv(hd.costBasis, q.currency), pp = conv(hd.pricedShares * q.price - hd.costBasis, q.currency); if (cb != null && pp != null) { cost += cb; pl += pp; } }
    if (hd.unpriced || !hd.pricedShares) noBuy++;
  });
  const cash = cashes.reduce((a, c) => a + (conv(c.amount || 0, c.cur) || 0), 0);
  const total = value + cash;
  return { value, cash, total, day, dayPct: total - day ? day / (total - day) * 100 : null, cost, pl, plPct: cost ? pl / cost * 100 : null, n, count: hds.length, missing, noBuy };
}
