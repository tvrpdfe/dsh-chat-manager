/**
 * Settings page: archived sessions with real titles, restore + delete.
 *
 * Reads the archive ledger through the shared chat state source (fed by
 * `/api/chat-manager/state`: the Host reads the workspace storage domain
 * live and already resolves the owning workspace title) and mutates it
 * through the same-origin routes. Restore removes the id from the archive
 * set (the accounting slot stays, so the session returns to its original
 * position); delete runs the full Host delete route (log removal + workspace
 * detach + un-archive) and writes a client tombstone so the live session
 * does not reappear before the Host process restart.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button, relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from '../rows/WorkspaceBrowser.module.css'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog.tsx'
import {
  archivedMaskSource, chatStateSource, deletedIdsSource, markArchivedMasked,
  performSessionDelete, refreshChatState, rpcPost,
} from './chat-runtime.ts'
import type { ArchivedChatRow } from '../../shared/chat.ts'

/** Registration-side face: the page owns no injected members (host data arrives per fetch). */
export type ArchivedSessionsPageInjected = Record<never, never>

/** Full component props assembled by the Settings slot renderer. */
export type ArchivedSessionsPageProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'chatManager'>
  & InjectFace<ArchivedSessionsPageInjected>

/** Localized compact relative time through the chatManager dictionary. */
function timeLabel(updatedAt: number, now: number, t: ArchivedSessionsPageProps['t']): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}

export function ArchivedSessionsPage({ t }: ArchivedSessionsPageProps) {
  const chat = useSyncExternalStore(chatStateSource.subscribe, chatStateSource.getSnapshot)
  const deletedIds = useSyncExternalStore(deletedIdsSource.subscribe, deletedIdsSource.getSnapshot)
  const maskedIds = useSyncExternalStore(archivedMaskSource.subscribe, archivedMaskSource.getSnapshot)
  const rows: ArchivedChatRow[] = chat.archived
  const loaded = chat.loaded
  // The restore in flight, or none. The delete path keeps its own in-flight
  // state inside the shared confirmation dialog.
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ArchivedChatRow | null>(null)
  const hiddenRow = (sessionId: string): boolean =>
    deletedIds.has(sessionId as SessionId) || maskedIds.has(sessionId)
  const visibleRows = rows.filter(row => !hiddenRow(row.sessionId))

  const load = useCallback(() => {
    setError(null)
    return refreshChatState().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [])
  useEffect(() => { void load() }, [load])

  const restore = (sessionId: string): void => {
    setRestoring(sessionId)
    rpcPost('/api/chat-manager/restore-session', { sessionId })
      .then(async () => {
        // Mask only AFTER the RPC succeeded: a failed restore must leave the
        // row visible and retryable, and only a failed follow-up refresh is
        // what the mask is for (released by the next successful snapshot).
        markArchivedMasked(sessionId)
        await refreshChatState().catch(() => {})
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => { setRestoring(null) })
  }

  return (
    <div className={css.archivedPage}>
      {!loaded && <div className={css.empty}>{t('archived.loading')}</div>}
      {loaded && visibleRows.length === 0 && <div className={css.empty}>{t('archived.empty')}</div>}
      {error !== null && <div className={css.renameError} role="alert">{error}</div>}
      {visibleRows.map(row => (
        <div className={css.archivedRow} key={row.sessionId}>
          <span className={css.archivedTitle}>
            {row.workspaceTitle.trim().length > 0
              ? t('archived.workspacePrefix', { name: row.workspaceTitle })
              : ''}
            {row.title.trim().length > 0 ? row.title : t('archived.untitled')}
          </span>
          <span className={css.archivedTime}>
            {row.updatedAt > 0 ? timeLabel(row.updatedAt, Date.now(), t) : ''}
          </span>
          <Button
            variant="outline"
            disabled={restoring !== null}
            onClick={() => { restore(row.sessionId) }}
          >
            {restoring === row.sessionId ? t('archived.restoring') : t('archived.restore')}
          </Button>
          <Button
            variant="outline"
            className={css.deleteAction}
            disabled={restoring !== null}
            onClick={() => { setDeleteTarget(row) }}
          >
            {t('archived.delete')}
          </Button>
        </div>
      ))}
      {deleteTarget !== null && (
        <ConfirmDeleteDialog
          key={deleteTarget.sessionId}
          title={t('archived.delete')}
          description={t('archived.delete.desc', {
            name: deleteTarget.title.trim().length > 0 ? deleteTarget.title : t('archived.untitled'),
          })}
          confirmLabel={t('archived.delete')}
          pendingLabel={t('archived.deleting')}
          cancelLabel={t('cancel')}
          closeLabel={t('close')}
          onConfirm={() => performSessionDelete(deleteTarget.sessionId as SessionId)}
          onClose={() => { setDeleteTarget(null) }}
        />
      )}
    </div>
  )
}
