// Assertions b (session menu), c (pin / reload / unpin) and d (hover row
// actions) against the live instance. Menu items are activated with a stepped
// pointer glide (what a real mouse produces); the fallback is keyboard
// navigation. Success is measured against the HOST registry on disk, not just
// the rendered UI.
// Usage: node .scratch/accept3-menu-pin-hover.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, finish, openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept3-menu-pin-hover.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9381);
// The Host this probe measures against is the one whose home it was pointed at
// (`DSH_HOME`), never the operator's live one: reading `~/.dsh` while the
// verification instance runs on a copy reports the wrong registry — and the
// rule in AGENTS.md is that every probe resolves the home this way.
const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const REGISTRY = path.join(DSH_HOME, 'storages', 'workspace.json');
const hostPinned = () => {
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')).global.pinnedSessionIds ?? []; } catch { return null; }
};
/** Which workspace group the pin order is read from; `null` = the first one rendered. */
const GROUP = process.argv[4] ?? null;
/** Target row: an explicit id, or the LAST non-blank workspace row (so a pin has to move it). */
const TARGET = process.argv[3] ?? null;

const app = await openApp({ url: URL, port: PORT });

/** Ordered rows of the workspace pane, with the pinned marker. */
const groupOrder = () => app.evaluate(`(() => {
  const pane = document.querySelectorAll('[class$=_pane]')[0] ?? document.body;
  const nodes = [...pane.querySelectorAll('[data-row-key]')];
  const groups = [];
  let cur = null;
  for (const n of nodes) {
    const k = n.getAttribute('data-row-key');
    if (k.startsWith('workspace:')) { cur = { group: k, rows: [] }; groups.push(cur); }
    else if (k.startsWith('session:') && cur) {
      cur.rows.push({
        id: k.slice(8),
        text: n.innerText.split('\\n')[0].slice(0, 44),
        pinned: n.querySelector('[class$=_pinIndicator]') !== null,
        verbs: n.querySelector('[class$=_rowActions]') !== null,
      });
    }
  }
  const g = ${JSON.stringify(GROUP)} === null ? groups[0] : groups.find(x => x.group === ${JSON.stringify(GROUP)});
  // The [blank] tag marks a row with no verb strip: the built-in rule hoists the
  // current blank Session above everything, so the pin order is read among the
  // rows that carry their actions. (No backticks in here: this is evaluated as
  // page code inside a template literal.)
  return g ? g.rows.map(r => r.id.slice(8, 16) + (r.pinned ? '[PIN]' : '') + (r.verbs ? '' : ' [blank]') + ' ' + r.text) : null;
})()`);

/**
 * The probe target: an explicit id, else the last non-blank workspace row —
 * resolved ONCE and then pinned for the whole run. Pinning moves the row, so a
 * default target re-resolved on every call silently switches rows after the pin
 * (the unpin step then found only 「置顶会话」 on the new last row and the run
 * ended with the user's Session still pinned).
 */
let resolvedTarget = TARGET;
const probeRow = async () => {
  const row = await app.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-row-key^="session:"]')]
      .filter(r => !(document.querySelector('[class$=_chatSection]') || { contains: () => false }).contains(r))
      .filter(r => r.querySelector('[class$=_rowActions]') !== null);
    const want = ${JSON.stringify(resolvedTarget)};
    const r = want === null ? rows[rows.length - 1] : rows.find(x => x.getAttribute('data-row-key') === 'session:' + want);
    if (!r) return null;
    return { id: r.getAttribute('data-row-key').slice(8), text: r.innerText.replace(/\\n/g, ' | ').slice(0, 60), index: rows.indexOf(r), nonBlankRows: rows.length };
  })()`);
  if (resolvedTarget === null && row !== null) resolvedTarget = row.id;
  return row;
};

async function hoverRow() {
  const row = await probeRow();
  const rect = await app.rect(`[data-row-key="session:${row.id}"]`);
  await app.mouseMove(rect.x, rect.y);
  await sleep(350);
  return row;
}

async function triggerRect() {
  return app.evaluate(`(() => {
    const r = document.querySelector('[data-row-key="session:${(await probeRow()).id}"]');
    const b = r && [...r.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('的操作'));
    if (!b) return null;
    const rr = b.getBoundingClientRect();
    return { x: Math.round(rr.x + rr.width / 2), y: Math.round(rr.y + rr.height / 2) };
  })()`);
}

async function openMenu() {
  await hoverRow();
  const btn = await triggerRect();
  if (btn === null) return { error: 'no options button' };
  await app.mouseClick(btn.x, btn.y);
  await sleep(500);
  const dump = await app.evaluate(`(() => {
    const m = document.querySelector('[role=menu]');
    if (!m) return null;
    return {
      items: [...m.querySelectorAll('button[role=menuitem]')].map(b => {
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return {
          label: (b.querySelector('[class*=itemLabel]') || {}).textContent,
          full: (b.textContent || '').trim(),
          danger: String(b.className).includes('danger'),
          color: cs.color,
          iconPaths: b.querySelectorAll('svg path').length,
          firstPathD: (b.querySelector('svg path') || {}).getAttribute ? b.querySelector('svg path').getAttribute('d') : null,
          x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        };
      }),
      rect: (() => { const r = m.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      visibility: getComputedStyle(m).visibility,
    };
  })()`);
  return { btn, menu: dump };
}

const openCount = () => app.evaluate(`document.querySelectorAll('[role=menu]').length`);

/** Stepped pointer glide from a point to a point, sampling the menu's openness. */
async function glideInto(from, to, steps = 14) {
  const samples = [];
  for (let i = 1; i <= steps; i += 1) {
    const x = Math.round(from.x + (to.x - from.x) * (i / steps));
    const y = Math.round(from.y + (to.y - from.y) * (i / steps));
    await app.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await sleep(35);
    if (i === steps - 1 || i === steps) samples.push({ step: i, open: await openCount() });
  }
  return samples;
}

async function pressKey(key, code, vk, text) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await app.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  if (text !== undefined) await app.call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text, unmodifiedText: text });
  await app.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

async function activate(labelPrefix) {
  const opened = await openMenu();
  if (opened.error) return { error: opened.error };
  const item = opened.menu.items.find(i => (i.label || '').startsWith(labelPrefix));
  if (item === undefined) return { error: `no item ${labelPrefix}`, labels: opened.menu.items.map(i => i.label) };
  const samples = await glideInto(opened.btn, { x: item.x, y: item.y });
  const stillOpen = await openCount();
  const method = stillOpen > 0 ? 'pointer-glide' : 'keyboard-fallback';
  if (stillOpen > 0) {
    await app.mouseClick(item.x, item.y);
  } else {
    // Grace close fired during the glide: reopen and walk with the keyboard.
    await app.mouseMove(700, 800);
    await sleep(300);
    const reopened = await openMenu();
    if (reopened.error) return { error: reopened.error, glideSamples: samples, method };
    const target = reopened.menu.items.find(i => (i.label || '').startsWith(labelPrefix));
    await pressKey('ArrowDown', 'ArrowDown', 40);
    await sleep(250);
    let focused = await app.evaluate(`document.activeElement ? ((document.activeElement.querySelector('[class*=itemLabel]') || {}).textContent || '') : ''`);
    let guard = 0;
    while (!focused.startsWith(labelPrefix) && guard < 6) {
      await pressKey('ArrowDown', 'ArrowDown', 40);
      await sleep(250);
      focused = await app.evaluate(`document.activeElement ? ((document.activeElement.querySelector('[class*=itemLabel]') || {}).textContent || '') : ''`);
      guard += 1;
    }
    await pressKey('Enter', 'Enter', 13, '\r');
    return { method, glideSamples: samples, keyboard: { focusedBeforeEnter: focused, item, target } };
  }
  return { method, glideSamples: samples, item };
}

try {
  await app.navigate();
  await app.waitForApp({ attempts: 90, intervalMs: 2000 });
  await sleep(2800);

  const row = await probeRow();
  console.log('=== target row ===', JSON.stringify(row));
  console.log('=== pinned on host BEFORE ===', JSON.stringify(hostPinned()));
  if (!check('a non-blank workspace row with its actions is rendered', row !== null, JSON.stringify(row))) {
    throw new Error('no workspace row fixture: this probe needs one visible, non-blank workspace session');
  }

  // ---- d: hover surface ----
  const beforeHover = await app.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-row-key^="session:"]')]
      .filter(r => !(document.querySelector('[class$=_chatSection]') || { contains: () => false }).contains(r))
      .filter(r => r.querySelector('[class$=_rowActions]') !== null);
    const a = rows.find(r => r.getAttribute('data-row-key') === 'session:${row.id}').querySelector('[class$=_rowActions]');
    return { display: getComputedStyle(a).display, buttons: [...a.querySelectorAll('button')].map(b => b.getAttribute('aria-label')), offsetParentNull: [...a.querySelectorAll('button')].map(b => b.offsetParent === null) };
  })()`);
  await hoverRow();
  const afterHover = await app.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-row-key^="session:"]')]
      .filter(r => !(document.querySelector('[class$=_chatSection]') || { contains: () => false }).contains(r))
      .filter(r => r.querySelector('[class$=_rowActions]') !== null);
    const target = rows.find(r => r.getAttribute('data-row-key') === 'session:${row.id}');
    const a = target.querySelector('[class$=_rowActions]');
    return {
      display: getComputedStyle(a).display,
      rowHovered: target.matches(':hover'),
      buttons: [...a.querySelectorAll('button')].map(b => {
        const r = b.getBoundingClientRect();
        return { aria: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), offsetParentNull: b.offsetParent === null, svgPaths: b.querySelectorAll('svg path').length };
      }),
    };
  })()`);
  console.log('=== d BEFORE hover ===', JSON.stringify(beforeHover));
  console.log('=== d AFTER hover ===', JSON.stringify(afterHover));

  // ---- assertion d: the verb strip is a hover surface with real boxes ----
  check('the verb strip is hidden until the row is hovered', beforeHover.display === 'none', `display=${beforeHover.display}`);
  check('hovering the row reveals the verb strip', afterHover.display !== 'none' && afterHover.rowHovered === true, `display=${afterHover.display} hovered=${afterHover.rowHovered}`);
  check('every revealed action has a real box and an icon',
    afterHover.buttons.length > 0 && afterHover.buttons.every(b => b.w > 0 && b.h > 0 && b.offsetParentNull === false && b.svgPaths > 0),
    JSON.stringify(afterHover.buttons));

  // ---- b: menu contents ----
  await app.mouseMove(700, 800);
  await sleep(300);
  const openedMenu = await openMenu();
  console.log('=== b MENU ===');
  console.log(JSON.stringify(openedMenu.menu, null, 1));
  await app.screenshot('.scratch/accept3-menu.png');

  const menuItems = openedMenu.menu?.items ?? [];
  const menuLabels = menuItems.map(i => i.full);
  check('the row menu opens with the five actions', menuItems.length === 5, JSON.stringify(menuLabels));
  check('no menu action is listed twice', new Set(menuLabels).size === menuLabels.length, JSON.stringify(menuLabels));
  check('every menu action carries its icon', menuItems.length > 0 && menuItems.every(i => i.iconPaths > 0), JSON.stringify(menuItems.map(i => [i.full, i.iconPaths])));
  const delItem = menuItems.find(i => i.full === '删除会话');
  const otherItem = menuItems.find(i => i.full !== '删除会话');
  check('删除会话 is present and styled apart from the other actions',
    delItem !== undefined && otherItem !== undefined && delItem.color !== otherItem.color,
    `delete=${delItem?.color} other=${otherItem?.color}`);

  // ---- c1: pin ----
  console.log('=== c0 order ===', JSON.stringify(await groupOrder()));
  const pinRes = await activate('置顶');
  console.log('=== c1 pin activation ===', JSON.stringify(pinRes));
  await sleep(2200);
  const pinnedAfterPin = hostPinned();
  const orderAfterPin = await groupOrder();
  console.log('=== c1 order after pin ===', JSON.stringify(orderAfterPin));
  console.log('=== c1 pinned on host ===', JSON.stringify(pinnedAfterPin));
  check('置顶 reaches the Host registry for this row',
    pinRes.item !== undefined && Array.isArray(pinnedAfterPin) && pinnedAfterPin.includes(row.id),
    JSON.stringify({ activation: pinRes.error ?? `${pinRes.method}:${pinRes.item?.full}`, pinned: pinnedAfterPin }));
  // The current blank Session is hoisted above everything by the built-in rule
  // (it has no verb strip either), so "first" means first among the rows that
  // carry their actions.
  const firstActionable = (order) => (Array.isArray(order) ? order.find((entry) => !entry.includes(' [blank]')) : undefined);
  check('the pinned row is marked and is the first actionable row in its group',
    firstActionable(orderAfterPin)?.startsWith(row.id.slice(8, 16)) === true && firstActionable(orderAfterPin).includes('[PIN]') === true,
    JSON.stringify(orderAfterPin));
  await app.screenshot('.scratch/accept3-pinned.png');

  // ---- c2: reload ----
  await app.navigate();
  await app.waitForApp({ attempts: 90, intervalMs: 2000 });
  await sleep(2800);
  const pinnedAfterReload = hostPinned();
  const orderAfterReload = await groupOrder();
  console.log('=== c2 order after reload ===', JSON.stringify(orderAfterReload));
  console.log('=== c2 pinned on host ===', JSON.stringify(pinnedAfterReload));
  check('the pin is still in the Host registry after a reload',
    Array.isArray(pinnedAfterReload) && pinnedAfterReload.includes(row.id), JSON.stringify(pinnedAfterReload));
  check('the pinned row is still the first actionable row in its group after a reload',
    firstActionable(orderAfterReload)?.startsWith(row.id.slice(8, 16)) === true && firstActionable(orderAfterReload).includes('[PIN]') === true,
    JSON.stringify(orderAfterReload));

  // ---- c3: unpin ----
  const openedMenu2 = await openMenu();
  console.log('=== c3 menu after pin ===', JSON.stringify((openedMenu2.menu || {}).items ? openedMenu2.menu.items.map(i => i.label) : openedMenu2));
  check('the menu offers 取消置顶 once the row is pinned',
    (openedMenu2.menu?.items ?? []).some(i => (i.label || '').startsWith('取消置顶')),
    JSON.stringify((openedMenu2.menu?.items ?? []).map(i => i.label)));
  await app.mouseMove(700, 800);
  await sleep(300);
  const unpinRes = await activate('取消置顶');
  console.log('=== c3 unpin activation ===', JSON.stringify(unpinRes));
  await sleep(2200);
  const pinnedAfterUnpin = hostPinned();
  const orderAfterUnpin = await groupOrder();
  console.log('=== c3 order after unpin ===', JSON.stringify(orderAfterUnpin));
  console.log('=== c3 pinned on host ===', JSON.stringify(pinnedAfterUnpin));
  check('取消置顶 removes the pin from the Host registry',
    unpinRes.item !== undefined && Array.isArray(pinnedAfterUnpin) && !pinnedAfterUnpin.includes(row.id),
    JSON.stringify({ activation: unpinRes.error ?? `${unpinRes.method}:${unpinRes.item?.full}`, pinned: pinnedAfterUnpin }));
  check('the row no longer carries the pinned marker',
    Array.isArray(orderAfterUnpin) && !orderAfterUnpin.some(r => r.startsWith(row.id.slice(8, 16)) && r.includes('[PIN]')),
    JSON.stringify(orderAfterUnpin));

  const errs = app.consoleErrors();
  console.log(`=== CONSOLE ERRORS (${errs.length}) ===`);
  for (const e of errs) console.log(`+${e.at}ms [${e.kind}] ${e.text}`);
  check('no console error and no exception', errs.length === 0, `${errs.length} event(s)`);
  finish('accept3-menu-pin-hover');
} finally {
  await app.close();
}
