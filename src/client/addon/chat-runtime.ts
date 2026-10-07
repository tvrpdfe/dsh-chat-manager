/**
 * dsh-chat-manager client runtime: shared module state between the workspace
 * browser fork, the chat section, and the archived-session settings page.
 *
 * Everything here is plugin-owned module state inside the bundle factory (a
 * single instance per page). Host facts reach the page through the
 * `/api/chat-manager/*` same-origin JSON routes; deleted-session tombstones
 * live in `localStorage` so a deleted live (attached) session stays hidden
 * until the Host process restart removes it from the baseline for good.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { isUnderChatRoot } from '../../shared/paths.ts'
import { readArchivedChatRows } from '../../shared/chat.ts'
import type { ArchivedChatRow, ChatFolderEntry } from '../../shared/chat.ts'

export { isUnderChatRoot }

/** Chat-folder state snapshot consumed through the `chat` hook. */
export interface ChatManagerState {
  /** The `Documents/DSH` root, or null while unknown (host boot failure). */
  root: string | null
  /** sessionId → chat folder entry (registry cache refreshed after every mutation). */
  folders: Record<string, ChatFolderEntry>
  /** Archived-session rows delivered by the state route (for the settings page). */
  archived: ArchivedChatRow[]
  /** True after the first state fetch settled (success or failure). */
  loaded: boolean
}

/** Render-observed mirror read by the New Session chat routing. */
export interface ChatRuntimeSnapshot {
  /** Current session id seen by the last browser render (for focus routing). */
  currentId: SessionId | undefined
  /** Chat session ids computed from the last browser render. */
  chatIds: ReadonlySet<SessionId>
  /** A no-arg Start-New-Session chat flow is already running. */
  inFlight: boolean
  /** Last workspace snapshot seen by the browser (for date-folder resolution). */
  workspaces: { path: string; workspaceId: string }[]
}

// ---- small observable source (HostObservable-shaped) ----
function createSource<T>(initial: T): {
  getSnapshot: () => T
  subscribe: (listener: () => void) => (() => void)
  set: (next: T) => void
  update: (fn: (current: T) => T) => void
} {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const fn of listeners) fn()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      snapshot = next
      notify()
    },
    update: (fn) => {
      snapshot = fn(snapshot)
      notify()
    },
  }
}

// ---- chat state source (HostObservable-shaped) ----
export const chatStateSource = createSource<ChatManagerState>({ root: null, folders: {}, archived: [], loaded: false })

// Restore-path mask: a successful restore removes the row on disk, but a
// failed follow-up refresh would surface the stale row again. Masked ids are
// hidden until the next successful snapshot — a snapshot that no longer lists
// the id (the restore landed) or lists it again (a legitimate re-archive from
// another surface) both release it. Module-level state survives settings-page
// remounts (the stale snapshot persists there).
/** Archived ids hidden by the restore-path mask (settings page overlay). */
export const archivedMaskSource = createSource<ReadonlySet<string>>(new Set())

/** Hide one archived row until a snapshot without it arrives (restore path). */
export function markArchivedMasked(sessionId: string): void {
  archivedMaskSource.set(new Set(archivedMaskSource.getSnapshot()).add(sessionId))
}

/** Attempt budget for one state pull: the first try plus two retries. */
const STATE_PULL_ATTEMPTS = 3
/** Backoff before the next attempt: 500ms after the first failure, 1000ms after the second. */
const STATE_PULL_BACKOFF_MS = [500, 1000]

/** One state pull: fetch, project, and commit the snapshot into the state source. */
function requestChatState(): Promise<ChatManagerState> {
  return fetch('/api/chat-manager/state')
    .then((res) => { if (!res.ok) throw new Error(`state request failed (${res.status})`); return res.json() })
    .then((data: { dshRoot?: unknown; folders?: unknown; archived?: unknown }) => {
      const snapshot: ChatManagerState = {
        root: typeof data.dshRoot === 'string' && data.dshRoot.length > 0 ? data.dshRoot : null,
        folders: data && typeof data.folders === 'object' && data.folders !== null
          ? data.folders as Record<string, ChatFolderEntry>
          : {},
        archived: readArchivedChatRows(data.archived),
        loaded: true,
      }
      // The fresh archive is authoritative in both directions: a restored id
      // either vanished from the ledger (the restore landed) or is listed
      // again (a legitimate re-archive from another surface). The mask is a
      // one-shot bridge for a FAILED follow-up refresh, so the next
      // successful snapshot releases it either way.
      archivedMaskSource.update(() => new Set())
      chatStateSource.set(snapshot)
      return snapshot
    })
}

/**
 * Re-pull `/api/chat-manager/state` into the chat state source, within a
 * bounded retry budget (one attempt per {@link STATE_PULL_ATTEMPTS}, waiting
 * {@link STATE_PULL_BACKOFF_MS} in between — never a long-lived poll).
 *
 * A single transient failure would otherwise leave `root` null for the life of
 * the page: chat Sessions would surface in the workspace area, the chat pane
 * would stay empty, and the no-argument New Session route would treat a chat
 * Session as a workspace one. Resolves with the refreshed snapshot; rejects
 * with the LAST fetch/parse failure (callers that only want a best-effort
 * refresh must `.catch(() => {})`), and marks the state loaded either way.
 */
export function refreshChatState(): Promise<ChatManagerState> {
  const attempt = async (index: number): Promise<ChatManagerState> => {
    try {
      return await requestChatState()
    } catch (err) {
      if (index + 1 >= STATE_PULL_ATTEMPTS) throw err
      await new Promise<void>((resolve) => { window.setTimeout(resolve, STATE_PULL_BACKOFF_MS[index]) })
      return await attempt(index + 1)
    }
  }
  return attempt(0).catch((err: unknown) => {
    chatStateSource.update((current) => ({ ...current, loaded: true }))
    throw err
  })
}

/** POST one JSON payload to a same-origin plugin route; rejects with the host error text. */
export async function rpcPost(pathName: string, payload: unknown): Promise<unknown> {
  const res = await fetch(pathName, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  let data: { error?: unknown } | null = null
  try {
    data = await res.json()
  } catch {
    // non-JSON error body: fall through to the status message
  }
  if (!res.ok) {
    throw new Error(data && typeof data.error === 'string' ? data.error : `request failed (${res.status})`)
  }
  return data ?? {}
}

/** Session-list refresh wired by the client entry (used after a delete). */
let refreshSessionsFn: (() => void) | null = null
export function setRefreshSessions(fn: (() => void) | null): void {
  refreshSessionsFn = fn
}

/** Run the full delete choreography and refresh the shared chat state. */
export async function performSessionDelete(sessionId: SessionId): Promise<void> {
  await rpcPost('/api/chat-manager/delete-session', { sessionId })
  markSessionDeleted(sessionId)
  if (refreshSessionsFn !== null) refreshSessionsFn()
  await refreshChatState().catch(() => {})
}

// ---- New Session chat routing mirror (HostObservable-shaped) ----
export const chatRuntimeSource = createSource<ChatRuntimeSnapshot>({
  currentId: undefined,
  chatIds: new Set(),
  inFlight: false,
  workspaces: [],
})

/** Publish the render-observed mirror (current session, chat ids, workspaces). */
export function setChatRuntimeSnapshot(next: Pick<ChatRuntimeSnapshot, 'currentId' | 'chatIds' | 'workspaces'>): void {
  chatRuntimeSource.update((current) => ({ ...current, ...next }))
}

/** Flip the in-flight flag without disturbing the render mirror. */
export function setChatInFlight(inFlight: boolean): void {
  chatRuntimeSource.update((current) => ({ ...current, inFlight }))
}

/**
 * Run one chat-opening flow under the shared in-flight gate (the routed New
 * Session path and the chat-header 新建聊天 button must not double-open a
 * chat during the ensure-date-folder + workspace-visibility wait). A failure
 * runs `onError` (the routed path falls back to the pristine startSession);
 * the gate always clears in `finally`.
 */
export function runChatFlow(start: () => Promise<void>, onError?: () => void): void {
  if (chatRuntimeSource.getSnapshot().inFlight) return
  setChatInFlight(true)
  start().catch(() => { onError?.() }).finally(() => { setChatInFlight(false) })
}

// ---- deleted-session tombstones (localStorage mirror of the Host delete) ----
const DELETED_IDS_KEY = 'dsh-chat-manager.deletedSessionIds'

function loadDeletedIds(): ReadonlySet<SessionId> {
  try {
    const raw = window.localStorage.getItem(DELETED_IDS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').map(x => x as SessionId) : [])
  } catch {
    return new Set()
  }
}

const deletedIdsSource = createSource<ReadonlySet<SessionId>>(loadDeletedIds())
export { deletedIdsSource }

function persistDeletedIds(): void {
  try {
    window.localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...deletedIdsSource.getSnapshot()]))
  } catch {
    // localStorage unavailable: the deletion still lands through refresh()
  }
}

export function markSessionDeleted(sessionId: SessionId): void {
  const current = deletedIdsSource.getSnapshot()
  if (current.has(sessionId)) return
  deletedIdsSource.set(new Set(current).add(sessionId))
  persistDeletedIds()
}

/** Drop tombstones whose id is gone from the current Host baseline (process restart). */
export function pruneDeletedIds(presentIds: ReadonlySet<SessionId>): void {
  const next = new Set<SessionId>()
  let changed = false
  for (const id of deletedIdsSource.getSnapshot()) {
    if (presentIds.has(id)) next.add(id)
    else changed = true
  }
  if (!changed) return
  deletedIdsSource.set(next)
  persistDeletedIds()
}

// ---- chatManager namespace dictionaries (settings page + confirm dialogs) ----
export const chatManagerZh = {
  'settings.archived': '已归档会话',
  'archived.loading': '正在加载…',
  'archived.empty': '暂无已归档会话',
  'archived.restore': '恢复',
  'archived.restoring': '恢复中…',
  'archived.delete': '删除',
  'archived.deleting': '删除中…',
  'archived.untitled': '未命名会话',
  'archived.workspacePrefix': '{name}：',
  'archived.delete.desc': '将删除会话“{name}”的聊天记录。其文件夹会保留在磁盘上。此操作不可撤销。',
  'close': '关闭',
  'cancel': '取消',
  'time.now': '刚刚',
  'time.minutes': '{n}分钟',
  'time.hours': '{n}小时',
  'time.days': '{n}天',
  'time.months': '{n}个月',
  'time.years': '{n}年',
} as const

export const chatManagerEn = {
  'settings.archived': 'Archived sessions',
  'archived.loading': 'Loading…',
  'archived.empty': 'No archived sessions',
  'archived.restore': 'Restore',
  'archived.restoring': 'Restoring…',
  'archived.delete': 'Delete',
  'archived.deleting': 'Deleting…',
  'archived.untitled': 'Untitled session',
  'archived.workspacePrefix': '{name}: ',
  'archived.delete.desc': 'This deletes the conversation record of “{name}”. Its folder is kept on disk. This cannot be undone.',
  'close': 'Close',
  'cancel': 'Cancel',
  'time.now': 'now',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} as const

export type ChatManagerKey = keyof typeof chatManagerZh
