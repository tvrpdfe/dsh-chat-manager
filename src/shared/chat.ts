/**
 * Wire and registry shapes shared by the host half and the client bundle:
 * the chat-folder registry entry, the chat-search hit, and the archived
 * session row delivered by `/api/chat-manager/state`.
 */

/** One chat-folder registry entry (`Documents/DSH/YYYY-MM-DD/.dsh-chat.json`). */
export interface ChatFolderEntry {
  slug: string
  folder: string
}

/** One chat-search result item (route payload). */
export interface ChatSearchHit {
  sessionId: string
  title: string
}

/**
 * One archived-session row as the state route states it. The host always sends
 * every field, with `''` and `0` standing for "unknown" (a snapshot the query
 * could not read, or a session no Workspace accounts for) — not for absence.
 */
export interface ArchivedChatRow {
  sessionId: string
  /** Real Session title, or `''` for the untitled placeholder. */
  title: string
  /** Owning Workspace title, or `''` when no account holds the Session. */
  workspaceTitle: string
  /** Last update in epoch milliseconds, or `0` when unknown. */
  updatedAt: number
}

/**
 * Read the archived list out of a route payload. The payload is JSON from the
 * Host, so this is the one place that decides what a usable row is: an entry
 * without a Session identity is dropped, and a missing display field reads as
 * its "unknown" value rather than reaching a render path as `undefined`.
 * @param value - the `archived` field of the state response.
 * @returns normalized rows, in payload order.
 */
export function readArchivedChatRows(value: unknown): ArchivedChatRow[] {
  if (!Array.isArray(value)) return []
  const rows: ArchivedChatRow[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId : ''
    if (sessionId === '') continue
    rows.push({
      sessionId,
      title: typeof record.title === 'string' ? record.title : '',
      workspaceTitle: typeof record.workspaceTitle === 'string' ? record.workspaceTitle : '',
      updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : 0,
    })
  }
  return rows
}
