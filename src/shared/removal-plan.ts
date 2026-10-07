/**
 * The delete route's artifact-removal decision, kept as a pure function so the
 * POSIX-only branch is verifiable on any host: this machine cannot run a POSIX
 * Host, so the platform split is pinned by a decision table instead of by a
 * probe (see `test/removal-plan.test.mjs`).
 *
 * Why the platform matters at all. The JSONL backend's cross-process write
 * lease is a `flock(2)` on `<sessionDir>/session.lock` on POSIX and a named
 * kernel semaphore (no file at all) on Windows
 * (`session-persistence-jsonl/src/lease.ts`, "Removing a live session's lock
 * file therefore forfeits exclusion on POSIX (nothing in the harness does
 * so); Windows has no lock file at all"). A session's durable unit is its own
 * directory — the append path is `open(path, 'a')`, which CREATES the log
 * again, so removing only the log while leaving the directory lets a live
 * write handle write the session back. The two requirements collide exactly
 * on POSIX: removing the directory is the only way to stop resurrection, and
 * the directory is what carries the lock file.
 *
 * That is why a POSIX delete of a session this Host still holds live is
 * refused rather than attempted, while Windows (whose lease survives the
 * directory) keeps deleting it. Everything else — including a POSIX delete of
 * a session this Host does not hold — stays on the shared path.
 */

/** What the delete route may do with one stored session's on-disk artifact. */
export type RemovalPlan =
  /** POSIX + a live handle in this Host: refuse (the lock file dies with the directory). */
  | 'refuse-live-posix'
  /** The artifact sits in a directory named after the session: remove that directory. */
  | 'remove-directory'
  /** The artifact sits elsewhere: remove the file and require an empty sibling set. */
  | 'remove-single-artifact'

/** Inputs the decision reads; all three are already known by the caller. */
export interface RemovalPlanInput {
  /** `process.platform` of the Host; anything that is not `'win32'` is POSIX semantics. */
  platform: string
  /** Whether the Host still holds the session live (`sessions.get(id) !== undefined`). */
  live: boolean
  /** `path.basename(path.dirname(artifact)) === sessionId`. */
  artifactInSessionDirectory: boolean
}

/**
 * Decide the artifact removal for one stored session.
 *
 * Decision table (unknown platforms are treated as POSIX: refusing a delete is
 * recoverable, forfeiting the platform's write exclusion is not):
 *
 * | platform   | live  | in session dir | result                 |
 * |------------|-------|----------------|------------------------|
 * | win32      | any   | yes            | remove-directory       |
 * | win32      | any   | no             | remove-single-artifact |
 * | not win32  | yes   | any            | refuse-live-posix      |
 * | not win32  | no    | yes            | remove-directory       |
 * | not win32  | no    | no             | remove-single-artifact |
 *
 * @param input - platform, live-handle flag, and the artifact's directory shape.
 * @returns the removal plan for this session.
 */
export function planSessionArtifactRemoval(input: RemovalPlanInput): RemovalPlan {
  if (input.platform !== 'win32' && input.live) return 'refuse-live-posix'
  return input.artifactInSessionDirectory ? 'remove-directory' : 'remove-single-artifact'
}
