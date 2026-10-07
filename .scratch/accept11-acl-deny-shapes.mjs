/**
 * accept11 — the Windows folder-access check against the ACL shapes the last
 * review found it could not read.
 *
 * The probe is standalone (no Host, no CDP): it builds the shapes in its own
 * scratch tree under %TEMP% and proves them against DSH's OWN grant code
 * (`@deepseek-ai/dsh-sandbox-windows-acl`, the same call that raises
 * `SetNamedSecurityInfoW failed (Win32 5): grantWrite(<dir>)` at a chat's first
 * confined tool call). That platform call is the ground truth here: if the
 * check reports the folder provisionable without making it so, the grant after
 * it still fails and this probe fails with it.
 *
 * Cases, all of them from the review of `9f8a1df`:
 *   A. an explicit deny of EVERYTHING for the account itself, on top of the
 *      inherited full control — icacls renders that deny as `(N)`, which the old
 *      text reader skipped, so it answered "full control, nothing to do" while
 *      the platform grant failed. The check must repair it (its own deny is one
 *      a grant can settle) and the platform grant must then succeed.
 *   B. a deny of everything for a GROUP the account is in (`BUILTIN\Users`) — a
 *      real block a grant cannot outrank, so the check must report failure
 *      WITHOUT writing, and the platform grant must still fail afterwards.
 *   C. the `E:\` pathology: a folder whose parent grants only "Modify"
 *      (`0x1301bf`, the mask icacls calls MODIFY — neither WRITE_DAC nor
 *      WRITE_OWNER), so it inherits none of what provisioning needs. The check
 *      must repair it.
 *   D. the same pathology behind a non-ASCII path (the old reader decoded
 *      icacls output as UTF-8 while icacls writes the console code page).
 *   E. the documented conservatism, measured: a folder that is already
 *      provisionable through a GROUP allow still gets one explicit ACE from the
 *      check (a group allow cannot prove access in a filtered token), and that
 *      ACE is a one-time cost rather than a rewrite on every Host start.
 *
 * Usage: node .scratch/accept11-acl-deny-shapes.mjs
 * Optional: ACCEPT11_SANDBOX_PKG=<path to dsh-sandbox-windows-acl/lib/index.js>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  daclLine, hasFullControlAce, hasExplicitFullControl, icacls, icaclsDump, ownSid,
} from './accept-acl-lib.mjs';

/** Scratch tree, under the OS temp directory only: never a chat root. */
const SCRATCH = path.join(os.tmpdir(), `dsh-accept11-${process.pid}`);
/** Ownership marker: cleanup removes the tree only when it carries this. */
const MARKER = path.join(SCRATCH, '.accept11-probe');
const USERS_SID = '*S-1-5-32-545';
/** The error DSH's own grant raises when it cannot open the folder for WRITE_DAC + WRITE_OWNER. */
const EXPECTED_ERROR = /SetNamedSecurityInfoW failed \(Win32 5\)/;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

function resolveSandboxPackage() {
  const candidates = [
    process.env.ACCEPT11_SANDBOX_PKG,
    path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-sandbox-windows-acl', 'lib', 'index.js'),
  ].filter((p) => typeof p === 'string' && p !== '');
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return null;
}

/** Run DSH's own grant on the folder; returns the error message, or null on success. */
function platformGrant(sandbox, dir) {
  const grant = sandbox.AclWriteGrant.create(sandbox.workspaceWriteSid(dir));
  try {
    grant.add(dir);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    try { grant.dispose(); } catch { /* the failure under test is `add` */ }
  }
}

const { ensureWindowsFolderAccess } = await import(pathToFileURL(path.resolve('lib/index.js')).href);
const sandboxPkg = resolveSandboxPackage();
check('0 the platform sandbox package is importable (the ground truth for every case)',
  sandboxPkg !== null, String(sandboxPkg));
if (sandboxPkg === null) {
  console.error('cannot locate @deepseek-ai/dsh-sandbox-windows-acl (set ACCEPT11_SANDBOX_PKG)');
  process.exit(2);
}
const sandbox = await import(pathToFileURL(sandboxPkg).href);
check('0b it exports the grant and the capability-SID derivation used as the control',
  typeof sandbox.AclWriteGrant === 'function' && typeof sandbox.workspaceWriteSid === 'function');

const sid = ownSid();
check('0c the account SID resolves from whoami', typeof sid === 'string' && sid.startsWith('S-1-5-'), String(sid));
if (sid === null) process.exit(2);

if (!SCRATCH.toLowerCase().startsWith(os.tmpdir().toLowerCase())) {
  console.error(`refusing to run: scratch ${SCRATCH} is not under ${os.tmpdir()}`);
  process.exit(2);
}
fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });
fs.writeFileSync(MARKER, 'dsh-chat-manager accept11 probe-owned scratch\n');

try {
  // ---- A: the deny the old reader could not see ---------------------------------
  const ownedDeny = path.join(SCRATCH, 'owned-deny');
  fs.mkdirSync(ownedDeny);
  check('A0 the folder starts with a full-control ACE for the account (existence, not an access decision)',
    hasFullControlAce(ownedDeny), icaclsDump(ownedDeny));
  const deny = icacls(ownedDeny, '/deny', `*${sid}:(F)`);
  check('A1 an explicit deny of everything for the account itself is in place',
    deny.status === 0, `exit=${deny.status}`);
  const deniedDacl = daclLine(ownedDeny);
  check('A1b that deny precedes the inherited allow (the false-green shape)',
    deniedDacl.includes(`(D;;FA;;;${sid})`) && deniedDacl.includes(`(A;OICIID;FA;;;${sid})`), deniedDacl);
  const beforeA = platformGrant(sandbox, ownedDeny);
  check('A2 the platform grant fails on that folder (the user-log error)', beforeA !== null && EXPECTED_ERROR.test(beforeA), String(beforeA));
  const repairedA = ensureWindowsFolderAccess(ownedDeny);
  check('A3 the check repairs it instead of reporting "nothing to do"',
    repairedA.ok === true && repairedA.changed === true, JSON.stringify(repairedA));
  const afterA = platformGrant(sandbox, ownedDeny);
  check('A4 the platform grant succeeds afterwards (end-to-end proof)', afterA === null, String(afterA));
  const againA = ensureWindowsFolderAccess(ownedDeny);
  const ctimeBefore = fs.statSync(ownedDeny).ctimeMs;
  const thirdA = ensureWindowsFolderAccess(ownedDeny);
  const ctimeAfter = fs.statSync(ownedDeny).ctimeMs;
  check('A5 a second check is idempotent: nothing left to do',
    againA.ok === true && againA.changed === false && thirdA.changed === false, JSON.stringify([againA, thirdA]));
  console.log(`INFO  A6 ctime across a read-only check: ${ctimeBefore} -> ${ctimeAfter}`
    + ` (a DACL write moves it; informational, not a check)`);
  check('A7 the account still holds the ACE the repair wrote', hasExplicitFullControl(ownedDeny), icaclsDump(ownedDeny));
  // The platform's own grant leaves an `Everyone:(DENY)(FILE_DELETE_CHILD)` ACE on
  // the folder (spelled `D;CI;DT;;;WD` in the saved descriptor, plus the Low label
  // in the SACL section on the same line). That deny must NOT make the check
  // refuse it: it carries neither right this check is about — the mirror image of
  // case B.
  const afterGrantDacl = daclLine(ownedDeny);
  check('A8 the sandbox\'s own world FILE_DELETE_CHILD deny does not trip the check',
    /\(D;[A-Z]*;D[TC];;;WD\)/.test(afterGrantDacl) && ensureWindowsFolderAccess(ownedDeny).ok === true,
    afterGrantDacl);

  // ---- B: a group deny is a real block, and is refused rather than written around
  const groupDeny = path.join(SCRATCH, 'group-deny');
  fs.mkdirSync(groupDeny);
  const groupDenied = icacls(groupDeny, '/deny', `${USERS_SID}:(F)`);
  check('B0 an explicit deny of everything for BUILTIN\\Users is in place', groupDenied.status === 0, `exit=${groupDenied.status}`);
  const beforeB = platformGrant(sandbox, groupDeny);
  check('B1 the platform grant fails on that folder too', beforeB !== null && EXPECTED_ERROR.test(beforeB), String(beforeB));
  const refusedB = ensureWindowsFolderAccess(groupDeny);
  check('B2 the check refuses it and names the blocking principal',
    refusedB.ok === false && refusedB.changed === false && refusedB.detail.includes('S-1-5-32-545'),
    JSON.stringify(refusedB));
  check('B3 it wrote nothing: no explicit full-control ACE for the account',
    !hasExplicitFullControl(groupDeny), icaclsDump(groupDeny));
  // The refusal's REASON, measured rather than asserted: make the very grant the
  // check declined to make, and watch it fail to help. Without this the claim
  // "a grant cannot outrank a group deny" would rest on nothing (B3 already
  // showed the check wrote nothing, so repeating the platform grant proves only
  // that nothing changed — which is what this version does differently).
  icacls(groupDeny, '/grant', `*${sid}:(F)`);
  const groupDacl = daclLine(groupDeny);
  // The saved DACL may spell that trustee either way (`S-1-5-32-545` or the
  // well-known abbreviation `BU`), so both spellings are accepted here.
  const denyAt = groupDacl.search(/\(D;;FA;;;(?:S-1-5-32-545|BU)\)/);
  const allowAt = groupDacl.indexOf(`(A;;FA;;;${sid})`);
  check('B4 even with the account\'s own full-control ACE written, the group deny still precedes it',
    denyAt >= 0 && allowAt > denyAt && hasExplicitFullControl(groupDeny), groupDacl);
  const afterB = platformGrant(sandbox, groupDeny);
  check('B5 and the platform grant still fails: writing around it, as the check refuses to do, does not help',
    afterB !== null && EXPECTED_ERROR.test(afterB), String(afterB));

  // ---- C: the Modify-only folder the whole feature exists for -------------------
  const modifyParent = path.join(SCRATCH, 'modify-only');
  fs.mkdirSync(modifyParent);
  const stripped = icacls(modifyParent, '/inheritance:r', '/grant', `${USERS_SID}:(OI)(CI)M`);
  check('C0 a parent that grants only Modify (no CREATOR OWNER entry)', stripped.status === 0, `exit=${stripped.status}`);
  const modifyFolder = path.join(modifyParent, 'workspace');
  fs.mkdirSync(modifyFolder);
  check('C1 the child inherits no full control', !hasFullControlAce(modifyFolder), daclLine(modifyFolder));
  const beforeC = platformGrant(sandbox, modifyFolder);
  check('C2 the platform grant fails there (the E:\\ pathology)', beforeC !== null && EXPECTED_ERROR.test(beforeC), String(beforeC));
  const repairedC = ensureWindowsFolderAccess(modifyFolder);
  check('C3 the check makes it provisionable', repairedC.ok === true && repairedC.changed === true, JSON.stringify(repairedC));
  const afterC = platformGrant(sandbox, modifyFolder);
  check('C4 the platform grant succeeds afterwards', afterC === null, String(afterC));

  // ---- D: the same pathology behind a non-ASCII path ---------------------------
  const cjkFolder = path.join(modifyParent, '测试文件夹-中文');
  fs.mkdirSync(cjkFolder);
  const repairedD = ensureWindowsFolderAccess(cjkFolder);
  check('D0 a non-ASCII folder path is read and repaired like any other',
    repairedD.ok === true && repairedD.changed === true, JSON.stringify(repairedD));
  const afterD = platformGrant(sandbox, cjkFolder);
  check('D1 the platform grant succeeds on it as well', afterD === null, String(afterD));

  // ---- E: the documented conservatism, measured ---------------------------------
  // A folder whose only grant reaches the account through a GROUP is already
  // provisionable (the platform grant below proves it), yet the check still writes
  // its own ACE once: a group allow may belong to a SID that is deny-only in a
  // filtered token, so it cannot prove access. The cost is measured here — one
  // ACE, written once, never again.
  const groupAllow = path.join(SCRATCH, 'group-allow');
  fs.mkdirSync(groupAllow);
  const strippedE = icacls(groupAllow, '/inheritance:r', '/grant', `${USERS_SID}:(F)`);
  check('E0 a folder granting BUILTIN\\Users full control and nothing else', strippedE.status === 0, `exit=${strippedE.status}`);
  const beforeE = platformGrant(sandbox, groupAllow);
  check('E1 the platform grant already succeeds there: a group allow really is effective', beforeE === null, String(beforeE));
  const redundantE = ensureWindowsFolderAccess(groupAllow);
  check('E2 the check writes its own ACE anyway (documented conservatism)',
    redundantE.ok === true && redundantE.changed === true && hasExplicitFullControl(groupAllow),
    JSON.stringify(redundantE));
  const againE = ensureWindowsFolderAccess(groupAllow);
  check('E3 that extra ACE is a ONE-TIME cost: the next check finds nothing to do',
    againE.ok === true && againE.changed === false, JSON.stringify(againE));
} catch (err) {
  console.error('probe threw:', err);
  failures.push(`probe threw: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  // A deny of everything blocks deletion for the principal it names, while the
  // OWNER keeps implicit WRITE_DAC — so dropping the denies is what frees the
  // tree, own SID included (a case that failed before the repair still has one).
  for (const dir of ['group-deny', 'owned-deny', 'group-allow']) {
    const target = path.join(SCRATCH, dir);
    if (!fs.existsSync(target)) continue;
    icacls(target, '/remove:d', USERS_SID);
    icacls(target, '/remove:d', `*${sid}`);
    icacls(target, '/grant', `*${sid}:(F)`);
  }
  if (fs.existsSync(MARKER)) fs.rmSync(SCRATCH, { recursive: true, force: true, maxRetries: 3 });
  check('Z the probe removed its own scratch tree', !fs.existsSync(SCRATCH), SCRATCH);
}

console.log(failures.length === 0
  ? `accept11: all checks passed (${SCRATCH} removed)`
  : `accept11: ${failures.length} check(s) FAILED: ${failures.join('; ')}`);
process.exit(failures.length === 0 ? 0 : 1);
