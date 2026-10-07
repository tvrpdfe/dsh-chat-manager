/**
 * Workspace plugin, browser half. Two registrations: WorkspaceBrowser fills
 * the sidebar shell's `sidebar.workspaces` hole (the whole browsing region),
 * and WorkspacePicker fills the conversation hero's picker hole
 * (`conversation.hero.workspace` — both hero forms). Both read real Host
 * Workspaces through the global useWorkspaces hook, and each declares its
 * own `single` directory-flow child hole for the composed picker package's
 * client half. WorkspaceBrowser additionally declares the two Session row
 * action lists, and this apply registers the shipped actions — pin, rename,
 * fork, archive — into them the way any client plugin would, each with its
 * own behavior, plus the rename dialog and the row-action notice into
 * `shell.overlay` (see the contract module doc). It also declares two
 * Session-row seats: the leading decoration a row renders only while its own
 * primary state is idle, and the section the row's hover card renders between
 * its relative time and its trailing status line. Export discipline:
 * packages/client/AGENTS.md.
 *
 * dsh-chat-manager adds four things to the shipped wiring: the chat pane rides
 * the browser registration, the delete-Session action joins the shipped row
 * menu as its own entry, the no-argument New Session routes to a chat, and the
 * archived-session settings page fills one `settings.section`.
 */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  IWorkspaces, SessionActivity, WorkspaceArchiveError, WorkspaceId, WorkspaceSnapshot,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the Controller service merges.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the Settings section slot merge (ctx.slots 'settings.section').
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the Session root standard-hook merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import {
  type ArchiveSessionInjected, type DeleteSessionInjected, type ForkSessionInjected, menuOpenStateFactory,
  type PinSessionInjected,
  type SessionArchiveConfirmInjected, type SessionArchiveConfirmRequest,
  type SessionDeleteConfirmInjected, type SessionDeleteConfirmRequest,
  type RenameSessionInjected, type RowToast, type RowToastInjected, type RowToastState, type SessionRenameDialogInjected,
  type WorkspaceBrowserInjected, type WorkspacePickerInjected,
} from './contract/slots.ts'
import { createWorkspaceShortcutControls, installWorkspaceShortcuts } from './shortcuts.ts'
import { UiWorkspaceService } from './navigation.ts'
import { createWorkspaceViewStore } from './stores.ts'
import { WorkspaceBrowser } from './rows/WorkspaceBrowser.tsx'
import { ArchiveSessionMenuItem, ArchiveSessionRowButton, SessionArchiveConfirmDialog } from './session-actions/ArchiveSession.tsx'
import { DeleteSessionMenuItem, SessionDeleteConfirmDialog } from './session-actions/DeleteSession.tsx'
import { derive } from './session-actions/derived.ts'
import { ForkSessionMenuItem } from './session-actions/ForkSession.tsx'
import { PinSessionMenuItem, PinSessionRowButton } from './session-actions/PinSession.tsx'
import { RenameSessionMenuItem, SessionRenameDialog } from './session-actions/RenameSession.tsx'
import { RowActionToast } from './session-actions/RowActionToast.tsx'
import { WorkspacePicker } from './WorkspacePicker.tsx'
import { ArchivedSessionsPage } from './addon/ArchivedSessionsPage.tsx'
import {
  chatManagerEn, chatManagerZh, chatRuntimeSource, chatStateSource, performSessionDelete,
  refreshChatState, rpcPost, setRefreshSessions,
} from './addon/chat-runtime.ts'
import type { ChatManagerKey } from './addon/chat-runtime.ts'
import { samePath } from '../shared/paths.ts'
import type { ChatSearchHit } from '../shared/chat.ts'
import { en, zh, type WorkspaceKey } from './locales.ts'

export type { StartSessionOptions, UiWorkspace } from './navigation.ts'
export type {
  DirectoryFlowOwnerProps, DirectoryFlowSlotName, DirectoryPickingHooks, DirectoryPickingInjected,
  MenuOpenState, RowToast, SessionRenameTarget, SessionRowOwnerProps, UseMenuOpenState, WorkspaceBrowserInjected,
  SessionRowScheduleOwnerProps,
  WorkspaceBrowserProps,
  WorkspacePickerInjected, WorkspacePickerProps,
} from './contract/slots.ts'
export type { WorkspaceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface GlobalStandardProps {
    /** Selector hook over the pure Workspace Controller snapshot. */
    useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  }

  interface LocaleNamespaceMap {
    /** The workspace browsing region and pick/create flow copy. */
    workspace: WorkspaceKey
    /** The archived-session settings page copy. */
    chatManager: ChatManagerKey
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    workspaceOperation: unknown
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'workspace'

/** Plugin-owned dictionary namespace (archived-session page and its dialogs). */
const CHAT_NS = 'chatManager'

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * the ui-sidebar / ui-conversation applies, whose activation order relative
 * to this one is NOT constrained: dsh.client.inject edges are informational
 * (loading/prefetch metadata, never apply sequencing) and neither owner
 * provides a waitable service. apply therefore depends on each slot
 * declaration through `slots.inject()` instead of assuming order.
 */
export const inject = [
  'slots', 'sessions', 'workspaces', 'locale', 'remote', 'remote.directoryPicker', 'layout', 'shortcuts',
]

/**
 * Register the browser and picker once their slot declarations are on the
 * ledger. Inject factories return plain callbacks; data reads use the
 * framework's global hooks.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const sessions = ctx.get('sessions') as ISessions
  const workspaces = ctx.get('workspaces') as IWorkspaces
  // One viewing-store instance, created here as ui-layout does for its layout
  // store: the browser declares the handle, and the UiWorkspace service writes
  // view order through the same instance the renderer hands the browser.
  const viewHandle = createWorkspaceViewStore()
  const viewInstance = viewHandle.create()
  const viewStore: typeof viewHandle = { ...viewHandle, create: () => viewInstance }
  const rowToast = createSnapshotStore<RowToastState | null>(null)
  let toastSeq = 0
  const notify = (toast: RowToast): void => { rowToast.set({ ...toast, seq: ++toastSeq }) }
  const uiWorkspace = new UiWorkspaceService(
    ctx, ctx.remote.directoryPicker, workspaces, sessions, viewInstance.actions, notify,
  )
  ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list, chat: chatStateSource } })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace: dictionaries')
  ctx.effect(
    () => ctx.locale.register(CHAT_NS, { zh: chatManagerZh, en: chatManagerEn }),
    'dsh-chat-manager: dictionaries',
  )
  // The delete and restore choreography repulls the Session baseline, and the
  // archived page plus the chat pane read the plugin's own chat state.
  setRefreshSessions(() => { void sessions.refresh() })
  void refreshChatState().catch(() => {})
  // `refreshChatState` already retries a few times, but a page whose boot pull
  // failed outright would otherwise keep `root: null` for its whole life: chat
  // Sessions would show up in the workspace area, the chat pane would stay
  // empty, and a no-argument New Session would treat a chat Session as a
  // workspace one. Coming back to such a page re-pulls once, which needs no
  // polling and no timer.
  const recoverChatState = (): void => {
    if (document.visibilityState === 'hidden') return
    if (chatStateSource.getSnapshot().root !== null) return
    void refreshChatState().catch(() => {})
  }
  ctx.effect(() => {
    window.addEventListener('focus', recoverChatState)
    document.addEventListener('visibilitychange', recoverChatState)
    return () => {
      window.removeEventListener('focus', recoverChatState)
      document.removeEventListener('visibilitychange', recoverChatState)
    }
  }, 'dsh-chat-manager: chat state recovery')
  const shortcutControls = createWorkspaceShortcutControls()

  const searchSessions: WorkspaceBrowserInjected['searchSessions'] = async (query, signal) => {
    const result = await sessions.search(query, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  // Stable per-surface occupancy sources (the renderer's hook cache keys by
  // source identity): true while the surface's directory-flow hole is filled.
  const flowSource = (hole: 'sidebar.workspaces.directoryFlow' | 'conversation.hero.workspace.directoryFlow'): HostObservable<boolean> => ({
    getSnapshot: () => ctx.slots.entries(hole).length > 0,
    subscribe: listener => ctx.slots.subscribe(hole, listener),
  })
  const browserFlowSource = flowSource('sidebar.workspaces.directoryFlow')
  const hostInfo: HostObservable<RemoteHostFacts> = {
    getSnapshot: () => ctx.remote.$host,
    subscribe: listener => ctx.on('connection/reset', listener),
  }
  const pickerFlowSource = flowSource('conversation.hero.workspace.directoryFlow')
  const openSession: WorkspaceBrowserInjected['open'] = (sessionId) => {
    uiWorkspace.openSession(sessionId)
  }
  // Registry-global sets as Sets, rebuilt only when the Workspace snapshot changes.
  const pinnedSet = derive(workspaces.list, snapshot => new Set<SessionId>(snapshot.pinnedSessionIds))
  const archivedSet = derive(workspaces.list, snapshot => new Set<SessionId>(snapshot.archivedSessionIds))
  // Plugin-private facts the row actions and their overlay surfaces share:
  // the pending rename request and the notice on display. Each business
  // writes through its own injected callback and the surface reads through
  // its bound hook.
  const renameRequest = derive(shortcutControls.state, state => state.renameTarget)
  const archiveRequest = createSnapshotStore<SessionArchiveConfirmRequest | null>(null)
  const requestSessionRename = shortcutControls.rename
  const unarchiveSession = (sessionId: SessionId): void => {
    uiWorkspace.unarchiveSession(sessionId).catch((reason: unknown) => {
      console.warn('session unarchive rejected:', reason)
    })
  }
  const renameSession: SessionRenameDialogInjected['renameSession'] = async (sessionId, title) => {
    const result = await sessions.using(
      sessionId,
      { source: 'workspaceOperation' },
      reference => reference.binding.session.rename(title),
    )
    if (!result.ok) throw new Error(result.error.message)
  }
  const pinInjected = (): PinSessionInjected => ({
    hooks: { pinned: pinnedSet, archived: archivedSet },
    // Pin failures surface as a notice: nothing else on the surface moves, so
    // a silent failure would read as a dead action.
    pinSession: (sessionId) => {
      uiWorkspace.pinSession(sessionId).catch(() => { notify({ kind: 'pinFailed' }) })
    },
    unpinSession: (sessionId) => {
      uiWorkspace.unpinSession(sessionId).catch(() => { notify({ kind: 'unpinFailed' }) })
    },
  })
  const archiveInjected = (): ArchiveSessionInjected => ({
    hooks: { archived: archivedSet },
    // Archive preserves the log and the account position, so a quiet Session
    // needs no confirmation; the notice offers undo and the archived filter.
    // The Host's refusal for running work is the one case that asks first:
    // the confirmation names that work and offers to stop it.
    archiveSession: (sessionId) => {
      uiWorkspace.archiveSession(sessionId).then(() => {
        notify({ kind: 'archived', sessionId })
      }).catch((reason: unknown) => {
        const activity = activeSessionRefusal(reason)
        if (activity === undefined) {
          console.warn('session archive rejected:', reason)
          return
        }
        const displayTitle = sessions.list.getSnapshot().byId[sessionId]?.displayTitle ?? sessionId
        archiveRequest.set({ sessionId, displayTitle, activity })
      })
    },
    unarchiveSession,
  })
  installWorkspaceShortcuts(ctx, uiWorkspace, shortcutControls, archiveInjected().archiveSession)
  const archiveConfirmInjected = (): SessionArchiveConfirmInjected => ({
    hooks: { archiveRequest },
    settleSessionArchive: () => { archiveRequest.set(null) },
    stopAndArchiveSession: async (sessionId) => {
      await uiWorkspace.archiveSession(sessionId, { stopActivity: true })
      notify({ kind: 'stoppedAndArchived', sessionId })
    },
  })
  const forkInjected = (): ForkSessionInjected => ({
    forkSession: (sessionId) => {
      uiWorkspace.forkSession(sessionId, (childId) => {
        ctx.get('productAnalytics')?.track('branch_session_click', { session_id: childId, parent_session_id: sessionId, click_position: 'sidebar' })
      }).catch(() => {
        // Fork or child-title failure leaves the list as it was.
      })
    },
  })
  const renameInjected = (): RenameSessionInjected => ({ requestSessionRename })
  const renameDialogInjected = (): SessionRenameDialogInjected => ({
    hooks: { renameRequest },
    settleSessionRename: shortcutControls.closeRename,
    renameSession,
  })
  const rowToastInjected = (): RowToastInjected => ({
    hooks: { toast: rowToast },
    dismissToast: () => { rowToast.set(null) },
    undoArchive: unarchiveSession,
    showArchived: () => { viewInstance.actions.setArchivedFilter('show') },
  })
  // ---- dsh-chat-manager RPC helpers ----
  const chatSearchRpc = (query: string): Promise<ChatSearchHit[]> =>
    rpcPost('/api/chat-manager/search-chats', { query }).then((data) =>
      (data as { items?: ChatSearchHit[] }).items ?? [])
  /** The date-folder Workspace the Host registered, as the client observed it. */
  const waitForChatWorkspace = (dateFolder: string): Promise<string | undefined> =>
    waitFor(() => {
      const found = chatRuntimeSource.getSnapshot().workspaces
        .find(workspace => workspace.path === dateFolder || samePath(workspace.path, dateFolder))
      return found === undefined || found.workspaceId.length === 0 ? undefined : found.workspaceId
    }, 12)
  /** A Host registry write leads the client stream; the start needs the local snapshot. */
  const waitForRegisteredWorkspace = (workspaceId: string): Promise<string | undefined> =>
    waitFor(() => workspaces.list.getSnapshot().items
      .some(item => item.workspaceId === workspaceId) ? workspaceId : undefined, 24)
  const startChatRpc = async (): Promise<void> => {
    const data = await rpcPost('/api/chat-manager/ensure-date-folder', {})
    const payload = data as {
      dateFolder?: unknown
      workspaceId?: unknown
      /** Host fact: whether the chat folder was made provisionable for the sandbox. */
      folderAccess?: { ok?: unknown; detail?: unknown } | null
    }
    // The chat still starts when the folder was not made provisionable, so this
    // is a diagnostic rather than a failure: the Host already logged the detail,
    // and the user-visible symptom (if the sandbox needs the folder) arrives
    // later as a Windows permission error on the first tool call.
    if (payload.folderAccess != null && payload.folderAccess.ok === false) {
      console.warn(
        'dsh-chat-manager: the chat folder could not be made provisionable for the DSH file sandbox'
        + (typeof payload.folderAccess.detail === 'string' ? `: ${payload.folderAccess.detail}` : ''),
      )
    }
    const declared = typeof payload.workspaceId === 'string' && payload.workspaceId.length > 0
      ? payload.workspaceId
      : undefined
    const resolved = declared ?? (typeof payload.dateFolder === 'string'
      ? await waitForChatWorkspace(payload.dateFolder)
      : undefined)
    if (resolved === undefined) throw new Error('chat-manager: the date-folder Workspace is unknown')
    if (await waitForRegisteredWorkspace(resolved) === undefined) {
      throw new Error('chat-manager: the date-folder Workspace did not reach the client')
    }
    uiWorkspace.startSession(resolved as WorkspaceId)
    void refreshChatState().catch(() => {})
  }

  const browserInjected = (): WorkspaceBrowserInjected => ({
    // Explicit group actions keep their target; unscoped New Session inherits
    // the current Session Workspace before the recent-Workspace fallback.
    startSession: (workspaceId) => { uiWorkspace.startSession(workspaceId) },
    open: openSession,
    searchSessions,
    searchResultLimit: sessions.searchResultLimit,
    requestSessionRename,
    notifyArchivedNotOpenable: () => { notify({ kind: 'archivedNotOpenable' }) },
    renameWorkspace: async (workspaceId, title) => { await workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await workspaces.delete(workspaceId) },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    unarchiveSession: async (sessionId) => { await uiWorkspace.unarchiveSession(sessionId) },
    createWorkspace: input => workspaces.create(input),
    requestSearch: shortcutControls.search,
    requestAddWorkspace: shortcutControls.add,
    closeAddWorkspace: shortcutControls.closeAdd,
    setDirectoryBusy: shortcutControls.directoryBusy,
    dismissForkError: shortcutControls.dismissForkError,
    chatSearch: chatSearchRpc,
    startChat: startChatRpc,
    hooks: {
      directoryFlow: browserFlowSource,
      hostInfo,
      workspaceShortcuts: shortcutControls.state,
      shortcuts: ctx.shortcuts.catalog,
      chat: chatStateSource,
    },
  })
  const pickerInjected = (): WorkspacePickerInjected => ({
    createWorkspace: input => workspaces.create(input),
    hooks: { directoryFlow: pickerFlowSource },
  })
  // Plugin action: the delete confirmation. One request store is shared by the
  // row entry that raises it and the overlay dialog that answers it, so the
  // dialog outlives the row menu the action sat in.
  const deleteRequest = createSnapshotStore<SessionDeleteConfirmRequest | null>(null)
  const deleteInjected = (): DeleteSessionInjected => ({
    requestSessionDelete: (sessionId, displayTitle) => { deleteRequest.set({ sessionId, displayTitle }) },
  })
  const deleteConfirmInjected = (): SessionDeleteConfirmInjected => ({
    hooks: { deleteRequest },
    settleSessionDelete: () => { deleteRequest.set(null) },
    // The tombstone plus baseline refresh live in the shared choreography, so a
    // delete from the settings page leaves every list in the same state.
    deleteSession: performSessionDelete,
  })
  // Each registration declares its owned children in the same call; slot
  // injection follows both the owner and declaration HMR lifetimes.
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces',
      children: {
        'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' },
        // Every row entry reads the menu's open state through a hook bound
        // from the row's render occurrence (the owner passes the state pair
        // as hookContext).
        'sidebar.workspaces.session.menu.item': {
          kind: 'list', scope: 'root', inject: { hooks: { menuOpenState: menuOpenStateFactory, shortcuts: ctx.shortcuts.catalog } },
        },
        'sidebar.workspaces.session.row.action': { kind: 'list', scope: 'root' },
        'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
        'sidebar.session.row.hover': { kind: 'list', scope: 'root' },
      },
      store: viewStore,
      inject: browserInjected,
      locale: NS,
    },
    WorkspaceBrowser,
  ))
  // The shipped row actions take the same route as a plugin's: `slots.inject`
  // waits for the browser registration above to declare each list, and the
  // entries leave with it. Orders step by 100 so a plugin entry can land
  // between them.
  ctx.slots.inject('sidebar.workspaces.session.menu.item', function* () {
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'pin', order: 100, locale: NS, inject: pinInjected }, PinSessionMenuItem)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'rename', order: 200, locale: NS, inject: renameInjected }, RenameSessionMenuItem)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'fork', order: 300, locale: NS, inject: forkInjected }, ForkSessionMenuItem)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'archive', order: 400, locale: NS, inject: archiveInjected }, ArchiveSessionMenuItem)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'delete', order: 500, locale: NS, inject: deleteInjected }, DeleteSessionMenuItem)
  })
  ctx.slots.inject('sidebar.workspaces.session.row.action', function* () {
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.row.action', id: 'archive', order: 100, locale: NS, inject: archiveInjected }, ArchiveSessionRowButton)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.row.action', id: 'pin', order: 200, locale: NS, inject: pinInjected }, PinSessionRowButton)
  })
  // The surfaces the actions raise live in the frame-wide layer: they must
  // outlive the row menu the action sat in.
  ctx.slots.inject('shell.overlay', function* () {
    yield ctx.slots.register({
      name: 'shell.overlay', id: 'workspace.session-rename', locale: NS, inject: renameDialogInjected,
    }, SessionRenameDialog)
    yield ctx.slots.register({
      name: 'shell.overlay', id: 'workspace.session-archive', locale: NS, inject: archiveConfirmInjected,
    }, SessionArchiveConfirmDialog)
    // The toast shares the browser's viewing store: it reads the archived
    // filter to drop the archived notice's filter action once rows are visible.
    yield ctx.slots.register({
      name: 'shell.overlay', id: 'workspace.row-toast', locale: NS, store: viewStore, inject: rowToastInjected,
    }, RowActionToast)
    yield ctx.slots.register({
      name: 'shell.overlay', id: 'workspace.session-delete', locale: NS, inject: deleteConfirmInjected,
    }, SessionDeleteConfirmDialog)
  })
  ctx.slots.inject('conversation.hero.workspace', () => ctx.slots.register(
    {
      name: 'conversation.hero.workspace',
      children: { 'conversation.hero.workspace.directoryFlow': { kind: 'single', scope: 'root' } },
      inject: pickerInjected,
      locale: NS,
    },
    WorkspacePicker,
  ))
  // New Session routing: a workspace-focused Session keeps the shipped
  // inheritance, while a chat-focused Session or no focus opens a new chat. The
  // in-flight gate is shared with the chat pane's add-chat button.
  ctx.effect(() => uiWorkspace.installChatRouting({
    currentId: () => chatRuntimeSource.getSnapshot().currentId,
    chatIds: () => chatRuntimeSource.getSnapshot().chatIds,
    startChat: startChatRpc,
  }), 'dsh-chat-manager: startSession routing')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'chat-archived',
    order: 25,
    label: () => ctx.locale.bind(CHAT_NS)('settings.archived'),
    locale: CHAT_NS,
    inject: () => ({}),
  }, ArchivedSessionsPage))
}

/**
 * The activity a Host `workspace/session-active` refusal reported, or nothing
 * for any other failure. The class identity check goes by name: client plugin
 * bundles do not share error-class identity.
 */
function activeSessionRefusal(reason: unknown): readonly SessionActivity[] | undefined {
  if (!(reason instanceof Error) || reason.name !== 'WorkspaceArchiveError') return undefined
  const { rpcError } = reason as WorkspaceArchiveError
  return rpcError.code === 'workspace/session-active' ? rpcError.details.activity : undefined
}

/**
 * Poll one synchronous probe until it answers or the attempt budget runs out.
 * The chat routes cross two asynchronous boundaries (the Host registry write
 * and the client stream that mirrors it), so the opener waits on observed state
 * rather than on a fixed delay.
 * @param probe - returns the resolved value, or undefined while it is not ready.
 * @param attempts - maximum probes before giving up.
 * @param intervalMs - pause between probes.
 * @returns the first resolved value, or undefined when the budget ran out.
 */
async function waitFor<T>(probe: () => T | undefined, attempts: number, intervalMs = 250): Promise<T | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = probe()
    if (value !== undefined) return value
    await new Promise<void>(resolve => { window.setTimeout(resolve, intervalMs) })
  }
  return undefined
}
