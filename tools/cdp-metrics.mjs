// Layout probe for the forked workspace browser (r3/r4 scrollbar regression).
// Usage: node cdp-metrics.mjs <path-to-html> <output-json-file>
import fs from 'node:fs';
import { launchChrome, connectPage, session, evaluate, sleep, runTool } from './cdp-lib.mjs';

const PORT = 9334;
const file = process.argv[2];
const outFile = process.argv[3];
const url = 'file:///' + file.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1:');

const browser = launchChrome({ port: PORT, windowSize: '340,740', captureStderr: true });

async function main() {
  const ws = await connectPage(PORT, { attempts: 60 });
  if (!ws) {
    throw new Error(browser.error ? `chrome failed to start: ${browser.error.message}` : 'no page target');
  }
  const cdp = session(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url });
  for (let i = 0; i < 60; i += 1) {
    if ((await evaluate(cdp, 'document.readyState')) === 'complete') break;
    await sleep(200);
  }
  await sleep(600);

  const href = await evaluate(cdp, 'location.href');
  if (String(href).startsWith('chrome-error://')) throw new Error(`页面加载失败: ${url}`);

  const expr = `(() => {
    const q = (sel) => document.querySelector(sel);
    const pick = (sel) => {
      const el = q(sel);
      if (!el) return { cls: sel, missing: true };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        cls: sel,
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        left: Math.round(r.left), right: Math.round(r.right),
        clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
        overflowY: cs.overflowY, overflow: cs.overflow
      };
    };
    const out = {
      paneWs: pick('.qDHVXG_pane'),
      listArea: pick('.qDHVXG_listArea'),
      listWs: pick('.qDHVXG_list'),
      paneChat: pick('.qDHVXG_chatList') ? pick('.qDHVXG_chatList') : null,
      listChat: pick('.qDHVXG_flatList')
    };
    const wsEl = q('.qDHVXG_list');
    const chatEl = q('.qDHVXG_flatList');
    out.verdict = {
      wsOverflow: wsEl ? wsEl.scrollHeight > wsEl.clientHeight : null,
      chatOverflow: chatEl ? chatEl.scrollHeight > chatEl.clientHeight : null,
      wsListRightMinusPaneRight: wsEl ? Math.round(wsEl.getBoundingClientRect().right) - Math.round(wsEl.parentElement.parentElement.parentElement.getBoundingClientRect().right) : null,
      chatListRightMinusPaneRight: chatEl ? Math.round(chatEl.getBoundingClientRect().right) - Math.round(chatEl.parentElement.parentElement.getBoundingClientRect().right) : null
    };
    return JSON.stringify({ ...out, readyState: document.readyState, href: location.href, bodyLen: document.body?.innerHTML.length ?? -1 }, null, 1);
  })()`;
  const res = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const text = res.result?.result?.value ?? JSON.stringify(res, null, 1);
  fs.writeFileSync(outFile, text);
  console.log(text);
  cdp.close();
}

runTool(browser, main, (e) => console.error('chrome stderr:', browser.stderr.slice(0, 2000)));
