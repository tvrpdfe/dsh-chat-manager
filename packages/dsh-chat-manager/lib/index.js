// dsh-chat-manager — host half.
// Chat-session folders (Documents/DSH/YYYY-MM-DD/xxxx), chat search,
// session delete, and archived-session restore for the Web GUI.
// Runs as a row of the user's profile composition.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

const name = 'dsh-chat-manager'

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

function apply(ctx) {
  const chatState = {
    documentsRoot: null,
    root: null,
    folders: new Map(), // sessionId -> { slug, folder }
  }

  const norm = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
  const normLower = (p) => norm(p).toLowerCase()

  function isUnderChatRoot(cwd) {
    if (!cwd || !chatState.root) return false
    const a = normLower(cwd)
    const b = normLower(chatState.root)
    return a === b || a.startsWith(b + '/')
  }

  function resolveDocuments() {
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

  function todayString(now = new Date()) {
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // ---- chat-folder registry: one .dsh-chat.json per date folder ----
  function registryFile(dateFolder) {
    return path.join(dateFolder, '.dsh-chat.json')
  }

  function readRegistry(dateFolder) {
    try {
      const raw = JSON.parse(fs.readFileSync(registryFile(dateFolder), 'utf8'))
      const sessions = raw && typeof raw.sessions === 'object' && raw.sessions !== null ? raw.sessions : {}
      return sessions
    } catch {
      return {}
    }
  }

  function writeRegistry(dateFolder) {
    const sessions = {}
    for (const [sid, entry] of chatState.folders) {
      if (normLower(path.dirname(entry.folder)) === normLower(dateFolder)) sessions[sid] = entry
    }
    try {
      fs.writeFileSync(registryFile(dateFolder), JSON.stringify({ sessions }, null, 2), 'utf8')
    } catch (err) {
      console.warn('[dsh-chat-manager] registry write failed:', err)
    }
  }

  function scanChatFolders() {
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
  function cleanSlug(raw, maxWords = 4) {
    return String(raw ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 0)
      .slice(0, maxWords)
      .join('-')
  }

  function localSlug(text) {
    const slug = cleanSlug(text)
    return slug.length >= 2 ? slug : 'chat'
  }

  function uniqueSlug(dateFolder, slug) {
    let candidate = slug
    let n = 2
    for (;;) {
      const folder = path.join(dateFolder, candidate)
      if (!fs.existsSync(folder)) return { slug: candidate, folder }
      let taken = false
      for (const entry of chatState.folders.values()) {
        if (normLower(entry.folder) === normLower(folder)) {
          taken = true
          break
        }
      }
      if (!taken) return { slug: candidate, folder }
      candidate = `${slug}-${n}`
      n += 1
    }
  }

  async function generateSlug(text) {
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
          if (chunk.type === 'text-delta') out += chunk.text
          else if (chunk.type === 'finish') {
            if (chunk.reason && chunk.reason.kind === 'error') throw new Error('slug model call failed')
          }
        }
        const slug = cleanSlug(out)
        if (slug) return slug
      } catch (err) {
        console.warn('[dsh-chat-manager] LLM slug failed, using local fallback:', err && err.message ? err.message : String(err))
      } finally {
        clearTimeout(timer)
      }
    }
    return localSlug(text)
  }

  // ---- first-message hook: create the slug subfolder ----
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    const data = event.data
    if (!data || data.source == null || data.source.kind !== 'user') return
    const header = session.header
    if (!header || !isUnderChatRoot(header.cwd)) return
    if (chatState.folders.has(session.id)) return
    const text = (Array.isArray(data.content) ? data.content : [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim()
    if (!text) return
    const dateFolder = header.cwd
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
  })

  // ---- system-prompt section: chat sessions write into their slug folder ----
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'dsh-chat-manager/chat-folder',
    order: 150,
    text: (context) => {
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
  function sendJson(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  async function readBody(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!raw.trim()) return {}
    return JSON.parse(raw)
  }

  const domainHandle = () => ctx.storageDomain.get('workspace')

  async function removeFromArchive(sid) {
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
    handler: async (req, res) => {
      try {
        const domain = domainHandle()
        const archived = domain ? [...(domain.global.get().archivedSessionIds ?? [])] : []
        let archivedRows = []
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
              updatedAt: (value && value.title && value.title.updatedAt)
                ?? (value && value.session ? value.session.createdAt : 0),
            }
          })
        } catch (err) {
          console.warn('[dsh-chat-manager] title snapshot read failed:', err)
        }
        const folders = {}
        for (const [sid, entry] of chatState.folders) folders[sid] = entry
        sendJson(res, 200, {
          documentsRoot: chatState.documentsRoot,
          dshRoot: chatState.root,
          folders,
          archived: archivedRows,
        })
      } catch (err) {
        sendJson(res, 500, { error: err && err.message ? err.message : String(err) })
      }
    },
  }), 'dsh-chat-manager: state route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/ensure-date-folder',
    handler: async (req, res) => {
      try {
        await readBody(req)
        const dateFolder = path.join(chatState.root, todayString())
        fs.mkdirSync(dateFolder, { recursive: true })
        let workspace = await ctx.workspaceRegistry.resolveByPath(dateFolder)
        if (workspace === undefined) workspace = await ctx.workspaceRegistry.create(dateFolder)
        sendJson(res, 200, { workspaceId: workspace.id, dateFolder })
      } catch (err) {
        sendJson(res, 500, { error: err && err.message ? err.message : String(err) })
      }
    },
  }), 'dsh-chat-manager: ensure-date-folder route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/search-chats',
    handler: async (req, res) => {
      try {
        const body = await readBody(req)
        const query = String(body.query ?? '').trim().toLowerCase()
        if (!query) return sendJson(res, 200, { items: [] })
        const domain = domainHandle()
        const archived = new Set(domain ? domain.global.get().archivedSessionIds ?? [] : [])
        const records = await ctx.sessionQuery.listSessions()
        const chatRecords = records.filter(
          (r) => r.header && r.header.cwd && isUnderChatRoot(r.header.cwd)
            && r.header.origin !== 'subagent'
            && !archived.has(r.header.id),
        )
        const byId = new Map(chatRecords.map((r) => [r.header.id, r]))
        const ids = [...byId.keys()]
        const titleOf = new Map()
        try {
          const results = await ctx.sessionQuery.readTitleSnapshots(ids)
          for (const r of results) {
            if (r.status !== 'fulfilled') continue
            titleOf.set(r.sessionId, (r.value && r.value.title && r.value.title.title) || '')
          }
        } catch (err) {
          console.warn('[dsh-chat-manager] title read failed:', err)
        }
        const matched = new Set()
        for (const [sid, title] of titleOf) {
          if (title.toLowerCase().includes(query)) matched.add(sid)
        }
        try {
          const page = await ctx.sessionQuery.searchSessions({ query, limit: 20 })
          for (const hit of page.items ?? []) {
            const sid = hit.header ? hit.header.id : hit.sessionId
            if (sid != null && byId.has(sid)) matched.add(sid)
          }
        } catch (err) {
          console.warn('[dsh-chat-manager] content search failed:', err && err.message ? err.message : String(err))
        }
        const items = [...matched].map((sid) => ({ sessionId: sid, title: titleOf.get(sid) || '' }))
        sendJson(res, 200, { items })
      } catch (err) {
        sendJson(res, 500, { error: err && err.message ? err.message : String(err) })
      }
    },
  }), 'dsh-chat-manager: search route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/delete-session',
    handler: async (req, res) => {
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
          console.warn('[dsh-chat-manager] artifact removal failed:', err)
          throw new Error(`failed to remove session log: ${err && err.message ? err.message : String(err)}`)
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
          console.warn('[dsh-chat-manager] projection cache cleanup failed:', err)
        }
        // 5) Un-archive LAST: every fallible step above has succeeded, so the
        //    archive set only changes on a fully successful delete. A failure
        //    anywhere before this point 500s and leaves the archive intact
        //    (a broken delete can never resurrect the session into a list).
        await removeFromArchive(sid)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 500, { error: err && err.message ? err.message : String(err) })
      }
    },
  }), 'dsh-chat-manager: delete route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/chat-manager/restore-session',
    handler: async (req, res) => {
      try {
        const body = await readBody(req)
        const sid = String(body.sessionId ?? '')
        if (!sid) return sendJson(res, 400, { error: 'missing sessionId' })
        await removeFromArchive(sid)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 500, { error: err && err.message ? err.message : String(err) })
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
