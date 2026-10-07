/**
 * The chat-folder prompt section and the delivery-time trigger that arms it,
 * kept as pure functions so the two regressions around them are pinned by tests
 * instead of by a live model turn.
 *
 * What went wrong once. DSH calls a section's `text` with its
 * `AssembleContext`, which the agent runtime augments with `agent?: Agent`
 * (`@deepseek-ai/dsh-agent` `assembleContextFor` builds `{ agent, scope }`).
 * The published `Agent` declares one member, `id` ("Session-backed Agent
 * identity"); the live agent adds `session` at runtime. Neither is `sessionId`
 * — so code that read `context.agent.sessionId` resolved nothing, returned `''`
 * at every assembly, and the model never received the instruction, silently,
 * because an empty section is legal.
 *
 * What went wrong next, and why {@link chatPromptTrigger} lives here. The
 * section is evaluated inside `AgentLoop.preStep`'s assembly, and the message
 * that starts the turn reaches the durable log only later: `AgentLoop.step()`
 * commits the rendered `system/message` first and appends the claimed
 * `user/message` second, both after that assembly. A trigger on the append is
 * therefore one step too late — the first prompt of the turn went out with an
 * empty section, the model wrote its file into the date folder (the working
 * directory), and only the NEXT step's prompt named the chat folder, which the
 * model then had to move the file into. The Host arms the `pending` state from
 * `agent/inbox/inserted` instead: DSH emits it inside `Agent.send()`'s splice,
 * synchronously, before it wakes the driver — so the marker is visible to the
 * very first assembly of that turn.
 *
 * What these seams prove, and what they do not. They pin the session-id read,
 * the text of both section states, and the trigger's own conditions (a person's
 * prompt, a chat workspace, actual text). They cannot pin the platform's call
 * shapes: the section's parameter is a local structural type (the Host face
 * types `systemPrompt.section` loosely), so the type checker cannot compare it
 * with `Agent`, and a committed test cannot import the deployed platform
 * package. Those shapes were verified against the deployed 0.2.0-rc.2 build
 * instead (`assembleContextFor` returns `{ agent, scope }`, a section's text is
 * evaluated with that same context, and `Agent.send()` emits
 * `agent/inbox/inserted` before `wakeDriver()`).
 */
import { isUnderChatRoot } from './paths.ts'

/** What this section reads from DSH's prompt-assembly context (loose by design). */
export interface ChatFolderSectionContext {
  /** The live agent the assembly belongs to; absent outside an agent-driven assembly. */
  agent?: {
    /** Session-backed agent identity (`Agent.id`). */
    id?: string
    /** The live session this agent drives; its `id` is the session id. */
    session?: { id?: string; header?: ChatSessionHeader }
  }
}

/**
 * The session facts this feature keys on, read off `SessionHeader` (loose by
 * design: the Host face types the assembly context itself).
 */
export interface ChatSessionHeader {
  /** The session's workspace; for a chat session this is the dated folder. */
  cwd?: string
  /**
   * {@link SUBAGENT_ORIGIN} for a session DSH created as a delegated child.
   * Such a child inherits its parent's `cwd` and receives its task as a
   * `source: { kind: 'user' }` message, so without this marker it would be
   * indistinguishable from a chat of its own.
   */
  origin?: string
  /** The session this one was delegated or forked from (`childSessionMeta`). */
  parentSession?: string
}

/**
 * One session, as this feature keys on it: the id every lookup uses, plus the
 * header when the caller has one. The pair travels together through the
 * trigger, the state rule, and the section text, so it is one value.
 */
export interface ChatSessionRef {
  /** The session id — also `Agent.id`; DSH keeps the two equal. */
  id: string
  /** The session's header, when the context carries one. */
  header?: ChatSessionHeader
}

/**
 * `SessionHeader.origin` for a session DSH created as a delegated subagent child
 * (`childSessionMeta` stamps it). One shared literal, so the "is this a chat?"
 * rules here and the chat-row filter in the Host's `/state` route cannot drift
 * apart.
 *
 * The same comparison also appears in the browser half's `client/tree.ts`. That
 * file is a byte-identical fork of built-in `ui-workspace` source, so it keeps
 * its own literal and is deliberately not touched.
 */
export const SUBAGENT_ORIGIN = 'subagent'

/**
 * One delivered prompt, as DSH exposes it to the Host (loose by design).
 * `agent/inbox/inserted` carries a `UserMessage` and a durable
 * `user/message` carries the same two fields; both deliveries are read here.
 */
export interface DeliveredMessage {
  /** Who produced this message (`'user'` for a person's own prompt). */
  source?: { kind?: string }
  /** Model-facing blocks; the text blocks name the chat. */
  content?: ReadonlyArray<{ type?: string; text?: string }>
}

/** What one delivery says about the chat folder it should start. */
export interface ChatPromptTrigger {
  /** The session's workspace — the dated folder the slug folder belongs in. */
  dateFolder: string
  /** The prompt text the folder is named from (ADR 0001). */
  text: string
}

/**
 * Decide whether one delivered message starts a chat's slug folder.
 *
 * This gate runs before the folder exists, so it must not consult it: the
 * facts are the message's producer, the session's header, and the text.
 * @param message - the delivered message, when the delivery carried one.
 * @param header - the session's own header (`SessionHeader`).
 * @param chatRoot - the chat root, or null when it could not be resolved.
 * @returns the naming facts to act on, or `undefined` when this delivery starts
 *   no folder.
 */
export function chatPromptTrigger(
  message: DeliveredMessage | undefined,
  header: ChatSessionHeader | undefined,
  chatRoot: string | null,
): ChatPromptTrigger | undefined {
  // A delegated child is not a chat. Both subagent drivers deliver the child's
  // task as `source: { kind: 'user' }` (`subagent-in-process-driver`'s
  // `child.followup(createUserMessage(…))` and `subagent/continuation.ts`'s
  // `{ source: { kind: 'user' }, … }`) and the child inherits the parent's cwd,
  // so the producer kind alone would let every delegated child mint a folder of
  // its own, named from its task. It works inside the parent chat's folder
  // instead — see {@link chatFolderStateFor}.
  if (header?.origin === SUBAGENT_ORIGIN) return undefined
  // Only a producer that declares itself the person's own prompt names a chat.
  if (message?.source?.kind !== 'user') return undefined
  // A chat session is one whose workspace is inside the chat root; a workspace
  // session's own project directory never is.
  const sessionCwd = header?.cwd
  if (sessionCwd === undefined || !isUnderChatRoot(sessionCwd, chatRoot)) return undefined
  const text = (message.content ?? [])
    .filter((block) => block?.type === 'text')
    .map((block) => block.text ?? '')
    .join(' ')
    .trim()
  // A first message without text has no name to give (ADR 0001). Skipping it
  // leaves that session exactly as it behaved before chat folders existed,
  // instead of guessing a folder; its next text-bearing prompt will name one.
  if (text === '') return undefined
  return { dateFolder: sessionCwd, text }
}

/** What the Host knows about one session's chat folder at assembly time. */
export type ChatFolderState =
  /** The registered chat folder: the section sends the model's file I/O there. */
  | { kind: 'folder'; folder: string }
  /**
   * A chat session whose folder is not registered yet. The name comes from the
   * first message, so the folder appears a moment after that message — while
   * the model is already deciding where to write. The section must keep it out
   * of the working directory in that window.
   */
  | { kind: 'pending' }
  /** Not a chat session, or a chat session with no folder to name: no text. */
  | { kind: 'none' }

/**
 * Decide the section state from the Host's two signals.
 *
 * The folder is checked FIRST: both signals are true for a moment on a real
 * Host, because the `.then` that registers the folder runs before the
 * `.finally` that clears the in-flight marker. Reporting `pending` in that
 * window would hold the model off from a folder that already exists.
 * @param folder - The registered chat folder, when there is one.
 * @param pending - Whether this chat's slug generation is in flight.
 * @returns the state for {@link chatFolderSectionText}.
 */
export function chatFolderState(folder: string | undefined, pending: boolean): ChatFolderState {
  if (folder !== undefined) return { kind: 'folder', folder }
  return pending ? { kind: 'pending' } : { kind: 'none' }
}

/**
 * What the section must say for one session: the chat's own registered folder,
 * the folder of the chat a delegated child belongs to, the hold-off text while
 * a folder is being created, or nothing.
 *
 * The child rule is a decided behavior, not an inference: a child session is
 * created with its parent's cwd and its task arrives as a user-kind message, so
 * it passes every chat-session test there is; it must still not get a folder of
 * its own (that is what a chat folder *is* — the chat's container), and the
 * files it produces for the chat belong in the chat's folder.
 * @param session - the session this assembly belongs to.
 * @param folderOf - the registered chat folder for one chat session id.
 * @param isPending - whether one session's slug generation is in flight.
 * @returns the state for {@link chatFolderSectionText}.
 */
export function chatFolderStateFor(
  session: ChatSessionRef,
  folderOf: (sessionId: string) => string | undefined,
  isPending: (sessionId: string) => boolean,
): ChatFolderState {
  if (session.header?.origin === SUBAGENT_ORIGIN) {
    // One hop, the hop DSH records (`SessionHeader.parentSession`). A child of a
    // child names another child here, which no chat folder is registered for, so
    // it falls through to `none` — the pre-existing behavior for a child rather
    // than a wrong folder. The same fall-through covers a delegation that
    // outruns its chat's own folder creation, and a child delegated from a
    // workspace session.
    const parentId = session.header.parentSession
    return chatFolderState(parentId === undefined ? undefined : folderOf(parentId), false)
  }
  return chatFolderState(folderOf(session.id), isPending(session.id))
}

/**
 * Build the chat-folder section text for one prompt assembly.
 * @param context - DSH's assembly context for this assembly.
 * @param stateOf - What the Host knows about one session's chat folder, for the
 *   session this assembly belongs to.
 * @returns the section text, or `''` when this session has no chat folder and
 *   none is coming — an empty section contributes nothing to the prompt.
 */
export function chatFolderSectionText(
  context: ChatFolderSectionContext,
  stateOf: (session: ChatSessionRef) => ChatFolderState,
): string {
  // The registry is keyed by session id, so the session's own id is the exact
  // key. `agent.id` is the documented session-backed identity and is the same
  // value; it also covers a context that carries the agent without its session.
  const session = context.agent?.session
  const id = session?.id ?? context.agent?.id
  if (id === undefined) return ''
  const state = stateOf(session?.header === undefined ? { id } : { id, header: session.header })
  if (state.kind === 'none') return ''
  if (state.kind === 'pending') {
    // No path to name yet, and a model that guesses writes into the working
    // directory — where the sandbox then refuses to let it clean up (observed
    // on a real Host: a stray file 49 ms before this section appeared). Sending
    // it to look instead of to guess also covers the reverse race, where the
    // folder appeared between this assembly and the step. The creation is
    // started when this prompt is delivered, so it is usually there by the time
    // a listing returns: saying so keeps the model from giving the turn up.
    return [
      "You are working in a chat session. This chat's own folder is created from the first message of the conversation, and it does not exist yet.",
      'Do not create files or directories in the working directory itself: list the working directory, wait briefly and list it again, and put your files inside the chat folder once it appears.',
      'If it is still not there, do the rest of this step and say that the folder was not ready.',
    ].join('\n')
  }
  return [
    'You are working in a chat session. Do not read or write files directly in the chat working directory.',
    `Put all file input/output for this chat into the chat folder: ${state.folder}`,
    // Never claim the chat folder IS the workspace root: the session's own
    // workspace root stays the date folder (`ensure-date-folder` registers it
    // and nothing repoints the cwd), so a relative path does not resolve inside
    // the chat folder. Asking for absolute paths is true and gets the files
    // there; asserting a root the folder does not own would send the model's
    // relative writes back into the date folder — the dispersion this section
    // exists to prevent.
    'Give every file in this chat an absolute path under the chat folder: relative paths resolve against the session working directory (the dated parent folder), not against the chat folder.',
  ].join('\n')
}
