/**
 * Decision tables for the Windows folder-access reader.
 *
 * Every SDDL fixture below is transcribed from `icacls <dir> /save` output on
 * a zh-CN Windows whose code page is 936, so the shapes are the ones the reader
 * really meets; the account SIDs are synthetic stand-ins of the same shape (a
 * machine identifier does not belong in the published tree):
 *
 *   - an explicit allow the plugin wrote:      `A;;FA;;;S-…`
 *   - an inherited allow:                      `A;OICIID;FA;;;S-…`
 *   - the E:\ pathology, "Modify" only:        `A;OICIID;0x1301bf;;;S-…`   (the
 *     mask icacls calls MODIFY: it carries neither WRITE_DAC nor WRITE_OWNER,
 *     which is why such a folder cannot be provisioned)
 *   - an explicit deny of everything:          `D;;FA;;;S-…`   (icacls renders
 *     that same ACE as `(N)` in its plain listing, which is why a reader that
 *     looks for `(DENY)` never sees it)
 *   - a deny by specific right:                `D;;WD;;;S-…`   (WD = WRITE_DAC)
 *   - a group deny:                            `D;;FA;;;BU`
 *   - a world deny:                            `D;;FA;;;WD`    (WD = Everyone,
 *     in the trustee field — the same two letters as WRITE_DAC in the rights
 *     field, which is why the reader is positional)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateDacl, hasTokenGroups, parseDaclSddl, parseOwnSid, parseTokenSids, pickSddlLine, planFolderAccess,
} from '../lib/index.js'

const USER_SID = 'S-1-5-21-1000000000-2000000000-3000000000-1001'
const OTHER_SID = 'S-1-5-21-1000000000-2000000000-3000000000-1003'
const SANDBOX_SID = 'S-1-5-21-4000000000-4000000000-4000000000-3004018697'
const USERS_SID = 'S-1-5-32-545'
const ADMINS_SID = 'S-1-5-32-544'
const EVERYONE_SID = 'S-1-1-0'

/** The token of an ordinary account: itself, its groups, and the well-knowns. */
const TOKEN = [USER_SID, USERS_SID, ADMINS_SID, EVERYONE_SID, 'S-1-5-11', 'S-1-5-4']

/** The inherited "Modify" ACE a folder gets on a volume whose root has no CREATOR OWNER. */
const INHERITED_MODIFY = `A;OICIID;0x1301bf;;;${USER_SID}`

/** The inherited "Authenticated Users: Modify" the same volume hands down. */
const INHERITED_AUTHENTICATED_MODIFY = 'A;OICIID;0x1301bf;;;S-1-5-11'

/** The inherited full control a normal volume provides (CREATOR OWNER-style). */
const INHERITED_FULL = `A;OICIID;FA;;;${USER_SID}`

/** What the plugin's own grant adds: an explicit, non-inheritable full control ACE. */
const EXPLICIT_FULL = `A;;FA;;;${USER_SID}`

const sddl = (...aces) => `D:AI${aces.map((ace) => `(${ace})`).join('')}`

/** Evaluate a DACL and its plan in one call. */
function decide(aces, userSid = USER_SID, token = TOKEN) {
  const parsed = parseDaclSddl(sddl(...aces))
  assert.ok(parsed !== undefined, 'fixture must parse')
  return planFolderAccess(evaluateDacl(parsed, userSid, token))
}

test('whoami output yields SIDs, whatever the code page did to the names', () => {
  // Real `/user /fo csv /nh`: the account name is lower-cased and may be non-ASCII.
  assert.equal(
    parseOwnSid('"desktop-abcd123\\user","S-1-5-21-1000000000-2000000000-3000000000-1001"\r\n'),
    USER_SID,
  )
  // `/groups /fo csv /nh` carries the SIDs as ASCII and the type text in the
  // console code page; a non-ASCII name decodes to U+FFFD here, which must not
  // disturb the SID column (`NT AUTHORITY\本地帐户` and its mojibake twin).
  const groups = [
    '"Mandatory Label\\Medium Mandatory Level","Label","S-1-16-8192",""',
    '"Everyone","Well-known group","S-1-1-0","Mandatory group, Enabled by default, Enabled group"',
    '"NT AUTHORITY\\\u672c\u5730\u8d26\u6237","Well-known group","S-1-5-113","Mandatory group"',
    '"NT AUTHORITY\\\ufffd\ufffd\ufffd\ufffd","Well-known group","S-1-5-114","Group used for deny only"',
    '"BUILTIN\\Administrators","Alias","S-1-5-32-544","Group used for deny only"',
    '',
  ].join('\r\n')
  assert.deepEqual(parseTokenSids(groups), ['S-1-16-8192', 'S-1-1-0', 'S-1-5-113', 'S-1-5-114', 'S-1-5-32-544'])
  // A name containing a comma inside the quoted field (a Microsoft account) or a
  // localized attribute list must not shift the SID column either: the SIDs are
  // scraped, not the columns.
  assert.deepEqual(
    parseTokenSids('"MicrosoftAccount\\a@b.com","User","S-1-11-96-1-2-3","Mandatory group, Enabled by default"'),
    ['S-1-11-96-1-2-3'],
  )
  assert.equal(parseOwnSid('whoami: no output'), undefined)
  assert.deepEqual(parseTokenSids(''), [])
})

test('a group listing with no groups in it cannot stand in for the token', () => {
  // The false green this guards: with only its own SID in the token, a deny that
  // names a group the account belongs to (`D;;FA;;;BU`) reads as somebody
  // else's ACE, so the folder would be called provisionable. A listing that
  // looks like this — or that carries nothing but the integrity label, which is
  // not a group — must be treated like a failed `whoami`.
  assert.equal(hasTokenGroups([]), false)
  assert.equal(hasTokenGroups(['S-1-16-8192']), false)
  assert.equal(hasTokenGroups(['S-1-16-8192', 'S-1-1-0']), true)
  // Real listings pass, mojibake names or not.
  assert.equal(hasTokenGroups(parseTokenSids(
    '"Everyone","Well-known group","S-1-1-0","Mandatory group, Enabled by default, Enabled group"\r\n'
    + '"NT AUTHORITY\\\ufffd\ufffd","Well-known group","S-1-5-113","Mandatory group"',
  )), true)
})

test('the SDDL line is taken by position, so a path starting with a drive letter cannot be mistaken for it', () => {
  // `icacls /save` writes `<path>\r\n<SDDL>\r\n` per saved object; without /T
  // there is exactly one object, and its path line can itself start with `D:`.
  const saved = [
    'D:\\Documents\\DSH\\2026-10-07',
    `D:AI(${EXPLICIT_FULL})(${INHERITED_FULL})`,
    '',
  ].join('\r\n')
  assert.equal(pickSddlLine(saved), `D:AI(${EXPLICIT_FULL})(${INHERITED_FULL})`)
  // A UTF-16LE BOM survives the decode as U+FEFF, which trim removes.
  assert.equal(pickSddlLine(`\ufeff${saved}`), `D:AI(${EXPLICIT_FULL})(${INHERITED_FULL})`)
  assert.equal(pickSddlLine('dsh-acl-probe\r\nD:AI\r\n'), 'D:AI')
  assert.equal(pickSddlLine('D:\\only\\a\\path\r\n'), undefined)
  assert.equal(pickSddlLine(''), undefined)
})

test('ACE flags decide applicability, and the rights field is read positionally', () => {
  const aces = parseDaclSddl(`D:AI(${EXPLICIT_FULL})(A;OICIIO;FA;;;${USER_SID})(D;;WD;;;${USER_SID})(D;;FA;;;WD)`)
  assert.deepEqual(aces, [
    { kind: 'allow', inheritOnly: false, inherited: false, trustee: USER_SID, resolved: true, rights: { writeDac: true, writeOwner: true } },
    { kind: 'allow', inheritOnly: true, inherited: false, trustee: USER_SID, resolved: true, rights: { writeDac: true, writeOwner: true } },
    { kind: 'deny', inheritOnly: false, inherited: false, trustee: USER_SID, resolved: true, rights: { writeDac: true, writeOwner: false } },
    // `WD` in the trustee field is Everyone, `WD` in the rights field is
    // WRITE_DAC: the last ACE denies everyone everything.
    { kind: 'deny', inheritOnly: false, inherited: false, trustee: EVERYONE_SID, resolved: true, rights: { writeDac: true, writeOwner: true } },
  ])
  // Rights spellings: hex masks, the specific-rights spelling of full control,
  // the plain codes, and the codes that cannot carry either right.
  assert.deepEqual(parseDaclSddl('D:(A;;0x1f01ff;;;SY)')[0].rights, { writeDac: true, writeOwner: true })
  assert.deepEqual(parseDaclSddl('D:(A;;0x1301bf;;;SY)')[0].rights, { writeDac: false, writeOwner: false })
  assert.deepEqual(parseDaclSddl('D:(A;;0x40000;;;SY)')[0].rights, { writeDac: true, writeOwner: false })
  assert.deepEqual(parseDaclSddl('D:(A;;0x80000;;;SY)')[0].rights, { writeDac: false, writeOwner: true })
  // The specific-rights spelling of FILE_ALL_ACCESS.
  assert.deepEqual(
    parseDaclSddl('D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)')[0].rights,
    { writeDac: true, writeOwner: true },
  )
  assert.deepEqual(parseDaclSddl('D:(A;;FR;;;SY)')[0].rights, { writeDac: false, writeOwner: false })
  // Unreadable: an unknown code, an odd-length field, or a conditional ACE.
  assert.equal(parseDaclSddl('D:(D;;ZZ;;;BU)')[0].rights, null)
  assert.equal(parseDaclSddl('D:(D;;W;;;BU)')[0].rights, null)
  // An ACE with an empty rights field (a legal placeholder) carries neither.
  assert.deepEqual(parseDaclSddl('D:(A;;;;;SY)')[0].rights, { writeDac: false, writeOwner: false })
  // A four-field ACE is not a well-formed SDDL ACE at all: refuse the DACL.
  assert.equal(parseDaclSddl('D:(A;;;SY)'), undefined)
  // Flags are a run of two-letter codes, so `CI` + `OI` is NOT the inherit-only
  // flag `IO` (a substring test would read it as one and skip a real ACE).
  const pairFlags = parseDaclSddl(`D:(A;CIOI;FA;;;${USER_SID})`)[0]
  assert.equal(pairFlags.inheritOnly, false)
  assert.equal(pairFlags.inherited, false)
  // Rights masks: GENERIC_ALL is mapped onto file all access by the access check
  // and therefore carries both rights; GENERIC_WRITE carries neither.
  assert.deepEqual(parseDaclSddl('D:(D;;0x10000000;;;BU)')[0].rights, { writeDac: true, writeOwner: true })
  assert.deepEqual(parseDaclSddl('D:(A;;0x40000000;;;SY)')[0].rights, { writeDac: false, writeOwner: false })
  const callback = parseDaclSddl('D:(XA;;FA;;;SY;(@User.title=="x"))')[0]
  assert.equal(callback.kind, 'other')
  assert.equal(callback.trustee, 'S-1-5-18')
  assert.equal(parseDaclSddl('D:(XD;;FA;;;SY;(@User.title=="x"))')[0].kind, 'deny')
  assert.equal(parseDaclSddl('D:(AU;SA;FA;;;SY)')[0].kind, 'other')
})

test('a DACL this reader cannot read is refused, never guessed at', () => {
  assert.equal(parseDaclSddl('sddl-not-a-dacl'), undefined)
  // A NULL DACL ("everyone full control"): rewriting it with a one-ACE DACL
  // would narrow access, so it is unreadable on purpose.
  assert.equal(parseDaclSddl('D:NO_ACCESS'), undefined)
  assert.equal(parseDaclSddl('D:AI(A;;FA;;;SY'), undefined)
  assert.equal(parseDaclSddl('D:AI(A;;FA;;;SY))'), undefined)
  assert.deepEqual(parseDaclSddl('D:'), [])
  assert.deepEqual(parseDaclSddl('D:AI'), [])
})

test('inherited full control for the account needs no write', () => {
  assert.equal(decide([INHERITED_FULL, 'A;OICIID;FA;;;SY', 'A;OICIID;FA;;;BA']), 'provisionable')
  assert.equal(decide([EXPLICIT_FULL, INHERITED_MODIFY]), 'provisionable')
})

test('the Modify-only folder is repaired: neither right is carried', () => {
  assert.equal(decide([INHERITED_AUTHENTICATED_MODIFY, INHERITED_MODIFY]), 'grant')
  const verdict = evaluateDacl(parseDaclSddl(sddl(INHERITED_MODIFY)), USER_SID, TOKEN)
  assert.deepEqual(verdict.rights, { writeDac: 'undecided', writeOwner: 'undecided' })
  assert.equal(verdict.blocked, undefined)
  assert.equal(verdict.unreadable, 0)
})

test('a deny the account carries itself is never read as provisionable', () => {
  // The shape that made the old text reader return "full control" and report
  // `ok: true, changed: false` while DSH's own grant failed with Win32 5: the
  // account is denied everything explicitly, and only the inherited ACE allows.
  // (icacls renders that deny as `CHEN:(N)`; nothing in its output says DENY.)
  const aces = parseDaclSddl(sddl(`D;;FA;;;${USER_SID}`, INHERITED_FULL))
  const verdict = evaluateDacl(aces, USER_SID, TOKEN)
  assert.deepEqual(verdict.rights, { writeDac: 'denied', writeOwner: 'denied' })
  assert.deepEqual(verdict.blocked, { sid: USER_SID, overridable: true })
  assert.equal(verdict.provisionable, false)
  // Overridable: `icacls /grant` merges into this trustee's own ACE, so the
  // check repairs the folder instead of declaring it unfixable.
  assert.equal(planFolderAccess(verdict), 'grant')
})

test('a deny by specific right blocks only that right', () => {
  const verdict = evaluateDacl(parseDaclSddl(sddl(`D;;WD;;;${USER_SID}`, INHERITED_FULL)), USER_SID, TOKEN)
  assert.deepEqual(verdict.rights, { writeDac: 'denied', writeOwner: 'granted' })
  assert.equal(planFolderAccess(verdict), 'grant')
})

test('a deny for a group the account is in is a real block, and is refused rather than written around', () => {
  // `D;;FA;;;BU` is `BUILTIN\Users`; every account in it is denied everything,
  // and granting full control to the account itself cannot outrank an explicit
  // deny for a DIFFERENT trustee.
  const group = parseDaclSddl(sddl(`D;;FA;;;${USERS_SID}`, EXPLICIT_FULL, INHERITED_FULL))
  const groupVerdict = evaluateDacl(group, USER_SID, TOKEN)
  assert.deepEqual(groupVerdict.blocked, { sid: USERS_SID, overridable: false })
  assert.equal(planFolderAccess(groupVerdict), 'refuse')
  // The deny the sandbox itself writes for the world (`D;;FA;;;WD` = Everyone)
  // is the same story.
  const world = evaluateDacl(parseDaclSddl(sddl(`D;;FA;;;${EVERYONE_SID}`, EXPLICIT_FULL)), USER_SID, TOKEN)
  assert.deepEqual(world.blocked, { sid: EVERYONE_SID, overridable: false })
  assert.equal(planFolderAccess(world), 'refuse')
  // A group the account is NOT in changes nothing.
  assert.equal(decide(['D;;FA;;;S-1-5-32-555', EXPLICIT_FULL]), 'provisionable')
})

test('ACE order decides, the way Windows decides it', () => {
  // An explicit allow for the account outranks a deny inherited from an
  // ancestor, so this folder IS provisionable.
  assert.equal(decide([EXPLICIT_FULL, `D;ID;FA;;;${USERS_SID}`]), 'provisionable')
  // The same deny one position earlier blocks.
  assert.equal(decide([`D;;FA;;;${USERS_SID}`, EXPLICIT_FULL]), 'refuse')
  // An inherit-only deny does not apply to the folder itself.
  assert.equal(decide([`D;IO;FA;;;${USER_SID}`, INHERITED_FULL]), 'provisionable')
  // Neither does an inherit-only allow count as one.
  assert.equal(decide([`A;OICIIO;FA;;;${USER_SID}`, INHERITED_MODIFY]), 'grant')
})

test('only the account itself can prove provisionability', () => {
  // An administrator running with a filtered token belongs to
  // BUILTIN\Administrators for deny only, so a group allow is not proof: the
  // check still writes its own ACE (and the write confirms it). The old reader
  // could not see groups at all.
  assert.equal(decide([`A;OICIID;FA;;;${ADMINS_SID}`, INHERITED_AUTHENTICATED_MODIFY]), 'grant')
  const verdict = evaluateDacl(parseDaclSddl(sddl(`A;OICIID;FA;;;${ADMINS_SID}`)), USER_SID, TOKEN)
  assert.deepEqual(verdict.rights, { writeDac: 'undecided', writeOwner: 'undecided' })
})

test('unreadable ACEs are counted, and never turn into a false green', () => {
  // An unreadable DENY is assumed to carry the right (fail closed).
  const deny = evaluateDacl(parseDaclSddl(sddl('D;;ZZ;;;BU', EXPLICIT_FULL)), USER_SID, TOKEN)
  assert.equal(deny.unreadable, 1)
  assert.deepEqual(deny.blocked, { sid: USERS_SID, overridable: false })
  assert.equal(planFolderAccess(deny), 'refuse')
  // An unreadable ALLOW grants nothing, so the readable inherited ACE decides.
  const allow = evaluateDacl(parseDaclSddl(sddl('A;;ZZ;;;SY', INHERITED_FULL)), USER_SID, TOKEN)
  assert.equal(allow.unreadable, 1)
  assert.equal(planFolderAccess(allow), 'provisionable')
  // Audit and conditional-allow entries do not decide anything by themselves.
  assert.equal(decide(['AU;SA;FA;;;SY', 'XA;;FA;;;SY']), 'grant')
  assert.equal(evaluateDacl(parseDaclSddl(sddl('AU;SA;FA;;;SY')), USER_SID, TOKEN).unreadable, 1)
})

test('a trustee standing for the owner is never written off as somebody else', () => {
  // `OW` (OWNER RIGHTS) applies to the object's OWNER — normally this account —
  // so it is deliberately left unexpanded: its deny blocks (fail closed) and its
  // allow proves nothing. `CO`/`CG` are the same story.
  const ow = parseDaclSddl(sddl('D;;FA;;;OW'))[0]
  assert.equal(ow.trustee, 'OW')
  assert.equal(ow.resolved, false)
  const deny = evaluateDacl(parseDaclSddl(sddl('D;;FA;;;OW', INHERITED_FULL)), USER_SID, TOKEN)
  assert.deepEqual(deny.blocked, { sid: 'OW', overridable: false })
  assert.equal(deny.unreadable, 1)
  assert.equal(planFolderAccess(deny), 'refuse')
  // A generic-all deny is read as carrying both rights, not as carrying none.
  const generic = evaluateDacl(parseDaclSddl(sddl('D;;0x10000000;;;BU', EXPLICIT_FULL)), USER_SID, TOKEN)
  assert.deepEqual(generic.blocked, { sid: USERS_SID, overridable: false })
  assert.equal(planFolderAccess(generic), 'refuse')
  // An unexpanded ALLOW is not a grant either: the readable inherited ACE decides.
  assert.equal(decide(['A;;FA;;;OW', INHERITED_FULL]), 'provisionable')
  assert.equal(decide(['A;;FA;;;OW', INHERITED_MODIFY]), 'grant')
})

test('an empty DACL is repaired; a NULL DACL is refused', () => {
  assert.deepEqual(parseDaclSddl('D:'), [])
  assert.deepEqual(parseDaclSddl('D:AI'), [])
  assert.deepEqual(parseDaclSddl('D:PAI'), [])
  assert.equal(planFolderAccess(evaluateDacl([], USER_SID, TOKEN)), 'grant')
})

test('SDDL trustee abbreviations are expanded, so a group deny in short form is seen', () => {
  // `icacls /save` writes well-known trustees abbreviated: these are the exact
  // spellings the real listings on this host carried.
  assert.deepEqual(
    parseDaclSddl('D:(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(D;;FA;;;BU)(D;;DC;;;WD)')
      .map((ace) => [ace.trustee, ace.resolved]),
    [['S-1-5-18', true], ['S-1-5-32-544', true], [USERS_SID, true], [EVERYONE_SID, true]],
  )
  // The short form of a group deny blocks exactly like the long form.
  const short = evaluateDacl(parseDaclSddl(sddl('D;;FA;;;BU', EXPLICIT_FULL)), USER_SID, TOKEN)
  const long = evaluateDacl(parseDaclSddl(sddl(`D;;FA;;;${USERS_SID}`, EXPLICIT_FULL)), USER_SID, TOKEN)
  assert.deepEqual(short.blocked, long.blocked)
  assert.equal(planFolderAccess(short), 'refuse')
  // A trustee this reader cannot pin down (a placeholder such as `CO`, or a
  // domain-relative spelling) stays unresolved: its deny counts as blocking
  // rather than as somebody else's ACE, and its allow proves nothing.
  assert.deepEqual(
    parseDaclSddl('D:(D;;FA;;;CO)(A;;FA;;;DA)').map((ace) => [ace.trustee, ace.resolved]),
    [['CO', false], ['DA', false]],
  )
  const placeholder = evaluateDacl(parseDaclSddl(sddl('D;;FA;;;CO', EXPLICIT_FULL)), USER_SID, TOKEN)
  assert.deepEqual(placeholder.blocked, { sid: 'CO', overridable: false })
  assert.equal(placeholder.unreadable, 1)
  assert.equal(planFolderAccess(placeholder), 'refuse')
  assert.equal(decide(['A;;FA;;;CO', INHERITED_FULL]), 'provisionable')
})

test('fixtures from the real listings keep their meaning', () => {
  // A verbatim `/save` line from this host's own temp folder, with the ACE the
  // plugin's grant had added (first) plus the inherited ones — a normal volume.
  const real = `D:AI(${EXPLICIT_FULL})(A;OICIID;0x1301bf;;;${OTHER_SID})`
    + `(A;OICIID;0x1301bf;;;${SANDBOX_SID})(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(${INHERITED_FULL})`
  const verdict = evaluateDacl(parseDaclSddl(real), USER_SID, TOKEN)
  assert.equal(verdict.provisionable, true)
  assert.equal(verdict.unreadable, 0)
})

test('the SACL half of a saved descriptor is not read as DACL entries', () => {
  // `icacls /save` writes the whole descriptor on one line, and DSH's own grant
  // puts a Low label in the SACL: the folder then reads
  //   D:AI(D;CI;DT;;;WD)(A;;FA;;;S-…)(…)S:PAINO_ACCESS_CONTROL
  // which is the exact spelling this host produced (the world deny DSH writes
  // is `DT`/FILE_DELETE_CHILD, and it must NOT block this check), and a SACL
  // carrying a real ACE section.
  const granted = `D:AI(D;CI;DT;;;WD)(${EXPLICIT_FULL})(${INHERITED_FULL})S:PAINO_ACCESS_CONTROL`
  const verdict = evaluateDacl(parseDaclSddl(granted), USER_SID, TOKEN)
  assert.equal(verdict.provisionable, true)
  assert.equal(verdict.unreadable, 0)
  assert.equal(verdict.blocked, undefined)
  // A SACL section with ACEs of its own (a label, an audit entry) is cut off
  // before it can inflate the unreadable count or decide a right.
  const withSaclAces = `D:AI(${EXPLICIT_FULL})(${INHERITED_FULL})S:(ML;;NW;;;LW)(AU;SA;FA;;;SY)`
  assert.deepEqual(parseDaclSddl(withSaclAces), parseDaclSddl(`D:AI(${EXPLICIT_FULL})(${INHERITED_FULL})`))
  // A colon inside a conditional ACE stays inside its ACE.
  const conditional = 'D:(XA;;FA;;;SY;(@User.title=="a:b"))'
  assert.equal(parseDaclSddl(conditional).length, 1)
})
