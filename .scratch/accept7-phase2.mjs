// Row-menu durable-delete acceptance, phase 2: after a Host restart the Session
// deleted from its row menu in phase 1 must stay gone — no row, no restored log.
// The home is resolved from DSH_HOME, like phase 1.
// Usage: DSH_HOME=<home> node .scratch/accept7-phase2.mjs <url>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, sleep } from './accept2-lib.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node accept7-phase2.mjs <url>'); process.exit(2); }
const result = JSON.parse(fs.readFileSync('.scratch/accept7-result.json', 'utf8'));
const gone = [result.sid, ...process.argv.slice(3)];
const DSH = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const SESSIONS = path.join(DSH, 'sessions');

/** Directories on disk holding this session id. */
function dirsOf(id) {
  const out = [];
  for (const slug of fs.existsSync(SESSIONS) ? fs.readdirSync(SESSIONS) : []) {
    const dir = path.join(SESSIONS, slug, id);
    if (fs.existsSync(dir)) out.push(dir);
  }
  return out;
}

const app = await openApp({ url: URL, port: 9409 });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};
try {
  await app.navigate();
  // Liveness first: without it every "is absent" check below would pass on a page
  // that never rendered.
  const rendered = await app.waitForApp({ attempts: 40, intervalMs: 400 });
  check('0 the app rendered rows before the checks', rendered === true);
  await sleep(3000);
  const ids = await app.evaluate(`[...document.querySelectorAll('[data-row-key^="session:"]')].map(r => r.getAttribute('data-row-key').slice(8))`);
  for (const id of gone) {
    check(`1 ${id.slice(0, 16)} is absent after the restart`, !ids.includes(id), `rows=${ids.length}`);
    check(`2 ${id.slice(0, 16)} has no restored log`, dirsOf(id).length === 0, JSON.stringify(dirsOf(id)));
  }
  check('3 no console errors', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 160))));
  check('4 a non-blank row still offers its verb strip', (await app.evaluate(`(() => {
    const chat = document.querySelector('[class$=_chatSection]');
    const rows = [...document.querySelectorAll('[data-row-key^="session:"]')]
      .filter(r => !(chat === null || chat.contains(r)))
      .filter(r => r.querySelector('[class$=_rowActions]') !== null);
    return rows.length;
  })()`)) > 0);
} finally {
  console.log(failures.length === 0 ? 'PHASE2 ALL PASS' : `PHASE2 FAILURES: ${failures.join(', ')}`);
  await app.close();
}
process.exitCode = failures.length === 0 ? 0 : 1;
