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
 * at creation time instead of after a failure.
 *
 * HOW THE CHECK READS A FOLDER, and why not the obvious way. `icacls <dir>`
 * prints each ACE's principal as a NAME, decoded from the console code page
 * (ANSI/OEM — GBK on a zh-CN host), so an earlier version that matched those
 * names against `USERDOMAIN\USERNAME` could never confirm a non-ASCII account,
 * reported a repaired folder as failed, and re-wrote the DACL (an eager
 * full-tree re-propagation) on every Host start. Names also hide the two
 * shapes that decide real access: a deny that names a GROUP the account is in,
 * and an allow that reaches the account only through a group.
 *
 * This module therefore reads the DACL as SDDL — `icacls <dir> /save <file>`
 * writes a UTF-16LE save file whose DACL is spelled with SIDs, hex or
 * two-letter rights, and the ACE flags that say whether an ACE is inherited
 * (`ID`) or inherit-only (`IO`). The signed-in identity comes from
 * `whoami /user` (own SID) and `whoami /groups` (every SID in the token), which
 * are ASCII whatever the code page is. Access is then decided the way Windows
 * decides it: walk the ACEs in order, and let the FIRST ACE that applies to the
 * token and carries the right decide that right — a deny naming any of the
 * token's SIDs can block the account, while only the account's OWN SID is
 * allowed to prove provisionability (a group allow may belong to a member that
 * is deny-only in a filtered token, so it is never taken as proof).
 *
 * WHAT THIS CHECK STILL CANNOT SEE (fail-closed, but honestly bounded): the
 * privileges a token may hold (`SeTakeOwnership`/`SeRestore`/`SeSecurity` can
 * widen access beyond the DACL), mandatory integrity labels, a deny naming a
 * token SID `whoami /groups` does not list (the logon session SID), conditional
 * (`XA`/`XD`) and object (`OA`/`OD`) ACEs — treated here as "grants nothing" and
 * "may deny" respectively — and the folder's OWNER (not probed: `grantWrite`
 * documents "owned by the caller and grant WRITE_OWNER", and a full-control ACE
 * for the caller conveys both `WRITE_DAC` and `WRITE_OWNER`, which is what the
 * owner's implicit rights would provide). An SDDL trustee this reader cannot pin
 * down — the placeholders `CO`/`CG`, `OW` (which stands for the object's OWNER,
 * i.e. normally this account), or a domain-relative abbreviation — is treated as
 * possibly naming this account: its deny blocks, its allow proves nothing. A
 * NULL-DACL spelling is refused rather than rewritten, because replacing a NULL
 * DACL with a one-ACE DACL would narrow access instead of widening it.
 *
 * The identity is resolved once per process and is required in full: a `whoami`
 * that fails, times out, or comes back with no usable group list leaves the
 * identity unavailable for the rest of that process, so no folder is ever judged
 * against a token that quietly lost its groups (and one wedged call cannot spend
 * the caller's budget again for every remaining date folder).
 *
 * The write itself is the real proof for the folders that need one: an
 * `icacls /grant` is a real `SetNamedSecurityInfoW` on the DACL, its exit
 * status is the real `WRITE_DAC` evidence, and the re-read that follows is what
 * `ok` reports. Only the "already provisionable, nothing to do" answer rests on
 * the ACL evaluation alone, and that answer is the one where the ACL's word is
 * the whole story.
 *
 * Only `icacls` and `whoami` (Windows system tools, resolved by absolute path —
 * never by PATH) are used: the plugin must not take a dependency on DSH's
 * private sandbox package, and Node exposes no ACL API.
 */
import fs from 'node:fs'
import os from 'node:os'
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
  /** Why the check failed, or why a write it attempted was not confirmed. Present only when `ok` is false. */
  detail?: string
}

/**
 * Caller-owned budget. The startup sweep and the chat route each pass their own
 * deadline, so a dead or very slow volume costs that budget and no more: no
 * further `icacls` call is started once the deadline is inside
 * {@link MIN_SPAWN_BUDGET_MS}.
 */
export interface FolderAccessOptions {
  /** Absolute `Date.now()`-based instant after which no further tool call is started. */
  deadline?: number
}

/**
 * One DACL entry, reduced to the two facts this module decides on.
 *
 * `rights` is `null` when the ACE's rights field could not be read (an unknown
 * two-letter code): an unreadable DENY is then treated as blocking and an
 * unreadable ALLOW as granting nothing, so an unreadable ACE can never turn
 * into a false "provisionable".
 *
 * `resolved` is false when the trustee is not a SID this reader can pin down
 * (an SDDL placeholder such as `CO`/`CG`, or an abbreviation with no entry in
 * {@link WELL_KNOWN_SIDS}). Such an ACE is never counted as a grant, and a DENY
 * among them counts as blocking: the alternative — assuming a trustee we cannot
 * name is somebody else — is exactly the false green this reader exists to
 * prevent.
 */
export interface DaclAce {
  /** `allow` for `A`, `deny` for `D`/`OD`/`XD`, `other` for anything else (audit, conditional allow). */
  kind: 'allow' | 'deny' | 'other'
  /** `IO`: the ACE does not apply to the object itself, only to what it inherits into. */
  inheritOnly: boolean
  /** `ID`: the ACE was inherited from an ancestor (a new explicit ACE outranks it). */
  inherited: boolean
  /** The ACE's trustee: a SID when `resolved`, otherwise the spelling the SDDL used. */
  trustee: string
  /** False when the trustee spelling could not be expanded to a SID. */
  resolved: boolean
  /** Which of the two rights the ACE carries; `null` when the rights field is unreadable. */
  rights: { writeDac: boolean; writeOwner: boolean } | null
}

/** One right's outcome after walking a DACL in ACE order. */
export type RightOutcome = 'granted' | 'denied' | 'undecided'

/** What one DACL read says about the signed-in account and its token. */
export interface AccessVerdict {
  /** The account's own SID holds both rights, with nothing earlier and applicable deciding otherwise. */
  provisionable: boolean
  /** Per-right outcome for the account (the ACE order is what makes it meaningful). */
  rights: { writeDac: RightOutcome; writeOwner: RightOutcome }
  /** The deny that first blocked a needed right, and whether a new explicit ACE would outrank it. */
  blocked?: { sid: string; overridable: boolean }
  /** Count of ACEs this reader could not evaluate (conditional/object types, unreadable rights). */
  unreadable: number
}

/** What to do about one folder, given a verdict. */
export type AccessPlan = 'provisionable' | 'grant' | 'refuse'

/** Milliseconds one tool call may take before it is abandoned. */
const ICACLS_TIMEOUT_MS = 10_000

/**
 * A tool call is not started with less than this much budget left: below it the
 * call would be abandoned mid-flight, which reports a timeout instead of the
 * honest "the budget ran out".
 */
const MIN_SPAWN_BUDGET_MS = 500

/**
 * The ACE the plugin writes: a NON-inheritable full control allow for the
 * signed-in user, named by SID (`*S-1-5-…`) so no code page is involved.
 * Non-inheritable on purpose — DSH only ever provisions the workspace ROOT (the
 * date folder), and an inheritable ACE would additionally grant this account
 * full control over every descendant of the chat folder. (It does not avoid the
 * subtree walk: the folder already carries inheritable ACEs such as the
 * inherited `Authenticated Users:(I)(OI)(CI)(M)`, and the platform documents
 * that any `SetNamedSecurityInfoW` on such a directory walks its descendants.)
 * `icacls` merges this into the trustee's existing ACE, which is also what
 * repairs a deny the same account carries itself (verified on this host).
 */
const USER_FULL_CONTROL = (sid: string): string => `*${sid}:(F)`

/** Absolute path of one Windows system tool: PATH is not trusted for these. */
function systemTool(name: string): string {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
  return path.join(systemRoot, 'System32', name)
}

/** Run one tool with fixed arguments; returns its combined output plus exit status. */
function runTool(exe: string, args: string[], timeoutMs: number): { status: number | null; output: string; error?: string } {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: timeoutMs })
  if (result.error !== undefined && result.error !== null) {
    return { status: null, output: '', error: result.error.message }
  }
  const stdout = typeof result.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result.stderr === 'string' ? result.stderr : ''
  return { status: result.status, output: `${stdout}${stderr}` }
}

/** Last non-empty line of tool output, for a bounded diagnostic. */
function tail(output: string): string {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const last = lines.length > 0 ? lines[lines.length - 1] : ''
  return last.length > 200 ? `${last.slice(0, 200)}…` : last
}

// ---- SDDL reading (pure) ----

/**
 * The SDDL rights codes that carry each right. The two-letter rights field is a
 * concatenation of these codes, and only these spellings can carry
 * `WRITE_DAC`/`WRITE_OWNER`: `FA` (file all access), `GA` (generic all, which
 * the access check maps onto `FA` for files), and the specific `WD`/`WO`.
 */
const WRITE_DAC_CODES = new Set(['FA', 'GA', 'WD'])
const WRITE_OWNER_CODES = new Set(['FA', 'GA', 'WO'])

/**
 * The remaining documented file/directory rights codes, none of which can carry
 * `WRITE_DAC` or `WRITE_OWNER`. A code outside both sets makes the rights field
 * unreadable (`null`) rather than silently "not granting".
 */
const KNOWN_PLAIN_CODES = new Set([
  'CC', 'DC', 'LC', 'SW', 'RP', 'WP', 'DT', 'LO', 'CR', 'SD', 'RC', 'NR',
  'FR', 'FW', 'FX', 'GR', 'GW', 'GX', 'KR', 'KW', 'KX', 'NW', 'NX',
])

/**
 * The SDDL abbreviations that stand for a fixed SID. `icacls /save` writes
 * well-known trustees in this form (the real listings on this host carry `SY`,
 * `BA`, `BU` and `WD`), so a reader that compared the raw text against SIDs
 * would see a group deny — `D;;FA;;;BU` — as somebody else's ACE.
 *
 * Only spellings whose value is not in doubt are listed. `CO`, `CG`, `OW` and
 * the domain-relative abbreviations (`DA`, `DU`, …) are NOT: a placeholder or a
 * spelling this reader cannot pin down makes the ACE unresolved, which for a
 * deny is treated as blocking.
 */
const WELL_KNOWN_SIDS: Readonly<Record<string, string>> = {
  AC: 'S-1-15-2-1', // All Application Packages
  AN: 'S-1-5-7', // Anonymous Logon
  AO: 'S-1-5-32-548', // Account Operators
  AU: 'S-1-5-11', // Authenticated Users
  BA: 'S-1-5-32-544', // Builtin Administrators
  BG: 'S-1-5-32-546', // Builtin Guests
  BO: 'S-1-5-32-551', // Backup Operators
  BU: 'S-1-5-32-545', // Builtin Users
  CY: 'S-1-5-32-569', // Cryptographic Operators
  ER: 'S-1-5-32-573', // Event Log Readers
  HA: 'S-1-5-32-578', // Hyper-V Administrators
  IS: 'S-1-5-32-568', // IIS_IUSRS
  IU: 'S-1-5-4', // Interactive
  LS: 'S-1-5-19', // Local Service
  NO: 'S-1-5-32-556', // Network Configuration Operators
  NS: 'S-1-5-20', // Network Service
  NU: 'S-1-5-2', // Network
  PO: 'S-1-5-32-550', // Printer Operators
  PS: 'S-1-5-10', // Principal Self (an AD-object spelling: meaningless in a file ACL)
  PU: 'S-1-5-32-547', // Power Users
  RC: 'S-1-5-12', // Restricted Code
  RE: 'S-1-5-32-552', // Replicator
  RM: 'S-1-5-32-580', // Remote Management Users
  SO: 'S-1-5-32-549', // Server Operators
  SU: 'S-1-5-6', // Service
  SY: 'S-1-5-18', // Local System
  WD: 'S-1-1-0', // Everyone
  WR: 'S-1-5-33', // Write Restricted Code
}

/**
 * The SDDL ACE-flag codes that change whether an ACE applies to the object
 * itself. Flags are a run of two-letter codes, so they are read in pairs: a
 * substring test would read `CI` + `OI` as the inherit-only flag `IO`.
 */
const INHERIT_ONLY_FLAG = 'IO'
const INHERITED_FLAG = 'ID'

/** Split an ACE flag field into its two-letter codes. */
function aceFlags(flags: string): { inheritOnly: boolean; inherited: boolean } {
  let inheritOnly = false
  let inherited = false
  for (let i = 0; i + 1 < flags.length; i += 2) {
    const code = flags.slice(i, i + 2)
    if (code === INHERIT_ONLY_FLAG) inheritOnly = true
    else if (code === INHERITED_FLAG) inherited = true
  }
  return { inheritOnly, inherited }
}

/** SIDs never carry these: only `S-1-…` is a well-formed SID here. */
const SID_PATTERN = /^S-1-\d+(?:-\d+)+$/

/**
 * Expand one trustee field to a SID.
 * @param trustee - the ACE's trustee field, verbatim.
 * @returns the SID plus whether it could be pinned down.
 */
function resolveTrustee(trustee: string): { trustee: string; resolved: boolean } {
  if (SID_PATTERN.test(trustee)) return { trustee, resolved: true }
  const known = WELL_KNOWN_SIDS[trustee.toUpperCase()]
  return known === undefined ? { trustee, resolved: false } : { trustee: known, resolved: true }
}

/**
 * Read one SDDL rights field: either a `0x…` mask or a run of two-letter codes.
 * @param field - the ACE's rights field.
 * @returns which of the two rights it carries, or `null` when it cannot be read.
 */
function parseRightsField(field: string): DaclAce['rights'] {
  const text = field.trim()
  if (text === '') return { writeDac: false, writeOwner: false }
  if (/^0x[0-9a-f]+$/i.test(text)) {
    const mask = Number.parseInt(text.slice(2), 16)
    // GENERIC_ALL is mapped onto file all access by the access check, so it
    // carries both rights; the other generic bits do not.
    if ((mask & 0x1000_0000) !== 0) return { writeDac: true, writeOwner: true }
    return { writeDac: (mask & 0x0004_0000) !== 0, writeOwner: (mask & 0x0008_0000) !== 0 }
  }
  if (text.length % 2 !== 0) return null
  const rights = { writeDac: false, writeOwner: false }
  for (let i = 0; i < text.length; i += 2) {
    const code = text.slice(i, i + 2).toUpperCase()
    if (WRITE_DAC_CODES.has(code)) rights.writeDac = true
    if (WRITE_OWNER_CODES.has(code)) rights.writeOwner = true
    if (!WRITE_DAC_CODES.has(code) && !WRITE_OWNER_CODES.has(code) && !KNOWN_PLAIN_CODES.has(code)) return null
  }
  return rights
}

/** Split an SDDL ACE list into ACE bodies, keeping parenthesised conditions intact. */
function splitAces(text: string): string[] | undefined {
  const bodies: string[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(') {
      if (depth === 0) start = i + 1
      depth += 1
    } else if (ch === ')') {
      depth -= 1
      if (depth < 0) return undefined
      if (depth === 0 && start >= 0) {
        bodies.push(text.slice(start, i))
        start = -1
      }
    }
  }
  return depth === 0 ? bodies : undefined
}

/**
 * The DACL section of a saved security descriptor. `icacls /save` writes the
 * whole descriptor on one line, and the sections follow SDDL order — so a
 * folder whose SACL carries the sandbox's Low label reads
 * `D:AI(…)S:PAINO_ACCESS_CONTROL`. The DACL is what decides access here, and
 * auditing entries must not land in the unreadable-ACE count, so the section is
 * cut at the first top-level section marker.
 * @param body - the descriptor after its `D:`, i.e. the DACL section onward.
 * @returns the DACL section alone.
 */
function daclSection(body: string): string {
  let depth = 0
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === ':' && depth === 0 && (body[i - 1] === 'S' || body[i - 1] === 'O' || body[i - 1] === 'G')) {
      return body.slice(0, i - 1)
    }
  }
  return body
}

/**
 * The DACL control flags SDDL may put between `D:` and the first ACE. Only
 * these spell an empty DACL; anything else there (`NO_ACCESS`, the spelling for
 * a NULL DACL, or a shape this reader does not know) is refused below.
 */
const DACL_FLAG_LETTERS = /^[PAIR]*$/

/**
 * Parse one DACL line of an `icacls /save` file into ACEs.
 *
 * The ACE type decides how it is judged: `A` allows, `D` and the object/
 * conditional deny spellings (`OD`, `XD`) deny, anything else (audit entries,
 * conditional allows) is `other` — ignored for granting, and counted as
 * unreadable so a caller can say so.
 * @param sddl - the `D:…` line.
 * @returns the ACEs, or undefined when the text is not a readable DACL.
 */
export function parseDaclSddl(sddl: string): DaclAce[] | undefined {
  const text = sddl.trim()
  if (!text.startsWith('D:')) return undefined
  const body = daclSection(text.slice(2))
  const first = body.indexOf('(')
  if (first === -1) {
    // No ACEs at all. `D:` (with or without the inheritance flags) is an EMPTY
    // DACL — it grants nothing, so adding the account's ACE is the repair. Any
    // other spelling is refused: `D:NO_ACCESS` is a NULL DACL ("everyone full
    // control"), and rewriting that with a one-ACE DACL would narrow access
    // instead of widening it.
    return DACL_FLAG_LETTERS.test(body.trim().toUpperCase()) ? [] : undefined
  }
  const bodies = splitAces(body.slice(first))
  if (bodies === undefined) return undefined
  const aces: DaclAce[] = []
  for (const aceBody of bodies) {
    const fields = aceBody.split(';')
    if (fields.length < 6) return undefined
    const type = fields[0].toUpperCase()
    const flags = aceFlags(fields[1].toUpperCase())
    if (fields[5] === '') return undefined
    const trustee = resolveTrustee(fields[5])
    aces.push({
      kind: type === 'A' ? 'allow' : type === 'D' || type.endsWith('D') ? 'deny' : 'other',
      inheritOnly: flags.inheritOnly,
      inherited: flags.inherited,
      trustee: trustee.trustee,
      resolved: trustee.resolved,
      rights: parseRightsField(fields[2]),
    })
  }
  return aces
}

/** Parse the signed-in account's own SID out of `whoami /user /fo csv /nh`. */
export function parseOwnSid(whoamiUserOutput: string): string | undefined {
  return /S-1-\d+(?:-\d+)+/.exec(whoamiUserOutput)?.[0]
}

/** Parse every SID out of `whoami /groups /fo csv /nh` (locale-independent: the SID column is ASCII). */
export function parseTokenSids(whoamiGroupsOutput: string): string[] {
  const sids = new Set<string>()
  for (const match of whoamiGroupsOutput.matchAll(/S-1-\d+(?:-\d+)+/g)) sids.add(match[0])
  return [...sids]
}

/**
 * Whether a `whoami /groups` listing can stand in for the token's group set.
 *
 * It cannot when it names no group: the account would be left with its own SID
 * alone, and a deny naming any group it belongs to (`D;;FA;;;BU`) would read as
 * somebody else's ACE — the one false green this module exists to prevent. The
 * mandatory integrity label (`S-1-16-…`) is not a group, so a listing carrying
 * nothing else does not count either. Callers treat `false` exactly like a
 * failed `whoami`.
 * @param groupSids - the SIDs the listing carried.
 * @returns true when at least one real group SID is present.
 */
export function hasTokenGroups(groupSids: readonly string[]): boolean {
  return groupSids.some((sid) => !sid.startsWith('S-1-16-'))
}

/** A DACL line: `D:`, the inheritance flags SDDL may put there, then the ACEs. */
const SDDL_LINE = /^D:[PAIR]*(?:\(|$)/

/**
 * The DACL line of an `icacls /save` file. The file holds `<path>` then the
 * SDDL for every saved object, so the last non-empty line is the SDDL; a path
 * line can itself start with a drive letter (`D:\…`), which is why the line is
 * taken by position and then matched against {@link SDDL_LINE} instead of being
 * searched for.
 * @param saveFileText - the save file, decoded as UTF-16LE.
 * @returns the `D:…` line, or undefined when the file carries none.
 */
export function pickSddlLine(saveFileText: string): string | undefined {
  const lines = saveFileText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const last = lines[lines.length - 1]
  return last !== undefined && SDDL_LINE.test(last) ? last : undefined
}

/**
 * Decide what one DACL says about the account, in ACE order.
 *
 * Windows grants a right from the FIRST ACE that applies to the caller's token
 * and carries it, so a deny only blocks when it comes before any allow that
 * would cover the same right. Applicability differs by ACE type on purpose: a
 * DENY counts when its trustee is any SID in the token (a group deny is real)
 * — and, when the trustee could not be expanded to a SID at all, when it MIGHT
 * be — while only the account's OWN SID may prove an ALLOW (a group allow can
 * belong to a deny-only SID in a filtered token).
 * @param aces - the parsed DACL.
 * @param userSid - the signed-in account's own SID.
 * @param tokenSids - every SID in the token (`whoami /groups`, own SID included).
 * @returns the per-right outcome, the first blocker, and the unreadable-ACE count.
 */
export function evaluateDacl(
  aces: readonly DaclAce[],
  userSid: string,
  tokenSids: ReadonlySet<string> | readonly string[],
): AccessVerdict {
  const token = tokenSids instanceof Set ? tokenSids : new Set(tokenSids)
  const rights: AccessVerdict['rights'] = { writeDac: 'undecided', writeOwner: 'undecided' }
  let blocked: AccessVerdict['blocked']
  let unreadable = 0
  for (const ace of aces) {
    if (ace.kind === 'other') {
      unreadable += 1
      continue
    }
    if (ace.inheritOnly) continue
    if (ace.rights === null || !ace.resolved) unreadable += 1
    const applies = ace.kind === 'deny'
      // An unexpanded trustee is not known to be somebody else, so its deny may
      // well name this account or one of its groups.
      ? !ace.resolved || token.has(ace.trustee)
      : ace.resolved && ace.trustee === userSid
    if (!applies) continue
    for (const right of ['writeDac', 'writeOwner'] as const) {
      if (rights[right] !== 'undecided') continue
      // An unreadable rights field is read pessimistically in both directions:
      // a deny is assumed to carry the right, an allow is assumed not to.
      const carried = ace.rights === null ? ace.kind === 'deny' : ace.rights[right]
      if (!carried) continue
      if (ace.kind === 'deny') {
        rights[right] = 'denied'
        // A new explicit allow ACE outranks inherited ACEs, and `icacls /grant`
        // merges into the trustee's own ACE — so a deny carried by the account
        // itself, or inherited from an ancestor, is one a grant can settle. A
        // deny for an unexpanded trustee is neither.
        blocked ??= { sid: ace.trustee, overridable: ace.inherited || (ace.resolved && ace.trustee === userSid) }
      } else {
        rights[right] = 'granted'
      }
    }
    if (rights.writeDac !== 'undecided' && rights.writeOwner !== 'undecided') break
  }
  return {
    provisionable: rights.writeDac === 'granted' && rights.writeOwner === 'granted',
    rights,
    ...(blocked === undefined ? {} : { blocked }),
    unreadable,
  }
}

/**
 * What to do about a folder.
 *
 * A deny the account cannot outrank — an explicit ACE naming a group or another
 * SID — is refused instead of written around: the write could not lift it, and
 * retrying it on every Host start would rewrite the DACL for nothing.
 * @param verdict - the evaluation of the folder's current DACL.
 * @returns `provisionable` (nothing to do), `refuse`, or `grant`.
 */
export function planFolderAccess(verdict: AccessVerdict): AccessPlan {
  if (verdict.provisionable) return 'provisionable'
  if (verdict.blocked !== undefined && !verdict.blocked.overridable) return 'refuse'
  return 'grant'
}

/** One-line description of a verdict, for a failure detail. */
function describeVerdict(verdict: AccessVerdict): string {
  const parts = [
    `write-DAC ${verdict.rights.writeDac}`,
    `write-owner ${verdict.rights.writeOwner}`,
  ]
  if (verdict.blocked !== undefined) parts.push(`deny for ${verdict.blocked.sid}`)
  if (verdict.unreadable > 0) parts.push(`${verdict.unreadable} unreadable ACE(s)`)
  return parts.join(', ')
}

// ---- tool-facing shell (I/O) ----

/** The signed-in account's own SID plus every SID in its token. */
interface Identity {
  userSid: string
  tokenSids: ReadonlySet<string>
}

/** Resolved once per process: the token does not change while the Host runs. */
let cachedIdentity: Identity | null = null

/**
 * Set when the identity could not be resolved at all. `whoami` is a local
 * System32 tool, so a failure is an environment condition (missing tool, a
 * wedged host), not a per-folder one — and re-probing it for every date folder
 * would spend the caller's budget on the same answer.
 */
let identityUnavailable = false

/** The one detail both paths report when the identity cannot be named. */
const IDENTITY_UNAVAILABLE = 'the signed-in Windows account could not be resolved (whoami /user, whoami /groups)'

/**
 * Resolve the account's own SID and its token's SIDs.
 *
 * Both parts are required: without the group list a deny that names a group the
 * account belongs to would be invisible, which is exactly the false green this
 * check exists to prevent. Each lookup asks the caller's deadline for its own
 * budget, so neither can start after the budget is gone.
 * @param deadline - the caller's wall-clock budget, when it has one.
 * @returns the identity, or the reason it could not be resolved.
 */
function resolveIdentity(deadline: number | undefined): { identity: Identity } | { detail: string } {
  if (cachedIdentity !== null) return { identity: cachedIdentity }
  if (identityUnavailable) return { detail: IDENTITY_UNAVAILABLE }
  const whoami = systemTool('whoami.exe')
  const ownBudget = budgetFor(deadline)
  if ('detail' in ownBudget) return { detail: ownBudget.detail }
  const own = runTool(whoami, ['/user', '/fo', 'csv', '/nh'], ownBudget.budget)
  // `whoami` is a local System32 tool: a failure is an environment condition
  // (missing tool, a wedged host), not a per-folder one, so it is remembered
  // instead of re-probed for every remaining date folder.
  if (own.error !== undefined) {
    identityUnavailable = true
    return { detail: IDENTITY_UNAVAILABLE }
  }
  const userSid = parseOwnSid(own.output)
  if (userSid === undefined) {
    identityUnavailable = true
    return { detail: IDENTITY_UNAVAILABLE }
  }
  const groupBudget = budgetFor(deadline)
  if ('detail' in groupBudget) return { detail: groupBudget.detail }
  const groups = runTool(whoami, ['/groups', '/fo', 'csv', '/nh'], groupBudget.budget)
  if (groups.error !== undefined) {
    identityUnavailable = true
    return { detail: IDENTITY_UNAVAILABLE }
  }
  const groupSids = parseTokenSids(groups.output)
  // A listing that names no group cannot stand in for the token's group set (see
  // {@link hasTokenGroups}). That is the one false green this module exists to
  // prevent, so it fails closed like a failed `whoami` instead.
  if (!hasTokenGroups(groupSids)) {
    identityUnavailable = true
    return { detail: IDENTITY_UNAVAILABLE }
  }
  const tokenSids = new Set(groupSids)
  tokenSids.add(userSid)
  cachedIdentity = { userSid, tokenSids }
  return { identity: cachedIdentity }
}

/**
 * Read one folder's DACL as SDDL, through a one-shot `icacls /save` file.
 * @param dir - the folder to read.
 * @param budget - milliseconds available for the call.
 * @returns the SDDL line, or the reason it could not be read.
 */
function readDacl(dir: string, budget: number): { sddl: string } | { error: string } {
  let tempDir: string | undefined
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-chat-manager-acl-'))
    const saveFile = path.join(tempDir, 'dacl.txt')
    const result = runTool(systemTool('icacls.exe'), [dir, '/save', saveFile], budget)
    if (result.error !== undefined) return { error: `icacls /save failed to start: ${result.error}` }
    if (result.status !== 0) return { error: `icacls /save exited ${String(result.status)}: ${tail(result.output)}` }
    if (!fs.existsSync(saveFile)) return { error: `icacls /save wrote no file: ${tail(result.output)}` }
    const line = pickSddlLine(fs.readFileSync(saveFile, 'utf16le'))
    if (line === undefined) return { error: `icacls /save wrote no DACL line: ${tail(result.output)}` }
    return { sddl: line }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (tempDir !== undefined) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // Leftover temp litter is not a check result; the read already answered.
      }
    }
  }
}

/** Milliseconds available for the next tool call, or the reason there is none. */
function budgetFor(deadline: number | undefined): { budget: number } | { detail: string } {
  if (deadline === undefined) return { budget: ICACLS_TIMEOUT_MS }
  const remaining = deadline - Date.now()
  if (remaining < MIN_SPAWN_BUDGET_MS) {
    return {
      detail: `the folder-access budget ran out before the check finished (${Math.max(0, Math.round(remaining))} ms left)`,
    }
  }
  return { budget: Math.min(ICACLS_TIMEOUT_MS, remaining) }
}

/**
 * Make one chat folder provisionable by DSH's Windows sandbox: ensure the
 * signed-in user holds effective full control there, which is what conveys the
 * `WRITE_DAC` + `WRITE_OWNER` the sandbox's grant needs.
 *
 * Read first, write only when the account lacks full control: a folder whose
 * creator already has it — through the volume's `CREATOR OWNER`-style
 * inheritance or an earlier repair — is therefore never re-ACLed, so a Host
 * start costs one read-only `icacls /save` per date folder. Tools are spawned
 * synchronously, each capped at {@link ICACLS_TIMEOUT_MS} and by the caller's
 * `deadline`; the path is only ever reached for chat folders, and a failure is
 * reported, never thrown.
 * @param dir - the chat folder (usually a date folder, i.e. a session's workspace root).
 * @param options - the caller's wall-clock budget, when it has one.
 * @returns what the check found and, when it had to write, whether the write was confirmed.
 */
export function ensureWindowsFolderAccess(dir: string, options?: FolderAccessOptions): FolderAccess {
  if (process.platform !== 'win32') return { ok: true, changed: false, skipped: true }
  const deadline = options?.deadline
  const fail = (detail: string): FolderAccess => ({ ok: false, changed: false, skipped: false, detail })
  try {
    if (!fs.existsSync(dir)) return fail(`chat folder is missing: ${dir}`)
    const resolved = resolveIdentity(deadline)
    if ('detail' in resolved) return fail(resolved.detail)
    const identity = resolved.identity
    const budget = budgetFor(deadline)
    if ('detail' in budget) return fail(budget.detail)
    const before = readDacl(dir, budget.budget)
    if ('error' in before) return fail(`the folder's ACL could not be read: ${before.error}`)
    const aces = parseDaclSddl(before.sddl)
    if (aces === undefined) {
      // Fail closed: an unreadable DACL spelling (a NULL DACL, or a shape this
      // reader does not know) must not be rewritten on a guess.
      return fail(`the folder's DACL is not a readable SDDL DACL: ${before.sddl.slice(0, 200)}`)
    }
    const verdict = evaluateDacl(aces, identity.userSid, identity.tokenSids)
    const plan = planFolderAccess(verdict)
    if (plan === 'provisionable') return { ok: true, changed: false, skipped: false }
    if (plan === 'refuse') {
      const blocked = verdict.blocked
      return fail(
        `a deny ACE for ${blocked?.sid ?? 'another principal'} blocks full control for ${identity.userSid}`
        + ` and a grant cannot outrank it (${describeVerdict(verdict)});`
        + ' fix the folder permissions for that principal, or move the chat root',
      )
    }
    const grantBudget = budgetFor(deadline)
    if ('detail' in grantBudget) return fail(grantBudget.detail)
    const granted = runTool(systemTool('icacls.exe'), [dir, '/grant', USER_FULL_CONTROL(identity.userSid)], grantBudget.budget)
    if (granted.error !== undefined) return fail(`icacls /grant failed to start: ${granted.error}`)
    if (granted.status !== 0) {
      return fail(`icacls /grant exited ${String(granted.status)}: ${tail(granted.output)}`)
    }
    const rereadBudget = budgetFor(deadline)
    if ('detail' in rereadBudget) {
      return {
        ok: false,
        changed: true,
        skipped: false,
        detail: `full control for ${identity.userSid} was granted, but the read-back did not run: ${rereadBudget.detail}`,
      }
    }
    const after = readDacl(dir, rereadBudget.budget)
    if ('error' in after) {
      return {
        ok: false,
        changed: true,
        skipped: false,
        detail: `full control for ${identity.userSid} was granted, but the read-back failed: ${after.error}`,
      }
    }
    const afterAces = parseDaclSddl(after.sddl)
    if (afterAces === undefined) {
      return {
        ok: false,
        changed: true,
        skipped: false,
        detail: `full control for ${identity.userSid} was granted, but the read-back is not a readable DACL: ${after.sddl.slice(0, 200)}`,
      }
    }
    const afterVerdict = evaluateDacl(afterAces, identity.userSid, identity.tokenSids)
    if (afterVerdict.provisionable) return { ok: true, changed: true, skipped: false }
    // icacls reported success, yet the account still does not hold both rights.
    // Fail closed: callers act on `ok`.
    return {
      ok: false,
      changed: true,
      skipped: false,
      detail: `icacls /grant exited 0 but ${identity.userSid} still does not hold full control`
        + ` (${describeVerdict(afterVerdict)})`,
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}
