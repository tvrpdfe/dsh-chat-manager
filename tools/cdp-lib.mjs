// Shared headless-Chrome CDP plumbing for the tools in this directory:
// launch → wait for a page target → JSON-RPC session → cleanup.
// Chrome binary honours $DSH_CHROME, defaulting to the standard Windows path.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHROME = process.env.DSH_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Launch headless Chrome with a fresh throwaway profile.
 * @param options.port - CDP debugging port.
 * @param options.windowSize - optional "WxH" string for --window-size.
 * @param options.captureStderr - pipe stderr into the returned handle.
 * @returns { chrome, profileDir, stderr, error, cleanup }
 *   cleanup() removes the profile directory after the process exits and
 *   REJECTS if the directory is still locked after the retry budget (a
 *   force-killed process may briefly hold file locks on Windows).
 *   error holds the spawn failure, if any (e.g. an invalid $DSH_CHROME).
 */
export function launchChrome({ port, windowSize, captureStderr = false } = {}) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cdp-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  ];
  if (windowSize) args.push(`--window-size=${windowSize}`);
  args.push('about:blank');
  const chrome = spawn(CHROME, args, { stdio: captureStderr ? ['ignore', 'ignore', 'pipe'] : 'ignore' });
  let stderrBuf = '';
  let spawnError = null;
  const stderrStream = captureStderr ? chrome.stderr : null;
  if (stderrStream) stderrStream.on('data', (d) => { stderrBuf += d.toString(); });
  chrome.on('error', (err) => { spawnError = err; });
  /** Resolves when the stderr pipe closes (all write-end holders exited) or the timeout hits. */
  const waitForStderrClose = (timeoutMs) => new Promise((resolve) => {
    if (stderrStream === null || stderrStream.destroyed || stderrStream.closed) { resolve(); return; }
    const timer = setTimeout(resolve, timeoutMs);
    stderrStream.once('close', () => { clearTimeout(timer); resolve(); });
  });
  return {
    chrome,
    profileDir,
    get stderr() { return stderrBuf; },
    get error() { return spawnError; },
    /** Kill, wait for exit (2s, then SIGKILL + 500ms grace), wait for the
     *  stderr pipe to close (all child processes holding it exited), then
     *  remove the profile with short retries. Rejects when the profile
     *  directory is still locked after the retry budget. */
    cleanup() {
      return new Promise((resolve, reject) => {
        const removeProfile = (left) => {
          try {
            fs.rmSync(profileDir, { recursive: true, force: true });
            resolve();
          } catch {
            if (left <= 0) reject(new Error(`profile dir still locked, giving up: ${profileDir}`));
            else setTimeout(() => removeProfile(left - 1), 200);
          }
        };
        const finish = () => {
          waitForStderrClose(3000).then(() => removeProfile(10));
        };
        if (spawnError !== null || chrome.exitCode !== null || chrome.signalCode !== null) {
          finish();
          return;
        }
        let settled = false;
        const finishOnce = () => { if (!settled) { settled = true; clearTimeout(forceTimer); finish(); } };
        const forceTimer = setTimeout(() => {
          try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
          setTimeout(() => { if (!settled) { settled = true; finish(); } }, 500);
        }, 2000);
        chrome.once('exit', finishOnce);
        try { chrome.kill(); } catch { clearTimeout(forceTimer); finishOnce(); }
      });
    },
  };
}

/**
 * Wait for the first page target (falling back to the first target, matching
 * the legacy tools) and open its CDP websocket.
 * @returns a connected WebSocket, or null when the retry budget runs out.
 *   Transient websocket failures count as retries — this function never
 *   rejects on its own.
 */
export async function connectPage(port, { attempts = 40, intervalMs = 250, connectTimeoutMs = 3000 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page') ?? list[0];
      if (page?.webSocketDebuggerUrl) {
        try {
          return await openWebSocket(page.webSocketDebuggerUrl, connectTimeoutMs);
        } catch { /* transient ws failure: retry */ }
      }
    } catch { /* debugger not up yet */ }
    await sleep(intervalMs);
  }
  return null;
}

function openWebSocket(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* not open */ }
      reject(new Error('cdp websocket connect timeout'));
    }, timeoutMs);
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('cdp websocket error')); };
  });
}

/** Wrap a websocket into an id-mapped CDP JSON-RPC session. */
export function session(ws) {
  let id = 0;
  const pending = new Map();
  const rejectAll = (err) => {
    for (const [mid, entry] of pending) {
      entry.reject(err);
      pending.delete(mid);
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message ?? 'cdp command failed'));
    else entry.resolve(msg);
  };
  ws.onclose = () => rejectAll(new Error('cdp session closed'));
  ws.onerror = () => rejectAll(new Error('cdp session error'));
  return {
    /** Send one command; resolves with the full CDP response, rejects on CDP error or teardown. */
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, { resolve, reject });
        try {
          ws.send(JSON.stringify({ id: mid, method, params }));
        } catch (err) {
          pending.delete(mid);
          reject(err);
        }
      });
    },
    close() {
      try { ws.close(); } catch { /* already closed */ }
    },
  };
}

/** Evaluate an expression in the page and return its value (undefined on failure). */
export async function evaluate(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  return res.result && res.result.result ? res.result.result.value : undefined;
}

/** Run a tool body with a browser handle: work errors and cleanup errors both
 *  set exitCode 1 and reach onError. A work error takes precedence over a
 *  cleanup error (the real failure is never masked; the cleanup failure is
 *  still logged). Cleanup always runs. */
export async function runTool(browser, work, onError) {
  const report = (err) => {
    console.error('ERR', err.message);
    if (onError) onError(err);
    process.exitCode = 1;
  };
  let workError = null;
  try {
    await work();
  } catch (err) {
    workError = err;
  }
  let cleanupError = null;
  try {
    await browser.cleanup();
  } catch (err) {
    cleanupError = err;
  }
  if (workError) {
    if (cleanupError) console.error('cleanup also failed:', cleanupError.message);
    report(workError);
  } else if (cleanupError) {
    report(cleanupError);
  }
}
