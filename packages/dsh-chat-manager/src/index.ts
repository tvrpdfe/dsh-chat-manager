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
import type { ArchivedChatRow, ChatFolderEntry, ChatSearchHit } from './shared/chat.ts'

const name = 'dsh-chat-manager'

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
  webServer: {
    register: (route: object, ...rest: unknown[]) => unknown
  }
  workspaceRegistry: {
    list: () => WorkspaceView[]
    resolveByPath: (p: string) => Promise<WorkspaceView | undefined>
    create: (p: string) => Promise<WorkspaceView>
    requireState: () => { archivedSessionIds: string[] }
    setState: (state: { archivedSessionIds: string[] }) => Promise<void>
  }
  storageDomain: {
    get: (name: string) => {
      global: { get: () => { archivedSessionIds?: string[] } }
      table: (name: string) => { delete: (key: string) => Promise<void> }
    } | undefined
  }
  sessionPersistence: {
    list: () => Promise<Array<{ id: string }>>
    locate: (meta: { id: string }) => { path?: string } | undefined
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

interface SessionEventData {
  source?: { kind?: string }
  content?: Array<{ type?: string; text?: string }>
}

function apply(ctx: HostCtx): void {
  const chatState: {
    documentsRoot: string | null
    root: string | null
    folders: Map<string, ChatFolderEntry>
  } = {
    documentsRoot: null,
    root: null,
    folders: new Map(),
  }

  /** Session ids whose slug generation is in flight (first-message dedup). */
  const pendingSlugFor = new Set<string>()

  function resolveDocuments(): string {
    if (chatState.documentsRoot) return chatState.documentsRoot
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-NoProfile', '-Command', '[Environment]::GetFolderPath("MyDocuments")'], { encoding: 'utf8' })
      const out = (r.stdout || '').trim()
      if (r.status === 0 && out) {
        chatState.documentsRoot = out
        return out
      }
    } else if (process.platform === 'linux') {
      const r = spawnSync('xdg-user-dir', ['DOCUMENTS'], { encoding: 'utf8' })
      const out = (r.stdout || '').trim()
      if (r.status === 0 && out) {
        chatState.documentsRoot = out
        return out
      }
    }
    chatState.documentsRoot = path.join(os.homedir(), 'Documents')
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

  function readRegistry(dateFolder: string): Record<string, ChatFolderEntry> {
    try {
      const raw = JSON.parse(fs.readFileSync(registryFile(dateFolder), 'utf8')) as { sessions?: Record<string, ChatFolderEntry> }
      const sessions = raw && typeof raw.sessions === 'object' && raw.sessions !== null ? raw.sessions : {}
      return sessions
    } catch {
      return {}
    }
  }

  function writeRegistry(dateFolder: string): void {
    const sessions: Record<string, ChatFolderEntry> = {}
    for (const [sid, entry] of chatState.folders) {
      if (normalizePathLower(path.dirname(entry.folder)) === normalizePathLower(dateFolder)) sessions[sid] = entry
    }
    try {
      fs.writeFileSync(registryFile(dateFolder), JSON.stringify({ sessions }, null, 2), 'utf8')
    } catch (err) {
      console.warn('[dsh-chat-manager] registry write failed:', err)
    }
  }

  function scanChatFolders(): void {
    if (!chatState.root || !fs.existsSync(chatState.root)) return
    let names
    try {
      names = fs.readdirSync(chatState.root, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of names) {
      if (!d.isDirectory()) continue
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue
      const dateFolder = path.join(chatState.root, d.name)
      const sessions = readRegistry(dateFolder)
      for (const [sid, entry] of Object.entries(sessions)) {
        if (entry && typeof entry.slug === 'string' && typeof entry.folder === 'string' && !chatState.folders.has(sid)) {
          chatState.folders.set(sid, { slug: entry.slug, folder: entry.folder })
        }
      }
    }
  }

  // ---- slug generation (LLM first, local fallback) ----
  // Both paths run through the shared `cleanSlug`, which guarantees the
  // spec's 2–4 lowercase hyphenated word range (short sources pad with the
  // stable filler `session`; an empty source starts from `chat`).

  function uniqueSlug(dateFolder: string, slug: string): ChatFolderEntry {
    const words = slug.split('-')
    let n = 0
    for (;;) {
      const candidate = collisionSlug(words, n)
      const folder = path.join(dateFolder, candidate)
      if (!fs.existsSync(folder)) return { slug: candidate, folder }
      let taken = false
      for (const entry of chatState.folders.values()) {
        if (normalizePathLower(entry.folder) === normalizePathLower(folder)) {
          taken = true
          break
        }
      }
      if (!taken) return { slug: candidate, folder }
      n += 1
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
            source: { kind: 'plugin', plugin: 'dsh-chat-manager' },
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
  ctx.on('session/event', (session: { id: string; header?: { cwd?: string } }, event: { type?: string; data?: SessionEventData }) => {
    if (event.type !== 'user/message') return
    const data = event.data
    if (!data || data.source == null || data.source.kind !== 'user') return
    const header = session.header
    if (!header || header.cwd === undefined || !isUnderChatRoot(header.cwd, chatState.root)) return
    // Already registered, or a slug generation is still running for this
    // session ("first user message" is enforced per session: the in-flight
    // window between the trigger and the registry write must not re-run the
    // generation for a second user message; the 15s LLM budget makes that
    // window wide enough to matter).
    if (chatState.folders.has(session.id) || pendingSlugFor.has(session.id)) return
    const text = (Array.isArray(data.content) ? data.content : [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text ?? '')
      .join(' ')
      .trim()
    if (!text) return
    const dateFolder = header.cwd
    pendingSlugFor.add(session.id)
    generateSlug(text)
      .then((slug) => uniqueSlug(dateFolder, slug))
      .then(({ slug, folder }) => {
        try {
          fs.mkdirSync(folder, { recursive: true })
        } catch (err) {
          console.warn('[dsh-chat-manager] slug folder mkdir failed:', err)
          return
        }
        chatState.folders.set(session.id, { slug, folder })
        writeRegistry(dateFolder)
        console.log(`[dsh-chat-manager] chat folder ready: ${folder}`)
      })
      .catch((err) => console.warn('[dsh-chat-manager] slug folder setup failed:', err))
      .finally(() => { pendingSlugFor.delete(session.id) })
  })

  // ---- system-prompt section: chat sessions write into their slug folder ----
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'dsh-chat-manager/chat-folder',
    order: 150,
    text: (context: { agent?: { sessionId?: string }; sessionId?: string }) => {
      const sid = context.agent != null ? context.agent.sessionId : context.sessionId
      if (sid == null) return ''
      const entry = chatState.folders.get(sid)
      if (!entry) return ''
      return [
        'You are working in a chat session. Do not read or write files directly in the chat working directory.',
        `Put all file input/output for this chat into the chat folder: ${entry.folder}`,
        'The chat folder is the workspace root for every file operation in this session (relative paths resolve against it).',
      ].join('\n')
    },
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

  async function removeFromArchive(sid: string): Promise<void> {
    const registry = ctx.workspaceRegistry
    const state = registry.requireState()
    if (!state.archivedSessionIds.includes(sid)) return
    await registry.setState({
      ...state,
      archivedSessionIds: state.archivedSessionIds.filter((x) => x !== sid),
    })
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
        let archivedRows: ArchivedChatRow[] = []
        try {
          const results = await ctx.sessionQuery.readTitleSnapshots(archived)
          archivedRows = results.map((r) => {
            const value = r.status === 'fulfilled' ? r.value : undefined
            // Keep rejected rows too: the client falls back to the untitled
            // placeholder instead of dropping the entry (spec: 缺失者回退标题
            // 占位), so a broken snapshot never hides an archived session.
            return {
              sessionId: r.sessionId,
              title: (value && value.title && value.title.title) || '',
              workspaceTitle: workspaceTitleOfSession.get(r.sessionId) ?? '',
              updatedAt: (value && value.title && value.title.updatedAt)
                ?? (value && value.session ? (value.session.createdAt ?? 0) : 0),
            }
          })
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
        let workspace = await ctx.workspaceRegistry.resolveByPath(dateFolder)
        if (workspace === undefined) workspace = await ctx.workspaceRegistry.create(dateFolder)
        sendJson(res, 200, { workspaceId: workspace.id, dateFolder })
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
            && r.header.origin !== 'subagent'
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
          const headers = await ctx.sessionPersistence.list()
          const meta = headers.find((h) => h.id === sid)
          if (meta) {
            const loc = ctx.sessionPersistence.locate(meta)
            if (loc && loc.path) {
              fs.rmSync(loc.path, { recursive: true, force: true })
              try {
                fs.rmdirSync(path.dirname(loc.path))
              } catch {
                // session directory keeps other files; leave it
              }
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
        // 3) Chat-folder registry cleanup (best-effort; the folder itself
        //    stays on disk). Runs before the archive removal below, so an
        //    unexpected failure here also leaves the archive untouched.
        const entry = chatState.folders.get(sid)
        if (entry) {
          chatState.folders.delete(sid)
          writeRegistry(path.dirname(entry.folder))
        }
        // 4) Best-effort projection-cache cleanup. The platform's
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
        // 5) Un-archive LAST: every fallible step above has succeeded, so the
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
    chatState.documentsRoot = resolveDocuments()
    chatState.root = path.join(chatState.documentsRoot, CHAT_ROOT_NAME)
    scanChatFolders()
    console.log(`[dsh-chat-manager] chat root: ${chatState.root}`)
  } catch (err) {
    console.warn('[dsh-chat-manager] boot scan failed:', err)
  }
}

export { apply, inject, name }
