/**
 * The plugin's one destructive-confirmation dialog: a title, a description
 * naming the target, the red confirm button, and the in-flight/error reporting
 * every delete path needs. Callers own the request they confirm and pass the
 * labels they show, so the same dialog serves the Session row menu and the
 * archived-session settings page.
 */
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import css from '../rows/WorkspaceBrowser.module.css'

export interface ConfirmDeleteDialogProps {
  /** Dialog title; the caller supplies it from its own locale namespace. */
  title: string
  /** Body copy, already naming the target. */
  description: string
  /** Red button label (the verb, not "OK"). */
  confirmLabel: string
  /** Status line while the deletion runs. */
  pendingLabel: string
  /** Dismiss label; also the dialog's close label. */
  cancelLabel: string
  closeLabel: string
  /** Resolve once the deletion landed; a rejection is shown inside the dialog. */
  onConfirm: () => Promise<void>
  /** Dismiss the dialog; the caller clears the request it owns. */
  onClose: () => void
}

/**
 * Mount this only while a confirmation is pending (callers render it
 * conditionally and key it by the target), so in-flight and error state die
 * with the request.
 * @param props - the copy, the deletion hop, and the settlement callback.
 * @returns the open dialog.
 */
export function ConfirmDeleteDialog({
  title, description, confirmLabel, pendingLabel, cancelLabel, closeLabel, onConfirm, onClose,
}: ConfirmDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = (): void => {
    if (deleting) return
    onClose()
  }
  const confirm = (): void => {
    setDeleting(true)
    setError(null)
    onConfirm().then(() => {
      setDeleting(false)
      onClose()
    }).catch((reason: unknown) => {
      setDeleting(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  return (
    <Modal
      open
      onClose={close}
      closeLabel={closeLabel}
      title={title}
      description={description}
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={close}>{cancelLabel}</Button>
          <Button
            variant="outline"
            className={css.deleteAction}
            disabled={deleting}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      {deleting && <div className={css.deleteStatus} role="status">{pendingLabel}</div>}
      {error !== null && <div className={css.renameError} role="alert">{error}</div>}
    </Modal>
  )
}
