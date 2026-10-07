// Assertion g (archived-session settings page) plus the g-extra refactor check:
// the settings page's 删除 opens the shared ConfirmDeleteDialog naming the
// session, and 取消 dismisses it with the row still present.
// The destructive confirm is only performed when ACCEPT_DESTRUCTIVE=1.
// Usage: node .scratch/accept3-settings.mjs <url>
import { openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept3-settings.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9383);
const CONFIRM_DELETE = process.env.ACCEPT_DESTRUCTIVE === '1';

const app = await openApp({ url: URL, port: PORT });

const dialogDump = () => app.evaluate(`(() => {
  const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
  const d = all[all.length - 1];
  if (!d) return { dialogCount: 0, dialog: null };
  const btns = [...d.querySelectorAll('button')].map(b => {
    const cs = getComputedStyle(b);
    return { text: (b.textContent || '').trim(), aria: b.getAttribute('aria-label'), cls: String(b.className), color: cs.color };
  });
  const r = d.getBoundingClientRect();
  return {
    dialogCount: all.length,
    dialog: {
      title: (d.querySelector('h2') || {}).textContent ?? null,
      description: (d.querySelector('p') || {}).textContent ?? null,
      fullText: d.innerText.replace(/\\n/g, ' | '),
      buttons: btns,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      closeButtonAria: (() => { const b = d.querySelector('button[aria-label]'); return b ? b.getAttribute('aria-label') : null; })(),
    },
  };
})()`);

const archivedRows = () => app.evaluate(`(() => [...document.querySelectorAll('[class*=archivedRow]')].map(el => ({
  cls: String(el.className),
  text: (el.innerText || '').replace(/\\n/g, ' | '),
  title: (el.querySelector('[class*=archivedTitle]') || {}).textContent ?? null,
  time: (el.querySelector('[class*=archivedTime]') || {}).textContent ?? null,
  buttons: [...el.querySelectorAll('button')].map(b => (b.textContent || '').trim()),
})))()`);

const leaks = () => app.evaluate(`(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) { const v = (walker.currentNode.nodeValue || '').trim(); if (v) texts.push(v); }
  return {
    exactKeyNodes: texts.filter(v => /^(time|archived|delete|menu|chat|settings|row|actions|status|empty|search|viewOptions|orderBy|groupBy|filterBy|sessions)\\.[A-Za-z0-9_.]+$/.test(v)),
    substringTimeKeys: texts.filter(v => /time\\.(now|minutes|hours|days|months|years|ago)/.test(v)),
  };
})()`);

try {
  await app.navigate();
  await app.waitForApp({ attempts: 90, intervalMs: 2000 });
  await sleep(2500);

  // open Settings
  const trigger = await app.evaluate(`(() => {
    const t = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === '设置');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  await app.mouseClick(trigger.x, trigger.y);
  await sleep(1500);

  const navCells = await app.evaluate(`[...document.querySelectorAll('[class*=navCell]')].map(c => (c.textContent || '').trim())`);
  console.log('=== settings nav cells ===', JSON.stringify(navCells));

  const sectionRect = await app.evaluate(`(() => {
    const c = [...document.querySelectorAll('[class*=navCell]')].find(x => (x.textContent || '').includes('已归档会话'));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  await app.mouseClick(sectionRect.x, sectionRect.y);
  await sleep(2000);

  const rows = await archivedRows();
  console.log('=== g: archived rows ===');
  console.log(JSON.stringify(rows, null, 1));
  console.log('=== g: key leaks ===', JSON.stringify(await leaks()));
  console.log('=== g: label present ===', await app.evaluate(`document.body.innerText.includes('已归档会话')`));
  await app.screenshot('.scratch/accept3-settings.png');

  // ---- g-extra: open the shared confirm dialog from the settings page ----
  const navCountBefore = await app.evaluate(`performance.getEntriesByType('navigation').length`);
  const delRect = await app.evaluate(`(() => {
    const row = document.querySelector('[class*=archivedRow]');
    if (!row) return null;
    const b = [...row.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify('删除')});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (delRect === null) {
    console.log('=== g-extra: no 删除 button on the archived row ===');
  } else {
    console.log('=== g-extra: row 删除 button rect ===', JSON.stringify(delRect), '| top at point =', await app.evaluate(`(() => { const e = document.elementFromPoint(${delRect.x}, ${delRect.y}); return e ? e.tagName + '.' + String(e.className).slice(0, 50) + ' :: ' + (e.textContent || '').trim().slice(0, 20) : null; })()`));
    console.log('=== dialogs before click ===', JSON.stringify(await dialogDump()));
    await app.mouseClick(delRect.x, delRect.y);
    await sleep(1400);
    const dialog = await dialogDump();
    console.log('=== g-extra: confirm dialog (after 删除) ===');
    console.log(JSON.stringify(dialog, null, 1));
    await app.screenshot('.scratch/accept3-settings-dialog.png');
    console.log('rows while dialog open =', (await archivedRows()).length);

    // Cancel: the dialog must close and the row must survive.
    const cancelRect = await app.evaluate(`(() => {
      const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
      const d = all[all.length - 1];
      if (!d) return null;
      const b = [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '取消');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), cls: String(b.className) };
    })()`);
    if (cancelRect === null) {
      console.log('=== g-extra: no 取消 button ===');
    } else {
      await app.mouseClick(cancelRect.x, cancelRect.y);
      await sleep(1200);
      const afterCancel = await app.evaluate(`({
        dialogs: document.querySelectorAll('[role=dialog][aria-modal=true]').length,
        rows: document.querySelectorAll('[class*=archivedRow]').length,
        navEntries: performance.getEntriesByType('navigation').length,
        rowText: (document.querySelector('[class*=archivedRow]') || {}).innerText ? document.querySelector('[class*=archivedRow]').innerText.replace(/\\n/g, ' | ') : null,
      })`);
      console.log('=== g-extra: after 取消 ===', JSON.stringify(afterCancel), '(navEntries before dialog =', navCountBefore, ')');
      console.log('=== g-extra: rows still listed ===', JSON.stringify(await archivedRows()));
    }

    // Optional destructive confirm.
    if (CONFIRM_DELETE) {
      const delRect2 = await app.evaluate(`(() => {
        const row = document.querySelector('[class*=archivedRow]');
        if (!row) return null;
        const b = [...row.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '删除');
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      await app.mouseClick(delRect2.x, delRect2.y);
      await sleep(1000);
      const confirmRect = await app.evaluate(`(() => {
        const d = document.querySelector('[role=dialog][aria-modal=true]');
        const b = [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '删除');
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      await app.mouseClick(confirmRect.x, confirmRect.y);
      await sleep(3000);
      console.log('=== g-extra DESTRUCTIVE: after confirm ===', JSON.stringify(await app.evaluate(`({
        dialog: document.querySelector('[role=dialog][aria-modal=true]') !== null,
        rows: document.querySelectorAll('[class*=archivedRow]').length,
        navEntries: performance.getEntriesByType('navigation').length,
        emptyText: document.body.innerText.includes('暂无已归档会话'),
      })`)));
    }
  }

  const errs = app.consoleErrors();
  console.log(`=== CONSOLE ERRORS (${errs.length}) ===`);
  for (const e of errs) console.log(`+${e.at}ms [${e.kind}] ${e.text}`);
} finally {
  await app.close();
}
