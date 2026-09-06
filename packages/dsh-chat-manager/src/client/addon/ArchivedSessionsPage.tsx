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
import { Button, Modal, relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from '../rows/WorkspaceBrowser.module.css'
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
  const [busy, setBusy] = useState<{ id: string; kind: 'restore' | 'delete' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ArchivedChatRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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

  /** Row-action button label: busy state wins, otherwise the idle verb. */
  const rowActionLabel = (kind: 'restore' | 'delete', sessionId: string): string => {
    if (busy !== null && busy.kind === kind && busy.id === sessionId) {
      return kind === 'restore' ? t('archived.restoring') : t('archived.deleting')
    }
    return kind === 'restore' ? t('archived.restore') : t('archived.delete')
  }

  /** Run one busy-guarded row action; clears `busy` on settle. A failure
   *  without an explicit handler surfaces in the page's inline alert. */
  const runBusy = (
    kind: 'restore' | 'delete',
    sessionId: string,
    action: () => Promise<void>,
    onSuccess?: () => void,
    onFailure?: (message: string) => void,
  ): void => {
    setBusy({ id: sessionId, kind })
    action()
      .then(() => { onSuccess?.() })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason)
        if (onFailure !== undefined) onFailure(message)
        else setError(message)
      })
      .finally(() => { setBusy(null) })
  }

  const restore = (sessionId: string): void => {
    runBusy('restore', sessionId, async () => {
      await rpcPost('/api/chat-manager/restore-session', { sessionId })
      // Mask only AFTER the RPC succeeded: a failed restore must leave the
      // row visible and retryable, and only a failed follow-up refresh is
      // what the mask is for (released by the next successful snapshot).
      markArchivedMasked(sessionId)
      await refreshChatState().catch(() => {})
    })
  }

  const confirmDelete = (): void => {
    if (deleteTarget === null) return
    const sessionId = deleteTarget.sessionId
    // Clear a previous failure before retrying (same precondition as the
    // workspace-browser delete confirm).
    setDeleteError(null)
    runBusy(
      'delete',
      sessionId,
      () => performSessionDelete(sessionId as SessionId),
      // Success closes the confirm; a failure keeps it open with the reason
      // inside the dialog (same as the workspace-browser delete confirm).
      () => { setDeleteTarget(null) },
      (message) => { setDeleteError(message) },
    )
  }

  return (
    <div className={css.archivedPage}>
      {!loaded && <div className={css.empty}>{t('archived.loading')}</div>}
      {loaded && visibleRows.length === 0 && <div className={css.empty}>{t('archived.empty')}</div>}
      {error !== null && <div className={css.renameError} role="alert">{error}</div>}
      {visibleRows.map(row => (
        <div className={css.archivedRow} key={row.sessionId}>
          <span className={css.archivedTitle}>
            {String(row.workspaceTitle ?? '').trim().length > 0 ? String(row.workspaceTitle) + '：' : ''}
            {row.title && String(row.title).trim().length > 0 ? row.title : t('archived.untitled')}
          </span>
          <span className={css.archivedTime}>
            {typeof row.updatedAt === 'number' && row.updatedAt > 0 ? timeLabel(row.updatedAt, Date.now(), t) : ''}
          </span>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => { restore(row.sessionId) }}
          >
            {rowActionLabel('restore', row.sessionId)}
          </Button>
          <Button
            variant="outline"
            className={css.deleteAction}
            disabled={busy !== null}
            onClick={() => { setDeleteError(null); setDeleteTarget(row) }}
          >
            {rowActionLabel('delete', row.sessionId)}
          </Button>
        </div>
      ))}
      <Modal
        open={deleteTarget !== null}
        onClose={() => { setDeleteTarget(null); setDeleteError(null) }}
        closeLabel={t('close')}
        title={t('archived.delete')}
        {...deleteTarget === null ? {} : { description: t('archived.delete.desc', { name: deleteTarget.title || t('archived.untitled') }) }}
        footer={(
          <>
            <Button variant="outline" disabled={busy !== null} onClick={() => { setDeleteTarget(null); setDeleteError(null) }}>{t('cancel')}</Button>
            <Button variant="outline" className={css.deleteAction} disabled={busy !== null} onClick={confirmDelete}>
              {t('archived.delete')}
            </Button>
          </>
        )}
      >
        {busy !== null && busy.kind === 'delete'
          && <div className={css.deleteStatus} role="status">{t('archived.deleting')}</div>}
        {deleteError !== null && <div className={css.renameError} role="alert">{deleteError}</div>}
      </Modal>
    </div>
  )
}
