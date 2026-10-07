/**
 * Regression test for the chat-folder prompt section and its delivery trigger.
 *
 * Why the section exists: the lookup once read `context.agent.sessionId` — a
 * field DSH's `Agent` does not have (it carries `id` and `session`). It
 * therefore missed every time, the section returned `''` at every assembly, and
 * the model never received the chat-folder instruction. No gate caught it: the
 * callback's parameter is a local structural type, so `tsc` cannot compare it
 * with the platform's, and no probe read the section text.
 *
 * Why the `pending` state exists: the folder's name comes from the first
 * message, so the first assembly of that turn runs before the folder exists. On
 * a real Host the model wrote a file into the working directory 49 ms before
 * the section appeared, and the sandbox then refused its own cleanup — the
 * stray file is still there.
 *
 * Why the trigger is armed from the delivery: the marker has to be set before
 * the assembly that reads it. `session/event` fires when the claimed
 * `user/message` is appended, and `AgentLoop.step()` appends it AFTER the
 * `system/message` commit of the same step — so the append is one step too late
 * (observed on a real Host: the first prompt of the turn had no section, the
 * model wrote into the date folder, and the next step's prompt is what named
 * the chat folder, so the model had to move the file). `agent/inbox/inserted`
 * fires inside `Agent.send()`'s splice, before the driver is woken. That
 * ordering lives in the platform and is pinned by reading its deployed build;
 * what the tests below pin are this side's conditions.
 *
 * The import goes through the built bundle — the same code the Host loads —
 * exactly like the other decision-table tests in this directory.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatFolderSectionText, chatFolderState, chatFolderStateFor, chatPromptTrigger, SUBAGENT_ORIGIN } from '../lib/index.js'

// A synthetic folder, not a real one: this tree ships in the package, so the
// test stays independent of any user's chat root (same rule as the probes).
const FOLDER = 'C:\\Users\\tester\\Documents\\DSH\\2026-01-02\\a-chat-slug'
const CHAT_ROOT = 'C:\\Users\\tester\\Documents\\DSH'
const DATE_FOLDER = 'C:\\Users\\tester\\Documents\\DSH\\2026-01-02'

/** The Host's answer for one session, shaped the way the Host answers it. */
const registry = (entries) => (session) => {
  const folder = entries[session.id]
  return folder === undefined ? { kind: 'none' } : { kind: 'folder', folder }
}

/** The answer while this chat's slug is still being generated. */
const pending = () => ({ kind: 'pending' })

test('the live session of the assembly names the folder registered for that session', () => {
  const text = chatFolderSectionText(
    { agent: { id: 'sess-1', session: { id: 'sess-1' } } },
    registry({ 'sess-1': FOLDER }),
  )
  assert.notEqual(text, '')
  assert.ok(text.includes(FOLDER), `the section must name the registered folder, got: ${text}`)
  // The session's own workspace root stays the date folder (`ensure-date-folder`
  // registers it and nothing repoints the cwd afterwards), so a relative path
  // does NOT resolve inside the chat folder. The section must ask for an
  // absolute path instead of claiming a root it does not own.
  assert.match(text, /absolute path/i, `the section must ask for an absolute path, got: ${text}`)
  assert.doesNotMatch(text, /is the workspace root/i, `the session cwd is the workspace root, not the chat folder: ${text}`)
})

test('an agent that carries only its own id still resolves the session', () => {
  const text = chatFolderSectionText(
    { agent: { id: 'sess-2' } },
    registry({ 'sess-2': FOLDER }),
  )
  assert.ok(text.includes(FOLDER), `Agent.id alone must be enough, got: ${text}`)
})

test('the field this section once read (`agent.sessionId`) is not a source of the id', () => {
  // The incident, pinned: DSH's Agent has `id` and `session`, never
  // `sessionId`. The lookup always answers `pending`, so only the id read
  // itself can turn that answer into an empty section.
  assert.equal(chatFolderSectionText({ agent: { sessionId: 'sess-3' } }, pending), '')
})

test('no agent, and an unregistered session, each contribute nothing', () => {
  assert.equal(chatFolderSectionText({}, pending), '')
  assert.equal(chatFolderSectionText({ agent: { id: 'sess-9' } }, registry({ 'sess-1': FOLDER })), '')
})

test('a chat whose folder is not created yet is told to hold off, not to guess', () => {
  const text = chatFolderSectionText({ agent: { id: 'sess-4', session: { id: 'sess-4' } } }, pending)
  assert.notEqual(text, '')
  assert.match(text, /working directory/i, `the hold-off text must name the working directory: ${text}`)
  assert.match(text, /does not exist yet/i, `the hold-off text must be honest about the folder: ${text}`)
  // A guessed DIRECTORY in the date folder scatters just like a guessed file
  // (the `write` tool creates parent directories), so the prohibition must not
  // name files only.
  assert.match(text, /director/i, `the hold-off text must also cover creating directories: ${text}`)
  assert.doesNotMatch(text, /\[object Object\]/, `a state object must never be interpolated as text: ${text}`)
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/, `the hold-off text must not name a path that does not exist: ${text}`)
})

test('a registered folder wins over a stale in-flight marker', () => {
  // Both signals are true for a moment on a real Host: the `.then` that
  // registers the folder runs before the `.finally` that clears the marker.
  // Reporting `pending` in that window would tell the model to hold off from a
  // folder that is already there.
  assert.deepEqual(chatFolderState(FOLDER, true), { kind: 'folder', folder: FOLDER })
})

test('the in-flight marker alone means pending, and neither signal means none', () => {
  assert.deepEqual(chatFolderState(undefined, true), { kind: 'pending' })
  assert.deepEqual(chatFolderState(undefined, false), { kind: 'none' })
})

// The trigger, whose placement is what makes the `pending` state reachable at
// all: only a person's prompt in a chat workspace, with text to name a folder
// from, starts one.
test('a person prompt delivered to a chat session starts its folder', () => {
  const trigger = chatPromptTrigger(
    { source: { kind: 'user' }, content: [{ type: 'text', text: '  write a bubble sort  ' }] },
    { cwd: DATE_FOLDER },
    CHAT_ROOT,
  )
  assert.deepEqual(trigger, { dateFolder: DATE_FOLDER, text: 'write a bubble sort' })
})

test('text is collected across every text block, and non-text blocks are ignored', () => {
  const trigger = chatPromptTrigger(
    {
      source: { kind: 'user' },
      content: [{ type: 'image', text: 'not text' }, { type: 'text', text: 'first' }, { type: 'text', text: 'second' }],
    },
    { cwd: DATE_FOLDER },
    CHAT_ROOT,
  )
  assert.equal(trigger?.text, 'first second')
})

test('a producer that does not declare itself the person starts nothing', () => {
  const content = [{ type: 'text', text: 'do the work' }]
  const header = { cwd: DATE_FOLDER }
  assert.equal(chatPromptTrigger({ source: { kind: 'agent-message' }, content }, header, CHAT_ROOT), undefined)
  assert.equal(chatPromptTrigger({ source: { kind: 'compact-checkpoint' }, content }, header, CHAT_ROOT), undefined)
  assert.equal(chatPromptTrigger({ content }, header, CHAT_ROOT), undefined)
})

test('a delegated child never names a chat folder of its own', () => {
  // Both subagent drivers deliver the child's task as `kind: 'user'` and the
  // child inherits the parent's cwd, so the producer kind alone would let every
  // delegated child mint a folder named from its task. `origin` is what tells a
  // child apart; it is the reason the trigger reads the header and not just cwd.
  const message = { source: { kind: 'user' }, content: [{ type: 'text', text: 'do the work' }] }
  assert.equal(chatPromptTrigger(message, { cwd: DATE_FOLDER, origin: 'subagent', parentSession: 'sess-chat' }, CHAT_ROOT), undefined)
})

test('a workspace session is not a chat session, however it was prompted', () => {
  const message = { source: { kind: 'user' }, content: [{ type: 'text', text: 'fix the bug' }] }
  assert.equal(chatPromptTrigger(message, { cwd: 'F:\\workdir\\some-project' }, CHAT_ROOT), undefined)
  // An unresolved chat root must not turn every session into a chat session.
  assert.equal(chatPromptTrigger(message, { cwd: DATE_FOLDER }, null), undefined)
})

test('a first message with no text starts nothing instead of guessing a name', () => {
  // ADR 0001 names the folder from the message; with no text there is no name.
  // Such a session keeps its pre-chat-folder behavior until a text prompt
  // arrives, rather than getting a folder named by a guess.
  const header = { cwd: DATE_FOLDER }
  assert.equal(chatPromptTrigger({ source: { kind: 'user' }, content: [{ type: 'image' }] }, header, CHAT_ROOT), undefined)
  assert.equal(chatPromptTrigger({ source: { kind: 'user' }, content: [{ type: 'text', text: '   ' }] }, header, CHAT_ROOT), undefined)
  assert.equal(chatPromptTrigger(undefined, header, CHAT_ROOT), undefined)
  assert.equal(chatPromptTrigger({ source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] }, undefined, CHAT_ROOT), undefined)
})

// A delegated child works in the folder of the chat that delegated it.
const folders = (entries) => (sessionId) => entries[sessionId]
const none = () => false
const child = (parentSession) => ({ id: 'sess-child', header: { cwd: DATE_FOLDER, origin: SUBAGENT_ORIGIN, ...parentSession === undefined ? {} : { parentSession } } })

test('the subagent marker is one shared literal, and it is the one DSH stamps', () => {
  // Pinned so a typo cannot silently switch both rules off at once: the trigger
  // would stop skipping children and the `/state` route would stop hiding them.
  assert.equal(SUBAGENT_ORIGIN, 'subagent')
})

test('a delegated child is sent to the folder of the chat it was delegated from', () => {
  const state = chatFolderStateFor(child('sess-chat'), folders({ 'sess-chat': FOLDER }), none)
  assert.deepEqual(state, { kind: 'folder', folder: FOLDER })
})

test('a child of a child, and a child of a folder-less chat, get no folder text', () => {
  // The hop DSH records is one: a grandchild's `parentSession` is another
  // child, which no chat folder is registered for. Falling through to `none`
  // keeps the child's pre-existing behavior instead of naming a wrong folder.
  assert.deepEqual(chatFolderStateFor(child('sess-child'), folders({}), none), { kind: 'none' })
  // A delegation that outruns its own chat's folder creation, or comes from a
  // workspace session, is the same case.
  assert.deepEqual(chatFolderStateFor(child('sess-chat'), folders({}), none), { kind: 'none' })
  assert.deepEqual(chatFolderStateFor(child(undefined), folders({ 'sess-chat': FOLDER }), none), { kind: 'none' })
})

test('a child never holds off for a folder of its own, and its own entry is ignored', () => {
  // Even while the child's own slug generation runs (it cannot, now that the
  // trigger refuses children — this pins the rule rather than the reachability),
  // the child must not be told to wait for something that is not coming.
  assert.deepEqual(chatFolderStateFor(child('sess-chat'), folders({ 'sess-chat': FOLDER }), () => true), { kind: 'folder', folder: FOLDER })
  // A registration left behind by the earlier behavior must not win over the
  // chat the child actually belongs to.
  assert.deepEqual(
    chatFolderStateFor(child('sess-chat'), folders({ 'sess-child': 'C:\\stale\\task-named', 'sess-chat': FOLDER }), none),
    { kind: 'folder', folder: FOLDER },
  )
})

test('a chat session still reads its own folder and its own in-flight marker', () => {
  const chat = { id: 'sess-1', header: { cwd: DATE_FOLDER } }
  assert.deepEqual(chatFolderStateFor(chat, folders({ 'sess-1': FOLDER }), none), { kind: 'folder', folder: FOLDER })
  assert.deepEqual(chatFolderStateFor(chat, folders({}), () => true), { kind: 'pending' })
  assert.deepEqual(chatFolderStateFor(chat, folders({}), none), { kind: 'none' })
})
