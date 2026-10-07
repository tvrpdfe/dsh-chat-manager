// Row-menu durable-delete acceptance, phase 1. The previous round could only
// reach the destructive confirm through the settings page, because a blank
// Session hides its whole verb strip upstream (`{!row.blank && <span
// className={css.rowActions}>}`) — so its row menu cannot be opened at all.
// This probe therefore gives the chat pane's current blank Session one real turn
// (which is what makes its verb strip exist), opens the row menu with a real
// mouse, clicks 删除会话, clicks the destructive confirm, and proves the persisted
// log directory is gone — not just the row. It also pins the Session first, so the
// delete has to drop the id from the registry-global pin set as well.
//
// The home is resolved from DSH_HOME so the probe can run against a throwaway
// copy of the home instead of the live one.
// Usage: DSH_HOME=<home> node .scratch/accept7-row-menu-delete.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept7-row-menu-delete.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9407);
const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const SESSIONS = path.join(DSH, 'sessions');
const REGISTRY = path.join(DSH, 'storages', 'workspace.json');
const RESULT = '.scratch/accept7-result.json';
const MESSAGE = 'hi';

/** Directories on disk holding this session id. */
function dirsOf(id) {
  const out = [];
  for (const slug of fs.existsSync(SESSIONS) ? fs.readdirSync(SESSIONS) : []) {
    const dir = path.join(SESSIONS, slug, id);
    if (fs.existsSync(dir)) out.push(dir);
  }
  return out;
}
/** Byte size + newest mtime of this session's log directory, or null. */
function logState(id) {
  const dirs = dirsOf(id);
  if (dirs.length === 0) return null;
  let size = 0;
  let mtime = 0;
  for (const entry of fs.readdirSync(dirs[0])) {
    const st = fs.statSync(path.join(dirs[0], entry));
    size += st.size;
    mtime = Math.max(mtime, st.mtimeMs);
  }
  return { size, mtime };
}
/** Does the on-disk registry still reference this session? */
function registryHas(id) {
  try { return fs.readFileSync(REGISTRY, 'utf8').includes(id); } catch { return null; }
}
/** The registry-global pin set as persisted on disk (empty array when unreadable). */
function ledgerPinned() {
  try {
    const state = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    const ids = state?.global?.pinnedSessionIds;
    return Array.isArray(ids) ? ids : [];
  } catch { return []; }
}

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

const app = await openApp({ url: URL, port: PORT });
const key = (sid) => `session:${sid}`;
/** The probe's own chat folder (and the chat root holding it), for the cleanup:
 *  the chat root follows the system Documents folder, not DSH_HOME. */
let chatFolder = null;
let dshRoot = null;
const startedAt = Date.now();

try {
  await app.navigate();
  if (!(await app.waitForApp({ attempts: 90, intervalMs: 2000 }))) throw new Error('app never rendered rows');
  await sleep(2500);
  console.log(`DSH_HOME=${DSH}`);
  const marker = await app.evaluate(`(() => { document.documentElement.dataset.a7 = 'alive'; return { nav: performance.getEntriesByType('navigation').length, origin: performance.timeOrigin }; })()`);

  // 1. The fixture is the chat pane's current blank Session. DSH reuses an existing
  //    blank Session for the same date folder, so clicking 新建聊天 on top of one
  //    creates nothing new — the blank row itself is the chat this probe gives its
  //    one real turn to.
  const blankChatRow = () => app.evaluate(`(() => {
    const chat = document.querySelector('[class$=_chatSection]');
    if (chat === null) return null;
    const r = [...chat.querySelectorAll('[data-row-key^="session:"]')]
      .find(x => x.querySelector('[class$=_rowActions]') === null);
    return r === undefined ? null : { id: r.getAttribute('data-row-key').slice(8), selected: r.className.includes('selected') };
  })()`).catch(() => null);
  let sid = null;
  for (let i = 0; i < 30 && sid === null; i += 1) {
    await sleep(1000);
    const found = await blankChatRow();
    if (found !== null && found.selected === true) sid = found.id;
  }
  if (sid === null) {
    const add = await app.rect('[aria-label="新建聊天"]');
    if (add === null) throw new Error('no 新建聊天 button');
    await app.mouseClick(add.x, add.y);
    for (let i = 0; i < 60 && sid === null; i += 1) {
      await sleep(1000);
      const found = await blankChatRow();
      if (found !== null) sid = found.id;
    }
  }
  if (sid === null) throw new Error('no blank chat session to work with');
  console.log(`blank chat S=${sid}`);

  // The row must start blank: that is exactly why this path needed its own probe.
  const blankAtCreate = (await app.evaluate(`document.querySelector('[data-row-key=${JSON.stringify(key(sid))}] [class$=_rowActions]') === null`)) === true;
  console.log(`S row is blank at create: ${blankAtCreate}`);

  // 2. Give it one real turn, so its verb strip (and therefore its menu) exists.
  const composer = await app.evaluate(`(() => {
    const el = document.querySelector('[role=textbox][contenteditable=true]') || document.querySelector('textarea');
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: el.getAttribute('aria-label'), tag: el.tagName };
  })()`);
  check('1 the composer is reachable', composer !== null, JSON.stringify(composer));
  if (composer === null) throw new Error('no composer');
  await app.mouseClick(composer.x, composer.y);
  await sleep(300);
  await app.call('Input.insertText', { text: MESSAGE });
  await sleep(200);
  const typed = await app.evaluate(`(() => { const el = document.querySelector('[role=textbox][contenteditable=true]') || document.querySelector('textarea'); return el === null ? null : (el.value ?? el.innerText); })()`);
  check('2 the message reached the composer', (typed ?? '').includes(MESSAGE), JSON.stringify(typed));
  await app.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await app.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });

  // A turn was accepted once the row stops being blank (its verb strip appears).
  let nonBlank = false;
  for (let i = 0; i < 300 && !nonBlank; i += 1) {
    await sleep(1000);
    nonBlank = (await app.evaluate(`document.querySelector('[data-row-key=${JSON.stringify(key(sid))}] [class$=_rowActions]') !== null`).catch(() => false)) === true;
  }
  check('3 S became non-blank (verb strip exists)', nonBlank, `log=${JSON.stringify(logState(sid))}`);
  if (!nonBlank) throw new Error('S never became non-blank — the turn was not accepted');

  // 3. Let the turn finish: the transcript must stop generating AND the log must
  //    stop growing, otherwise the delete races a Host write that would
  //    recreate the very directory under test. `settled` is asserted, not
  //    assumed — the loop timing out must fail the check, not pass it.
  let settled = false;
  let stable = null;
  for (let i = 0; i < 120 && !settled; i += 1) {
    await sleep(2000);
    const running = (await app.evaluate(`document.querySelector('[aria-label="停止生成"]') !== null`).catch(() => true)) === true;
    const now = logState(sid);
    if (!running && now !== null && now.size > 0 && stable !== null && now.size === stable.size && now.mtime === stable.mtime) settled = true;
    else stable = now;
  }
  const logAfterTurn = logState(sid);
  check('4 the turn finished and the log settled', settled, `settled=${settled} log=${JSON.stringify(logAfterTurn)}`);
  const rowTitle = await app.evaluate(`(() => { const r = document.querySelector('[data-row-key=${JSON.stringify(key(sid))}]'); return r === null ? null : r.innerText.split('\\n')[0]; })()`);
  console.log(`S title="${rowTitle}" log=${JSON.stringify(logAfterTurn)}`);
  const registryBefore = registryHas(sid);
  const chatRootState = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => ({ dshRoot: j.dshRoot ?? null, folder: ((j.folders || {})[${JSON.stringify(sid)}] || {}).folder ?? null })).catch(() => null)`);
  dshRoot = chatRootState?.dshRoot ?? null;
  chatFolder = chatRootState?.folder ?? null;
  console.log(`registryHas=${registryBefore} chatRoot=${dshRoot} chatFolder=${chatFolder}`);

  // 4. Hover the row: the strip is hover-only.
  const rowRect = await app.rect(`[data-row-key=${JSON.stringify(key(sid))}]`);
  check('5 S has a row on screen', rowRect !== null, JSON.stringify(rowRect));
  if (rowRect === null) throw new Error('S row has no box');
  await app.mouseMove(rowRect.x, rowRect.y);
  await sleep(500);
  check('6 hover reveals S\'s verb strip', (await app.evaluate(`(() => {
    const s = document.querySelector('[data-row-key=${JSON.stringify(key(sid))}] [class$=_rowActions]');
    return s !== null && getComputedStyle(s).display !== 'none';
  })()`)) === true);

  // 4b. Pin it through the strip's hover action first: the delete route must drop
  //     the id from the registry-global pin set too, otherwise the ledger keeps a
  //     dangling pin forever. Pinning also re-orders the list, so the row is
  //     re-measured and re-hovered before the menu is opened for the delete.
  const pinBtn = await app.evaluate(`(() => {
    const row = document.querySelector('[data-row-key=${JSON.stringify(key(sid))}]');
    const b = [...row.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === '置顶会话');
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('6b the hovered strip offers 置顶会话', pinBtn !== null, JSON.stringify(pinBtn));
  if (pinBtn === null) throw new Error('no pin action on the hovered row');
  await app.mouseClick(pinBtn.x, pinBtn.y);
  let pinned = false;
  for (let i = 0; i < 30 && !pinned; i += 1) {
    await sleep(500);
    pinned = ledgerPinned().includes(sid);
  }
  check('6c the Host pin set now lists S', pinned, JSON.stringify(ledgerPinned()));
  const pinnedRect = await app.rect(`[data-row-key=${JSON.stringify(key(sid))}]`);
  check('6d the row survived the re-order', pinnedRect !== null, JSON.stringify(pinnedRect));
  if (pinnedRect === null) throw new Error('the pinned row has no box');
  await app.mouseMove(pinnedRect.x, pinnedRect.y);
  await sleep(600);

  const trigger = await app.evaluate(`(() => {
    const r = document.querySelector('[data-row-key=${JSON.stringify(key(sid))}]');
    const b = [...r.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('的操作'));
    if (b === undefined) return null;
    const br = b.getBoundingClientRect();
    return { x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2), left: Math.round(br.left), bottom: Math.round(br.bottom) };
  })()`);
  check('7 S offers the row menu trigger', trigger !== null);
  if (trigger === null) throw new Error('no trigger on S');
  await app.mouseClick(trigger.x, trigger.y);
  await sleep(400);

  // 5. The menu must carry the five actions, delete last.
  const opened = await app.evaluate(`(() => {
    const l = document.querySelector('[role=menu]');
    if (l === null) return null;
    const r = l.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), items: [...l.querySelectorAll('button[role=menuitem]')].map(b => (b.textContent || '').trim()) };
  })()`);
  check('8 the row menu opened with five actions', opened !== null && opened.items.length === 5, JSON.stringify(opened?.items));
  check('9 the menu is anchored under its trigger', opened !== null && Math.abs(opened.top - (trigger.bottom + 4)) <= 3 && Math.abs(opened.left - trigger.left) <= 3, opened === null ? 'no menu' : `list=(${opened.left},${opened.top}) trigger=(${trigger.left},${trigger.bottom})`);
  if (opened === null) throw new Error('row menu did not open');

  const item = await app.evaluate(`(() => {
    const l = document.querySelector('[role=menu]');
    const b = [...l.querySelectorAll('button[role=menuitem]')].find(x => (x.textContent || '').trim() === '删除会话');
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('10 删除会话 sits in the row menu', item !== null);
  if (item === null) throw new Error('no delete item in the row menu');
  await app.mouseClick(item.x, item.y);
  await sleep(800);

  // 6. The confirm dialog must name this very Session.
  const dialog = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    if (d === undefined) return { count: all.length, title: null, description: null };
    return { count: all.length, title: (d.querySelector('h2') || {}).textContent ?? null, description: (d.querySelector('p') || {}).textContent ?? null };
  })()`);
  check('11 the row menu raises the delete confirmation', dialog.title === '删除会话' && dialog.count >= 1, JSON.stringify(dialog));
  const nameInDialog = rowTitle !== null && rowTitle.length >= 3 && (dialog.description ?? '').includes(rowTitle.slice(0, 3));
  check('12 the dialog names the hovered session', nameInDialog, `title="${rowTitle}" desc="${dialog.description}"`);
  await app.screenshot('.scratch/accept7-menu-dialog.png');

  // 7. Confirm for real: this is the destructive path the round-2 probes could
  //    not execute.
  const confirm = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    if (d === undefined) return null;
    const b = [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '删除会话');
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: (b.textContent || '').trim() };
  })()`);
  check('13 the dialog offers the destructive 删除会话', confirm !== null, JSON.stringify(confirm));
  if (confirm === null) throw new Error('no confirm button');
  await app.mouseClick(confirm.x, confirm.y);
  await sleep(3000);

  const after = await app.evaluate(`({
    dialogs: document.querySelectorAll('[role=dialog][aria-modal=true]').length,
    rows: document.querySelectorAll('[data-row-key]').length,
    stillInDom: document.querySelector('[data-row-key=${JSON.stringify(key(sid))}]') !== null,
    marker: document.documentElement.dataset.a7,
    nav: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
  })`);
  const dirsAfter = dirsOf(sid);
  const archAfter = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.archived.map(a => a.sessionId))`).catch(() => null);
  const folderAfter = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => Boolean((j.folders || {})[${JSON.stringify(sid)}]))`).catch(() => null);

  check('14 the row left the DOM', after.stillInDom === false, JSON.stringify(after));
  check('15 the dialog closed', after.dialogs === 0, JSON.stringify(after));
  check('16 the persisted log is GONE', dirsAfter.length === 0 && logState(sid) === null, `after=${JSON.stringify(dirsAfter)}`);
  check('17 no full page reload', after.nav === marker.nav && after.origin === marker.origin && after.marker === 'alive');
  check('18 the archive list never held it', Array.isArray(archAfter) && !archAfter.includes(sid), JSON.stringify(archAfter));
  check('19 the chat-folder registry entry is gone', folderAfter === false, String(folderAfter));
  check('20 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 200))));

  // The workspace ledger is written through the sanctioned path, so the id has
  // to disappear from it as well (retried: the store may persist asynchronously).
  // The Session is attached to a dated workspace, so the ledger must have carried
  // it BEFORE the delete: that half is asserted too, because a "before === false"
  // escape hatch would let this check pass without any detach happening.
  let registryAfter = registryHas(sid);
  for (let i = 0; i < 10 && registryAfter === true; i += 1) { await sleep(500); registryAfter = registryHas(sid); }
  check('21a the ledger listed S before the delete', registryBefore === true, String(registryBefore));
  check('21b the Host registry no longer lists it', registryAfter === false, `before=${registryBefore} after=${registryAfter}`);
  // The pin-clearing half of the same change: the pin set is registry-global, so a
  // deleted pin would linger in the ledger forever (harmless but dangling).
  let pinGone = !ledgerPinned().includes(sid);
  for (let i = 0; i < 10 && !pinGone; i += 1) { await sleep(500); pinGone = !ledgerPinned().includes(sid); }
  check('21c the Host pin set no longer lists it', pinGone, JSON.stringify(ledgerPinned()));

  // The acceptance clause the delete must NOT take with it: 删除会话 removes the
  // persisted Session log, not the chat folder the Session writes its files to.
  const folderKept = typeof chatFolder === 'string' && chatFolder !== '' && fs.existsSync(chatFolder) && fs.statSync(chatFolder).isDirectory();
  check('22 the chat folder is still on disk', folderKept, String(chatFolder));

  // The spec's other half of item 3: a MANUAL page refresh must not bring the row
  // back. That is the client tombstone's job (localStorage, pruned only once the
  // Host baseline stops listing the id), and it is a different code path from the
  // no-reload check above and from phase 2's fresh profile.
  const errorsBeforeReload = app.consoleErrors().length;
  await app.navigate();
  await sleep(2500);
  const afterReload = await app.evaluate(`({
    stillInDom: document.querySelector('[data-row-key=${JSON.stringify(key(sid))}]') !== null,
    rows: document.querySelectorAll('[data-row-key]').length,
    tombstones: (() => { try { return JSON.parse(localStorage.getItem('dsh-chat-manager.deletedSessionIds') ?? '[]'); } catch { return null; } })(),
  })`);
  check('23 the row stays hidden after a manual refresh', afterReload.stillInDom === false && afterReload.rows > 0, JSON.stringify(afterReload));
  check('24 the refresh added no console error', app.consoleErrors().length === errorsBeforeReload, JSON.stringify(app.consoleErrors().slice(errorsBeforeReload).map(e => e.text.slice(0, 200))));
  // Logged, not asserted: once the Host stops reporting the id the tombstone is
  // pruned and the row is hidden for that reason instead — same observable.
  console.log(`tombstones after refresh: ${JSON.stringify(afterReload.tombstones)}`);

  fs.writeFileSync(RESULT, JSON.stringify({ sid, rowTitle, blankAtCreate, logAfterTurn, settled, dirsAfter, archAfter, chatFolder, folderKept, registryBefore, registryAfter, after, afterReload }, null, 1));
  console.log(`wrote ${RESULT}`);
} finally {
  // This probe's own residue: it made a chat folder inside the real Documents
  // chat root, which does not follow DSH_HOME (the plugin keeps chat folders on
  // disk by design, so the delete leaves it behind). Only this run's still-empty
  // folder goes — never an older one, never a non-empty one.
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
  console.log(failures.length === 0 ? 'PHASE1 ALL PASS' : `PHASE1 FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
