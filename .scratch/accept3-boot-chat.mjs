// Assertions a (boot) and f (chat pane + divider + new-chat + date folders kept
// out of the workspace area), plus the write-count regression check.
// Usage: node .scratch/accept3-boot-chat.mjs <url>
import { openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept3-boot-chat.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9382);

const INSTRUMENT = `(() => {
  const log = [];
  window.__probe = { sets: log };
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    let stack = null;
    if (String(key) === 'dsh.workspace.view.v5' && log.filter(s => s.stack).length < 3) {
      stack = (new Error('write').stack || '').split('\\n').slice(0, 9).join('\\n');
    }
    log.push({ key: String(key), t: Math.round(performance.now() * 10) / 10, value: String(value).slice(0, 160), stack });
    return orig.call(this, key, value);
  };
})()`;

const app = await openApp({ url: URL, port: PORT, instrument: INSTRUMENT });
try {
  await app.navigate();
  const gotRows = await app.waitForApp({ attempts: 40, intervalMs: 400 });
  await sleep(3200);

  const out = await app.evaluate(`(() => {
    const sets = (window.__probe && window.__probe.sets) || [];
    const view = sets.filter(s => s.key === 'dsh.workspace.view.v5');
    const panes = [...document.querySelectorAll('[class$=_pane]')];
    const chat = document.querySelector('[class$=_chatSection]');
    const wsPane = panes[0] ?? null;
    const rowText = (el) => (el.innerText || '').replace(/\\n/g, ' | ');
    const wsRows = wsPane ? [...wsPane.querySelectorAll('[data-row-key]')].map(r => ({ key: r.getAttribute('data-row-key'), text: rowText(r).slice(0, 70) })) : [];
    const chatRows = chat ? [...chat.querySelectorAll('[data-row-key]')].map(r => ({ key: r.getAttribute('data-row-key'), text: rowText(r).slice(0, 70) })) : [];
    const dateRe = /^\\d{4}-\\d{2}-\\d{2}$/;
    const wsGroupTitles = wsRows.filter(r => r.key.startsWith('workspace:')).map(r => r.text.trim());
    const divider = document.querySelector('[class$=_divider]');
    const split = document.querySelector('[class$=_split]');
    const chatHeaderAdd = chat ? [...chat.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === '新建聊天') : null;
    const chatLabel = chat ? [...chat.querySelectorAll('span')].filter(s => s.children.length === 0).map(s => (s.textContent || '').trim()).filter(t => t.length > 0)[0] : null;
    return {
      slotErrors: [...document.querySelectorAll('[data-slot-error]')].map(e => e.getAttribute('data-slot-error')),
      rowCount: document.querySelectorAll('[data-row-key]').length,
      sectionLabels: [...document.querySelectorAll('span')].filter(s => s.children.length === 0 && ['工作区','聊天','会话'].includes((s.textContent||'').trim())).map(s => s.textContent.trim()),
      workspacePaneRegionCount: wsRows.length,
      chatPaneRegionCount: chatRows.length,
      workspaceGroupTitles: wsGroupTitles,
      dateLikeWorkspaceTitlesInWorkspacePane: wsGroupTitles.filter(t => dateRe.test(t)),
      dateLikeTextAnywhereInWorkspacePane: wsRows.filter(r => /\\d{4}-\\d{2}-\\d{2}/.test(r.text)).map(r => r.key + ' :: ' + r.text),
      chatPaneRowSample: chatRows.slice(0, 12),
      split: split ? { cls: String(split.className), childCount: split.children.length } : null,
      divider: divider ? (() => { const r = divider.getBoundingClientRect(); const cs = getComputedStyle(divider); return { cls: String(divider.className), tag: divider.tagName, childEls: divider.children.length, rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) }, cursor: cs.cursor }; })() : null,
      paneClasses: panes.map(p => String(p.className)),
      chatLabelText: chatLabel,
      chatHeaderAddButton: chatHeaderAdd !== null,
      newChatButtonsTotal: document.querySelectorAll('[aria-label="新建聊天"]').length,
      viewWriteCount: view.length,
      viewValues: view.map(v => v.value),
      viewSpanMs: view.length > 1 ? Math.round((view[view.length - 1].t - view[0].t) * 10) / 10 : 0,
      viewStacks: view.filter(v => v.stack).map(v => v.stack.split('\\n').slice(0, 8).join('\\n')),
      bodyTextHead: document.body.innerText.slice(0, 400),
      navType: performance.getEntriesByType('navigation').map(n => n.type),
      bootFailed: /失败|Something went wrong|页面出错/.test(document.body.innerText),
    };
  })()`);

  console.log('=== a + f ===');
  console.log(JSON.stringify(out, null, 1));
  console.log('gotRows =', gotRows);
  const errs = app.consoleErrors();
  console.log(`=== CONSOLE ERRORS (${errs.length}) ===`);
  for (const e of errs) console.log(`+${e.at}ms [${e.kind}] ${e.text}`);
  await app.screenshot('.scratch/accept3-boot.png');
  console.log('screenshot .scratch/accept3-boot.png');
} finally {
  await app.close();
}
