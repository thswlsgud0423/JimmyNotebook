import { icon } from '../icons.js';
import { h, openMenu, COLORS } from '../ui.js';
import { richShell, segmented, themeColors, cssVar, num, onTheme } from './common.js';

export function newChart(kind = 'bar') {
  return { kind, title: '', labels: ['Item 1', 'Item 2', 'Item 3'], series: [{ name: 'Value', values: [0, 0, 0] }] };      // empty on purpose — you add your own numbers
}
const KINDS = [['bar', 'Bar'], ['hbar', 'H-Bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['doughnut', 'Donut'], ['radar', 'Radar']];

export function buildChartConfig(d, animate = true) {
  const pal = themeColors();
  const text = cssVar('--text'), muted = cssVar('--muted'), line = cssVar('--line');
  const round = d.kind === 'pie' || d.kind === 'doughnut';
  const type = { bar: 'bar', hbar: 'bar', line: 'line', area: 'line', pie: 'pie', doughnut: 'doughnut', radar: 'radar' }[d.kind] || 'bar';
  const series = round ? d.series.slice(0, 1) : d.series;
  const datasets = series.map((s, i) => {
    const col = s.color || pal[i % pal.length];
    if (round) return { label: s.name, data: s.values, backgroundColor: d.labels.map((_, j) => (d.colors && d.colors[j]) || pal[j % pal.length]), borderColor: cssVar('--card'), borderWidth: 3, hoverOffset: 8 };
    const ds = { label: s.name, data: s.values, borderColor: col, backgroundColor: d.kind === 'line' ? col : col + (d.kind === 'area' || d.kind === 'radar' ? '55' : 'e6'), borderWidth: d.kind === 'bar' || d.kind === 'hbar' ? 0 : 3, tension: .35, fill: d.kind === 'area' || d.kind === 'radar', pointRadius: 4, pointBackgroundColor: col, pointBorderColor: cssVar('--card'), pointBorderWidth: 2 };
    if (type === 'bar') ds.borderRadius = 8;
    return ds;
  });
  const scales = round || type === 'radar' ? (type === 'radar' ? { r: { grid: { color: line }, angleLines: { color: line }, pointLabels: { color: text, font: { family: 'Nunito', weight: '700' } }, ticks: { color: muted, backdropColor: 'transparent' } } } : {}) : {
    x: { grid: { display: false }, ticks: { color: muted, font: { family: 'Nunito', weight: '700' } }, stacked: !!d.stacked, border: { color: line } },
    y: { grid: { color: line }, ticks: { color: muted, font: { family: 'Nunito' } }, beginAtZero: true, stacked: !!d.stacked, border: { display: false } }
  };
  return {
    type, data: { labels: d.labels, datasets },
    options: {
      indexAxis: d.kind === 'hbar' ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: animate ? { duration: 700, easing: 'easeOutQuart' } : false,
      plugins: { legend: { display: round || series.length > 1, position: round ? 'right' : 'bottom', labels: { color: text, usePointStyle: true, pointStyle: 'circle', font: { family: 'Nunito', weight: '700' } } }, tooltip: { backgroundColor: cssVar('--text'), titleColor: cssVar('--bg'), bodyColor: cssVar('--bg'), cornerRadius: 10, padding: 10, titleFont: { family: 'Nunito', weight: '800' }, bodyFont: { family: 'Nunito' } } },
      scales, cutout: d.kind === 'doughnut' ? '58%' : undefined
    }
  };
}

export function renderChart(b, api) {
  const d = b.data;
  const { el, body, tools } = richShell(b, api, { ico: d.kind === 'pie' || d.kind === 'doughnut' ? 'pie' : 'chart', ph: 'Chart title' });
  let chart = null;
  const kindSel = segmented(KINDS, d.kind, (v) => { d.kind = v; api.changed(true); draw(); table(); });
  tools.appendChild(kindSel);
  const eyeBtn = h(`<button class="iconbtn ${d.hideData ? '' : 'on'}" title="Show/hide data table">${icon('table', 16)}</button>`);
  eyeBtn.onclick = () => { d.hideData = !d.hideData; eyeBtn.classList.toggle('on', !d.hideData); dataPane.hidden = d.hideData; api.changed(); setTimeout(() => chart && chart.resize(), 30); };
  tools.appendChild(eyeBtn);
  const split = h('<div class="chart-split"><div class="chart-canvas"><canvas></canvas><div class="chart-hint">Type your numbers in the table →</div></div><div class="chart-data"></div></div>');
  body.appendChild(split);
  const dataPane = split.querySelector('.chart-data'); dataPane.hidden = !!d.hideData;
  const canvas = split.querySelector('canvas');

  function draw(animate = false) {
    if (chart) chart.destroy();
    if (!window.Chart) { split.querySelector('.chart-canvas').textContent = 'Chart.js failed to load'; return; }
    chart = new window.Chart(canvas, buildChartConfig(d, animate));
    const hint = split.querySelector('.chart-hint'); if (hint) hint.hidden = d.series.some(s => s.values.some(v => v !== 0));
  }
  function table() {
    const round = d.kind === 'pie' || d.kind === 'doughnut';
    const series = round ? d.series.slice(0, 1) : d.series;
    const pal = themeColors();
    dataPane.innerHTML = '';
    const t = h('<table></table>');
    t.innerHTML = `<tr><th>Label</th>${series.map((s, i) => `<th><input data-sn="${i}" value="${(s.name || '').replace(/"/g, '&quot;')}" style="font-weight:800"></th>`).join('')}<th></th></tr>` +
      d.labels.map((l, r) => `<tr><td><input data-l="${r}" value="${String(l).replace(/"/g, '&quot;')}"></td>${series.map((s, i) => `<td><input data-v="${i},${r}" type="text" inputmode="decimal" value="${s.values[r] ?? 0}"></td>`).join('')}<td style="white-space:nowrap">${round ? `<button class="sw" data-c="${r}" style="background:${(d.colors && d.colors[r]) || pal[r % pal.length]}" title="Slice color"></button>` : ''}<button class="iconbtn del" data-dr="${r}" title="Remove row">${icon('x', 14)}</button></td></tr>`).join('');
    dataPane.appendChild(t);
    const bar = h(`<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn sm ghost" data-ar>+ Row</button>${round ? '' : '<button class="btn sm ghost" data-as>+ Series</button>'}${!round && d.series.length > 1 ? '<button class="btn sm ghost" data-ds>− Series</button>' : ''}${!round && (d.kind === 'bar' || d.kind === 'hbar') && d.series.length > 1 ? `<button class="btn sm ghost ${d.stacked ? 'primary' : ''}" data-st>Stack</button>` : ''}<button class="btn sm ghost" data-paste title="Paste rows from a spreadsheet">Paste data</button></div>`);
    dataPane.appendChild(bar);
    t.addEventListener('input', (e) => {
      const i = e.target;
      if (i.dataset.l != null) d.labels[+i.dataset.l] = i.value;
      else if (i.dataset.v != null) { const [s, r] = i.dataset.v.split(',').map(Number); d.series[s].values[r] = num(i.value); }
      else if (i.dataset.sn != null) d.series[+i.dataset.sn].name = i.value;
      api.changed(); draw();
    });
    t.addEventListener('keydown', (e) => e.stopPropagation());
    t.addEventListener('click', (e) => {
      const dr = e.target.closest('[data-dr]');
      if (dr && d.labels.length > 1) { const r = +dr.dataset.dr; d.labels.splice(r, 1); d.series.forEach(s => s.values.splice(r, 1)); if (d.colors) d.colors.splice(r, 1); api.changed(true); draw(); table(); }
      const c = e.target.closest('[data-c]');
      if (c) { const r = +c.dataset.c; const rect = c.getBoundingClientRect(); openMenu(rect.left, rect.bottom + 4, [], { cls: '' }).el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(6,26px);gap:6px;padding:8px">' + [...pal, ...COLORS].slice(0, 18).map(col => `<button class="sw" style="background:${col};width:24px;height:24px" data-col="${col}"></button>`).join('') + '</div>'; document.querySelector('.menu').addEventListener('click', (ev) => { const bt = ev.target.closest('[data-col]'); if (bt) { d.colors = d.colors || []; d.colors[r] = bt.dataset.col; document.querySelector('.menu').remove(); api.changed(true); draw(); table(); } }); }
    });
    bar.addEventListener('click', async (e) => {
      if (e.target.closest('[data-ar]')) { d.labels.push('New'); d.series.forEach(s => s.values.push(0)); }
      else if (e.target.closest('[data-as]')) d.series.push({ name: 'Series ' + (d.series.length + 1), values: d.labels.map(() => 0) });
      else if (e.target.closest('[data-ds]')) d.series.pop();
      else if (e.target.closest('[data-st]')) d.stacked = !d.stacked;
      else if (e.target.closest('[data-paste]')) {
        let txt = ''; try { txt = await navigator.clipboard.readText(); } catch (err) { /* denied */ }
        const rows = txt.split(/\r?\n/).map(r => r.split(/\t|,/)).filter(r => r.length >= 2 && r[0].trim());
        if (!rows.length) return;
        const nums = rows.every((r, i) => i === 0 || !isNaN(parseFloat(r[1])));
        const body2 = nums && isNaN(parseFloat(rows[0][1])) ? rows.slice(1) : rows;
        const head = nums && isNaN(parseFloat(rows[0][1])) ? rows[0] : null;
        const cols = Math.max(...body2.map(r => r.length)) - 1;
        d.labels = body2.map(r => r[0].trim());
        d.series = Array.from({ length: cols }, (_, c) => ({ name: head ? head[c + 1].trim() : 'Series ' + (c + 1), values: body2.map(r => num(r[c + 1])) }));
      } else return;
      api.changed(true); draw(true); table();
    });
  }
  table();
  requestAnimationFrame(() => draw(true));
  onTheme(el, () => draw());
  return el;
}
