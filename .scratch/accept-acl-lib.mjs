// Shared ACL reading for the Windows folder-access probes (accept10,
// accept10-phase2, accept11).
//
// Why SIDs and not names. `icacls <dir>` prints trustees as NAMES in the console
// code page, and this account's name may be non-ASCII — the lesson the plugin's
// own reader already learned (AGENTS.md: "非 ASCII 账户名永远匹配不上"). A probe
// that compared that decoded text with `USERDOMAIN\USERNAME` therefore missed
// the account's own ACE on exactly those machines: accept10's "the root carries
// no full control for the user" would pass for the wrong reason, and its
// "the folder is repaired" check would fail on a folder that was repaired. The
// saved descriptor (`icacls /save`, UTF-16LE) names trustees by SID, so the
// probes read that; the name-based listing survives only as a diagnostic dump.
//
// These helpers are a deliberately independent re-implementation of the listing
// rule — the probes must not pass by calling the code they verify — while the
// authoritative provisioning proof stays the platform's own grant, which the
// probes call themselves.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Run icacls (absolute path, never PATH); returns exit status plus combined output. */
export function icacls(...args) {
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe');
  const r = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Raw `icacls <dir>` listing, for diagnostics and the checks that read it as text. */
export function icaclsDump(dir) {
  const r = icacls(dir);
  return r.status === 0 ? r.out.trim() : `icacls exited ${String(r.status)}`;
}

/** The account's own SID, from whoami — ASCII, whatever the console code page is. */
export function ownSid() {
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe');
  const r = spawnSync(exe, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  return /S-1-\d+(?:-\d+)+/.exec(`${r.stdout ?? ''}`)?.[0] ?? null;
}

/**
 * The raw `D:…` DACL line of a folder, read the way icacls stores it.
 * @param dir - the folder to read.
 * @returns the descriptor line, or a diagnostic string when icacls failed.
 */
export function daclLine(dir) {
  const saveFile = path.join(os.tmpdir(), `dsh-accept-acl-${process.pid}-${Math.random().toString(36).slice(2)}.txt`);
  try {
    const r = icacls(dir, '/save', saveFile);
    if (r.status !== 0) return `icacls /save exited ${String(r.status)}`;
    const lines = fs.readFileSync(saveFile, 'utf16le').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
    return lines[lines.length - 1] ?? '';
  } finally {
    fs.rmSync(saveFile, { force: true });
  }
}

/** Whether a rights field carries full control: both WRITE_DAC and WRITE_OWNER. */
function carriesFullControl(rights) {
  const text = rights.trim().toUpperCase();
  if (text === 'FA' || text === 'GA') return true;
  if (/^0X[0-9A-F]+$/.test(text)) {
    const mask = Number.parseInt(text.slice(2), 16);
    return (mask & 0x0004_0000) !== 0 && (mask & 0x0008_0000) !== 0;
  }
  return false;
}

/** The ACE bodies of the DACL section of a folder's saved descriptor. */
function savedAces(dir) {
  const sddl = daclLine(dir);
  const start = sddl.indexOf('D:');
  if (start < 0) return [];
  const after = sddl.slice(start + 2);
  // Cut the DACL at the next top-level section marker: a sandboxed folder's
  // descriptor carries a SACL (`S:PAINO_ACCESS_CONTROL`) after it.
  let body = after;
  let depth = 0;
  for (let i = 0; i < after.length; i += 1) {
    const ch = after[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ':' && depth === 0) { body = after.slice(0, i - 1); break }
  }
  return [...body.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
}

/**
 * The ACEs the account itself holds on this object, read by SID.
 * @param dir - the folder to read.
 * @param options - `inherited: false` counts only ACEs set on this object.
 * @returns one `flags;rights` string per matching ACE.
 */
export function userAceRows(dir, { inherited }) {
  const sid = ownSid();
  if (sid === null) return [];
  const rows = [];
  for (const ace of savedAces(dir)) {
    const fields = ace.split(';');
    if (fields.length < 6) continue;
    const [kind, flags, rights, , , trustee] = fields;
    if (trustee !== sid) continue;
    if (kind.startsWith('D')) continue;
    if (flags.includes('IO')) continue;
    if (!carriesFullControl(rights)) continue;
    if (!inherited && flags.includes('ID')) continue;
    rows.push(`${flags};${rights}`);
  }
  return rows;
}

/**
 * Whether a full-control ACE for the account EXISTS on this object, inherited or
 * not.
 *
 * Deliberately not an access decision: it skips deny ACEs and does not walk the
 * ACE order, so it answers "is there such an ACE", never "does the account end
 * up with full control" (the plugin's own reader does that; the probes call the
 * platform's grant for the authoritative answer). Callers must phrase their
 * check accordingly.
 * @param dir - the folder to read.
 * @returns true when at least one allow ACE grants the account full control.
 */
export function hasFullControlAce(dir) {
  return userAceRows(dir, { inherited: true }).length > 0;
}

/** Full control written on this very object (an explicit, non-inherited ACE). */
export function hasExplicitFullControl(dir) {
  return userAceRows(dir, { inherited: false }).length > 0;
}
