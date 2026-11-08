/**
 * The delete action: a `sidebar.workspaces.session.menu.item` row that raises
 * the confirmation request, and the `shell.overlay` dialog entry that answers
 * it with the Host's irreversible delete. The dialog lives outside the row menu
 * because the row unmounts with the menu — and because a successful delete
 * removes that row, which must not tear the confirmation state down with it.
 * A Session with running work adds a second confirmation that names that work
 * and offers to stop it first; the overlay renders it from the module-level
 * busy request, so it survives the first dialog (and the settings page).
 */
import type { SessionActivity } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { IconTrashOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DeleteSessionInjected, SessionDeleteConfirmProps, SessionMenuItemProps,
} from '../contract/slots.ts'
import { ConfirmDeleteDialog } from '../addon/ConfirmDeleteDialog.tsx'
import browserCss from '../rows/WorkspaceBrowser.module.css'

/**
 * Menu row (order 500): ask for the delete confirmation, named with the row's
 * display title.
 * @param props - owner share, menu open state, and the delete share.
 * @returns the row.
 */
export function DeleteSessionMenuItem({
  sessionId, displayTitle, useMenuOpenState, requestSessionDelete, t,
}: SessionMenuItemProps<DeleteSessionInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      danger
      icon={<IconTrashOutlineRegular />}
      onSelect={() => {
        setMenuOpen(false)
        requestSessionDelete(sessionId, displayTitle)
      }}
    >
      {t('menu.deleteSession')}
    </MenuItemButton>
  )
}

/**
 * The `shell.overlay` entry: nothing while no deletion is requested, otherwise
 * the "stop and delete" confirmation (when the Host refused a delete for
 * running work) or the plain one, each keyed by the Session.
 * @param props - both request hooks, their settlements, the delete hops, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionDeleteConfirmDialog({
  useDeleteRequest, useDeleteBusyRequest, settleSessionDelete, settleSessionDeleteBusy,
  deleteSession, stopAndDeleteSession, t,
}: SessionDeleteConfirmProps) {
  const busy = useDeleteBusyRequest(pending => pending)
  const request = useDeleteRequest(pending => pending)
  // Busy first: the first confirmation closes the moment the Host answers 409,
  // and this dialog is the continuation of that same delete.
  if (busy !== null) {
    const busyTitle = busy.displayTitle.trim() === '' ? t('session.untitled') : busy.displayTitle
    return (
      <ConfirmDeleteDialog
        key={`busy-${busy.sessionId}`}
        title={t('delete.busy.title')}
        description={t('delete.busy.desc', { name: busyTitle })}
        confirmLabel={t('delete.busy.action')}
        pendingLabel={t('delete.busy.pending')}
        cancelLabel={t('cancel')}
        closeLabel={t('close')}
        onConfirm={() => stopAndDeleteSession(busy.sessionId, busy.displayTitle)}
        onClose={settleSessionDeleteBusy}
      >
        <ul className={browserCss.archiveActivity} aria-label={t('delete.busy.activity')}>
          {busy.activity.map((entry, index) => (
            <li key={`${entry.kind}-${String(index)}`}>{activityLine(entry, t)}</li>
          ))}
        </ul>
      </ConfirmDeleteDialog>
    )
  }
  if (request === null) return null
  const displayTitle = request.displayTitle.trim() === '' ? t('session.untitled') : request.displayTitle
  return (
    <ConfirmDeleteDialog
      key={request.sessionId}
      title={t('delete.session')}
      description={t('delete.session.desc', { name: displayTitle })}
      confirmLabel={t('delete.session')}
      pendingLabel={t('delete.session.pending')}
      cancelLabel={t('cancel')}
      closeLabel={t('close')}
      onConfirm={() => deleteSession(request.sessionId, request.displayTitle)}
      onClose={settleSessionDelete}
    />
  )
}

/**
 * One activity family's line: its count and the items' labels (ids when a
 * family carries no label). A family this dictionary does not know falls
 * through to the generic line.
 *
 * A deliberate copy of `ArchiveSession.tsx`'s helper: that file is upstream's,
 * byte-for-byte, so this fork may not export from it or edit it. The family
 * keys are the `archive.confirm.*` ones for the same reason the wording is the
 * same — both dialogs describe work that will be stopped.
 */
function activityLine(entry: SessionActivity, t: SessionDeleteConfirmProps['t']): string {
  const items = entry.items ?? []
  const n = items.length
  const names = items.map(item => item.label ?? item.id).join(t('archive.confirm.listSeparator'))
  const plural = n === 1 ? 'one' : 'other'
  switch (entry.kind) {
    case 'turn': return t('archive.confirm.turn')
    case 'subagent': return t(`archive.confirm.subagents.${plural}`, { n, names })
    case 'job': return t(`archive.confirm.jobs.${plural}`, { n, names })
    case 'schedule': return t(`archive.confirm.schedules.${plural}`, { n, names })
    default: return t(`archive.confirm.other.${plural}`, { kind: entry.kind, n })
  }
}
