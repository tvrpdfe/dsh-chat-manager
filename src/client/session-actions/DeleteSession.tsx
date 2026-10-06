/**
 * The delete action: a `sidebar.workspaces.session.menu.item` row that raises
 * the confirmation request, and the `shell.overlay` dialog entry that answers
 * it with the Host's irreversible delete. The dialog lives outside the row menu
 * because the row unmounts with the menu — and because a successful delete
 * removes that row, which must not tear the confirmation state down with it.
 */
import { IconTrashOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DeleteSessionInjected, SessionDeleteConfirmProps, SessionMenuItemProps,
} from '../contract/slots.ts'
import { ConfirmDeleteDialog } from '../addon/ConfirmDeleteDialog.tsx'

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
 * one confirmation per request (keyed by the Session).
 * @param props - the request hook, its settlement, the delete hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionDeleteConfirmDialog({
  useDeleteRequest, settleSessionDelete, deleteSession, t,
}: SessionDeleteConfirmProps) {
  const request = useDeleteRequest(pending => pending)
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
      onConfirm={() => deleteSession(request.sessionId)}
      onClose={settleSessionDelete}
    />
  )
}
