import { h, escHtml, fmtMoney, fmtPct, modal, ago } from '../ui.js';
import { cssVar } from './common.js';

// Stock detail window: price chart (1D … MAX), key ratios (P/E, ROE …), your position and related news.
const KEYS = ['1D', '5D', '1M', '6M', '1Y', '5Y', 'MAX'];
const compact = (n, cur) => {
  if (n == null || isNaN(n)) return '–';
  try { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2, style: cur ? 'currency' : 'decimal', currency: cur || undefined }).format(n); } catch (e) { return String(n); }
};
const num2 = (n, d = 2) => (n == null || isNaN(n) ? '–' : Number(n).toFixed(d));
const pct2 = (n) => (n == null || isNaN(n) ? '–' : (n * 100).toFixed(2) + '%');
const pct = (n) => (n == null || isNaN(n) ? '–' : (n * 100).toFixed(1) + '%');

export async function openStock(sym, opts = {}) {
  const q = Object.assign({}, opts.quote || {}); const hd = opts.holding || null; const baseCur = opts.base;
  if (!q.name || q.name === sym) q.name = opts.label || q.name;
  const m = modal(`<div class="modal-h stk-h"><span class="stk-sym">${escHtml(sym)}</span><span class="stk-name muted">${escHtml(q.name || opts.label || '')}</span><button class="iconbtn stk-x" data-x title="Close">✕</button></div>
    <div class="modal-b stk">
      <div class="stk-price"><b data-price>${q.price != null ? fmtMoney(q.price, q.currency) : '…'}</b><span data-chg></span><span class="muted" data-when></span></div>
      <div class="stk-bar"><div class="pf-seg stk-ranges">${KEYS.map(k => `<button data-k="${k}">${k === 'MAX' ? 'Max' : k}</button>`).join('')}</div><select class="inp stk-cmp" data-cmp title="Compare performance with an index"><option value="">Compare with…</option><option value="^GSPC">S&amp;P 500</option><option value="^IXIC">NASDAQ</option><option value="^KS11">KOSPI</option><option value="^N225">Nikkei 225</option><option value="^STOXX50E">Euro Stoxx 50</option></select></div>
      <div class="stk-chart"><canvas></canvas><div class="stk-load muted">Loading chart…</div></div>
      <div class="stk-grid" data-stats><div class="muted">Loading key data…</div></div>
      <div class="stk-sec" data-pos></div>
      <div class="stk-sec"><b>News &amp; how the price reacted</b>
        <div class="pf-seg stk-nt"><button data-p="1">Today</button><button data-p="7">This week</button><button data-p="30">This month</button></div>
        <div class="stk-nsum" data-nsum></div>
        <div class="stk-news" data-news><div class="muted">Loading…</div></div>
        <div class="muted" style="font-size:11.5px;margin-top:6px">Tone and themes are counted from the headlines by keyword (not AI). A big move on a news day doesn't prove the news caused it. Dots on the chart mark headlines.</div></div>
      <div class="stk-sec muted" data-about style="font-size:12.5px"></div>
      <div class="muted" style="font-size:11.5px;margin-top:8px">Data from Yahoo Finance, may be delayed · not financial advice</div>
    </div>`, { wide: true });
  const el = m.el; el.classList.add('stk-modal');
  const $ = (s) => el.querySelector(s);
  $('[data-x]').onclick = () => m.close();
  el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  let chart = null, cur = q.currency, gone = false, key = '1D', newsItems = [], daily = null;
  const origClose = m.close; m.close = () => { gone = true; if (chart) chart.destroy(); origClose(); };

  async function draw(k) {
    key = k; el.querySelectorAll('.stk-ranges button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    const load = $('.stk-load'); load.style.display = ''; load.textContent = 'Loading chart…';
    const cmpSym = $('[data-cmp]').value;
    const [r, bn] = await Promise.all([window.api.price.chart(sym, k), cmpSym ? window.api.price.chart(cmpSym, k) : null]);
    if (gone || key !== k) return;
    if (!r || r.c.length < 2) { load.textContent = k === '1D' ? 'No intraday data right now (market closed or not available) — try 5D.' : 'No data for this range.'; if (chart) { chart.destroy(); chart = null; } return; }
    load.style.display = 'none'; cur = r.currency || cur;
    const first = k === '1D' && r.prevClose ? r.prevClose : r.c[0], last = r.c[r.c.length - 1];
    const dl = last - first, pc = first ? dl / first * 100 : 0, up = dl >= 0, col = up ? '#27ae7a' : '#e5484d';
    $('[data-price]').textContent = fmtMoney(last, cur);
    $('[data-chg]').innerHTML = `<b class="${up ? 'pos' : 'neg'}">${up ? '+' : '−'}${fmtMoney(Math.abs(dl), cur)} (${fmtPct(pc)})</b>`;
    $('[data-when]').textContent = { '1D': 'today', '5D': 'past 5 days', '1M': 'past month', '6M': 'past 6 months', '1Y': 'past year', '5Y': 'past 5 years', MAX: 'all time' }[k];
    if (chart) chart.destroy();
    const muted = cssVar('--muted'), line = cssVar('--line'), intr = k === '1D' || k === '5D';
    const fmtT = (t, long) => { const d = new Date((t + (r.gmtoffset || 0)) * 1000); const o = { timeZone: 'UTC' }; return intr ? d.toLocaleString('en-US', Object.assign(o, long ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } : (k === '1D' ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' }))) : d.toLocaleDateString('en-US', Object.assign(o, k === '5Y' || k === 'MAX' ? { month: 'short', year: 'numeric' } : long ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' })); };
    if (cmpSym && bn && bn.c.length > 1) {                       // both lines as % change from the start of the range
      let j = 0; const bv = r.t.map((t) => { while (j + 1 < bn.t.length && bn.t[j + 1] <= t) j++; return bn.c[j]; });
      const sp = r.c.map(v => (v / r.c[0] - 1) * 100), bp = bv.map(v => (v / bv[0] - 1) * 100);
      const bname = $('[data-cmp]').selectedOptions[0].textContent;
      const sl = sp[sp.length - 1], bl = bp[bp.length - 1];
      $('[data-when]').innerHTML = `${$('[data-when]').textContent} · <b class="${sl - bl >= 0 ? 'pos' : 'neg'}">${sl - bl >= 0 ? 'beat' : 'trailed'} ${bname} by ${Math.abs(sl - bl).toFixed(1)} pts</b>`;
      chart = new window.Chart($('canvas'), {
        type: 'line', data: { labels: r.t, datasets: [{ label: sym, data: sp, borderColor: col, borderWidth: 2.2, pointRadius: 0, pointHitRadius: 8, tension: .15 }, { label: bname, data: bp, borderColor: muted, borderWidth: 2, borderDash: [5, 4], pointRadius: 0, pointHitRadius: 8, tension: .15 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'bottom', labels: { color: cssVar('--text'), usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { title: (c) => fmtT(r.t[c[0].dataIndex], true), label: (c) => ` ${c.dataset.label}: ${fmtPct(c.parsed.y)}` } } },
          scales: { x: { grid: { display: false }, ticks: { color: muted, maxTicksLimit: 6, maxRotation: 0, callback: function (v) { return fmtT(r.t[v]); } } }, y: { position: 'right', grid: { color: line }, ticks: { color: muted, callback: (v) => v.toFixed(0) + '%' } } } }
      });
      return;
    }
    const ds = [{ data: r.c, borderColor: col, backgroundColor: col + '1c', fill: true, borderWidth: 2.2, pointRadius: 0, pointHitRadius: 8, tension: .15 }];
    if (k === '1D' && r.prevClose) ds.push({ data: r.c.map(() => r.prevClose), borderColor: muted, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false });
    const mk = newsItems.filter(n => n.time / 1000 >= r.t[0] && n.time / 1000 <= r.t[r.t.length - 1] + 86400);
    if (mk.length) {                                              // dots where headlines were published
      const md = r.c.map(() => null), tips = {};
      mk.forEach((n) => { const ts = n.time / 1000; let j = 0; while (j + 1 < r.t.length && r.t[j + 1] <= ts) j++; md[j] = r.c[j]; (tips[j] = tips[j] || []).push(n.title); });
      ds.push({ type: 'line', data: md, showLine: false, pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: cssVar('--accent'), pointBorderColor: '#fff', pointBorderWidth: 1.5, spanGaps: false, _tips: tips });
    }
    chart = new window.Chart($('canvas'), {
      type: 'line', data: { labels: r.t, datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { filter: (c) => c.datasetIndex === 0 || !!c.dataset._tips, callbacks: { title: (c) => fmtT(r.t[c[0].dataIndex], true), label: (c) => { if (c.dataset._tips) return (c.dataset._tips[c.dataIndex] || []).slice(0, 3).map(x => '📰 ' + (x.length > 90 ? x.slice(0, 88) + '…' : x)); const v = c.parsed.y, d2 = v - first; return ` ${fmtMoney(v, cur)}  (${d2 >= 0 ? '+' : '−'}${fmtMoney(Math.abs(d2), cur)} · ${fmtPct(first ? d2 / first * 100 : 0)})`; } } } },
        scales: { x: { grid: { display: false }, ticks: { color: muted, maxTicksLimit: 6, maxRotation: 0, callback: function (v) { return fmtT(r.t[v]); } } }, y: { position: 'right', grid: { color: line }, ticks: { color: muted, callback: (v) => fmtMoney(v, cur) } } } }
    });
  }
  $('[data-cmp]').addEventListener('change', () => draw(key));
  el.querySelector('.stk-ranges').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) draw(b.dataset.k); });
  draw('1D').then(() => { if (!gone && $('.stk-load').textContent.startsWith('No intraday')) draw('5D'); });

  // your position
  if (hd && hd.shares) {
    const val = q.price != null ? hd.shares * q.price : null;
    const pl = q.price != null && hd.pricedShares > 0 ? hd.pricedShares * q.price - hd.costBasis : null;
    $('[data-pos]').innerHTML = `<b>Your position</b><div class="stk-pos"><div><span>Shares</span><b>${hd.shares}</b></div><div><span>Avg cost</span><b>${hd.cost != null ? fmtMoney(hd.cost, q.currency) : '–'}</b></div><div><span>Value</span><b>${val != null ? fmtMoney(val, q.currency) : '–'}</b></div><div><span>Gain / loss</span><b class="${pl >= 0 ? 'pos' : 'neg'}">${pl != null ? (pl >= 0 ? '+' : '−') + fmtMoney(Math.abs(pl), q.currency) + ' · ' + fmtPct(hd.costBasis ? pl / hd.costBasis * 100 : null) : '–'}</b></div></div>`;
  }

  // key data
  window.api.price.detail(sym).then((d) => {
    if (gone) return;
    const box = $('[data-stats]');
    if (!d) { box.innerHTML = '<div class="muted">Key ratios are not available for this ticker (common for some funds, crypto and non-US listings).</div>'; return; }
    const c = d.currency || cur;
    const range52 = d.low52 != null && d.high52 != null && q.price != null ? Math.min(100, Math.max(0, (q.price - d.low52) / (d.high52 - d.low52) * 100)) : null;
    const T = (label, val, tip) => `<div class="stk-t" ${tip ? `title="${escHtml(tip)}"` : ''}><span>${label}</span><b>${val}</b></div>`;
    box.innerHTML = [
      T('Market cap', compact(d.marketCap, c)), T('P/E (TTM)', num2(d.pe), 'Price ÷ earnings per share. Lower is "cheaper" relative to profits.'), T('Forward P/E', num2(d.forwardPE), 'Using analysts\' expected earnings'), T('EPS (TTM)', num2(d.eps)),
      T('P/B', num2(d.pb), 'Price ÷ book value'), T('ROE', pct(d.roe), 'Return on equity: profit made per unit of shareholder equity'), T('ROA', pct(d.roa)), T('Profit margin', pct(d.profitMargin)),
      T('Operating margin', pct(d.operatingMargin)), T('Revenue growth', pct(d.revenueGrowth), 'Year over year'), T('Earnings growth', pct(d.earningsGrowth)), T('Debt / equity', num2(d.debtToEquity)),
      T('Dividend yield', pct2(d.dividendYield)), T('Payout ratio', pct(d.payoutRatio)), T('Beta', num2(d.beta), 'Volatility vs the market (1 = moves with the market)'), T('Avg volume', compact(d.avgVolume)),
      T('Analyst target', d.targetPrice != null ? fmtMoney(d.targetPrice, c) : '–'), T('Analyst view', d.recommendation && d.recommendation !== 'none' ? escHtml(d.recommendation.replace('_', ' ')) : '–')
    ].join('') + (range52 != null ? `<div class="stk-52"><span>52-week range</span><div class="bar"><i style="left:${range52}%"></i></div><small><span>${fmtMoney(d.low52, c)}</span><span>${fmtMoney(d.high52, c)}</span></small></div>` : '');
    if (d.name && !q.name) $('.stk-name').textContent = d.name;
    $('[data-about]').innerHTML = [d.sector, d.industry, d.country].filter(Boolean).map(escHtml).join(' · ') + (d.summary ? '<br>' + escHtml(d.summary) + (d.summary.length >= 420 ? '…' : '') : '');
  });
  // news: Yahoo + Google News, grouped today / this week / this month, with the price move on each news day
  const POS = /\b(surge[sd]?|soar(s|ed)?|jump(s|ed)?|rall(y|ies|ied)|gain(s|ed)?|ris(e|es|ing)|beat(s)?|record|upgrad(e|es|ed)|profit(s|able)?|growth|bullish|outperform|strong|boost(s|ed)?|rebound(s)?|climb(s|ed)?|high|buy)\b|상승|급등|호재|신고가|최고|반등|흑자|매수|증가|돌파|강세/i;
  const NEG = /\b(fall(s|ing)?|drop(s|ped)?|plunge[sd]?|slump(s|ed)?|sink(s)?|tumble[sd]?|miss(es|ed)?|cut(s)?|downgrad(e|es|ed)|loss(es)?|lawsuit|probe|recall|bearish|sell(-?off)?|weak|warning|fear(s)?|crash(es|ed)?|declin(e|es|ed)|low|risk)\b|하락|급락|악재|적자|매도|감소|우려|반토막|폭락|약세|부진/i;
  const STOP = new Set('the and for with that this from stock stocks shares share inc corp price news why how what will your you are has have after over into more than new says said could just its but not can who all out now about when best top year week today market buy sell yahoo finance llc ltd plc inc group holdings jan feb mar apr may jun jul aug sep oct nov dec 주가 관련 오늘 이번'.split(' '));
  const dkey = (t) => Math.floor((t + ((daily && daily.gmtoffset) || 0)) / 86400);
  const dayMove = (ms) => { if (!daily) return null; const day = dkey(ms / 1000); const i = daily.t.findIndex(x => dkey(x) >= day); return i < 1 ? null : (daily.c[i] / daily.c[i - 1] - 1) * 100; };
  const tone = (n) => { const p = POS.test(n.title) ? 1 : 0, g = NEG.test(n.title) ? 1 : 0; return p - g; };
  function periodChange(days) {
    if (!daily || daily.c.length < 2) return null;
    const n = daily.c.length - 1; if (days <= 1) return { pct: (daily.c[n] / daily.c[n - 1] - 1) * 100, label: dkey(daily.t[n]) === dkey(Date.now() / 1000) ? 'today' : 'last session' };
    const cut = dkey(Date.now() / 1000) - days; let b = 0; daily.t.forEach((t, i) => { if (dkey(t) <= cut) b = i; });
    return { pct: (daily.c[n] / daily.c[b] - 1) * 100, label: days === 7 ? 'this week' : 'this month' };
  }
  let per = 0, newsLoaded = false;
  function paintNews(days) {
    per = days; el.querySelectorAll('.stk-nt button').forEach(b => b.classList.toggle('on', +b.dataset.p === days));
    const now = Date.now(), since = now - days * 864e5;                       // today = the last 24 hours
    const list = newsItems.filter(n => n.time >= since);
    const sum = $('[data-nsum]'), box = $('[data-news]');
    const pc = periodChange(days);
    if (!list.length) {
      sum.innerHTML = pc ? `<div class="chip"><span>Price ${pc.label}</span><b class="${pc.pct >= 0 ? 'pos' : 'neg'}">${fmtPct(pc.pct)}</b></div>` : '';
      const wider = [7, 30].find(d2 => d2 > days && newsItems.some(n => n.time >= now - d2 * 864e5));
      box.innerHTML = !newsItems.length ? `<div class="muted">No headlines could be loaded${newsLoaded ? ' for this ticker' : ''} — check your internet connection, or try again in a minute.</div>` : `<div class="muted">No headlines in the last ${days === 1 ? '24 hours' : days === 7 ? '7 days' : '30 days'}.${wider ? ` <a href="#" data-wider="${wider}">Show ${wider === 7 ? 'this week' : 'this month'} instead</a>` : ''}</div>`;
      return;
    }
    const ts = list.map(tone), up = ts.filter(x => x > 0).length, dn = ts.filter(x => x < 0).length;
    const tn = up === dn ? 'Mixed' : up > dn ? (up >= dn * 2 ? 'Mostly positive' : 'Leaning positive') : (dn >= up * 2 ? 'Mostly negative' : 'Leaning negative');
    const words = new Map(); const skip = new Set([...sym.toLowerCase().split(/[^a-z0-9]+/), ...String(q.name || '').toLowerCase().split(/[^a-z0-9가-힣]+/)]);
    list.forEach(n => new Set((n.title.toLowerCase().match(/[a-z]{3,}|[가-힣]{2,}/g) || []).filter(w => !STOP.has(w) && !skip.has(w))).forEach(w => words.set(w, (words.get(w) || 0) + 1)));
    const themes = [...words.entries()].filter(x => x[1] >= 2).sort((a, b2) => b2[1] - a[1]).slice(0, 6);
    const moves = list.map(n => ({ n, mv: dayMove(n.time) })).filter(x => x.mv != null);
    const big = moves.slice().sort((a, b2) => Math.abs(b2.mv) - Math.abs(a.mv))[0];
    sum.innerHTML = `${pc ? `<div class="chip"><span>Price ${pc.label}</span><b class="${pc.pct >= 0 ? 'pos' : 'neg'}">${fmtPct(pc.pct)}</b></div>` : ''}<div class="chip"><span>Headlines</span><b>${list.length}</b></div><div class="chip"><span>Tone</span><b class="${tn.includes('pos') ? 'pos' : tn.includes('neg') ? 'neg' : ''}">${tn}</b><small>${up} up · ${dn} down</small></div>
      ${themes.length ? `<div class="chip wide"><span>Recurring themes</span><div class="themes">${themes.map(t => `<i>${escHtml(t[0])} <small>×${t[1]}</small></i>`).join('')}</div></div>` : ''}
      ${big && Math.abs(big.mv) >= 0.5 ? `<div class="chip wide"><span>Biggest move on a news day</span><b class="${big.mv >= 0 ? 'pos' : 'neg'}">${fmtPct(big.mv)}</b><small>${escHtml(big.n.title.slice(0, 110))}</small></div>` : ''}`;
    box.innerHTML = list.slice(0, 40).map((n) => { const i = newsItems.indexOf(n); const mv = dayMove(n.time), t = tone(n); return `<a data-n="${i}" href="#"><b>${escHtml(n.title)}</b><small>${escHtml(n.publisher || '')} · ${ago(n.time)}${t ? ` · <span class="${t > 0 ? 'pos' : 'neg'}">${t > 0 ? '▲ positive' : '▼ negative'}</span>` : ''}${mv != null ? ` · <span class="${mv >= 0 ? 'pos' : 'neg'}" title="Price change on the trading day of this headline">${fmtPct(mv)} that day</span>` : (daily && n.time / 1000 > daily.t[daily.t.length - 1] ? ' · <span class="muted">reaction pending</span>' : '')}</small></a>`; }).join('') + (list.length > 40 ? `<div class="muted" style="padding:6px 10px">+ ${list.length - 40} more</div>` : '');
  }
  $('[data-news]').addEventListener('click', (e) => { const a = e.target.closest('[data-n]'); if (a) { e.preventDefault(); window.api.openExternal(newsItems[+a.dataset.n].link); } });
  $('[data-news]').addEventListener('click', (e) => { const w = e.target.closest('[data-wider]'); if (w) { e.preventDefault(); paintNews(+w.dataset.wider); } });
  el.querySelector('.stk-nt').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) paintNews(+b.dataset.p); });
  Promise.all([window.api.price.news(sym, q.name), window.api.price.chart(sym, '6M')]).then(([news, dl]) => {
    if (gone) return;
    newsItems = news || []; daily = dl; newsLoaded = true;
    const first = [1, 7, 30].find(d2 => newsItems.some(n => n.time >= Date.now() - d2 * 864e5)) || 7;
    paintNews(first);
    if (newsItems.length) draw(key);                                  // redraw with headline dots
  });
}
