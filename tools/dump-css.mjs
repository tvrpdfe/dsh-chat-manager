// 用法：node tools/dump-css.mjs [client.js 路径]
// 默认读取仓库根的 lib/client.js（按脚本自身位置解析，故在任意 cwd 下均可运行）；
// 传入第一个命令行参数可覆盖该路径。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = process.argv[2] ?? fileURLToPath(new URL('../lib/client.js', import.meta.url));
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
