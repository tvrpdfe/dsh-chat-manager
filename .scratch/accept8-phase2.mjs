// Archive-restore acceptance, phase 2: after a Host restart the restored Session
// must still be a normal (un-archived) row — the ledger change was durable, not a
// memory-side mask — and its log must still be on disk.
// Usage: node .scratch/accept8-phase2.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, readJson, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept8-phase2.mjs <url>'); process.exit(2); }
const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const SESSIONS = path.join(DSH, 'sessions');
const LEDGER = path.join(DSH, 'storages', 'workspace.json');
const RESULT = '.scratch/accept8-result.json';

const result = readJson(RESULT);
if (result === null || typeof result.sid !== 'string') throw new Error(`no phase-1 result at ${RESULT}`);
const sid = result.sid;

/** Whether two id lists hold the same ids (order-insensitive). */
function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((x, i) => x === b[i]);
}

function ledgerArchived() {
  const state = readJson(LEDGER);
  const ids = state?.global?.archivedSessionIds;
  return Array.isArray(ids) ? ids : null;
}
function dirsOf(id) {
  const out = [];
  for (const slug of fs.existsSync(SESSIONS) ? fs.readdirSync(SESSIONS) : []) {
    const dir = path.join(SESSIONS, slug, id);
    if (fs.existsSync(dir)) out.push({ dir, files: fs.readdirSync(dir) });
  }
  return out;
}

const app = await openApp({ url: URL, port: Number(process.env.ACCEPT_CDP_PORT ?? 9415) });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};
try {
  await app.navigate();
  // Liveness first: without it every "is absent" check below would pass on a page
  // that never rendered.
  const rendered = await app.waitForApp({ attempts: 90, intervalMs: 2000 });
  check('0 the app rendered rows before the checks', rendered === true);
  await sleep(3000);
  const rowState = await app.evaluate(`(() => {
    const row = document.querySelector('[data-row-key="session:${sid}"]');
    if (row === null) return { present: false };
    const chat = document.querySelector('[class$=_chatSection]');
    return { present: true, inChatPane: chat !== null && chat.contains(row) };
  })()`);
  const ledger = ledgerArchived();
  const archived = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.archived.map(a => a.sessionId))`);
  const hostNow = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.hostStartedAt ?? null)`);
  const dirs = dirsOf(sid);
  // The claim is "survives a Host restart", so the restart itself is asserted: this
  // Host must be a different process than the one phase 1 recorded.
  check('0b this is a different Host process than phase 1',
    typeof hostNow === 'number' && typeof result.hostStartedAt === 'number' && hostNow !== result.hostStartedAt,
    `phase1=${String(result.hostStartedAt)} phase2=${String(hostNow)}`);
  check('1 the ledger still has S un-archived', Array.isArray(ledger) && !ledger.includes(sid), JSON.stringify(ledger));
  check('2 the archived list still does not contain S', Array.isArray(archived) && !archived.includes(sid), JSON.stringify(archived));
  check('3 the row is still there, in the chat pane', rowState.present === true && rowState.inChatPane === true, JSON.stringify(rowState));
  check('4 the log is still on disk', dirs.length > 0 && dirs[0].files.length > 0, JSON.stringify(dirs));
  // Phase 1 asserts the round trip's set EQUALITY while it controls the whole timeline;
  // a phase 2 may share its home with another probe that archives its own fixture, so the
  // honest invariant here is "nothing that was archived before phase 1 got dropped, and
  // our fixture is still not archived".
  check('5 every pre-existing archived id is still archived, and S is not',
    Array.isArray(ledger) && !ledger.includes(sid) && result.archivedBefore.every(id => ledger.includes(id)),
    `start=${JSON.stringify(result.archivedBefore)} now=${JSON.stringify(ledger)}`);
  check('6 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 160))));
} finally {
  console.log(failures.length === 0 ? 'PHASE2 ALL PASS' : `PHASE2 FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
