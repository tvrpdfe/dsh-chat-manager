/**
 * Read-only check for the chat-folder prompt section's first-turn window.
 *
 * The acceptance criterion this makes runnable (spec.md, Testing Decisions and
 * the known-limitation entry): in a chat session, the FIRST system prompt
 * assembly of the first turn must already carry either the hold-off text or the
 * folder text naming THAT session's own chat folder — never nothing — and the
 * session must not leave a loose file at the date-folder root (what the model
 * writes when the section is empty, and what the sandbox then refuses to let it
 * clean up).
 *
 * What it can decide, and what it cannot (a review of the first version found it
 * could go green on a broken Host — that version only asked "did some snapshot
 * mention a folder or a hold-off"):
 *
 *  1. the session really took a person's prompt (`source.kind === 'user'`).
 *     With no such message there is nothing to judge, and the snapshot checks
 *     would pass vacuously over an empty list.
 *  2. the FIRST `system/message` precedes that prompt in the log (by seq). That
 *     commit belongs to the step-1 assembly — the one whose assembly ran BEFORE
 *     the claimed `user/message` was appended — so a later re-commit cannot
 *     stand in for it.
 *  3. that first snapshot carries the section, and every snapshot that names a
 *     folder names THIS session's own. A folder left behind by an earlier run
 *     would otherwise make a broken Host look fixed, so the probe also requires
 *     the folder to be younger than the session.
 *  4. the session log is newer than the built bundle (`lib/index.js`), i.e. this
 *     session could have run the code under judgement at all. Run a fresh chat
 *     after rebuilding and restarting the Host; a session that predates the
 *     build is reported as such instead of being judged.
 *
 * The expected section texts come from the built bundle's own pure function, so
 * a wording change cannot silently retire the judgement (rebuild first).
 * Loose files at the date-folder root are attributed to this session by mtime;
 * older ones are reported as residue rather than blamed on this run.
 *
 * It only reads: the plugin's chat registries, the session logs (zstd frames),
 * directory listings, and the bundle's mtime. No session, no browser, no model
 * turn.
 *
 * Usage:
 *   node .scratch/accept12-window-check.mjs [YYYY-MM-DD] [session-id]
 *
 * Defaults: today's date folder, and the newest registered chat that has a log.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chatFolderSectionText } from '../lib/index.js'

const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const BUNDLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'index.js')

/**
 * The chat root, resolved the way the Host resolves it: the override first,
 * then the platform's own Documents folder (a redirected Documents folder is
 * common — `%USERPROFILE%\Documents` is only the last resort).
 */
function resolveChatRoot() {
  const override = process.env.DSH_CHAT_MANAGER_ROOT
  if (override !== undefined && override.trim() !== '') return override.trim()
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', '[Environment]::GetFolderPath("MyDocuments")'], { encoding: 'utf8' })
    const out = (r.stdout ?? '').trim()
    if (r.status === 0 && out) return path.join(out, 'DSH')
  } else if (process.platform === 'linux') {
    const r = spawnSync('xdg-user-dir', ['DOCUMENTS'], { encoding: 'utf8' })
    const out = (r.stdout ?? '').trim()
    if (r.status === 0 && out && path.isAbsolute(out) && path.normalize(out) !== path.normalize(os.homedir())) return path.join(out, 'DSH')
  }
  return path.join(os.homedir(), 'Documents', 'DSH')
}

const CHAT_ROOT = resolveChatRoot()

// The expected texts, built by the same pure function the Host calls — the probe
// and the Host cannot drift apart on wording. A synthetic folder keeps the
// comparison independent of any real path.
const PROBE_FOLDER = path.join('C:', 'probe', 'chat-folder')
const HOLDOFF_TEXT = chatFolderSectionText({ agent: { id: 'probe', session: { id: 'probe' } } }, () => ({ kind: 'pending' }))
const FOLDER_LINE_PREFIX = (() => {
  const text = chatFolderSectionText({ agent: { id: 'probe', session: { id: 'probe' } } }, () => ({ kind: 'folder', folder: PROBE_FOLDER }))
  const at = text.indexOf(PROBE_FOLDER)
  return at < 0 ? 'Put all file input/output for this chat into the chat folder: ' : text.slice(0, at)
})()

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Decompress a JSONL session log written as independent zstd frames. */
function readSessionLog(file) {
  const buffer = fs.readFileSync(file)
  const starts = []
  // Byte by byte, not word-aligned: a frame can start at any offset, and a
  // missed frame silently hides the very events this probe judges (the "at least
  // one person prompt" check below is what caught exactly that).
  for (let i = 0; i + 4 <= buffer.length; i += 1) {
    const magic = buffer.readUInt32LE(i)
    if (magic === 0xFD2FB528 || (magic & 0xFFFFFFF0) === 0x184D2A50) starts.push(i)
  }
  let out = ''
  let failed = 0
  for (let k = 0; k < starts.length; k += 1) {
    const end = k + 1 < starts.length ? starts[k + 1] : buffer.length
    try { out += zlib.zstdDecompressSync(buffer.subarray(starts[k], end)).toString('utf8') } catch { failed += 1 }
  }
  return { lines: out.split('\n').filter((l) => l.trim()), frames: starts.length, failed }
}

/** The session directory for one id, found under the sessions root. */
function sessionDirFor(sessionId) {
  const sessionsRoot = path.join(DSH_HOME, 'sessions')
  for (const project of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!project.isDirectory()) continue
    const dir = path.join(sessionsRoot, project.name, sessionId)
    if (fs.existsSync(dir)) return dir
  }
  return undefined
}

const checks = []
const check = (ok, label, detail) => {
  checks.push({ ok, label, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  [${detail}]`}`)
}
const iso = (ms) => (typeof ms === 'number' ? new Date(ms).toISOString() : '?')

/** The prompt text of one `system/message` event, or `''` when it renders none. */
function systemTextOf(event) {
  const content = event?.data?.message?.content
  if (!Array.isArray(content)) return ''
  return content.filter((block) => block?.type === 'text').map((block) => block.text ?? '').join('\n')
}

/** The folder one section text names, when it names one. */
function namedFolder(text) {
  const at = text.indexOf(FOLDER_LINE_PREFIX)
  if (at < 0) return undefined
  return text.slice(at + FOLDER_LINE_PREFIX.length).split('\n')[0].trim()
}

const dateFolderName = process.argv[2] ?? today()
const dateFolder = path.join(CHAT_ROOT, dateFolderName)
const registryPath = path.join(dateFolder, '.dsh-chat.json')
if (!fs.existsSync(registryPath)) {
  console.error(`no chat registry at ${registryPath} (is this the chat root for that date?)`)
  process.exit(2)
}
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')).sessions ?? {}

let sessionId = process.argv[3]
if (sessionId === undefined) {
  const withLogs = Object.keys(registry)
    .map((id) => ({ id, dir: sessionDirFor(id) }))
    .filter((entry) => entry.dir !== undefined && fs.readdirSync(entry.dir).length > 0)
    .map((entry) => ({ ...entry, mtime: Math.max(...fs.readdirSync(entry.dir).map((n) => fs.statSync(path.join(entry.dir, n)).mtimeMs)) }))
    .sort((a, b) => b.mtime - a.mtime)
  sessionId = withLogs[0]?.id
}
if (sessionId === undefined) {
  console.error('no registered chat session with a log to check')
  process.exit(2)
}

const dir = sessionDirFor(sessionId)
if (dir === undefined) {
  console.error(`no session directory for ${sessionId} under ${path.join(DSH_HOME, 'sessions')}`)
  process.exit(2)
}
// The session directory may hold older generations beside the current log (a
// migrated session keeps `session.jsonl.zstd` and `session.v3.jsonl.zstd` next
// to `session.v4.jsonl.zstd`), so the CURRENT one is the highest `session.vN`,
// never whichever name the listing happened to return first.
const logName = fs.readdirSync(dir)
  .filter((name) => /^session\.v(\d+)\.jsonl\.zstd$/.test(name))
  .sort((a, b) => Number(/^session\.v(\d+)/.exec(b)[1]) - Number(/^session\.v(\d+)/.exec(a)[1]))[0]
if (logName === undefined) {
  console.error(`no session.vN.jsonl.zstd log in ${dir} (found: ${fs.readdirSync(dir).join(', ')})`)
  process.exit(2)
}
const logFile = path.join(dir, logName)
const ownFolder = registry[sessionId]?.folder
console.log(`session  ${sessionId} (slug ${registry[sessionId]?.slug ?? '?'})`)
console.log(`log      ${logFile}`)
console.log(`folder   ${ownFolder ?? '-'}`)
console.log(`bundle   ${BUNDLE} (expectations built from this file)`)

const { lines, frames, failed } = readSessionLog(logFile)
check(failed === 0, 'every zstd frame decompressed', `${frames} frames, ${failed} failed`)

// Attribution first, because every window verdict below is worthless if this
// session could not have run the code under judgement: it predates the build.
// The mtime is NECESSARY but not sufficient — this probe reads no Host, so it
// cannot see whether the process was restarted after the build (a Host started
// before it still runs the old bytes). Cross-check `/state`'s `hostStartedAt`
// against the bundle mtime whenever a Host is available.
const bundleMtime = fs.statSync(BUNDLE).mtimeMs
const logMtime = fs.statSync(logFile).mtimeMs
check(logMtime >= bundleMtime,
  'this session is newer than the built bundle (attribution also requires a Host restarted after it)',
  `log ${iso(logMtime)} vs bundle ${iso(bundleMtime)}`
  + (logMtime >= bundleMtime
    ? ' — a Host started before the build would still run the old code; cross-check hostStartedAt'
    : ' — not a window failure: rebuild, restart the Host, open a fresh chat, and re-run'))

// The log is one JSON event per line; a line that will not parse is not one of
// the events this probe judges, so it is skipped rather than guessed at.
const events = []
for (const line of lines) {
  try { events.push(JSON.parse(line)) } catch { /* not an event line */ }
}
const prompts = events
  .filter((event) => event?.type === 'system/message')
  .map((event) => ({ seq: event.seq, time: event.time, text: systemTextOf(event) }))
const userPrompts = events.filter((event) => event?.type === 'user/message' && event?.data?.source?.kind === 'user')
const times = events.map((event) => event.time).filter((time) => typeof time === 'number')
const sessionStart = times.length > 0 ? Math.min(...times) : undefined

const classify = (text) => {
  if (text.includes(HOLDOFF_TEXT)) return 'holdoff'
  const folder = namedFolder(text)
  if (folder === undefined) return 'EMPTY'
  return folder === ownFolder ? 'own-folder' : `other-folder:${folder}`
}
console.log(`prompt snapshots (oldest first): ${prompts.map((p) => `${p.seq}:${classify(p.text)}`).join(' ') || 'none'}`)
console.log(`session start ${iso(sessionStart)}; first person prompt ${iso(userPrompts[0]?.time)} (seq ${userPrompts[0]?.seq ?? '?'})`)

// 1. Something to judge: without a person's prompt this session cannot exercise
//    the window, and every snapshot check below would be vacuously true.
check(userPrompts.length > 0,
  "the session took at least one of the person's own prompts",
  `${userPrompts.length} user/message with source.kind="user"`)

// 2. The snapshot under judgement is the step-1 commit: the log puts it BEFORE
//    the prompt it answers, which is exactly why the marker has to be armed at
//    delivery. A re-commit after the append proves nothing.
const first = prompts[0]
const firstUser = userPrompts[0]
check(first !== undefined && firstUser !== undefined && first.seq < firstUser.seq,
  'the first system prompt was committed before that prompt (it is the step-1 assembly)',
  first === undefined ? 'no system/message at all' : `system seq=${first.seq} < user seq=${firstUser?.seq ?? '?'}`)

// 3. That first assembly carried the section: the hold-off text, or the folder
//    text naming this session's own folder.
const firstKind = first === undefined ? 'MISSING' : classify(first.text)
check(firstKind === 'holdoff' || firstKind === 'own-folder',
  "the first assembly already carried the section (hold-off, or this chat's own folder)",
  `seq=${first?.seq ?? '?'} ${firstKind}`)

// 4. No assembly of this session left the section empty, and none named somebody
//    else's folder.
check(prompts.length > 0 && prompts.every((p) => classify(p.text) !== 'EMPTY'),
  'no assembly of this session left the section empty',
  prompts.map((p) => `${p.seq}:${classify(p.text)}`).join(' ') || 'no assembly at all')
check(prompts.every((p) => !classify(p.text).startsWith('other-folder:')),
  "every named folder is this session's own",
  prompts.filter((p) => classify(p.text).startsWith('other-folder:')).map((p) => `${p.seq}:${classify(p.text)}`).join(' ') || 'none')

// 5. A folder that already existed cannot show that the new arming works, so the
//    chat's folder must be younger than the session.
let folderStat
try { folderStat = ownFolder === undefined ? undefined : fs.statSync(ownFolder) } catch { folderStat = undefined }
check(folderStat !== undefined && sessionStart !== undefined && folderStat.mtimeMs >= sessionStart - 1000,
  "this chat's folder was created during this session (a pre-existing folder would fake the result above)",
  folderStat === undefined ? `no folder on disk at ${ownFolder ?? '-'}` : `mtime ${iso(folderStat.mtimeMs)} vs session start ${iso(sessionStart)}`)

// 6. Loose files at the date-folder root, attributed to this session by mtime:
//    what a blind write leaves behind. Older files are reported, not blamed.
//    The registry's own temp files are the Host's, not the model's: the plugin
//    writes `.dsh-chat.json.tmp-…` and renames it away (the boot sweep clears an
//    interrupted one), so counting it here would blame the window for a Host
//    crash. The registry, the corrupt-quarantine copies and those temps are the
//    plugin's own bookkeeping.
const PLUGIN_OWN_AT_ROOT = /^(\.dsh-chat\.json|\.dsh-chat\.json\.tmp-|\.dsh-chat\.json\.corrupt-)/
const loose = fs.readdirSync(dateFolder, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !PLUGIN_OWN_AT_ROOT.test(entry.name))
  .map((entry) => ({ name: entry.name, mtimeMs: fs.statSync(path.join(dateFolder, entry.name)).mtimeMs }))
const during = loose.filter((entry) => sessionStart !== undefined && entry.mtimeMs >= sessionStart - 1000)
const residue = loose.filter((entry) => !during.includes(entry))
check(during.length === 0,
  'no loose file was written into the date-folder root during this session',
  during.map((entry) => `${entry.name}@${iso(entry.mtimeMs)}`).join(', ') || 'none')
if (residue.length > 0) {
  console.log(`note: ${residue.length} older loose file(s) at the root — residue from earlier runs, not judged against this session:`
    + ` ${residue.map((entry) => `${entry.name}@${iso(entry.mtimeMs)}`).join(', ')}`)
}

const failedCount = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failedCount}/${checks.length} checks passed`)
process.exit(failedCount === 0 ? 0 : 1)
