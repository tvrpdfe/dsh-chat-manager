/**
 * Route-level tests for `/api/chat-manager/delete-session`.
 *
 * Why this exists: the delete route's two accounting bugs (a ghost id skipped
 * because `workspace.sessionIds` filters it, a chat registry entry another Host
 * registered after startup left behind) and its two Host-API rules (the public
 * `snapshot.location` before the private `locate`; a 409 instead of deleting a
 * session whose work still runs) are only observable through the route itself.
 * Driving the built bundle with a fake ctx exercises the same code the Host
 * loads without starting one: `test/delete-plan.test.mjs` pins the rules, this
 * file pins the wiring.
 *
 * The chat root is a throwaway temp directory named through
 * `DSH_CHAT_MANAGER_ROOT`, so nothing here reads or writes the real home.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../lib/index.js'

/** A fake `res` that records the status and JSON body the route answered. */
function fakeRes() {
  const out = { status: 0, body: undefined }
  return {
    writeHead(status) { out.status = status },
    end(text) { out.body = text === undefined ? undefined : JSON.parse(text) },
    out,
  }
}

/** A fake `req` whose async iteration yields one JSON body. */
function fakeReq(body) {
  return {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body ?? {}))
    },
  }
}

/** One snapshot as the persistence service reports it. */
function snapshotOf(sessionId, artifactPath) {
  const snapshot = { header: { id: sessionId, cwd: 'C:/workspace' }, revision: 1 }
  if (artifactPath !== undefined) snapshot.location = { kind: 'jsonl', path: artifactPath }
  return snapshot
}

/** One workspace entity with a spy detach and an optionally filtered id list. */
function workspaceOf(id, sessionIds, calls) {
  return {
    id,
    title: id,
    path: `C:/workspace/${id}`,
    sessionIds,
    detachSession: async (sessionId) => { calls.detach.push(sessionId) },
  }
}

/**
 * Boot the plugin onto a fake ctx over one throwaway chat root.
 * @param options - the services the delete route reads, per test.
 * @returns the delete handler, the recorded calls, and a restore hook.
 */
function boot(options = {}) {
  const root = options.root
  const routes = new Map()
  const calls = { detach: [], unpin: [], unarchive: [], parallel: [] }
  const workspaces = options.workspaces ?? []
  const ctx = {
    get: () => options.live,
    webServer: { register: (route) => { routes.set(route.path, route) } },
    effect: (fn) => { fn(); return () => {} },
    on: () => () => {},
    systemPrompt: { section: () => ({}) },
    workspaceRegistry: {
      list: () => workspaces,
      resolveByPath: async () => undefined,
      create: async () => { throw new Error('unused') },
      unarchiveSession: async (sessionId) => { calls.unarchive.push(sessionId) },
      unpinSession: async (sessionId) => { calls.unpin.push(sessionId) },
    },
    storageDomain: { get: () => undefined },
    sessionPersistence: {
      list: async () => options.snapshots ?? [],
      stat: async (id) => options.stat?.(id),
      flush: options.flush ?? (async () => {}),
      ...(options.locate === null ? {} : { locate: options.locate ?? (() => undefined) }),
    },
    sessionQuery: { listSessions: async () => [], readTitleSnapshots: async () => [], searchSessions: async () => ({}) },
    llm: { stream: async function* () {} },
    agentDefaultModel: { currentSelection: () => null },
  }
  if (options.waterfall !== undefined) ctx.waterfall = options.waterfall
  if (options.parallel !== undefined) ctx.parallel = options.parallel
  const previous = process.env.DSH_CHAT_MANAGER_ROOT
  process.env.DSH_CHAT_MANAGER_ROOT = root
  apply(ctx)
  const route = routes.get('/api/chat-manager/delete-session')
  assert.ok(route !== undefined, 'the delete route must be registered')
  return {
    handler: route.handler,
    calls,
    restore: () => {
      if (previous === undefined) delete process.env.DSH_CHAT_MANAGER_ROOT
      else process.env.DSH_CHAT_MANAGER_ROOT = previous
    },
  }
}

/** A throwaway chat root plus its cleanup, per test. */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cm-delete-'))
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }) })
  return root
}

/** Create one session artifact directory (`<root>/logs/<sid>/session.v4.jsonl.zstd`). */
function makeArtifact(root, sessionId) {
  const dir = path.join(root, 'logs', sessionId)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'session.v4.jsonl.zstd')
  fs.writeFileSync(file, 'log-bytes')
  return { dir, file }
}

/** Write one date folder's chat registry (`indent` lets a test spot a rewrite by bytes). */
function writeRegistry(root, dateFolder, sessions, indent = 2) {
  const dir = path.join(root, dateFolder)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, '.dsh-chat.json')
  fs.writeFileSync(file, JSON.stringify({ sessions }, null, indent), 'utf8')
  return file
}

test('running work refuses an unconfirmed delete and touches nothing', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-1111')
  const h = boot({ root, snapshots: [snapshotOf('session-1111', file)], waterfall: async () => [{ kind: 'turn' }] })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-1111' }), res)

  assert.equal(res.out.status, 409)
  assert.equal(res.out.body.active, true)
  assert.deepEqual(res.out.body.activity, [{ kind: 'turn' }])
  assert.match(res.out.body.error, /running work/)
  assert.equal(fs.existsSync(dir), true, 'a refused delete must keep the log')
  assert.deepEqual(h.calls.detach, [])
  assert.deepEqual(h.calls.unpin, [])
  assert.deepEqual(h.calls.unarchive, [])
})

test('a confirmed delete stops the work first, then removes the log and the accounting', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-2222')
  const calls = { detach: [], unpin: [], unarchive: [], parallel: [] }
  let asked = 0
  const h = boot({
    root,
    workspaces: [workspaceOf('ws-1', ['session-2222'], calls)],
    snapshots: [snapshotOf('session-2222', file)],
    // The first ask reports the running turn; the post-stop re-asks answer
    // empty so the bounded settle wait exits immediately.
    waterfall: async () => { asked += 1; return asked === 1 ? [{ kind: 'turn' }] : [] },
    parallel: async (name, request) => { calls.parallel.push({ name, request }) },
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-2222', stopActivity: true }), res)

  assert.equal(res.out.status, 200)
  assert.deepEqual(res.out.body, { ok: true })
  assert.deepEqual(calls.parallel, [{ name: 'workspace/session-stop', request: { sessionId: 'session-2222' } }])
  assert.equal(fs.existsSync(dir), false, 'the confirmed delete must remove the log directory')
  assert.deepEqual(calls.detach, ['session-2222'])
  assert.deepEqual(h.calls.unpin, ['session-2222'])
  assert.deepEqual(h.calls.unarchive, ['session-2222'])
})

test('a stop that fails leaves the log and the ledger alone (fail closed)', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-3333')
  const h = boot({
    root,
    snapshots: [snapshotOf('session-3333', file)],
    waterfall: async () => [{ kind: 'job', items: [{ id: 'job-1' }] }],
    parallel: async () => { throw new AggregateError([new Error('kill refused')], 'stop failed') },
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-3333', stopActivity: true }), res)

  assert.equal(res.out.status, 500)
  assert.match(res.out.body.error, /failed to stop the session's running work/)
  assert.equal(fs.existsSync(dir), true, 'the log must survive a failed stop')
  assert.deepEqual(h.calls.detach, [])
  assert.deepEqual(h.calls.unpin, [])
  assert.deepEqual(h.calls.unarchive, [])
})

test('a ghost id passes the same activity gate, and deleting it still detaches the filtered workspace slot', async (t) => {
  const root = fixture(t)
  let asked = 0
  const calls = { detach: [], unpin: [], unarchive: [], parallel: [] }
  const h = boot({
    root,
    workspaces: [workspaceOf('ws-1', [], calls)],
    snapshots: [],
    // A ghost session can still own a schedule; the gate does not depend on a log.
    waterfall: async () => { asked += 1; return asked === 1 ? [{ kind: 'schedule' }] : [] },
    parallel: async () => {},
  })
  t.after(h.restore)

  const refused = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-4444' }), refused)
  assert.equal(refused.out.status, 409)

  const confirmed = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-4444', stopActivity: true }), confirmed)
  assert.equal(confirmed.out.status, 200)
  // `sessionIds` is empty because the entity filtered the ghost id; the detach
  // must still happen or `workspace.json` keeps a dangling id forever.
  assert.deepEqual(calls.detach, ['session-4444'])
})

test('the public snapshot location is used without the private hook', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-5555')
  const h = boot({ root, snapshots: [snapshotOf('session-5555', file)], locate: null })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-5555' }), res)
  assert.equal(res.out.status, 200)
  assert.equal(fs.existsSync(dir), false)
})

test('the private hook is the fallback for a snapshot without a location', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-6666')
  const h = boot({
    root,
    snapshots: [snapshotOf('session-6666')],
    locate: () => ({ kind: 'jsonl', path: file }),
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-6666' }), res)
  assert.equal(res.out.status, 200)
  assert.equal(fs.existsSync(dir), false)
})

test('a Host with neither source fails with the build-specific message', async (t) => {
  const root = fixture(t)
  const h = boot({ root, snapshots: [snapshotOf('session-7777')], locate: null })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-7777' }), res)
  assert.equal(res.out.status, 500)
  assert.match(res.out.body.error, /neither snapshot\.location nor/)
})

test('a hook that names no path fails with the session-specific message', async (t) => {
  const root = fixture(t)
  const h = boot({ root, snapshots: [snapshotOf('session-8888')], locate: () => ({ path: '' }) })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-8888' }), res)
  assert.equal(res.out.status, 500)
  assert.match(res.out.body.error, /named no session log/)
})

test('a chat registered by another Host after startup is cleaned from that folder too', async (t) => {
  const root = fixture(t)
  const h = boot({ root, snapshots: [] })
  t.after(h.restore)
  // Written AFTER `apply`, so this process's boot scan never saw it: the exact
  // cross-Host state the old map-only cleanup left behind.
  const file = writeRegistry(root, '2030-01-01', {
    'session-9999': { slug: 'late-chat', folder: 'C:/chat/late-chat' },
    'session-keep': { slug: 'keep-chat', folder: 'C:/chat/keep-chat' },
  })

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-9999' }), res)

  assert.equal(res.out.status, 200)
  const sessions = JSON.parse(fs.readFileSync(file, 'utf8')).sessions
  assert.equal('session-9999' in sessions, false)
  assert.deepEqual(Object.keys(sessions), ['session-keep'])
})

test('a corrupt registry is warned about and left byte-for-byte alone', async (t) => {
  const root = fixture(t)
  const h = boot({ root, snapshots: [] })
  t.after(h.restore)
  const dir = path.join(root, '2030-01-02')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, '.dsh-chat.json')
  const bytes = '{ this is not json'
  fs.writeFileSync(file, bytes, 'utf8')

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-aaaa' }), res)

  assert.equal(res.out.status, 200)
  assert.equal(fs.readFileSync(file, 'utf8'), bytes, 'a delete is not the place to rebuild a shared registry')
})

test('a registry that never named the session is not rewritten', async (t) => {
  const root = fixture(t)
  const h = boot({ root, snapshots: [] })
  t.after(h.restore)
  const file = writeRegistry(root, '2030-01-03', { 'session-keep': { slug: 'keep', folder: 'C:/chat/keep' } })
  const before = fs.readFileSync(file, 'utf8')

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-bbbb' }), res)

  assert.equal(res.out.status, 200)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})

test('a key inherited from Object.prototype does not look like a registered chat', async (t) => {
  const root = fixture(t)
  const h = boot({ root, snapshots: [] })
  t.after(h.restore)
  const file = writeRegistry(root, '2030-01-04', { 'session-keep': { slug: 'keep', folder: 'C:/chat/keep' } }, 4)
  const before = fs.readFileSync(file, 'utf8')
  // `'constructor' in sessions` is true for every parsed registry, so an `in`
  // check treated this unregistered id as present and rewrote the file. The
  // stamp is pinned to a past instant: only a real write moves it. Four-space
  // formatting differs from `writeRegistryAtomically`, so the bytes catch the
  // rewrite even if a future writer starts skipping no-op writes.
  const pinned = new Date('2020-01-01T00:00:00Z')
  fs.utimesSync(file, pinned, pinned)
  const stamp = fs.statSync(file).mtimeMs

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'constructor' }), res)

  assert.equal(res.out.status, 200)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
  assert.equal(fs.statSync(file).mtimeMs, stamp, 'an inherited key must not trigger a registry write')
})

test('only a literal true confirms the stop; a truthy string still refuses', async (t) => {
  const root = fixture(t)
  const { file } = makeArtifact(root, 'session-cccc')
  const h = boot({
    root,
    snapshots: [snapshotOf('session-cccc', file)],
    waterfall: async () => [{ kind: 'turn' }],
    parallel: async () => { throw new Error('a string must not stop work') },
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-cccc', stopActivity: 'true' }), res)
  assert.equal(res.out.status, 409)
})

test('the private hook is called on the persistence service, not as a bare function', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-dddd')
  const h = boot({
    root,
    snapshots: [snapshotOf('session-dddd')],
    // The JSONL backend's hook reads its own state off `this`; extracting it
    // into a local (`const locate = …`) called it with no receiver and the
    // route answered "Cannot read properties of undefined (reading 'root')".
    locate: function () {
      if (this === undefined || this === null) throw new Error('the hook lost its receiver')
      return { path: file }
    },
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-dddd' }), res)
  assert.equal(res.out.status, 200)
  assert.equal(fs.existsSync(dir), false)
})

/** Collect `console.warn` lines until the returned restore runs. */
function captureWarnings(t) {
  const lines = []
  const original = console.warn
  console.warn = (...args) => { lines.push(args.map(String).join(' ')) }
  t.after(() => { console.warn = original })
  return lines
}

/** One workspace whose detach runs `sideEffect` at the accounting step. */
function workspaceThatDetaches(id, sessionIds, sideEffect) {
  return {
    id,
    title: id,
    path: `C:/workspace/${id}`,
    sessionIds,
    detachSession: async () => { sideEffect() },
  }
}

test('a chat root that cannot be listed is warned about and the delete still succeeds', async (t) => {
  const root = fixture(t)
  const rootFile = path.join(root, 'chat-root-is-a-file')
  fs.writeFileSync(rootFile, 'not a directory', 'utf8')
  const warnings = captureWarnings(t)
  const h = boot({ root: rootFile, snapshots: [] })
  t.after(h.restore)
  // The boot scan hits the same failure; only the delete's own warning is asserted.
  warnings.length = 0

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-file-root' }), res)

  assert.equal(res.out.status, 200)
  assert.equal(
    warnings.filter(line => line.includes('chat root could not be listed')).length,
    1,
    'a listing failure must be diagnosable, not an empty 200 with no log',
  )
})

test('a failed activity re-ask after a confirmed stop does not turn the delete into a 500', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-stop-settles')
  const warnings = captureWarnings(t)
  let asked = 0
  const h = boot({
    root,
    snapshots: [snapshotOf('session-stop-settles', file)],
    // The stop works; the provider that answers the settle re-ask dies.
    waterfall: async () => {
      asked += 1
      if (asked === 1) return [{ kind: 'turn' }]
      throw new Error('activity provider went away')
    },
    parallel: async () => {},
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-stop-settles', stopActivity: true }), res)

  assert.equal(res.out.status, 200, 'the stop already landed; a failed re-ask is not a failed delete')
  assert.equal(fs.existsSync(dir), false)
  assert.deepEqual(h.calls.unpin, ['session-stop-settles'])
  assert.deepEqual(h.calls.unarchive, ['session-stop-settles'])
  assert.equal(warnings.some(line => line.includes('re-asking activity')), true)
})

test('an activity gate that fails before any stop still fails the delete', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-gate-down')
  const h = boot({
    root,
    snapshots: [snapshotOf('session-gate-down', file)],
    // No answer means no way to know whether work runs: the route must not guess.
    waterfall: async () => { throw new Error('activity provider is down') },
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-gate-down' }), res)

  assert.equal(res.out.status, 500)
  assert.match(res.out.body.error, /activity provider is down/)
  assert.equal(fs.existsSync(dir), true, 'an unanswerable gate must leave the log alone')
  assert.deepEqual(h.calls.detach, [])
  assert.deepEqual(h.calls.unpin, [])
  assert.deepEqual(h.calls.unarchive, [])
})

test('the route stops, flushes, removes the log and only then touches the accounting', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-order')
  const seq = []
  let dirAtFlush = null
  let dirAtDetach = null
  let asked = 0
  let flushes = 0
  const h = boot({
    root,
    workspaces: [workspaceThatDetaches('ws-order', ['session-order'], () => {
      seq.push('detach')
      dirAtDetach = fs.existsSync(dir)
    })],
    snapshots: [snapshotOf('session-order', file)],
    waterfall: async () => { asked += 1; return asked === 1 ? [{ kind: 'turn' }] : [] },
    parallel: async () => { seq.push('stop') },
    flush: async () => {
      flushes += 1
      seq.push('flush')
      dirAtFlush = fs.existsSync(dir)
    },
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-order', stopActivity: true }), res)

  assert.equal(res.out.status, 200)
  assert.deepEqual(seq, ['stop', 'flush', 'detach'], 'stop → flush → rm → accounting, in that order')
  assert.equal(dirAtFlush, true, 'the durability barrier must run while the log still exists')
  assert.equal(dirAtDetach, false, 'the accounting must run after the log is gone')
  assert.equal(flushes, 1)
})

test('a registry that turns corrupt after the planning read is left byte-for-byte alone', async (t) => {
  const root = fixture(t)
  const sessionId = 'session-tocorrupt'
  const regFile = writeRegistry(root, '2030-02-01', { [sessionId]: { slug: 'turns-bad', folder: 'C:/chat/turns-bad' } })
  const broken = '{ broken after the planning read'
  const h = boot({
    root,
    snapshots: [],
    // The plan reads the registry before this runs, so the corruption lands
    // between the planning read and `editRegistry`'s own re-read: the TOCTOU
    // window `onCorrupt: 'leave'` exists for.
    workspaces: [workspaceThatDetaches('ws-1', [], () => { fs.writeFileSync(regFile, broken, 'utf8') })],
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId }), res)

  assert.equal(res.out.status, 200)
  assert.equal(fs.readFileSync(regFile, 'utf8'), broken, 'a delete must not quarantine a file that turned unreadable')
  const names = fs.readdirSync(path.dirname(regFile))
  assert.deepEqual(names.filter(name => name.includes('.corrupt-')), [], 'no quarantine copy may appear')
  assert.deepEqual(names.filter(name => name.includes('.tmp-')), [], 'no half-written replacement may be left')
})

test('a registry removed after the planning read is not recreated as an empty file', async (t) => {
  const root = fixture(t)
  const sessionId = 'session-vanished'
  const regFile = writeRegistry(root, '2030-02-02', { [sessionId]: { slug: 'vanished', folder: 'C:/chat/vanished' } })
  const h = boot({
    root,
    snapshots: [],
    // Another Host deleted the file after our planning read; recreating it as
    // `{ "sessions": {} }` would publish an empty registry nobody wrote.
    workspaces: [workspaceThatDetaches('ws-1', [], () => { fs.rmSync(regFile, { force: true }) })],
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId }), res)

  assert.equal(res.out.status, 200)
  assert.equal(fs.existsSync(regFile), false, 'the delete must leave a removed registry removed')
  const names = fs.readdirSync(path.dirname(regFile))
  assert.deepEqual(names.filter(name => name.includes('.tmp-')), [], 'no temp file may be left behind')
})

test('the public location wins without calling a locate hook that would throw', async (t) => {
  const root = fixture(t)
  const { dir, file } = makeArtifact(root, 'session-location-wins')
  const h = boot({
    root,
    snapshots: [snapshotOf('session-location-wins', file)],
    locate: () => { throw new Error('locate must not be called when location names a path') },
  })
  t.after(h.restore)

  const res = fakeRes()
  await h.handler(fakeReq({ sessionId: 'session-location-wins' }), res)

  assert.equal(res.out.status, 200)
  assert.equal(fs.existsSync(dir), false)
})
