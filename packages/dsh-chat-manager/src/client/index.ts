/**
 * dsh-chat-manager, browser half. The workspace browsing region fork (same
 * visuals as the shipped workspace browser) plus the chat section, session
 * delete, and the archived-session settings page. Two registrations fill the
 * shipped `sidebar.workspaces` and `conversation.hero.workspace` holes; the
 * plugin adds the `chatManager` locale namespace and the settings section.
 *
 * Export discipline: this entry IS the cordis plugin object; all module-table
 * requests stay inside the platform seed words, so `dsh.client.external` is
 * empty by design (the server-side bundle purity gate inlines everything else).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the Controller service merges.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Settings section slot merge (ctx.slots 'settings.section').
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the Session root standard-hook merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorkspaceBrowserInjected, WorkspacePickerInjected } from './contract/slots.ts'
import { UiWorkspaceService } from './navigation.ts'
import { createWorkspaceViewStore } from './stores.ts'
import { WorkspaceBrowser } from './rows/WorkspaceBrowser.tsx'
import { WorkspacePicker } from './WorkspacePicker.tsx'
import { en, zh, type WorkspaceKey } from './locales.ts'
import { ArchivedSessionsPage } from './addon/ArchivedSessionsPage.tsx'
import {
  chatManagerEn, chatManagerZh, chatRuntimeSource, chatStateSource,
  refreshChatState, rpcPost, setRefreshSessions,
} from './addon/chat-runtime.ts'
import type { ChatManagerKey } from './addon/chat-runtime.ts'
import { samePath } from '../shared/paths.ts'
import type { ChatSearchHit } from '../shared/chat.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The workspace browsing region and pick/create flow copy. */
    workspace: WorkspaceKey
    /** The archived-session settings page copy. */
    chatManager: ChatManagerKey
  }
}

/** Dictionary namespace owned by this plugin (shipped workspace copy). */
const NS = 'workspace'

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * the ui-sidebar / ui-conversation applies, whose activation order relative
 * to this one is NOT constrained: dsh.client.inject edges are informational
 * (loading/prefetch metadata, never apply sequencing) and neither owner
 * provides a waitable service. apply therefore depends on each slot
 * declaration through `slots.inject()` instead of assuming order.
 */
export const inject = [
  'slots', 'sessions', 'workspaces', 'locale', 'remote', 'remote.directoryPicker',
]

/**
 * Register the browser and picker once their slot declarations are on the
 * ledger; the chat section rides the browser registration, and the archived
 * settings page fills the settings section. Inject factories return plain
 * callbacks; data reads use the framework's global hooks.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const sessions = ctx.get('sessions') as ISessions
  const workspaces = ctx.get('workspaces') as IWorkspaces
  const uiWorkspace = new UiWorkspaceService(
    ctx, ctx.remote.directoryPicker, workspaces, sessions)
  ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list, chat: chatStateSource } })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace: dictionaries')
  ctx.effect(() => ctx.locale.register('chatManager', { zh: chatManagerZh, en: chatManagerEn }), 'dsh-chat-manager: dictionaries')
  setRefreshSessions(() => { void sessions.refresh() })
  void refreshChatState().catch(() => {})

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

  // ---- dsh-chat-manager RPC helpers ----
  const deleteSessionRpc = (sessionId: string): Promise<void> =>
    rpcPost('/api/chat-manager/delete-session', { sessionId }).then(() => undefined)
  const chatSearchRpc = (query: string): Promise<ChatSearchHit[]> =>
    rpcPost('/api/chat-manager/search-chats', { query }).then((data) =>
      (data as { items?: ChatSearchHit[] }).items ?? [])
  const resolveChatWorkspaceId = async (dateFolder: string): Promise<string> => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const found = (chatRuntimeSource.getSnapshot().workspaces ?? []).find(workspace =>
        workspace.path === dateFolder || samePath(workspace.path, dateFolder))
      if (found !== undefined && typeof found.workspaceId === 'string' && found.workspaceId.length > 0) {
        return found.workspaceId
      }
      await new Promise<void>(resolve => { window.setTimeout(resolve, 250) })
    }
    return ''
  }
  const startChatRpc = (): Promise<void> =>
    rpcPost('/api/chat-manager/ensure-date-folder', {}).then(async (data) => {
      const payload = data as { dateFolder?: unknown; workspaceId?: unknown }
      const dateFolder = typeof payload.dateFolder === 'string' ? payload.dateFolder : ''
      let workspaceId = typeof payload.workspaceId === 'string' && payload.workspaceId.length > 0
        ? payload.workspaceId
        : ''
      if (workspaceId === '' && dateFolder !== '') workspaceId = await resolveChatWorkspaceId(dateFolder)
      if (workspaceId === '') throw new Error('missing workspace id')
      // The fresh date-folder Workspace may not have reached the client
      // stream yet (Host registry written, feed sync in flight); the session
      // start needs the local snapshot, so wait for it before opening.
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const snapshot = workspaces.list.getSnapshot()
        if (snapshot.items.some(w => w.workspaceId === workspaceId)) break
        await new Promise<void>(resolve => { window.setTimeout(resolve, 250) })
      }
      uiWorkspace.startSession(workspaceId as WorkspaceId)
      void refreshChatState().catch(() => {})
    })

  const browserInjected = (): WorkspaceBrowserInjected => ({
    // Explicit group actions keep their target; unscoped New Session inherits
    // the current Session Workspace before the recent-Workspace fallback
    // (the plugin routes the no-arg case to a new chat first — see below).
    startSession: (workspaceId) => { uiWorkspace.startSession(workspaceId) },
    open: (sessionId) => { sessions.open(sessionId) },
    searchSessions,
    searchResultLimit: sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      // Row → session-face hop: rename is a per-session verb (ISession), not
      // a list-service verb; the binding resolves any listed session.
      const session = sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
      const result = await session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (sessionId) => {
      sessions.fork({ sessionId, increaseTitle: true })
        .then((childId) => { sessions.open(childId) })
        .catch(() => {
          // Fork or child-rename failure keeps the current selection.
        })
    },
    renameWorkspace: async (workspaceId, title) => { await workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await workspaces.delete(workspaceId) },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await uiWorkspace.archiveSession(sessionId) },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
    createWorkspace: input => workspaces.create(input),
    deleteSession: deleteSessionRpc,
    chatSearch: chatSearchRpc,
    startChat: startChatRpc,
    hooks: { directoryFlow: browserFlowSource, hostInfo, chat: chatStateSource },
  })
  const pickerInjected = (): WorkspacePickerInjected => ({
    createWorkspace: input => workspaces.create(input),
    hooks: { directoryFlow: pickerFlowSource },
  })
  // Each registration declares its directory-flow child in the same call;
  // slot injection follows both the owner and declaration HMR lifetimes.
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces',
      children: { 'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' } },
      store: createWorkspaceViewStore(),
      inject: browserInjected,
      locale: NS,
    },
    WorkspaceBrowser,
  ))
  ctx.slots.inject('conversation.hero.workspace', () => ctx.slots.register(
    {
      name: 'conversation.hero.workspace',
      children: { 'conversation.hero.workspace.directoryFlow': { kind: 'single', scope: 'root' } },
      inject: pickerInjected,
      locale: NS,
    },
    WorkspacePicker,
  ))
  // New-session routing: a workspace-focused session keeps the shipped
  // inheritance; a chat-focused session or no focus opens a new chat. The
  // patching and its restore live in the UiWorkspaceService wrapper (the
  // only component that legitimately owns ctx.uiWorkspace); the in-flight
  // gate is shared with the chat-header 新建聊天 button.
  ctx.effect(() => uiWorkspace.installChatRouting({
    currentId: () => chatRuntimeSource.getSnapshot().currentId,
    chatIds: () => chatRuntimeSource.getSnapshot().chatIds,
    startChat: startChatRpc,
  }), 'dsh-chat-manager: startSession routing')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'chat-archived',
    order: 25,
    label: () => ctx.locale.bind('chatManager')('settings.archived'),
    locale: 'chatManager',
    inject: () => ({}),
  }, ArchivedSessionsPage))
}
