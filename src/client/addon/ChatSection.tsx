/**
 * The chat pane beside the workspace browser: the same visual language as the
 * workspace header (expandable search, add chat), listing chat Sessions only in
 * recency order with live statuses. Rows come from the same flat derivation as
 * the workspace lists, filtered to the chat root, and carry the same slot-driven
 * row menu — pin, rename, fork, archive, and the plugin's delete.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconCloseFillRegular, IconPlusOutlineRegular, IconSearchOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionNodeItem } from '../rows/Rows.tsx'
import css from '../rows/WorkspaceBrowser.module.css'
import { SEARCH_DEBOUNCE_MS, SEARCH_QUERY_MAX_CODE_UNITS, sanitizeSearchQuery } from '../rows/WorkspaceBrowser.tsx'
import { deriveFlat, visibleSessionIds, type SessionRowState } from '../tree.ts'
import { isUnderChatRoot } from '../../shared/paths.ts'
import type { ChatSearchHit } from '../../shared/chat.ts'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

interface ChatSectionProps {
  wide: boolean
  /** Global standard hook over the Session list snapshot. */
  useSessions: WorkspaceBrowserProps['useSessions']
  /** Global standard hook over the unified Session status map. */
  useSessionStatus: WorkspaceBrowserProps['useSessionStatus']
  /** Global standard hook over the Workspace Controller snapshot. */
  useWorkspaces: WorkspaceBrowserProps['useWorkspaces']
  /** Plugin-injected hook over the chat-folder state source. */
  useChat: WorkspaceBrowserProps['useChat']
  /** Child-seat renderer for the row action lists, shared with the workspace rows. */
  renderSlot: WorkspaceBrowserProps['renderSlot']
  /** The main-view Session (blank rows stay visible only for it). */
  currentId: SessionId | undefined
  deletedSessionIds: ReadonlySet<SessionId>
  open: (sessionId: SessionId) => void
  /** Open the shared rename dialog from a row title double-click. */
  onRenameRequest: (sessionId: SessionId, currentTitle: string) => void
  onNewChat: () => void
  searchChats: (query: string) => Promise<ChatSearchHit[]>
  t: WorkspaceBrowserProps['t']
}

/**
 * The chat pane: header (label + expandable search + add chat), then the chat
 * list. Archived Sessions and plugin tombstones leave through the same
 * visibility rules the workspace lists use, and membership is the chat root.
 * @param props - hook seats, the shared row-action renderer, and the pane copy.
 * @returns the pane, or null while the rail is collapsed.
 */
export function ChatSection({
  wide, useSessions, useSessionStatus, useWorkspaces, useChat, renderSlot, currentId,
  deletedSessionIds, open, onRenameRequest, onNewChat, searchChats, t,
}: ChatSectionProps) {
  const list = useSessions(s => s)
  const statuses = useSessionStatus(s => s)
  const archivedSessionIds = useWorkspaces(s => s.archivedSessionIds)
  const pinnedSessionIds = useWorkspaces(s => s.pinnedSessionIds)
  const chat = useChat(s => s)
  const chatRoot: string | null = typeof chat?.root === 'string' ? chat.root : null
  const [query, setQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [hits, setHits] = useState<ChatSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const searchRootRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const normalizedQuery = sanitizeSearchQuery(query).trim().toLowerCase()

  // Chat membership plus the shipped visibility rules: archived rows follow the
  // default hide-archived view, blank rows only survive as the current Session,
  // and the plugin's tombstones stay hidden until the Host drops them.
  const chatNodes = useMemo(() => {
    const rowState: SessionRowState = {
      pinnedSessionIds,
      archivedSessionIds,
      archivedFilter: 'default',
    }
    const memberIds = visibleSessionIds(list, rowState.archivedSessionIds, 'default')
    return deriveFlat(list, memberIds, rowState, statuses, deletedSessionIds)
      .filter(row => isUnderChatRoot(list.byId[row.id]?.cwd, chatRoot))
  }, [list, statuses, archivedSessionIds, pinnedSessionIds, deletedSessionIds, chatRoot])

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
                <IconSearchOutlineRegular size={searchExpanded ? 11 : 14} />
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
                <IconCloseFillRegular />
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
              <IconPlusOutlineRegular />
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
              currentId={currentId}
              now={now}
              onOpen={open}
              onRenameRequest={onRenameRequest}
              renderSlot={renderSlot}
              t={t}
            />
          ))}
        </div>
        <span className={css.fade} />
      </div>
    </div>
  )
}
