/**
 * The delete route's decisions, kept as pure functions beside
 * `removal-plan.ts` so the branches this machine cannot reach are pinned by a
 * decision table instead of by a probe.
 */

/** One reason the platform reports a Session as active (`turn`/`job`/`subagent`/`schedule`). */
export interface SessionActivity {
  readonly kind: string
  readonly items?: readonly { readonly id: string; readonly label?: string }[]
}

/** What the delete route does after asking the activity gate. */
export type ActivityGatePlan =
  /** Nothing runs: delete without asking. */
  | 'proceed'
  /** Work runs and the caller did not confirm stopping it: answer 409. */
  | 'refuse'
  /** Work runs and the caller confirmed: stop it, then delete. */
  | 'stop'

/**
 * Decide whether the delete route may proceed, must ask, or must stop work
 * first. Mirrors the platform's archive admission: a quiet session deletes
 * directly; running work without `stopActivity` is refused with the activity
 * list; the same work with the confirmation is stopped first.
 * @param activity - what `workspace/session-activity` reported.
 * @param stopActivity - whether the caller confirmed stopping that work.
 * @returns the route's next move.
 */
export function planActivityGate(activity: readonly SessionActivity[], stopActivity: boolean): ActivityGatePlan {
  if (activity.length === 0) return 'proceed'
  return stopActivity ? 'stop' : 'refuse'
}

/** Where the route's artifact path may come from. */
export interface ArtifactPathCandidates {
  /** `SessionPersistenceSnapshot.location?.path` — the public field (0.2.2+). */
  locationPath?: string
  /** Whether the Host exposes `sessionPersistence.locate` at all. */
  locateAvailable: boolean
  /** `sessionPersistence.locate(header)?.path`, read only when the public field is absent. */
  locatedPath?: string
}

/** Why the route could not name a session artifact. */
export type ArtifactPathFailure =
  /** The Host exposes neither the public field nor the private hook. */
  | 'no-public-location-and-no-hook'
  /** A source existed but named no (or an empty) path. */
  | 'host-named-no-artifact'

/** The artifact the delete route may remove, or why it could not be named. */
export type ArtifactPathResolution =
  | { path: string }
  | { failure: ArtifactPathFailure }

/**
 * Pick the artifact path for one stored session.
 *
 * The public `snapshot.location` is the contract: it is preferred whenever it
 * names anything, and the private hook is consulted only when it does not (an
 * older Host build, or a pending session whose snapshot has no location yet).
 * An empty string names nothing — the JSONL backend's own refusal returns one
 * rather than omitting the field.
 * @param candidates - the two path sources and whether the hook exists.
 * @returns the chosen path, or a failure kind the route turns into a message.
 */
export function pickSessionArtifactPath(candidates: ArtifactPathCandidates): ArtifactPathResolution {
  if (namesSomething(candidates.locationPath)) return { path: candidates.locationPath }
  if (!candidates.locateAvailable) return { failure: 'no-public-location-and-no-hook' }
  if (namesSomething(candidates.locatedPath)) return { path: candidates.locatedPath }
  return { failure: 'host-named-no-artifact' }
}

/** Whether a path field names anything (the backends answer `''`, not `undefined`). */
function namesSomething(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

/**
 * One workspace record as the delete route reads it.
 *
 * Only the id is needed: the plan detaches EVERY workspace and never consults
 * `sessionIds`. That getter filters ids the persistence layer cannot resolve,
 * so a ghost row looks unlisted even though its record still carries the slot —
 * reading it as a precondition is exactly the bug this shape prevents.
 */
export interface AccountingWorkspace {
  readonly id: string
}

/** How one date folder's chat registry read ended. */
export type RegistryReadStatus = 'ok' | 'absent' | 'unreadable' | 'corrupt'

/** One date folder's registry, as read by the route. */
export interface AccountingRegistry {
  readonly dateFolder: string
  readonly read: RegistryReadStatus
  /** Whether the parsed registry names the session (only meaningful for `ok`). */
  readonly hasSession?: boolean
}

/** What the delete route's accounting steps are allowed to touch. */
export interface DeleteAccountingInput {
  readonly workspaces: readonly AccountingWorkspace[]
  readonly registryFolders: readonly AccountingRegistry[]
}

/** One registry the plan refused to touch, and why. */
export interface AccountingWarning {
  readonly dateFolder: string
  readonly reason: 'unreadable' | 'corrupt'
}

/** The accounting work for one delete. */
export interface DeleteAccountingPlan {
  /** Workspace ids to detach, in registry order — never filtered. */
  readonly detachWorkspaceIds: readonly string[]
  /** Date folders whose parsed registry names the session, in listing order. */
  readonly clearRegistryFolders: readonly string[]
  /** Registries left untouched because their content is unknown. */
  readonly warnings: readonly AccountingWarning[]
}

/**
 * Plan the delete route's accounting steps.
 *
 * Two rules here are load-bearing:
 *  - **Every** workspace is detached. The entity's `sessionIds` getter filters
 *    ids the persistence layer cannot resolve, so a ghost row (an archived row
 *    whose log is already gone) looks like it never listed the id even though
 *    its record still does. `detachSession` is a no-op write for a record that
 *    does not list the id, so the call is free.
 *  - Only a registry that parsed AND named the session is rewritten. The file
 *    is shared with every other Host on this chat root, so an unreadable or
 *    corrupt one is left exactly as it is (a delete is not a repair): writing
 *    there would either lose content nobody can recover or rebuild the file
 *    from an empty set.
 * @param input - every workspace and every date folder's read.
 * @returns the detach list, the registries to clean, and the ones to leave alone.
 */
export function planDeleteAccounting(input: DeleteAccountingInput): DeleteAccountingPlan {
  const detachWorkspaceIds = input.workspaces.map(workspace => workspace.id)
  const clearRegistryFolders: string[] = []
  const warnings: AccountingWarning[] = []
  for (const registry of input.registryFolders) {
    if (registry.read === 'unreadable' || registry.read === 'corrupt') {
      warnings.push({ dateFolder: registry.dateFolder, reason: registry.read })
      continue
    }
    if (registry.read === 'ok' && registry.hasSession === true) clearRegistryFolders.push(registry.dateFolder)
  }
  return { detachWorkspaceIds, clearRegistryFolders, warnings }
}
