// Probe v2: dismiss the onboarding consent (继续), then re-run the add-chat
// flow and assert the blank chat row appears in the chat pane.
import { launchChrome, sleep } from '../tools/cdp-lib.mjs';

const URL = process.argv[2];
const PORT = 9351;
if (!URL) { console.error('usage: node cdp-chat2.mjs <url>'); process.exit(2); }

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
    // Dismiss onboarding consent
    const consent = await evaluate(`(() => {
      const els = [...document.querySelectorAll('button, [role=button]')];
      const c = els.find(e => (e.textContent ?? '').trim() === '继续' || (e.textContent ?? '').includes('继续'));
      if (!c) return 'no-consent';
      c.click();
      return 'clicked';
    })()`);
    console.log('consent', consent);
    await sleep(2000);
    const before = await evaluate(`(() => ({
      chatEmpty: document.body.innerText.includes('暂无聊天'),
      wsEmpty: document.body.innerText.includes('暂无会话'),
      newSession: document.body.innerText.split('\\n').includes('新会话'),
      snippet: document.body.innerText.slice(0, 200),
    }))()`);
    console.log('BEFORE', JSON.stringify(before));
    const clicked = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(el => (el.getAttribute('aria-label') ?? '') === '新建聊天');
      if (!b) return 'no-add-button';
      b.click();
      return 'ok';
    })()`);
    console.log('click', clicked);
    let post = null;
    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      post = await evaluate(`(() => ({
        stillEmpty: document.body.innerText.includes('暂无聊天'),
        treeitems: document.querySelectorAll('[role=treeitem]').length,
        snippet: document.body.innerText.slice(0, 260),
      }))()`);
      if (!post.stillEmpty) break;
    }
    console.log('POST', JSON.stringify(post));
    console.log('EVENTS', JSON.stringify(events.slice(0, 30)));
  } finally {
    try { ws?.close(); } catch {}
    await browser.cleanup();
  }
}

main().catch((err) => { console.error('ERR', err.message); process.exitCode = 1; });
