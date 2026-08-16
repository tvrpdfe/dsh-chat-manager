// Replay test for patch-fork4.mjs: build the pre-r6 state, run the script on
// it, and require byte-identical output with the delivered bundle.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const delivered = 'C:/Users/Administrator/.dsh/profiles/web/packages/dsh-chat-manager/lib/client.js';
const backup = fileURLToPath(new URL('../.scratch/client-r5.bak.js', import.meta.url));

let s = fs.readFileSync(delivered, 'utf8');

// Reverse the folded r6–r8 edits (4 hunks) to reconstruct the pre-r6 (r5) state.
const reverse = (from, to, label) => {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`reverse ${label}: expected 1, found ${n}`);
  s = s.replace(from, to);
};
// (a) blank chat row
reverse(
  'if (session === void 0 || session.cwd === void 0) continue;\n\t\t\t\t\tif (session.blank && session.id !== list.current) continue;',
  'if (session === void 0 || session.blank || session.cwd === void 0) continue;',
  'blank exclusion',
);
// (b) search blank skip
reverse(
  'if (node.blank) continue;\n\t\t\t\t\tconst title = displayTitle(node, t).toLowerCase();',
  'const title = displayTitle(node, t).toLowerCase();',
  'search blank skip',
);
// (c) archived delete desc zh + en (r7 neutralized wording: 文件夹, not 聊天文件夹)
reverse(
  '"archived.delete.desc": "将删除会话“{name}”的聊天记录。其文件夹会保留在磁盘上。此操作不可撤销。",',
  '"archived.delete.desc": "将删除会话“{name}”的聊天记录。此操作不可撤销。",',
  'desc zh',
);
reverse(
  '"archived.delete.desc": "This deletes the conversation record of “{name}”. Its folder is kept on disk. This cannot be undone.",',
  '"archived.delete.desc": "This deletes the conversation record of “{name}”. This cannot be undone.",',
  'desc en',
);
// (d) r8 time.* keys folded into the chatManager dictionaries
reverse(
  '"cancel": "取消",\n\t\t\t"time.now": "刚刚",\n\t\t\t"time.minutes": "{n}分钟",\n\t\t\t"time.hours": "{n}小时",\n\t\t\t"time.days": "{n}天",\n\t\t\t"time.months": "{n}个月",\n\t\t\t"time.years": "{n}年",\n\t\t\t"time.ago": "{t}前"\n\t\t};',
  '"cancel": "取消"\n\t\t};',
  'time keys zh',
);
reverse(
  '"cancel": "Cancel",\n\t\t\t"time.now": "now",\n\t\t\t"time.minutes": "{n}min",\n\t\t\t"time.hours": "{n}h",\n\t\t\t"time.days": "{n}d",\n\t\t\t"time.months": "{n}mo",\n\t\t\t"time.years": "{n}y",\n\t\t\t"time.ago": "{t} ago"\n\t\t};',
  '"cancel": "Cancel"\n\t\t};',
  'time keys en',
);

fs.writeFileSync(backup, s);
console.log('pre-r6 copy written:', backup);

const run = spawnSync(process.execPath, [fileURLToPath(new URL('./patch-fork4.mjs', import.meta.url)), backup], { encoding: 'utf8' });
console.log('script stdout:', run.stdout.trim());
console.log('script stderr:', run.stderr.trim());
if (run.status !== 0) throw new Error(`patch-fork4 exited ${run.status}`);

const replayed = fs.readFileSync(backup, 'utf8');
const target = fs.readFileSync(delivered, 'utf8');
if (replayed !== target) {
  // locate first divergence for diagnosis
  let i = 0;
  while (i < replayed.length && i < target.length && replayed[i] === target[i]) i += 1;
  console.error(`MISMATCH at byte ${i}`);
  console.error('replayed:', JSON.stringify(replayed.slice(Math.max(0, i - 80), i + 120)));
  console.error('target:  ', JSON.stringify(target.slice(Math.max(0, i - 80), i + 120)));
  process.exit(1);
}
console.log('PASS: replay output is byte-identical to the delivered bundle');
