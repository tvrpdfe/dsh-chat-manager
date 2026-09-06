import fs from 'node:fs';
const oldb = fs.readFileSync('C:/Users/CHEN/AppData/Local/Temp/dsh-old-pkg/package/lib/client.js', 'utf8');
const fork = fs.readFileSync('F:/workdir/dsh-chat-manager/packages/dsh-chat-manager/lib/client.js', 'utf8');
const L1 = oldb.split(/\r?\n/), L2 = fork.split(/\r?\n/);
console.log('old', L1.length, 'fork', L2.length);
const ms = ['stores.js', 'index.js', 'WorkspaceBrowser.js', 'rows/Rows.js', 'locales.js', 'WorkspacePicker.js', 'dsh-chat-manager additions', 'window.__ModuleLoader__', '@deepseek-ai', 'sourceMappingURL'];
for (const m of ms) {
  const a = L1.findIndex(l => l.includes(m)), b = L2.findIndex(l => l.includes(m));
  console.log(m, 'old', a, 'fork', b);
}
let fd = -1;
for (let i = 0; i < Math.min(L1.length, L2.length); i++) { if (L1[i] !== L2[i]) { fd = i; break; } }
console.log('first divergence', fd);
if (fd > 0) {
  console.log('OLD:', L1[fd].slice(0, 160));
  console.log('FORK:', L2[fd].slice(0, 160));
}
