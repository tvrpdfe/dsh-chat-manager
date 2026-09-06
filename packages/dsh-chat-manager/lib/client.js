window.__ModuleLoader__.load({
	id: "dsh-chat-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/navigation.ts
var import_cordis = require("@deepseek-ai/cordis");

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
function samePath(a, b) {
  if (!a || !b) return false;
  return normalizePathLower(a) === normalizePathLower(b);
}

// src/client/addon/chat-runtime.ts
function createSource(initial) {
  let snapshot = initial;
  const listeners = /* @__PURE__ */ new Set();
  const notify = () => {
    for (const fn of listeners) fn();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next) => {
      snapshot = next;
      notify();
    },
    update: (fn) => {
      snapshot = fn(snapshot);
      notify();
    }
  };
}
var chatStateSource = createSource({ root: null, folders: {}, archived: [], loaded: false });
var archivedMaskSource = createSource(/* @__PURE__ */ new Set());
function markArchivedMasked(sessionId) {
  archivedMaskSource.set(new Set(archivedMaskSource.getSnapshot()).add(sessionId));
}
function refreshChatState() {
  return fetch("/api/chat-manager/state").then((res) => {
    if (!res.ok) throw new Error(`state request failed (${res.status})`);
    return res.json();
  }).then((data) => {
    const snapshot = {
      root: typeof data.dshRoot === "string" && data.dshRoot.length > 0 ? data.dshRoot : null,
      folders: data && typeof data.folders === "object" && data.folders !== null ? data.folders : {},
      archived: Array.isArray(data.archived) ? data.archived : [],
      loaded: true
    };
    archivedMaskSource.update(() => /* @__PURE__ */ new Set());
    chatStateSource.set(snapshot);
    return snapshot;
  }).catch((err) => {
    chatStateSource.update((current) => ({ ...current, loaded: true }));
    throw err;
  });
}
async function rpcPost(pathName, payload) {
  const res = await fetch(pathName, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {})
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
  }
  if (!res.ok) {
    throw new Error(data && typeof data.error === "string" ? data.error : `request failed (${res.status})`);
  }
  return data ?? {};
}
var refreshSessionsFn = null;
function setRefreshSessions(fn) {
  refreshSessionsFn = fn;
}
async function performSessionDelete(sessionId) {
  await rpcPost("/api/chat-manager/delete-session", { sessionId });
  markSessionDeleted(sessionId);
  if (refreshSessionsFn !== null) refreshSessionsFn();
  await refreshChatState().catch(() => {
  });
}
var chatRuntimeSource = createSource({
  currentId: void 0,
  chatIds: /* @__PURE__ */ new Set(),
  inFlight: false,
  workspaces: []
});
function setChatRuntimeSnapshot(next) {
  chatRuntimeSource.update((current) => ({ ...current, ...next }));
}
function setChatInFlight(inFlight) {
  chatRuntimeSource.update((current) => ({ ...current, inFlight }));
}
function runChatFlow(start, onError) {
  if (chatRuntimeSource.getSnapshot().inFlight) return;
  setChatInFlight(true);
  start().catch(() => {
    onError?.();
  }).finally(() => {
    setChatInFlight(false);
  });
}
var DELETED_IDS_KEY = "dsh-chat-manager.deletedSessionIds";
function loadDeletedIds() {
  try {
    const raw = window.localStorage.getItem(DELETED_IDS_KEY);
    if (!raw) return /* @__PURE__ */ new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string").map((x) => x) : []);
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
var deletedIdsSource = createSource(loadDeletedIds());
function persistDeletedIds() {
  try {
    window.localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...deletedIdsSource.getSnapshot()]));
  } catch {
  }
}
function markSessionDeleted(sessionId) {
  const current = deletedIdsSource.getSnapshot();
  if (current.has(sessionId)) return;
  deletedIdsSource.set(new Set(current).add(sessionId));
  persistDeletedIds();
}
function pruneDeletedIds(presentIds) {
  const next = /* @__PURE__ */ new Set();
  let changed = false;
  for (const id of deletedIdsSource.getSnapshot()) {
    if (presentIds.has(id)) next.add(id);
    else changed = true;
  }
  if (!changed) return;
  deletedIdsSource.set(next);
  persistDeletedIds();
}
var chatManagerZh = {
  "settings.archived": "\u5DF2\u5F52\u6863\u4F1A\u8BDD",
  "archived.loading": "\u6B63\u5728\u52A0\u8F7D\u2026",
  "archived.empty": "\u6682\u65E0\u5DF2\u5F52\u6863\u4F1A\u8BDD",
  "archived.restore": "\u6062\u590D",
  "archived.restoring": "\u6062\u590D\u4E2D\u2026",
  "archived.delete": "\u5220\u9664",
  "archived.deleting": "\u5220\u9664\u4E2D\u2026",
  "archived.untitled": "\u672A\u547D\u540D\u4F1A\u8BDD",
  "archived.delete.desc": "\u5C06\u5220\u9664\u4F1A\u8BDD\u201C{name}\u201D\u7684\u804A\u5929\u8BB0\u5F55\u3002\u5176\u6587\u4EF6\u5939\u4F1A\u4FDD\u7559\u5728\u78C1\u76D8\u4E0A\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  "close": "\u5173\u95ED",
  "cancel": "\u53D6\u6D88",
  "time.now": "\u521A\u521A",
  "time.minutes": "{n}\u5206\u949F",
  "time.hours": "{n}\u5C0F\u65F6",
  "time.days": "{n}\u5929",
  "time.months": "{n}\u4E2A\u6708",
  "time.years": "{n}\u5E74"
};
var chatManagerEn = {
  "settings.archived": "Archived sessions",
  "archived.loading": "Loading\u2026",
  "archived.empty": "No archived sessions",
  "archived.restore": "Restore",
  "archived.restoring": "Restoring\u2026",
  "archived.delete": "Delete",
  "archived.deleting": "Deleting\u2026",
  "archived.untitled": "Untitled session",
  "archived.delete.desc": "This deletes the conversation record of \u201C{name}\u201D. Its folder is kept on disk. This cannot be undone.",
  "close": "Close",
  "cancel": "Cancel",
  "time.now": "now",
  "time.minutes": "{n}min",
  "time.hours": "{n}h",
  "time.days": "{n}d",
  "time.months": "{n}mo",
  "time.years": "{n}y"
};

// src/client/navigation.ts
var DirectoryBrowseError = class extends Error {
  /** @param rpcError - Host directory business failure. */
  constructor(rpcError) {
    super(`directory browse failed: ${rpcError.code}: ${rpcError.message}`);
    this.rpcError = rpcError;
    __publicField(this, "name", "DirectoryBrowseError");
  }
};
var UiWorkspaceService = class extends import_cordis.Service {
  /**
   * @param ctx - Client root Context.
   * @param directoryPicker - the directory-picking Remote namespace.
   * @param workspaces - pure Workspace Controller.
   * @param sessions - pure Session Controller.
   */
  constructor(ctx, directoryPicker, workspaces, sessions) {
    super(ctx, "uiWorkspace");
    this.directoryPicker = directoryPicker;
    this.workspaces = workspaces;
    this.sessions = sessions;
    __publicField(this, "connecting", /* @__PURE__ */ new Map());
    ctx.effect(() => this.watchNavigation(), "ui-workspace: Workspace navigation policy");
  }
  /**
   * Route a no-argument New Session to a new chat when the focus is a chat
   * session or there is no focus; an explicit Workspace target and a
   * workspace-focused current Session keep the shipped inheritance. The
   * wrapped method is restored by the returned disposer. The chat flow runs
   * under the shared in-flight gate and its failure falls back to the
   * pristine `startSession()` (the captured `original`), never back into
   * this wrapper.
   * @param guards - render-observed chat focus + chat flow opener.
   * @returns the disposal function restoring the pristine method.
   */
  installChatRouting({ currentId, chatIds, startChat }) {
    const original = this.startSession.bind(this);
    const routed = (workspaceId) => {
      if (workspaceId !== void 0) return original(workspaceId);
      const current = currentId();
      if (current !== void 0 && !chatIds().has(current)) return original();
      runChatFlow(startChat, () => original());
    };
    this.startSession = routed;
    return () => {
      if (this.startSession === routed) this.startSession = (workspaceId) => original(workspaceId);
    };
  }
  async connectWorkspace(workspaceId) {
    const workspace = this.workspaces.list.getSnapshot().items.find((item) => item.workspaceId === workspaceId);
    if (workspace === void 0) {
      throw new Error(`uiWorkspace.connectWorkspace: unknown workspace ${workspaceId}`);
    }
    const inflight = this.connecting.get(workspaceId);
    if (inflight !== void 0) return inflight;
    const archived = this.workspaces.list.getSnapshot().archivedSessionIds;
    const sessions = this.sessions.list.getSnapshot();
    for (const id of sessions.ids) {
      const summary = sessions.byId[id];
      if (summary !== void 0 && summary.blank && summary.cwd === workspace.path && workspace.sessionIds.includes(summary.id) && !archived.includes(summary.id)) return summary.id;
    }
    const attempt = this.sessions.create({ workspaceId }).finally(() => {
      this.connecting.delete(workspaceId);
    });
    this.connecting.set(workspaceId, attempt);
    return attempt;
  }
  startSession(workspaceId) {
    const workspace = this.workspaces.list.getSnapshot();
    const sessions = this.sessions.list.getSnapshot();
    const current = sessions.current;
    const currentWorkspaceId = current === void 0 ? void 0 : workspace.items.find((item) => item.sessionIds.includes(current))?.workspaceId;
    const recent = workspace.phase === "ready" && sessions.phase === "ready" ? recentWorkspace(workspace.items, sessions.byId) : void 0;
    const target = workspaceId ?? currentWorkspaceId ?? recent;
    if (target === void 0) {
      this.sessions.clear();
      return;
    }
    void this.connectWorkspace(target).then(
      (sessionId) => {
        this.sessions.open(sessionId);
      },
      (reason) => {
        console.warn("new session failed:", reason);
      }
    );
  }
  async archiveSession(sessionId) {
    await this.workspaces.archiveSession(sessionId);
  }
  async pickDirectory() {
    const result = await this.directoryPicker.pick();
    if (!result.ok) throw new Error(`directory picker failed: ${result.error.message}`);
    return result.value;
  }
  async listDirectory(path, signal) {
    const result = await this.directoryPicker.list(path, signal);
    if (!result.ok) throw new DirectoryBrowseError(result.error);
    return result.value;
  }
  async createDirectory(path, name) {
    const result = await this.directoryPicker.createDirectory(path, name);
    if (!result.ok) throw new DirectoryBrowseError(result.error);
    return result.value;
  }
  watchNavigation() {
    let initial = "waiting";
    let disposed = false;
    const reconcile = () => {
      if (disposed) return;
      if (this.clearArchivedCurrent()) return;
      if (initial !== "waiting") return;
      const workspace = this.workspaces.list.getSnapshot();
      const sessions = this.sessions.list.getSnapshot();
      if (workspace.phase !== "ready" || sessions.phase !== "ready") return;
      if (sessions.current !== void 0) {
        initial = "done";
        return;
      }
      const target = recentWorkspace(workspace.items, sessions.byId);
      if (target === void 0) {
        initial = "done";
        return;
      }
      initial = "connecting";
      void this.connectWorkspace(target).then(
        (sessionId) => {
          if (disposed) return;
          if (this.sessions.list.getSnapshot().current === void 0) {
            this.sessions.open(sessionId);
          }
          initial = "done";
        },
        (reason) => {
          if (disposed) return;
          initial = "waiting";
          console.warn("initial workspace selection failed:", reason);
        }
      );
    };
    const disposeWorkspaces = this.workspaces.list.subscribe(reconcile);
    const disposeSessions = this.sessions.list.subscribe(reconcile);
    reconcile();
    return () => {
      disposed = true;
      disposeSessions();
      disposeWorkspaces();
    };
  }
  /** @returns true when an archived current selection was cleared. */
  clearArchivedCurrent() {
    const current = this.sessions.list.getSnapshot().current;
    if (current === void 0 || !this.workspaces.list.getSnapshot().archivedSessionIds.includes(current)) return false;
    this.sessions.clear();
    return true;
  }
};
function recentWorkspace(workspaces, sessions) {
  let selected;
  let selectedTime = Number.NEGATIVE_INFINITY;
  for (const workspace of workspaces) {
    let latest = Number.NEGATIVE_INFINITY;
    for (const sessionId of workspace.sessionIds) {
      const session = sessions[sessionId];
      if (session !== void 0) latest = Math.max(latest, session.updatedAt);
    }
    if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt);
    if (selected === void 0 || latest > selectedTime) {
      selected = workspace.workspaceId;
      selectedTime = latest;
    }
  }
  return selected;
}

// src/client/stores.ts
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
var FLAT_SESSION_ORDER_KEY = "__flat_session_order__";
function createWorkspaceViewStore() {
  return (0, import_dsh_client_store.defineStore)({
    init: () => ({
      groupBy: "workspace",
      orderBy: "updated",
      groupExpansion: {},
      sessionOrderByAccount: {},
      sessionUpdatedAtByAccount: {}
    }),
    persist: "dsh.workspace.view.v5",
    actions: {
      setGroupBy: (d, mode) => {
        d.groupBy = mode;
      },
      setOrderBy: (d, mode) => {
        d.orderBy = mode;
      },
      setGroupExpanded: (d, key, expanded) => {
        d.groupExpansion[key] = expanded;
      },
      retainAccountKeys: (d, workspaceKeys) => {
        const retained = new Set(workspaceKeys);
        d.groupExpansion = Object.fromEntries(
          Object.entries(d.groupExpansion).filter(([key]) => retained.has(key))
        );
        d.sessionOrderByAccount = Object.fromEntries(
          Object.entries(d.sessionOrderByAccount).filter(([key]) => retained.has(key))
        );
        d.sessionUpdatedAtByAccount = Object.fromEntries(
          Object.entries(d.sessionUpdatedAtByAccount).filter(([key]) => retained.has(key))
        );
      },
      syncSessionOrderAccount: (d, accountKey, order, updatedAt) => {
        d.sessionOrderByAccount[accountKey] = order;
        d.sessionUpdatedAtByAccount[accountKey] = updatedAt;
      },
      setSessionOrder: (d, accountKey, order) => {
        d.sessionOrderByAccount[accountKey] = order;
      }
    }
  });
}

// src/client/rows/WorkspaceBrowser.tsx
var import_react4 = require("react");

// node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}
var clsx_default = clsx;

// src/client/rows/WorkspaceBrowser.tsx
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

// node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
function isWindowsStylePath(value) {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
}
function abbreviateHomePath(path, home) {
  if (home === void 0 || home === "") return path;
  if (isWindowsStylePath(path) || isWindowsStylePath(home)) return path;
  const root = home.replace(/\/+$/, "");
  if (root === "" || root === "/") return path;
  if (path.replace(/\/+$/, "") === root) return "~";
  if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`;
  return path;
}
function workspaceTitleOf(path) {
  const trimmed = path.replace(/[/\\]+$/, "");
  const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return trimmed.slice(separator + 1);
}

// src/client/subagent-lineage.ts
function indexSubagentDescendants(summaries) {
  const indexed = /* @__PURE__ */ new Map();
  for (const descendant of Object.values(summaries)) {
    if (descendant.origin !== "subagent") continue;
    const seen = /* @__PURE__ */ new Set();
    let current = descendant;
    while (current?.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
      seen.add(current.id);
      const aggregate = indexed.get(current.parentId);
      if (aggregate === void 0) {
        indexed.set(current.parentId, { count: 1, runningCount: descendant.running ? 1 : 0 });
      } else {
        aggregate.count += 1;
        if (descendant.running) aggregate.runningCount += 1;
      }
      current = summaries[current.parentId];
    }
  }
  return indexed;
}

// src/client/tree.ts
var UNGROUPED_KEY = "";
var EMPTY_IDS = /* @__PURE__ */ new Set();
function owningGroupKey(workspaces, sessionId) {
  return workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))?.workspaceId ?? UNGROUPED_KEY;
}
function workspaceLabel(cwd) {
  if (cwd === void 0 || cwd === "") return "";
  const base = workspaceTitleOf(cwd);
  return base !== "" ? base : cwd;
}
function byRecency(a, b) {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
  return a.id < b.id ? -1 : 1;
}
function sessionVisible(session, current, archived) {
  return session.origin !== "subagent" && !archived.has(session.id) && (!session.blank || session.id === current);
}
function sessionTitle(session) {
  return session.blank ? "" : session.displayTitle;
}
function hasActiveSchedule(session) {
  return (session.projectionValues?.schedule?.length ?? 0) > 0;
}
function buildGroup(key, workspaceId, cwd, createdAt, label, members, order) {
  const sessions = [...members];
  if (order === "recency") sessions.sort(byRecency);
  return { key, workspaceId, cwd, createdAt, label, sessions };
}
function orderedUngrouped(members, stored) {
  const byId = new Map(members.map((session) => [session.id, session]));
  const included = /* @__PURE__ */ new Set();
  const ordered = [];
  for (const key of stored) {
    const session = byId.get(key);
    if (session === void 0 || included.has(key)) continue;
    ordered.push(session);
    included.add(key);
  }
  for (const session of [...members].sort(byRecency)) {
    if (included.has(session.id)) continue;
    ordered.push(session);
  }
  return ordered;
}
function groupByWorkspace(list, workspaces, archived, ungroupedOrder, excludedSessionIds = EMPTY_IDS) {
  const groups = [];
  const accounted = /* @__PURE__ */ new Set();
  for (const workspace of workspaces) {
    const members = [];
    for (const id of workspace.sessionIds) {
      const summary = list.byId[id];
      if (summary === void 0) continue;
      accounted.add(id);
      if (excludedSessionIds.has(id)) continue;
      if (!sessionVisible(summary, list.current, archived)) continue;
      members.push(summary);
    }
    groups.push(buildGroup(
      workspace.workspaceId,
      workspace.workspaceId,
      workspace.path,
      Date.parse(workspace.createdAt),
      workspace.title,
      members,
      "account"
    ));
  }
  const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && !excludedSessionIds.has(s.id) && sessionVisible(s, list.current, archived));
  if (stray.length > 0) {
    groups.push(buildGroup(
      UNGROUPED_KEY,
      void 0,
      void 0,
      void 0,
      "",
      ungroupedOrder === void 0 ? stray : orderedUngrouped(stray, ungroupedOrder),
      ungroupedOrder === void 0 ? "recency" : "account"
    ));
  }
  return groups;
}
function visiblePendingKind(kind) {
  switch (kind) {
    case "approval":
    case "plan-review":
    case "question":
      return kind;
    default:
      return void 0;
  }
}
function sessionNode(s, descendants, pendingInteractions) {
  const pendingInteraction = visiblePendingKind(pendingInteractions.get(s.id)?.kind);
  return {
    id: s.id,
    title: sessionTitle(s),
    blank: s.blank,
    running: s.running,
    runningSubagentCount: descendants.get(s.id)?.runningCount ?? 0,
    completed: s.completed === true,
    hasActiveSchedule: hasActiveSchedule(s),
    updatedAt: s.updatedAt,
    ...pendingInteraction === void 0 ? {} : { pendingInteraction }
  };
}
function deriveGroups(list, workspaces, archivedSessionIds, pendingInteractions, view, excludedSessionIds = EMPTY_IDS) {
  const archived = new Set(archivedSessionIds);
  const expandedGroups = new Set(view.expandedGroups);
  const descendants = indexSubagentDescendants(list.byId);
  const currentGroup = list.current === void 0 ? void 0 : owningGroupKey(workspaces, list.current);
  const groups = [];
  for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder, excludedSessionIds)) {
    const expanded = expandedGroups.has(g.key);
    groups.push({
      key: g.key,
      workspaceId: g.workspaceId,
      cwd: g.cwd,
      createdAt: g.createdAt,
      label: g.label,
      sessionCount: g.sessions.length,
      expanded,
      containsCurrent: g.key === currentGroup,
      sessions: expanded ? g.sessions.map((session) => sessionNode(session, descendants, pendingInteractions)) : []
    });
  }
  return groups;
}
function deriveFlat(list, archivedSessionIds, pendingInteractions, excludedSessionIds = EMPTY_IDS) {
  const archived = new Set(archivedSessionIds);
  const descendants = indexSubagentDescendants(list.byId);
  const rows = [];
  for (const id of list.ids) {
    const s = list.byId[id];
    if (s === void 0 || excludedSessionIds.has(id) || !sessionVisible(s, list.current, archived)) continue;
    rows.push(s);
  }
  rows.sort(byRecency);
  return rows.map((session) => sessionNode(session, descendants, pendingInteractions));
}
function deriveSearchResults(list, workspaces, query, archivedSessionIds, pendingInteractions, content, limit) {
  const q = query.trim().toLowerCase();
  if (q === "") return { items: [], hasMore: false };
  const archived = new Set(archivedSessionIds);
  const descendants = indexSubagentDescendants(list.byId);
  const workspaceBySession = /* @__PURE__ */ new Map();
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) {
      if (!workspaceBySession.has(sessionId)) workspaceBySession.set(sessionId, workspace.title);
    }
  }
  const labelOf = (summary) => workspaceBySession.get(summary.id) ?? workspaceLabel(summary.cwd);
  const contentBySession = /* @__PURE__ */ new Map();
  for (const item of content.items) {
    if (!contentBySession.has(item.sessionId)) contentBySession.set(item.sessionId, item);
  }
  const local = [];
  for (const id of list.ids) {
    const summary = list.byId[id];
    if (summary === void 0 || summary.blank || !sessionVisible(summary, list.current, archived)) continue;
    if (sessionTitle(summary).toLowerCase().includes(q) || labelOf(summary).toLowerCase().includes(q)) {
      local.push(summary);
    }
  }
  local.sort(byRecency);
  const ordered = [];
  const included = /* @__PURE__ */ new Set();
  const include = (summary) => {
    if (included.has(summary.id)) return;
    included.add(summary.id);
    ordered.push(summary);
  };
  for (const summary of local) include(summary);
  for (const item of content.items) {
    const summary = list.byId[item.sessionId];
    if (summary !== void 0 && !summary.blank && sessionVisible(summary, list.current, archived)) include(summary);
  }
  return {
    items: ordered.slice(0, limit).map((summary) => {
      const match = contentBySession.get(summary.id);
      const pendingInteraction = visiblePendingKind(pendingInteractions.get(summary.id)?.kind);
      return {
        id: summary.id,
        title: sessionTitle(summary),
        workspace: labelOf(summary),
        running: summary.running,
        runningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,
        ...pendingInteraction === void 0 ? {} : { pendingInteraction },
        completed: summary.completed === true,
        hasActiveSchedule: hasActiveSchedule(summary),
        ...match === void 0 ? {} : { snippet: match.snippet }
      };
    }),
    hasMore: content.hasMore || ordered.length > limit
  };
}

// src/client/rows/Rows.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/rows/Rows.module.css
var cssText = ".m951506_projectRow,\n.m951506_sessionRow {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  border-radius: 8px;\n  padding: 0 8px;\n  cursor: pointer;\n  user-select: none;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m951506_projectRow:hover,\n.m951506_sessionRow:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m951506_sessionRow.selected {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m951506_searchResultRow {\n  display: flex;\n  flex-direction: column;\n  align-items: stretch;\n  width: 100%;\n  min-height: 48px;\n  box-sizing: border-box;\n  border: none;\n  border-radius: 8px;\n  padding: 4px 8px;\n  background: transparent;\n  cursor: pointer;\n  text-align: left;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m951506_searchResultRow:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m951506_searchResultRow.selected {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m951506_searchResultHeading {\n  display: flex;\n  align-items: center;\n  min-width: 0;\n}\n\n.m951506_searchResultTitle {\n  flex: 0 1 auto;\n  min-width: 0;\n  margin-left: 4px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 14px;\n  line-height: 20px;\n}\n\n.m951506_searchResultMeta {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  margin-left: 20px;\n}\n\n.m951506_searchResultWorkspace,\n.m951506_searchResultSnippet {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12px;\n  line-height: 17px;\n}\n\n.m951506_searchResultWorkspace {\n  flex: none;\n  max-width: 40%;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_searchResultSnippet {\n  flex: 1;\n  min-width: 0;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* Compact one-line Workspace row after removing the session-count subtitle. */\n.m951506_projectRow {\n  height: 34px;\n  align-items: center;\n  box-sizing: border-box;\n}\n\n.m951506_projectRow .m951506_rowActions {\n  height: 20px;\n}\n\n/* Session cell (figma): pad 8, a 16px status slot, then a 4px title gap. */\n.m951506_sessionRow {\n  height: 32px;\n  gap: 0;\n  /* Mount fade: session rows appear by unfolding a group (or the tree\n     mounting). Stable row keys keep already-visible rows from replaying it. */\n  animation: row-in 150ms var(--ds-ease-in-out);\n}\n\n.m951506_sessionRow .m951506_title {\n  margin: 0 6px 0 4px;\n}\n\n.m951506_flatSessionRowWithoutStatus .m951506_title {\n  margin-left: 0;\n}\n\n@keyframes row-in {\n  from { opacity: 0; }\n}\n\n.m951506_slot {\n  flex: none;\n  width: 16px;\n  height: 20px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_visuallyHidden {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  overflow: hidden;\n  clip: rect(0 0 0 0);\n  white-space: nowrap;\n}\n\n.m951506_folderActive {\n  color: var(--dsw-alias-state-business-primary);\n}\n\n\n/* Project leading slot: folder by default, expand arrow on row hover. */\n.m951506_projectRow .m951506_chevron { display: none; }\n.m951506_projectRow:hover .m951506_chevron { display: inline-flex; }\n.m951506_projectRow:hover .m951506_folder { display: none; }\n\n/* Expand arrow (filled triangle): points right closed, rotates to point down open. */\n.m951506_arrow {\n  transition: transform 150ms var(--ds-ease-in-out);\n}\n\n.m951506_arrowOpen {\n  transform: rotate(90deg);\n}\n\n.m951506_projectText {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.m951506_title {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 14px;\n  line-height: 20px;\n}\n\n.m951506_renameInput {\n  min-width: 0;\n  font-size: 14px;\n  line-height: 20px;\n  padding: 0 2px;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: 4px;\n  background: var(--dsw-alias-button-elevated-fill);\n  color: inherit;\n  outline: none;\n}\n\n.m951506_sessionRow .m951506_title {\n  flex: 1;\n}\n\n.m951506_meta {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_time {\n  flex: none;\n  font-size: 12px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_scheduleIndicator {\n  display: inline-flex;\n  flex: none;\n  width: 16px;\n  height: 20px;\n  align-items: center;\n  justify-content: center;\n  margin-right: 6px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_searchScheduleIndicator {\n  margin-right: 0;\n  margin-left: 4px;\n}\n\n.m951506_dot {\n  flex: none;\n}\n\n/* Trailing action buttons surface on hover only (figma 27:4668 / 27:4656):\n   bare 16px glyphs, gap 12, tertiary grey. */\n.m951506_rowActions {\n  flex: none;\n  display: none;\n  align-items: center;\n  gap: 12px;\n}\n\n.m951506_projectRow:hover .m951506_rowActions,\n.m951506_sessionRow:hover .m951506_rowActions,\n.m951506_projectRow.menuOpen .m951506_rowActions,\n.m951506_sessionRow.menuOpen .m951506_rowActions {\n  display: inline-flex;\n}\n\n.m951506_sessionRow:hover .m951506_time,\n.m951506_sessionRow.menuOpen .m951506_time {\n  display: none;\n}\n\n/* An open row menu pins the hover affordances (figma: the row keeps its\n   hover fill while its dropdown is up). */\n.m951506_projectRow.menuOpen,\n.m951506_sessionRow.menuOpen {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* Session drag insert marker: a leading chevron and 2px rule between rows,\n   absolutely positioned so it neither resembles a row border nor changes layout. */\n.m951506_sessionRow.dropBefore,\n.m951506_sessionRow.dropAfter {\n  position: relative;\n}\n\n.m951506_sessionRow.dropBefore::before,\n.m951506_sessionRow.dropAfter::after {\n  content: '';\n  position: absolute;\n  z-index: 1;\n  left: 0;\n  right: 4px;\n  height: 12px;\n  background:\n    linear-gradient(\n      55deg,\n      transparent calc(50% - 1px),\n      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),\n      transparent calc(50% + 1px)\n    ) 0 0 / 5px 7px no-repeat,\n    linear-gradient(\n      125deg,\n      transparent calc(50% - 1px),\n      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),\n      transparent calc(50% + 1px)\n    ) 0 5px / 5px 7px no-repeat,\n    linear-gradient(\n      var(--dsw-alias-state-business-primary) 0 0\n    ) 4px 5px / calc(100% - 4px) 2px no-repeat;\n  pointer-events: none;\n}\n\n.m951506_sessionRow.dropBefore::before {\n  top: -7px;\n}\n\n.m951506_sessionRow.dropAfter::after {\n  bottom: -7px;\n}\n\n/* Hover-card body (figma 169:16903): dark surface, fixed colors both themes. */\n.m951506_hoverContent {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.m951506_hoverTitle {\n  font-size: 14px;\n  line-height: 20px;\n  color: #FFFFFF;\n  overflow-wrap: break-word;\n}\n\n.m951506_hoverPath {\n  font-size: 12px;\n  line-height: 16px;\n  color: #CFD3D6;\n  word-break: break-all;\n}\n\n.m951506_hoverTime {\n  font-size: 12px;\n  line-height: 16px;\n  color: #CFD3D6;\n}\n\n.m951506_hoverStatus {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  line-height: 20px;\n  color: #ADB2B8;\n}\n\n.m951506_iconButton {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 16px;\n  border: none;\n  border-radius: 4px;\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_iconButton:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Chevrons ride the caption grey (#ADB2B8); the folder glyph stays one step\n   darker (tertiary, #81858C) per the cell spec. */\n.m951506_chevron {\n  color: var(--dsw-alias-label-caption);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .m951506_sessionRow,\n  .m951506_arrow {\n    animation: none;\n    transition: none;\n  }\n}\n";
var classMap = { "projectRow": "m951506_projectRow", "sessionRow": "m951506_sessionRow", "selected": "m951506_selected", "searchResultRow": "m951506_searchResultRow", "searchResultHeading": "m951506_searchResultHeading", "searchResultTitle": "m951506_searchResultTitle", "searchResultMeta": "m951506_searchResultMeta", "searchResultWorkspace": "m951506_searchResultWorkspace", "searchResultSnippet": "m951506_searchResultSnippet", "rowActions": "m951506_rowActions", "title": "m951506_title", "flatSessionRowWithoutStatus": "m951506_flatSessionRowWithoutStatus", "slot": "m951506_slot", "visuallyHidden": "m951506_visuallyHidden", "folderActive": "m951506_folderActive", "chevron": "m951506_chevron", "folder": "m951506_folder", "arrow": "m951506_arrow", "arrowOpen": "m951506_arrowOpen", "projectText": "m951506_projectText", "renameInput": "m951506_renameInput", "meta": "m951506_meta", "time": "m951506_time", "scheduleIndicator": "m951506_scheduleIndicator", "searchScheduleIndicator": "m951506_searchScheduleIndicator", "dot": "m951506_dot", "menuOpen": "m951506_menuOpen", "dropBefore": "m951506_dropBefore", "dropAfter": "m951506_dropAfter", "hoverContent": "m951506_hoverContent", "hoverTitle": "m951506_hoverTitle", "hoverPath": "m951506_hoverPath", "hoverTime": "m951506_hoverTime", "hoverStatus": "m951506_hoverStatus", "iconButton": "m951506_iconButton" };
var tagId = "dsh-chat-manager/client/rows/Rows.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-chat-manager";
  tag.dataset.pluginCss = tagId;
  tag.textContent = cssText;
  document.head.appendChild(tag);
}
var Rows_default = classMap;

// src/client/rows/Rows.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function displayTitle(node, t) {
  return node.blank ? t("session.new") : node.title;
}
function timeLabel(updatedAt, now, t) {
  const { unit, n } = (0, import_dsh_client_ui_primitives.relativeTime)(updatedAt, now);
  return unit === "now" ? t("time.now") : t(`time.${unit}`, { n });
}
function hoverTimeLabel(updatedAt, now, t) {
  const { unit, n } = (0, import_dsh_client_ui_primitives.relativeTime)(updatedAt, now);
  return unit === "now" ? t("time.now") : t("time.ago", { t: t(`time.${unit}`, { n }) });
}
function createdLabel(createdAt, t) {
  const d = new Date(createdAt);
  const pad2 = (v) => String(v).padStart(2, "0");
  const date = t("date.ymd", { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
  return t("hover.created", { time: `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` });
}
function WorkspaceHoverContent({ label, cwd, createdAt, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Rows_default.hoverContent, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Rows_default.hoverTitle, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Rows_default.hoverPath, children: cwd }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Rows_default.hoverTime, children: createdLabel(createdAt, t) })
  ] });
}
function rowHalf(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
function ProjectRowItem({ group, onToggle, onCreate, actions, drag, home, t }) {
  const row = group;
  const label = row.workspaceId === void 0 ? t("group.ungrouped") : row.label;
  const active = group.expanded && group.containsCurrent;
  const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
  const workspaceMenuItems = [
    { id: "rename", label: t("rename"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEditOutline16, {}) },
    { id: "delete", label: t("delete.workspace"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTrashOutline16, {}), danger: true }
  ];
  const ownRow = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: clsx_default(Rows_default.projectRow, menuOpen && Rows_default.menuOpen),
      role: "treeitem",
      "aria-expanded": row.expanded,
      onClick: onToggle,
      draggable: drag !== void 0,
      onDragStart: drag === void 0 ? void 0 : (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.key);
        drag.start();
      },
      onDragEnd: drag?.end,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: clsx_default(Rows_default.slot, Rows_default.folder, active && Rows_default.folderActive), children: row.expanded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderOpen16, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderClose16, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: clsx_default(Rows_default.slot, Rows_default.chevron), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTriangleRightFill14, { className: clsx_default(Rows_default.arrow, row.expanded && Rows_default.arrowOpen) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.projectText, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.title, children: label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Rows_default.rowActions, children: [
          actions !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Menu,
            {
              open: menuOpen,
              onClose: () => {
                setMenuOpen(false);
              },
              items: workspaceMenuItems,
              onSelect: (id) => {
                setMenuOpen(false);
                if (id !== "rename" && id !== "delete") return;
                if (id === "rename") actions.rename();
                else actions.delete();
              },
              portal: true,
              closeOnPointerLeave: true,
              anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: Rows_default.iconButton,
                  "aria-label": t("actions.workspace.aria", { name: label }),
                  onClick: (e) => {
                    e.stopPropagation();
                    setMenuOpen((v) => !v);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEllipsisOutline16, {})
                }
              )
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: Rows_default.iconButton,
              "aria-label": t("actions.newSession.aria", { name: label }),
              onClick: (e) => {
                e.stopPropagation();
                onCreate();
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlusOutline16, {})
            }
          )
        ] })
      ]
    }
  );
  if (row.createdAt === void 0) return ownRow;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.HoverCard,
    {
      anchor: ownRow,
      content: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        WorkspaceHoverContent,
        {
          label: row.label,
          cwd: row.cwd === void 0 ? void 0 : abbreviateHomePath(row.cwd, home),
          createdAt: row.createdAt,
          t
        }
      ),
      disabled: menuOpen,
      copyText: row.cwd,
      copyLabel: t("copy"),
      copiedLabel: t("hover.copied")
    }
  );
}
function assertNever(value) {
  throw new Error(`unknown pending interaction: ${String(value)}`);
}
function sessionStatuses(node, t) {
  const subagents = node.runningSubagentCount === 0 ? void 0 : {
    state: "ongoing",
    label: t(
      node.runningSubagentCount === 1 ? "status.subagentsRunning.one" : "status.subagentsRunning.other",
      { n: node.runningSubagentCount }
    )
  };
  let pending;
  switch (node.pendingInteraction) {
    case "approval":
      pending = { state: "warning", label: t("status.waitingApproval") };
      break;
    case "plan-review":
      pending = { state: "warning", label: t("status.planReview") };
      break;
    case "question":
      pending = { state: "warning", label: t("status.waitingAnswer") };
      break;
    case void 0:
      break;
    /* v8 ignore next -- closed PendingInteractionStatus union */
    default:
      return assertNever(node.pendingInteraction);
  }
  if (pending !== void 0) return subagents === void 0 ? [pending] : [pending, subagents];
  if (node.running) {
    const primary = { state: "ongoing", label: t("status.running") };
    return subagents === void 0 ? [primary] : [primary, subagents];
  }
  if (subagents !== void 0) return [subagents];
  if (node.completed) return [{ state: "done", label: t("status.completed") }];
  return [{ state: "done", label: t("status.idle") }];
}
function SessionStatusDots({ statuses }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: statuses[0].state }),
    statuses.map((status) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.visuallyHidden, children: status.label }, status.label))
  ] });
}
function ActiveScheduleIndicator({ t, search = false }) {
  const label = t("schedule.active");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      className: clsx_default(Rows_default.scheduleIndicator, search && Rows_default.searchScheduleIndicator),
      role: "img",
      "aria-label": label,
      title: label,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconAlarmClockOutline16, {})
    }
  );
}
function SessionHoverContent({ node, now, t }) {
  const statuses = sessionStatuses(node, t);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Rows_default.hoverContent, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Rows_default.hoverTitle, children: displayTitle(node, t) }),
    !node.blank && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Rows_default.hoverTime, children: hoverTimeLabel(node.updatedAt, now, t) }),
    statuses.map((status) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Rows_default.hoverStatus, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: status.state }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: status.label })
    ] }, status.label))
  ] });
}
function SearchResultItem({ result, currentId, onOpen, t }) {
  const selected = result.id === currentId;
  const statuses = sessionStatuses(result, t);
  const primaryStatus = statuses[0];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      className: clsx_default(Rows_default.searchResultRow, selected && Rows_default.selected),
      role: "treeitem",
      "aria-selected": selected,
      onClick: () => {
        onOpen(result.id);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Rows_default.searchResultHeading, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.slot, children: (primaryStatus.state !== "done" || result.completed) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionStatusDots, { statuses }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.searchResultTitle, children: result.title }),
          result.hasActiveSchedule && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActiveScheduleIndicator, { t, search: true })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Rows_default.searchResultMeta, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.searchResultWorkspace, children: result.workspace || t("group.ungrouped") }),
          result.snippet !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.searchResultSnippet, children: result.snippet })
        ] })
      ]
    }
  );
}
function SessionNodeItem({
  node,
  currentId,
  now,
  onOpen,
  onRename,
  onFork,
  onArchive,
  onDelete,
  onReveal,
  drag,
  flat = false,
  t
}) {
  const row = node;
  const title = displayTitle(node, t);
  const selected = node.id === currentId;
  const statuses = sessionStatuses(node, t);
  const primaryStatus = statuses[0];
  const showStatus = primaryStatus.state !== "done" || row.completed;
  const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
  const rowRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    if (onReveal === void 0) return;
    rowRef.current?.scrollIntoView({ block: "nearest" });
    onReveal();
  }, [onReveal]);
  const sessionMenuItems = [
    { id: "rename", label: t("rename"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEditOutline16, {}) },
    { id: "fork", label: t("menu.fork"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconBranchOutline16, {}) },
    // 20-native glyph in the menu's 16px icon slot (Menu.module.css .itemIcon).
    { id: "archive", label: t("menu.archiveSession"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 }) },
    { id: "delete", label: t("menu.deleteSession"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTrashOutline16, {}), danger: true }
  ];
  const ownRow = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      ref: rowRef,
      className: clsx_default(
        Rows_default.sessionRow,
        selected && Rows_default.selected,
        menuOpen && Rows_default.menuOpen,
        flat && !showStatus && Rows_default.flatSessionRowWithoutStatus,
        drag?.marker === "before" && Rows_default.dropBefore,
        drag?.marker === "after" && Rows_default.dropAfter
      ),
      role: "treeitem",
      "aria-selected": selected,
      onClick: () => {
        onOpen(node.id);
      },
      draggable: drag !== void 0,
      onDragStart: drag === void 0 ? void 0 : (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", node.id);
        drag.start();
      },
      onDragEnd: drag?.end,
      onDragOver: drag === void 0 ? void 0 : (e) => {
        if (!drag.active) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        drag.hover(rowHalf(e));
      },
      onDrop: drag === void 0 ? void 0 : (e) => {
        if (!drag.active) return;
        e.preventDefault();
        drag.drop(rowHalf(e));
      },
      children: [
        (!flat || showStatus) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.slot, children: showStatus && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionStatusDots, { statuses }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.title, children: title }),
        row.hasActiveSchedule && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActiveScheduleIndicator, { t }),
        !row.blank && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.time, children: timeLabel(row.updatedAt, now, t) }),
        !row.blank && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.rowActions, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Menu,
          {
            open: menuOpen,
            onClose: () => {
              setMenuOpen(false);
            },
            items: sessionMenuItems,
            onSelect: (id) => {
              setMenuOpen(false);
              if (id === "rename") onRename(node.id, row.title);
              if (id === "fork") onFork(node.id);
              if (id === "archive") onArchive(node.id);
              if (id === "delete") onDelete(node.id, row.title);
            },
            portal: true,
            closeOnPointerLeave: true,
            anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: Rows_default.iconButton,
                "aria-label": t("actions.session.aria", { name: title }),
                onClick: (e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEllipsisOutline16, {})
              }
            )
          }
        ) })
      ]
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.HoverCard,
    {
      anchor: ownRow,
      content: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionHoverContent, { node, now, t }),
      disabled: menuOpen || drag?.active === true,
      copyText: row.blank ? void 0 : row.title,
      copyLabel: t("copy"),
      copiedLabel: t("hover.copied")
    }
  );
}

// src/client/WorkspacePicker.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/WorkspacePicker.module.css
var cssText2 = "/* The adoption error dialog's footer and message styles; the dialog itself is\n * the shared Modal (same figma dialog family as the browser's own dialogs). */\n.m662cb4_modalAction {\n  min-width: 72px;\n}\n\n.m662cb4_modalError,\n.m662cb4_menuStatus {\n  margin-top: 8px;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.m662cb4_modalError {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.m662cb4_menuStatus {\n  color: var(--dsw-alias-label-secondary);\n}\n";
var classMap2 = { "modalAction": "m662cb4_modalAction", "modalError": "m662cb4_modalError", "menuStatus": "m662cb4_menuStatus" };
var tagId2 = "dsh-chat-manager/client/WorkspacePicker.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId2) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-chat-manager";
  tag.dataset.pluginCss = tagId2;
  tag.textContent = cssText2;
  document.head.appendChild(tag);
}
var WorkspacePicker_default = classMap2;

// src/client/WorkspacePicker.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var ADD_WORKSPACE = "::add-workspace";
function WorkspacePickFlow({
  t,
  open,
  anchorRef,
  useWorkspaces,
  createWorkspace,
  useDirectoryFlow,
  renderDirectoryFlow,
  onPick,
  onClose,
  addOnly = false,
  side = "bottom",
  selectedId
}) {
  const workspaceSnapshot = useWorkspaces((state) => state);
  const workspaces = workspaceSnapshot.items;
  const getAnchorRect = (0, import_react2.useCallback)(
    () => anchorRef?.current?.getBoundingClientRect() ?? null,
    [anchorRef]
  );
  const [errorOpen, setErrorOpen] = (0, import_react2.useState)(false);
  const [modalError, setModalError] = (0, import_react2.useState)(null);
  const [flowOpen, setFlowOpen] = (0, import_react2.useState)(false);
  const [pickingFolder, setPickingFolder] = (0, import_react2.useState)(false);
  const flowBusy = flowOpen || pickingFolder;
  const flowAvailable = useDirectoryFlow((occupied) => occupied);
  (0, import_react2.useEffect)(() => {
    if (flowOpen && !flowAvailable) setFlowOpen(false);
  }, [flowOpen, flowAvailable]);
  const addEntries = flowAvailable ? [{ id: ADD_WORKSPACE, label: t("menu.addWorkspace"), icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutline16, { size: 16 }), disabled: flowBusy }] : [];
  const pinAdd = !addOnly && workspaces.length > 0;
  const items = pinAdd ? workspaces.map((workspace) => ({
    id: workspace.workspaceId,
    label: workspace.title,
    icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconFolderClose16, { size: 16 }),
    disabled: flowBusy
  })) : addEntries;
  const menuIsEmpty = items.length === 0;
  const closeModal = () => {
    setErrorOpen(false);
    setModalError(null);
  };
  const adoptDirectory = (path) => createWorkspace({ path }).then((workspace) => {
    setFlowOpen(false);
    onPick(workspace.workspaceId);
  }).catch((reason) => {
    setModalError(reason instanceof Error ? reason.message : String(reason));
    setFlowOpen(false);
    setErrorOpen(true);
  });
  const openDirectoryFlow = (0, import_react2.useCallback)(() => {
    onClose();
    setErrorOpen(false);
    setModalError(null);
    setFlowOpen(true);
  }, [onClose]);
  const listSettled = addOnly || workspaceSnapshot.phase === "ready";
  const addIsTheOnlyEntry = !pinAdd && listSettled && addEntries.length === 1;
  (0, import_react2.useEffect)(() => {
    if (open && addIsTheOnlyEntry && !flowBusy) openDirectoryFlow();
  }, [open, addIsTheOnlyEntry, flowBusy, openDirectoryFlow]);
  const flowOwner = {
    open: flowOpen,
    busy: pickingFolder,
    onPicked: (path) => {
      setPickingFolder(true);
      void adoptDirectory(path).finally(() => {
        setPickingFolder(false);
      });
    },
    onCancel: () => {
      setFlowOpen(false);
    },
    onError: (message) => {
      setFlowOpen(false);
      setModalError(message);
      setErrorOpen(true);
    }
  };
  const handleSelect = (id) => {
    if (id === ADD_WORKSPACE) {
      openDirectoryFlow();
      return;
    }
    onPick(id);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Menu,
      {
        open: open && !addIsTheOnlyEntry && !menuIsEmpty,
        anchor: null,
        items,
        ...pinAdd ? { footer: addEntries } : {},
        selectedId,
        onSelect: handleSelect,
        onClose,
        side,
        portal: true,
        getAnchorRect
      }
    ),
    open && !addIsTheOnlyEntry && !menuIsEmpty && workspaceSnapshot.phase === "pending" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: WorkspacePicker_default.menuStatus, role: "status", children: t("picker.loading") }),
    renderDirectoryFlow(flowOwner),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Modal,
      {
        open: errorOpen,
        onClose: closeModal,
        closeLabel: t("close"),
        title: t("folderError.title"),
        footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", className: WorkspacePicker_default.modalAction, onClick: closeModal, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "primary", className: WorkspacePicker_default.modalAction, disabled: !flowAvailable, onClick: openDirectoryFlow, children: t("folderError.retry") })
        ] }),
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: WorkspacePicker_default.modalError, role: "alert", children: modalError })
      }
    )
  ] });
}
function WorkspacePicker({
  open,
  anchorRef,
  useWorkspaces,
  selectedId,
  onPick,
  onClose,
  createWorkspace,
  useDirectoryFlow,
  renderSlot,
  t
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    WorkspacePickFlow,
    {
      t,
      open,
      anchorRef,
      useWorkspaces,
      createWorkspace,
      useDirectoryFlow,
      renderDirectoryFlow: (owner) => renderSlot("conversation.hero.workspace.directoryFlow", owner),
      selectedId,
      onPick,
      onClose
    }
  );
}

// src/client/addon/ChatSection.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/rows/WorkspaceBrowser.module.css
var cssText3 = ".m02ab30_root {\n  --dsh-session-list-edge-inset: var(--dsh-sidebar-inline-padding);\n  --dsh-session-list-scrollbar-width: 8px;\n  --dsh-session-list-scrollbar-offset: 2px;\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  padding-right: var(--dsh-session-list-edge-inset);\n}\n\n.m02ab30_root.rail {\n  padding-right: 0;\n}\n\n.m02ab30_iconButton {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  border: none;\n  border-radius: 50%;\n  corner-shape: round;\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.m02ab30_iconButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* Section header: title, an inline search control, and the two trailing\n   actions. Expanding search collapses the action cluster and takes its room. */\n.m02ab30_sectionHeader {\n  flex: none;\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 4px;\n  height: 36px;\n  padding-left: 4px;\n  margin-bottom: 4px;\n  box-sizing: border-box;\n  border-radius: 12px;\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m02ab30_root:not(.m02ab30_rail) .m02ab30_sectionHeader {\n  margin-top: 2px;\n  margin-right: -4px;\n}\n\n.m02ab30_sectionLabel {\n  flex: none;\n  max-width: 45%;\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  line-height: 20px;\n  opacity: 1;\n  visibility: visible;\n  transition:\n    max-width 180ms var(--ds-ease-in-out),\n    margin-right 180ms var(--ds-ease-in-out),\n    opacity 120ms var(--ds-ease-in-out),\n    transform 180ms var(--ds-ease-in-out),\n    visibility 0s linear;\n}\n\n.m02ab30_sectionLabelHidden {\n  max-width: 0;\n  margin-right: -4px;\n  opacity: 0;\n  transform: translateX(-4px);\n  visibility: hidden;\n  transition-delay: 0s, 0s, 0s, 0s, 180ms;\n}\n\n.m02ab30_searchSlot {\n  flex: 1;\n  max-width: 28px;\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  margin-left: auto;\n  padding-left: 0;\n  box-sizing: border-box;\n  transition:\n    max-width 180ms var(--ds-ease-in-out),\n    padding-left 180ms var(--ds-ease-in-out);\n}\n\n.m02ab30_searchSlotExpanded {\n  max-width: 100%;\n  padding-left: 0;\n}\n\n.m02ab30_headerActions {\n  flex: none;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  max-width: 60px;\n  opacity: 1;\n  overflow: hidden;\n  visibility: visible;\n  transition:\n    max-width 180ms var(--ds-ease-in-out),\n    opacity 120ms var(--ds-ease-in-out),\n    transform 180ms var(--ds-ease-in-out),\n    visibility 0s linear;\n}\n\n.m02ab30_headerActionsHidden {\n  max-width: 0;\n  opacity: 0;\n  transform: translateX(4px);\n  visibility: hidden;\n  pointer-events: none;\n  transition-delay: 0s, 0s, 0s, 180ms;\n}\n\n/* Inline search always fills the room between the title and trailing actions;\n   it grows farther right when the action cluster collapses. */\n.m02ab30_search {\n  flex: none;\n  display: flex;\n  align-items: center;\n  gap: 0;\n  width: 100%;\n  height: 28px;\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n  border: none;\n  border-radius: 50%;\n  corner-shape: round;\n  background: transparent;\n  cursor: text;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  transition:\n    width 180ms var(--ds-ease-in-out),\n    padding 180ms var(--ds-ease-in-out),\n    border-color 180ms var(--ds-ease-in-out),\n    background-color 180ms var(--ds-ease-in-out);\n}\n\n.m02ab30_searchExpanded {\n  width: calc(100% + 4px);\n  height: 30px;\n  margin-inline: -2px;\n  padding: 0 4px 0 0;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: 10px;\n  background: transparent;\n  color: var(--dsw-alias-label-caption);\n}\n\n.m02ab30_searchButton {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  border: none;\n  border-radius: 50%;\n  corner-shape: round;\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  color: inherit;\n}\n\n.m02ab30_searchExpanded .m02ab30_searchButton {\n  width: 28px;\n  height: 30px;\n}\n\n.m02ab30_searchButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m02ab30_searchExpanded .m02ab30_searchButton:hover {\n  background: transparent;\n}\n\n.m02ab30_searchInput {\n  flex: 1;\n  width: 0;\n  min-width: 0;\n  border: none;\n  outline: none;\n  background: transparent;\n  opacity: 0;\n  pointer-events: none;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n  transition: opacity 120ms var(--ds-ease-in-out);\n}\n\n.m02ab30_searchExpanded .m02ab30_searchInput {\n  margin-left: -2px;\n  opacity: 1;\n  pointer-events: auto;\n}\n\n.m02ab30_searchInput::placeholder {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m02ab30_clearButton {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 24px;\n  height: 24px;\n  border: none;\n  border-radius: 50%;\n  corner-shape: round;\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.m02ab30_clearButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* Rail variant (own .m02ab30_rail class from the wide owner prop \u2014 the region never\n   reads the shell's class names): the two icon controls stack as 36x36\n   circles matching the shell's rail rhythm. Both use the rail's shared base\n   left anchor so the outer shell can translate the whole region uniformly. */\n.m02ab30_rail .m02ab30_sectionHeader {\n  gap: 0;\n  padding-left: 0;\n  margin-bottom: 12px;\n  justify-content: flex-start;\n}\n\n.m02ab30_rail .m02ab30_headerActions {\n  max-width: none;\n}\n\n.m02ab30_rail .m02ab30_iconButton {\n  width: 36px;\n  height: 36px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m02ab30_rail .m02ab30_search {\n  width: 36px;\n  height: 36px;\n  padding: 0;\n  margin: 0 0 12px;\n  gap: 0;\n  border-color: transparent;\n  background: transparent;\n}\n\n.m02ab30_rail .m02ab30_searchButton {\n  width: 36px;\n  height: 36px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m02ab30_rail .m02ab30_searchButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* List seat: always mounted so the shell foot never moves. */\n.m02ab30_listArea {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  margin-left: -4px;\n  margin-right: calc(-1 * var(--dsh-session-list-edge-inset));\n  padding-left: 4px;\n  /* The list remains the scroll clip. This seat stays visible so the\n     absolutely positioned first-boundary marker can occupy the header gap. */\n  overflow: visible;\n}\n\n.m02ab30_rail .m02ab30_listArea {\n  margin-left: 0;\n  margin-right: 0;\n  padding-left: 0;\n}\n\n/* Relative for the bottom fade overlay. */\n.m02ab30_treeBody {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  position: relative;\n}\n\n/* Bottom fade: compact overlay pinned to the visible bottom,\n   transparent -> sidebar fill so it tracks the theme. */\n.m02ab30_fade {\n  position: absolute;\n  left: 0;\n  right: var(--dsh-session-list-edge-inset);\n  bottom: 0;\n  height: 24px;\n  background: linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill));\n  pointer-events: none;\n}\n\n/* Wide-only content fades back in on expand remount (mirrors the shell). */\n.m02ab30_wide {\n  animation: wide-in 200ms var(--ds-ease-in-out);\n}\n\n@keyframes wide-in {\n  from { opacity: 0; }\n}\n\n/* List: the only scrolling region. Block children keep their design heights\n   under content overflow. The 2px edge offset, stable 8px themed scrollbar,\n   and remaining padding equal the shell's right inset, with or without\n   overflow, so moving the bar does not move the rows. */\n.m02ab30_list {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  margin-left: -4px;\n  margin-right: var(--dsh-session-list-scrollbar-offset);\n  padding-left: 4px;\n  padding-right: calc(\n    var(--dsh-session-list-edge-inset)\n    - var(--dsh-session-list-scrollbar-width)\n    - var(--dsh-session-list-scrollbar-offset)\n  );\n  /* Clears the compact bottom fade overlay: at scroll end the last row sits\n     above the gradient instead of under it. */\n  padding-bottom: 16px;\n  scrollbar-gutter: stable;\n}\n\n.m02ab30_flatList > * + *,\n.m02ab30_searchTree > [role='treeitem'] + [role='treeitem'],\n.m02ab30_groupSection > * + * {\n  margin-top: 2px;\n}\n\n.m02ab30_searchStatus,\n.m02ab30_searchWarning {\n  padding: 10px 12px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m02ab30_searchWarning {\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* One workspace section: header row + a compact expanded session run. */\n.m02ab30_groupSection {\n  position: relative;\n}\n\n.m02ab30_groupSection + .m02ab30_groupSection {\n  margin-top: 4px;\n}\n\n.m02ab30_listTopDropIndicator,\n.m02ab30_workspaceDropBefore::before,\n.m02ab30_workspaceDropAfter::after {\n  content: '';\n  position: absolute;\n  z-index: 1;\n  left: 0;\n  right: 0;\n  height: 12px;\n  background:\n    linear-gradient(\n      55deg,\n      transparent calc(50% - 1px),\n      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),\n      transparent calc(50% + 1px)\n    ) 0 0 / 5px 7px no-repeat,\n    linear-gradient(\n      125deg,\n      transparent calc(50% - 1px),\n      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),\n      transparent calc(50% + 1px)\n    ) 0 5px / 5px 7px no-repeat,\n    linear-gradient(\n      var(--dsw-alias-state-business-primary) 0 0\n    ) 4px 5px / calc(100% - 4px) 2px no-repeat;\n  pointer-events: none;\n}\n\n/* The first insertion boundary keeps the same -8px coordinate as every\n   Workspace boundary, but lives outside the scrolling clip. */\n.m02ab30_listTopDropIndicator {\n  top: -8px;\n  left: 0;\n  right: var(--dsh-session-list-edge-inset);\n}\n\n.m02ab30_listTopDropActive > .m02ab30_workspaceDropBefore:first-child::before {\n  display: none;\n}\n\n.m02ab30_workspaceDropBefore::before {\n  top: -8px;\n}\n\n.m02ab30_workspaceDropAfter::after {\n  bottom: -8px;\n}\n\n.m02ab30_sessionOverflowButton {\n  width: 100%;\n  height: 28px;\n  border: none;\n  border-radius: 8px;\n  padding: 0 12px 0 28px;\n  background: transparent;\n  cursor: pointer;\n  text-align: left;\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m02ab30_groupSection > .m02ab30_sessionOverflowButton {\n  margin-top: 0;\n}\n\n.m02ab30_sessionOverflowButton:hover {\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.m02ab30_empty {\n  padding: 16px 12px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 13px;\n}\n\n/* Rename dialog form (same figma dialog family as the create modals). */\n.m02ab30_renameInput {\n  box-sizing: border-box;\n  width: 100%;\n  height: 44px;\n  padding: 7px 14px;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: 22px;\n  outline: none;\n  background: transparent;\n  font-size: 14px;\n  font-weight: 400;\n  line-height: 22px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m02ab30_renameInput:disabled {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n.m02ab30_renameError {\n  margin-top: 8px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.m02ab30_deleteAction:not(:disabled) {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.m02ab30_deleteStatus {\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .m02ab30_wide {\n    animation: none;\n  }\n\n  .m02ab30_search,\n  .m02ab30_sectionLabel,\n  .m02ab30_searchSlot,\n  .m02ab30_searchInput,\n  .m02ab30_headerActions {\n    transition: none;\n  }\n}\n\n/* ---- dsh-chat-manager additions ---- */\n.m02ab30_chatSection {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n\n.m02ab30_chatList {\n  flex: 1;\n  min-height: 0;\n}\n\n.m02ab30_split {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  padding-top: 2px;\n}\n\n.m02ab30_pane {\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.m02ab30_divider {\n  flex: none;\n  height: 8px;\n  cursor: row-resize;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  touch-action: none;\n}\n\n.m02ab30_divider::before {\n  content: '';\n  width: 28px;\n  height: 2px;\n  border-radius: 1px;\n  background: var(--dsw-alias-interactive-border, rgba(128, 128, 128, 0.35));\n}\n\n.m02ab30_archivedPage {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  padding: 4px 0;\n}\n\n.m02ab30_archivedRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 12px;\n  border-radius: 10px;\n  background: var(--dsw-alias-interactive-bg-subtle, transparent);\n}\n\n.m02ab30_archivedTitle {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary, inherit);\n}\n\n.m02ab30_archivedTime {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary, inherit);\n  font-size: 12px;\n  line-height: 17px;\n}\r\n";
var classMap3 = { "root": "m02ab30_root", "rail": "m02ab30_rail", "iconButton": "m02ab30_iconButton", "sectionHeader": "m02ab30_sectionHeader", "sectionLabel": "m02ab30_sectionLabel", "sectionLabelHidden": "m02ab30_sectionLabelHidden", "searchSlot": "m02ab30_searchSlot", "searchSlotExpanded": "m02ab30_searchSlotExpanded", "headerActions": "m02ab30_headerActions", "headerActionsHidden": "m02ab30_headerActionsHidden", "search": "m02ab30_search", "searchExpanded": "m02ab30_searchExpanded", "searchButton": "m02ab30_searchButton", "searchInput": "m02ab30_searchInput", "clearButton": "m02ab30_clearButton", "listArea": "m02ab30_listArea", "treeBody": "m02ab30_treeBody", "fade": "m02ab30_fade", "wide": "m02ab30_wide", "list": "m02ab30_list", "flatList": "m02ab30_flatList", "searchTree": "m02ab30_searchTree", "groupSection": "m02ab30_groupSection", "searchStatus": "m02ab30_searchStatus", "searchWarning": "m02ab30_searchWarning", "listTopDropIndicator": "m02ab30_listTopDropIndicator", "workspaceDropBefore": "m02ab30_workspaceDropBefore", "workspaceDropAfter": "m02ab30_workspaceDropAfter", "listTopDropActive": "m02ab30_listTopDropActive", "sessionOverflowButton": "m02ab30_sessionOverflowButton", "empty": "m02ab30_empty", "renameInput": "m02ab30_renameInput", "renameError": "m02ab30_renameError", "deleteAction": "m02ab30_deleteAction", "deleteStatus": "m02ab30_deleteStatus", "chatSection": "m02ab30_chatSection", "chatList": "m02ab30_chatList", "split": "m02ab30_split", "pane": "m02ab30_pane", "divider": "m02ab30_divider", "archivedPage": "m02ab30_archivedPage", "archivedRow": "m02ab30_archivedRow", "archivedTitle": "m02ab30_archivedTitle", "archivedTime": "m02ab30_archivedTime" };
var tagId3 = "dsh-chat-manager/client/rows/WorkspaceBrowser.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId3) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-chat-manager";
  tag.dataset.pluginCss = tagId3;
  tag.textContent = cssText3;
  document.head.appendChild(tag);
}
var WorkspaceBrowser_default = classMap3;

// src/client/addon/ChatSection.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function ChatSection({
  wide,
  useSessions,
  useSessionPendingInteraction,
  useWorkspaces,
  useChat,
  deletedSessionIds,
  open,
  onRename,
  onFork,
  onArchive,
  onDelete,
  onNewChat,
  searchChats,
  t
}) {
  const list = useSessions((s) => s);
  const pendingInteractions = useSessionPendingInteraction((s) => s);
  const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds);
  const chat = useChat((s) => s);
  const chatRoot = typeof chat?.root === "string" ? chat.root : null;
  const [query, setQuery] = (0, import_react3.useState)("");
  const [searchExpanded, setSearchExpanded] = (0, import_react3.useState)(false);
  const [hits, setHits] = (0, import_react3.useState)([]);
  const [searching, setSearching] = (0, import_react3.useState)(false);
  const searchRootRef = (0, import_react3.useRef)(null);
  const searchInputRef = (0, import_react3.useRef)(null);
  const normalizedQuery = sanitizeSearchQuery(query).trim().toLowerCase();
  const hidden = (0, import_react3.useMemo)(
    () => /* @__PURE__ */ new Set([...archivedSessionIds, ...deletedSessionIds]),
    [archivedSessionIds, deletedSessionIds]
  );
  const chatNodes = (0, import_react3.useMemo)(() => {
    const rows = deriveFlat(list, [...hidden], pendingInteractions);
    return rows.filter((row) => {
      const summary = list.byId[row.id];
      return summary !== void 0 && isUnderChatRoot(summary.cwd, chatRoot);
    });
  }, [list, hidden, chatRoot, pendingInteractions]);
  const shown = (0, import_react3.useMemo)(() => {
    if (normalizedQuery === "") return chatNodes;
    const matchedIds = /* @__PURE__ */ new Set();
    for (const node of chatNodes) {
      if (node.title === "") continue;
      if (node.title.toLowerCase().includes(normalizedQuery)) matchedIds.add(node.id);
    }
    for (const hit of hits) matchedIds.add(hit.sessionId);
    return chatNodes.filter((node) => matchedIds.has(node.id));
  }, [normalizedQuery, chatNodes, hits]);
  (0, import_react3.useEffect)(() => {
    if (normalizedQuery === "") {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchChats(normalizedQuery).then((items) => {
        if (cancelled) return;
        setHits(Array.isArray(items) ? items : []);
        setSearching(false);
      }).catch(() => {
        if (cancelled) return;
        setHits([]);
        setSearching(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, searchChats]);
  (0, import_react3.useEffect)(() => {
    if (!wide || !searchExpanded) return;
    searchInputRef.current?.focus({ preventScroll: true });
  }, [wide, searchExpanded]);
  (0, import_react3.useEffect)(() => {
    if (!wide || !searchExpanded) return;
    const onClick = (event) => {
      if (!(event.target instanceof Node) || searchRootRef.current?.contains(event.target) === true) return;
      searchInputRef.current?.blur();
      if (normalizedQuery !== "") return;
      setSearchExpanded(false);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [normalizedQuery, wide, searchExpanded]);
  if (!wide) return null;
  const now = Date.now();
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: WorkspaceBrowser_default.chatSection, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: WorkspaceBrowser_default.sectionHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: clsx_default(WorkspaceBrowser_default.sectionLabel, WorkspaceBrowser_default.wide, searchExpanded && WorkspaceBrowser_default.sectionLabelHidden), children: t("chat.section") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: clsx_default(WorkspaceBrowser_default.searchSlot, searchExpanded && WorkspaceBrowser_default.searchSlotExpanded), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "div",
        {
          ref: searchRootRef,
          className: clsx_default(WorkspaceBrowser_default.search, searchExpanded && WorkspaceBrowser_default.searchExpanded),
          onClick: () => {
            setSearchExpanded(true);
            searchInputRef.current?.focus();
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("search"), side: "bottom", delayMs: 500, disabled: searchExpanded, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: WorkspaceBrowser_default.searchButton,
                "aria-label": t("chat.search.aria"),
                "aria-expanded": searchExpanded,
                onClick: () => {
                  setSearchExpanded(true);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconSearchOutline16, { size: searchExpanded ? 11 : 14 })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                ref: searchInputRef,
                className: WorkspaceBrowser_default.searchInput,
                type: "text",
                placeholder: t("chat.search.placeholder"),
                maxLength: SEARCH_QUERY_MAX_CODE_UNITS,
                value: query,
                tabIndex: searchExpanded ? 0 : -1,
                onChange: (e) => {
                  setQuery(sanitizeSearchQuery(e.target.value));
                },
                onKeyDown: (e) => {
                  if (e.key !== "Escape") return;
                  setQuery("");
                  setSearchExpanded(false);
                }
              }
            ),
            searchExpanded && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: WorkspaceBrowser_default.clearButton,
                "aria-label": t("search.clear"),
                onClick: (e) => {
                  e.stopPropagation();
                  setQuery("");
                  setSearchExpanded(false);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconCloseFill14, {})
              }
            )
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: clsx_default(WorkspaceBrowser_default.headerActions, searchExpanded && WorkspaceBrowser_default.headerActionsHidden), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("chat.add"), side: "bottom", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: WorkspaceBrowser_default.iconButton,
          "aria-label": t("chat.add"),
          onClick: () => {
            onNewChat();
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconPlusOutline16, {})
        }
      ) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.treeBody, WorkspaceBrowser_default.wide, WorkspaceBrowser_default.chatList), children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.list, WorkspaceBrowser_default.flatList), role: "tree", "aria-label": t("chat.section"), children: [
        shown.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: WorkspaceBrowser_default.empty, children: normalizedQuery === "" ? t("chat.empty") : searching ? t("search.pending") : t("search.noMatches") }),
        shown.map((node) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          SessionNodeItem,
          {
            node,
            currentId: list.current,
            now,
            onOpen: open,
            onRename,
            onFork,
            onArchive,
            onDelete,
            flat: true,
            t
          },
          node.id
        ))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: WorkspaceBrowser_default.fade })
    ] })
  ] });
}

// src/client/rows/WorkspaceBrowser.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var EXPAND_SLIDE_MS = 300;
var SEARCH_DEBOUNCE_MS = 250;
var SEARCH_QUERY_MAX_CODE_UNITS = 500;
var COLLAPSED_SESSION_LIMIT = 5;
function collapsedSessionRows(sessions) {
  let ordinaryCount = 0;
  const rows = sessions.filter((session) => {
    if (session.blank) return true;
    if (ordinaryCount >= COLLAPSED_SESSION_LIMIT) return false;
    ordinaryCount += 1;
    return true;
  });
  return { rows, hiddenCount: sessions.length - rows.length };
}
function sanitizeSearchQuery(value) {
  const withoutNul = value.replaceAll("\0", "");
  if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul;
  let end = SEARCH_QUERY_MAX_CODE_UNITS;
  const last = withoutNul.charCodeAt(end - 1);
  const next = withoutNul.charCodeAt(end);
  if (last >= 55296 && last <= 56319 && next >= 56320 && next <= 57343) end--;
  return withoutNul.slice(0, end);
}
function toggled(list, key) {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}
function useNativeDragAcceptance(active) {
  (0, import_react4.useEffect)(() => {
    if (!active) return;
    const acceptDrag = (event) => {
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    };
    const acceptDrop = (event) => {
      event.preventDefault();
    };
    document.addEventListener("dragover", acceptDrag);
    document.addEventListener("drop", acceptDrop);
    return () => {
      document.removeEventListener("dragover", acceptDrag);
      document.removeEventListener("drop", acceptDrop);
    };
  }, [active]);
}
function reconciledSessionOrder(sessionIds, stored) {
  if (stored === void 0) return [...sessionIds];
  const byId = new Map(sessionIds.map((id) => [id, id]));
  const ordered = [];
  const included = /* @__PURE__ */ new Set();
  for (const key of stored) {
    const id = byId.get(key);
    if (id === void 0 || included.has(key)) continue;
    ordered.push(id);
    included.add(key);
  }
  for (const id of sessionIds) {
    if (included.has(id)) continue;
    ordered.push(id);
  }
  return ordered;
}
function compareSessionRecency(a, b, byId) {
  const aUpdatedAt = byId[a]?.updatedAt ?? Number.NEGATIVE_INFINITY;
  const bUpdatedAt = byId[b]?.updatedAt ?? Number.NEGATIVE_INFINITY;
  if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt;
  return a < b ? -1 : 1;
}
function nextSessionOrderAccount({
  sessionIds,
  previousOrder,
  previousUpdatedAt,
  list,
  orderBy,
  sortByRecency
}) {
  let order = reconciledSessionOrder(sessionIds, previousOrder);
  if (sortByRecency) {
    order.sort((a, b) => compareSessionRecency(a, b, list.byId));
  } else if (orderBy === "updated") {
    const promoted = sessionIds.filter((id) => {
      const session = list.byId[id];
      return session !== void 0 && (previousUpdatedAt[id] === void 0 || session.updatedAt > previousUpdatedAt[id]);
    }).sort((a, b) => compareSessionRecency(a, b, list.byId));
    if (promoted.length > 0) {
      const promotedIds = new Set(promoted);
      order = [...promoted, ...order.filter((id) => !promotedIds.has(id))];
    }
  }
  const updatedAt = {};
  for (const id of sessionIds) {
    const session = list.byId[id];
    if (session !== void 0) updatedAt[id] = session.updatedAt;
  }
  const orderChanged = previousOrder === void 0 || order.length !== previousOrder.length || order.some((id, index) => id !== previousOrder[index]);
  const timestampsChanged = Object.keys(updatedAt).length !== Object.keys(previousUpdatedAt).length || Object.entries(updatedAt).some(([id, timestamp]) => previousUpdatedAt[id] !== timestamp);
  return { order, updatedAt, changed: orderChanged || timestampsChanged };
}
function ViewOptionsMenu({ groupBy, orderBy, onGroupPick, onOrderPick, t }) {
  const [open, setOpen] = (0, import_react4.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    import_dsh_client_ui_primitives4.Menu,
    {
      open,
      onClose: () => {
        setOpen(false);
      },
      items: [
        { type: "label", id: "group-by", text: t("groupBy.label") },
        { id: "workspace", label: t("groupBy.workspace") },
        { id: "flat", label: t("groupBy.flat") },
        { type: "separator", id: "order-by-separator" },
        { type: "label", id: "order-by", text: t("orderBy.label") },
        { id: "manual", label: t("orderBy.manual") },
        { id: "updated", label: t("orderBy.updated") }
      ],
      selectedIds: [groupBy, orderBy],
      onSelect: (id) => {
        if (id === "workspace" || id === "flat") onGroupPick(id);
        else if (id === "manual" || id === "updated") onOrderPick(id);
        setOpen(false);
      },
      align: "end",
      dense: true,
      portal: true,
      anchor: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("viewOptions.label"), side: "bottom", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: clsx_default(WorkspaceBrowser_default.iconButton, WorkspaceBrowser_default.wide),
          "aria-label": t("viewOptions.label"),
          onClick: () => {
            setOpen((v) => !v);
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconPersonalizationOutline16, {})
        }
      ) })
    }
  );
}
function workspaceGroupHalf(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
function SessionTree({
  useSessions,
  useSessionPendingInteraction,
  startSession,
  open,
  forkSession,
  workspaces,
  archivedSessionIds,
  workspaceReady,
  excludedSessionIds,
  onSessionDelete,
  onRenameRequest,
  onDeleteRequest,
  onSessionRename,
  onSessionArchive,
  insertWorkspaceBefore,
  insertSessionBefore,
  orderBy,
  groupExpansion,
  setGroupExpanded,
  sessionOrderByAccount,
  sessionUpdatedAtByAccount,
  syncSessionOrderAccount,
  setSessionOrder,
  home,
  t,
  revealSessionId,
  onSessionRevealed
}) {
  const list = useSessions((s) => s);
  const pendingInteractions = useSessionPendingInteraction((s) => s);
  const current = list.current;
  const revealGroup = revealSessionId === void 0 || !workspaceReady ? void 0 : owningGroupKey(workspaces, revealSessionId);
  const [expandedSessionGroups, setExpandedSessionGroups] = (0, import_react4.useState)([]);
  const [drag, setDrag] = (0, import_react4.useState)(null);
  const sessionDropCommitted = (0, import_react4.useRef)(false);
  const [workspaceDrag, setWorkspaceDrag] = (0, import_react4.useState)(null);
  const workspaceDropCommitted = (0, import_react4.useRef)(false);
  const previousOrderBy = (0, import_react4.useRef)(orderBy);
  const nativeDragActive = drag !== null || workspaceDrag !== null;
  useNativeDragAcceptance(nativeDragActive);
  const currentGroup = current === void 0 || !workspaceReady ? void 0 : owningGroupKey(workspaces, current);
  (0, import_react4.useEffect)(() => {
    if (current === void 0 || currentGroup === void 0 || Object.hasOwn(groupExpansion, currentGroup)) return;
    setGroupExpanded(currentGroup, true);
  }, [current, currentGroup, setGroupExpanded, groupExpansion]);
  const expandedGroups = (0, import_react4.useMemo)(
    () => Object.entries(groupExpansion).filter(([, expanded]) => expanded).map(([key]) => key),
    [groupExpansion]
  );
  const ungroupedSessionIds = (0, import_react4.useMemo)(() => {
    const accounted = new Set(workspaces.flatMap((workspace) => workspace.sessionIds));
    return list.ids.filter((id) => list.byId[id] !== void 0 && !accounted.has(id));
  }, [list, workspaces]);
  (0, import_react4.useEffect)(() => {
    if (list.phase !== "ready") return;
    const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";
    previousOrderBy.current = orderBy;
    const accounts = [
      ...workspaces.map((workspace) => ({
        key: workspace.workspaceId,
        sessionIds: workspace.sessionIds.filter((id) => list.byId[id] !== void 0)
      })),
      { key: UNGROUPED_KEY, sessionIds: ungroupedSessionIds }
    ];
    for (const { key, sessionIds } of accounts) {
      const previousOrder = sessionOrderByAccount[key];
      const previousUpdatedAt = sessionUpdatedAtByAccount[key] ?? {};
      const next = nextSessionOrderAccount({
        sessionIds,
        previousOrder,
        previousUpdatedAt,
        list,
        orderBy,
        sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)
      });
      if (next.changed) {
        syncSessionOrderAccount(key, next.order.map((id) => id), next.updatedAt);
      }
    }
  }, [list, orderBy, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, ungroupedSessionIds, workspaces]);
  const orderedWorkspaces = (0, import_react4.useMemo)(() => {
    return workspaces.map((workspace) => {
      const stored = sessionOrderByAccount[workspace.workspaceId];
      const sessionIds = reconciledSessionOrder(workspace.sessionIds, stored);
      return { ...workspace, sessionIds };
    });
  }, [sessionOrderByAccount, workspaces]);
  const orderedUngroupedSessionIds = (0, import_react4.useMemo)(
    () => reconciledSessionOrder(ungroupedSessionIds, sessionOrderByAccount[UNGROUPED_KEY]),
    [sessionOrderByAccount, ungroupedSessionIds]
  );
  const groups = (0, import_react4.useMemo)(
    () => deriveGroups(list, orderedWorkspaces, archivedSessionIds, pendingInteractions, {
      expandedGroups,
      ...sessionOrderByAccount[UNGROUPED_KEY] === void 0 ? {} : { ungroupedOrder: sessionOrderByAccount[UNGROUPED_KEY] }
    }, excludedSessionIds),
    [list, orderedWorkspaces, archivedSessionIds, pendingInteractions, expandedGroups, sessionOrderByAccount, excludedSessionIds]
  );
  (0, import_react4.useEffect)(() => {
    if (revealGroup === void 0 || groupExpansion[revealGroup] === true) return;
    setGroupExpanded(revealGroup, true);
  }, [groupExpansion, revealGroup, setGroupExpanded]);
  (0, import_react4.useEffect)(() => {
    if (revealSessionId === void 0 || revealGroup === void 0) return;
    const group = groups.find((candidate) => candidate.key === revealGroup);
    if (group === void 0 || !group.expanded || !group.sessions.some((row) => row.id === revealSessionId)) return;
    if (collapsedSessionRows(group.sessions).rows.some((row) => row.id === revealSessionId)) return;
    setExpandedSessionGroups((keys) => keys.includes(revealGroup) ? keys : [...keys, revealGroup]);
  }, [groups, revealGroup, revealSessionId]);
  const now = Date.now();
  const commitSessionDrag = (activeDrag, over) => {
    if (sessionDropCommitted.current) return;
    sessionDropCommitted.current = true;
    setDrag(null);
    const group = groups.find((candidate) => candidate.key === activeDrag.accountKey);
    if (group === void 0) return;
    const sessionsExpanded = expandedSessionGroups.includes(group.key);
    const renderedSessions = sessionsExpanded ? group.sessions : collapsedSessionRows(group.sessions).rows;
    const targetIndex = renderedSessions.findIndex((session) => session.id === over.id);
    if (targetIndex === -1) return;
    const sourceIndex = renderedSessions.findIndex((session) => session.id === activeDrag.sessionId);
    if (over.id === activeDrag.sessionId) return;
    const withoutSource = renderedSessions.filter((session) => session.id !== activeDrag.sessionId);
    const targetWithoutSourceIndex = withoutSource.findIndex((session) => session.id === over.id);
    if (targetWithoutSourceIndex === -1) return;
    const visibleInsertAt = over.half === "before" ? targetWithoutSourceIndex : targetWithoutSourceIndex + 1;
    if (sourceIndex !== -1 && visibleInsertAt === sourceIndex) return;
    const accountSessionIds = activeDrag.accountKey === UNGROUPED_KEY ? orderedUngroupedSessionIds : orderedWorkspaces.find((workspace) => workspace.workspaceId === activeDrag.accountKey)?.sessionIds;
    if (accountSessionIds === void 0) return;
    const nextOrder = accountSessionIds.filter((id) => id !== activeDrag.sessionId);
    let anchor;
    if (sessionsExpanded) {
      anchor = over.half === "before" ? over.id : renderedSessions[targetIndex + 1]?.id;
    } else {
      const previousVisible = withoutSource[visibleInsertAt - 1]?.id;
      if (previousVisible === void 0) {
        anchor = nextOrder[0];
      } else {
        const previousIndex = nextOrder.indexOf(previousVisible);
        if (previousIndex === -1) return;
        anchor = nextOrder[previousIndex + 1];
      }
    }
    const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
    nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId);
    if (!sessionsExpanded && sourceIndex !== -1) {
      const nodes = new Map(group.sessions.map((node) => [node.id, node]));
      const nextGroup = nextOrder.flatMap((id) => {
        const node = nodes.get(id);
        return node === void 0 ? [] : [node];
      });
      if (!collapsedSessionRows(nextGroup).rows.some((node) => node.id === activeDrag.sessionId)) return;
    }
    setSessionOrder(activeDrag.accountKey, nextOrder.map((id) => id));
    if (orderBy === "updated" || activeDrag.accountKey === UNGROUPED_KEY) return;
    insertSessionBefore(activeDrag.accountKey, activeDrag.sessionId, anchor).catch((reason) => {
      console.warn("session reorder rejected:", reason);
    });
  };
  const commitWorkspaceDrag = (activeDrag, over) => {
    if (workspaceDropCommitted.current) return;
    workspaceDropCommitted.current = true;
    setWorkspaceDrag(null);
    const rowIndex = workspaces.findIndex((workspace) => workspace.workspaceId === over.id);
    if (rowIndex === -1) return;
    const anchor = over.half === "before" ? over.id : workspaces[rowIndex + 1]?.workspaceId;
    if (anchor === activeDrag.workspaceId) return;
    const sourceIndex = workspaces.findIndex((workspace) => workspace.workspaceId === activeDrag.workspaceId);
    const anchorIndex = anchor === void 0 ? workspaces.length : workspaces.findIndex((workspace) => workspace.workspaceId === anchor);
    if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;
    insertWorkspaceBefore(activeDrag.workspaceId, anchor).catch((reason) => {
      console.warn("workspace reorder rejected:", reason);
    });
  };
  const workspaceDropAtListStart = groups[0]?.workspaceId !== void 0 && workspaceDrag?.over?.id === groups[0].workspaceId && workspaceDrag.over.half === "before";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.treeBody, WorkspaceBrowser_default.wide), children: [
    workspaceDropAtListStart && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: WorkspaceBrowser_default.listTopDropIndicator, "aria-hidden": "true" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "div",
      {
        className: clsx_default(WorkspaceBrowser_default.list, workspaceDropAtListStart && WorkspaceBrowser_default.listTopDropActive),
        role: "tree",
        "aria-label": t("section.sessions"),
        children: [
          groups.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.empty, children: t("empty.none") }),
          groups.map((group) => {
            const workspaceId = group.workspaceId;
            const collapsed = collapsedSessionRows(group.sessions);
            const sessionsExpanded = expandedSessionGroups.includes(group.key);
            const workspaceMarker = workspaceId !== void 0 && workspaceDrag?.over?.id === workspaceId ? workspaceDrag.over.half : null;
            const workspaceDragProps = workspaceId === void 0 ? void 0 : {
              start: () => {
                workspaceDropCommitted.current = false;
                setWorkspaceDrag({ workspaceId, over: null });
              },
              end: () => {
                if (workspaceDrag?.over !== null && workspaceDrag?.over !== void 0) {
                  commitWorkspaceDrag(workspaceDrag, workspaceDrag.over);
                } else {
                  setWorkspaceDrag(null);
                }
                workspaceDropCommitted.current = false;
              }
            };
            const hoverWorkspace = workspaceId === void 0 ? void 0 : (half) => {
              setWorkspaceDrag((active) => active === null ? active : { ...active, over: { id: workspaceId, half } });
            };
            const dropWorkspace = workspaceId === void 0 ? void 0 : (half) => {
              if (workspaceDrag === null) return;
              commitWorkspaceDrag(workspaceDrag, { id: workspaceId, half });
            };
            return (
              // Group section: header row + expanded top-level session rows. The
              // inter-group breathing room is the section's own margin
              // (WorkspaceBrowser.module.css).
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                "div",
                {
                  className: clsx_default(
                    WorkspaceBrowser_default.groupSection,
                    workspaceMarker === "before" && WorkspaceBrowser_default.workspaceDropBefore,
                    workspaceMarker === "after" && WorkspaceBrowser_default.workspaceDropAfter
                  ),
                  onDragOver: workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    hoverWorkspace(workspaceGroupHalf(e));
                  },
                  onDrop: workspaceDrag === null || dropWorkspace === void 0 ? void 0 : (e) => {
                    e.preventDefault();
                    dropWorkspace(workspaceGroupHalf(e));
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      ProjectRowItem,
                      {
                        group,
                        home,
                        t,
                        onToggle: () => {
                          if (group.expanded) {
                            setExpandedSessionGroups((keys) => keys.filter((key) => key !== group.key));
                          }
                          setGroupExpanded(group.key, !group.expanded);
                        },
                        onCreate: () => {
                          if (group.workspaceId !== void 0) {
                            setGroupExpanded(group.key, true);
                            startSession(group.workspaceId);
                          }
                        },
                        drag: workspaceDragProps,
                        actions: group.workspaceId === void 0 ? void 0 : {
                          rename: () => {
                            if (group.workspaceId !== void 0) onRenameRequest(group.workspaceId, group.label);
                          },
                          delete: () => {
                            if (group.workspaceId !== void 0) onDeleteRequest(group.workspaceId, group.label);
                          }
                        }
                      }
                    ),
                    (sessionsExpanded ? group.sessions : collapsed.rows).map((node) => {
                      const sameGroupDrag = drag !== null && drag.accountKey === group.key;
                      const dragProps = {
                        start: () => {
                          sessionDropCommitted.current = false;
                          setDrag({ accountKey: group.key, sessionId: node.id, over: null });
                        },
                        active: sameGroupDrag,
                        marker: sameGroupDrag && drag.over?.id === node.id ? drag.over.half : null,
                        hover: (half) => {
                          setDrag((d) => d === null ? d : { ...d, over: { id: node.id, half } });
                        },
                        drop: (half) => {
                          if (drag === null) return;
                          commitSessionDrag(drag, { id: node.id, half });
                        },
                        end: () => {
                          if (drag?.over !== null && drag?.over !== void 0) commitSessionDrag(drag, drag.over);
                          else setDrag(null);
                          sessionDropCommitted.current = false;
                        }
                      };
                      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                        SessionNodeItem,
                        {
                          node,
                          currentId: current,
                          now,
                          onOpen: open,
                          onRename: onSessionRename,
                          onFork: forkSession,
                          onArchive: onSessionArchive,
                          onDelete: onSessionDelete,
                          onReveal: node.id === revealSessionId && group.key === revealGroup ? () => {
                            onSessionRevealed(node.id);
                          } : void 0,
                          drag: dragProps,
                          t
                        },
                        node.id
                      );
                    }),
                    collapsed.hiddenCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      "button",
                      {
                        type: "button",
                        className: WorkspaceBrowser_default.sessionOverflowButton,
                        "aria-expanded": sessionsExpanded,
                        onClick: () => {
                          setExpandedSessionGroups((keys) => toggled(keys, group.key));
                        },
                        children: sessionsExpanded ? t("sessions.collapse") : t("sessions.expand", { n: collapsed.hiddenCount })
                      }
                    )
                  ]
                },
                group.key
              )
            );
          })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: WorkspaceBrowser_default.fade })
  ] });
}
function FlatList({
  useSessions,
  useSessionPendingInteraction,
  open,
  forkSession,
  onSessionRename,
  onSessionArchive,
  archivedSessionIds,
  excludedSessionIds,
  onSessionDelete,
  orderBy,
  sessionOrderByAccount,
  sessionUpdatedAtByAccount,
  syncSessionOrderAccount,
  setSessionOrder,
  revealSessionId,
  onSessionRevealed,
  t
}) {
  const list = useSessions((s) => s);
  const pendingInteractions = useSessionPendingInteraction((s) => s);
  const baseRows = (0, import_react4.useMemo)(
    () => deriveFlat(list, archivedSessionIds, pendingInteractions, excludedSessionIds),
    [list, archivedSessionIds, pendingInteractions, excludedSessionIds]
  );
  const sessionIds = (0, import_react4.useMemo)(() => baseRows.map((row) => row.id), [baseRows]);
  const previousOrderBy = (0, import_react4.useRef)(orderBy);
  (0, import_react4.useEffect)(() => {
    if (list.phase !== "ready") return;
    const previousOrder = sessionOrderByAccount[FLAT_SESSION_ORDER_KEY];
    const previousUpdatedAt = sessionUpdatedAtByAccount[FLAT_SESSION_ORDER_KEY] ?? {};
    const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";
    previousOrderBy.current = orderBy;
    const next = nextSessionOrderAccount({
      sessionIds,
      previousOrder,
      previousUpdatedAt,
      list,
      orderBy,
      sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)
    });
    if (next.changed) {
      syncSessionOrderAccount(FLAT_SESSION_ORDER_KEY, next.order.map((id) => id), next.updatedAt);
    }
  }, [list, orderBy, sessionOrderByAccount, sessionUpdatedAtByAccount, sessionIds, syncSessionOrderAccount]);
  const rows = (0, import_react4.useMemo)(() => {
    const byId = new Map(baseRows.map((row) => [row.id, row]));
    return reconciledSessionOrder(sessionIds, sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).flatMap((id) => {
      const row = byId.get(id);
      return row === void 0 ? [] : [row];
    });
  }, [baseRows, sessionOrderByAccount, sessionIds]);
  const [drag, setDrag] = (0, import_react4.useState)(null);
  const dropCommitted = (0, import_react4.useRef)(false);
  useNativeDragAcceptance(drag !== null);
  const commitDrag = (activeDrag, over) => {
    if (dropCommitted.current) return;
    dropCommitted.current = true;
    setDrag(null);
    const targetIndex = rows.findIndex((row) => row.id === over.id);
    if (targetIndex === -1) return;
    const anchor = over.half === "before" ? over.id : rows[targetIndex + 1]?.id;
    if (anchor === activeDrag.sessionId) return;
    const sourceIndex = rows.findIndex((row) => row.id === activeDrag.sessionId);
    const anchorIndex = anchor === void 0 ? rows.length : rows.findIndex((row) => row.id === anchor);
    if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;
    const nextOrder = rows.map((row) => row.id).filter((id) => id !== activeDrag.sessionId);
    const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
    nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId);
    setSessionOrder(FLAT_SESSION_ORDER_KEY, nextOrder.map((id) => id));
  };
  const now = Date.now();
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.treeBody, WorkspaceBrowser_default.wide), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.list, WorkspaceBrowser_default.flatList), role: "tree", "aria-label": t("section.sessions"), children: [
      rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.empty, children: t("empty.none") }),
      rows.map((node) => {
        const active = drag !== null;
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          SessionNodeItem,
          {
            node,
            currentId: list.current,
            now,
            onOpen: open,
            onRename: onSessionRename,
            onFork: forkSession,
            onArchive: onSessionArchive,
            onDelete: onSessionDelete,
            onReveal: node.id === revealSessionId ? () => {
              onSessionRevealed(node.id);
            } : void 0,
            flat: true,
            drag: {
              start: () => {
                dropCommitted.current = false;
                setDrag({ accountKey: FLAT_SESSION_ORDER_KEY, sessionId: node.id, over: null });
              },
              active,
              marker: active && drag.over?.id === node.id ? drag.over.half : null,
              hover: (half) => {
                setDrag((current) => current === null ? current : { ...current, over: { id: node.id, half } });
              },
              drop: (half) => {
                if (drag !== null) commitDrag(drag, { id: node.id, half });
              },
              end: () => {
                if (drag?.over !== null && drag?.over !== void 0) commitDrag(drag, drag.over);
                else setDrag(null);
                dropCommitted.current = false;
              }
            },
            t
          },
          node.id
        );
      })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: WorkspaceBrowser_default.fade })
  ] });
}
function SearchResults({
  useSessions,
  useSessionPendingInteraction,
  open,
  workspaces,
  archivedSessionIds,
  query,
  remote,
  resultLimit,
  excludedSessionIds,
  t
}) {
  const list = useSessions((s) => s);
  const pendingInteractions = useSessionPendingInteraction((s) => s);
  const currentRemote = remote.query === query ? remote : { query, status: "loading", items: [], hasMore: false };
  const results = (0, import_react4.useMemo)(() => {
    const derived = deriveSearchResults(
      list,
      workspaces,
      query,
      archivedSessionIds,
      pendingInteractions,
      currentRemote,
      resultLimit
    );
    return {
      ...derived,
      items: derived.items.filter((row) => !excludedSessionIds.has(row.id)),
      hasMore: derived.hasMore
    };
  }, [list, workspaces, query, archivedSessionIds, pendingInteractions, currentRemote, resultLimit, excludedSessionIds]);
  const pending = currentRemote.status === "loading";
  const failed = currentRemote.status === "error";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.treeBody, WorkspaceBrowser_default.wide), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: WorkspaceBrowser_default.list, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.searchTree, role: "tree", "aria-label": t("search.results.aria"), children: results.items.map((result) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        SearchResultItem,
        {
          result,
          currentId: list.current,
          onOpen: open,
          t
        },
        result.id
      )) }),
      pending && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.searchStatus, role: "status", children: t("search.pending") }),
      failed && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.searchWarning, role: "status", children: t("search.unavailable") }),
      !pending && results.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.empty, children: t("search.noMatches") }),
      results.hasMore && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.searchStatus, children: t("search.hasMore", { n: resultLimit }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: WorkspaceBrowser_default.fade })
  ] });
}
function WorkspaceBrowser({
  wide,
  expandSidebar,
  useSessions,
  useSessionPendingInteraction,
  useWorkspaces,
  useStore,
  actions,
  startSession,
  open,
  renameSession,
  forkSession,
  renameWorkspace,
  deleteWorkspace,
  insertWorkspaceBefore,
  archiveSession,
  insertSessionBefore,
  createWorkspace,
  searchSessions,
  searchResultLimit,
  useDirectoryFlow,
  useHostInfo,
  useChat,
  deleteSession,
  chatSearch,
  startChat,
  renderSlot,
  t
}) {
  const home = useHostInfo((info) => info.home);
  const workspaces = useWorkspaces((state) => state.items);
  const workspacePhase = useWorkspaces((state) => state.phase);
  const workspaceStreamState = useWorkspaces((state) => state.state);
  const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
  const directoryFlowAvailable = useDirectoryFlow((occupied) => occupied);
  const chatSnapshot = useChat((s) => s);
  const chatRoot = typeof chatSnapshot?.root === "string" ? chatSnapshot.root : null;
  const listSnapshot = useSessions((s) => s);
  const chatSessionIds = (0, import_react4.useMemo)(() => {
    const ids = /* @__PURE__ */ new Set();
    if (chatRoot !== null) {
      for (const id of listSnapshot.ids) {
        const session = listSnapshot.byId[id];
        if (session !== void 0 && session.cwd !== void 0 && isUnderChatRoot(session.cwd, chatRoot)) ids.add(id);
      }
    }
    return ids;
  }, [listSnapshot, chatRoot]);
  const workspaceAreaWorkspaces = (0, import_react4.useMemo)(
    () => chatRoot === null ? workspaces : workspaces.filter((workspace) => !isUnderChatRoot(workspace.path, chatRoot)),
    [workspaces, chatRoot]
  );
  const deletedIds = (0, import_react4.useSyncExternalStore)(deletedIdsSource.subscribe, deletedIdsSource.getSnapshot);
  const excludedSessionIds = (0, import_react4.useMemo)(() => {
    const set = new Set(chatSessionIds);
    for (const id of deletedIds) set.add(id);
    return set;
  }, [chatSessionIds, deletedIds]);
  (0, import_react4.useEffect)(() => {
    if (listSnapshot.phase !== "ready") return;
    if (deletedIds.size === 0) return;
    pruneDeletedIds(new Set(listSnapshot.ids));
  }, [listSnapshot, deletedIds]);
  (0, import_react4.useEffect)(() => {
    setChatRuntimeSnapshot({
      currentId: listSnapshot.current,
      chatIds: chatSessionIds,
      workspaces: workspaces.map((workspace) => ({
        path: workspace.path,
        workspaceId: workspace.workspaceId
      }))
    });
  }, [listSnapshot, chatSessionIds, workspaces]);
  const splitRef = (0, import_react4.useRef)(null);
  const [splitRatio, setSplitRatio] = (0, import_react4.useState)(0.5);
  const startSplitDrag = (e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const el = splitRef.current;
      if (el === null) return;
      const rect = el.getBoundingClientRect();
      if (rect.height < 1) return;
      const minFrac = Math.min(80 / rect.height, 0.45);
      setSplitRatio(Math.min(1 - minFrac, Math.max(minFrac, (ev.clientY - rect.top) / rect.height)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const groupBy = useStore((s) => s.groupBy);
  const orderBy = useStore((s) => s.orderBy);
  const groupExpansion = useStore((s) => s.groupExpansion);
  const sessionOrderByAccount = useStore((s) => s.sessionOrderByAccount);
  const sessionUpdatedAtByAccount = useStore((s) => s.sessionUpdatedAtByAccount);
  const currentBlankSessionId = useSessions((state) => {
    const current = state.current;
    return current !== void 0 && state.byId[current]?.blank === true ? current : void 0;
  });
  const currentBlankAccount = currentBlankSessionId === void 0 || workspacePhase !== "ready" ? void 0 : owningGroupKey(workspaces, currentBlankSessionId);
  const promotedBlank = (0, import_react4.useRef)(void 0);
  (0, import_react4.useEffect)(() => {
    if (currentBlankSessionId === void 0 || currentBlankAccount === void 0) {
      promotedBlank.current = void 0;
      return;
    }
    const promoted = promotedBlank.current;
    if (promoted !== void 0 && promoted.sessionId === currentBlankSessionId && promoted.accountKey === currentBlankAccount) return;
    promotedBlank.current = { sessionId: currentBlankSessionId, accountKey: currentBlankAccount };
    for (const accountKey of /* @__PURE__ */ new Set([currentBlankAccount, FLAT_SESSION_ORDER_KEY])) {
      const previous = sessionOrderByAccount[accountKey] ?? [];
      actions.setSessionOrder(accountKey, [
        currentBlankSessionId,
        ...previous.filter((id) => id !== currentBlankSessionId)
      ]);
    }
  }, [actions.setSessionOrder, currentBlankAccount, currentBlankSessionId, sessionOrderByAccount]);
  (0, import_react4.useEffect)(() => {
    if (workspacePhase !== "ready") return;
    actions.retainAccountKeys([
      UNGROUPED_KEY,
      FLAT_SESSION_ORDER_KEY,
      ...workspaceAreaWorkspaces.map((workspace) => workspace.workspaceId)
    ]);
  }, [actions.retainAccountKeys, workspacePhase, workspaceAreaWorkspaces]);
  const [query, setQuery] = (0, import_react4.useState)("");
  const [searchExpanded, setSearchExpanded] = (0, import_react4.useState)(false);
  const [revealSessionId, setRevealSessionId] = (0, import_react4.useState)(void 0);
  const normalizedQuery = sanitizeSearchQuery(query).trim();
  const [remoteSearch, setRemoteSearch] = (0, import_react4.useState)({
    query: "",
    status: "idle",
    items: [],
    hasMore: false
  });
  const searchRoot = (0, import_react4.useRef)(null);
  const searchInput = (0, import_react4.useRef)(null);
  const [wsPickerOpen, setWsPickerOpen] = (0, import_react4.useState)(false);
  const wsPlusRef = (0, import_react4.useRef)(null);
  const composingRef = (0, import_react4.useRef)(false);
  const openSearchResult = (sessionId) => {
    setRevealSessionId(sessionId);
    setQuery("");
    setSearchExpanded(false);
    open(sessionId);
  };
  const acknowledgeSessionReveal = (sessionId) => {
    setRevealSessionId((current) => current === sessionId ? void 0 : current);
  };
  (0, import_react4.useEffect)(() => {
    if (normalizedQuery !== "") setRevealSessionId(void 0);
  }, [normalizedQuery]);
  const [searchOnExpand, setSearchOnExpand] = (0, import_react4.useState)(false);
  (0, import_react4.useEffect)(() => {
    if (wide && searchOnExpand) {
      const timer = window.setTimeout(() => {
        searchInput.current?.focus({ preventScroll: true });
        setSearchOnExpand(false);
      }, EXPAND_SLIDE_MS);
      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [wide, searchOnExpand]);
  (0, import_react4.useEffect)(() => {
    if (!wide || !searchExpanded || searchOnExpand) return;
    searchInput.current?.focus({ preventScroll: true });
  }, [wide, searchExpanded, searchOnExpand]);
  (0, import_react4.useEffect)(() => {
    if (!wide || !searchExpanded || searchOnExpand) return;
    const onClick = (event) => {
      if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target) === true) return;
      searchInput.current?.blur();
      if (normalizedQuery !== "") return;
      setSearchExpanded(false);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [normalizedQuery, wide, searchExpanded, searchOnExpand]);
  (0, import_react4.useEffect)(() => {
    if (normalizedQuery === "") {
      setRemoteSearch({ query: "", status: "idle", items: [], hasMore: false });
      return;
    }
    const controller = new AbortController();
    setRemoteSearch({
      query: normalizedQuery,
      status: "loading",
      items: [],
      hasMore: false
    });
    const timer = window.setTimeout(() => {
      searchSessions(normalizedQuery, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setRemoteSearch({
          query: normalizedQuery,
          status: "ready",
          items: result.items,
          hasMore: result.hasMore
        });
      }).catch(() => {
        if (controller.signal.aborted) return;
        setRemoteSearch({
          query: normalizedQuery,
          status: "error",
          items: [],
          hasMore: false
        });
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, searchSessions]);
  const [renameTarget, setRenameTarget] = (0, import_react4.useState)(null);
  const [renameDraft, setRenameDraft] = (0, import_react4.useState)("");
  const [renaming, setRenaming] = (0, import_react4.useState)(false);
  const [renameError, setRenameError] = (0, import_react4.useState)(null);
  const renameTrimmed = renameDraft.trim();
  const renameDuplicate = renameTarget !== null && renameTrimmed !== "" && renameTrimmed !== renameTarget.currentTitle && workspaces.some((w) => w.title === renameTrimmed);
  const renameBlocked = renaming || renameTrimmed === "" || renameTarget === null || renameTrimmed === renameTarget.currentTitle || renameDuplicate;
  const closeRename = () => {
    if (renaming) return;
    setRenameTarget(null);
    setRenameError(null);
  };
  const confirmRename = () => {
    if (renameBlocked) return;
    setRenaming(true);
    setRenameError(null);
    renameWorkspace(renameTarget.workspaceId, renameTrimmed).then(() => {
      setRenaming(false);
      setRenameTarget(null);
    }).catch((reason) => {
      setRenaming(false);
      setRenameError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  const [sessionRenameTarget, setSessionRenameTarget] = (0, import_react4.useState)(null);
  const [sessionRenameDraft, setSessionRenameDraft] = (0, import_react4.useState)("");
  const [sessionRenaming, setSessionRenaming] = (0, import_react4.useState)(false);
  const [sessionRenameError, setSessionRenameError] = (0, import_react4.useState)(null);
  const sessionRenameTrimmed = sessionRenameDraft.trim();
  const sessionRenameBlocked = sessionRenaming || sessionRenameTrimmed === "" || sessionRenameTarget === null;
  const closeSessionRename = () => {
    if (sessionRenaming) return;
    setSessionRenameTarget(null);
    setSessionRenameError(null);
  };
  const confirmSessionRename = () => {
    if (sessionRenameBlocked) return;
    setSessionRenaming(true);
    setSessionRenameError(null);
    renameSession(sessionRenameTarget.sessionId, sessionRenameTrimmed).then(() => {
      setSessionRenaming(false);
      setSessionRenameTarget(null);
    }).catch((reason) => {
      setSessionRenaming(false);
      setSessionRenameError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  const onSessionRename = (sessionId, currentTitle) => {
    setSessionRenameTarget({ sessionId, currentTitle });
    setSessionRenameDraft(currentTitle);
    setSessionRenameError(null);
  };
  const onSessionArchive = (sessionId) => {
    archiveSession(sessionId).catch((reason) => {
      console.warn("session archive rejected:", reason);
    });
  };
  const [deleteTarget, setDeleteTarget] = (0, import_react4.useState)(null);
  const [deleting, setDeleting] = (0, import_react4.useState)(false);
  const [deleteCommittedId, setDeleteCommittedId] = (0, import_react4.useState)(null);
  const [deleteError, setDeleteError] = (0, import_react4.useState)(null);
  (0, import_react4.useEffect)(() => {
    if (deleteCommittedId === null || workspaces.some((workspace) => workspace.workspaceId === deleteCommittedId)) return;
    setDeleting(false);
    setDeleteCommittedId(null);
    setDeleteTarget(null);
  }, [deleteCommittedId, workspaces]);
  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };
  const confirmDelete = () => {
    if (deleting || deleteTarget === null) return;
    setDeleting(true);
    setDeleteCommittedId(null);
    setDeleteError(null);
    deleteWorkspace(deleteTarget.workspaceId).then(() => {
      setDeleteCommittedId(deleteTarget.workspaceId);
    }).catch((reason) => {
      setDeleting(false);
      setDeleteError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  const [sessionDeleteTarget, setSessionDeleteTarget] = (0, import_react4.useState)(null);
  const [sessionDeleting, setSessionDeleting] = (0, import_react4.useState)(false);
  const [sessionDeleteError, setSessionDeleteError] = (0, import_react4.useState)(null);
  const onSessionDelete = (sessionId, title) => {
    setSessionDeleteTarget({ sessionId, title });
    setSessionDeleteError(null);
  };
  const closeSessionDelete = () => {
    if (sessionDeleting) return;
    setSessionDeleteTarget(null);
    setSessionDeleteError(null);
  };
  const confirmSessionDelete = () => {
    if (sessionDeleting || sessionDeleteTarget === null) return;
    setSessionDeleting(true);
    setSessionDeleteError(null);
    performSessionDelete(sessionDeleteTarget.sessionId).then(() => {
      setSessionDeleting(false);
      setSessionDeleteTarget(null);
    }).catch((reason) => {
      setSessionDeleting(false);
      setSessionDeleteError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  const sessionTreeProps = {
    useSessions,
    useSessionPendingInteraction,
    onSessionRename,
    onSessionArchive,
    onSessionDelete,
    forkSession,
    archivedSessionIds,
    excludedSessionIds,
    orderBy,
    sessionOrderByAccount,
    sessionUpdatedAtByAccount,
    syncSessionOrderAccount: actions.syncSessionOrderAccount,
    setSessionOrder: actions.setSessionOrder,
    revealSessionId,
    onSessionRevealed: acknowledgeSessionReveal,
    home,
    t,
    onRenameRequest: (workspaceId, currentTitle) => {
      setRenameTarget({ workspaceId, currentTitle });
      setRenameDraft(currentTitle);
      setRenameError(null);
    },
    onDeleteRequest: (workspaceId, title) => {
      setDeleteTarget({ workspaceId, title });
      setDeleteError(null);
    }
  };
  const flatListProps = {
    useSessions,
    useSessionPendingInteraction,
    forkSession,
    onSessionRename,
    onSessionArchive,
    onSessionDelete,
    archivedSessionIds,
    excludedSessionIds,
    orderBy,
    sessionOrderByAccount,
    sessionUpdatedAtByAccount,
    syncSessionOrderAccount: actions.syncSessionOrderAccount,
    setSessionOrder: actions.setSessionOrder,
    revealSessionId,
    onSessionRevealed: acknowledgeSessionReveal,
    t
  };
  const listBody = normalizedQuery !== "" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    SearchResults,
    {
      useSessions,
      useSessionPendingInteraction,
      open: openSearchResult,
      workspaces,
      archivedSessionIds,
      query: normalizedQuery,
      remote: remoteSearch,
      resultLimit: searchResultLimit,
      excludedSessionIds,
      t
    }
  ) : groupBy === "flat" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    FlatList,
    {
      ...flatListProps,
      open
    }
  ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    SessionTree,
    {
      ...sessionTreeProps,
      workspaces: workspaceAreaWorkspaces,
      workspaceReady: workspacePhase === "ready" && workspaceStreamState !== "loading",
      groupExpansion,
      setGroupExpanded: actions.setGroupExpanded,
      startSession,
      open,
      insertWorkspaceBefore,
      insertSessionBefore
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.root, !wide && WorkspaceBrowser_default.rail), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: WorkspaceBrowser_default.sectionHeader, children: [
      wide && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: clsx_default(WorkspaceBrowser_default.sectionLabel, WorkspaceBrowser_default.wide, searchExpanded && WorkspaceBrowser_default.sectionLabelHidden), children: groupBy === "flat" ? t("section.sessions") : t("section.workspaces") }),
      wide && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: clsx_default(WorkspaceBrowser_default.searchSlot, searchExpanded && WorkspaceBrowser_default.searchSlotExpanded), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "div",
        {
          ref: searchRoot,
          className: clsx_default(WorkspaceBrowser_default.search, searchExpanded && WorkspaceBrowser_default.searchExpanded),
          onClick: () => {
            setWsPickerOpen(false);
            setSearchExpanded(true);
            searchInput.current?.focus();
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("search"), side: "bottom", delayMs: 500, disabled: searchExpanded, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                className: WorkspaceBrowser_default.searchButton,
                "aria-label": t("search.sessions.aria"),
                "aria-expanded": searchExpanded,
                onClick: () => {
                  setWsPickerOpen(false);
                  setSearchExpanded(true);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconSearchOutline16, { size: searchExpanded ? 11 : 14 })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                ref: searchInput,
                className: WorkspaceBrowser_default.searchInput,
                type: "text",
                placeholder: t("search.placeholder"),
                maxLength: SEARCH_QUERY_MAX_CODE_UNITS,
                value: query,
                tabIndex: searchExpanded ? 0 : -1,
                onChange: (e) => {
                  setQuery(sanitizeSearchQuery(e.target.value));
                },
                onKeyDown: (e) => {
                  if (e.key !== "Escape") return;
                  setQuery("");
                  setSearchExpanded(false);
                }
              }
            ),
            searchExpanded && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                className: WorkspaceBrowser_default.clearButton,
                "aria-label": t("search.clear"),
                onClick: (e) => {
                  e.stopPropagation();
                  setQuery("");
                  setSearchExpanded(false);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconCloseFill14, {})
              }
            )
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.headerActions, wide && searchExpanded && WorkspaceBrowser_default.headerActionsHidden), children: [
        wide && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          ViewOptionsMenu,
          {
            groupBy,
            orderBy,
            onGroupPick: (mode) => {
              actions.setGroupBy(mode);
            },
            onOrderPick: (mode) => {
              actions.setOrderBy(mode);
            },
            t
          }
        ),
        directoryFlowAvailable && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("workspace.add"), side: "bottom", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            ref: wsPlusRef,
            type: "button",
            className: WorkspaceBrowser_default.iconButton,
            "aria-label": t("workspace.add"),
            onClick: () => {
              setWsPickerOpen((v) => !v);
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconProjectAddOutline16, { size: wide ? 16 : 18 })
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        WorkspacePickFlow,
        {
          t,
          open: wsPickerOpen,
          anchorRef: wsPlusRef,
          useWorkspaces,
          createWorkspace,
          useDirectoryFlow,
          renderDirectoryFlow: (owner) => renderSlot("sidebar.workspaces.directoryFlow", owner),
          addOnly: true,
          side: "right",
          onPick: (workspaceId) => {
            setWsPickerOpen(false);
            startSession(workspaceId);
          },
          onClose: () => {
            setWsPickerOpen(false);
          }
        }
      )
    ] }),
    !wide && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.search, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("search"), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "button",
      {
        type: "button",
        className: WorkspaceBrowser_default.searchButton,
        "aria-label": t("search.sessions.aria"),
        onClick: () => {
          setSearchExpanded(true);
          setSearchOnExpand(true);
          expandSidebar();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconSearchOutline16, { size: 18 })
      }
    ) }) }),
    wide ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { ref: splitRef, className: WorkspaceBrowser_default.split, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.pane, style: { flexBasis: `${(splitRatio * 100).toFixed(2)}%` }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.listArea, children: listBody }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.divider, onMouseDown: startSplitDrag }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.pane, style: { flexBasis: `${((1 - splitRatio) * 100).toFixed(2)}%` }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        ChatSection,
        {
          wide,
          useSessions,
          useSessionPendingInteraction,
          useWorkspaces,
          useChat,
          deletedSessionIds: deletedIds,
          open,
          onRename: onSessionRename,
          onFork: forkSession,
          onArchive: onSessionArchive,
          onDelete: onSessionDelete,
          onNewChat: () => {
            runChatFlow(startChat);
          },
          searchChats: chatSearch,
          t
        }
      ) })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.listArea, children: listBody }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      import_dsh_client_ui_primitives4.Modal,
      {
        open: renameTarget !== null,
        onClose: closeRename,
        closeLabel: t("close"),
        title: t("rename.workspace.title"),
        footer: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "outline", disabled: renaming, onClick: closeRename, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "primary", disabled: renameBlocked, onClick: confirmRename, children: t("rename") })
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              className: WorkspaceBrowser_default.renameInput,
              value: renameDraft,
              "aria-label": t("field.workspaceName"),
              autoFocus: true,
              disabled: renaming,
              onFocus: (e) => {
                e.target.select();
              },
              onChange: (e) => {
                setRenameDraft(e.target.value);
                setRenameError(null);
              },
              onCompositionStart: () => {
                composingRef.current = true;
              },
              onCompositionEnd: () => {
                composingRef.current = false;
              },
              onKeyDown: (e) => {
                if (e.key === "Enter" && !composingRef.current) {
                  e.preventDefault();
                  confirmRename();
                }
              }
            }
          ),
          renameDuplicate && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: t("conflict.named", { name: renameTrimmed }) }),
          renameError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: renameError })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      import_dsh_client_ui_primitives4.Modal,
      {
        open: sessionRenameTarget !== null,
        onClose: closeSessionRename,
        closeLabel: t("close"),
        title: t("rename.session.title"),
        footer: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "outline", disabled: sessionRenaming, onClick: closeSessionRename, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "primary", disabled: sessionRenameBlocked, onClick: confirmSessionRename, children: t("rename") })
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              className: WorkspaceBrowser_default.renameInput,
              value: sessionRenameDraft,
              "aria-label": t("field.sessionName"),
              autoFocus: true,
              disabled: sessionRenaming,
              onFocus: (e) => {
                e.target.select();
              },
              onChange: (e) => {
                setSessionRenameDraft(e.target.value);
                setSessionRenameError(null);
              },
              onCompositionStart: () => {
                composingRef.current = true;
              },
              onCompositionEnd: () => {
                composingRef.current = false;
              },
              onKeyDown: (e) => {
                if (e.key === "Enter" && !composingRef.current) {
                  e.preventDefault();
                  confirmSessionRename();
                }
              }
            }
          ),
          sessionRenameError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: sessionRenameError })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      import_dsh_client_ui_primitives4.Modal,
      {
        open: deleteTarget !== null,
        onClose: closeDelete,
        closeLabel: t("close"),
        title: t("delete.workspace"),
        ...deleteTarget === null ? {} : { description: t("delete.desc", { name: deleteTarget.title }) },
        footer: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "outline", disabled: deleting, onClick: closeDelete, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            import_dsh_client_ui_primitives4.Button,
            {
              variant: "outline",
              className: WorkspaceBrowser_default.deleteAction,
              disabled: deleting,
              onClick: confirmDelete,
              children: t("delete.workspace")
            }
          )
        ] }),
        children: [
          deleting && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.deleteStatus, role: "status", children: t("delete.pending") }),
          deleteError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: deleteError })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      import_dsh_client_ui_primitives4.Modal,
      {
        open: sessionDeleteTarget !== null,
        onClose: closeSessionDelete,
        closeLabel: t("close"),
        title: t("delete.session"),
        ...sessionDeleteTarget === null ? {} : { description: t("delete.session.desc", { name: sessionDeleteTarget.title }) },
        footer: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "outline", disabled: sessionDeleting, onClick: closeSessionDelete, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            import_dsh_client_ui_primitives4.Button,
            {
              variant: "outline",
              className: WorkspaceBrowser_default.deleteAction,
              disabled: sessionDeleting,
              onClick: confirmSessionDelete,
              children: t("delete.session")
            }
          )
        ] }),
        children: [
          sessionDeleting && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.deleteStatus, role: "status", children: t("delete.session.pending") }),
          sessionDeleteError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: sessionDeleteError })
        ]
      }
    )
  ] });
}

// src/client/locales.ts
var zh = {
  "group.ungrouped": "\u672A\u5206\u7EC4",
  "session.new": "\u65B0\u4F1A\u8BDD",
  "section.workspaces": "\u5DE5\u4F5C\u533A",
  "section.sessions": "\u4F1A\u8BDD",
  "viewOptions.label": "\u89C6\u56FE\u9009\u9879",
  "groupBy.label": "\u5206\u7EC4\u65B9\u5F0F",
  "groupBy.workspace": "\u6309\u5DE5\u4F5C\u533A",
  "groupBy.flat": "\u5355\u5217\u8868",
  "orderBy.label": "\u6392\u5E8F\u65B9\u5F0F",
  "orderBy.manual": "\u624B\u52A8\u6392\u5E8F",
  "orderBy.updated": "\u6700\u8FD1\u66F4\u65B0",
  "sessions.expand": "\u5C55\u5F00\u5176\u4F59 {n} \u4E2A\u4F1A\u8BDD",
  "sessions.collapse": "\u6536\u8D77",
  "empty.none": "\u6682\u65E0\u4F1A\u8BDD",
  "empty.noMatches": "\u65E0\u5339\u914D\u7ED3\u679C",
  "workspace.add": "\u6DFB\u52A0\u5DE5\u4F5C\u533A",
  "search.sessions.aria": "\u641C\u7D22\u4F1A\u8BDD",
  "search.placeholder": "\u641C\u7D22\u4F1A\u8BDD\u2026",
  "search.clear": "\u6E05\u9664\u641C\u7D22",
  "search.results.aria": "\u641C\u7D22\u7ED3\u679C",
  "search.pending": "\u6B63\u5728\u641C\u7D22\u4F1A\u8BDD\u5386\u53F2\u2026",
  "search.unavailable": "\u5185\u5BB9\u641C\u7D22\u6682\u4E0D\u53EF\u7528\uFF0C\u4EC5\u663E\u793A\u540D\u79F0\u5339\u914D\u3002",
  "search.noMatches": "\u65E0\u5339\u914D\u4F1A\u8BDD",
  "search.hasMore": "\u4EC5\u663E\u793A\u524D {n} \u6761\u7ED3\u679C\uFF0C\u8BF7\u7F29\u5C0F\u641C\u7D22\u8303\u56F4\u3002",
  "menu.addWorkspace": "\u6DFB\u52A0\u5DE5\u4F5C\u533A\u2026",
  "picker.loading": "\u6B63\u5728\u52A0\u8F7D\u5DE5\u4F5C\u533A\u2026",
  "conflict.named": "\u5DF2\u5B58\u5728\u540D\u4E3A\u201C{name}\u201D\u7684\u5DE5\u4F5C\u533A\u3002",
  "folderError.title": "\u65E0\u6CD5\u6253\u5F00\u6587\u4EF6\u5939",
  "folderError.retry": "\u91CD\u65B0\u9009\u62E9",
  "rename": "\u91CD\u547D\u540D",
  "rename.workspace.title": "\u91CD\u547D\u540D\u5DE5\u4F5C\u533A",
  "rename.session.title": "\u91CD\u547D\u540D\u4F1A\u8BDD",
  "field.workspaceName": "\u5DE5\u4F5C\u533A\u540D\u79F0",
  "field.sessionName": "\u4F1A\u8BDD\u540D\u79F0",
  "delete.workspace": "\u5220\u9664\u5DE5\u4F5C\u533A",
  "delete.desc": "\u5C06\u628A\u201C{name}\u201D\u4ECE\u5DE5\u4F5C\u533A\u5217\u8868\u4E2D\u79FB\u9664\u3002\u6587\u4EF6\u5939\u4E0E\u4F1A\u8BDD\u8BB0\u5F55\u4F1A\u4FDD\u7559\uFF0C\u5176\u4F1A\u8BDD\u5C06\u663E\u793A\u5728\u201C\u672A\u5206\u7EC4\u201D\u4E0B\u3002",
  "delete.pending": "\u6B63\u5728\u5220\u9664\u5DE5\u4F5C\u533A\u2026",
  "menu.fork": "\u5206\u53C9\u4F1A\u8BDD",
  "menu.archiveSession": "\u5F52\u6863\u4F1A\u8BDD",
  "menu.deleteSession": "\u5220\u9664\u4F1A\u8BDD",
  "delete.session": "\u5220\u9664\u4F1A\u8BDD",
  "delete.session.desc": "\u5C06\u5220\u9664\u201C{name}\u201D\u7684\u804A\u5929\u8BB0\u5F55\u3002\u5176\u6587\u4EF6\u5939\u4F1A\u4FDD\u7559\u5728\u78C1\u76D8\u4E0A\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  "delete.session.pending": "\u6B63\u5728\u5220\u9664\u4F1A\u8BDD\u2026",
  "chat.section": "\u804A\u5929",
  "chat.add": "\u65B0\u5EFA\u804A\u5929",
  "chat.empty": "\u6682\u65E0\u804A\u5929",
  "chat.search.placeholder": "\u641C\u7D22\u804A\u5929\u2026",
  "chat.search.aria": "\u641C\u7D22\u804A\u5929",
  "sessions.count.one": "{n} \u4E2A\u4F1A\u8BDD",
  "sessions.count.other": "{n} \u4E2A\u4F1A\u8BDD",
  "actions.workspace.aria": "\u5DE5\u4F5C\u533A\u201C{name}\u201D\u7684\u64CD\u4F5C",
  "actions.session.aria": "\u4F1A\u8BDD\u201C{name}\u201D\u7684\u64CD\u4F5C",
  "actions.newSession.aria": "\u5728\u201C{name}\u201D\u4E2D\u65B0\u5EFA\u4F1A\u8BDD",
  "status.running": "\u8FDB\u884C\u4E2D",
  "status.subagentsRunning.one": "{n} \u4E2A\u5B50\u4EE3\u7406\u8FD0\u884C\u4E2D",
  "status.subagentsRunning.other": "{n} \u4E2A\u5B50\u4EE3\u7406\u8FD0\u884C\u4E2D",
  "status.idle": "\u7A7A\u95F2",
  "status.waitingApproval": "\u7B49\u5F85\u5BA1\u6279",
  "status.planReview": "\u8BA1\u5212\u5F85\u5BA1",
  "status.waitingAnswer": "\u7B49\u5F85\u56DE\u7B54",
  "status.completed": "\u5DF2\u5B8C\u6210",
  "schedule.active": "\u6709\u6D3B\u52A8\u5B9A\u65F6\u4EFB\u52A1",
  "hover.created": "\u521B\u5EFA\u4E8E {time}",
  "hover.copied": "\u5DF2\u590D\u5236",
  "date.ymd": "{y}\u5E74{m}\u6708{d}\u65E5",
  "time.now": "\u521A\u521A",
  "time.minutes": "{n}\u5206\u949F",
  "time.hours": "{n}\u5C0F\u65F6",
  "time.days": "{n}\u5929",
  "time.months": "{n}\u4E2A\u6708",
  "time.years": "{n}\u5E74",
  "time.ago": "{t}\u524D"
};
var en = {
  "group.ungrouped": "Ungrouped",
  "session.new": "New Session",
  "section.workspaces": "Workspaces",
  "section.sessions": "Sessions",
  "viewOptions.label": "View options",
  "groupBy.label": "Group by",
  "groupBy.workspace": "WorkSpace",
  "groupBy.flat": "In one list",
  "orderBy.label": "Order by",
  "orderBy.manual": "Manual",
  "orderBy.updated": "Last updated",
  "sessions.expand": "Show {n} more sessions",
  "sessions.collapse": "Show less",
  "empty.none": "No sessions yet",
  "empty.noMatches": "No matches",
  "workspace.add": "Add workspace",
  "search.sessions.aria": "Search sessions",
  "search.placeholder": "Search sessions...",
  "search.clear": "Clear search",
  "search.results.aria": "Search results",
  "search.pending": "Searching session history\u2026",
  "search.unavailable": "Content search is temporarily unavailable. Showing name matches.",
  "search.noMatches": "No matching sessions",
  "search.hasMore": "Showing the first {n} results. Narrow your search.",
  "menu.addWorkspace": "Add workspace\u2026",
  "picker.loading": "Loading workspaces\u2026",
  "conflict.named": "A workspace named \u201C{name}\u201D already exists.",
  "folderError.title": "Couldn\u2019t open folder",
  "folderError.retry": "Choose again",
  "rename": "Rename",
  "rename.workspace.title": "Rename workspace",
  "rename.session.title": "Rename session",
  "field.workspaceName": "Workspace name",
  "field.sessionName": "Session name",
  "delete.workspace": "Delete workspace",
  "delete.desc": "This removes \u201C{name}\u201D from the workspace list. The folder and session logs will be kept. Its sessions will appear under Ungrouped.",
  "delete.pending": "Deleting workspace\u2026",
  "menu.fork": "Fork session",
  "menu.archiveSession": "Archive session",
  "menu.deleteSession": "Delete session",
  "delete.session": "Delete session",
  "delete.session.desc": "This deletes the conversation record of \u201C{name}\u201D. Its folder is kept on disk. This cannot be undone.",
  "delete.session.pending": "Deleting session\u2026",
  "chat.section": "Chats",
  "chat.add": "New chat",
  "chat.empty": "No chats yet",
  "chat.search.placeholder": "Search chats\u2026",
  "chat.search.aria": "Search chats",
  "sessions.count.one": "{n} session",
  "sessions.count.other": "{n} sessions",
  "actions.workspace.aria": "Workspace actions for {name}",
  "actions.session.aria": "Session actions for {name}",
  "actions.newSession.aria": "New session in {name}",
  "status.running": "Running",
  "status.subagentsRunning.one": "{n} subagent running",
  "status.subagentsRunning.other": "{n} subagents running",
  "status.idle": "Idle",
  "status.waitingApproval": "Waiting for approval",
  "status.planReview": "Plan awaiting review",
  "status.waitingAnswer": "Waiting for answer",
  "status.completed": "Completed",
  "schedule.active": "Has active scheduled task",
  "hover.created": "Created {time}",
  "hover.copied": "Copied",
  "date.ymd": "{y}-{m}-{d}",
  "time.now": "now",
  "time.minutes": "{n}min",
  "time.hours": "{n}h",
  "time.days": "{n}d",
  "time.months": "{n}mo",
  "time.years": "{n}y",
  "time.ago": "{t} ago"
};

// src/client/addon/ArchivedSessionsPage.tsx
var import_react5 = require("react");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime5 = require("react/jsx-runtime");
function timeLabel2(updatedAt, now, t) {
  const { unit, n } = (0, import_dsh_client_ui_primitives5.relativeTime)(updatedAt, now);
  return unit === "now" ? t("time.now") : t(`time.${unit}`, { n });
}
function ArchivedSessionsPage({ t }) {
  const chat = (0, import_react5.useSyncExternalStore)(chatStateSource.subscribe, chatStateSource.getSnapshot);
  const deletedIds = (0, import_react5.useSyncExternalStore)(deletedIdsSource.subscribe, deletedIdsSource.getSnapshot);
  const maskedIds = (0, import_react5.useSyncExternalStore)(archivedMaskSource.subscribe, archivedMaskSource.getSnapshot);
  const rows = chat.archived;
  const loaded = chat.loaded;
  const [busy, setBusy] = (0, import_react5.useState)(null);
  const [error, setError] = (0, import_react5.useState)(null);
  const [deleteTarget, setDeleteTarget] = (0, import_react5.useState)(null);
  const [deleteError, setDeleteError] = (0, import_react5.useState)(null);
  const hiddenRow = (sessionId) => deletedIds.has(sessionId) || maskedIds.has(sessionId);
  const visibleRows = rows.filter((row) => !hiddenRow(row.sessionId));
  const load = (0, import_react5.useCallback)(() => {
    setError(null);
    return refreshChatState().catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, []);
  (0, import_react5.useEffect)(() => {
    void load();
  }, [load]);
  const rowActionLabel = (kind, sessionId) => {
    if (busy !== null && busy.kind === kind && busy.id === sessionId) {
      return kind === "restore" ? t("archived.restoring") : t("archived.deleting");
    }
    return kind === "restore" ? t("archived.restore") : t("archived.delete");
  };
  const runBusy = (kind, sessionId, action, onSuccess, onFailure) => {
    setBusy({ id: sessionId, kind });
    action().then(() => {
      onSuccess?.();
    }).catch((reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (onFailure !== void 0) onFailure(message);
      else setError(message);
    }).finally(() => {
      setBusy(null);
    });
  };
  const restore = (sessionId) => {
    runBusy("restore", sessionId, async () => {
      await rpcPost("/api/chat-manager/restore-session", { sessionId });
      markArchivedMasked(sessionId);
      await refreshChatState().catch(() => {
      });
    });
  };
  const confirmDelete = () => {
    if (deleteTarget === null) return;
    const sessionId = deleteTarget.sessionId;
    setDeleteError(null);
    runBusy(
      "delete",
      sessionId,
      () => performSessionDelete(sessionId),
      // Success closes the confirm; a failure keeps it open with the reason
      // inside the dialog (same as the workspace-browser delete confirm).
      () => {
        setDeleteTarget(null);
      },
      (message) => {
        setDeleteError(message);
      }
    );
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: WorkspaceBrowser_default.archivedPage, children: [
    !loaded && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.empty, children: t("archived.loading") }),
    loaded && visibleRows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.empty, children: t("archived.empty") }),
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: error }),
    visibleRows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: WorkspaceBrowser_default.archivedRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: WorkspaceBrowser_default.archivedTitle, children: [
        String(row.workspaceTitle ?? "").trim().length > 0 ? String(row.workspaceTitle) + "\uFF1A" : "",
        row.title && String(row.title).trim().length > 0 ? row.title : t("archived.untitled")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: WorkspaceBrowser_default.archivedTime, children: typeof row.updatedAt === "number" && row.updatedAt > 0 ? timeLabel2(row.updatedAt, Date.now(), t) : "" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives5.Button,
        {
          variant: "outline",
          disabled: busy !== null,
          onClick: () => {
            restore(row.sessionId);
          },
          children: rowActionLabel("restore", row.sessionId)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives5.Button,
        {
          variant: "outline",
          className: WorkspaceBrowser_default.deleteAction,
          disabled: busy !== null,
          onClick: () => {
            setDeleteError(null);
            setDeleteTarget(row);
          },
          children: rowActionLabel("delete", row.sessionId)
        }
      )
    ] }, row.sessionId)),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      import_dsh_client_ui_primitives5.Modal,
      {
        open: deleteTarget !== null,
        onClose: () => {
          setDeleteTarget(null);
          setDeleteError(null);
        },
        closeLabel: t("close"),
        title: t("archived.delete"),
        ...deleteTarget === null ? {} : { description: t("archived.delete.desc", { name: deleteTarget.title || t("archived.untitled") }) },
        footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "outline", disabled: busy !== null, onClick: () => {
            setDeleteTarget(null);
            setDeleteError(null);
          }, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "outline", className: WorkspaceBrowser_default.deleteAction, disabled: busy !== null, onClick: confirmDelete, children: t("archived.delete") })
        ] }),
        children: [
          busy !== null && busy.kind === "delete" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.deleteStatus, role: "status", children: t("archived.deleting") }),
          deleteError !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: deleteError })
        ]
      }
    )
  ] });
}

// src/client/index.ts
var NS = "workspace";
var inject = [
  "slots",
  "sessions",
  "workspaces",
  "locale",
  "remote",
  "remote.directoryPicker"
];
function apply(ctx) {
  const sessions = ctx.get("sessions");
  const workspaces = ctx.get("workspaces");
  const uiWorkspace = new UiWorkspaceService(
    ctx,
    ctx.remote.directoryPicker,
    workspaces,
    sessions
  );
  ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list, chat: chatStateSource } });
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-workspace: dictionaries");
  ctx.effect(() => ctx.locale.register("chatManager", { zh: chatManagerZh, en: chatManagerEn }), "dsh-chat-manager: dictionaries");
  setRefreshSessions(() => {
    void sessions.refresh();
  });
  void refreshChatState().catch(() => {
  });
  const searchSessions = async (query, signal) => {
    const result = await sessions.search(query, signal);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  const flowSource = (hole) => ({
    getSnapshot: () => ctx.slots.entries(hole).length > 0,
    subscribe: (listener) => ctx.slots.subscribe(hole, listener)
  });
  const browserFlowSource = flowSource("sidebar.workspaces.directoryFlow");
  const hostInfo = {
    getSnapshot: () => ctx.remote.$host,
    subscribe: (listener) => ctx.on("connection/reset", listener)
  };
  const pickerFlowSource = flowSource("conversation.hero.workspace.directoryFlow");
  const deleteSessionRpc = (sessionId) => rpcPost("/api/chat-manager/delete-session", { sessionId }).then(() => void 0);
  const chatSearchRpc = (query) => rpcPost("/api/chat-manager/search-chats", { query }).then((data) => data.items ?? []);
  const resolveChatWorkspaceId = async (dateFolder) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const found = (chatRuntimeSource.getSnapshot().workspaces ?? []).find((workspace) => workspace.path === dateFolder || samePath(workspace.path, dateFolder));
      if (found !== void 0 && typeof found.workspaceId === "string" && found.workspaceId.length > 0) {
        return found.workspaceId;
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, 250);
      });
    }
    return "";
  };
  const startChatRpc = () => rpcPost("/api/chat-manager/ensure-date-folder", {}).then(async (data) => {
    const payload = data;
    const dateFolder = typeof payload.dateFolder === "string" ? payload.dateFolder : "";
    let workspaceId = typeof payload.workspaceId === "string" && payload.workspaceId.length > 0 ? payload.workspaceId : "";
    if (workspaceId === "" && dateFolder !== "") workspaceId = await resolveChatWorkspaceId(dateFolder);
    if (workspaceId === "") throw new Error("missing workspace id");
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const snapshot = workspaces.list.getSnapshot();
      if (snapshot.items.some((w) => w.workspaceId === workspaceId)) break;
      await new Promise((resolve) => {
        window.setTimeout(resolve, 250);
      });
    }
    uiWorkspace.startSession(workspaceId);
    void refreshChatState().catch(() => {
    });
  });
  const browserInjected = () => ({
    // Explicit group actions keep their target; unscoped New Session inherits
    // the current Session Workspace before the recent-Workspace fallback
    // (the plugin routes the no-arg case to a new chat first — see below).
    startSession: (workspaceId) => {
      uiWorkspace.startSession(workspaceId);
    },
    open: (sessionId) => {
      sessions.open(sessionId);
    },
    searchSessions,
    searchResultLimit: sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      const session = sessions.binding(sessionId)?.session;
      if (session === void 0) throw new Error(`unknown session "${sessionId}"`);
      const result = await session.rename(title);
      if (!result.ok) throw new Error(result.error.message);
    },
    forkSession: (sessionId) => {
      sessions.fork({ sessionId, increaseTitle: true }).then((childId) => {
        sessions.open(childId);
      }).catch(() => {
      });
    },
    renameWorkspace: async (workspaceId, title) => {
      await workspaces.rename(workspaceId, title);
    },
    deleteWorkspace: async (workspaceId) => {
      await workspaces.delete(workspaceId);
    },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId);
    },
    archiveSession: async (sessionId) => {
      await uiWorkspace.archiveSession(sessionId);
    },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId);
    },
    createWorkspace: (input) => workspaces.create(input),
    deleteSession: deleteSessionRpc,
    chatSearch: chatSearchRpc,
    startChat: startChatRpc,
    hooks: { directoryFlow: browserFlowSource, hostInfo, chat: chatStateSource }
  });
  const pickerInjected = () => ({
    createWorkspace: (input) => workspaces.create(input),
    hooks: { directoryFlow: pickerFlowSource }
  });
  ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register(
    {
      name: "sidebar.workspaces",
      children: { "sidebar.workspaces.directoryFlow": { kind: "single", scope: "root" } },
      store: createWorkspaceViewStore(),
      inject: browserInjected,
      locale: NS
    },
    WorkspaceBrowser
  ));
  ctx.slots.inject("conversation.hero.workspace", () => ctx.slots.register(
    {
      name: "conversation.hero.workspace",
      children: { "conversation.hero.workspace.directoryFlow": { kind: "single", scope: "root" } },
      inject: pickerInjected,
      locale: NS
    },
    WorkspacePicker
  ));
  ctx.effect(() => uiWorkspace.installChatRouting({
    currentId: () => chatRuntimeSource.getSnapshot().currentId,
    chatIds: () => chatRuntimeSource.getSnapshot().chatIds,
    startChat: startChatRpc
  }), "dsh-chat-manager: startSession routing");
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "chat-archived",
    order: 25,
    label: () => ctx.locale.bind("chatManager")("settings.archived"),
    locale: "chatManager",
    inject: () => ({})
  }, ArchivedSessionsPage));
}

		return module.exports;
	}
});
