// Windows chat-folder access acceptance, phase 1. The bug this probe pins:
// DSH's `workspace-write` sandbox provisions a session's workspace root (the
// chat's date folder) by writing a standing DACL edit plus a Low label into its
// SACL, which needs effective WRITE_DAC + WRITE_OWNER on that folder. A folder
// created inside a directory that grants only "Modify" (no CREATOR OWNER
// inheritance — a relocated Documents tree on E:\ is exactly that) carries
// neither, so the chat's first confined tool call dies with
// `SetNamedSecurityInfoW failed (Win32 5): grantWrite(<folder>)`.
//
// Phase 1 proves, on a throwaway chat root whose ACL reproduces that parent:
//   - the mechanism, with DSH's OWN grant code as the negative control: the
//     platform grant on a broker folder must fail with that exact error;
//   - the fix: `/api/chat-manager/ensure-date-folder` makes the date folder it
//     creates provisionable (explicit full-control ACE for the signed-in user),
//     and the platform grant then succeeds on it;
//   - idempotency: a second route call reports `changed: false`;
//   - the boot pass is a boot-time pass, not a watcher: a date folder created
//     while the Host runs stays un-healed (phase 2 proves the restart heals it).
//
// Usage (a throwaway $DSH_HOME copy and a throwaway chat root are REQUIRED: this
// probe rewrites folder permissions and drives the plugin's routes):
//   DSH_HOME=<copy> DSH_CHAT_MANAGER_ROOT=<throwaway root> node .scratch/accept10-chat-folder-acl.mjs <url>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openApp } from './accept2-lib.mjs';
import {
  hasFullControlAce, hasExplicitFullControl, icacls, icaclsDump,
} from './accept-acl-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept10-chat-folder-acl.mjs <url>'); process.exit(2); }
if (!process.env.DSH_HOME || !process.env.DSH_CHAT_MANAGER_ROOT) {
  console.error('refusing to run: set DSH_HOME to a throwaway copy of the home and DSH_CHAT_MANAGER_ROOT to a throwaway chat root (this probe rewrites folder permissions)');
  process.exit(2);
}
const CHAT_ROOT = process.env.DSH_CHAT_MANAGER_ROOT;
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9412);
const RESULT = '.scratch/accept10-result.json';
/** Probe-owned scratch beside the isolated root; never the live chat tree. */
const SCRATCH = path.join(path.dirname(CHAT_ROOT), 'accept10-scratch');
const NEGCTL = path.join(SCRATCH, 'negctl');
const BOOT_FOLDER_NAME = '2099-01-01';
/**
 * Ownership marker inside the isolated chat root. Phase 2 removes that root
 * wholesale only when this file is present, so a mis-set
 * `DSH_CHAT_MANAGER_ROOT` cannot make the probe delete a real chat tree.
 */
const PROBE_MARKER = path.join(CHAT_ROOT, '.accept10-probe');
/** BUILTIN\Users by SID: the localized name of a well-known group is not stable. */
const USERS_SID = '*S-1-5-32-545';
/** The error DSH's own grant raises when the folder cannot be opened for WRITE_DAC + WRITE_OWNER. */
const EXPECTED_ERROR = /SetNamedSecurityInfoW failed \(Win32 5\)/;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};
const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** The running Host's own sandbox package: its grant code is the negative control. */
function resolveSandboxPackage() {
  const candidates = [
    process.env.ACCEPT10_SANDBOX_PKG,
    path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-sandbox-windows-acl', 'lib', 'index.js'),
  ].filter((p) => typeof p === 'string' && p !== '');
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return null;
}

const app = await openApp({ url: URL, port: PORT });
const state = () => app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json())`);
const ensureDateFolder = () => app.evaluate(`fetch('/api/chat-manager/ensure-date-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(r => r.json())`);
let scratchCreated = false;
try {
  await app.navigate();
  // A freshly started isolated Host paints late (see accept2-lib: rows AND text,
  // never a character floor). The checks below are route- and filesystem-level,
  // but the console-error check needs the shell fully booted.
  if (!(await app.waitForApp())) throw new Error('the page never painted');

  // 0. Safety rails: the override must be in effect (otherwise this Host is
  //    operating on the REAL chat tree and the probe must not run at all), and
  //    the isolated root must start in the broken shape we mean to test.
  const first = await state();
  check('0 the Host uses the isolated chat root from DSH_CHAT_MANAGER_ROOT', first.dshRoot === CHAT_ROOT, `dshRoot=${first.dshRoot} expected=${CHAT_ROOT}`);
  if (first.dshRoot !== CHAT_ROOT) throw new Error('the chat-root override is not in effect: refusing to touch folder permissions');
  // `hasFullControlAce` is an existence check (no ACE order, denies skipped), and
  // that is all this needs: the operator prepares the root with inheritance
  // removed and a single `BUILTIN\Users:(OI)(CI)(M)`, so "no allow ACE grants the
  // user full control" and "the account has no effective full control" coincide.
  check('0b the isolated root grants the user no full control by any ACE (the broken shape)',
    fs.existsSync(CHAT_ROOT) && !hasFullControlAce(CHAT_ROOT), `exists=${fs.existsSync(CHAT_ROOT)} ${icaclsDump(CHAT_ROOT)}`);
  check('0c the Host reports its start time', typeof first.hostStartedAt === 'number', String(first.hostStartedAt));
  // Mark the root as probe-owned BEFORE anything can create folders in it: phase
  // 2 only removes it wholesale when this marker is present, so a mis-set
  // DSH_CHAT_MANAGER_ROOT can never make the probe delete a real chat tree.
  fs.writeFileSync(PROBE_MARKER, 'dsh-chat-manager accept10 probe-owned root\n')

  // 1. Negative control through DSH's own grant code: a folder under a
  //    Modify-only parent cannot be provisioned, with the error from the user log.
  const sandboxPkg = resolveSandboxPackage();
  check('1 the running Host\'s sandbox package is importable', sandboxPkg !== null, String(sandboxPkg));
  if (sandboxPkg === null) throw new Error('cannot locate @deepseek-ai/dsh-sandbox-windows-acl (set ACCEPT10_SANDBOX_PKG)');
  const sandbox = await import(pathToFileURL(sandboxPkg).href);
  check('1b the package exports the grant used as the control', typeof sandbox.AclWriteGrant === 'function' && typeof sandbox.workspaceWriteSid === 'function');
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(NEGCTL, { recursive: true });
  const stripped = icacls(NEGCTL, '/inheritance:r', '/grant', `${USERS_SID}:(OI)(CI)M`);
  scratchCreated = true;
  check('2 the control parent lost its inherited ACL', stripped.status === 0, `exit=${stripped.status}`);
  // The child must be created AFTER the strip, so it inherits only "Modify".
  const controlFolder = path.join(NEGCTL, 'workspace');
  fs.mkdirSync(controlFolder);
  check('2b the control folder carries no explicit full control for the user', !hasExplicitFullControl(controlFolder), icaclsDump(controlFolder));
  let controlError = null;
  const control = sandbox.AclWriteGrant.create(sandbox.workspaceWriteSid(controlFolder));
  try { control.add(controlFolder); } catch (err) { controlError = err; } finally { try { control.dispose(); } catch { /* control already failed */ } }
  check('3 the platform grant on the broken folder fails with the user-log error', controlError !== null && EXPECTED_ERROR.test(String(controlError.message)), String(controlError && controlError.message));

  // 2. The fix: the route that creates the chat's date folder makes it provisionable.
  //    The page's own chat flow calls this same route while it boots (that is the chat
  //    area healing its folder), so the probe removes today's folder first and drives
  //    the broken-to-healed transition itself rather than depending on who won that race.
  const dateFolder = path.join(CHAT_ROOT, today());
  fs.rmSync(dateFolder, { recursive: true, force: true });
  check('4 the date folder starts absent (removed by the probe)', !fs.existsSync(dateFolder), dateFolder);
  // 4b. THE BEFORE MEASUREMENT. The route creates the folder, so its pre-fix state must
  //     be reproduced here: the probe creates the same folder itself (inheriting only the
  //     root's Modify) and asks the platform to provision it. Without this, checks 5-7
  //     would also pass on a root that was never broken.
  fs.mkdirSync(dateFolder, { recursive: true });
  check('4b the hand-made date folder inherits no full control for the user',
    !hasFullControlAce(dateFolder), icaclsDump(dateFolder));
  let beforeError = null;
  const before = sandbox.AclWriteGrant.create(sandbox.workspaceWriteSid(dateFolder));
  try { before.add(dateFolder); } catch (err) { beforeError = err; } finally { try { before.dispose(); } catch { /* expected to have failed */ } }
  check('4c the platform grant on that very folder fails before the fix (the user-log error)',
    beforeError !== null && EXPECTED_ERROR.test(String(beforeError.message)), String(beforeError && beforeError.message));
  fs.rmSync(dateFolder, { recursive: true, force: true });
  check('4d the folder is removed again, so the route creates and heals it', !fs.existsSync(dateFolder), dateFolder);
  const created = await ensureDateFolder();
  const access = created.folderAccess ?? null;
  check('5 the route reports the folder as provisionable', access !== null && access.ok === true && access.skipped === false, JSON.stringify(access));
  check('5b the route had to add the ACE (the folder was created in a Modify-only root)', access !== null && access.changed === true, JSON.stringify(access));
  check('6 the date folder now carries an explicit full-control ACE for the user', hasExplicitFullControl(dateFolder), icaclsDump(dateFolder));

  // 3. End to end: the platform's own provisioning now succeeds on that folder.
  let healedError = null;
  const healed = sandbox.AclWriteGrant.create(sandbox.workspaceWriteSid(dateFolder));
  try { healed.add(dateFolder); } catch (err) { healedError = err; } finally { try { healed.dispose(); } catch { /* verified below */ } }
  check('7 the platform grant succeeds on the healed chat folder', healedError === null, String(healedError && healedError.message));

  // 4. Idempotency: the second call must not write again.
  const again = await ensureDateFolder();
  check('8 a second route call reports no change', again.folderAccess != null && again.folderAccess.ok === true && again.folderAccess.changed === false, JSON.stringify(again.folderAccess));

  // 5. The boot pass is a boot-time pass: a date folder created while the Host
  //    runs is NOT healed until the next start (phase 2 asserts that restart).
  const bootFolder = path.join(CHAT_ROOT, BOOT_FOLDER_NAME);
  fs.mkdirSync(bootFolder, { recursive: true });
  const bootUnhealed = !hasExplicitFullControl(bootFolder);
  check('9 a folder created while the Host runs stays un-healed until a restart', bootUnhealed, icaclsDump(bootFolder));

  check('10 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map((e) => e.text.slice(0, 200))));

  // Phase 2 re-checks these observations; carrying them makes its "the boot pass
  // healed it" claim self-contained instead of trusting a PASS the operator saw.
  fs.writeFileSync(RESULT, JSON.stringify({
    chatRoot: CHAT_ROOT, dateFolder, bootFolder, hostStartedAt: first.hostStartedAt, access,
    bootFolderUnhealed: bootUnhealed, beforeFixError: beforeError === null ? null : String(beforeError.message),
  }, null, 1));
  console.log(`wrote ${RESULT}`);
} finally {
  // Phase 2 needs the chat root (and the un-healed folder) to survive the
  // restart; only the negative-control scratch is removed here.
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (err) { console.log(`scratch cleanup left residue: ${err.message}`); }
  console.log(failures.length === 0 ? 'PHASE1 ALL PASS' : `PHASE1 FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
