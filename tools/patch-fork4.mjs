// Round-6 patch: review fixes from the /code-review pass (2026-08).
//
// History of the fork bundle and its scripts:
//   r1  patch-fork.mjs   — session-menu delete item, chat section, filters, locale keys
//   r2  patch-fork2.mjs  — chat search control, split panes, statuses, archived page
//   r3  patch-fork3.mjs  — drop `.pane{overflow:hidden}` (workspace scrollbar)
//   r4  (hand edit)      — no-reload delete + tombstone store (DELETED_IDS_KEY /
//                          markSessionDeleted / pruneDeletedIds / deletedIdsSource,
//                          useSyncExternalStore in WorkspaceBrowser, confirmSessionDelete
//                          no longer reloads, ArchivedSessionsPage writes tombstones).
//                          This round had no script: it was edited straight into the
//                          delivered bundle. Its state is asserted in Part 1 below so
//                          the audit trail stays complete.
//   r5  (hand edit)      — host delete route rework (log -> detach -> un-archive last)
//                          + projection-cache cleanup. Lives in lib/index.js.
//   r6  THIS SCRIPT     — the /code-review fixes:
//                          (a) ChatSection shows the current blank chat session
//                              (spec: 非空白（或当前空白）), matching shipped
//                              `sessionVisible` semantics;
//                          (b) chat search skips blank rows (shipped search
//                              query-excludes blank sessions);
//                          (c) archived-page delete confirmation mentions the
//                              folder is kept on disk (zh + en).
//   r7  (folded in)     — the folder-kept wording was neutralized to plain
//                          "文件夹" (the confirm dialog serves workspace
//                          sessions too, which have no chat folder). The r1–r3
//                          patch scripts were deleted after the git migration;
//                          their content lives in the repository history.
//   r8  (folded in)     — the settings page's t is bound to the chatManager
//                          namespace, whose dictionary lacked the time.* keys
//                          timeLabel() needs; the locale ladder ends at the
//                          raw key, so the archived list rendered literal
//                          "time.days"/"time.minutes". Copy the workspace
//                          time.* keys into both chatManager dictionaries.
//
// Usage: node patch-fork4.mjs <path-to-client.js>
// Replays the folded r6–r8 edits onto the r5-era bundle. Part 1 is read-only
// verification. Re-running against an already-patched bundle fails fast at
// the first replaceOnce (anchor count 0), which is the intended replay
// semantics.
import fs from 'node:fs';

const target = process.argv[2] ?? 'C:/Users/Administrator/.dsh/profiles/web/packages/dsh-chat-manager/lib/client.js';
const s0 = fs.readFileSync(target, 'utf8');
let s = s0;

// ---- Part 1: verify the r4 tombstone machinery is present (read-only) ----
const mustInclude = (needle, label) => {
  if (!s.includes(needle)) throw new Error(`missing anchor (${label}): ${needle.slice(0, 60)}…`);
};
mustInclude('const DELETED_IDS_KEY = "dsh-chat-manager.deletedSessionIds"', 'tombstone key');
mustInclude('const markSessionDeleted = (sessionId) =>', 'markSessionDeleted');
mustInclude('const pruneDeletedIds = (presentIds) =>', 'pruneDeletedIds');
mustInclude('const deletedIdsSource = {', 'deletedIdsSource');
mustInclude('react.useSyncExternalStore(deletedIdsSource.subscribe, deletedIdsSource.getSnapshot)', 'useSyncExternalStore');
mustInclude('markSessionDeleted(sessionDeleteTarget.sessionId)', 'workspace/chat delete writes tombstone');
mustInclude('markSessionDeleted(sessionId);', 'archived delete writes tombstone');
if (s.includes('window.location.reload')) throw new Error('unexpected: location.reload still present');

// ---- Part 2: apply the r6 edits (each anchor must occur exactly once) ----
const replaceOnce = (from, to, label) => {
  const count = s.split(from).length - 1;
  if (count !== 1) throw new Error(`expected exactly 1 occurrence of ${label}, found ${count}`);
  s = s.replace(from, to);
};

// (a) blank chat row: exclude blank sessions except the current one
replaceOnce(
  'if (session === void 0 || session.blank || session.cwd === void 0) continue;',
  'if (session === void 0 || session.cwd === void 0) continue;\n\t\t\t\t\tif (session.blank && session.id !== list.current) continue;',
  'chat blank exclusion',
);

// (b) chat search: blank rows never match a query
replaceOnce(
  'const title = displayTitle(node, t).toLowerCase();',
  'if (node.blank) continue;\n\t\t\t\t\tconst title = displayTitle(node, t).toLowerCase();',
  'chat search blank skip',
);

// (c) archived-page delete confirmation: folder-kept note (zh + en).
//     r7 neutralized the wording to plain 文件夹 (workspace sessions have no
//     chat folder), so the note is produced in its neutral form here.
replaceOnce(
  '"archived.delete.desc": "将删除会话“{name}”的聊天记录。此操作不可撤销。",',
  '"archived.delete.desc": "将删除会话“{name}”的聊天记录。其文件夹会保留在磁盘上。此操作不可撤销。",',
  'archived delete desc zh',
);
replaceOnce(
  '"archived.delete.desc": "This deletes the conversation record of “{name}”. This cannot be undone.",',
  '"archived.delete.desc": "This deletes the conversation record of “{name}”. Its folder is kept on disk. This cannot be undone.",',
  'archived delete desc en',
);

// (d) r8: chatManager time.* keys (see header comment)
replaceOnce(
  '"cancel": "取消"\n\t\t};',
  '"cancel": "取消",\n\t\t\t"time.now": "刚刚",\n\t\t\t"time.minutes": "{n}分钟",\n\t\t\t"time.hours": "{n}小时",\n\t\t\t"time.days": "{n}天",\n\t\t\t"time.months": "{n}个月",\n\t\t\t"time.years": "{n}年",\n\t\t\t"time.ago": "{t}前"\n\t\t};',
  'chatManagerZh time keys',
);
replaceOnce(
  '"cancel": "Cancel"\n\t\t};',
  '"cancel": "Cancel",\n\t\t\t"time.now": "now",\n\t\t\t"time.minutes": "{n}min",\n\t\t\t"time.hours": "{n}h",\n\t\t\t"time.days": "{n}d",\n\t\t\t"time.months": "{n}mo",\n\t\t\t"time.years": "{n}y",\n\t\t\t"time.ago": "{t} ago"\n\t\t};',
  'chatManagerEn time keys',
);

fs.writeFileSync(target, s);
console.log('patched:', target);
