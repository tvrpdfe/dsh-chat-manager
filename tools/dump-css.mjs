// 用法：node tools/dump-css.mjs [client.js 路径] [输出目录]
//
// Dump the CSS Modules sheets and class maps the built browser bundle actually
// carries, so a suspicious class name can be inspected as the page sees it
// (the fork has shipped a half-renamed selector once, and a hash that starts
// with a digit takes the whole sheet with it).
//
// Defaults: the repository's own `lib/client.js`, into `.scratch/bundle-css/`.
// Both are resolved against this script's location, so the tool runs from any
// cwd. The bundle keeps one `var cssTextN = "…"` / `var classMapN = {...}` pair
// per sheet — finding none is an error, not an empty result.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? path.join(ROOT, 'lib', 'client.js');
const outDir = process.argv[3] ?? path.join(ROOT, '.scratch', 'bundle-css');
const source = fs.readFileSync(src, 'utf8');

/** Read the double-quoted JS string literal that starts at `from` (the opening quote). */
function readString(from) {
  let i = from + 1;
  let raw = '';
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') { raw += ch + (source[i + 1] ?? ''); i += 2; continue; }
    if (ch === '"') return raw;
    raw += ch;
    i += 1;
  }
  throw new Error(`unterminated string literal at offset ${from}`);
}

/** Read the brace-balanced object literal that starts at `from` (the opening brace). */
function readObject(from) {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  throw new Error(`unbalanced object literal at offset ${from}`);
}

/**
 * Undo the escapes of a JS string literal body, so the dumped file is what the
 * page sees.
 *
 * `\uXXXX` matters here: a dumped sheet once carried the literal `u2014` where
 * the bundle had `\u2014` (an em dash in a CSS comment), i.e. the tool was
 * un-escaping only `\n\t\r`. JSON's decoder handles every escape esbuild uses
 * for text; `\xNN`/`\v` (which JSON does not know) fall back to a manual pass.
 */
function decodeEscapes(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };
    return raw.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, (_, esc) => {
      if (esc[0] === 'x' || esc[0] === 'u') return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
      return Object.hasOwn(simple, esc) ? simple[esc] : esc;
    });
  }
}

const sheets = [];
// The suffix is optional: esbuild numbers the variables only when a chunk holds
// more than one sheet, so the first one is plain `cssText` / `classMap`.
for (const match of source.matchAll(/var cssText(\d*) = "/g)) {
  const index = match.index + match[0].length - 1;
  sheets.push({ label: match[1], css: decodeEscapes(readString(index)) });
}
const maps = new Map();
for (const match of source.matchAll(/var classMap(\d*) = /g)) {
  maps.set(match[1], readObject(match.index + match[0].length));
}

if (sheets.length === 0) {
  console.error(`${src}: no "var cssText" sheet found — is this the built client bundle?`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
let classTotal = 0;
for (const sheet of sheets) {
  const classMap = maps.get(sheet.label);
  if (classMap === undefined) throw new Error(`sheet "${sheet.label}" has no classMap next to it`);
  const map = JSON.parse(classMap);
  const names = Object.values(map);
  classTotal += names.length;
  const open = (sheet.css.match(/\{/g) ?? []).length;
  const close = (sheet.css.match(/\}/g) ?? []).length;
  const cssFile = path.join(outDir, `sheet${sheet.label === '' ? '' : `-${sheet.label}`}.css`);
  const mapFile = path.join(outDir, `classmap${sheet.label === '' ? '' : `-${sheet.label}`}.json`);
  fs.writeFileSync(cssFile, sheet.css);
  fs.writeFileSync(mapFile, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`sheet ${sheet.label === '' ? '(unnumbered)' : sheet.label}: ${sheet.css.length} bytes, ${names.length} classes, braces ${open}/${close}${open === close ? '' : '  <-- UNBALANCED'}`);
  console.log(`  ${path.relative(ROOT, cssFile)}  ${path.relative(ROOT, mapFile)}`);
}
console.log(`${sheets.length} sheet(s), ${classTotal} classes total, written to ${path.relative(ROOT, outDir)}`);
