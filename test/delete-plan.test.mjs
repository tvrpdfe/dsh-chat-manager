/**
 * Decision tables for the delete route's plan seams.
 *
 * Why this exists: the three rules pinned here each produced a real defect that
 * no end-to-end probe on this machine can reach cheaply —
 *   - the artifact path came only from the JSONL backend's private `locate`,
 *     so a Host build without that hook could not delete anything;
 *   - the delete route read `workspace.sessionIds` as a precondition, but that
 *     getter filters ids the persistence layer cannot resolve, so a ghost row
 *     was skipped and its accounting slot lingered;
 *   - the chat-registry cleanup trusted this process's in-memory map, so an
 *     entry another Host registered after startup survived the delete.
 * The import goes through the built bundle — the same code the Host loads.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickSessionArtifactPath, planActivityGate, planDeleteAccounting } from '../lib/index.js'

/** Shape helper: the route hands the picker only the two candidates it read. */
const pick = (locationPath, locateAvailable, locatedPath) =>
  pickSessionArtifactPath({ locationPath, locateAvailable, locatedPath })

test('the public snapshot location wins and the private hook is not consulted', () => {
  assert.deepEqual(pick('/home/u/.dsh/sessions/p/session.v4.jsonl.zstd', true, undefined),
    { path: '/home/u/.dsh/sessions/p/session.v4.jsonl.zstd' })
  // The picker's answer must not change when the hook disagrees: the public
  // field is the contract, the hook is only a fallback for older Host builds.
  assert.deepEqual(pick('/home/u/.dsh/a/session.v4.jsonl.zstd', true, '/home/u/.dsh/b/session.v4.jsonl.zstd'),
    { path: '/home/u/.dsh/a/session.v4.jsonl.zstd' })
})

test('a Host build without the private hook still deletes through the public location', () => {
  assert.deepEqual(pick('/srv/.dsh/sessions/p/session.v4.jsonl.zstd', false, undefined),
    { path: '/srv/.dsh/sessions/p/session.v4.jsonl.zstd' })
})

test('an absent or empty location falls back to the private hook', () => {
  assert.deepEqual(pick(undefined, true, '/srv/.dsh/sessions/p/session.v4.jsonl.zstd'),
    { path: '/srv/.dsh/sessions/p/session.v4.jsonl.zstd' })
  assert.deepEqual(pick('', true, '/srv/.dsh/sessions/p/session.v4.jsonl.zstd'),
    { path: '/srv/.dsh/sessions/p/session.v4.jsonl.zstd' })
})

test('neither source naming an artifact is two distinguishable failures', () => {
  // No public location and no hook at all: the Host build cannot name a log.
  assert.deepEqual(pick(undefined, false, undefined), { failure: 'no-public-location-and-no-hook' })
  // The hook exists but named nothing (or only an empty path).
  assert.deepEqual(pick(undefined, true, undefined), { failure: 'host-named-no-artifact' })
  assert.deepEqual(pick(undefined, true, ''), { failure: 'host-named-no-artifact' })
  assert.deepEqual(pick('', true, ''), { failure: 'host-named-no-artifact' })
})

test('a quiet session deletes without asking and without stopping anything', () => {
  assert.equal(planActivityGate([], false), 'proceed')
  assert.equal(planActivityGate([], true), 'proceed')
})

test('running work refuses an unconfirmed delete and is stopped by a confirmed one', () => {
  const turn = [{ kind: 'turn' }]
  assert.equal(planActivityGate(turn, false), 'refuse')
  assert.equal(planActivityGate(turn, true), 'stop')
  const jobs = [{ kind: 'job', items: [{ id: 'job-1', label: 'build' }] }]
  assert.equal(planActivityGate(jobs, false), 'refuse')
  assert.equal(planActivityGate(jobs, true), 'stop')
})

// ---- accounting plan: workspaces to detach + chat registries to clean ----

const planAccounting = (workspaces, registryFolders) =>
  planDeleteAccounting({ workspaces, registryFolders })

test('every workspace is detached, including one whose getter filtered the ghost id', () => {
  // The entity filters `sessionIds` against persisted headers, so a ghost row
  // looks like it never listed the id. The plan therefore takes only the id and
  // never reads that getter; the route-level proof that a filtered workspace is
  // still detached is in `test/delete-route.test.mjs` ("ghost id" case).
  assert.deepEqual(planAccounting([{ id: 'ws-1' }], []).detachWorkspaceIds, ['ws-1'])
  assert.deepEqual(
    planAccounting([{ id: 'ws-1' }, { id: 'ws-2' }], []).detachWorkspaceIds,
    ['ws-1', 'ws-2'],
  )
  assert.deepEqual(planAccounting([], []).detachWorkspaceIds, [])
})

test('only a parsed registry that names the session is rewritten', () => {
  const folders = [
    { dateFolder: 'C:/root/2030-01-01', read: 'ok', hasSession: true },
    { dateFolder: 'C:/root/2030-01-02', read: 'ok', hasSession: false },
    { dateFolder: 'C:/root/2030-01-03', read: 'absent' },
  ]
  const result = planAccounting([], folders)
  assert.deepEqual(result.clearRegistryFolders, ['C:/root/2030-01-01'])
  assert.deepEqual(result.warnings, [])
})

test('a registry that cannot be read or parsed is warned about, never rewritten', () => {
  const result = planAccounting([], [
    { dateFolder: 'C:/root/2030-01-01', read: 'unreadable' },
    { dateFolder: 'C:/root/2030-01-02', read: 'corrupt' },
    { dateFolder: 'C:/root/2030-01-03', read: 'ok', hasSession: true },
  ])
  assert.deepEqual(result.clearRegistryFolders, ['C:/root/2030-01-03'])
  assert.deepEqual(result.warnings, [
    { dateFolder: 'C:/root/2030-01-01', reason: 'unreadable' },
    { dateFolder: 'C:/root/2030-01-02', reason: 'corrupt' },
  ])
})

test('the same chat registered in two date folders is cleaned in both', () => {
  // This is the cross-Host case: the other Host's entry lives in a folder this
  // process never scanned into its map.
  const result = planAccounting([], [
    { dateFolder: 'C:/root/2030-01-01', read: 'ok', hasSession: true },
    { dateFolder: 'C:/root/2030-01-02', read: 'ok', hasSession: true },
  ])
  assert.deepEqual(result.clearRegistryFolders, ['C:/root/2030-01-01', 'C:/root/2030-01-02'])
})

test('nothing to account for plans empty work', () => {
  assert.deepEqual(planAccounting([], []), { detachWorkspaceIds: [], clearRegistryFolders: [], warnings: [] })
})
