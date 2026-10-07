// Live-guard acceptance, phase 2: after a Host restart the Session phase 1 pulled
// the log out from under is no longer live — the archived row is now a true ghost
// (the ledger lists it, persistence and the live store do not). Deleting it must
// SUCCEED through the accounting-only branch: a row the user cannot get rid of would
// be exactly the harm the 500-on-unprovable-delete rule must not create.
//
// Usage: DSH_HOME=<home> node .scratch/accept9-phase2.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, readJson, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept9-phase2.mjs <url>'); process.exit(2); }
const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const SESSIONS = path.join(DSH, 'sessions');
const LEDGER = path.join(DSH, 'storages', 'workspace.json');
const RESULT = '.scratch/accept9-result.json';
const DELETE_LABEL = '删除';

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
  if (!fs.existsSync(SESSIONS)) return out;
  for (const slug of fs.readdirSync(SESSIONS)) {
    const dir = path.join(SESSIONS, slug, id);
    try {
      if (fs.existsSync(dir)) out.push(dir);
    } catch { /* a concurrent removal is the "absent" answer */ }
  }
  return out;
}

const app = await openApp({ url: URL, port: Number(process.env.ACCEPT_CDP_PORT ?? 9416) });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};
const archivedList = () => app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.archived.map(a => a.sessionId))`);
let chatFolder = typeof result.chatFolder === 'string' ? result.chatFolder : null;
let dshRoot = null;
const startedAt = Date.now();

try {
  await app.navigate();
  const rendered = await app.waitForApp({ attempts: 90, intervalMs: 2000 });
  check('0 the app rendered rows before the checks', rendered === true);
  await sleep(3000);

  const archived = await archivedList();
  const hostNow = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.hostStartedAt ?? null)`);
  const ledger1 = ledgerArchived();
  const dirs = dirsOf(sid);
  // Baseline for the "the delete did not reload the page" check below.
  const before = await app.evaluate(`(() => { document.documentElement.dataset.a9 = 'alive'; return { nav: performance.getEntriesByType('navigation').length, origin: performance.timeOrigin }; })()`);
  // The ghost row only becomes deletable because the Session is no longer live, so the
  // restart itself is asserted rather than assumed.
  check('0b this is a different Host process than phase 1',
    typeof hostNow === 'number' && typeof result.hostStartedAt === 'number' && hostNow !== result.hostStartedAt,
    `phase1=${String(result.hostStartedAt)} phase2=${String(hostNow)}`);
  check('1 the ledger still lists the ghost row', Array.isArray(ledger1) && ledger1.includes(sid), JSON.stringify(ledger1));
  check('2 the archived list still holds it', Array.isArray(archived) && archived.includes(sid), JSON.stringify(archived));
  check('3 its log is still absent', dirs.length === 0, JSON.stringify(dirs));
  // Containment, not equality: a phase 2 may share its home with another probe that
  // archives its own fixture (phase 1 asserts equality while it owns the timeline).
  check('4 the ghost row is still archived and no pre-existing id was dropped',
    Array.isArray(ledger1) && ledger1.includes(sid) && result.archivedBefore.every(id => ledger1.includes(id)),
    `start=${JSON.stringify(result.archivedBefore)} now=${JSON.stringify(ledger1)}`);
  const rootState = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => ({ dshRoot: j.dshRoot ?? null, folder: ((j.folders || {})[${JSON.stringify(sid)}] || {}).folder ?? null })).catch(() => null)`);
  dshRoot = rootState?.dshRoot ?? null;
  if (typeof rootState?.folder === 'string') chatFolder = rootState.folder;

  // Delete the ghost row from the settings page: this must go through (accounting-only).
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
  check('5 settings exposes 已归档会话', nav !== null);
  if (nav === null) throw new Error('no 已归档会话 nav cell');
  await app.mouseClick(nav.x, nav.y);
  await sleep(2000);
  const rowDelete = await app.evaluate(`(async () => {
    const rows = [...document.querySelectorAll('[class*=archivedRow]')];
    const archived = (await fetch('/api/chat-manager/state').then(r => r.json())).archived.map(a => a.sessionId);
    // The index mapping is only valid while the page renders one row per ledger entry
    // (the page filters tombstoned/masked ids out) — and this probe's button is the
    // irreversible one, so the counts must match before anything is clicked.
    if (rows.length !== archived.length) return { error: 'rendered rows and the archived list disagree', rows: rows.length, archived: archived.length };
    const index = archived.indexOf(${JSON.stringify(sid)});
    if (index < 0 || index >= rows.length) return { error: 'S is not in the archived list', archived };
    const row = rows[index];
    const b = [...row.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(DELETE_LABEL)});
    if (!b) return { error: 'no 删除 button', rowText: row.innerText };
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), rowText: row.innerText.replace(/\\n/g, ' | ').slice(0, 80) };
  })()`);
  check('6 the ghost row offers 删除', rowDelete !== null && rowDelete.error === undefined, JSON.stringify(rowDelete));
  if (rowDelete === null || rowDelete.error !== undefined) throw new Error(`no deletable ghost row: ${JSON.stringify(rowDelete)}`);
  await app.mouseClick(rowDelete.x, rowDelete.y);
  await sleep(1200);
  const confirmBtn = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    if (d === undefined) return null;
    const b = [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(DELETE_LABEL)});
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('7 the confirm dialog offers 删除', confirmBtn !== null);
  if (confirmBtn === null) throw new Error('no confirm button');
  await app.mouseClick(confirmBtn.x, confirmBtn.y);
  let gone = false;
  for (let i = 0; i < 40 && !gone; i += 1) {
    await sleep(500);
    gone = !(await archivedList().catch(() => [sid])).includes(sid);
  }
  const after = await app.evaluate(`({
    marker: document.documentElement.dataset.a9,
    nav: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
    bodyText: document.body.innerText,
  })`);
  const ledger2 = ledgerArchived();
  const dialogClosed = !String(after.bodyText).includes('此操作不可撤销')
    && !String(after.bodyText).includes('live and names no stored log');
  check('8 the ghost row left the archived list', gone);
  check('9 the ledger no longer lists it', Array.isArray(ledger2) && !ledger2.includes(sid), JSON.stringify(ledger2));
  check('10 the delete answered 2xx (the confirmation dialog closed with no error)', dialogClosed, String(after.bodyText).replace(/\n+/g, ' | ').slice(0, 200));
  check('11 the log is still absent', dirsOf(sid).length === 0, JSON.stringify(dirsOf(sid)));
  // Same containment rule after the delete: the ghost row is gone, and nothing that was
  // archived before phase 1 went with it.
  check('12 the ghost row is gone and no pre-existing archived id was dropped',
    Array.isArray(ledger2) && !ledger2.includes(sid) && result.archivedBefore.every(id => ledger2.includes(id)),
    `start=${JSON.stringify(result.archivedBefore)} after=${JSON.stringify(ledger2)}`);
  check('13 no full page reload', after.marker === 'alive' && after.nav === before.nav && after.origin === before.origin, JSON.stringify({ marker: after.marker, nav: after.nav, beforeNav: before.nav }));
  check('14 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 200))));
} finally {
  // The probe's own chat folder (one real turn created it in the real chat root): the
  // delete cleared its registry entry, so an empty folder of this run may go.
  if (typeof chatFolder === 'string' && typeof dshRoot === 'string'
    && path.resolve(chatFolder).startsWith(path.resolve(dshRoot) + path.sep)
    && fs.existsSync(chatFolder)
    && fs.readdirSync(chatFolder).length === 0
    && fs.statSync(chatFolder).mtimeMs >= startedAt) {
    try {
      fs.rmdirSync(chatFolder);
      console.log(`cleanup: removed the probe's empty chat folder ${chatFolder}`);
    } catch (err) {
      console.log(`cleanup: could not remove ${chatFolder}: ${err.message}`);
    }
  } else if (typeof chatFolder === 'string') {
    console.log(`cleanup: kept ${chatFolder} (absent, not empty, or older than this run)`);
  }
  console.log(failures.length === 0 ? 'PHASE2 ALL PASS' : `PHASE2 FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
