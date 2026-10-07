// Assertion h: every /api/chat-manager/* route from the authenticated page
// context, plus an unregistered control path. delete-session uses a
// NON-EXISTENT id (the host looks the id up in session persistence and no-ops).
// Usage: node .scratch/accept3-routes.mjs <url>
import { check, finish, openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept3-routes.mjs <url>'); process.exit(2); }
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9384);

const app = await openApp({ url: URL, port: PORT });
try {
  await app.navigate();
  const gotRows = await app.waitForApp({ attempts: 90, intervalMs: 2000 });
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

  // ---- assertion h: every plugin route answers, from the page's own origin ----
  const byKey = new Map(out.map(r => [`${r.method} ${r.path}`, r]));
  const ok200 = (r) => r !== undefined && r.status === 200 && r.transportError === undefined;
  check('the page painted before the route checks', gotRows === true, `gotRows=${gotRows}`);

  const state = byKey.get('GET /api/chat-manager/state');
  check('GET state answers 200 with the chat root', ok200(state) && typeof state.parsed?.dshRoot === 'string' && state.parsed.dshRoot.length > 0,
    `status=${state?.status} dshRoot=${JSON.stringify(state?.parsed?.dshRoot)}`);

  const ensure = byKey.get('POST /api/chat-manager/ensure-date-folder');
  check('POST ensure-date-folder answers 200 with the workspace and the dated folder', ok200(ensure) && typeof ensure.parsed?.workspaceId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(ensure.parsed?.dateFolder).split(/[\\/]/).pop() ?? ''),
    `status=${ensure?.status} parsed=${JSON.stringify(ensure?.parsed)?.slice(0, 160)}`);

  const search = byKey.get('POST /api/chat-manager/search-chats');
  check('POST search-chats answers 200 with an item list', ok200(search) && Array.isArray(search.parsed?.items),
    `status=${search?.status} items=${Array.isArray(search?.parsed?.items) ? search.parsed.items.length : 'n/a'}`);

  const restore = byKey.get('POST /api/chat-manager/restore-session');
  check('POST restore-session answers 200 for an id that is not archived', ok200(restore) && restore.parsed?.ok === true,
    `status=${restore?.status} body=${JSON.stringify(restore?.parsed)}`);

  const del = byKey.get('POST /api/chat-manager/delete-session');
  check('POST delete-session answers 200 for a ghost id the Host does not know', ok200(del) && del.parsed?.ok === true,
    `status=${del?.status} body=${JSON.stringify(del?.parsed)}`);

  const unknown = byKey.get('GET /api/chat-manager/definitely-not-a-route');
  check('an unregistered path is not served as a plugin route', unknown !== undefined && unknown.transportError === undefined && unknown.status !== 200,
    `status=${unknown?.status} contentType=${unknown?.contentType}`);

  check('no console error and no exception', errs.length === 0, `${errs.length} event(s)`);
  finish('accept3-routes');
} finally {
  await app.close();
}
