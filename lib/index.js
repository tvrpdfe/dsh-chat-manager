// src/index.ts
import fs2 from "node:fs";
import path2 from "node:path";
import os2 from "node:os";
import crypto from "node:crypto";
import { spawnSync as spawnSync2 } from "node:child_process";

// src/shared/paths.ts
function normalizePath(p) {
  return String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
}
function normalizePathLower(p) {
  return normalizePath(p).toLowerCase();
}
function isUnderChatRoot(cwd, root) {
  if (!cwd || !root) return false;
  const a = normalizePathLower(cwd);
  const b = normalizePathLower(root);
  return a === b || a.startsWith(b + "/");
}

// src/shared/slug.ts
function slugWords(raw) {
  return String(raw ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
}
function cleanSlug(raw, minWords = 2, maxWords = 4) {
  let words = slugWords(raw).slice(0, maxWords);
  if (words.length === 0) words = ["chat"];
  while (words.length < minWords) words.push("session");
  return words.join("-");
}
function collisionSlug(words, n) {
  if (n <= 0) return words.join("-");
  const trimmed = words.slice(0, Math.max(words.length - 1, 1));
  return `${trimmed.join("-")}-${n + 1}`;
}

// src/shared/removal-plan.ts
function planSessionArtifactRemoval(input) {
  if (input.platform !== "win32" && input.live) return "refuse-live-posix";
  return input.artifactInSessionDirectory ? "remove-directory" : "remove-single-artifact";
}

// src/win-folder-access.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
var ICACLS_TIMEOUT_MS = 1e4;
var MIN_SPAWN_BUDGET_MS = 500;
var USER_FULL_CONTROL = (sid) => `*${sid}:(F)`;
function systemTool(name2) {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  return path.join(systemRoot, "System32", name2);
}
function runTool(exe, args, timeoutMs) {
  const result = spawnSync(exe, args, { encoding: "utf8", windowsHide: true, timeout: timeoutMs });
  if (result.error !== void 0 && result.error !== null) {
    return { status: null, output: "", error: result.error.message };
  }
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  return { status: result.status, output: `${stdout}${stderr}` };
}
function tail(output) {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const last = lines.length > 0 ? lines[lines.length - 1] : "";
  return last.length > 200 ? `${last.slice(0, 200)}\u2026` : last;
}
var WRITE_DAC_CODES = /* @__PURE__ */ new Set(["FA", "GA", "WD"]);
var WRITE_OWNER_CODES = /* @__PURE__ */ new Set(["FA", "GA", "WO"]);
var KNOWN_PLAIN_CODES = /* @__PURE__ */ new Set([
  "CC",
  "DC",
  "LC",
  "SW",
  "RP",
  "WP",
  "DT",
  "LO",
  "CR",
  "SD",
  "RC",
  "NR",
  "FR",
  "FW",
  "FX",
  "GR",
  "GW",
  "GX",
  "KR",
  "KW",
  "KX",
  "NW",
  "NX",
  "RD",
  "AD",
  "RA",
  "WA"
]);
var THREE_LETTER_PLAIN_CODES = /* @__PURE__ */ new Set(["REA", "WEA"]);
var WELL_KNOWN_SIDS = {
  AC: "S-1-15-2-1",
  // All Application Packages
  AN: "S-1-5-7",
  // Anonymous Logon
  AO: "S-1-5-32-548",
  // Account Operators
  AU: "S-1-5-11",
  // Authenticated Users
  BA: "S-1-5-32-544",
  // Builtin Administrators
  BG: "S-1-5-32-546",
  // Builtin Guests
  BO: "S-1-5-32-551",
  // Backup Operators
  BU: "S-1-5-32-545",
  // Builtin Users
  CY: "S-1-5-32-569",
  // Cryptographic Operators
  ER: "S-1-5-32-573",
  // Event Log Readers
  HA: "S-1-5-32-578",
  // Hyper-V Administrators
  IS: "S-1-5-32-568",
  // IIS_IUSRS
  IU: "S-1-5-4",
  // Interactive
  LS: "S-1-5-19",
  // Local Service
  NO: "S-1-5-32-556",
  // Network Configuration Operators
  NS: "S-1-5-20",
  // Network Service
  NU: "S-1-5-2",
  // Network
  PO: "S-1-5-32-550",
  // Printer Operators
  PS: "S-1-5-10",
  // Principal Self (an AD-object spelling: meaningless in a file ACL)
  PU: "S-1-5-32-547",
  // Power Users
  RC: "S-1-5-12",
  // Restricted Code
  RE: "S-1-5-32-552",
  // Replicator
  RM: "S-1-5-32-580",
  // Remote Management Users
  SO: "S-1-5-32-549",
  // Server Operators
  SU: "S-1-5-6",
  // Service
  SY: "S-1-5-18",
  // Local System
  WD: "S-1-1-0",
  // Everyone
  WR: "S-1-5-33"
  // Write Restricted Code
};
var INHERIT_ONLY_FLAG = "IO";
var INHERITED_FLAG = "ID";
function aceFlags(flags) {
  let inheritOnly = false;
  let inherited = false;
  for (let i = 0; i + 1 < flags.length; i += 2) {
    const code = flags.slice(i, i + 2);
    if (code === INHERIT_ONLY_FLAG) inheritOnly = true;
    else if (code === INHERITED_FLAG) inherited = true;
  }
  return { inheritOnly, inherited };
}
var SID_PATTERN = /^S-1-\d+(?:-\d+)+$/;
function resolveTrustee(trustee) {
  if (SID_PATTERN.test(trustee)) return { trustee, resolved: true };
  const known = WELL_KNOWN_SIDS[trustee.toUpperCase()];
  return known === void 0 ? { trustee, resolved: false } : { trustee: known, resolved: true };
}
function parseRightsField(field) {
  const text = field.trim().toUpperCase();
  if (text === "") return { writeDac: false, writeOwner: false };
  if (/^0X[0-9A-F]+$/.test(text)) {
    const mask = Number.parseInt(text.slice(2), 16);
    if ((mask & 268435456) !== 0) return { writeDac: true, writeOwner: true };
    return { writeDac: (mask & 262144) !== 0, writeOwner: (mask & 524288) !== 0 };
  }
  const rights = { writeDac: false, writeOwner: false };
  let i = 0;
  while (i < text.length) {
    const three = text.slice(i, i + 3);
    if (THREE_LETTER_PLAIN_CODES.has(three)) {
      i += 3;
      continue;
    }
    const two = text.slice(i, i + 2);
    const carriesWriteDac = WRITE_DAC_CODES.has(two);
    const carriesWriteOwner = WRITE_OWNER_CODES.has(two);
    if (carriesWriteDac || carriesWriteOwner) {
      if (carriesWriteDac) rights.writeDac = true;
      if (carriesWriteOwner) rights.writeOwner = true;
      i += 2;
      continue;
    }
    if (KNOWN_PLAIN_CODES.has(two)) {
      i += 2;
      continue;
    }
    if (text[i] === "X") {
      i += 1;
      continue;
    }
    return null;
  }
  return rights;
}
function splitAces(text) {
  const bodies = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return void 0;
      if (depth === 0 && start >= 0) {
        bodies.push(text.slice(start, i));
        start = -1;
      }
    }
  }
  return depth === 0 ? bodies : void 0;
}
function daclSection(body) {
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0 && (body[i - 1] === "S" || body[i - 1] === "O" || body[i - 1] === "G")) {
      return body.slice(0, i - 1);
    }
  }
  return body;
}
var DACL_FLAG_LETTERS = /^[PAIR]*$/;
function parseDaclSddl(sddl) {
  const text = sddl.trim();
  if (!text.startsWith("D:")) return void 0;
  const body = daclSection(text.slice(2));
  const first = body.indexOf("(");
  if (first === -1) {
    return DACL_FLAG_LETTERS.test(body.trim().toUpperCase()) ? [] : void 0;
  }
  const bodies = splitAces(body.slice(first));
  if (bodies === void 0) return void 0;
  const aces = [];
  for (const aceBody of bodies) {
    const fields = aceBody.split(";");
    if (fields.length < 6) return void 0;
    const type = fields[0].toUpperCase();
    const flags = aceFlags(fields[1].toUpperCase());
    if (fields[5] === "") return void 0;
    const trustee = resolveTrustee(fields[5]);
    aces.push({
      kind: type === "A" ? "allow" : type === "D" || type.endsWith("D") ? "deny" : "other",
      inheritOnly: flags.inheritOnly,
      inherited: flags.inherited,
      trustee: trustee.trustee,
      resolved: trustee.resolved,
      rights: parseRightsField(fields[2])
    });
  }
  return aces;
}
function parseOwnSid(whoamiUserOutput) {
  return /S-1-\d+(?:-\d+)+/.exec(whoamiUserOutput)?.[0];
}
function parseTokenSids(whoamiGroupsOutput) {
  const sids = /* @__PURE__ */ new Set();
  for (const match of whoamiGroupsOutput.matchAll(/S-1-\d+(?:-\d+)+/g)) sids.add(match[0]);
  return [...sids];
}
function hasTokenGroups(groupSids) {
  return groupSids.some((sid) => !sid.startsWith("S-1-16-"));
}
var SDDL_LINE = /^D:[PAIR]*(?:\(|$)/;
function pickSddlLine(saveFileText) {
  const lines = saveFileText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const last = lines[lines.length - 1];
  return last !== void 0 && SDDL_LINE.test(last) ? last : void 0;
}
function evaluateDacl(aces, userSid, tokenSids) {
  const token = tokenSids instanceof Set ? tokenSids : new Set(tokenSids);
  const rights = { writeDac: "undecided", writeOwner: "undecided" };
  let blocked;
  let unreadable = 0;
  for (const ace of aces) {
    if (ace.kind === "other") {
      unreadable += 1;
      continue;
    }
    if (ace.inheritOnly) continue;
    if (ace.rights === null || !ace.resolved) unreadable += 1;
    const applies = ace.kind === "deny" ? !ace.resolved || token.has(ace.trustee) : ace.resolved && ace.trustee === userSid;
    if (!applies) continue;
    for (const right of ["writeDac", "writeOwner"]) {
      if (rights[right] !== "undecided") continue;
      const carried = ace.rights === null ? ace.kind === "deny" : ace.rights[right];
      if (!carried) continue;
      if (ace.kind === "deny") {
        rights[right] = "denied";
        blocked ??= { sid: ace.trustee, overridable: ace.inherited || ace.resolved && ace.trustee === userSid };
      } else {
        rights[right] = "granted";
      }
    }
    if (rights.writeDac !== "undecided" && rights.writeOwner !== "undecided") break;
  }
  return {
    provisionable: rights.writeDac === "granted" && rights.writeOwner === "granted",
    rights,
    ...blocked === void 0 ? {} : { blocked },
    unreadable
  };
}
function planFolderAccess(verdict) {
  if (verdict.provisionable) return "provisionable";
  if (verdict.blocked !== void 0 && !verdict.blocked.overridable) return "refuse";
  return "grant";
}
function describeVerdict(verdict) {
  const parts = [
    `write-DAC ${verdict.rights.writeDac}`,
    `write-owner ${verdict.rights.writeOwner}`
  ];
  if (verdict.blocked !== void 0) parts.push(`deny for ${verdict.blocked.sid}`);
  if (verdict.unreadable > 0) parts.push(`${verdict.unreadable} unreadable ACE(s)`);
  return parts.join(", ");
}
var cachedIdentity = null;
var identityUnavailable = false;
var IDENTITY_UNAVAILABLE = "the signed-in Windows account could not be resolved (whoami /user, whoami /groups)";
function resolveIdentity(deadline) {
  if (cachedIdentity !== null) return { identity: cachedIdentity };
  if (identityUnavailable) return { detail: IDENTITY_UNAVAILABLE };
  const whoami = systemTool("whoami.exe");
  const ownBudget = budgetFor(deadline);
  if ("detail" in ownBudget) return { detail: ownBudget.detail };
  const own = runTool(whoami, ["/user", "/fo", "csv", "/nh"], ownBudget.budget);
  if (own.error !== void 0) {
    identityUnavailable = true;
    return { detail: IDENTITY_UNAVAILABLE };
  }
  const userSid = parseOwnSid(own.output);
  if (userSid === void 0) {
    identityUnavailable = true;
    return { detail: IDENTITY_UNAVAILABLE };
  }
  const groupBudget = budgetFor(deadline);
  if ("detail" in groupBudget) return { detail: groupBudget.detail };
  const groups = runTool(whoami, ["/groups", "/fo", "csv", "/nh"], groupBudget.budget);
  if (groups.error !== void 0) {
    identityUnavailable = true;
    return { detail: IDENTITY_UNAVAILABLE };
  }
  const groupSids = parseTokenSids(groups.output);
  if (!hasTokenGroups(groupSids)) {
    identityUnavailable = true;
    return { detail: IDENTITY_UNAVAILABLE };
  }
  const tokenSids = new Set(groupSids);
  tokenSids.add(userSid);
  cachedIdentity = { userSid, tokenSids };
  return { identity: cachedIdentity };
}
function readDacl(dir, budget) {
  let tempDir;
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-chat-manager-acl-"));
    const saveFile = path.join(tempDir, "dacl.txt");
    const result = runTool(systemTool("icacls.exe"), [dir, "/save", saveFile], budget);
    if (result.error !== void 0) return { error: `icacls /save failed to start: ${result.error}` };
    if (result.status !== 0) return { error: `icacls /save exited ${String(result.status)}: ${tail(result.output)}` };
    if (!fs.existsSync(saveFile)) return { error: `icacls /save wrote no file: ${tail(result.output)}` };
    const line = pickSddlLine(fs.readFileSync(saveFile, "utf16le"));
    if (line === void 0) return { error: `icacls /save wrote no DACL line: ${tail(result.output)}` };
    return { sddl: line };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (tempDir !== void 0) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
      }
    }
  }
}
function budgetFor(deadline) {
  if (deadline === void 0) return { budget: ICACLS_TIMEOUT_MS };
  const remaining = deadline - Date.now();
  if (remaining < MIN_SPAWN_BUDGET_MS) {
    return {
      detail: `the folder-access budget ran out before the check finished (${Math.max(0, Math.round(remaining))} ms left)`
    };
  }
  return { budget: Math.min(ICACLS_TIMEOUT_MS, remaining) };
}
function ensureWindowsFolderAccess(dir, options) {
  if (process.platform !== "win32") return { ok: true, changed: false, skipped: true };
  const deadline = options?.deadline;
  const fail = (detail) => ({ ok: false, changed: false, skipped: false, detail });
  try {
    if (!fs.existsSync(dir)) return fail(`chat folder is missing: ${dir}`);
    const resolved = resolveIdentity(deadline);
    if ("detail" in resolved) return fail(resolved.detail);
    const identity = resolved.identity;
    const budget = budgetFor(deadline);
    if ("detail" in budget) return fail(budget.detail);
    const before = readDacl(dir, budget.budget);
    if ("error" in before) return fail(`the folder's ACL could not be read: ${before.error}`);
    const aces = parseDaclSddl(before.sddl);
    if (aces === void 0) {
      return fail(`the folder's DACL is not a readable SDDL DACL: ${before.sddl.slice(0, 200)}`);
    }
    const verdict = evaluateDacl(aces, identity.userSid, identity.tokenSids);
    const plan = planFolderAccess(verdict);
    if (plan === "provisionable") return { ok: true, changed: false, skipped: false };
    if (plan === "refuse") {
      const blocked = verdict.blocked;
      return fail(
        `a deny ACE for ${blocked?.sid ?? "another principal"} blocks full control for ${identity.userSid} and a grant cannot outrank it (${describeVerdict(verdict)}); fix the folder permissions for that principal, or move the chat root`
      );
    }
    const grantBudget = budgetFor(deadline);
    if ("detail" in grantBudget) return fail(grantBudget.detail);
    const granted = runTool(systemTool("icacls.exe"), [dir, "/grant", USER_FULL_CONTROL(identity.userSid)], grantBudget.budget);
    if (granted.error !== void 0) return fail(`icacls /grant failed to start: ${granted.error}`);
    if (granted.status !== 0) {
      return fail(`icacls /grant exited ${String(granted.status)}: ${tail(granted.output)}`);
    }
    const rereadBudget = budgetFor(deadline);
    if ("detail" in rereadBudget) {
      return {
        ok: false,
        changed: true,
        skipped: false,
        detail: `full control for ${identity.userSid} was granted, but the read-back did not run: ${rereadBudget.detail}`
      };
    }
    const after = readDacl(dir, rereadBudget.budget);
    if ("error" in after) {
      return {
        ok: false,
        changed: true,
        skipped: false,
        detail: `full control for ${identity.userSid} was granted, but the read-back failed: ${after.error}`
      };
    }
    const afterAces = parseDaclSddl(after.sddl);
    if (afterAces === void 0) {
      return {
        ok: false,
        changed: true,
        skipped: false,
        detail: `full control for ${identity.userSid} was granted, but the read-back is not a readable DACL: ${after.sddl.slice(0, 200)}`
      };
    }
    const afterVerdict = evaluateDacl(afterAces, identity.userSid, identity.tokenSids);
    if (afterVerdict.provisionable) return { ok: true, changed: true, skipped: false };
    return {
      ok: false,
      changed: true,
      skipped: false,
      detail: `icacls /grant exited 0 but ${identity.userSid} still does not hold full control (${describeVerdict(afterVerdict)})`
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// src/shared/prompt-section.ts
var SUBAGENT_ORIGIN = "subagent";
function chatPromptTrigger(message, header, chatRoot) {
  if (header?.origin === SUBAGENT_ORIGIN) return void 0;
  if (message?.source?.kind !== "user") return void 0;
  const sessionCwd = header?.cwd;
  if (sessionCwd === void 0 || !isUnderChatRoot(sessionCwd, chatRoot)) return void 0;
  const text = (message.content ?? []).filter((block) => block?.type === "text").map((block) => block.text ?? "").join(" ").trim();
  if (text === "") return void 0;
  return { dateFolder: sessionCwd, text };
}
function chatFolderState(folder, pending) {
  if (folder !== void 0) return { kind: "folder", folder };
  return pending ? { kind: "pending" } : { kind: "none" };
}
function chatFolderStateFor(session, folderOf, isPending) {
  if (session.header?.origin === SUBAGENT_ORIGIN) {
    const parentId = session.header.parentSession;
    return chatFolderState(parentId === void 0 ? void 0 : folderOf(parentId), false);
  }
  return chatFolderState(folderOf(session.id), isPending(session.id));
}
function chatFolderSectionText(context, stateOf) {
  const session = context.agent?.session;
  const id = session?.id ?? context.agent?.id;
  if (id === void 0) return "";
  const state = stateOf(session?.header === void 0 ? { id } : { id, header: session.header });
  if (state.kind === "none") return "";
  if (state.kind === "pending") {
    return [
      "You are working in a chat session. This chat's own folder is created from the first message of the conversation, and it does not exist yet.",
      "Do not create files or directories in the working directory itself: list the working directory, wait briefly and list it again, and put your files inside the chat folder once it appears.",
      "If it is still not there, do the rest of this step and say that the folder was not ready."
    ].join("\n");
  }
  return [
    "You are working in a chat session. Do not read or write files directly in the chat working directory.",
    `Put all file input/output for this chat into the chat folder: ${state.folder}`,
    // Never claim the chat folder IS the workspace root: the session's own
    // workspace root stays the date folder (`ensure-date-folder` registers it
    // and nothing repoints the cwd), so a relative path does not resolve inside
    // the chat folder. Asking for absolute paths is true and gets the files
    // there; asserting a root the folder does not own would send the model's
    // relative writes back into the date folder — the dispersion this section
    // exists to prevent.
    "Give every file in this chat an absolute path under the chat folder: relative paths resolve against the session working directory (the dated parent folder), not against the chat folder."
  ].join("\n");
}

// src/index.ts
var name = "dsh-chat-manager";
var POSIX_LIVE_DELETE_REFUSAL = "the Host still holds this session live and its POSIX write lease (session.lock) lives in the session directory, so removing it would forfeit cross-process write exclusion: restart the Host and retry.";
function errorMessage(err) {
  return err instanceof Error && err.message ? err.message : String(err);
}
var inject = [
  "webServer",
  "workspaceRegistry",
  "storageDomain",
  "sessionPersistence",
  "sessionQuery",
  "systemPrompt",
  "llm",
  "agentDefaultModel"
];
var CHAT_ROOT_NAME = "DSH";
var CHAT_ROOT_OVERRIDE_ENV = "DSH_CHAT_MANAGER_ROOT";
var CHAT_FOLDER_SWEEP_BUDGET_MS = 3e4;
var CHAT_FOLDER_ROUTE_BUDGET_MS = 1e4;
var DOCUMENTS_LOOKUP_TIMEOUT_MS = 1e4;
function apply(ctx) {
  const chatState = {
    documentsRoot: null,
    root: null,
    folders: /* @__PURE__ */ new Map(),
    hostStartedAt: Date.now() - Math.round(process.uptime() * 1e3)
  };
  const pendingSlugFor = /* @__PURE__ */ new Set();
  function chatRootOverride() {
    const raw = process.env[CHAT_ROOT_OVERRIDE_ENV];
    if (raw === void 0 || raw.trim() === "") return null;
    const value = raw.trim();
    if (!path2.isAbsolute(value)) {
      console.warn(`[dsh-chat-manager] ignoring relative ${CHAT_ROOT_OVERRIDE_ENV}: ${value}`);
      return null;
    }
    return path2.normalize(value);
  }
  function windowsPowerShell() {
    const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
    return path2.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }
  function resolveDocuments() {
    if (chatState.documentsRoot) return chatState.documentsRoot;
    if (process.platform === "win32") {
      const r = spawnSync2(windowsPowerShell(), ["-NoProfile", "-Command", '[Environment]::GetFolderPath("MyDocuments")'], {
        encoding: "utf8",
        windowsHide: true,
        timeout: DOCUMENTS_LOOKUP_TIMEOUT_MS
      });
      const out = (r.stdout || "").trim();
      if (r.status === 0 && out) {
        chatState.documentsRoot = out;
        return out;
      }
    } else if (process.platform === "linux") {
      const r = spawnSync2("xdg-user-dir", ["DOCUMENTS"], { encoding: "utf8", timeout: DOCUMENTS_LOOKUP_TIMEOUT_MS });
      const out = (r.stdout || "").trim();
      if (r.status === 0 && out && path2.isAbsolute(out) && path2.normalize(out) !== path2.normalize(os2.homedir())) {
        chatState.documentsRoot = out;
        return out;
      }
    }
    chatState.documentsRoot = path2.join(os2.homedir(), "Documents");
    console.warn(`[dsh-chat-manager] the platform named no Documents folder; using ${chatState.documentsRoot}`);
    return chatState.documentsRoot;
  }
  function todayString(now = /* @__PURE__ */ new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function registryFile(dateFolder) {
    return path2.join(dateFolder, ".dsh-chat.json");
  }
  function readRegistryFile(dateFolder) {
    const file = registryFile(dateFolder);
    let raw;
    try {
      raw = fs2.readFileSync(file, "utf8");
    } catch (err) {
      const code = err.code;
      if (code === "ENOENT") return { status: "absent" };
      return { status: "unreadable", detail: errorMessage(err) };
    }
    try {
      const parsed = JSON.parse(raw);
      const sessions = parsed && typeof parsed.sessions === "object" && parsed.sessions !== null ? parsed.sessions : {};
      return { status: "ok", sessions };
    } catch {
      return { status: "corrupt" };
    }
  }
  function readRegistry(dateFolder) {
    const read = readRegistryFile(dateFolder);
    return read.status === "ok" ? read.sessions : {};
  }
  function registryStamp(file) {
    try {
      const stat = fs2.statSync(file);
      return `${stat.size}:${stat.mtimeMs}`;
    } catch {
      return "absent";
    }
  }
  function writeRegistryAtomically(file, sessions) {
    const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    try {
      fs2.writeFileSync(temp, JSON.stringify({ sessions }, null, 2), "utf8");
      fs2.renameSync(temp, file);
    } catch (err) {
      try {
        fs2.rmSync(temp, { force: true });
      } catch {
      }
      console.warn("[dsh-chat-manager] registry write failed:", err);
    }
  }
  const REGISTRY_TEMP_STALE_MS = 6e4;
  function sweepRegistryTemps(dateFolder) {
    let names;
    try {
      names = fs2.readdirSync(dateFolder);
    } catch {
      return;
    }
    for (const name2 of names) {
      if (!/^\.dsh-chat\.json\.tmp-/.test(name2)) continue;
      const file = path2.join(dateFolder, name2);
      try {
        if (Date.now() - fs2.statSync(file).mtimeMs < REGISTRY_TEMP_STALE_MS) continue;
        fs2.rmSync(file, { force: true });
        console.warn(`[dsh-chat-manager] removed a leftover registry temp file: ${file}`);
      } catch {
      }
    }
  }
  function editRegistry(dateFolder, edit) {
    const file = registryFile(dateFolder);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const stamp = registryStamp(file);
      const read = readRegistryFile(dateFolder);
      if (read.status === "unreadable") {
        console.warn(`[dsh-chat-manager] chat registry could not be read (${read.detail}); leaving it untouched: ${file}`);
        return;
      }
      let sessions = {};
      if (read.status === "ok") {
        sessions = read.sessions;
      } else if (read.status === "corrupt") {
        const quarantine = `${file}.corrupt-${Date.now()}`;
        try {
          fs2.renameSync(file, quarantine);
          console.warn(`[dsh-chat-manager] chat registry was unreadable; kept it as ${quarantine} and rebuilding`);
        } catch (err) {
          console.warn("[dsh-chat-manager] chat registry was unreadable and could not be set aside; leaving it untouched:", errorMessage(err));
          return;
        }
      }
      edit(sessions);
      if (registryStamp(file) !== stamp) continue;
      writeRegistryAtomically(file, sessions);
      return;
    }
    console.warn("[dsh-chat-manager] chat registry kept changing while writing; gave up after 3 attempts:", file);
  }
  function registeredFolder(folder) {
    for (const entry of chatState.folders.values()) {
      if (normalizePathLower(entry.folder) === normalizePathLower(folder)) return true;
    }
    return false;
  }
  function folderIsRegistered(folder, diskSessions) {
    if (registeredFolder(folder)) return true;
    for (const entry of Object.values(diskSessions)) {
      if (entry && typeof entry.folder === "string" && normalizePathLower(entry.folder) === normalizePathLower(folder)) return true;
    }
    return false;
  }
  function scanChatFolders() {
    const dateFolders = [];
    if (!chatState.root || !fs2.existsSync(chatState.root)) return dateFolders;
    let names;
    try {
      names = fs2.readdirSync(chatState.root, { withFileTypes: true });
    } catch {
      return dateFolders;
    }
    for (const d of names) {
      if (!d.isDirectory()) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue;
      const dateFolder = path2.join(chatState.root, d.name);
      dateFolders.push(dateFolder);
      sweepRegistryTemps(dateFolder);
      const sessions = readRegistry(dateFolder);
      for (const [sid, entry] of Object.entries(sessions)) {
        if (entry && typeof entry.slug === "string" && typeof entry.folder === "string" && !chatState.folders.has(sid)) {
          chatState.folders.set(sid, { slug: entry.slug, folder: entry.folder });
        }
      }
    }
    return dateFolders;
  }
  function uniqueSlug(dateFolder, slug) {
    const words = slug.split("-");
    let preexisting;
    try {
      preexisting = new Set(fs2.readdirSync(dateFolder));
    } catch {
      preexisting = /* @__PURE__ */ new Set();
    }
    for (let n = 0; ; n += 1) {
      const candidate = collisionSlug(words, n);
      const folder = path2.join(dateFolder, candidate);
      if (folderIsRegistered(folder, readRegistry(dateFolder))) continue;
      if (preexisting.has(candidate)) return { slug: candidate, folder };
      try {
        fs2.mkdirSync(folder);
        return { slug: candidate, folder };
      } catch (err) {
        if (err.code === "EEXIST") continue;
        throw err;
      }
    }
  }
  async function generateSlug(text) {
    const selection = ctx.agentDefaultModel.currentSelection();
    if (selection && selection.provider && selection.model) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15e3);
      try {
        const stream = ctx.llm.stream({
          provider: selection.provider,
          model: selection.model,
          ...selection.reasoningEffort !== void 0 ? { reasoningEffort: selection.reasoningEffort } : {},
          purpose: "session-title",
          system: "You name a chat folder. Return ONLY 2-4 lowercase English words separated by hyphens, with no quotes, punctuation, or explanation.",
          messages: [{
            id: crypto.randomUUID(),
            role: "user",
            content: [{ type: "text", text: `Name a chat folder from this first message:
${String(text).slice(0, 800)}` }],
            // Producer-owned source kind, the shape 0.2.x writes for its own
            // helper calls (`session-title-llm` writes `{ kind:
            // 'dsh-session-title-llm' }`). `{ kind: 'plugin', plugin: … }` is the
            // released V2/V3 wrapper, which the format migration has to rewrite.
            source: { kind: "dsh-chat-manager" }
          }],
          temperature: 0.2,
          maxTokens: 24,
          signal: controller.signal
        });
        let out = "";
        for await (const chunk of stream) {
          if (chunk.type === "text-delta") out += chunk.text ?? "";
          else if (chunk.type === "finish") {
            if (chunk.reason && chunk.reason.kind === "error") throw new Error("slug model call failed");
          }
        }
        return cleanSlug(out);
      } catch (err) {
        console.warn("[dsh-chat-manager] LLM slug failed, using local fallback:", errorMessage(err));
      } finally {
        clearTimeout(timer);
      }
    }
    return cleanSlug(text);
  }
  function startChatFolderSlug(sessionId, dateFolder, text) {
    if (chatState.folders.has(sessionId) || pendingSlugFor.has(sessionId)) return;
    pendingSlugFor.add(sessionId);
    generateSlug(text).then((slug) => {
      fs2.mkdirSync(dateFolder, { recursive: true });
      return uniqueSlug(dateFolder, slug);
    }).then(({ slug, folder }) => {
      chatState.folders.set(sessionId, { slug, folder });
      editRegistry(dateFolder, (sessions) => {
        sessions[sessionId] = { slug, folder };
      });
      console.log(`[dsh-chat-manager] chat folder ready: ${folder}`);
    }).catch((err) => console.warn("[dsh-chat-manager] slug folder setup failed:", err)).finally(() => {
      pendingSlugFor.delete(sessionId);
    });
  }
  ctx.on("agent/inbox/inserted", (payload) => {
    const session = payload?.agent?.session;
    const sessionId = session?.id ?? payload?.agent?.id;
    if (sessionId === void 0) return;
    const trigger = chatPromptTrigger(payload?.message, session?.header, chatState.root);
    if (!trigger) return;
    startChatFolderSlug(sessionId, trigger.dateFolder, trigger.text);
  });
  ctx.on("session/event", (session, event) => {
    if (event.type !== "user/message") return;
    const trigger = chatPromptTrigger(event.data, session.header, chatState.root);
    if (!trigger) return;
    startChatFolderSlug(session.id, trigger.dateFolder, trigger.text);
  });
  ctx.effect(() => ctx.systemPrompt.section({
    name: "dsh-chat-manager/chat-folder",
    order: 150,
    text: (context) => chatFolderSectionText(context, (session) => chatFolderStateFor(
      session,
      (id) => chatState.folders.get(id)?.folder,
      (id) => pendingSlugFor.has(id)
    ))
  }), "dsh-chat-manager: system prompt section");
  function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body)
    });
    res.end(body);
  }
  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  }
  const workspaceDomain = () => ctx.storageDomain.get("workspace");
  async function removeFromArchive(sid) {
    await ctx.workspaceRegistry.unarchiveSession(sid);
  }
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/chat-manager/state",
    handler: async (req, res) => {
      try {
        const domain = workspaceDomain();
        const archived = domain ? [...domain.global.get().archivedSessionIds ?? []] : [];
        const workspaceTitleOfSession = /* @__PURE__ */ new Map();
        for (const workspace of ctx.workspaceRegistry.list()) {
          for (const sessionId of workspace.sessionIds) {
            if (!workspaceTitleOfSession.has(sessionId)) workspaceTitleOfSession.set(sessionId, workspace.title);
          }
        }
        let archivedRows = archived.map((sessionId) => ({
          sessionId,
          title: "",
          workspaceTitle: workspaceTitleOfSession.get(sessionId) ?? "",
          updatedAt: 0
        }));
        try {
          const results = await ctx.sessionQuery.readTitleSnapshots(archived);
          const titleOfRow = new Map(archivedRows.map((row) => [row.sessionId, row]));
          for (const r of results) {
            const row = titleOfRow.get(r.sessionId);
            if (row === void 0) continue;
            const value = r.status === "fulfilled" ? r.value : void 0;
            row.title = value && value.title && value.title.title || "";
            row.updatedAt = (value && value.title && value.title.updatedAt) ?? (value && value.session ? value.session.createdAt ?? 0 : 0);
          }
        } catch (err) {
          console.warn("[dsh-chat-manager] title snapshot read failed:", errorMessage(err));
        }
        const folders = {};
        for (const [sid, entry] of chatState.folders) folders[sid] = entry;
        sendJson(res, 200, {
          documentsRoot: chatState.documentsRoot,
          dshRoot: chatState.root,
          folders,
          archived: archivedRows,
          // Host identity, not chat state: a probe (or a user) can tell one Host
          // process from the next one, which is what makes "survives a Host
          // restart" an assertable claim instead of a procedure note.
          hostStartedAt: chatState.hostStartedAt
        });
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) });
      }
    }
  }), "dsh-chat-manager: state route");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/chat-manager/ensure-date-folder",
    handler: async (req, res) => {
      try {
        await readBody(req);
        if (chatState.root === null || chatState.root.length === 0) {
          return sendJson(res, 500, { error: "chat root unavailable" });
        }
        const dateFolder = path2.join(chatState.root, todayString());
        fs2.mkdirSync(dateFolder, { recursive: true });
        const folderAccess = ensureWindowsFolderAccess(dateFolder, {
          deadline: Date.now() + CHAT_FOLDER_ROUTE_BUDGET_MS
        });
        if (!folderAccess.ok) {
          console.warn(`[dsh-chat-manager] chat folder not provisionable: ${dateFolder} (${folderAccess.detail ?? "unknown"})`);
        }
        let workspace = await ctx.workspaceRegistry.resolveByPath(dateFolder);
        if (workspace === void 0) workspace = await ctx.workspaceRegistry.create(dateFolder);
        sendJson(res, 200, { workspaceId: workspace.id, dateFolder, folderAccess });
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) });
      }
    }
  }), "dsh-chat-manager: ensure-date-folder route");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/chat-manager/search-chats",
    handler: async (req, res) => {
      try {
        const body = await readBody(req);
        const query = String(body.query ?? "").trim().toLowerCase();
        if (!query) return sendJson(res, 200, { items: [] });
        const domain = workspaceDomain();
        const archived = new Set(domain ? domain.global.get().archivedSessionIds ?? [] : []);
        const records = await ctx.sessionQuery.listSessions();
        const chatRecords = records.filter(
          (r) => r.header && r.header.cwd && isUnderChatRoot(r.header.cwd, chatState.root) && r.header.origin !== SUBAGENT_ORIGIN && !archived.has(r.header.id)
        );
        const byId = new Map(chatRecords.map((r) => [r.header.id, r]));
        const ids = [...byId.keys()];
        const titleOf = /* @__PURE__ */ new Map();
        try {
          const results = await ctx.sessionQuery.readTitleSnapshots(ids);
          for (const r of results) {
            if (r.status !== "fulfilled") continue;
            titleOf.set(r.sessionId, r.value && r.value.title && r.value.title.title || "");
          }
        } catch (err) {
          console.warn("[dsh-chat-manager] title read failed:", errorMessage(err));
        }
        const matched = /* @__PURE__ */ new Set();
        for (const [sid, title] of titleOf) {
          if (title.toLowerCase().includes(query)) matched.add(sid);
        }
        try {
          const page = await ctx.sessionQuery.searchSessions({ query, limit: 20 });
          for (const hit of page.items ?? []) {
            const sid = hit.header ? hit.header.id : hit.sessionId;
            if (sid != null && byId.has(sid)) matched.add(sid);
          }
        } catch (err) {
          console.warn("[dsh-chat-manager] content search failed:", errorMessage(err));
        }
        const items = [...matched].map((sid) => ({ sessionId: sid, title: titleOf.get(sid) || "" }));
        sendJson(res, 200, { items });
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) });
      }
    }
  }), "dsh-chat-manager: search route");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/chat-manager/delete-session",
    handler: async (req, res) => {
      try {
        const body = await readBody(req);
        const sid = String(body.sessionId ?? "");
        if (!sid) return sendJson(res, 400, { error: "missing sessionId" });
        try {
          const snapshots = await ctx.sessionPersistence.list();
          const snapshot = snapshots.find(
            (entry2) => entry2.header?.id === sid
          ) ?? await ctx.sessionPersistence.stat(sid);
          const live = ctx.get("sessions")?.get?.(sid);
          const liveWarning = " the Host still holds it live, so a later flush could write it back: restart the Host and retry.";
          if (snapshot === void 0) {
            if (live !== void 0) {
              throw new Error(`the Host names no stored log for ${sid} yet${liveWarning}`);
            }
            console.warn(`[dsh-chat-manager] delete-session: the Host reports no stored session for ${sid}; removing accounting only`);
          } else {
            if (typeof ctx.sessionPersistence.locate !== "function") {
              throw new Error("this Host build exposes no sessionPersistence.locate: the session log cannot be removed");
            }
            const located = ctx.sessionPersistence.locate(snapshot.header);
            const artifact = located?.path;
            if (typeof artifact !== "string" || artifact === "") {
              throw new Error(`the Host named no session log for ${sid}`);
            }
            const dir = path2.dirname(artifact);
            const ownsDir = path2.basename(dir) === sid;
            const removal = planSessionArtifactRemoval({
              platform: process.platform,
              live: live !== void 0,
              artifactInSessionDirectory: ownsDir
            });
            if (removal === "refuse-live-posix") throw new Error(POSIX_LIVE_DELETE_REFUSAL);
            try {
              await ctx.sessionPersistence.flush();
            } catch (err) {
              console.warn("[dsh-chat-manager] pre-delete flush failed:", errorMessage(err));
            }
            if (removal === "remove-directory" && fs2.existsSync(dir)) {
              fs2.rmSync(dir, { recursive: true, force: true });
              if (fs2.existsSync(dir)) throw new Error(`session log survived removal: ${dir}`);
            } else if (fs2.existsSync(artifact)) {
              fs2.rmSync(artifact, { recursive: true, force: true });
              if (fs2.existsSync(artifact)) throw new Error(`session log survived removal: ${artifact}`);
              const siblings = fs2.readdirSync(dir);
              if (siblings.length > 0) {
                throw new Error(`session log left sibling artifacts behind: ${siblings.join(", ")}`);
              }
            } else {
              throw new Error(
                `the Host reported a stored session but no log exists for ${sid}` + (live === void 0 ? "" : `;${liveWarning}`)
              );
            }
          }
        } catch (err) {
          console.warn("[dsh-chat-manager] artifact removal failed:", errorMessage(err));
          throw new Error(`failed to remove session log: ${errorMessage(err)}`);
        }
        for (const workspace of ctx.workspaceRegistry.list()) {
          if (workspace.sessionIds.includes(sid)) {
            await workspace.detachSession(sid);
          }
        }
        try {
          await ctx.workspaceRegistry.unpinSession(sid);
        } catch (err) {
          console.warn("[dsh-chat-manager] pin cleanup failed:", errorMessage(err));
        }
        const entry = chatState.folders.get(sid);
        if (entry) {
          chatState.folders.delete(sid);
          editRegistry(path2.dirname(entry.folder), (sessions) => {
            delete sessions[sid];
          });
        }
        try {
          const cacheDomain = ctx.storageDomain.get("session_projcache");
          const cacheTable = cacheDomain ? cacheDomain.table("sessions") : void 0;
          if (cacheTable !== void 0) await cacheTable.delete(sid);
        } catch (err) {
          console.warn("[dsh-chat-manager] projection cache cleanup failed:", errorMessage(err));
        }
        await removeFromArchive(sid);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) });
      }
    }
  }), "dsh-chat-manager: delete route");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/chat-manager/restore-session",
    handler: async (req, res) => {
      try {
        const body = await readBody(req);
        const sid = String(body.sessionId ?? "");
        if (!sid) return sendJson(res, 400, { error: "missing sessionId" });
        await removeFromArchive(sid);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { error: errorMessage(err) });
      }
    }
  }), "dsh-chat-manager: restore route");
  try {
    const override = chatRootOverride();
    if (override !== null) {
      chatState.root = override;
    } else {
      chatState.documentsRoot = resolveDocuments();
      chatState.root = path2.join(chatState.documentsRoot, CHAT_ROOT_NAME);
    }
    const dateFolders = scanChatFolders();
    console.log(`[dsh-chat-manager] chat root: ${chatState.root}`);
    if (process.platform === "win32" && dateFolders.length > 0) {
      const deadline = Date.now() + CHAT_FOLDER_SWEEP_BUDGET_MS;
      let checked = 0;
      let repaired = 0;
      let failed = 0;
      let exhausted = false;
      for (const dateFolder of dateFolders) {
        if (Date.now() > deadline) {
          exhausted = true;
          break;
        }
        checked += 1;
        const access = ensureWindowsFolderAccess(dateFolder, { deadline });
        if (!access.ok) {
          failed += 1;
          console.warn(`[dsh-chat-manager] chat folder not provisionable: ${dateFolder} (${access.detail ?? "unknown"})`);
        } else if (access.changed) {
          repaired += 1;
        }
      }
      console.log(
        `[dsh-chat-manager] chat folder access: ${checked}/${dateFolders.length} checked, ${repaired} made provisionable, ${failed} failed${exhausted ? " (sweep budget exhausted)" : ""}`
      );
    }
  } catch (err) {
    console.warn("[dsh-chat-manager] boot scan failed:", err);
  }
}
export {
  POSIX_LIVE_DELETE_REFUSAL,
  SUBAGENT_ORIGIN,
  apply,
  chatFolderSectionText,
  chatFolderState,
  chatFolderStateFor,
  chatPromptTrigger,
  ensureWindowsFolderAccess,
  evaluateDacl,
  hasTokenGroups,
  inject,
  name,
  parseDaclSddl,
  parseOwnSid,
  parseTokenSids,
  pickSddlLine,
  planFolderAccess,
  planSessionArtifactRemoval
};
