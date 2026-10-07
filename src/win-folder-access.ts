/**
 * Windows-only chat-folder provisionability.
 *
 * Why the plugin does this at all. DSH's `workspace-write` sandbox provisions
 * a session's workspace root by writing a standing DACL edit (a per-workspace
 * capability-SID allow ACE, an Everyone `FILE_DELETE_CHILD` deny) plus a Low
 * mandatory label into the root's SACL (`@deepseek-ai/dsh-sandbox-windows-acl`,
 * `grantWrite`). That needs effective `WRITE_DAC` AND `WRITE_OWNER` on the
 * root. A directory inherits what its parent grants: on a volume whose root
 * ACL has no `CREATOR OWNER` entry (e.g. a relocated Documents folder on
 * `E:\`), a folder created there inherits only `Authenticated Users: Modify`
 * — and MODIFY carries neither `WRITE_DAC` nor `WRITE_OWNER`. DSH then fails
 * the first confined tool call of that chat with
 * `SetNamedSecurityInfoW failed (Win32 5): grantWrite(<folder>)`.
 *
 * The chat folders are ours: the plugin creates the date folder (the session's
 * workspace root) and the slug folder inside it. So the plugin makes the date
 * folder provisionable by adding a full-control allow ACE for the signed-in
 * user — exactly what DSH's own `diagnose-windows-sandbox-acl` repair adds, but
 * at creation time instead of after a failure. The check reads the folder's
 * listing first and only writes when the account has no effective full control
 * there, then re-reads to confirm the write landed: a silent no-op must not be
 * reported as success. The helper never throws — every failure is a report —
 * because the ACE is not required at all under `danger-full-access`.
 *
 * Only `icacls` (a Windows system tool, resolved by absolute path — never by
 * PATH) is used: the plugin must not take a dependency on DSH's private
 * sandbox package, and Node exposes no ACL API.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

/** Outcome of one folder's provisionability check. */
export interface FolderAccess {
  /** True only when the folder is confirmed to grant the signed-in user full control. */
  ok: boolean
  /** True when this call added an ACE (false when the account already had full control). */
  changed: boolean
  /** True when the check does not apply on this platform (non-Windows); never a failure by itself. */
  skipped: boolean
  /** Diagnostic text for a failure, or for a grant whose read-back did not confirm it. */
  detail?: string
}

/**
 * How much `icacls` output says about one account's own control of a folder.
 * `inherited` counts as `full-control`: an inherited allow for the account
 * grants the same effective `WRITE_DAC` + `WRITE_OWNER` an explicit one does,
 * which is what a normal volume's `CREATOR OWNER`-style inheritance provides.
 */
export type PrincipalControl = 'full-control' | 'denied' | 'absent'

/** Milliseconds one `icacls` invocation may take before it is abandoned. */
const ICACLS_TIMEOUT_MS = 10_000

/**
 * The ACE the plugin writes: a NON-inheritable full control allow for the
 * signed-in user. Non-inheritable on purpose — DSH only ever provisions the
 * workspace ROOT (the date folder), and an inheritable ACE would additionally
 * grant this account full control over every descendant of the chat folder.
 * (It does not avoid the subtree walk: the folder already carries inheritable
 * ACEs such as the inherited `Authenticated Users:(I)(OI)(CI)(M)`, and the
 * platform documents that any `SetNamedSecurityInfoW` on such a directory
 * walks its descendants.) It mirrors what DSH's own repair writes (`icacls`
 * shows it as `CHEN:(F)`).
 */
const USER_FULL_CONTROL = (principal: string): string => `${principal}:(F)`

/** Absolute `icacls.exe` path: PATH is not trusted for a security-relevant tool. */
function icaclsPath(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
  return path.join(systemRoot, 'System32', 'icacls.exe')
}

/**
 * The signed-in account in the `DOMAIN\user` form icacls resolves. Both parts
 * come from the environment (`USERDOMAIN` is the machine name on a workgroup
 * host and the NetBIOS domain on a domain host), so a missing part means the
 * identity cannot be named and no ACE is attempted.
 * @returns the principal, or undefined when the environment does not name one.
 */
function currentPrincipal(): string | undefined {
  const user = process.env.USERNAME
  if (user === undefined || user.length === 0) return undefined
  const domain = process.env.USERDOMAIN
  return domain === undefined || domain.length === 0 ? user : `${domain}\\${user}`
}

/**
 * The `:(flags)(rights)` tail of one ACE, with no principal capture: `icacls`
 * leaves the account a blank column to the left of it, and a legal account name
 * may contain spaces (`CONTOSO\John Doe`), so the principal is read from the
 * text BEFORE the colon rather than from a character class.
 */
const ACE_TAIL = /:(\([A-Za-z]+\))+/g

/** The account-rights markers that decide whether a deny blocks provisioning. */
const BLOCKING_DENY_RIGHTS = ['(F)', 'WO', 'WD']

/**
 * Read what an `icacls <dir>` listing says about `principal`'s own ACEs.
 *
 * Rules, in order: an ACE marked `(IO)` (inherit-only) never applies to this
 * object, so it is ignored; a deny for this account covering full control or
 * `WRITE_OWNER`/`WRITE_DAC` means the account cannot be provisioned here even
 * if some allow also names it (Windows evaluates denies first); an allow
 * containing `(F)` — explicit or inherited — means it can.
 *
 * The principal is matched as the ACE's own principal, never as a substring of
 * the line: the listing's first line is prefixed with the directory path (which
 * contains a colon and usually the account name — `C:\Users\CHEN\...`), so a
 * line-wide search would credit an ACE that belongs to somebody else.
 * @param output - combined stdout/stderr of `icacls <dir>`.
 * @param principal - the `DOMAIN\user` spelling passed to `/grant`.
 * @returns what the listing shows for that account.
 */
export function readPrincipalControl(output: string, principal: string): PrincipalControl {
  // icacls may print the account name in a different case than the environment
  // carries it (and the domain part is commonly upper-cased).
  const wanted = principal.toLowerCase()
  let full = false
  let denied = false
  for (const line of output.split(/\r?\n/)) {
    for (const ace of line.matchAll(ACE_TAIL)) {
      // Everything left of the ACE is the path (first line only) plus the
      // principal; collapsing whitespace runs keeps that comparison exact even
      // when the account name itself contains a space.
      const before = line.slice(0, ace.index).replace(/\s+/g, ' ').trim().toLowerCase()
      if (before !== wanted && !before.endsWith(` ${wanted}`)) continue
      const blob = ace[0]
      if (blob.includes('(IO)')) continue
      if (blob.includes('(DENY)')) {
        if (BLOCKING_DENY_RIGHTS.some((right) => blob.includes(right))) denied = true
      } else if (blob.includes('(F)')) {
        full = true
      }
    }
  }
  if (denied) return 'denied'
  return full ? 'full-control' : 'absent'
}

/** Run icacls with fixed arguments and return its combined output plus exit status. */
function runIcacls(args: string[]): { status: number | null; output: string; error?: string } {
  const result = spawnSync(icaclsPath(), args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: ICACLS_TIMEOUT_MS,
  })
  if (result.error !== undefined && result.error !== null) {
    return { status: null, output: '', error: result.error.message }
  }
  const stdout = typeof result.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result.stderr === 'string' ? result.stderr : ''
  return { status: result.status, output: `${stdout}${stderr}` }
}

/** Last non-empty line of icacls output, for a bounded diagnostic. */
function tail(output: string): string {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const last = lines.length > 0 ? lines[lines.length - 1] : ''
  return last.length > 200 ? `${last.slice(0, 200)}…` : last
}

/**
 * Make one chat folder provisionable by DSH's Windows sandbox: ensure the
 * signed-in user holds effective full control there, which is what conveys the
 * `WRITE_DAC` + `WRITE_OWNER` the sandbox's grant needs.
 *
 * Read first, write only when the account lacks full control: a folder whose
 * creator already has it — through the volume's `CREATOR OWNER`-style
 * inheritance or an earlier repair — is therefore never re-ACLed, so a Host
 * start costs one read-only listing per date folder. `icacls` is spawned
 * synchronously and capped at {@link ICACLS_TIMEOUT_MS}, so a dead or very slow
 * volume costs that bound per folder instead of hanging the caller; the path is
 * only ever reached for chat folders, and a failure is reported, never thrown.
 * @param dir - the chat folder (usually a date folder, i.e. a session's workspace root).
 * @returns what the check found and, when it had to write, whether the write was confirmed.
 */
export function ensureWindowsFolderAccess(dir: string): FolderAccess {
  if (process.platform !== 'win32') return { ok: true, changed: false, skipped: true }
  try {
    if (!fs.existsSync(dir)) {
      return { ok: false, changed: false, skipped: false, detail: `chat folder is missing: ${dir}` }
    }
    const principal = currentPrincipal()
    if (principal === undefined) {
      return { ok: false, changed: false, skipped: false, detail: 'the environment names no Windows account (USERNAME)' }
    }
    const before = runIcacls([dir])
    if (before.error !== undefined) {
      return { ok: false, changed: false, skipped: false, detail: `icacls failed to start: ${before.error}` }
    }
    const control = readPrincipalControl(before.output, principal)
    if (control === 'full-control') return { ok: true, changed: false, skipped: false }
    if (control === 'denied') {
      // Writing an allow would not lift a deny for the same account, and
      // reporting success would hide a folder DSH still cannot provision.
      return {
        ok: false,
        changed: false,
        skipped: false,
        detail: `a deny ACE names ${principal}, so full control cannot be granted here: ${tail(before.output)}`,
      }
    }
    const granted = runIcacls([dir, '/grant', USER_FULL_CONTROL(principal)])
    if (granted.error !== undefined) {
      return { ok: false, changed: false, skipped: false, detail: `icacls failed to start: ${granted.error}` }
    }
    if (granted.status !== 0) {
      return { ok: false, changed: false, skipped: false, detail: `icacls /grant exited ${String(granted.status)}: ${tail(granted.output)}` }
    }
    const after = runIcacls([dir])
    const confirmed = after.error === undefined ? readPrincipalControl(after.output, principal) : 'absent'
    if (confirmed === 'full-control') return { ok: true, changed: true, skipped: false }
    // icacls reported success but the read-back does not show it. Fail closed:
    // the grant may well have landed (a non-ASCII account name cannot be
    // matched once the console codepage has decoded it into this string), but
    // "not confirmed" is not "provisionable", and callers act on `ok`.
    return {
      ok: false,
      changed: true,
      skipped: false,
      detail: `icacls /grant exited 0 but the read-back does not show full control for ${principal}`
        + ` (${confirmed}): ${tail(after.error === undefined ? after.output : after.error)}`,
    }
  } catch (err) {
    return {
      ok: false,
      changed: false,
      skipped: false,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}
