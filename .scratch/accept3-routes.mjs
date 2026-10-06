// Assertion h: every /api/chat-manager/* route from the authenticated page
// context, plus an unregistered control path. delete-session uses a
// NON-EXISTENT id (the host looks the id up in session persistence and no-ops).
// Usage: node .scratch/accept3-routes.mjs <url>
import { openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept3-routes.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9384);

const app = await openApp({ url: URL, port: PORT });
try {
  await app.navigate();
  await app.waitForApp({ attempts: 40, intervalMs: 400 });
  await sleep(1500);

  const out = await app.evaluate(`(async () => {
    const call = async (method, pathName, body) => {
      const init = { method };
      if (body !== undefined) { init.headers = { 'content-type': 'application/json' }; init.body = JSON.stringify(body); }
      try {
        const res = await fetch(pathName, init);
        const text = await res.text();
        let parsed = null; try { parsed = JSON.parse(text); } catch {}
        return { method, path: pathName, status: res.status, contentType: res.headers.get('content-type'), bodyHead: text.slice(0, 500), parsed };
      } catch (err) { return { method, path: pathName, transportError: String(err) }; }
    };
    return [
      await call('GET', '/api/chat-manager/state'),
      await call('POST', '/api/chat-manager/ensure-date-folder', {}),
      await call('POST', '/api/chat-manager/search-chats', { query: 'a' }),
      await call('POST', '/api/chat-manager/restore-session', { sessionId: 'session-does-not-exist-acceptance-probe' }),
      await call('POST', '/api/chat-manager/delete-session', { sessionId: 'session-does-not-exist-acceptance-probe' }),
      await call('GET', '/api/chat-manager/definitely-not-a-route'),
    ];
  })()`);
  for (const r of out) console.log(JSON.stringify(r));
  const errs = app.consoleErrors();
  console.log(`=== CONSOLE ERRORS (${errs.length}) ===`);
  for (const e of errs) console.log(`+${e.at}ms [${e.kind}] ${e.text}`);
} finally {
  await app.close();
}
