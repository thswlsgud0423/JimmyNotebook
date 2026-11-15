// Tiny syntax highlighter (keywords / strings / numbers / comments) — good enough for study notes.
import { esc } from './md.js';

const KW = {
  js: 'const let var function return if else for while class new import export from default async await try catch throw switch case break continue typeof instanceof this null undefined true false of in',
  python: 'def class return if elif else for while import from as with try except finally raise lambda pass break continue None True False and or not in is yield async await',
  java: 'public private protected class interface static final void int long double float boolean char new return if else for while switch case break continue try catch throw throws extends implements import package null true false this super',
  c: 'int long double float char void struct enum typedef return if else for while switch case break continue sizeof static const unsigned signed include define NULL',
  go: 'func package import var const type struct interface map chan return if else for range switch case break continue go defer nil true false',
  rust: 'fn let mut pub struct enum impl trait use mod return if else for while loop match break continue self Self true false Some None Ok Err',
  sql: 'select from where group by order having join left right inner outer on insert into values update set delete create table drop alter and or not null as limit distinct count sum avg min max',
  bash: 'if then else fi for do done while case esac function echo cd ls export return in',
  css: '', html: '', json: 'true false null', markdown: '', latex: ''
};
KW.ts = KW.js + ' interface type enum implements public private readonly string number boolean any void';
KW.cpp = KW.c + ' class public private protected template typename namespace using new delete virtual override std auto nullptr true false bool';
KW.kotlin = 'fun val var class object interface return if else for while when is in as try catch throw import package null true false this super override open data sealed';
KW.swift = 'func let var class struct enum protocol extension return if else for while switch case guard import nil true false self super init public private static';
KW.php = 'function class public private protected static return if else elseif foreach for while switch case break continue try catch throw new use namespace null true false echo';
KW.r = 'function if else for while repeat break next return TRUE FALSE NULL NA library';
KW.matlab = 'function end if else elseif for while switch case break continue return true false';
KW.yaml = 'true false null'; KW.latex = 'begin end documentclass usepackage section subsection frac sum int';
KW.csharp = KW.java + ' namespace using var string bool override virtual async await';

export const LANGS = [['', 'Plain text'], ['js', 'JavaScript'], ['ts', 'TypeScript'], ['python', 'Python'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['go', 'Go'], ['rust', 'Rust'], ['kotlin', 'Kotlin'], ['swift', 'Swift'], ['php', 'PHP'], ['r', 'R'], ['matlab', 'MATLAB'], ['sql', 'SQL'], ['html', 'HTML'], ['css', 'CSS'], ['json', 'JSON'], ['yaml', 'YAML'], ['bash', 'Bash / Shell'], ['latex', 'LaTeX'], ['markdown', 'Markdown']];
export function highlight(code, lang) {
  if (!code) return '';
  const l = (lang || '').toLowerCase();
  const kws = new Set((KW[l] || '').split(' ').filter(Boolean));
  if (!lang || (!kws.size && !['css', 'html', 'json'].includes(l))) return esc(code);
  const hashComment = ['python', 'bash'].includes(l);
  const re = new RegExp([
    hashComment ? '(#[^\\n]*)' : '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|--[^\\n]*)',
    '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)',
    '(\\b\\d+(?:\\.\\d+)?\\b)',
    '(\\b[A-Za-z_][\\w]*\\b)'
  ].join('|'), 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index)); last = re.lastIndex;
    if (m[1] != null) out += '<span class="c">' + esc(m[1]) + '</span>';
    else if (m[2] != null) out += '<span class="s">' + esc(m[2]) + '</span>';
    else if (m[3] != null) out += '<span class="n">' + esc(m[3]) + '</span>';
    else out += (kws.has(m[4]) || kws.has(m[4].toLowerCase()) && l === 'sql') ? '<span class="k">' + esc(m[4]) + '</span>' : esc(m[4]);
  }
  return out + esc(code.slice(last));
}
