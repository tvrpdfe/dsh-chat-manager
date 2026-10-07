// Windows chat-folder access acceptance, phase 2 (run after a Host restart on
// the SAME isolated chat root). Phase 1 left one date folder un-healed on
// purpose (`2099-01-01`, created while the Host was running). This phase proves
// the boot pass heals existing date folders — i.e. chats that already exist —
// and that the heal is real provisioning power, not just an ACE that looks
// right: DSH's own grant must succeed on the boot-healed folder.
//
// Usage (same throwaway values as phase 1):
//   DSH_HOME=<copy> DSH_CHAT_MANAGER_ROOT=<throwaway root> node .scratch/accept10-phase2.mjs <url>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openApp } from './accept2-lib.mjs';
import { hasExplicitFullControl, icacls, icaclsDump } from './accept-acl-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept10-phase2.mjs <url>'); process.exit(2); }
if (!process.env.DSH_HOME || !process.env.DSH_CHAT_MANAGER_ROOT) {
  console.error('refusing to run: set DSH_HOME to a throwaway copy of the home and DSH_CHAT_MANAGER_ROOT to a throwaway chat root');
  process.exit(2);
}
const CHAT_ROOT = process.env.DSH_CHAT_MANAGER_ROOT;
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9413);
const RESULT = '.scratch/accept10-result.json';
const SCRATCH = path.join(path.dirname(CHAT_ROOT), 'accept10-scratch');
const EXPECTED_ERROR = /SetNamedSecurityInfoW failed \(Win32 5\)/;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

function resolveSandboxPackage() {
  const candidates = [
    process.env.ACCEPT10_SANDBOX_PKG,
    path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-sandbox-windows-acl', 'lib', 'index.js'),
  ].filter((p) => typeof p === 'string' && p !== '');
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return null;
}

const phase1 = JSON.parse(fs.readFileSync(RESULT, 'utf8'));
const { dateFolder, bootFolder, hostStartedAt, bootFolderUnhealed, beforeFixError } = phase1;
const PROBE_MARKER = path.join(CHAT_ROOT, '.accept10-probe');
let cleaned = false;
let removedRoot = false;
let reappeared = false;
const app = await openApp({ url: URL, port: PORT });
const state = () => app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json())`);
const ensureDateFolder = () => app.evaluate(`fetch('/api/chat-manager/ensure-date-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(r => r.json())`);
try {
  await app.navigate();
  const now = await state();
  check('1 the Host still uses the isolated chat root', now.dshRoot === CHAT_ROOT, `dshRoot=${now.dshRoot}`);
  // Hard rail, not a recorded failure: everything below (including the cleanup)
  // may only ever touch the probe's own root. A mis-set DSH_CHAT_MANAGER_ROOT
  // must abort here, never delete the operator's real chat tree.
  if (now.dshRoot !== CHAT_ROOT) {
    throw new Error(`refusing to continue: the Host is not using ${CHAT_ROOT} (dshRoot=${String(now.dshRoot)})`);
  }
  check('2 this is a different Host process than phase 1', typeof now.hostStartedAt === 'number' && now.hostStartedAt !== hostStartedAt, `phase1=${hostStartedAt} phase2=${now.hostStartedAt}`);
  // Phase 1's own observations, so this phase does not rely on a PASS the
  // operator saw: the folder must have been UN-healed, and the platform grant on
  // the hand-made date folder must have failed with the user-log error.
  check('2b phase 1 recorded the boot folder as un-healed before this restart', bootFolderUnhealed === true, `bootFolderUnhealed=${String(bootFolderUnhealed)} beforeFixError=${String(beforeFixError)}`);
  check('2c phase 1 recorded the pre-fix platform failure on the date folder', typeof beforeFixError === 'string' && EXPECTED_ERROR.test(beforeFixError), String(beforeFixError));

  // The boot pass must have healed the folder phase 1 left un-healed.
  check('3 the folder created while phase 1 ran is still on disk', fs.existsSync(bootFolder), bootFolder);
  check('4 the boot pass healed it (explicit full control for the user)', hasExplicitFullControl(bootFolder), icaclsDump(bootFolder));
  check('5 the phase-1 date folder is still healed', hasExplicitFullControl(dateFolder), icaclsDump(dateFolder));

  // Healed means provisionable: the platform's own grant must now succeed there.
  const sandboxPkg = resolveSandboxPackage();
  check('6 the sandbox package is importable', sandboxPkg !== null, String(sandboxPkg));
  if (sandboxPkg === null) throw new Error('cannot locate @deepseek-ai/dsh-sandbox-windows-acl (set ACCEPT10_SANDBOX_PKG)');
  const sandbox = await import(pathToFileURL(sandboxPkg).href);
  let bootError = null;
  const bootGrant = sandbox.AclWriteGrant.create(sandbox.workspaceWriteSid(bootFolder));
  try { bootGrant.add(bootFolder); } catch (err) { bootError = err; } finally { try { bootGrant.dispose(); } catch { /* reported below */ } }
  check('7 the platform grant succeeds on the boot-healed folder', bootError === null, String(bootError && bootError.message));
  if (bootError !== null) check('7b that failure is the pre-fix error, not a new one', EXPECTED_ERROR.test(String(bootError.message)), String(bootError.message));

  // A healed folder must not be re-ACLed on the next route call.
  const again = await ensureDateFolder();
  check('8 the route reports no change for an already-healed folder', again.folderAccess != null && again.folderAccess.ok === true && again.folderAccess.changed === false, JSON.stringify(again.folderAccess));
  check('9 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map((e) => e.text.slice(0, 200))));
} finally {
  // Close the browser BEFORE removing the tree. The chat flow calls
  // /ensure-date-folder while a page is loaded, so a late call from a page the
  // probe left open recreates the day folder right after its cleanup — the
  // directory would come back (observed once) and the residue check would lie.
  await app.close();
  try {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
    // Wholesale removal of the chat root requires the marker phase 1 wrote in it.
    // Without the marker this is not the probe's root: remove only the two
    // folders the probe created and report the residue honestly.
    if (fs.existsSync(PROBE_MARKER)) {
      fs.rmSync(CHAT_ROOT, { recursive: true, force: true });
      removedRoot = true;
    } else {
      console.log(`no probe marker in ${CHAT_ROOT}: removing only the probe's own folders`);
      fs.rmSync(dateFolder, { recursive: true, force: true });
      fs.rmSync(bootFolder, { recursive: true, force: true });
    }
    cleaned = !fs.existsSync(dateFolder) && !fs.existsSync(bootFolder) && (!removedRoot || !fs.existsSync(CHAT_ROOT));
    // The route creates its root with `mkdirSync(recursive)`, so a client call
    // that was still in flight when the browser went away can recreate the
    // whole tree moments AFTER this cleanup (observed once: the root came back
    // with a default, un-stripped ACL and today's folder inside). The path was
    // already proven isolated in check 1, so sweeping again is safe; the marker
    // is gone by then, hence the explicit second pass.
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (fs.existsSync(CHAT_ROOT)) {
      fs.rmSync(dateFolder, { recursive: true, force: true });
      fs.rmSync(bootFolder, { recursive: true, force: true });
      fs.rmSync(CHAT_ROOT, { recursive: true, force: true });
      reappeared = true;
      cleaned = !fs.existsSync(CHAT_ROOT);
    }
  } catch (err) {
    console.log(`cleanup left residue: ${err.message}`);
  }
  check('10 the probe left no residue it could remove (no standing ACL residue blocks deletion)', cleaned, `${CHAT_ROOT} removedRoot=${String(removedRoot)} reappeared=${String(reappeared)}`);
  console.log(failures.length === 0 ? 'PHASE2 ALL PASS' : `PHASE2 FAILURES: ${failures.join(', ')}`);
}
process.exitCode = failures.length === 0 ? 0 : 1;
