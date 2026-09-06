/**
 * The chat-sessions section below the workspace browser: the same visual
 * language as the workspace header (expandable search, add button), showing
 * chat sessions only in recency order with live statuses. Rows come from the
 * same flat derivation as the workspace lists, then filter to the chat root.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconCloseFill14, IconPlusOutline16, IconSearchOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionNodeItem } from '../rows/Rows.tsx'
import css from '../rows/WorkspaceBrowser.module.css'
import { SEARCH_DEBOUNCE_MS, SEARCH_QUERY_MAX_CODE_UNITS, sanitizeSearchQuery } from '../rows/WorkspaceBrowser.tsx'
import { deriveFlat } from '../tree.ts'
import { isUnderChatRoot } from '../../shared/paths.ts'
import type { ChatSearchHit } from '../../shared/chat.ts'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Hook seats: the framework's SnapshotSelectorHook shape, locally widened. */
type SelectorHook = (selector: (state: any) => any) => any

interface ChatSectionProps {
  wide: boolean
  useSessions: SelectorHook
  useSessionPendingInteraction: SelectorHook
  useWorkspaces: SelectorHook
  useChat: SelectorHook
  deletedSessionIds: ReadonlySet<SessionId>
  open: (sessionId: SessionId) => void
  onRename: (sessionId: SessionId, currentTitle: string) => void
  onFork: (sessionId: SessionId) => void
  onArchive: (sessionId: SessionId) => void
  onDelete: (sessionId: SessionId, currentTitle: string) => void
  onNewChat: () => void
  searchChats: (query: string) => Promise<ChatSearchHit[]>
  t: WorkspaceBrowserProps['t']
}

/**
 * The chat-sessions pane: header (label + expandable search + add chat),
 * then the chat list. Blank rows are visible only while they are the current
 * session (matching the shipped `sessionVisible` semantics).
 */
export function ChatSection({
  wide, useSessions, useSessionPendingInteraction, useWorkspaces, useChat,
  deletedSessionIds, open, onRename, onFork, onArchive,
  onDelete, onNewChat, searchChats, t,
}: ChatSectionProps) {
  const list = useSessions((s: any) => s)
  const pendingInteractions = useSessionPendingInteraction((s: any) => s)
  const archivedSessionIds = useWorkspaces((s: any) => s.archivedSessionIds)
  const chat = useChat((s: any) => s)
  const chatRoot: string | null = typeof chat?.root === 'string' ? chat.root : null
  const [query, setQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [hits, setHits] = useState<ChatSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const searchRootRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const normalizedQuery = sanitizeSearchQuery(query).trim().toLowerCase()

  // Hide archived and tombstoned ids only. Chat ids must stay: excludedSessionIds
  // is the chat panes' own membership set, not a filter here.
  const hidden = useMemo(
    () => new Set<string>([...archivedSessionIds, ...deletedSessionIds]),
    [archivedSessionIds, deletedSessionIds],
  )
  const chatNodes = useMemo(() => {
    // Same sessionVisible semantics as the workspace lists (origin, blank,
    // archive) plus the chat-root filter + plugin tombstones.
    const rows = deriveFlat(list, [...hidden] as SessionId[], pendingInteractions)
    return rows.filter(row => {
      const summary = list.byId[row.id]
      return summary !== undefined && isUnderChatRoot(summary.cwd, chatRoot)
    })
  }, [list, hidden, chatRoot, pendingInteractions])

  const shown = useMemo(() => {
    if (normalizedQuery === '') return chatNodes
    const matchedIds = new Set<string>()
    for (const node of chatNodes) {
      if (node.title === '') continue
      if (node.title.toLowerCase().includes(normalizedQuery)) matchedIds.add(node.id)
    }
    for (const hit of hits) matchedIds.add(hit.sessionId)
    return chatNodes.filter(node => matchedIds.has(node.id))
  }, [normalizedQuery, chatNodes, hits])

  useEffect(() => {
    if (normalizedQuery === '') {
      setHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      searchChats(normalizedQuery).then((items) => {
        if (cancelled) return
        setHits(Array.isArray(items) ? items : [])
        setSearching(false)
      }).catch(() => {
        if (cancelled) return
        setHits([])
        setSearching(false)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [normalizedQuery, searchChats])

  useEffect(() => {
    if (!wide || !searchExpanded) return
    searchInputRef.current?.focus({ preventScroll: true })
  }, [wide, searchExpanded])

  useEffect(() => {
    if (!wide || !searchExpanded) return
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || searchRootRef.current?.contains(event.target) === true) return
      searchInputRef.current?.blur()
      if (normalizedQuery !== '') return
      setSearchExpanded(false)
    }
    document.addEventListener('click', onClick)
    return () => { document.removeEventListener('click', onClick) }
  }, [normalizedQuery, wide, searchExpanded])

  if (!wide) return null
  const now = Date.now()
  return (
    <div className={css.chatSection}>
      <div className={css.sectionHeader}>
        <span className={clsx(css.sectionLabel, css.wide, searchExpanded && css.sectionLabelHidden)}>
          {t('chat.section')}
        </span>
        <div className={clsx(css.searchSlot, searchExpanded && css.searchSlotExpanded)}>
          <div
            ref={searchRootRef}
            className={clsx(css.search, searchExpanded && css.searchExpanded)}
            onClick={() => { setSearchExpanded(true); searchInputRef.current?.focus() }}
          >
            <Tooltip label={t('search')} side="bottom" delayMs={500} disabled={searchExpanded}>
              <button
                type="button"
                className={css.searchButton}
                aria-label={t('chat.search.aria')}
                aria-expanded={searchExpanded}
                onClick={() => { setSearchExpanded(true) }}
              >
                <IconSearchOutline16 size={searchExpanded ? 11 : 14} />
              </button>
            </Tooltip>
            <input
              ref={searchInputRef}
              className={css.searchInput}
              type="text"
              placeholder={t('chat.search.placeholder')}
              maxLength={SEARCH_QUERY_MAX_CODE_UNITS}
              value={query}
              tabIndex={searchExpanded ? 0 : -1}
              onChange={(e) => { setQuery(sanitizeSearchQuery(e.target.value)) }}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return
                setQuery('')
                setSearchExpanded(false)
              }}
            />
            {searchExpanded && (
              <button
                type="button"
                className={css.clearButton}
                aria-label={t('search.clear')}
                onClick={(e) => {
                  e.stopPropagation()
                  setQuery('')
                  setSearchExpanded(false)
                }}
              >
                <IconCloseFill14 />
              </button>
            )}
          </div>
        </div>
        <div className={clsx(css.headerActions, searchExpanded && css.headerActionsHidden)}>
          <Tooltip label={t('chat.add')} side="bottom" delayMs={500}>
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('chat.add')}
              onClick={() => { onNewChat() }}
            >
              <IconPlusOutline16 />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className={clsx(css.treeBody, css.wide, css.chatList)}>
        <div className={clsx(css.list, css.flatList)} role="tree" aria-label={t('chat.section')}>
          {shown.length === 0 && (
            <div className={css.empty}>
              {normalizedQuery === '' ? t('chat.empty') : searching ? t('search.pending') : t('search.noMatches')}
            </div>
          )}
          {shown.map(node => (
            <SessionNodeItem
              key={node.id}
              node={node}
              currentId={list.current}
              now={now}
              onOpen={open}
              onRename={onRename}
              onFork={onFork}
              onArchive={onArchive}
              onDelete={onDelete}
              flat
              t={t}
            />
          ))}
        </div>
        <span className={css.fade} />
      </div>
    </div>
  )
}
