// Route smoke test against the isolated test instance (token from argv).
const base = process.argv[2];
const rpc = async (pathName, method, body) => {
  const res = await fetch(base + pathName, {
    method,
    headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
};
const state = await rpc('/api/chat-manager/state', 'GET');
console.log('state', state.status, JSON.stringify(state.data).slice(0, 400));
const ensure = await rpc('/api/chat-manager/ensure-date-folder', 'POST', {});
console.log('ensure', ensure.status, JSON.stringify(ensure.data));
const search = await rpc('/api/chat-manager/search-chats', 'POST', { query: 'zzz' });
console.log('search', search.status, JSON.stringify(search.data));
const del = await rpc('/api/chat-manager/delete-session', 'POST', {});
console.log('delete-empty', del.status, JSON.stringify(del.data));
const restore = await rpc('/api/chat-manager/restore-session', 'POST', {});
console.log('restore-empty', restore.status, JSON.stringify(restore.data));
