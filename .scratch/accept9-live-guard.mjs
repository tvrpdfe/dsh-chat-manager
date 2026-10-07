// Live-guard acceptance, phase 1: the delete route must REFUSE a Session the Host
// still holds live when it can name no durable artifact.
//
// A live write handle that never materialized — or whose artifact vanished — will
// materialize its header on the next flush, so answering 200 there would reproduce
// the historical "deleted row comes back after a restart" defect, with a client
// tombstone hiding it meanwhile. This probe builds that state on purpose: the chat
// pane's current blank Session (probe-owned: the delete route rewrites the LIVE chat
// root's registry, which does not follow DSH_HOME, so a copied real chat must not be
// the fixture) gets one real turn, is archived through its row menu, and then has its
// log directory removed out of band while it is still the live current Session. The
// delete must fail loudly: dialog open with the Host's message, row still archived,
// ledger untouched, no tombstone. Phase 2 (after a Host restart, when the Session is
// no longer live) deletes the same row for real through the accounting-only branch.
//
// Usage: DSH_HOME=<home> node .scratch/accept9-live-guard.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, readJson, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept9-live-guard.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9412);
const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
// This probe archives and deletes a Session: require the throwaway copy explicitly.
if (!process.env.DSH_HOME) {
  console.error('refusing to run: set DSH_HOME to a throwaway copy of the home (this probe mutates its archive ledger)');
  process.exit(2);
}
const SESSIONS = path.join(DSH, 'sessions');
const LEDGER = path.join(DSH, 'storages', 'workspace.json');
const RESULT = '.scratch/accept9-result.json';
/** Whether two id lists hold the same ids (order-insensitive). */
function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((x, i) => x === b[i]);
}
const ARCHIVE_LABEL = '归档会话';
const CONFIRM_LABEL = '停止并归档';
const DELETE_LABEL = '删除';
const MESSAGE = 'hi';

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

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

const app = await openApp({ url: URL, port: PORT });
const archivedList = () => app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.archived.map(a => a.sessionId))`);
const hostStartedAt = () => app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.hostStartedAt ?? null)`);
let chatFolder = null;
let dshRoot = null;
const startedAt = Date.now();

try {
  await app.navigate();
  let pane = null;
  for (let i = 0; i < 90 && pane === null; i += 1) {
    await sleep(2000);
    const state = await app.evaluate(`(() => {
      const chat = document.querySelector('[class$=_chatSection]');
      if (chat === null) return null;
      const blank = [...chat.querySelectorAll('[data-row-key^="session:"]')]
        .find(r => r.querySelector('[class$=_rowActions]') === null);
      return { blankId: blank === undefined ? null : blank.getAttribute('data-row-key').slice(8) };
    })()`).catch(() => null);
    if (state !== null && state.blankId !== null) pane = state;
  }
  check('0 the chat pane offers its current blank row', pane !== null, JSON.stringify(pane));
  if (pane === null) throw new Error('no blank chat row ever rendered');
  const sid = pane.blankId;
  console.log(`fixture S=${sid}`);
  const archivedBefore = await archivedList();
  const hostAtStart = await hostStartedAt();
  check('1b the Host reports its start time', typeof hostAtStart === 'number', String(hostAtStart));
  const marker = await app.evaluate(`(() => { document.documentElement.dataset.a9 = 'alive'; return { nav: performance.getEntriesByType('navigation').length, origin: performance.timeOrigin }; })()`);

  // 1. One real turn: the row's verb strip (and its row menu) only exists non-blank.
  const composer = await app.evaluate(`(() => {
    const el = document.querySelector('[role=textbox][contenteditable=true]') || document.querySelector('textarea');
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (composer === null) throw new Error('no composer');
  await app.mouseClick(composer.x, composer.y);
  await sleep(300);
  await app.call('Input.insertText', { text: MESSAGE });
  await sleep(200);
  await app.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await app.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  let nonBlank = false;
  for (let i = 0; i < 300 && !nonBlank; i += 1) {
    await sleep(1000);
    nonBlank = (await app.evaluate(`document.querySelector('[data-row-key="session:${sid}"] [class$=_rowActions]') !== null`).catch(() => false)) === true;
  }
  check('2 the fixture became non-blank (one real turn)', nonBlank);
  if (!nonBlank) throw new Error('the turn was never accepted');
  const chatRootState = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => ({ dshRoot: j.dshRoot ?? null, folder: ((j.folders || {})[${JSON.stringify(sid)}] || {}).folder ?? null })).catch(() => null)`);
  dshRoot = chatRootState?.dshRoot ?? null;
  chatFolder = chatRootState?.folder ?? null;
  console.log(`chatRoot=${dshRoot} chatFolder=${chatFolder}`);

  // 2. Archive it through its row menu (real mouse, hover first).
  const rowRect = await app.rect(`[data-row-key="session:${sid}"]`);
  if (rowRect === null) throw new Error('fixture row has no box');
  await app.mouseMove(rowRect.x, rowRect.y);
  await sleep(600);
  const trigger = await app.evaluate(`(() => {
    const row = document.querySelector('[data-row-key="session:${sid}"]');
    const b = [...row.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('的操作'));
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (trigger === null) throw new Error('no menu trigger on the fixture row');
  await app.mouseClick(trigger.x, trigger.y);
  await sleep(500);
  const item = await app.evaluate(`(() => {
    const menu = document.querySelector('[role=menu]');
    if (menu === null) return null;
    const b = [...menu.querySelectorAll('button[role=menuitem]')].find(x => (x.textContent || '').trim().startsWith(${JSON.stringify(ARCHIVE_LABEL)}));
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('3 the row menu offers 归档会话', item !== null);
  if (item === null) throw new Error('no archive item in the row menu');
  await app.mouseClick(item.x, item.y);
  await sleep(1000);
  const archiveConfirm = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    if (d === undefined) return null;
    const b = [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(CONFIRM_LABEL)});
    if (b === undefined) return { dialog: d.innerText.replace(/\\n/g, ' | ').slice(0, 120) };
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (archiveConfirm !== null && archiveConfirm.x === undefined) {
    throw new Error(`an archive confirmation appeared without its action button: ${JSON.stringify(archiveConfirm)}`);
  }
  if (archiveConfirm !== null) await app.mouseClick(archiveConfirm.x, archiveConfirm.y);
  let archived = false;
  for (let i = 0; i < 60 && !archived; i += 1) {
    await sleep(1000);
    archived = (await archivedList().catch(() => [])).includes(sid);
  }
  check('4 S is archived', archived);
  const dirsBefore = dirsOf(sid);
  check('5 S has a log before the out-of-band removal', dirsBefore.length > 0, JSON.stringify(dirsBefore));
  const ledger1 = ledgerArchived();
  check('6 the ledger lists S while it is archived', Array.isArray(ledger1) && ledger1.includes(sid), JSON.stringify(ledger1));

  // 3. Pull the artifact out from under the LIVE Session: this is the state the guard
  //    exists for, and the Session is still the current one (the Host holds it).
  for (const dir of dirsBefore) fs.rmSync(dir, { recursive: true, force: true });
  check('7 the log is gone out of band', dirsOf(sid).length === 0, JSON.stringify(dirsOf(sid)));

  // 4. Try to delete the row from the settings page: it must be REFUSED.
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
  check('9 the archived row offers 删除', rowDelete !== null && rowDelete.error === undefined, JSON.stringify(rowDelete));
  if (rowDelete === null || rowDelete.error !== undefined) throw new Error(`no deletable row for ${sid}: ${JSON.stringify(rowDelete)}`);
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
  check('10 the confirm dialog offers 删除', confirmBtn !== null);
  if (confirmBtn === null) throw new Error('no confirm button');
  await app.mouseClick(confirmBtn.x, confirmBtn.y);
  await sleep(4000);
  const after = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    return {
      marker: document.documentElement.dataset.a9,
      nav: performance.getEntriesByType('navigation').length,
      origin: performance.timeOrigin,
      dialogOpen: d !== undefined,
      dialogText: d === undefined ? null : d.innerText.replace(/\\n/g, ' | ').slice(0, 300),
      stillInDom: document.querySelector('[data-row-key="session:${sid}"]') !== null,
      tombstones: (() => { try { return JSON.parse(localStorage.getItem('dsh-chat-manager.deletedSessionIds') ?? '[]'); } catch { return null; } })(),
    };
  })()`);
  const archivedAfter = await archivedList().catch(() => null);
  const ledger2 = ledgerArchived();
  const refuses = String(after.dialogText ?? '').includes('still holds it live')
    && String(after.dialogText ?? '').includes('restart the Host and retry');
  check('11 the delete was REFUSED with the Host\'s message in the dialog', refuses, String(after.dialogText));
  check('12 the row is still in the archived list', Array.isArray(archivedAfter) && archivedAfter.includes(sid), JSON.stringify(archivedAfter));
  check('13 the ledger still lists S (nothing was un-archived)', Array.isArray(ledger2) && ledger2.includes(sid), JSON.stringify(ledger2));
  check('14 no tombstone was written (no fake success)', Array.isArray(after.tombstones) && !after.tombstones.includes(sid), JSON.stringify(after.tombstones));
  // The refusal must leave the archive set at exactly "what it was, plus the fixture the
  // probe archived" — nothing foreign added or dropped.
  check('15 the archive set is the starting set plus the fixture (no foreign row touched)', sameSet(ledger2, [...archivedBefore, sid]), `start=${JSON.stringify(archivedBefore)} after=${JSON.stringify(ledger2)}`);
  check('16 no full page reload', after.marker === 'alive' && after.nav === marker.nav && after.origin === marker.origin, JSON.stringify({ marker: after.marker, nav: after.nav }));
  check('17 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 200))));

  fs.writeFileSync(RESULT, JSON.stringify({ sid, archivedBefore, ledger1, ledger2, after, rowText: rowDelete.rowText, chatFolder, hostStartedAt: hostAtStart }, null, 1));
  console.log(`wrote ${RESULT}`);
} finally {
  // The probe's own chat folder is left for phase 2 (which deletes the row and so
  // clears the registry entry); remove it here only if this phase is the last one.
  if (process.env.ACCEPT9_KEEP_FOLDER !== '1'
    && typeof chatFolder === 'string' && typeof dshRoot === 'string'
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
  }
  console.log(failures.length === 0 ? 'PHASE1 ALL PASS' : `PHASE1 FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
