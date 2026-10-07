// Regression acceptance for the mouse-reachable session menu: the row's verb
// strip must stay laid out while its menu is open (so the portaled list keeps
// its anchor), the list must keep the same position under a real pointer glide,
// and a real click on 删除会话 must raise the confirm dialog — which 取消 then
// dismisses without touching the Host registry.
// Usage: node .scratch/accept5-menu-mouse.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept5-menu-mouse.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9397);
// Resolve the home from DSH_HOME so this probe can run against an isolated
// copy of it instead of the live home.
const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const REGISTRY = path.join(DSH, 'storages', 'workspace.json');

/** Does the on-disk registry still reference this session? */
const registryHas = (sid) => {
  try { return fs.readFileSync(REGISTRY, 'utf8').includes(sid); } catch { return null; }
};

const app = await openApp({ url: URL, port: PORT });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

try {
  await app.navigate();
  if (!(await app.waitForApp({ attempts: 90, intervalMs: 2000 }))) throw new Error('app never rendered rows');

  // First row with a verb strip, from either pane. A fresh browser profile has no
  // persisted expansion state, so the Workspace groups can start collapsed and the
  // workspace area then renders no Session rows at all; the chat pane's rows are the
  // same component with the same menu slots, so either one proves mouse reachability.
  let row = null;
  for (let i = 0; i < 60 && row === null; i += 1) {
    await sleep(1000);
    row = await app.evaluate(`(() => {
      const chat = document.querySelector('[class$=_chatSection]');
      const rows = [...document.querySelectorAll('[data-row-key^="session:"]')]
        .filter(r => r.querySelector('[class$=_rowActions]') !== null);
      const r = rows[0];
      return r === undefined ? null : {
        key: r.getAttribute('data-row-key'),
        title: r.innerText.split('\\n')[0],
        pane: chat !== null && chat.contains(r) ? 'chat' : 'workspace',
      };
    })()`).catch(() => null);
  }
  if (row === null) throw new Error('no Session row with a verb strip');
  const sid = row.key.slice('session:'.length);
  const registryBefore = registryHas(sid);
  console.log(`row=${row.key} title="${row.title}" registryHas=${registryBefore}`);

  // 1. Hover the row: the strip shows only under :hover.
  const rowRect = await app.rect(`[data-row-key=${JSON.stringify(row.key)}]`);
  await app.mouseMove(rowRect.x, rowRect.y);
  await sleep(400);
  const trigger = await app.evaluate(`(() => {
    const r = document.querySelector('[data-row-key=${JSON.stringify(row.key)}]');
    const b = [...r.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('的操作'));
    const br = b.getBoundingClientRect();
    return { x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2), left: Math.round(br.left), bottom: Math.round(br.bottom) };
  })()`);
  check('1 hover shows the verb strip', (await app.evaluate(`(() => {
    const s = document.querySelector('[data-row-key=${JSON.stringify(row.key)}] [class$=_rowActions]');
    return s !== null && getComputedStyle(s).display !== 'none';
  })()`)) === true);
  console.log(`   trigger=(${trigger.x},${trigger.y}) left=${trigger.left} bottom=${trigger.bottom}`);

  // 2. Open the menu with a real click.
  await app.mouseClick(trigger.x, trigger.y);
  await sleep(300);
  const opened = await app.evaluate(`(() => {
    const l = document.querySelector('[role=menu]');
    if (l === null) return null;
    const r = l.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), items: [...l.querySelectorAll('button[role=menuitem]')].map(b => (b.textContent || '').trim()) };
  })()`);
  check('2 menu opens with the five actions', opened !== null && opened.items.length === 5, JSON.stringify(opened?.items));
  if (opened === null) throw new Error('menu did not open');
  const anchored = Math.abs(opened.top - (trigger.bottom + 4)) <= 3 && Math.abs(opened.left - trigger.left) <= 3;
  check('3 list is anchored under its trigger', anchored, `list=(${opened.left},${opened.top})`);
  const anchorPos = `${opened.left},${opened.top}`;

  // 3. Glide the real pointer onto the list, one step at a time.
  const centre = await app.evaluate(`(() => {
    const r = document.querySelector('[role=menu]').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  let alive = true;
  let moved = false;
  for (let i = 1; i <= 12 && alive; i += 1) {
    const x = Math.round(trigger.x + (centre.x - trigger.x) * i / 12);
    const y = Math.round(trigger.y + (centre.y - trigger.y) * i / 12);
    await app.mouseMove(x, y);
    await sleep(45);
    const state = await app.evaluate(`(() => {
      const r = document.querySelector('[data-row-key=${JSON.stringify(row.key)}]');
      const strip = r === null ? null : r.querySelector('[class$=_rowActions]');
      const l = document.querySelector('[role=menu]');
      const lr = l === null ? null : l.getBoundingClientRect();
      const hit = l === null ? null : document.elementFromPoint(${centre.x}, ${centre.y});
      return {
        list: lr === null ? null : Math.round(lr.left) + ',' + Math.round(lr.top),
        strip: strip === null ? null : getComputedStyle(strip).display,
        inList: l !== null && hit !== null && l.contains(hit),
      };
    })()`);
    if (state.list !== anchorPos) { alive = false; console.log(`   step${i} @(${x},${y}) list moved to ${state.list} strip=${state.strip}`); }
    else if (state.strip === 'none') { alive = false; console.log(`   step${i} @(${x},${y}) strip collapsed to display:none`); }
    else if (state.inList) moved = true;
  }
  check('4 pointer glide keeps the menu anchored and open', alive, `steps=${12}`);
  check('5 the pointer lands inside the list', moved);
  await app.screenshot('.scratch/accept5-menu-hover.png');

  // 4. Real click on 删除会话.
  const item = await app.evaluate(`(() => {
    const l = document.querySelector('[role=menu]');
    const b = [...l.querySelectorAll('button[role=menuitem]')].find(x => (x.textContent || '').trim() === '删除会话');
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  check('6 删除会话 item is present', item !== null);
  if (item === null) throw new Error('no delete item');
  await app.mouseClick(item.x, item.y);
  await sleep(700);
  const dialog = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    if (d === undefined) return { count: all.length, title: null, description: null };
    return { count: all.length, title: (d.querySelector('h2') || {}).textContent ?? null, description: (d.querySelector('p') || {}).textContent ?? null };
  })()`);
  check('7 a real click raises the delete confirmation', dialog.title === '删除会话' && dialog.count >= 1, JSON.stringify(dialog));
  check('8 the dialog names the hovered session', (dialog.description ?? '').includes(row.title.slice(0, 6)), String(dialog.description));
  await app.screenshot('.scratch/accept5-menu-dialog.png');

  // 5. Cancel with a real click: nothing may be destroyed.
  const cancel = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    const b = [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '取消');
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  await app.mouseClick(cancel.x, cancel.y);
  await sleep(500);
  const after = await app.evaluate(`({
    dialogs: document.querySelectorAll('[role=dialog][aria-modal=true]').length,
    rows: document.querySelectorAll('[data-row-key]').length,
    rowStillPresent: document.querySelector('[data-row-key=${JSON.stringify(row.key)}]') !== null,
    navEntries: performance.getEntriesByType('navigation').length,
  })`);
  check('9 取消 dismisses the dialog with the row intact', after.dialogs === 0 && after.rowStillPresent === true, JSON.stringify(after));
  check('10 the Host registry still lists the session', registryHas(sid) === true || registryBefore === false, `before=${registryBefore} after=${registryHas(sid)}`);

  const errs = app.consoleErrors();
  check('11 no console errors', errs.length === 0, JSON.stringify(errs.map(e => e.text.slice(0, 160))));
} finally {
  console.log(failures.length === 0 ? 'ALL PASS' : `FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
