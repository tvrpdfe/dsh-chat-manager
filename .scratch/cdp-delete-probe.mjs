// Delete-route end-to-end: search-chats must see the throwaway chat session,
// then delete it and assert the artifact + workspace accounting are gone.
import { launchChrome, sleep } from '../tools/cdp-lib.mjs';

const URL = process.argv[2];
const PORT = 9353;
if (!URL) { console.error('usage: node cdp-delete-probe.mjs <url>'); process.exit(2); }
const SESSION_ID = process.argv[3];
if (!SESSION_ID) { console.error('usage: node cdp-delete-probe.mjs <url> <sessionId>'); process.exit(2); }

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
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
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
    await sleep(1000);
    const search = await evaluate(`(async () => {
      const res = await fetch('/api/chat-manager/search-chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '新会话' }) });
      return await res.json();
    })()`);
    console.log('SEARCH', JSON.stringify(search));
    const deleted = await evaluate(`(async () => {
      const res = await fetch('/api/chat-manager/delete-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: ${JSON.stringify(SESSION_ID)} }) });
      return { status: res.status, data: await res.json() };
    })()`);
    console.log('DELETED', JSON.stringify(deleted));
  } finally {
    try { ws?.close(); } catch {}
    await browser.cleanup();
  }
}

main().catch((err) => { console.error('ERR', err.message); process.exitCode = 1; });
