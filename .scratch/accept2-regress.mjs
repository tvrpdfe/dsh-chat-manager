// Assertion a + regression check: no slot error, zero console errors, rows
// rendered, and the view store must not be re-dispatched in a loop.
// Usage: node .scratch/accept2-regress.mjs <url>
import { openApp, printEvents, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept2-regress.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9371);

const INSTRUMENT = `(() => {
  const log = [];
  window.__probe = { sets: log };
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    let stack = null;
    if (String(key) === 'dsh.workspace.view.v5' && log.filter(s => s.stack).length < 2) {
      stack = (new Error('write').stack || '').split('\\n').slice(0, 10).join('\\n');
    }
    log.push({ key: String(key), t: Math.round(performance.now() * 10) / 10, value: String(value).slice(0, 200), stack });
    return orig.call(this, key, value);
  };
})()`;

const app = await openApp({ url: URL, port: PORT, instrument: INSTRUMENT });
try {
  await app.navigate();
  const gotRows = await app.waitForApp({ attempts: 40, intervalMs: 400 });
  await sleep(3000);

  const out = await app.evaluate(`(() => {
    const sets = (window.__probe && window.__probe.sets) || [];
    const view = sets.filter(s => s.key === 'dsh.workspace.view.v5');
    const byKey = {};
    for (const s of sets) byKey[s.key] = (byKey[s.key] || 0) + 1;
    const errors = [...document.querySelectorAll('[data-slot-error]')].map(e => e.getAttribute('data-slot-error'));
    const rows = [...document.querySelectorAll('[data-row-key]')].map(e => e.getAttribute('data-row-key'));
    const labels = [...document.querySelectorAll('span')]
      .filter(s => s.children.length === 0 && ['工作区','聊天','会话','Workspaces','Chats'].includes((s.textContent || '').trim()))
      .map(s => s.textContent.trim());
    const chatEl = document.querySelector('[class$=_chatSection]');
    return {
      slotErrors: errors,
      rowCount: rows.length,
      rows: rows.slice(0, 40),
      sectionLabels: labels,
      viewWriteCount: view.length,
      viewWrites: view.map(v => v.value),
      viewSpanMs: view.length > 1 ? Math.round((view[view.length - 1].t - view[0].t) * 10) / 10 : 0,
      viewStacks: view.filter(v => v.stack).map(v => v.stack),
      byKey,
      chatSectionPresent: chatEl !== null,
      dividerPresent: document.querySelectorAll('[class$=_divider]').length,
      splitPresent: document.querySelectorAll('[class$=_split]').length,
      paneCount: document.querySelectorAll('[class$=_pane]').length,
      newChatButtons: document.querySelectorAll('[aria-label="新建聊天"]').length,
      navType: performance.getEntriesByType('navigation').map(n => n.type),
    };
  })()`);

  console.log('=== ASSERTION a / REGRESSION ===');
  console.log(JSON.stringify(out, null, 1));
  console.log('gotRows =', gotRows);
  const errs = app.consoleErrors();
  console.log(`=== CONSOLE ERRORS (${errs.length}) ===`);
  for (const e of errs) console.log(`+${e.at}ms [${e.kind}] ${e.text}`);
  printEvents(app.events, e => e.kind === 'net' && (e.text.includes('chat-manager') || e.text.includes('workspaces') || e.text.includes('session/list')));
  await app.screenshot('.scratch/accept2-boot-fixed.png');
  console.log('screenshot .scratch/accept2-boot-fixed.png');
} finally {
  await app.close();
}
