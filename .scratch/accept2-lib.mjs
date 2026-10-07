// Shared harness for the round-2 acceptance probes: launch headless Chrome,
// open the instance URL, capture console/exception/log/network events, and
// expose evaluate + real-mouse helpers (CSS :hover needs genuine input events).
import { launchChrome, sleep } from '../tools/cdp-lib.mjs';
import fs from 'node:fs';

export { sleep };

export async function openApp({ url, port, width = 1600, height = 1000, instrument = null }) {
  const browser = launchChrome({ port, windowSize: `${width},${height}`, captureStderr: true });
  const events = [];
  let ws = null;
  let id = 0;
  const pending = new Map();
  try {
    let page = null;
    for (let i = 0; i < 60 && !page; i += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        page = list.find((t) => t.type === 'page') ?? list[0];
      } catch { /* debugger not up yet */ }
      if (!page) await sleep(250);
    }
    if (!page) throw new Error(browser.error ? `chrome failed: ${browser.error.message}` : 'no page target');
    ws = await new Promise((resolve, reject) => {
      const s = new WebSocket(page.webSocketDebuggerUrl);
      const timer = setTimeout(() => { try { s.close(); } catch {} reject(new Error('ws timeout')); }, 3000);
      s.onopen = () => { clearTimeout(timer); resolve(s); };
      s.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
    });
    const t0 = Date.now();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg);
        return;
      }
      const at = Date.now() - t0;
      if (msg.method === 'Runtime.consoleAPICalled') {
        const p = msg.params;
        events.push({ at, kind: `console.${p.type}`, text: (p.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 1600) });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        events.push({ at, kind: 'exception', text: ((d.exception?.description ?? d.text) || '').slice(0, 2500) });
      } else if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry;
        events.push({ at, kind: `log.${e.level}`, text: (e.text ?? '').slice(0, 1600) });
      } else if (msg.method === 'Network.responseReceived') {
        const r = msg.params.response;
        events.push({ at, kind: 'net', text: `${r.status} ${r.url.slice(0, 160)}` });
      }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      try { ws.send(JSON.stringify({ id: mid, method, params })); } catch (err) { pending.delete(mid); reject(err); }
    });
    const call = async (method, params) => (await send(method, params)).result ?? {};
    const evaluate = async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    };

    await call('Runtime.enable');
    await call('Page.enable');
    await call('Log.enable');
    await call('Network.enable');
    if (instrument !== null) await call('Page.addScriptToEvaluateOnNewDocument', { source: instrument });

    const api = {
      browser,
      events,
      call,
      evaluate,
      /** Reload the same URL as a genuine top-level navigation. */
      async navigate(target = url) {
        await call('Page.navigate', { url: target });
        for (let i = 0; i < 100; i += 1) {
          await sleep(300);
          const ready = await evaluate('document.readyState').catch(() => null);
          if (ready === 'complete') break;
        }
      },
      /** Poll a boolean page expression until it is true. */
      async waitFor(expression, { attempts = 60, intervalMs = 300 } = {}) {
        for (let i = 0; i < attempts; i += 1) {
          const ok = await evaluate(expression).catch(() => false);
          if (ok === true) return true;
          await sleep(intervalMs);
        }
        return false;
      },
      async waitForApp({ attempts = 90, intervalMs = 2000 } = {}) {
        for (let i = 0; i < attempts; i += 1) {
          await sleep(intervalMs);
          const n = await evaluate(`document.querySelectorAll('[data-row-key]').length`).catch(() => 0);
          // This gate proves only that the shell painted and holds Session rows; the
          // substantive checks in each probe assert the specific rows (or their
          // absence) afterwards. It must stay weaker than any real page: a proven-live
          // instance rendered 8 rows with only 187 characters of visible text, so a
          // fixed 200-character floor once reported "never rendered" on a page that was
          // plainly there — do not reintroduce a character-count floor.
          const len = await evaluate(`document.body ? document.body.innerText.trim().length : 0`).catch(() => 0);
          if (n > 0 && len > 0) return true;
        }
        return false;
      },
      async rect(selector, index = 0) {
        return evaluate(`(() => {
          const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
        })()`);
      },
      async mouseMove(x, y) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      },
      async mouseClick(x, y) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
        await sleep(40);
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      },
      /** Move the real mouse onto the nth match of a selector. */
      async hover(selector, index = 0) {
        const r = await api.rect(selector, index);
        if (r === null) return null;
        await api.mouseMove(r.x, r.y);
        return r;
      },
      /** Real-mouse click the nth match of a selector. */
      async clickSel(selector, index = 0) {
        const r = await api.rect(selector, index);
        if (r === null) return null;
        await api.mouseClick(r.x, r.y);
        return r;
      },
      async screenshot(path) {
        const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        if (shot.data) { fs.writeFileSync(path, Buffer.from(shot.data, 'base64')); return path; }
        return null;
      },
      consoleErrors() {
        return events.filter(e => e.kind === 'console.error' || e.kind === 'exception');
      },
      async close() {
        try { ws?.close(); } catch {}
        await browser.cleanup();
      },
    };
    return api;
  } catch (err) {
    try { ws?.close(); } catch {}
    await browser.cleanup().catch(() => {});
    throw err;
  }
}

/** JSON snapshot of a file path, for before/after semantic comparison. */
export function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return null; }
}

export function printEvents(events, filter = null) {
  const rows = filter === null ? events : events.filter(filter);
  console.log(`=== EVENTS (${rows.length}) ===`);
  for (const e of rows) console.log(`+${e.at}ms [${e.kind}] ${e.text}`);
}
