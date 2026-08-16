import fs from 'node:fs';

const src = 'C:/Users/Administrator/.dsh/profiles/web/packages/dsh-chat-manager/lib/client.js';
const s = fs.readFileSync(src, 'utf8');

// Extract a JS double-quoted string starting at marker, honoring backslash escapes.
function extract(marker) {
  const i = s.indexOf(marker);
  if (i < 0) throw new Error('marker not found: ' + marker);
  let j = i + marker.length;
  let out = '';
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\') {
      out += s[j] + (s[j + 1] ?? '');
      j += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    j++;
  }
  return out;
}

const css = extract('const css = "');
const chatCss = extract('const chatCss = "');
fs.writeFileSync('F:/workdir/dsh-chat-manager/.scratch/bundle-css.txt', css);
fs.writeFileSync('F:/workdir/dsh-chat-manager/.scratch/bundle-chatcss.txt', chatCss);
console.log('css bytes:', css.length, 'chatCss bytes:', chatCss.length);
console.log('css tail:', JSON.stringify(css.slice(-120)));
console.log('brace balance css:', (css.match(/{/g) || []).length, 'vs', (css.match(/}/g) || []).length);
