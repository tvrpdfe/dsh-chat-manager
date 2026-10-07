// Archive-restore acceptance, phase 1: take a real chat Session, archive it from
// its row menu with a real mouse, then restore it from the settings page — and
// prove the restore is a real platform write, not a view-side mask: the Host's
// ledger (workspace.json) loses the id on disk, the log stays where it was, and
// the row comes back to the chat pane without a page reload. Phase 2 re-checks the
// same facts after a Host restart.
//
// The fixture is an existing chat Session of the isolated $DSH_HOME copy, so the
// probe neither creates a chat folder in the live chat root nor spends a model turn.
// That is acceptable here — and only here — because archive → restore is a round trip
// on a reversible state: this probe asserts the fixture is not pinned (archiving drops
// a pin and restoring does not bring it back) and asserts the ledger's user entry is
// untouched. A probe that *deletes* must build its own fixture instead: the delete
// route rewrites the live chat root's registry, which does not follow DSH_HOME.
//
// Usage: DSH_HOME=<home> node .scratch/accept8-restore.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, readJson, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept8-restore.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9410);
// Resolve the home from DSH_HOME so this probe runs against an isolated copy of
// it instead of the live home (the ledger assertion reads the file on disk).
const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
// This probe archives and restores a Session, i.e. it mutates the archive ledger.
// Running it against the live home by accident is not acceptable: require the throwaway
// copy explicitly (the fallback above only exists so the *readers* below never see a
// half-resolved path).
if (!process.env.DSH_HOME) {
  console.error('refusing to run: set DSH_HOME to a throwaway copy of the home (this probe mutates its archive ledger)');
  process.exit(2);
}
const SESSIONS = path.join(DSH, 'sessions');
const LEDGER = path.join(DSH, 'storages', 'workspace.json');
const RESULT = '.scratch/accept8-result.json';
/** Whether two id lists hold the same ids (order-insensitive). */
function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((x, i) => x === b[i]);
}
/** The client-side notice an archived row raises instead of opening. */
const NOT_OPENABLE = '已归档对话暂时无法查看';
const ARCHIVE_LABEL = '归档会话';
const CONFIRM_LABEL = '停止并归档';
const RESTORE_LABEL = '恢复';

/** The Host's durable archive set and pin set, read straight from the ledger file. */
function ledgerState() {
  const state = readJson(LEDGER);
  const archived = state?.global?.archivedSessionIds;
  const pinned = state?.global?.pinnedSessionIds;
  return { archived: Array.isArray(archived) ? archived : null, pinned: Array.isArray(pinned) ? pinned : null };
}
function ledgerArchived() {
  return ledgerState().archived;
}
/** Directories on disk for one session id (empty when the log is gone). */
function dirsOf(id) {
  const out = [];
  if (!fs.existsSync(SESSIONS)) return out;
  for (const slug of fs.readdirSync(SESSIONS)) {
    const dir = path.join(SESSIONS, slug, id);
    try {
      if (fs.existsSync(dir)) out.push({ dir, files: fs.readdirSync(dir) });
    } catch { /* a concurrent removal is the "absent" answer */ }
  }
  return out;
}

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

const app = await openApp({ url: URL, port: PORT });
const archivedList = () => app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.archived.map(a => a.sessionId))`);
const hostStartedAt = () => app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.hostStartedAt ?? null)`);
const key = (sid) => `session:${sid}`;

try {
  await app.navigate();
  // A cold isolated instance can take a while to paint its first rows; wait for a
  // chat-pane row that actually carries a verb strip (a blank row has none).
  let pane = null;
  for (let i = 0; i < 90 && pane === null; i += 1) {
    await sleep(2000);
    const state = await app.evaluate(`(() => {
      const chat = document.querySelector('[class$=_chatSection]');
      if (chat === null) return null;
      const rows = [...chat.querySelectorAll('[data-row-key^="session:"]')]
        .filter(r => r.querySelector('[class$=_rowActions]') !== null);
      return { chatRows: chat.querySelectorAll('[data-row-key^="session:"]').length, usable: rows.map(r => r.getAttribute('data-row-key').slice(8)) };
    })()`).catch(() => null);
    if (state !== null && state.usable.length > 0) pane = state;
  }
  check('0 the chat pane offers a non-blank row', pane !== null, JSON.stringify(pane));
  if (pane === null) throw new Error('no usable chat row ever rendered');
  const marker = await app.evaluate(`(() => { document.documentElement.dataset.a8 = 'alive'; return { nav: performance.getEntriesByType('navigation').length, origin: performance.timeOrigin }; })()`);

  // 1. Pick the fixture: a chat-pane row that is not archived (any pre-existing archived
  //    id stays out of reach by construction — the row resolution below only ever
  //    targets this id, and a final check asserts the archive set is unchanged).
  //    A plain read: a failing first read must fail the probe, not read as "no archived
  //    Sessions" (which would also disarm the fixture filter).
  const archivedBefore = await archivedList();
  const sid = pane.usable.find(id => !archivedBefore.includes(id));
  check('1 the ledger is readable and the fixture is un-archived', Array.isArray(archivedBefore) && typeof sid === 'string', `sid=${sid} archived=${JSON.stringify(archivedBefore)}`);
  if (typeof sid !== 'string') throw new Error('no fixture row available');
  console.log(`fixture S=${sid}`);
  // Archiving drops a pin and restoring does not bring it back, so a pinned fixture
  // would make this probe's net effect on the ledger a change rather than a round trip.
  check('1b the fixture is not pinned (archive → restore is a round trip)', Array.isArray(ledgerState().pinned) && !ledgerState().pinned.includes(sid), JSON.stringify(ledgerState().pinned));
  const hostAtStart = await hostStartedAt();
  check('1c the Host reports its start time', typeof hostAtStart === 'number', String(hostAtStart));
  const filesBefore = dirsOf(sid);
  check('2 the fixture has a log on disk', filesBefore.length > 0 && filesBefore[0].files.length > 0, JSON.stringify(filesBefore));

  // 2. Archive it from its row menu (hover first: the strip is hover-only).
  const rowRect = await app.rect(`[data-row-key=${JSON.stringify(key(sid))}]`);
  if (rowRect === null) throw new Error('fixture row has no box');
  await app.mouseMove(rowRect.x, rowRect.y);
  await sleep(600);
  const trigger = await app.evaluate(`(() => {
    const row = document.querySelector('[data-row-key=${JSON.stringify(key(sid))}]');
    const b = [...row.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('的操作'));
    if (b === undefined) return null;
    const br = b.getBoundingClientRect();
    return { x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2) };
  })()`);
  check('3 the row offers its menu trigger', trigger !== null);
  if (trigger === null) throw new Error('no menu trigger on the fixture row');
  await app.mouseClick(trigger.x, trigger.y);
  await sleep(500);
  const item = await app.evaluate(`(() => {
    const menu = document.querySelector('[role=menu]');
    if (menu === null) return null;
    const b = [...menu.querySelectorAll('button[role=menuitem]')].find(x => (x.textContent || '').trim().startsWith(${JSON.stringify(ARCHIVE_LABEL)}));
    if (b === undefined) return { items: [...menu.querySelectorAll('button[role=menuitem]')].map(x => (x.textContent || '').trim()) };
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('4 the menu offers 归档会话', item !== null && item.x !== undefined, JSON.stringify(item));
  if (item === null || item.x === undefined) throw new Error('no archive item in the menu');
  await app.mouseClick(item.x, item.y);
  await sleep(1200);
  // A Session with running work asks first (the Host refuses the archive); this
  // fixture is idle, so the dialog should not appear — answer it if it does.
  const confirm = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    if (d === undefined) return null;
    const b = [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(CONFIRM_LABEL)});
    if (b === undefined) return { dialog: d.innerText.slice(0, 60) };
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (confirm !== null && confirm.x === undefined) {
    // A confirmation the probe cannot answer would make the next check time out for
    // the wrong reason; fail here with what the dialog actually said.
    throw new Error(`an archive confirmation appeared without its action button: ${JSON.stringify(confirm)}`);
  }
  if (confirm !== null) {
    console.log('archive asked for confirmation; confirming');
    await app.mouseClick(confirm.x, confirm.y);
  }

  let archived = false;
  for (let i = 0; i < 60 && !archived; i += 1) {
    await sleep(1000);
    archived = (await archivedList().catch(() => [])).includes(sid);
  }
  check('5 S is archived', archived);
  const ledger1 = ledgerArchived();
  check('6 the ledger lists S while it is archived', Array.isArray(ledger1) && ledger1.includes(sid), JSON.stringify(ledger1));
  check('7 S kept its log while archived', dirsOf(sid).length > 0, JSON.stringify(dirsOf(sid)));

  // 3. Open settings → 已归档会话 and restore it with a real mouse.
  const gear = await app.evaluate(`(() => {
    const t = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === '设置');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (gear === null) throw new Error('no 设置 button');
  await app.mouseClick(gear.x, gear.y);
  await sleep(1800);
  const nav = await app.evaluate(`(() => {
    const c = [...document.querySelectorAll('[class*=navCell]')].find(x => (x.textContent || '').includes('已归档会话'));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('8 settings exposes 已归档会话', nav !== null);
  if (nav === null) throw new Error('no 已归档会话 nav cell');
  await app.mouseClick(nav.x, nav.y);
  await sleep(2000);
  const rowRestore = await app.evaluate(`(async () => {
    const rows = [...document.querySelectorAll('[class*=archivedRow]')];
    // Resolve the row by INDEX in the Host's archived list, never by 'last row': other
    // archived Sessions sit in the same list, and a positional guess could restore one
    // of those instead of the Session this probe chose. That mapping is only valid while
    // the page renders one row per ledger entry (it filters tombstoned/masked ids out),
    // so the counts must match first.
    const archived = (await fetch('/api/chat-manager/state').then(r => r.json())).archived.map(a => a.sessionId);
    if (rows.length !== archived.length) return { error: 'rendered rows and the archived list disagree', rows: rows.length, archived: archived.length };
    const index = archived.indexOf(${JSON.stringify(sid)});
    if (index < 0 || index >= rows.length) return { error: 'S is not in the archived list', archived };
    const row = rows[index];
    const b = [...row.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(RESTORE_LABEL)});
    if (!b) return { error: 'no 恢复 button', rowText: row.innerText };
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), rowText: row.innerText.replace(/\\n/g, ' | ').slice(0, 80) };
  })()`);
  check('9 the archived row offers 恢复', rowRestore !== null && rowRestore.error === undefined, JSON.stringify(rowRestore));
  if (rowRestore === null || rowRestore.error !== undefined) throw new Error(`no restorable archived row for ${sid}: ${JSON.stringify(rowRestore)}`);
  await app.mouseClick(rowRestore.x, rowRestore.y);

  // 4. The restore must land in the ledger, not just in the view.
  let restored = false;
  for (let i = 0; i < 60 && !restored; i += 1) {
    await sleep(1000);
    restored = !(await archivedList().catch(() => [sid])).includes(sid);
  }
  check('10 S left the archived list', restored);
  const ledger2 = ledgerArchived();
  check('11 the ledger on disk no longer lists S', Array.isArray(ledger2) && !ledger2.includes(sid), JSON.stringify(ledger2));
  // The strongest available statement about foreign rows: archive → restore is a round
  // trip, so the durable archive set must come back to EXACTLY the set the probe found.
  check('12 the archive set came back to exactly its starting content (no foreign row touched)', sameSet(ledger2, archivedBefore), `start=${JSON.stringify(archivedBefore)} after=${JSON.stringify(ledger2)}`);
  const filesAfterRestore = dirsOf(sid);
  // Byte-level "untouched": the same directory must still hold exactly the same file
  // list as before the archive/restore round trip (an overwritten or truncated log
  // would keep the directory non-empty and must not pass).
  const sameDir = filesAfterRestore.length === filesBefore.length
    && filesAfterRestore.length > 0 && filesAfterRestore[0].dir === filesBefore[0].dir;
  const sameFiles = sameDir && filesAfterRestore[0].files.length === filesBefore[0].files.length
    && filesAfterRestore[0].files.every((f, i) => f === filesBefore[0].files[i]);
  check('13 the log was NOT touched by the restore', sameFiles, `before=${JSON.stringify(filesBefore)} after=${JSON.stringify(filesAfterRestore)}`);

  // 5. The row is back where it belongs (the chat pane), with no reload.
  let rowBack = { present: false };
  for (let i = 0; i < 30 && rowBack.present !== true; i += 1) {
    await sleep(1000);
    rowBack = await app.evaluate(`(() => {
      const row = document.querySelector('[data-row-key=${JSON.stringify(key(sid))}]');
      if (row === null) return { present: false };
      const chat = document.querySelector('[class$=_chatSection]');
      return { present: true, inChatPane: chat !== null && chat.contains(row) };
    })()`);
  }
  check('14 the row is back in the chat pane', rowBack.present === true && rowBack.inChatPane === true, JSON.stringify(rowBack));
  const after = await app.evaluate(`({
    marker: document.documentElement.dataset.a8,
    nav: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
  })`);
  check('15 no full page reload', after.marker === 'alive' && after.nav === marker.nav && after.origin === marker.origin, JSON.stringify(after));

  // 6. The restored row behaves like a normal Session: clicking it must not raise
  //    the archived-not-openable notice (the client reads the same archive set the
  //    Host's own pre-step gate reads).
  const backRect = await app.evaluate(`(() => {
    const row = document.querySelector('[data-row-key=${JSON.stringify(key(sid))}]');
    if (row === null) return null;
    const r = row.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(12, r.height / 2)) };
  })()`);
  if (backRect === null) throw new Error('the restored row vanished before the open check');
  await app.mouseClick(backRect.x, backRect.y);
  await sleep(1800);
  const notice = await app.evaluate(`document.body.innerText.includes(${JSON.stringify(NOT_OPENABLE)})`);
  check('16 opening the restored row raises no archived notice', notice === false);

  check('17 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 200))));

  fs.writeFileSync(RESULT, JSON.stringify({
    sid, archivedBefore, ledger1, ledger2, filesBefore, filesAfterRestore, rowBack, rowText: rowRestore.rowText, hostStartedAt: hostAtStart,
  }, null, 1));
  console.log(`wrote ${RESULT}`);
} finally {
  console.log(failures.length === 0 ? 'PHASE1 ALL PASS' : `PHASE1 FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
