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
 * One archived-session row delivered by `/api/chat-manager/state`. Display
 * fields are optional: the payload is an unvalidated JSON cast, so the client
 * guards each before render (title 缺失回退占位, workspaceTitle 无账目不显示
 * 前缀, updatedAt 0 表示未知).
 */
export interface ArchivedChatRow {
  sessionId: string
  title?: string
  workspaceTitle?: string
  updatedAt?: number
}
