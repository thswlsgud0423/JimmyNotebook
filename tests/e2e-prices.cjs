module.exports = async ({ js, check, sleep }) => {
  const q = await js(`window.api.price.quotes(['ALV.DE','AAPL','BTC-USD','005930.KS'])`);
  for (const [s, x] of Object.entries(q)) {
    const day = x.ok && x.prevClose ? ((x.price - x.prevClose) / x.prevClose * 100) : null;
    const month = x.ok && x.spark.length ? ((x.price - x.spark[0]) / x.spark[0] * 100) : null;
    console.log(s.padEnd(10), 'price', x.price, 'prevClose', x.prevClose, '→ day', day == null ? '–' : day.toFixed(2) + '%', '| ~1mo', month == null ? '–' : month.toFixed(2) + '%');
  }
  const a = q['ALV.DE'];
  check('ALV.DE day change is not the 1-month change', a.ok && Math.abs((a.price - a.prevClose) / a.prevClose * 100) < 5, 'prevClose=' + a.prevClose);
  check('day change differs from 1-month change for all symbols', Object.values(q).filter(x => x.ok).every(x => Math.abs(x.prevClose - x.spark[0]) > 1e-9 || x.spark.length < 3));
};
