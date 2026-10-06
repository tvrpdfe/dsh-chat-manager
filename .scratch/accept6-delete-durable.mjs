// Durable-delete acceptance, phase 1: create a chat through the plugin, archive
// it, delete it from the settings page with a real mouse, and prove the Host
// removed the persisted log (the defect that made deleted Sessions come back
// after a Host restart).
// Usage: node .scratch/accept6-delete-durable.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept6-delete-durable.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9399);
// Resolve the home from DSH_HOME so this probe can run against an isolated
// copy of it instead of the live home.
const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const SESSIONS = path.join(DSH, 'sessions');
const RESULT = '.scratch/accept6-result.json';
/** The user's only real archived Session: the probe must never touch its row. */
const REAL_ARCHIVED = 'session-59070395-fbf4-475a-8c6f-60d04d4fb57c';

/** Every session directory on disk, as `slug/session-id`. */
function sessionDirs() {
  const out = [];
  for (const slug of fs.existsSync(SESSIONS) ? fs.readdirSync(SESSIONS) : []) {
    const dir = path.join(SESSIONS, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const id of fs.readdirSync(dir)) out.push(`${slug}/${id}`);
  }
  return out;
}
/** Files inside one session directory (empty when it is gone). */
function sessionFiles(id) {
  const dirs = sessionDirs().filter(d => d.endsWith(`/${id}`));
  if (dirs.length === 0) return [];
  return fs.readdirSync(path.join(SESSIONS, dirs[0])).map(f => `${dirs[0]}/${f}`);
}

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

const app = await openApp({ url: URL, port: PORT });
const domIds = () => app.evaluate(`[...document.querySelectorAll('[data-row-key^="session:"]')].map(r => r.getAttribute('data-row-key').slice(8))`);
const archivedList = () => app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.archived.map(a => a.sessionId))`);
const chord = async (mods, key, code, vk) => {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods };
  await app.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await app.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
};

try {
  await app.navigate();
  await app.waitForApp({ attempts: 40, intervalMs: 400 });
  await sleep(2500);
  const idsBefore = await domIds();
  const marker = await app.evaluate(`(() => { document.documentElement.dataset.a6 = 'alive'; return { nav: performance.getEntriesByType('navigation').length, origin: performance.timeOrigin }; })()`);

  // 1. Create a chat session.
  const add = await app.rect('[aria-label="新建聊天"]');
  if (add === null) throw new Error('no 新建聊天 button');
  await app.mouseClick(add.x, add.y);
  let sid = null;
  for (let i = 0; i < 40 && sid === null; i += 1) {
    await sleep(500);
    const fresh = (await domIds().catch(() => [])).filter(id => !idsBefore.includes(id));
    if (fresh.length > 0) sid = fresh[0];
  }
  if (sid === null) throw new Error('新建聊天 created no session');
  console.log(`new session S=${sid}`);
  await sleep(1200);
  const filesAtCreate = sessionFiles(sid);
  console.log(`S log at create: ${JSON.stringify(filesAtCreate)}`);

  // 2. Archive it through the shortcut (a blank Session has no verb strip).
  let archived = false;
  for (const [mods, label] of [[3, 'Ctrl+Alt+A'], [10, 'Ctrl+Shift+A']]) {
    for (let press = 0; press < 4 && !archived; press += 1) {
      await chord(mods, 'a', 'KeyA', 65);
      for (let i = 0; i < 10 && !archived; i += 1) {
        await sleep(600);
        archived = (await archivedList()).includes(sid);
      }
    }
    if (archived) { console.log(`archived via ${label}`); break; }
  }
  check('1 S is archived', archived);
  const filesAtArchive = sessionFiles(sid);
  console.log(`S log at archive: ${JSON.stringify(filesAtArchive)}`);

  // 3. Delete it from the settings page with a real mouse.
  const gear = await app.evaluate(`(() => {
    const t = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === '设置');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  await app.mouseClick(gear.x, gear.y);
  await sleep(1500);
  const nav = await app.evaluate(`(() => {
    const c = [...document.querySelectorAll('[class*=navCell]')].find(x => (x.textContent || '').includes('已归档会话'));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('2 settings exposes 已归档会话', nav !== null);
  await app.mouseClick(nav.x, nav.y);
  await sleep(1800);
  const rowDelete = await app.evaluate(`(async () => {
    const rows = [...document.querySelectorAll('[class*=archivedRow]')];
    // Pick the row by INDEX in the Host's archived list, never by 'last row':
    // the user's own archived Session sits in the same list, and a positional
    // guess could delete that instead of the Session this probe created.
    const archived = (await fetch('/api/chat-manager/state').then(r => r.json())).archived.map(a => a.sessionId);
    const index = archived.indexOf(${JSON.stringify(sid)});
    const forbidden = archived.indexOf(${JSON.stringify(REAL_ARCHIVED)});
    if (index < 0 || index >= rows.length) return { error: 'S is not in the archived list', archived };
    if (index === forbidden) return { error: 'resolved to the real archived row', archived };
    const row = rows[index];
    if (row.innerText.includes('测试：你好')) return { error: 'refusing to touch the real archived row', rowText: row.innerText };
    const b = [...row.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '删除');
    if (!b) return { error: 'no 删除 button', rowText: row.innerText };
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), rowText: row.innerText.replace(/\\n/g, ' | ').slice(0, 70) };
  })()`);
  check('3 the archived row offers 删除', rowDelete !== null && rowDelete.error === undefined, JSON.stringify(rowDelete));
  if (rowDelete === null || rowDelete.error !== undefined) throw new Error(`no deletable archived row for ${sid}: ${JSON.stringify(rowDelete)}`);
  await app.mouseClick(rowDelete.x, rowDelete.y);
  await sleep(1200);
  const dialogTitle = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    return d ? ((d.querySelector('h2') || {}).textContent ?? null) : null;
  })()`);
  check('4 the confirm dialog opened', dialogTitle !== null, String(dialogTitle));
  const confirm = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    const b = d ? [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '删除') : null;
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('5 the dialog offers the destructive 删除', confirm !== null);
  await app.mouseClick(confirm.x, confirm.y);
  await sleep(2500);

  const after = await app.evaluate(`({
    dialogs: document.querySelectorAll('[role=dialog][aria-modal=true]').length,
    dialogText: (() => { const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')]; const d = all[all.length - 1]; return d ? d.innerText.replace(/\\n/g, ' | ').slice(0, 200) : null; })(),
    rows: document.querySelectorAll('[data-row-key]').length,
    archivedRows: document.querySelectorAll('[class*=archivedRow]').length,
    stillInDom: document.querySelector('[data-row-key="session:${sid}"]') !== null,
    marker: document.documentElement.dataset.a6,
    nav: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
  })`);
  const archivedAfter = await archivedList().catch(() => null);
  const filesAfter = sessionFiles(sid);
  const dirAfter = sessionDirs().filter(d => d.endsWith(`/${sid}`));

  check('6 the row left the DOM', after.stillInDom === false, JSON.stringify(after));
  check('7 S left the archive list', Array.isArray(archivedAfter) && !archivedAfter.includes(sid), JSON.stringify(archivedAfter));
  check('8 the persisted log is GONE', dirAfter.length === 0 && filesAfter.length === 0, `before=${JSON.stringify(filesAtArchive)} after=${JSON.stringify(dirAfter)}`);
  check('9 no full page reload', after.nav === marker.nav && after.origin === marker.origin && after.marker === 'alive');
  check('10 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 200))));

  fs.writeFileSync(RESULT, JSON.stringify({ sid, filesAtCreate, filesAtArchive, filesAfter, dirAfter, archivedAfter, after }, null, 1));
  console.log(`wrote ${RESULT}`);
} finally {
  console.log(failures.length === 0 ? 'PHASE1 ALL PASS' : `PHASE1 FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
