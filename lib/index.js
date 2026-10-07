// src/index.ts
import fs2 from "node:fs";
import path2 from "node:path";
import os from "node:os";
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
import path from "node:path";
import { spawnSync } from "node:child_process";
var ICACLS_TIMEOUT_MS = 1e4;
var USER_FULL_CONTROL = (principal) => `${principal}:(F)`;
function icaclsPath() {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  return path.join(systemRoot, "System32", "icacls.exe");
}
function currentPrincipal() {
  const user = process.env.USERNAME;
  if (user === void 0 || user.length === 0) return void 0;
  const domain = process.env.USERDOMAIN;
  return domain === void 0 || domain.length === 0 ? user : `${domain}\\${user}`;
}
var ACE_TAIL = /:(\([A-Za-z]+\))+/g;
var BLOCKING_DENY_RIGHTS = ["(F)", "WO", "WD"];
function readPrincipalControl(output, principal) {
  const wanted = principal.toLowerCase();
  let full = false;
  let denied = false;
  for (const line of output.split(/\r?\n/)) {
    for (const ace of line.matchAll(ACE_TAIL)) {
      const before = line.slice(0, ace.index).replace(/\s+/g, " ").trim().toLowerCase();
      if (before !== wanted && !before.endsWith(` ${wanted}`)) continue;
      const blob = ace[0];
      if (blob.includes("(IO)")) continue;
      if (blob.includes("(DENY)")) {
        if (BLOCKING_DENY_RIGHTS.some((right) => blob.includes(right))) denied = true;
      } else if (blob.includes("(F)")) {
        full = true;
      }
    }
  }
  if (denied) return "denied";
  return full ? "full-control" : "absent";
}
function runIcacls(args) {
  const result = spawnSync(icaclsPath(), args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: ICACLS_TIMEOUT_MS
  });
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
function ensureWindowsFolderAccess(dir) {
  if (process.platform !== "win32") return { ok: true, changed: false, skipped: true };
  try {
    if (!fs.existsSync(dir)) {
      return { ok: false, changed: false, skipped: false, detail: `chat folder is missing: ${dir}` };
    }
    const principal = currentPrincipal();
    if (principal === void 0) {
      return { ok: false, changed: false, skipped: false, detail: "the environment names no Windows account (USERNAME)" };
    }
    const before = runIcacls([dir]);
    if (before.error !== void 0) {
      return { ok: false, changed: false, skipped: false, detail: `icacls failed to start: ${before.error}` };
    }
    const control = readPrincipalControl(before.output, principal);
    if (control === "full-control") return { ok: true, changed: false, skipped: false };
    if (control === "denied") {
      return {
        ok: false,
        changed: false,
        skipped: false,
        detail: `a deny ACE names ${principal}, so full control cannot be granted here: ${tail(before.output)}`
      };
    }
    const granted = runIcacls([dir, "/grant", USER_FULL_CONTROL(principal)]);
    if (granted.error !== void 0) {
      return { ok: false, changed: false, skipped: false, detail: `icacls failed to start: ${granted.error}` };
    }
    if (granted.status !== 0) {
      return { ok: false, changed: false, skipped: false, detail: `icacls /grant exited ${String(granted.status)}: ${tail(granted.output)}` };
    }
    const after = runIcacls([dir]);
    const confirmed = after.error === void 0 ? readPrincipalControl(after.output, principal) : "absent";
    if (confirmed === "full-control") return { ok: true, changed: true, skipped: false };
    return {
      ok: false,
      changed: true,
      skipped: false,
      detail: `icacls /grant exited 0 but the read-back does not show full control for ${principal} (${confirmed}): ${tail(after.error === void 0 ? after.output : after.error)}`
    };
  } catch (err) {
    return {
      ok: false,
      changed: false,
      skipped: false,
      detail: err instanceof Error ? err.message : String(err)
    };
  }
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
  function resolveDocuments() {
    if (chatState.documentsRoot) return chatState.documentsRoot;
    if (process.platform === "win32") {
      const r = spawnSync2("powershell", ["-NoProfile", "-Command", '[Environment]::GetFolderPath("MyDocuments")'], { encoding: "utf8" });
      const out = (r.stdout || "").trim();
      if (r.status === 0 && out) {
        chatState.documentsRoot = out;
        return out;
      }
    } else if (process.platform === "linux") {
      const r = spawnSync2("xdg-user-dir", ["DOCUMENTS"], { encoding: "utf8" });
      const out = (r.stdout || "").trim();
      if (r.status === 0 && out && path2.isAbsolute(out) && path2.normalize(out) !== path2.normalize(os.homedir())) {
        chatState.documentsRoot = out;
        return out;
      }
    }
    chatState.documentsRoot = path2.join(os.homedir(), "Documents");
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
  function readRegistry(dateFolder) {
    try {
      const raw = JSON.parse(fs2.readFileSync(registryFile(dateFolder), "utf8"));
      const sessions = raw && typeof raw.sessions === "object" && raw.sessions !== null ? raw.sessions : {};
      return sessions;
    } catch {
      return {};
    }
  }
  function writeRegistry(dateFolder) {
    const sessions = {};
    for (const [sid, entry] of chatState.folders) {
      if (normalizePathLower(path2.dirname(entry.folder)) === normalizePathLower(dateFolder)) sessions[sid] = entry;
    }
    try {
      fs2.writeFileSync(registryFile(dateFolder), JSON.stringify({ sessions }, null, 2), "utf8");
    } catch (err) {
      console.warn("[dsh-chat-manager] registry write failed:", err);
    }
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
    let n = 0;
    for (; ; ) {
      const candidate = collisionSlug(words, n);
      const folder = path2.join(dateFolder, candidate);
      if (!fs2.existsSync(folder)) return { slug: candidate, folder };
      let taken = false;
      for (const entry of chatState.folders.values()) {
        if (normalizePathLower(entry.folder) === normalizePathLower(folder)) {
          taken = true;
          break;
        }
      }
      if (!taken) return { slug: candidate, folder };
      n += 1;
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
            source: { kind: "plugin", plugin: "dsh-chat-manager" }
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
  ctx.on("session/event", (session, event) => {
    if (event.type !== "user/message") return;
    const data = event.data;
    if (!data || data.source == null || data.source.kind !== "user") return;
    const header = session.header;
    if (!header || header.cwd === void 0 || !isUnderChatRoot(header.cwd, chatState.root)) return;
    if (chatState.folders.has(session.id) || pendingSlugFor.has(session.id)) return;
    const text = (Array.isArray(data.content) ? data.content : []).filter((b) => b && b.type === "text").map((b) => b.text ?? "").join(" ").trim();
    if (!text) return;
    const dateFolder = header.cwd;
    pendingSlugFor.add(session.id);
    generateSlug(text).then((slug) => uniqueSlug(dateFolder, slug)).then(({ slug, folder }) => {
      try {
        fs2.mkdirSync(folder, { recursive: true });
      } catch (err) {
        console.warn("[dsh-chat-manager] slug folder mkdir failed:", err);
        return;
      }
      chatState.folders.set(session.id, { slug, folder });
      writeRegistry(dateFolder);
      console.log(`[dsh-chat-manager] chat folder ready: ${folder}`);
    }).catch((err) => console.warn("[dsh-chat-manager] slug folder setup failed:", err)).finally(() => {
      pendingSlugFor.delete(session.id);
    });
  });
  ctx.effect(() => ctx.systemPrompt.section({
    name: "dsh-chat-manager/chat-folder",
    order: 150,
    text: (context) => {
      const sid = context.agent != null ? context.agent.sessionId : context.sessionId;
      if (sid == null) return "";
      const entry = chatState.folders.get(sid);
      if (!entry) return "";
      return [
        "You are working in a chat session. Do not read or write files directly in the chat working directory.",
        `Put all file input/output for this chat into the chat folder: ${entry.folder}`,
        "The chat folder is the workspace root for every file operation in this session (relative paths resolve against it)."
      ].join("\n");
    }
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
        let archivedRows = [];
        try {
          const results = await ctx.sessionQuery.readTitleSnapshots(archived);
          archivedRows = results.map((r) => {
            const value = r.status === "fulfilled" ? r.value : void 0;
            return {
              sessionId: r.sessionId,
              title: value && value.title && value.title.title || "",
              workspaceTitle: workspaceTitleOfSession.get(r.sessionId) ?? "",
              updatedAt: (value && value.title && value.title.updatedAt) ?? (value && value.session ? value.session.createdAt ?? 0 : 0)
            };
          });
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
        const folderAccess = ensureWindowsFolderAccess(dateFolder);
        if (!folderAccess.ok) {
          console.warn(`[dsh-chat-manager] chat folder not provisionable: ${dateFolder} (${folderAccess.detail ?? "unknown"})`);
        } else if (folderAccess.detail !== void 0) {
          console.warn(`[dsh-chat-manager] chat folder access unconfirmed: ${dateFolder} (${folderAccess.detail})`);
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
          (r) => r.header && r.header.cwd && isUnderChatRoot(r.header.cwd, chatState.root) && r.header.origin !== "subagent" && !archived.has(r.header.id)
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
          writeRegistry(path2.dirname(entry.folder));
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
        const access = ensureWindowsFolderAccess(dateFolder);
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
  apply,
  inject,
  name,
  planSessionArtifactRemoval,
  readPrincipalControl
};
