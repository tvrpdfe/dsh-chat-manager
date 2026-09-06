// Boot probe: open the target URL in headless Chrome, collect console output,
// wait for quiescence, and dump page state (boot page vs mounted app).
// Self-contained CDP session so runtime events can be captured verbatim.
import { launchChrome, sleep } from '../tools/cdp-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node cdp-boot-probe.mjs <url>'); process.exit(2); }
const PORT = 9345;

function openWebSocket(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('ws connect timeout')); }, timeoutMs);
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
    if (!page) throw new Error(browser.error ? `chrome failed: ${browser.error.message}` : 'no page target');
    ws = await openWebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const consoleMsgs = [];
    const events = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const p = msg.params;
        events.push(`console.${p.type}: ` + (p.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 600));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        events.push('EXCEPTION: ' + ((d.exception?.description ?? d.text) || '').slice(0, 1200));
      } else if (msg.method === 'Log.entryAdded') {
        events.push(`log.${msg.params.entry.level}: ${(msg.params.entry.text ?? '').slice(0, 600)}`);
      }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true });
      return res.result?.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Log.enable');
    await send('Page.navigate', { url: URL });

    let state = {};
    for (let i = 0; i < 120; i += 1) {
      await sleep(300);
      state = await evaluate(`(() => {
        const q = (s) => document.querySelector(s);
        const has = (s) => q(s) ? 'yes' : 'no';
        return {
          ready: document.readyState,
          bodyText: (document.body?.innerText ?? '').slice(0, 500),
          bootPage: has('.bootPage, [class*=boot]'),
          fail: has('[class*=fail]'),
          sidebar: has('.qDHVXG_pane, [class*=sidebar]'),
          chatScene: document.body.innerText.includes('聊天') || document.body.innerText.includes('Chats'),
          bodyLen: document.body?.innerHTML.length ?? 0,
        };
      })()`).catch(() => null);
      if (!state) continue;
      if (state.bodyLen > 3000 && (state.sidebar === 'yes' || state.fail || state.bootPage === 'no')) break;
    }
    console.log('=== STATE ===');
    console.log(JSON.stringify(state, null, 1));
    console.log('=== EVENTS (' + events.length + ') ===');
    for (const line of events.slice(0, 80)) console.log(line);
    if (events.length > 80) console.log(`... +${events.length - 80} more`);
  } finally {
    try { ws?.close(); } catch {}
    await browser.cleanup();
  }
}

main().catch((err) => {
  console.error('PROBE ERR', err.message);
  process.exitCode = 1;
});
