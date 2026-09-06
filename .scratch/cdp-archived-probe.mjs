// Settings probe v3: click the archived-sessions tab and assert the page
// renders (empty state) without key leaks.
import { launchChrome, sleep } from '../tools/cdp-lib.mjs';

const URL = process.argv[2];
const PORT = 9349;
if (!URL) { console.error('usage: node cdp-archived-probe.mjs <url>'); process.exit(2); }

function openWebSocket(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('ws timeout')); }, timeoutMs);
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
  });
}

async function main() {
  const browser = launchChrome({ port: PORT, windowSize: '1600,1000', captureStderr: true });
  let ws = null;
  try {
    let page = null;
    for (let i = 0; i < 60 && !page; i += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        page = list.find((t) => t.type === 'page') ?? list[0];
      } catch {}
      if (!page) await sleep(250);
    }
    ws = await openWebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        events.push(`console.${msg.params.type}: ` + (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        events.push('EXCEPTION: ' + ((msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text) || '').slice(0, 500));
      }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res?.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
      return res?.result?.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 80; i += 1) {
      await sleep(300);
      const ready = await evaluate('document.readyState').catch(() => null);
      if (ready === 'complete') break;
    }
    await sleep(1200);
    await evaluate(`(() => { const b = [...document.querySelectorAll('button,[role=button],a')].find(e => (e.textContent ?? '').trim() === '设置'); b?.click(); })()`);
    await sleep(1000);
    const clickedTab = await evaluate(`(() => {
      const els = [...document.querySelectorAll('button, [role=tab], [role=button], span, div')];
      const t = els.find(e => (e.textContent ?? '').trim() === '已归档会话' && e.children.length <= 1);
      if (!t) return 'not-found';
      t.click();
      return 'ok';
    })()`);
    console.log('tab', clickedTab);
    await sleep(1500);
    const after = await evaluate(`(() => ({
      isEmpty: document.body.innerText.includes('暂无已归档会话'),
      hasUntitledNo: document.body.innerText.includes('未命名会话'),
      rawKeyLeak: /time\.(days|minutes|hours|months|years|now|ago)/.test(document.body.innerText),
      hasRestoreBtn: document.body.innerText.includes('恢复'),
      snippet: document.body.innerText.slice(-500),
    }))()`);
    console.log('ARCHIVED', JSON.stringify(after));
    console.log('EVENTS', JSON.stringify(events.slice(0, 20)));
  } finally {
    try { ws?.close(); } catch {}
    await browser.cleanup();
  }
}

main().catch((err) => { console.error('ERR', err.message); process.exitCode = 1; });
