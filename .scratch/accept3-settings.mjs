// Assertion g (archived-session settings page) plus the g-extra refactor check:
// the settings page's 删除 opens the shared ConfirmDeleteDialog naming the
// session, and 取消 dismisses it with the row still present.
// The destructive confirm is only performed when ACCEPT_DESTRUCTIVE=1.
// Usage: node .scratch/accept3-settings.mjs <url>
import { check, finish, openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept3-settings.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9383);
const CONFIRM_DELETE = process.env.ACCEPT_DESTRUCTIVE === '1';

const app = await openApp({ url: URL, port: PORT });

/**
 * The dialogs on the page, split into what a person can act on.
 *
 * Two things make a bare `[role=dialog][aria-modal=true]` count wrong here: the
 * settings panel is ITSELF such a dialog (it fills the viewport and holds the
 * archived rows, their 恢复/删除 buttons and a 关闭), and the platform's Modal
 * keeps its container in the DOM after closing. The plugin's confirmation dialog
 * is therefore identified by what only it carries — a 取消 AND a 删除 button.
 */
const dialogDump = () => app.evaluate(`(() => {
  const described = [...document.querySelectorAll('[role=dialog][aria-modal=true]')].map(d => {
    const r = d.getBoundingClientRect();
    const cs = getComputedStyle(d);
    const btns = [...d.querySelectorAll('button')].map(b => {
      const bcs = getComputedStyle(b);
      return { text: (b.textContent || '').trim(), aria: b.getAttribute('aria-label'), cls: String(b.className), color: bcs.color };
    });
    return {
      title: (d.querySelector('h2') || {}).textContent ?? null,
      description: (d.querySelector('p') || {}).textContent ?? null,
      fullText: d.innerText.replace(/\\n/g, ' | '),
      buttons: btns,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      visibility: cs.visibility,
      display: cs.display,
      onScreen: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
      closeButtonAria: (() => { const b = d.querySelector('button[aria-label]'); return b ? b.getAttribute('aria-label') : null; })(),
    };
  });
  const confirms = described.filter(d => d.onScreen
    && d.buttons.some(b => b.text === '取消') && d.buttons.some(b => b.text === '删除'));
  return {
    dialogCount: confirms.length,
    renderedCount: described.length,
    dialogs: described.map(d => ({ title: d.title, rect: d.rect, onScreen: d.onScreen, buttons: d.buttons.map(b => b.text) })),
    dialog: confirms[confirms.length - 1] ?? null,
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
  const gotRows = await app.waitForApp({ attempts: 90, intervalMs: 2000 });
  await sleep(2500);

  // open Settings
  const trigger = await app.evaluate(`(() => {
    const t = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === '设置');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (!check('the page painted, with its settings button', gotRows === true && trigger !== null, `gotRows=${gotRows} trigger=${trigger !== null}`)) {
    throw new Error('cannot open the settings page: no 设置 button');
  }
  await app.mouseClick(trigger.x, trigger.y);
  await sleep(1500);

  const navCells = await app.evaluate(`[...document.querySelectorAll('[class*=navCell]')].map(c => (c.textContent || '').trim())`);
  console.log('=== settings nav cells ===', JSON.stringify(navCells));
  check('the settings page registers the archived-sessions section', navCells.some(c => c.includes('已归档会话')), JSON.stringify(navCells));

  const sectionRect = await app.evaluate(`(() => {
    const c = [...document.querySelectorAll('[class*=navCell]')].find(x => (x.textContent || '').includes('已归档会话'));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (!check('the archived-sessions section is clickable', sectionRect !== null)) {
    throw new Error('cannot open the archived-sessions section');
  }
  await app.mouseClick(sectionRect.x, sectionRect.y);
  await sleep(2000);

  const rows = await archivedRows();
  console.log('=== g: archived rows ===');
  console.log(JSON.stringify(rows, null, 1));
  const leak = await leaks();
  console.log('=== g: key leaks ===', JSON.stringify(leak));
  const labelPresent = await app.evaluate(`document.body.innerText.includes('已归档会话')`);
  console.log('=== g: label present ===', labelPresent);
  await app.screenshot('.scratch/accept3-settings.png');

  // ---- assertion g: the page itself ----
  check('the archived section is labelled on the page', labelPresent === true);
  check('no raw i18n key is rendered as text', leak.exactKeyNodes.length === 0, JSON.stringify(leak.exactKeyNodes).slice(0, 200));
  check('no time.* key leaks as a literal', leak.substringTimeKeys.length === 0, JSON.stringify(leak.substringTimeKeys).slice(0, 200));
  // Fail-closed fixture rule (the same rule the delete/restore probes follow):
  // an empty archive would make every check below vacuously true, so the missing
  // fixture is itself the failure.
  check('the archive holds at least one session to check', rows.length > 0,
    `${rows.length} row(s) — archive a session first (accept6/accept8 create their own fixtures)`);
  check('every archived row shows a real title', rows.length > 0 && rows.every(r => typeof r.title === 'string' && r.title.trim() !== ''),
    JSON.stringify(rows.map(r => r.title)).slice(0, 200));
  check('every archived row shows a rendered time, not a key', rows.length > 0 && rows.every(r => typeof r.time === 'string' && r.time.trim() !== '' && !/^time\./.test(r.time.trim())),
    JSON.stringify(rows.map(r => r.time)).slice(0, 200));
  check('every archived row offers 恢复 and 删除', rows.length > 0 && rows.every(r => r.buttons.includes('恢复') && r.buttons.includes('删除')),
    JSON.stringify(rows.map(r => r.buttons)).slice(0, 200));

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
    check('the archived row offers its own 删除 button', false, 'no 删除 button on the archived row');
  } else {
    console.log('=== g-extra: row 删除 button rect ===', JSON.stringify(delRect), '| top at point =', await app.evaluate(`(() => { const e = document.elementFromPoint(${delRect.x}, ${delRect.y}); return e ? e.tagName + '.' + String(e.className).slice(0, 50) + ' :: ' + (e.textContent || '').trim().slice(0, 20) : null; })()`));
    console.log('=== dialogs before click ===', JSON.stringify(await dialogDump()));
    await app.mouseClick(delRect.x, delRect.y);
    await sleep(1400);
    const dialog = await dialogDump();
    console.log('=== g-extra: confirm dialog (after 删除) ===');
    console.log(JSON.stringify(dialog, null, 1));
    await app.screenshot('.scratch/accept3-settings-dialog.png');
    const rowsWhileOpen = (await archivedRows()).length;
    console.log('rows while dialog open =', rowsWhileOpen);

    const firstTitle = (rows[0]?.title ?? '').trim();
    check('the row\'s 删除 opens exactly one confirmation dialog on screen',
      dialog.dialogCount === 1 && dialog.dialog !== null,
      `onScreen=${dialog.dialogCount} rendered=${dialog.renderedCount} ${JSON.stringify(dialog.dialogs)}`);
    // The row renders "工作区：标题" while the dialog names the SESSION title
    // alone (the client passes `deleteTarget.title`), so the quoted name has to
    // be a suffix of the rendered cell rather than equal to it.
    const quoted = /“([^”]+)”/.exec(String(dialog.dialog?.description ?? ''))?.[1] ?? '';
    check('the dialog names the session it would delete',
      quoted !== '' && (firstTitle === '' || firstTitle.endsWith(quoted)),
      `quoted=${JSON.stringify(quoted)} row=${JSON.stringify(firstTitle)}`);
    check('the dialog offers the destructive confirm and a dismiss',
      dialog.dialog !== null && dialog.dialog.buttons.some(b => b.text === '删除') && dialog.dialog.buttons.some(b => b.text === '取消'),
      JSON.stringify(dialog.dialog?.buttons?.map(b => b.text)));
    check('the dialog left the list untouched while it is open', rowsWhileOpen === rows.length, `${rows.length} → ${rowsWhileOpen}`);

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
      check('the dialog is dismissible', false, 'no 取消 button inside the dialog');
    } else {
      await app.mouseClick(cancelRect.x, cancelRect.y);
      await sleep(1200);
      const afterCancel = await app.evaluate(`({
        dialogs: [...document.querySelectorAll('[role=dialog][aria-modal=true]')].filter(d => { const r = d.getBoundingClientRect(); const cs = getComputedStyle(d); if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none')) return false; const texts = [...d.querySelectorAll('button')].map(b => (b.textContent || '').trim()); return texts.includes('取消') && texts.includes('删除') }).length,
        rows: document.querySelectorAll('[class*=archivedRow]').length,
        navEntries: performance.getEntriesByType('navigation').length,
        rowText: (document.querySelector('[class*=archivedRow]') || {}).innerText ? document.querySelector('[class*=archivedRow]').innerText.replace(/\\n/g, ' | ') : null,
      })`);
      console.log('=== g-extra: after 取消 ===', JSON.stringify(afterCancel), '(navEntries before dialog =', navCountBefore, ')');
      console.log('=== g-extra: rows still listed ===', JSON.stringify(await archivedRows()));
      check('取消 closes the dialog', afterCancel.dialogs === 0, `dialogs=${afterCancel.dialogs}`);
      check('取消 leaves the row listed', afterCancel.rows === rows.length, `${rows.length} → ${afterCancel.rows}`);
      check('取消 survives without a page reload', afterCancel.navEntries === navCountBefore, `${navCountBefore} → ${afterCancel.navEntries}`);
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
      const afterConfirm = await app.evaluate(`({
        dialog: document.querySelector('[role=dialog][aria-modal=true]') !== null,
        rows: document.querySelectorAll('[class*=archivedRow]').length,
        navEntries: performance.getEntriesByType('navigation').length,
        emptyText: document.body.innerText.includes('暂无已归档会话'),
      })`);
      console.log('=== g-extra DESTRUCTIVE: after confirm ===', JSON.stringify(afterConfirm));
      check('the confirmed delete closes the dialog', afterConfirm.dialog === false, JSON.stringify(afterConfirm));
      check('the confirmed delete drops the row', afterConfirm.rows === rows.length - 1, `${rows.length} → ${afterConfirm.rows}`);
      check('the confirmed delete needs no page reload', afterConfirm.navEntries === navCountBefore, `${navCountBefore} → ${afterConfirm.navEntries}`);
    }
  }

  const errs = app.consoleErrors();
  console.log(`=== CONSOLE ERRORS (${errs.length}) ===`);
  for (const e of errs) console.log(`+${e.at}ms [${e.kind}] ${e.text}`);
  check('no console error and no exception', errs.length === 0, `${errs.length} event(s)`);
  finish('accept3-settings');
} finally {
  await app.close();
}
