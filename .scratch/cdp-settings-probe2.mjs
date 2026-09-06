// Settings-page probe v2: locate the sidebar settings trigger and open the
// settings panel; assert the archived-sessions tab registered.
import { launchChrome, sleep } from '../tools/cdp-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node cdp-settings-probe2.mjs <url>'); process.exit(2); }
const PORT = 9348;

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
    await sleep(1500);
    const candidates = await evaluate(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, [role=button], a')) {
        const text = (el.textContent ?? '').trim();
        const aria = el.getAttribute('aria-label') ?? '';
        if (text === '设置' || /settings/i.test(aria) || text === 'Settings') {
          out.push({ tag: el.tagName, text, aria, cls: String(el.className).slice(0, 60) });
        }
      }
      return out;
    })()`);
    console.log('CANDIDATES', JSON.stringify(candidates));
    const clicked = await evaluate(`(() => {
      const els = [...document.querySelectorAll('button, [role=button], a')];
      const target = els.find(e => {
        const text = (e.textContent ?? '').trim();
        const aria = e.getAttribute('aria-label') ?? '';
        return (text === '设置' || /settings/i.test(aria));
      });
      if (!target) return 'none';
      target.click();
      return 'ok:' + target.tagName;
    })()`);
    console.log('click', clicked);
    await sleep(1400);
    const after = await evaluate(`(() => ({
      hasArchivedTab: document.body.innerText.includes('已归档会话'),
      hasArchivedPage: document.body.innerText.includes('暂无已归档会话') || document.body.innerText.includes('No archived sessions'),
      settingsOpen: document.body.innerText.includes('设置'),
      rawKeyLeak: /time\.(days|minutes|hours|months|years|now|ago)/.test(document.body.innerText),
      bodyText: document.body.innerText.slice(0, 600),
    }))()`);
    console.log('SETTINGS', JSON.stringify(after));
    console.log('EVENTS', JSON.stringify(events.slice(0, 20)));
  } finally {
    try { ws?.close(); } catch {}
    await browser.cleanup();
  }
}

main().catch((err) => { console.error('ERR', err.message); process.exitCode = 1; });
