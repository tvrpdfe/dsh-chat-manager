/**
 * dsh-chat-manager — host half.
 * Chat-session folders (Documents/DSH/YYYY-MM-DD/xxxx), chat search,
 * session delete, and archived-session restore for the Web GUI.
 * Runs as a row of the user's profile composition.
 *
 * TS port of the original hand-maintained JS half; behavior is unchanged.
 * Service faces are typed loosely at the ctx boundary (the platform packages
 * provide their own real types when the host type-checking context includes
 * them).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isUnderChatRoot, normalizePathLower } from './shared/paths.ts'
import { collisionSlug, cleanSlug } from './shared/slug.ts'
import { planSessionArtifactRemoval } from './shared/removal-plan.ts'
import { ensureWindowsFolderAccess } from './win-folder-access.ts'
import type { ArchivedChatRow, ChatFolderEntry, ChatSearchHit } from './shared/chat.ts'
import { chatFolderSectionText, chatFolderStateFor, chatPromptTrigger, SUBAGENT_ORIGIN } from './shared/prompt-section.ts'
import type { ChatFolderSectionContext, ChatSessionHeader, DeliveredMessage } from './shared/prompt-section.ts'

const name = 'dsh-chat-manager'

/**
 * 500 text for the POSIX-only delete refusal: the session's lease is a
 * `flock` on `<sessionDir>/session.lock`, and that file is inside the very
 * directory the delete must remove to stop a live write handle from
 * recreating the log. Windows holds a path-derived kernel semaphore instead,
 * so the same delete is safe there and never reaches this text.
 */
export const POSIX_LIVE_DELETE_REFUSAL = 'the Host still holds this session live and its POSIX write lease'
  + ' (session.lock) lives in the session directory, so removing it would forfeit cross-process write'
  + ' exclusion: restart the Host and retry.'

/** One-line message for an unknown failure (Error instance or anything else). */
function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err)
}

const inject = [
  'webServer',
  'workspaceRegistry',
  'storageDomain',
  'sessionPersistence',
  'sessionQuery',
  'systemPrompt',
  'llm',
  'agentDefaultModel',
]

const CHAT_ROOT_NAME = 'DSH'

/**
 * Environment variable naming the chat root outright. Supported, not a test
 * hook only: it is the escape hatch for a Documents folder the platform cannot
 * report (headless Linux), for putting the chat area on another volume, and for
 * a verification Host whose chat folders must stay off the real tree.
 */
const CHAT_ROOT_OVERRIDE_ENV = 'DSH_CHAT_MANAGER_ROOT'

/**
 * Wall-clock budget for the startup sweep that makes existing date folders
 * provisionable. The deadline is handed to `ensureWindowsFolderAccess`, which
 * starts no further `icacls` call once it is inside its own floor — so the pass
 * is bounded by this budget plus that floor, not by one call's cap multiplied
 * by the calls one folder needs. The sweep runs synchronously on the startup
 * path, so a dead or very slow volume must stop it rather than hold the Host's
 * start indefinitely; a skipped folder is healed later by the chat route when
 * that day is used.
 */
const CHAT_FOLDER_SWEEP_BUDGET_MS = 30_000

/**
 * Wall-clock budget for the same check on the `ensure-date-folder` route. It is
 * reached by a user action (opening a new chat), and the check is synchronous,
 * so a slow volume must not block that one request through all of the calls a
 * check can make: one call's cap is the whole budget here. A folder that cannot
 * be checked in time still gets the ACE on a later start or chat.
 */
const CHAT_FOLDER_ROUTE_BUDGET_MS = 10_000

/**
 * Wall-clock budget for the platform lookup that names the Documents folder
 * (`powershell` on Windows, `xdg-user-dir` on Linux). It runs on the startup
 * path — BEFORE the folder sweep and its budget — so a wedged helper must fall
 * back to `~/Documents` instead of holding the Host's start forever. A lookup
 * that answers nothing at all already takes that same fallback.
 */
const DOCUMENTS_LOOKUP_TIMEOUT_MS = 10_000

/** Workspace-item shape read from the registry (leaf fields only). */
interface WorkspaceView {
  id: string
  title: string
  path: string
  sessionIds: string[]
  detachSession: (sessionId: string) => Promise<void>
}

/**
 * Loosely-typed ctx face: the services this plugin consumes. Record<string,
 * any> keeps the platform's runtime contracts open while the documented
 * members carry the shapes this plugin actually touches.
 */
interface HostCtx extends Record<string, any> {
  /** Optional-peer lookup (`sessions` is the platform's live Session store). */
  get: (name: string) => { get?: (id: string) => unknown } | undefined
  webServer: {
    register: (route: object, ...rest: unknown[]) => unknown
  }
  workspaceRegistry: {
    list: () => WorkspaceView[]
    resolveByPath: (p: string) => Promise<WorkspaceView | undefined>
    create: (p: string) => Promise<WorkspaceView>
    /**
     * The platform's own un-archive: drops the id from the registry-global
     * archive set on the registry's operation chain. It is idempotent (an id
     * that is not archived resolves without a write), so the caller needs no
     * precondition read.
     */
    unarchiveSession: (sessionId: string) => Promise<void>
    /**
     * The platform's own unpin: drops the id on the registry write chain and,
     * unlike `pinSession`, runs no session-existence check — removing an id
     * cannot introduce an unknown one. Also idempotent.
     */
    unpinSession: (sessionId: string) => Promise<void>
  }
  storageDomain: {
    get: (name: string) => {
      global: { get: () => { archivedSessionIds?: string[] } }
      table: (name: string) => { delete: (key: string) => Promise<void> }
    } | undefined
  }
  sessionPersistence: {
    /**
     * Stored-session snapshots. A snapshot is `{ header, revision, ... }`:
     * the id and cwd live on `header`, NEVER on the snapshot itself — reading
     * `snapshot.id` silently matches nothing.
     */
    list: () => Promise<Array<{
      header: { id: string; cwd: string }
      revision: unknown
      eventCount?: number
      sizeBytes?: number
    }>>
    /** Direct lookup for one stored Session by id (absent when it does not exist). */
    stat: (id: string) => Promise<{
      header: { id: string; cwd: string }
      revision: unknown
    } | undefined>
    /**
     * Backend artifact mapping (`{ kind, path }`) from a stored header. Not
     * part of the abstract service API — it is the JSONL backend's own
     * refusal-diagnostics hook, so callers must treat it as optional.
     */
    locate?: (meta: { id: string; cwd: string }) => { kind?: string; path?: string } | undefined
    /** Durability barrier: every active write handle drains and materializes. */
    flush: () => Promise<void>
  }
  sessionQuery: {
    listSessions: () => Promise<Array<{ header: { id: string; cwd?: string; origin?: string } }>>
    readTitleSnapshots: (ids: string[]) => Promise<Array<{
      sessionId: string
      status: 'fulfilled' | 'rejected'
      value?: { title?: { title?: string; updatedAt?: number }; session?: { createdAt?: number } }
    }>>
    searchSessions: (request: { query: string; limit?: number }) => Promise<{ items?: unknown[] }>
  }
  systemPrompt: { section: (section: unknown) => unknown }
  llm: { stream: (request: object) => AsyncIterable<{ type: string; text?: string; reason?: { kind?: string } }> }
  agentDefaultModel: { currentSelection: () => { provider?: string; model?: string; reasoningEffort?: unknown } | null }
}

/** One `agent/inbox/inserted` payload, as this plugin reads it. */
interface AgentInboxInserted {
  agent?: { id?: string; session?: { id?: string; header?: ChatSessionHeader } }
  message?: DeliveredMessage
}

function apply(ctx: HostCtx): void {
  const chatState: {
    documentsRoot: string | null
    root: string | null
    folders: Map<string, ChatFolderEntry>
    /** Epoch ms this Host process started, for the routes' `hostStartedAt` fact. */
    hostStartedAt: number
  } = {
    documentsRoot: null,
    root: null,
    folders: new Map(),
    hostStartedAt: Date.now() - Math.round(process.uptime() * 1000),
  }

  /** Session ids whose slug generation is in flight (first-message dedup). */
  const pendingSlugFor = new Set<string>()

  /**
   * The chat root named by {@link CHAT_ROOT_OVERRIDE_ENV}, or null when the
   * environment names none. A relative value is refused with a warning rather
   * than resolved against the Host's working directory — a bare join would
   * scatter chat folders wherever the Host happened to start.
   * @returns the absolute chat root, or null to fall back to the platform Documents folder.
   */
  function chatRootOverride(): string | null {
    const raw = process.env[CHAT_ROOT_OVERRIDE_ENV]
    if (raw === undefined || raw.trim() === '') return null
    const value = raw.trim()
    if (!path.isAbsolute(value)) {
      console.warn(`[dsh-chat-manager] ignoring relative ${CHAT_ROOT_OVERRIDE_ENV}: ${value}`)
      return null
    }
    return path.normalize(value)
  }

  /**
   * Windows PowerShell by absolute path. PATH is not trusted for a program the
   * Host runs on its startup path — the same rule the ACL tools follow.
   * @returns the absolute path of `powershell.exe`.
   */
  function windowsPowerShell(): string {
    const systemRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
    return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  }

  function resolveDocuments(): string {
    if (chatState.documentsRoot) return chatState.documentsRoot
    if (process.platform === 'win32') {
      const r = spawnSync(windowsPowerShell(), ['-NoProfile', '-Command', '[Environment]::GetFolderPath("MyDocuments")'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: DOCUMENTS_LOOKUP_TIMEOUT_MS,
      })
      const out = (r.stdout || '').trim()
      if (r.status === 0 && out) {
        chatState.documentsRoot = out
        return out
      }
    } else if (process.platform === 'linux') {
      const r = spawnSync('xdg-user-dir', ['DOCUMENTS'], { encoding: 'utf8', timeout: DOCUMENTS_LOOKUP_TIMEOUT_MS })
      const out = (r.stdout || '').trim()
      // `xdg-user-dir` answers `$HOME` when the XDG user dirs are unconfigured,
      // and `$HOME` is not a Documents folder: only an absolute path that is
      // not the home directory itself is taken. Both sides are normalized so a
      // trailing separator or a differently-spelled home cannot slip through.
      // macOS needs no branch — its default Documents folder IS the
      // `~/Documents` fallback below.
      if (r.status === 0 && out && path.isAbsolute(out) && path.normalize(out) !== path.normalize(os.homedir())) {
        chatState.documentsRoot = out
        return out
      }
    }
    chatState.documentsRoot = path.join(os.homedir(), 'Documents')
    // The fallback is silent no longer: a Host whose platform lookup failed (or
    // timed out within DOCUMENTS_LOOKUP_TIMEOUT_MS) chats under `~/Documents`
    // instead of the user's real Documents folder, and that must be visible in
    // the log rather than inferred from where the folders appeared.
    console.warn(`[dsh-chat-manager] the platform named no Documents folder; using ${chatState.documentsRoot}`)
    return chatState.documentsRoot
  }

  function todayString(now: Date = new Date()): string {
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // ---- chat-folder registry: one .dsh-chat.json per date folder ----
  function registryFile(dateFolder: string): string {
    return path.join(dateFolder, '.dsh-chat.json')
  }

  /**
   * How a registry read ended, which is what decides whether a write may follow.
   *  - `ok`: parsed.
   *  - `absent`: no file — an empty registry, safe to create.
   *  - `unreadable`: the file is there but could not be READ (permissions, a
   *    transient lock, IO). Its content is unknown, so a merge into it must not
   *    happen: writing would replace whatever it holds with the caller's one
   *    entry.
   *  - `corrupt`: read fine, parsed not. The bytes are quarantined before the
   *    file is rebuilt (see {@link editRegistry}).
   */
  type RegistryRead =
    | { status: 'ok'; sessions: Record<string, ChatFolderEntry> }
    | { status: 'absent' }
    | { status: 'unreadable'; detail: string }
    | { status: 'corrupt' }

  /**
   * Read one date folder's registry, keeping the failure kinds apart.
   * @param dateFolder - the dated folder to read.
   * @returns how the read ended, with the entries when it parsed.
   */
  function readRegistryFile(dateFolder: string): RegistryRead {
    const file = registryFile(dateFolder)
    let raw: string
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { status: 'absent' }
      return { status: 'unreadable', detail: errorMessage(err) }
    }
    try {
      const parsed = JSON.parse(raw) as { sessions?: Record<string, ChatFolderEntry> }
      const sessions = parsed && typeof parsed.sessions === 'object' && parsed.sessions !== null ? parsed.sessions : {}
      return { status: 'ok', sessions }
    } catch {
      return { status: 'corrupt' }
    }
  }

  /** Entries of one date folder's registry (anything but a clean parse reads as empty). */
  function readRegistry(dateFolder: string): Record<string, ChatFolderEntry> {
    const read = readRegistryFile(dateFolder)
    return read.status === 'ok' ? read.sessions : {}
  }

  /** Size and mtime of the registry file, as one comparable stamp (`'absent'` when missing). */
  function registryStamp(file: string): string {
    try {
      const stat = fs.statSync(file)
      return `${stat.size}:${stat.mtimeMs}`
    } catch {
      return 'absent'
    }
  }

  /**
   * Replace one date folder's registry with `sessions`, atomically.
   *
   * Atomicity is not decoration: the file is shared by every Host on this chat
   * root (Web and desktop are separate processes, see AGENTS.md), and a reader
   * that catches a half-written file parses nothing — it would then merge its
   * own entries into an empty set and drop the other Host's. Writing a sibling
   * temp file and renaming it over the target means a reader sees either the
   * old file or the new one, never a torn one. The temp file's name is fixed by
   * the boot sweep (`scanChatFolders` removes leftovers) and ignored by the
   * window probe's stray-file check.
   * @param file - the registry path.
   * @param sessions - the complete entry set to publish.
   */
  function writeRegistryAtomically(file: string, sessions: Record<string, ChatFolderEntry>): void {
    const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
    try {
      fs.writeFileSync(temp, JSON.stringify({ sessions }, null, 2), 'utf8')
      fs.renameSync(temp, file)
    } catch (err) {
      try { fs.rmSync(temp, { force: true }) } catch { /* the temp file is inert anyway */ }
      console.warn('[dsh-chat-manager] registry write failed:', err)
    }
  }

  /** Age above which a registry temp file can only be an interrupted write. */
  const REGISTRY_TEMP_STALE_MS = 60_000

  /**
   * Remove stale registry temp files from one date folder.
   *
   * `writeRegistryAtomically` writes `<registry>.tmp-…` and renames it away, so
   * anything left is the residue of a process that died in between (or of a
   * rename that failed). Nothing reads those bytes, and they sit in a folder the
   * chat probe watches for stray files, so the boot sweep clears the old ones;
   * a young temp file is left alone because another Host may be writing it right
   * now (deleting that one would fail its rename).
   * @param dateFolder - the dated folder to sweep.
   */
  function sweepRegistryTemps(dateFolder: string): void {
    let names: string[]
    try {
      names = fs.readdirSync(dateFolder)
    } catch {
      return
    }
    for (const name of names) {
      if (!/^\.dsh-chat\.json\.tmp-/.test(name)) continue
      const file = path.join(dateFolder, name)
      try {
        if (Date.now() - fs.statSync(file).mtimeMs < REGISTRY_TEMP_STALE_MS) continue
        fs.rmSync(file, { force: true })
        console.warn(`[dsh-chat-manager] removed a leftover registry temp file: ${file}`)
      } catch { /* a concurrent removal is the swept answer */ }
    }
  }

  /**
   * Apply ONE change to a date folder's registry file, as a read-modify-write.
   *
   * The file is shared by every Host running this plugin: the Web profile and
   * the desktop profile are separate processes over one chat root (same code,
   * different profile), and each only knows the chats IT has registered since
   * its own start. Rebuilding the file from this process's map alone therefore
   * erased the other Host's entries — and an entry that vanishes puts its
   * folder back in reach of `uniqueSlug`'s adoption rule, i.e. two chats sharing
   * one folder. Only the entries the caller names are touched, and the write is
   * atomic (see {@link writeRegistryAtomically}).
   *
   * Three endings, three behaviours: a clean read is edited; a MISSING file is
   * created; a file that could not be READ is left completely alone (its content
   * is unknown, so merging into it would destroy it — a warning is the honest
   * answer); a file that parsed badly is quarantined as `.dsh-chat.json.corrupt-<ts>`
   * first, so the bytes survive even though the entries they described do not
   * come back from anywhere.
   *
   * The stamp check is optimistic concurrency: if the other Host wrote between
   * our read and our replace, this write would drop its entry, so the read is
   * redone on the newer content instead. Three attempts, then it warns — a
   * registry entry that loses this race costs a chat its folder hint (and its
   * folder becomes adoptable), which is worth a warning but not a crash.
   * @param dateFolder - the dated folder whose registry is written.
   * @param edit - the one change to apply to the entries read from disk.
   */
  function editRegistry(dateFolder: string, edit: (sessions: Record<string, ChatFolderEntry>) => void): void {
    const file = registryFile(dateFolder)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const stamp = registryStamp(file)
      const read = readRegistryFile(dateFolder)
      if (read.status === 'unreadable') {
        console.warn(`[dsh-chat-manager] chat registry could not be read (${read.detail}); leaving it untouched: ${file}`)
        return
      }
      let sessions: Record<string, ChatFolderEntry> = {}
      if (read.status === 'ok') {
        sessions = read.sessions
      } else if (read.status === 'corrupt') {
        // Quarantine the unreadable bytes before rebuilding: the entries in them
        // are lost either way (nothing else knows which chat a folder belongs
        // to), and keeping the file is what lets a person recover them by hand.
        const quarantine = `${file}.corrupt-${Date.now()}`
        try {
          fs.renameSync(file, quarantine)
          console.warn(`[dsh-chat-manager] chat registry was unreadable; kept it as ${quarantine} and rebuilding`)
        } catch (err) {
          console.warn('[dsh-chat-manager] chat registry was unreadable and could not be set aside; leaving it untouched:', errorMessage(err))
          return
        }
      }
      edit(sessions)
      if (registryStamp(file) !== stamp) continue
      writeRegistryAtomically(file, sessions)
      return
    }
    console.warn('[dsh-chat-manager] chat registry kept changing while writing; gave up after 3 attempts:', file)
  }

  /** Whether another chat this process knows about already registered this folder. */
  function registeredFolder(folder: string): boolean {
    for (const entry of chatState.folders.values()) {
      if (normalizePathLower(entry.folder) === normalizePathLower(folder)) return true
    }
    return false
  }

  /** Whether some registry entry — in this process or on disk — already owns `folder`. */
  function folderIsRegistered(folder: string, diskSessions: Record<string, ChatFolderEntry>): boolean {
    if (registeredFolder(folder)) return true
    for (const entry of Object.values(diskSessions)) {
      if (entry && typeof entry.folder === 'string' && normalizePathLower(entry.folder) === normalizePathLower(folder)) return true
    }
    return false
  }

  /**
   * Read every date folder under the chat root and load its registry.
   * @returns the date folders found, in listing order (the boot pass also uses
   *   them to make each one provisionable for DSH's Windows sandbox).
   */
  function scanChatFolders(): string[] {
    const dateFolders: string[] = []
    if (!chatState.root || !fs.existsSync(chatState.root)) return dateFolders
    let names
    try {
      names = fs.readdirSync(chatState.root, { withFileTypes: true })
    } catch {
      return dateFolders
    }
    for (const d of names) {
      if (!d.isDirectory()) continue
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue
      const dateFolder = path.join(chatState.root, d.name)
      dateFolders.push(dateFolder)
      // Leftover registry temp files (an interrupted write: this process's
      // `writeRegistryAtomically` or a previous Host's) are dead weight in a
      // folder the probe's stray-file check watches. Only old ones go: a file
      // younger than a minute may belong to a Host that is writing right now,
      // and removing that one would fail its rename.
      sweepRegistryTemps(dateFolder)
      const sessions = readRegistry(dateFolder)
      for (const [sid, entry] of Object.entries(sessions)) {
        if (entry && typeof entry.slug === 'string' && typeof entry.folder === 'string' && !chatState.folders.has(sid)) {
          chatState.folders.set(sid, { slug: entry.slug, folder: entry.folder })
        }
      }
    }
    return dateFolders
  }

  // ---- slug generation (LLM first, local fallback) ----
  // Both paths run through the shared `cleanSlug`, which guarantees the
  // spec's 2–4 lowercase hyphenated word range (short sources pad with the
  // stable filler `session`; an empty source starts from `chat`).

  /**
   * Reserve the first free folder name under the date folder.
   *
   * The name is claimed by CREATING the folder in the same synchronous step that
   * found it free. The earlier existsSync-then-mkdir shape left the whole `await`
   * of `generateSlug` as a window in which two chats naming folders in one date
   * folder could choose the same name and both end up registered to one folder;
   * `mkdirSync` without `recursive` reports the loser's collision as EEXIST, and
   * the loop sends that chat on to the next candidate (`-2`, `-3`, …, ADR 0001).
   * @param dateFolder - the dated folder the chat folder belongs in (it exists).
   * @param slug - the slug to claim, before collisions are resolved.
   * @returns the slug and the folder this chat now owns.
   */
  function uniqueSlug(dateFolder: string, slug: string): ChatFolderEntry {
    const words = slug.split('-')
    // Names that were already there when this naming started. Only those are
    // orphans a chat may adopt (the leftover of a deleted chat, or a folder a
    // person made). A directory that APPEARS during the search was claimed by
    // another Host — or by this one, a moment ago — and adopting that is exactly
    // the "two chats share one folder" case ADR 0001's revision 3 closes.
    let preexisting: ReadonlySet<string>
    try {
      preexisting = new Set(fs.readdirSync(dateFolder))
    } catch {
      preexisting = new Set()
    }
    for (let n = 0; ; n += 1) {
      const candidate = collisionSlug(words, n)
      const folder = path.join(dateFolder, candidate)
      // The registry is re-read per candidate: it is the shared file of every
      // Host on this chat root, and a name another Host claimed since the last
      // look must not be adopted just because this process never heard of it.
      // (One small read per candidate — usually the first one wins.)
      if (folderIsRegistered(folder, readRegistry(dateFolder))) continue
      if (preexisting.has(candidate)) return { slug: candidate, folder }
      try {
        fs.mkdirSync(folder)
        return { slug: candidate, folder }
      } catch (err) {
        // Lost the claim to a chat that got here in the same instant: the
        // folder is theirs, so this one moves on to the next name.
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue
        throw err
      }
    }
  }

  async function generateSlug(text: string): Promise<string> {
    const selection = ctx.agentDefaultModel.currentSelection()
    if (selection && selection.provider && selection.model) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      try {
        const stream = ctx.llm.stream({
          provider: selection.provider,
          model: selection.model,
          ...(selection.reasoningEffort !== undefined ? { reasoningEffort: selection.reasoningEffort } : {}),
          purpose: 'session-title',
          system: 'You name a chat folder. Return ONLY 2-4 lowercase English words separated by hyphens, with no quotes, punctuation, or explanation.',
          messages: [{
            id: crypto.randomUUID(),
            role: 'user',
            content: [{ type: 'text', text: `Name a chat folder from this first message:\n${String(text).slice(0, 800)}` }],
            // Producer-owned source kind, the shape 0.2.x writes for its own
            // helper calls (`session-title-llm` writes `{ kind:
            // 'dsh-session-title-llm' }`). `{ kind: 'plugin', plugin: … }` is the
            // released V2/V3 wrapper, which the format migration has to rewrite.
            source: { kind: 'dsh-chat-manager' },
          }],
          temperature: 0.2,
          maxTokens: 24,
          signal: controller.signal,
        })
        let out = ''
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') out += chunk.text ?? ''
          else if (chunk.type === 'finish') {
            if (chunk.reason && chunk.reason.kind === 'error') throw new Error('slug model call failed')
          }
        }
        return cleanSlug(out)
      } catch (err) {
        console.warn('[dsh-chat-manager] LLM slug failed, using local fallback:', errorMessage(err))
      } finally {
        clearTimeout(timer)
      }
    }
    return cleanSlug(text)
  }

  // ---- first-message hook: create the slug subfolder ----
  /**
   * Start (or skip) the slug-folder setup for one delivered prompt.
   *
   * "First user message" is enforced per session here rather than by the
   * caller: the in-flight window between the trigger and the registry write
   * must not re-run the generation for a later message (the 15s LLM budget
   * makes that window wide enough to matter), and two triggers watch the same
   * delivery.
   * @param sessionId - the chat session the folder belongs to.
   * @param dateFolder - that session's workspace (the dated folder).
   * @param text - the prompt text the folder is named from.
   */
  function startChatFolderSlug(sessionId: string, dateFolder: string, text: string): void {
    if (chatState.folders.has(sessionId) || pendingSlugFor.has(sessionId)) return
    pendingSlugFor.add(sessionId)
    generateSlug(text)
      .then((slug) => {
        // The dated folder is the session's own workspace root and exists by
        // now; creating it here keeps the claim below independent of that. The
        // claim itself must stay non-recursive — it needs the EEXIST a
        // `recursive` mkdir swallows.
        fs.mkdirSync(dateFolder, { recursive: true })
        return uniqueSlug(dateFolder, slug)
      })
      .then(({ slug, folder }) => {
        chatState.folders.set(sessionId, { slug, folder })
        editRegistry(dateFolder, (sessions) => { sessions[sessionId] = { slug, folder } })
        console.log(`[dsh-chat-manager] chat folder ready: ${folder}`)
      })
      .catch((err) => console.warn('[dsh-chat-manager] slug folder setup failed:', err))
      .finally(() => { pendingSlugFor.delete(sessionId) })
  }

  /**
   * Delivery trigger. This is the one point DSH reaches before the step's
   * prompt assembly: `Agent.send()` emits `agent/inbox/inserted` inside its
   * splice and wakes the driver afterwards, and the assembling `preStep` runs
   * inside that wake. The durable append is already too late for the step it
   * belongs to — `AgentLoop.step()` commits the `system/message` and then
   * appends the claimed `user/message`, both AFTER the assembly — so the
   * append-time trigger below left the first prompt of the turn with an empty
   * section: the model wrote its file into the date folder and moved it into
   * the chat folder only once the next step's prompt named that folder.
   */
  ctx.on('agent/inbox/inserted', (payload: AgentInboxInserted) => {
    const session = payload?.agent?.session
    const sessionId = session?.id ?? payload?.agent?.id
    if (sessionId === undefined) return
    const trigger = chatPromptTrigger(payload?.message, session?.header, chatState.root)
    if (!trigger) return
    startChatFolderSlug(sessionId, trigger.dateFolder, trigger.text)
  })

  /**
   * Fallback for a delivery that reaches the log without the inbox event (a
   * producer that appends its own `user/message`): it still gets its folder,
   * only without the pre-assembly marker of this round.
   */
  ctx.on('session/event', (session: { id: string; header?: ChatSessionHeader }, event: { type?: string; data?: DeliveredMessage }) => {
    if (event.type !== 'user/message') return
    const trigger = chatPromptTrigger(event.data, session.header, chatState.root)
    if (!trigger) return
    startChatFolderSlug(session.id, trigger.dateFolder, trigger.text)
  })

  // ---- system-prompt section: chat sessions write into their slug folder ----
  // Session-id read, the folder/hold-off decision, and the child rule all live
  // in shared/prompt-section.ts (incidents: `agent.sessionId`; the append-time
  // trigger). The state rule only needs the two lookups below: the registry and
  // this process's in-flight set. A session whose folder setup failed therefore
  // falls through to `none` and keeps the old behavior instead of holding the
  // model off forever.
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'dsh-chat-manager/chat-folder',
    order: 150,
    text: (context: ChatFolderSectionContext) => chatFolderSectionText(context, (session) => chatFolderStateFor(
      session,
      (id) => chatState.folders.get(id)?.folder,
      (id) => pendingSlugFor.has(id),
    )),
  }), 'dsh-chat-manager: system prompt section')

  // ---- HTTP helpers ----
  function sendJson(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!raw.trim()) return {}
    return JSON.parse(raw) as Record<string, unknown>
  }

  /** Workspace storage domain handle (undefined when the domain is absent). */
  const workspaceDomain = (): ReturnType<HostCtx['storageDomain']['get']> => ctx.storageDomain.get('workspace')

  /**
   * Drop one id from the registry-global archive set through the platform's own
   * un-archive — a real platform write, not a UI mask: the Host's
   * `agent/pre-step` gate and every client snapshot read that same field, and it
   * is durable when the call resolves (the storage domain rewrites
   * `workspace.json` before updating memory and emitting `domain/changed`, which
   * is what pushes the `archived` increment to every client). The platform
   * method is idempotent and serialized on the registry's operation chain, so no
   * precondition read is needed and no concurrent archive can be overwritten.
   */
  async function removeFromArchive(sid: string): Promise<void> {
    await ctx.workspaceRegistry.unarchiveSession(sid)
  }

  // ---- routes ----
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/state',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const domain = workspaceDomain()
        const archived = domain ? [...(domain.global.get().archivedSessionIds ?? [])] : []
        // Workspace-title prefix per archived session: the accounting slot
        // stays, so the owning workspace(s) still list it (first title wins).
        const workspaceTitleOfSession = new Map<string, string>()
        for (const workspace of ctx.workspaceRegistry.list()) {
          for (const sessionId of workspace.sessionIds) {
            if (!workspaceTitleOfSession.has(sessionId)) workspaceTitleOfSession.set(sessionId, workspace.title)
          }
        }
        // The archive ledger is the list's authority, so the rows exist BEFORE
        // the titles are read: a failed title read then costs the titles, not
        // the rows. (The older shape caught the failure into an empty list, so
        // one bad read showed "no archived sessions" while the ledger listed
        // some — the same "warn + empty 200" this plugin refuses elsewhere.)
        let archivedRows: ArchivedChatRow[] = archived.map((sessionId) => ({
          sessionId,
          title: '',
          workspaceTitle: workspaceTitleOfSession.get(sessionId) ?? '',
          updatedAt: 0,
        }))
        try {
          const results = await ctx.sessionQuery.readTitleSnapshots(archived)
          const titleOfRow = new Map(archivedRows.map((row) => [row.sessionId, row]))
          for (const r of results) {
            const row = titleOfRow.get(r.sessionId)
            if (row === undefined) continue
            const value = r.status === 'fulfilled' ? r.value : undefined
            // Keep rejected rows too: the client falls back to the untitled
            // placeholder instead of dropping the entry (spec: 缺失者回退标题
            // 占位), so a broken snapshot never hides an archived session.
            row.title = (value && value.title && value.title.title) || ''
            row.updatedAt = (value && value.title && value.title.updatedAt)
              ?? (value && value.session ? (value.session.createdAt ?? 0) : 0)
          }
        } catch (err) {
          console.warn('[dsh-chat-manager] title snapshot read failed:', errorMessage(err))
        }
        const folders: Record<string, ChatFolderEntry> = {}
        for (const [sid, entry] of chatState.folders) folders[sid] = entry
        sendJson(res, 200, {
          documentsRoot: chatState.documentsRoot,
          dshRoot: chatState.root,
          folders,
          archived: archivedRows,
          // Host identity, not chat state: a probe (or a user) can tell one Host
          // process from the next one, which is what makes "survives a Host
          // restart" an assertable claim instead of a procedure note.
          hostStartedAt: chatState.hostStartedAt,
        })
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) })
      }
    },
  }), 'dsh-chat-manager: state route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/ensure-date-folder',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        await readBody(req)
        // Boot failure leaves `root` null: a relative join would mkdir a
        // bare date folder into the DSH process cwd, so reject instead.
        if (chatState.root === null || chatState.root.length === 0) {
          return sendJson(res, 500, { error: 'chat root unavailable' })
        }
        const dateFolder = path.join(chatState.root, todayString())
        fs.mkdirSync(dateFolder, { recursive: true })
        // This folder becomes the new session's workspace root, and DSH's
        // `workspace-write` sandbox provisions that root on the chat's first
        // confined tool call — which needs WRITE_DAC + WRITE_OWNER on it. A
        // fresh folder inherits what its parent grants, and a parent on a
        // volume without a CREATOR OWNER entry grants only "Modify": the tool
        // call then dies with `SetNamedSecurityInfoW failed (Win32 5):
        // grantWrite(<dateFolder>)`. Make the folder provisionable BEFORE any
        // session can start in it. Best-effort: no ACE is needed at all under
        // `danger-full-access`, so a failure reports instead of blocking.
        const folderAccess = ensureWindowsFolderAccess(dateFolder, {
          deadline: Date.now() + CHAT_FOLDER_ROUTE_BUDGET_MS,
        })
        if (!folderAccess.ok) {
          console.warn(`[dsh-chat-manager] chat folder not provisionable: ${dateFolder} (${folderAccess.detail ?? 'unknown'})`)
        }
        let workspace = await ctx.workspaceRegistry.resolveByPath(dateFolder)
        if (workspace === undefined) workspace = await ctx.workspaceRegistry.create(dateFolder)
        sendJson(res, 200, { workspaceId: workspace.id, dateFolder, folderAccess })
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) })
      }
    },
  }), 'dsh-chat-manager: ensure-date-folder route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/search-chats',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readBody(req)
        const query = String(body.query ?? '').trim().toLowerCase()
        if (!query) return sendJson(res, 200, { items: [] })
        const domain = workspaceDomain()
        const archived = new Set(domain ? domain.global.get().archivedSessionIds ?? [] : [])
        const records = await ctx.sessionQuery.listSessions()
        const chatRecords = records.filter(
          (r) => r.header && r.header.cwd && isUnderChatRoot(r.header.cwd, chatState.root)
            && r.header.origin !== SUBAGENT_ORIGIN
            && !archived.has(r.header.id),
        )
        const byId = new Map(chatRecords.map((r) => [r.header.id, r]))
        const ids = [...byId.keys()]
        const titleOf = new Map<string, string>()
        try {
          const results = await ctx.sessionQuery.readTitleSnapshots(ids)
          for (const r of results) {
            if (r.status !== 'fulfilled') continue
            titleOf.set(r.sessionId, (r.value && r.value.title && r.value.title.title) || '')
          }
        } catch (err) {
          console.warn('[dsh-chat-manager] title read failed:', errorMessage(err))
        }
        const matched = new Set<string>()
        for (const [sid, title] of titleOf) {
          if (title.toLowerCase().includes(query)) matched.add(sid)
        }
        try {
          const page = await ctx.sessionQuery.searchSessions({ query, limit: 20 })
          for (const hit of page.items ?? []) {
            const sid = (hit as { header?: { id?: string }; sessionId?: string }).header
              ? (hit as { header: { id: string } }).header.id
              : (hit as { sessionId?: string }).sessionId
            if (sid != null && byId.has(sid)) matched.add(sid)
          }
        } catch (err) {
          console.warn('[dsh-chat-manager] content search failed:', errorMessage(err))
        }
        const items: ChatSearchHit[] = [...matched].map((sid) => ({ sessionId: sid, title: titleOf.get(sid) || '' }))
        sendJson(res, 200, { items })
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) })
      }
    },
  }), 'dsh-chat-manager: search route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/delete-session',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readBody(req)
        const sid = String(body.sessionId ?? '')
        if (!sid) return sendJson(res, 400, { error: 'missing sessionId' })
        // 1) Durable artifact first: remove the persisted log. A failure here
        //    fails the request and leaves the archive/workspace state untouched,
        //    so a broken delete can never resurrect the session into a list.
        try {
          // `list()` returns snapshots, and a snapshot carries its metadata
          // under `.header` — there is no `.id` on the snapshot itself. Reading
          // the id off the snapshot matched nothing, so every delete silently
          // kept its log (the request still answered 200) and the Session
          // returned on the next Host start. `stat` is the direct lookup that
          // closes the same gap for a Session the listing does not carry.
          const snapshots = await ctx.sessionPersistence.list()
          const snapshot = snapshots.find(
            (entry: { header?: { id?: string } }) => entry.header?.id === sid,
          ) ?? await ctx.sessionPersistence.stat(sid)
          // The Host's public live lookup (the same call the Workspace registry's
          // own `sessionKnown` uses). Both branches below consult it: a Session the
          // Host still holds live can grow an artifact again, so no branch may
          // report success without one.
          const live = ctx.get('sessions')?.get?.(sid)
          const liveWarning = ' the Host still holds it live, so a later flush could write it back:'
            + ' restart the Host and retry.'
          if (snapshot === undefined) {
            // The Host names no stored Session. Two very different situations reach
            // here, and only one of them may answer 200:
            //   - a ghost id (an archived row whose log is already gone, or a stale
            //     client request): nothing on disk and nothing live, so the
            //     accounting-only delete below IS the complete answer;
            //   - a Session the Host still holds live (its artifact was removed out
            //     of band, or became unreadable to the persistence layer — `list()`
            //     skips an artifact whose header it cannot parse): a 200 here would
            //     hide the row with a client tombstone while a live write handle can
            //     still write that artifact back, i.e. the exact "deleted row comes
            //     back" disagreement the delete route must never create.
            // NOTE: a merely *unmaterialized* live Session never lands here — the
            // JSONL backend lists its own created-but-unmaterialized Sessions, so it
            // takes the artifact branch below and is refused by that branch's
            // "reported a stored session but no log exists" error. This guard is the
            // defensive half of the same rule for everything the listing cannot see.
            if (live !== undefined) {
              throw new Error(`the Host names no stored log for ${sid} yet${liveWarning}`)
            }
            console.warn(`[dsh-chat-manager] delete-session: the Host reports no stored session for ${sid}; removing accounting only`)
          } else {
            // `locate` is the backend's own artifact mapping (kind + absolute
            // path) from a stored header. It is the JSONL backend's private
            // refusal-diagnostics hook, so a Host build without it cannot name
            // the artifact — and a delete that cannot name its artifact must
            // not report success.
            if (typeof ctx.sessionPersistence.locate !== 'function') {
              throw new Error('this Host build exposes no sessionPersistence.locate: the session log cannot be removed')
            }
            const located = ctx.sessionPersistence.locate(snapshot.header)
            const artifact: unknown = located?.path
            if (typeof artifact !== 'string' || artifact === '') {
              throw new Error(`the Host named no session log for ${sid}`)
            }
            // `locate` names the file the CURRENT format would write
            // (`session.v4.jsonl.zstd`), while a migrated Session keeps its
            // earlier generations beside it (`session.jsonl.zstd` +
            // `session.v3.jsonl.zstd`). The durable unit is therefore the
            // Session's own directory, not that one file name: removing only
            // the located path deleted nothing at all and left the Session to
            // reappear on the next Host start.
            const dir = path.dirname(artifact)
            // Only a directory named after this Session may go wholesale;
            // anything else falls back to the single located file.
            const ownsDir = path.basename(dir) === sid
            // The one platform-split branch of this route. On POSIX the session
            // directory IS the lease holder (its `session.lock`) and the only
            // way to stop a live write handle from recreating the log
            // (`open(path, 'a')` creates), so a live session is refused there
            // rather than deleted; Windows' lease is a path-derived kernel
            // semaphore with no file, so the delete stays safe and unchanged.
            const removal = planSessionArtifactRemoval({
              platform: process.platform,
              live: live !== undefined,
              artifactInSessionDirectory: ownsDir,
            })
            if (removal === 'refuse-live-posix') throw new Error(POSIX_LIVE_DELETE_REFUSAL)
            // Materialize BEFORE removing, unconditionally: a Session this
            // process still tracks may hold bytes the backend has not written,
            // and a later (shutdown) flush would recreate what this delete just
            // removed — the artifact merely existing on disk does not prove
            // there is nothing pending. `flush` is the service's documented
            // durability barrier; a failure only warns, because the removal and
            // the verification below still have to prove themselves.
            try {
              await ctx.sessionPersistence.flush()
            } catch (err) {
              console.warn('[dsh-chat-manager] pre-delete flush failed:', errorMessage(err))
            }
            if (removal === 'remove-directory' && fs.existsSync(dir)) {
              fs.rmSync(dir, { recursive: true, force: true })
              // Verified removal: a locked or undeletable artifact must fail the
              // request instead of leaving a Session that comes back later.
              if (fs.existsSync(dir)) throw new Error(`session log survived removal: ${dir}`)
            } else if (fs.existsSync(artifact)) {
              fs.rmSync(artifact, { recursive: true, force: true })
              if (fs.existsSync(artifact)) throw new Error(`session log survived removal: ${artifact}`)
              // This branch ran because the artifact sits outside a directory
              // named after the Session, so the directory cannot be removed
              // wholesale: any sibling generation left behind would resurrect
              // the Session, and guessing is not worth a silent 200.
              const siblings = fs.readdirSync(dir)
              if (siblings.length > 0) {
                throw new Error(`session log left sibling artifacts behind: ${siblings.join(', ')}`)
              }
            } else {
              // The Host names a stored Session, yet no artifact exists even
              // after the flush. Nothing here proves the log is gone, and a 200
              // would tombstone the row while the durable Session survives (or a
              // live handle writes it back).
              throw new Error(
                `the Host reported a stored session but no log exists for ${sid}`
                + (live === undefined ? '' : `;${liveWarning}`),
              )
            }
          }
        } catch (err) {
          console.warn('[dsh-chat-manager] artifact removal failed:', errorMessage(err))
          throw new Error(`failed to remove session log: ${errorMessage(err)}`)
        }
        // 2) Workspace accounting: detach the session from every workspace
        //    record that still lists it (sanctioned registry write path).
        for (const workspace of ctx.workspaceRegistry.list()) {
          if (workspace.sessionIds.includes(sid)) {
            await workspace.detachSession(sid)
          }
        }
        // 3) Best-effort pin cleanup. The pin set is registry-global, so a
        //    deleted id would linger there forever; `unpinSession` is the
        //    platform's own write (idempotent, and, unlike `pinSession`, it
        //    checks no session existence — the log is already gone by now). A
        //    dangling pin is inert (pin order derives its membership from the
        //    live lists), so a failure warns instead of turning a completed
        //    delete into a 500.
        try {
          await ctx.workspaceRegistry.unpinSession(sid)
        } catch (err) {
          console.warn('[dsh-chat-manager] pin cleanup failed:', errorMessage(err))
        }
        // 4) Chat-folder registry cleanup (best-effort; the folder itself
        //    stays on disk). Runs before the archive removal below, so an
        //    unexpected failure here also leaves the archive untouched. The id
        //    is named explicitly: the registry is a read-modify-write shared
        //    with the other Host, so "absent from this process's map" is not
        //    enough to retire an entry.
        const entry = chatState.folders.get(sid)
        if (entry) {
          chatState.folders.delete(sid)
          editRegistry(path.dirname(entry.folder), (sessions) => { delete sessions[sid] })
        }
        // 5) Best-effort projection-cache cleanup. The platform's
        //    session_projcache domain has no prune path (rows are written
        //    once per session and never removed), so without this a deleted
        //    session's checkpoint would linger in the cache file forever.
        //    Cache rows are never authoritative and reads are identity-bound,
        //    so this is pure hygiene: a failure is logged, not fatal.
        try {
          const cacheDomain = ctx.storageDomain.get('session_projcache')
          const cacheTable = cacheDomain ? cacheDomain.table('sessions') : undefined
          if (cacheTable !== undefined) await cacheTable.delete(sid)
        } catch (err) {
          console.warn('[dsh-chat-manager] projection cache cleanup failed:', errorMessage(err))
        }
        // 6) Un-archive LAST: every fallible step above has succeeded, so the
        //    archive set only changes on a fully successful delete. A failure
        //    anywhere before this point 500s and leaves the archive intact
        //    (a broken delete can never resurrect the session into a list).
        await removeFromArchive(sid)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) })
      }
    },
  }), 'dsh-chat-manager: delete route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/restore-session',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readBody(req)
        const sid = String(body.sessionId ?? '')
        if (!sid) return sendJson(res, 400, { error: 'missing sessionId' })
        await removeFromArchive(sid)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) })
      }
    },
  }), 'dsh-chat-manager: restore route')

  // ---- boot: resolve documents root and scan existing chat folders ----
  try {
    const override = chatRootOverride()
    if (override !== null) {
      // The override names the chat root itself, so no platform lookup runs and
      // `/state` reports `documentsRoot: null` (the client reads `dshRoot`).
      chatState.root = override
    } else {
      chatState.documentsRoot = resolveDocuments()
      chatState.root = path.join(chatState.documentsRoot, CHAT_ROOT_NAME)
    }
    const dateFolders = scanChatFolders()
    console.log(`[dsh-chat-manager] chat root: ${chatState.root}`)
    // Every existing date folder is some chat's workspace root and needs the
    // same explicit full-control ACE a freshly created one gets: on a volume
    // whose root ACL carries no CREATOR OWNER entry, the inherited "Modify"
    // grants neither WRITE_DAC nor WRITE_OWNER, so DSH's workspace grant fails
    // and that chat's first confined tool call dies with
    // `SetNamedSecurityInfoW failed (Win32 5)`. Read-first, so an
    // already-provisionable folder is never re-ACLed (and no inheritable ACE is
    // re-propagated over a large chat folder); a failure only warns, because
    // the ACE is unnecessary under `danger-full-access`.
    if (process.platform === 'win32' && dateFolders.length > 0) {
      // The pass is synchronous (it runs on the startup path), so the deadline
      // goes into the helper: it starts no further icacls call once its floor is
      // reached, which bounds the pass by this budget plus that floor even when
      // the volume stalls mid-folder. A dead or very slow volume must not hold
      // the Host's startup indefinitely. An exhausted pass warns and stops; the
      // chat route still heals today's folder on demand.
      const deadline = Date.now() + CHAT_FOLDER_SWEEP_BUDGET_MS
      let checked = 0
      let repaired = 0
      let failed = 0
      let exhausted = false
      for (const dateFolder of dateFolders) {
        if (Date.now() > deadline) {
          exhausted = true
          break
        }
        checked += 1
        const access = ensureWindowsFolderAccess(dateFolder, { deadline })
        if (!access.ok) {
          failed += 1
          console.warn(`[dsh-chat-manager] chat folder not provisionable: ${dateFolder} (${access.detail ?? 'unknown'})`)
        } else if (access.changed) {
          repaired += 1
        }
      }
      console.log(
        `[dsh-chat-manager] chat folder access: ${checked}/${dateFolders.length} checked,`
        + ` ${repaired} made provisionable, ${failed} failed${exhausted ? ' (sweep budget exhausted)' : ''}`,
      )
    }
  } catch (err) {
    console.warn('[dsh-chat-manager] boot scan failed:', err)
  }
}

export { apply, inject, name }
// Re-exported for the decision-table tests and the ACL acceptance probe: this
// host cannot run the POSIX branch (or a real icacls/ACL evaluation) under test,
// so `test/*.test.mjs` pins the pure seams from the built bundle — the
// session-removal plan, the chat-folder section text and its delivery trigger
// (whose assembly/delivery context no probe can read without spending a model
// turn), and the DACL reader/decision the Windows folder check is built from —
// while `.scratch/accept11-acl-deny-shapes.mjs` drives `ensureWindowsFolderAccess`
// itself (the same bundle the Host runs) against real folders and DSH's own grant.
export { planSessionArtifactRemoval }
export { chatFolderSectionText, chatFolderState, chatFolderStateFor, chatPromptTrigger, SUBAGENT_ORIGIN } from './shared/prompt-section.ts'
export {
  ensureWindowsFolderAccess, evaluateDacl, hasTokenGroups, parseDaclSddl, parseOwnSid, parseTokenSids,
  pickSddlLine, planFolderAccess,
} from './win-folder-access.ts'
