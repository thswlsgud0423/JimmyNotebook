// First-run content: a few example pages + templates so the app never looks empty.
import { mk, serializePage } from './md.js';
import { newChart } from './blocks/chart.js';
import { newDatabase } from './blocks/database.js';
import { newPortfolio } from './blocks/portfolio.js';
import { newTimer, newFlash } from './blocks/extras.js';
import { newDraw } from './blocks/draw.js';
import { todayKey } from './vault.js';
import { newInstance } from './widgets.js';

const p = (text) => mk('p', { text });
const h1 = (text) => mk('h1', { text }), h2 = (text) => mk('h2', { text }), h3 = (text) => mk('h3', { text });
const ul = (text, indent = 0) => mk('ul', { text, indent });
const ol = (text) => mk('ol', { text, indent: 0 });
const todo = (text, checked = false) => mk('todo', { text, checked, indent: 0 });
const callout = (kind, title, text) => mk('callout', { kind, title, text });
const rich = (type, data) => mk(type, { data });
const hr = () => mk('hr');

export function templates() {
  return {
    'Daily Note': { props: { icon: '🌞', tags: ['daily'] }, blocks: [h2('Top 3 today'), todo('Most important thing'), todo('Second thing'), todo('Third thing'), h2('Schedule'), ul(''), h2('Notes'), p(''), h2('Reflection'), callout('idea', 'What went well?', ''), p('Tomorrow I will…')] },
    'Study Note': { props: { icon: '📘', tags: ['study'] }, blocks: [callout('info', 'Topic', 'Course · Chapter · Date'), h2('Key ideas'), ul(''), h2('Questions'), ul(''), h2('Summary in my own words'), p(''), h2('Review'), rich('flash', newFlash())] },
    'Weekly Review': { props: { icon: '🗓️', tags: ['review'] }, blocks: [h2('Wins '), ul(''), h2('Challenges'), ul(''), h2('Next week'), todo(''), rich('chart', Object.assign(newChart('bar'), { title: 'Hours per day' }))] },
    'Meeting Notes': { props: { icon: '🤝', tags: ['meeting'] }, blocks: [callout('note', 'Attendees', ''), h2('Agenda'), ol(''), h2('Decisions'), ul(''), h2('Action items'), todo('')] },
    'Research Paper': { props: { icon: '🔬', tags: ['research'] }, blocks: [callout('info', 'Citation', 'Authors (Year). Title. Journal.'), h2('Research question'), p(''), h2('Method'), p(''), h2('Findings'), ul(''), h2('Critique'), p(''), h2('Related notes'), p('[[ ]]')] },
    'Paper Summary': { props: { icon: '📝', tags: ['paper', 'summary'] }, blocks: [callout('info', 'Source', 'Link the PDF here: type [[ and pick it'), h2('Why I read this'), p(''), h2('Key points'), ul(''), h2('Method'), p(''), h2('Findings'), ul(''), h2('Limitations'), p(''), h2('My thoughts'), p('')] },
    'Book Notes': { props: { icon: '📖', tags: ['book'] }, blocks: [callout('quote', 'Favorite quote', ''), h2('Summary'), p(''), h2('Takeaways'), ul(''), h2('Rating'), p('')] },
    'Project Plan': { props: { icon: '🚀', tags: ['project'] }, blocks: [callout('tip', 'Goal', 'What does success look like?'), rich('database', newDatabase('board')), h2('Notes'), p('')] }
  };
}

export function seedPages() {
  const widgetBlock = (kind) => { const i = newInstance(kind); delete i.save; return mk('widget', { data: i }); };
  const today = todayKey();
  const pages = [];
  const add = (path, props, blocks) => pages.push({ path, src: serializePage(props, blocks) });

  const pf = newPortfolio(); pf.title = 'My holdings';
  const sketch = newDraw(); sketch.title = 'Doodle me 🎨';

  add('Welcome to Jimmy Notes.md', { icon: '🏡', tags: ['start'], favorite: true, cover: 'auto', order: 0 }, [
    p('Your cozy notebook — **Notion** blocks + **Obsidian** links, saved as plain Markdown files on your computer '),
    callout('tip', 'Quick start', '**Ctrl+K** jump to any page · **Ctrl+N** new page · **Ctrl+P** all commands · **Ctrl+Shift+F** search everything · **Ctrl+\\** toggle sidebar'),
    h2('Try these'),
    todo('Type **/** on an empty line to insert charts, drawings, tables, timers…'),
    todo('Type **[[** to link another page, then check the Backlinks panel (right sidebar)'),
    todo('Switch themes in Settings: Default, Psyduck or 야돈'),
    todo('Drag the ⋮⋮ handle next to a block to reorder it'),
    h2('Where things live'),
    ul('[[Study Planner]] — timer, kanban, flashcards'),
    ul('[[Investment Portfolio]] — live prices, accounts in any currency, wealth over time, stock charts & news'),
    ul('[[Research Notes]] — tables, charts, links'),
    ul('[[Ideas & Sketches]] — drawing canvas'),
    ul('[[Writing Guide]] — widgets, columns, code, LaTeX, images'),
    ul('Study timer (sidebar) — stopwatch by subject, daily goal, stats, focus mode'),
    ul('Daily notes live in the **Daily** folder — press **Alt+D**'),
    hr(),
    p('Everything is stored in your vault folder (Settings → Open vault folder). You can open it in Obsidian too! #welcome')
  ]);

  add('Study Planner.md', { icon: '📚', tags: ['study', 'planning'], cover: 'auto', order: 1 }, [
    p('Plan the semester, stay focused, and review smarter.'),
    h2('Focus'), rich('timer', newTimer()),
    h2('Tasks'), rich('database', Object.assign(newDatabase('board'), { title: 'Semester board' })),
    h2('Study stats'), widgetBlock('study'),
    h2('Flashcards'), rich('flash', newFlash()),
    h2('This week'), todo(''),
    p('Related: [[Research Notes]] · [[Welcome to Jimmy Notes]]')
  ]);

  add('Investment Portfolio.md', { icon: '💰', tags: ['finance', 'investing'], favorite: true, cover: 'auto', order: 2 }, [
    callout('info', 'How this works', 'Press **Add holding** and enter the ticker, how many shares you bought and the **price you paid** (plus the date, if you know it). Gain / loss and **Wealth over time** are then calculated from your real purchases — nothing here is sample data. Keep several brokers or currencies with **+ Account**, record sales with **−**, and click a ticker to see its chart (1D → Max), key ratios and news. Korean stocks use **.KS / .KQ** (e.g. 005930.KS); crypto uses **BTC-USD**. Prices come from Yahoo Finance; this is a tracker, not financial advice.'),
    rich('portfolio', pf),
    h2('Investment thesis'), p('Why do I hold each position? What would make me sell it?'), ul(''),
    h2('Goals'), todo(''),
    p('See also [[Research Notes]] #investing')
  ]);

  add('Research Notes.md', { icon: '🔬', tags: ['research'], cover: 'auto', order: 3 }, [
    p('A place for reading notes, sources and ideas. Link notes together with [[double brackets]] and they show up as backlinks.'),
    h2('Reading list'),
    mk('table', { rows: [['Title', 'Author', 'Status'], ['', '', ''], ['', '', '']] }),
    h2('Code snippet'), mk('code', { lang: 'python', text: '# compound growth\ndef future_value(p, rate, years):\n    return p * (1 + rate) ** years\n\nprint(future_value(1000, 0.07, 10))' }),
    callout('question', 'Open question', 'What is the most efficient way to organize notes? Try **PARA** (Projects / Areas / Resources / Archive) with tags + links.'),
    p('Back to [[Study Planner]] or [[Investment Portfolio]].')
  ]);

  add('Ideas & Sketches.md', { icon: '💡', tags: ['ideas'], cover: 'auto', order: 4 }, [
    p('Brain-dump here. Use the drawing block for diagrams and mind maps.'),
    rich('draw', sketch),
    h2('Idea inbox'), ul('App idea'), ul('Gift for a friend'), ul('Trip plan '),
    toggleBlock()
  ]);

  const wi = (kind, cfg) => { const i = newInstance(kind); if (cfg) Object.assign(i.cfg, cfg); delete i.save; return mk('widget', { data: i }); };
  add('Writing Guide.md', { icon: '✍️', tags: ['guide'], cover: 'auto', order: 5 }, [
    p('Everything you can put on a page: widgets, columns, code, LaTeX, images, charts. Type **/** on an empty line.'),
    rich('toc', {}),
    h2('Widgets and columns'),
    mk('columns', { cols: [[wi('countdown'), wi('progress')], [wi('habits'), wi('clock')]] }),
    h2('Code'),
    mk('code', { lang: 'python', text: 'def compound(principal: float, rate: float, years: int) -> float:\n    """Future value with yearly compounding."""\n    return principal * (1 + rate) ** years\n\nfor y in (1, 5, 10):\n    print(y, round(compound(10_000, 0.07, y), 2))' }),
    mk('code', { lang: 'js', text: "const debounce = (fn, ms = 300) => {\n  let t;\n  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };\n};" }),
    h2('LaTeX'),
    p('Inline math like $e^{i\\pi} + 1 = 0$ sits in a sentence, and display equations get their own block with a symbol palette and live preview:'),
    mk('math', { text: '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}' }),
    mk('math', { text: '\\begin{aligned}\n\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\\n\\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}\n\\end{aligned}' }),
    h2('Images'),
    p('Paste a screenshot (Ctrl+V), drag a picture in, or use /image. Hover an image for size, alignment and zoom controls.'),
    callout('tip', 'Tip', 'Resize an image by dragging its bottom-right corner. Click it to view full size.')
  ]);
  add('Daily/' + today + '.md', { icon: '🌞', tags: ['daily'] }, [
    h2('Top 3 today'), todo('Explore Jimmy Notes'), todo('Write one note'), todo('Take a walk'),
    h2('Notes'), p('Today I started my new notebook. See [[Welcome to Jimmy Notes]].'),
    h2('Reflection'), p('')
  ]);

  const t = templates();
  Object.keys(t).forEach((n) => add('Templates/' + n + '.md', t[n].props, t[n].blocks));
  return pages;
}
function toggleBlock() {
  return mk('toggle', { text: 'Tips for organizing (click to expand)', open: false, children: [ul('**Folders** = broad areas (School, Money, Life)'), ul('**Tags** (#tag) = cross-cutting topics'), ul('**[[Links]]** = ideas that relate — backlinks show your thinking'), ul('**Daily notes** capture; weekly review sorts into permanent notes')] });
}
