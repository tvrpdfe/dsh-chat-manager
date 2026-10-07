/**
 * Decision-table test for the delete route's artifact-removal plan.
 *
 * Why this exists: the POSIX branch cannot be exercised by a probe on this
 * (Windows) machine, so the platform split is pinned here instead. The import
 * goes through the built bundle — the same code the Host loads — because the
 * Host half has no separate module entry.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSessionArtifactRemoval, POSIX_LIVE_DELETE_REFUSAL } from '../lib/index.js'

const plan = (platform, live, artifactInSessionDirectory) =>
  planSessionArtifactRemoval({ platform, live, artifactInSessionDirectory })

test('win32 removes the session directory whether or not the Host holds it live', () => {
  assert.equal(plan('win32', true, true), 'remove-directory')
  assert.equal(plan('win32', true, false), 'remove-single-artifact')
  assert.equal(plan('win32', false, true), 'remove-directory')
  assert.equal(plan('win32', false, false), 'remove-single-artifact')
})

test('POSIX refuses a session the Host still holds live (its lease file dies with the directory)', () => {
  assert.equal(plan('linux', true, true), 'refuse-live-posix')
  assert.equal(plan('linux', true, false), 'refuse-live-posix')
  assert.equal(plan('darwin', true, true), 'refuse-live-posix')
  assert.equal(plan('darwin', true, false), 'refuse-live-posix')
})

test('POSIX deletes a session the Host does not hold live, on the shared paths', () => {
  assert.equal(plan('linux', false, true), 'remove-directory')
  assert.equal(plan('linux', false, false), 'remove-single-artifact')
  assert.equal(plan('darwin', false, true), 'remove-directory')
  assert.equal(plan('darwin', false, false), 'remove-single-artifact')
})

test('an unknown platform is treated as POSIX (refusing is recoverable, forfeiting exclusion is not)', () => {
  assert.equal(plan('freebsd', true, true), 'refuse-live-posix')
  assert.equal(plan('freebsd', true, false), 'refuse-live-posix')
  assert.equal(plan('freebsd', false, true), 'remove-directory')
  assert.equal(plan('freebsd', false, false), 'remove-single-artifact')
  // An empty platform string must not silently fall into the Windows branch.
  assert.equal(plan('', true, true), 'refuse-live-posix')
})

test('the refusal text names the lease file and the recovery action', () => {
  assert.match(POSIX_LIVE_DELETE_REFUSAL, /session\.lock/)
  assert.match(POSIX_LIVE_DELETE_REFUSAL, /restart the Host and retry/)
})
