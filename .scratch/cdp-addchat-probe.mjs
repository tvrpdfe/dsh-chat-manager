// Add-chat probe: click the chat pane's 新建聊天 button and assert a blank
// chat session lands in the list with the date-folder workspace.
import { launchChrome, sleep } from '../tools/cdp-lib.mjs';

const URL = process.argv[2];
const PORT = 9350;
if (!URL) { console.error('usage: node cdp-addchat-probe.mjs <url>'); process.exit(2); }

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
    const pre = await evaluate(`(() => ({
      chatEmpty: document.body.innerText.includes('暂无聊天'),
      addButtons: [...document.querySelectorAll('button')].filter(b => (b.getAttribute('aria-label') ?? '') === '新建聊天' || (b.textContent ?? '').trim() === '新建聊天').length,
    }))()`);
    console.log('PRE', JSON.stringify(pre));
    const clicked = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(el => (el.getAttribute('aria-label') ?? '') === '新建聊天');
      if (!b) return 'no-add-button';
      b.click();
      return 'ok';
    })()`);
    console.log('click', clicked);
    // wait for the chat session to appear (blank session listed as 新会话 in the chat pane)
    let post = null;
    for (let i = 0; i < 30; i += 1) {
      await sleep(500);
      post = await evaluate(`(() => ({
        stillEmpty: document.body.innerText.includes('暂无聊天'),
        sessionCount: document.querySelectorAll('[role=treeitem]').length,
        anyNewSession: document.body.innerText.split('\\n').includes('新会话'),
        snippet: document.body.innerText.slice(0, 160),
      }))()`);
      if (!post.stillEmpty) break;
    }
    console.log('POST', JSON.stringify(post));
    const state = await evaluate(`(async () => {
      const res = await fetch('/api/chat-manager/state');
      const data = await res.json();
      return { folders: data.folders, root: data.dshRoot, archivedCount: (data.archived ?? []).length };
    })()`);
    console.log('STATE', JSON.stringify(state));
    console.log('EVENTS', JSON.stringify(events.slice(0, 20)));
  } finally {
    try { ws?.close(); } catch {}
    await browser.cleanup();
  }
}

main().catch((err) => { console.error('ERR', err.message); process.exitCode = 1; });
