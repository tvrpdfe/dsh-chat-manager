// src/index.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

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

// src/index.ts
var name = "dsh-chat-manager";
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
function apply(ctx) {
  const chatState = {
    documentsRoot: null,
    root: null,
    folders: /* @__PURE__ */ new Map(),
    hostStartedAt: Date.now() - Math.round(process.uptime() * 1e3)
  };
  const pendingSlugFor = /* @__PURE__ */ new Set();
  function resolveDocuments() {
    if (chatState.documentsRoot) return chatState.documentsRoot;
    if (process.platform === "win32") {
      const r = spawnSync("powershell", ["-NoProfile", "-Command", '[Environment]::GetFolderPath("MyDocuments")'], { encoding: "utf8" });
      const out = (r.stdout || "").trim();
      if (r.status === 0 && out) {
        chatState.documentsRoot = out;
        return out;
      }
    } else if (process.platform === "linux") {
      const r = spawnSync("xdg-user-dir", ["DOCUMENTS"], { encoding: "utf8" });
      const out = (r.stdout || "").trim();
      if (r.status === 0 && out) {
        chatState.documentsRoot = out;
        return out;
      }
    }
    chatState.documentsRoot = path.join(os.homedir(), "Documents");
    return chatState.documentsRoot;
  }
  function todayString(now = /* @__PURE__ */ new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function registryFile(dateFolder) {
    return path.join(dateFolder, ".dsh-chat.json");
  }
  function readRegistry(dateFolder) {
    try {
      const raw = JSON.parse(fs.readFileSync(registryFile(dateFolder), "utf8"));
      const sessions = raw && typeof raw.sessions === "object" && raw.sessions !== null ? raw.sessions : {};
      return sessions;
    } catch {
      return {};
    }
  }
  function writeRegistry(dateFolder) {
    const sessions = {};
    for (const [sid, entry] of chatState.folders) {
      if (normalizePathLower(path.dirname(entry.folder)) === normalizePathLower(dateFolder)) sessions[sid] = entry;
    }
    try {
      fs.writeFileSync(registryFile(dateFolder), JSON.stringify({ sessions }, null, 2), "utf8");
    } catch (err) {
      console.warn("[dsh-chat-manager] registry write failed:", err);
    }
  }
  function scanChatFolders() {
    if (!chatState.root || !fs.existsSync(chatState.root)) return;
    let names;
    try {
      names = fs.readdirSync(chatState.root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      if (!d.isDirectory()) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue;
      const dateFolder = path.join(chatState.root, d.name);
      const sessions = readRegistry(dateFolder);
      for (const [sid, entry] of Object.entries(sessions)) {
        if (entry && typeof entry.slug === "string" && typeof entry.folder === "string" && !chatState.folders.has(sid)) {
          chatState.folders.set(sid, { slug: entry.slug, folder: entry.folder });
        }
      }
    }
  }
  function uniqueSlug(dateFolder, slug) {
    const words = slug.split("-");
    let n = 0;
    for (; ; ) {
      const candidate = collisionSlug(words, n);
      const folder = path.join(dateFolder, candidate);
      if (!fs.existsSync(folder)) return { slug: candidate, folder };
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
        fs.mkdirSync(folder, { recursive: true });
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
        const dateFolder = path.join(chatState.root, todayString());
        fs.mkdirSync(dateFolder, { recursive: true });
        let workspace = await ctx.workspaceRegistry.resolveByPath(dateFolder);
        if (workspace === void 0) workspace = await ctx.workspaceRegistry.create(dateFolder);
        sendJson(res, 200, { workspaceId: workspace.id, dateFolder });
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
            const dir = path.dirname(artifact);
            const ownsDir = path.basename(dir) === sid;
            try {
              await ctx.sessionPersistence.flush();
            } catch (err) {
              console.warn("[dsh-chat-manager] pre-delete flush failed:", errorMessage(err));
            }
            if (ownsDir && fs.existsSync(dir)) {
              fs.rmSync(dir, { recursive: true, force: true });
              if (fs.existsSync(dir)) throw new Error(`session log survived removal: ${dir}`);
            } else if (fs.existsSync(artifact)) {
              fs.rmSync(artifact, { recursive: true, force: true });
              if (fs.existsSync(artifact)) throw new Error(`session log survived removal: ${artifact}`);
              const siblings = fs.readdirSync(dir);
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
          writeRegistry(path.dirname(entry.folder));
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
    chatState.documentsRoot = resolveDocuments();
    chatState.root = path.join(chatState.documentsRoot, CHAT_ROOT_NAME);
    scanChatFolders();
    console.log(`[dsh-chat-manager] chat root: ${chatState.root}`);
  } catch (err) {
    console.warn("[dsh-chat-manager] boot scan failed:", err);
  }
}
export {
  apply,
  inject,
  name
};
