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
var __typeError = (msg) => {
  throw TypeError(msg);
};
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
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_dsh_client_store4 = require("@deepseek-ai/dsh-client-store");

// src/client/contract/slots.ts
var menuOpenStateFactory = (_standard, state) => () => state;

// src/client/shortcuts.ts
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
function createWorkspaceShortcutControls() {
  const state = (0, import_dsh_client_store.createSnapshotStore)({
    searchRequest: 0,
    addRequested: false,
    directoryBusy: false,
    renameTarget: null,
    forkError: null
  });
  let forkErrorSeq = 0;
  return {
    state,
    search: () => {
      state.set({ ...state.getSnapshot(), searchRequest: state.getSnapshot().searchRequest + 1 });
    },
    add: () => {
      state.set(state.getSnapshot().directoryBusy ? state.getSnapshot() : { ...state.getSnapshot(), addRequested: true });
    },
    closeAdd: () => {
      state.set({ ...state.getSnapshot(), addRequested: false });
    },
    directoryBusy: (busy) => {
      state.set({ ...state.getSnapshot(), directoryBusy: busy });
    },
    rename: (sessionId, currentTitle) => {
      state.set({ ...state.getSnapshot(), renameTarget: { sessionId, currentTitle } });
    },
    closeRename: () => {
      state.set({ ...state.getSnapshot(), renameTarget: null });
    },
    forkFailed: (reason) => {
      forkErrorSeq += 1;
      state.set({ ...state.getSnapshot(), forkError: { reason, seq: forkErrorSeq } });
    },
    dismissForkError: () => {
      state.set({ ...state.getSnapshot(), forkError: null });
    }
  };
}
function installWorkspaceShortcuts(ctx, navigation, controls, archiveSession) {
  const t = ctx.locale.bind("workspace");
  const current = () => Object.values(ctx.sessions.list.getSnapshot().byId).find((row) => (row.retainedBy.mainView ?? 0) > 0);
  const addReason = () => ctx.slots.entries("sidebar.workspaces.directoryFlow").length === 0 ? t("shortcut.noPicker") : controls.state.getSnapshot().directoryBusy ? t("shortcut.directoryBusy") : null;
  const register = (id, label, aliases, code, modifiers, webModifiers, resolve) => {
    ctx.effect(() => ctx.shortcuts.register({
      id,
      label,
      aliases,
      defaults: {
        "desktop:macos": { code, modifiers },
        "desktop:windows": { code, modifiers },
        "desktop:linux": { code, modifiers },
        "web:macos": { code, modifiers: webModifiers },
        "web:windows": { code, modifiers: webModifiers }
      },
      regions: ["page", "editable"],
      modals: [],
      resolve
    }), `ui-workspace: ${id}`);
  };
  register(
    "session.new",
    () => t("session.new"),
    ["new session", "new chat"],
    "KeyN",
    ["primary"],
    ["primary", "alt"],
    () => ({ status: "handled", run: () => {
      navigation.startSession();
    } })
  );
  register(
    "session.search",
    () => t("search.sessions.aria"),
    ["search sessions"],
    "KeyK",
    ["primary"],
    ["primary", "alt"],
    () => ({ status: "handled", run: controls.search })
  );
  register(
    "workspace.add",
    () => t("workspace.add"),
    ["add workspace", "open folder"],
    "KeyO",
    ["primary"],
    ["primary", "alt"],
    () => {
      const reason = addReason();
      return reason === null ? { status: "handled", run: controls.add } : { status: "blocked", reason };
    }
  );
  register("session.rename", () => t("rename.session.title"), ["rename session"], "KeyG", ["primary", "alt"], ["primary", "alt"], (context) => {
    const target = current();
    return target === void 0 || target.blank || context.modal !== null || ctx.layout.panelInfo.getSnapshot().activePanelId !== null ? { status: "blocked", reason: t("shortcut.noSession") } : { status: "handled", run: () => {
      controls.rename(target.id, target.title?.trim() ?? "");
    } };
  });
  register("session.fork", () => t("menu.fork"), ["fork session"], "KeyF", ["primary", "alt"], ["primary", "shift"], () => {
    const target = current();
    if (target === void 0) return { status: "blocked", reason: t("shortcut.noSession") };
    if (target.blank) return { status: "blocked", reason: t("shortcut.noCompletedTurn") };
    return { status: "handled", run: () => {
      void navigation.forkSession(target.id).catch((error) => {
        const unavailable = error instanceof Error && error.name === "SessionForkError" && error.rpcError.code === "session/fork-unavailable";
        controls.forkFailed(unavailable ? "unavailable" : "failed");
        if (!unavailable) console.warn("session fork rejected:", error);
      });
    } };
  });
  register("session.archive", () => t("menu.archiveSession"), ["archive session"], "KeyA", ["primary", "shift"], ["primary", "alt"], () => {
    const target = current();
    return target === void 0 ? { status: "blocked", reason: t("shortcut.noSession") } : { status: "handled", run: () => {
      archiveSession(target.id);
    } };
  });
}

// src/client/navigation.ts
var import_cordis = require("@deepseek-ai/cordis");
var import_dsh_client_store3 = require("@deepseek-ai/dsh-client-store");

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

// src/shared/chat.ts
function readArchivedChatRows(value) {
  if (!Array.isArray(value)) return [];
  const rows = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry;
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
    if (sessionId === "") continue;
    rows.push({
      sessionId,
      title: typeof record.title === "string" ? record.title : "",
      workspaceTitle: typeof record.workspaceTitle === "string" ? record.workspaceTitle : "",
      updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : 0
    });
  }
  return rows;
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
      archived: readArchivedChatRows(data.archived),
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

// src/client/stores.ts
var import_dsh_client_store2 = require("@deepseek-ai/dsh-client-store");

// node_modules/@deepseek-ai/dsh-util-values/lib/index.js
var SIMPLE_ESCAPES = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "	"
};
var CONTENT_ESCAPE = /[\\\u0000-\u001f]/u;
function isWhitespace(c) {
  return c === " " || c === "\n" || c === "\r" || c === "	";
}
function isHex(c) {
  return c >= "0" && c <= "9" || c >= "a" && c <= "f" || c >= "A" && c <= "F";
}
var _a, _ends, _size, _consumed, _mode, _escape, _keyStart, _keyEscaped, _key, _current, _nestedEnds, _nestedInString, _invalidAt, _invalidValue, _entries, _order, _reads;
var PartialArguments = (_a = class {
  constructor() {
    /**
    * The source: text so far or a parsed object, plus whether it can still grow.
    * These are the only enumerable fields, so two views over the same source
    * compare equal structurally however far each has been read.
    */
    __publicField(this, "chunks", []);
    __publicField(this, "object");
    __publicField(this, "sealed", false);
    __privateAdd(this, _ends, []);
    __privateAdd(this, _size, 0);
    __privateAdd(this, _consumed, 0);
    __privateAdd(this, _mode, "root");
    __privateAdd(this, _escape, false);
    __privateAdd(this, _keyStart, 0);
    __privateAdd(this, _keyEscaped, false);
    __privateAdd(this, _key, "");
    __privateAdd(this, _current, null);
    __privateAdd(this, _nestedEnds, []);
    __privateAdd(this, _nestedInString, false);
    __privateAdd(this, _invalidAt);
    __privateAdd(this, _invalidValue, false);
    __privateAdd(this, _entries, /* @__PURE__ */ new Map());
    __privateAdd(this, _order, []);
    __privateAdd(this, _reads, /* @__PURE__ */ new Map());
  }
  /**
  * View finished argument text without scanning it until a reader asks.
  * @param text - the complete argument JSON text.
  * @returns a sealed view.
  */
  static fromText(text) {
    const view = new _a();
    view.append(text);
    view.sealed = true;
    return view;
  }
  /**
  * View an already parsed argument payload, such as a PTC dispatch object.
  * @param value - the parsed argument value.
  * @returns a sealed view; a non-object payload has no fields.
  */
  static fromObject(value) {
    const view = new _a();
    view.object = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    view.sealed = true;
    return view;
  }
  /** Whether this view rejects further appends; does not scan text or register reads. */
  get isSealed() {
    return this.sealed;
  }
  /** Whether indexing or a content read found invalid JSON; unread value contents are not validated. */
  get invalid() {
    this.scan();
    return __privateGet(this, _mode) === "invalid" || __privateGet(this, _invalidValue);
  }
  /**
  * Retain streamed argument text without scanning or comparing observed answers.
  * @param fragment - the text following every fragment appended before.
  */
  append(fragment) {
    if (this.sealed) throw new Error("PartialArguments: cannot append to a sealed view");
    if (fragment.length === 0) return;
    this.chunks.push(fragment);
    __privateSet(this, _size, __privateGet(this, _size) + fragment.length);
    __privateGet(this, _ends).push(__privateGet(this, _size));
  }
  /**
  * Reconcile a streamed prefix with authoritative complete text without joining the fragments.
  * @param text - the final argument text, which replaces missing or conflicting deltas.
  * @returns this view sealed with its caches retained when every character matches; otherwise a new sealed view.
  */
  settle(text) {
    if (this.object !== void 0 || text.length !== __privateGet(this, _size)) return _a.fromText(text);
    let offset = 0;
    for (const chunk of this.chunks) {
      if (!text.startsWith(chunk, offset)) return _a.fromText(text);
      offset += chunk.length;
    }
    this.chunks = text.length === 0 ? [] : [text];
    __privateSet(this, _ends, text.length === 0 ? [] : [text.length]);
    this.sealed = true;
    return this;
  }
  /**
  * Compare observed answers and advance their publication baseline. Unread views remain unscanned.
  * @returns whether any observed answer changed since its first read or the preceding refresh.
  */
  refresh() {
    if (__privateGet(this, _reads).size === 0) return false;
    this.scan();
    let changed = false;
    let completions = false;
    for (const read of __privateGet(this, _reads).values()) {
      if (read.completion) {
        completions = true;
        continue;
      }
      changed = this.refreshRead(read) || changed;
    }
    if (completions) {
      for (const read of __privateGet(this, _reads).values()) if (read.completion) changed = this.refreshRead(read) || changed;
    }
    if (this.sealed) __privateGet(this, _reads).clear();
    return changed;
  }
  refreshRead(read) {
    const now = read.answer();
    if (Object.is(now, read.last)) return false;
    read.last = now;
    return true;
  }
  /**
  * Check whether no further fields can arrive.
  * @returns whether the outer object closed, indexing failed, or the view is sealed; unread values are not validated.
  */
  closed() {
    return this.remember("closed", "", () => this.closedNow());
  }
  /**
  * List discovered fields in first-appearance order.
  * @returns top-level keys seen so far, in first-appearance order.
  */
  keys() {
    return this.remember("keys", "", () => this.keysNow(), (keys) => keys.length);
  }
  /**
  * Check whether a top-level field has appeared.
  * @param key - argument name.
  * @returns whether the field has appeared (a string opened or another value began).
  */
  has(key) {
    return this.remember("has", key, () => this.hasNow(key));
  }
  /**
  * Check whether a field's closing delimiter has arrived, without validating its contents.
  * @param key - argument name.
  * @returns whether its delimiter arrived and no content reader has reported an error for this value.
  */
  complete(key) {
    return this.remember("complete", key, () => this.completeNow(key));
  }
  /**
  * Read string length without materializing its text.
  * @param key - argument name.
  * @param options - change granularity for a streaming string.
  * @returns decoded UTF-16 length of the string field so far; undefined when absent or not a string.
  */
  stringLength(key, options) {
    const step = Math.max(1, Math.floor(options?.step ?? 1));
    const offset = options?.offset ?? 0;
    return this.remember(`length:${step}:${offset}`, key, () => this.lengthNow(key), (length) => length === void 0 ? void 0 : Math.ceil((length + offset) / step));
  }
  /**
  * Check a string against a decoded UTF-16 length limit without materializing it.
  * @param key - argument name.
  * @param maxLength - decoded UTF-16 limit, floored to at least zero.
  * @returns whether the string is longer than the limit; false when absent or not a string.
  */
  stringExceeds(key, maxLength) {
    const limit = Math.max(0, Math.floor(maxLength));
    return this.remember(`exceeds:${limit}`, key, () => (this.lengthNow(key, limit + 1) ?? 0) > limit);
  }
  /**
  * Read a decoded string, including a streaming prefix.
  * @param key - argument name.
  * @returns the string field's decoded text so far; undefined when absent or not a string.
  */
  text(key) {
    return this.remember("text", key, () => this.textNow(key));
  }
  /**
  * Read at most the first decoded UTF-16 units of a string.
  * @param key - argument name.
  * @param maxLength - maximum decoded UTF-16 length, floored to at least one.
  * @returns the bounded string prefix; undefined when absent or not a string.
  */
  textPrefix(key, maxLength) {
    const limit = Math.max(1, Math.floor(maxLength));
    return this.remember(`prefix:${limit}`, key, () => this.textPrefixNow(key, limit));
  }
  /**
  * Read a completed non-string argument.
  * @param key - argument name.
  * @returns the parsed non-string value once it closed; undefined while open, absent, or a string.
  */
  value(key) {
    return this.remember("value", key, () => this.valueNow(key));
  }
  /** Answer a question and, on a streaming view, remember it for change detection. */
  remember(kind, key, read, comparison) {
    this.scan();
    const result = read();
    if (!this.sealed) {
      const id = `${kind}/${key}`;
      if (!__privateGet(this, _reads).has(id)) __privateGet(this, _reads).set(id, {
        completion: kind === "complete",
        answer: comparison === void 0 ? read : () => comparison(read()),
        last: comparison === void 0 ? result : comparison(result)
      });
    }
    return result;
  }
  closedNow() {
    return this.sealed || __privateGet(this, _mode) === "closed" || __privateGet(this, _mode) === "invalid";
  }
  keysNow() {
    return this.object === void 0 ? __privateGet(this, _order) : Object.keys(this.object);
  }
  hasNow(key) {
    return this.object === void 0 ? __privateGet(this, _entries).has(key) : Object.hasOwn(this.object, key);
  }
  completeNow(key) {
    if (this.object !== void 0) return Object.hasOwn(this.object, key);
    const entry = __privateGet(this, _entries).get(key);
    return entry !== void 0 && entry.end >= 0 && (entry.kind === "string" ? entry.invalidAt === void 0 : !entry.invalid);
  }
  lengthNow(key, limit = Number.POSITIVE_INFINITY) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field.length : void 0;
    }
    const entry = __privateGet(this, _entries).get(key);
    if (entry?.kind !== "string") return void 0;
    if (entry.text !== void 0 && entry.text.at === entry.end) return entry.text.length;
    const read = entry.length ?? (entry.length = {
      at: entry.start,
      length: 0,
      text: ""
    });
    this.readString(entry, read, limit, false);
    return read.length;
  }
  textNow(key) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field : void 0;
    }
    const entry = __privateGet(this, _entries).get(key);
    if (entry?.kind !== "string") return void 0;
    if (entry.text === void 0 && entry.end >= 0 && entry.needsDecoding && entry.invalidAt === void 0) {
      let text;
      try {
        text = JSON.parse(`"${this.slice(entry.start, entry.end)}"`);
      } catch (_error) {
      }
      if (text !== void 0) entry.text = {
        at: entry.end,
        length: text.length,
        text
      };
    }
    const read = entry.text ?? (entry.text = {
      at: entry.start,
      length: 0,
      text: ""
    });
    this.readString(entry, read, Number.POSITIVE_INFINITY, true);
    return read.text;
  }
  textPrefixNow(key, maxLength) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field.slice(0, maxLength) : void 0;
    }
    const entry = __privateGet(this, _entries).get(key);
    if (entry?.kind !== "string") return void 0;
    const prefixes = entry.prefixes ?? (entry.prefixes = /* @__PURE__ */ new Map());
    let read = prefixes.get(maxLength);
    if (read === void 0) {
      read = {
        at: entry.start,
        length: 0,
        text: ""
      };
      prefixes.set(maxLength, read);
    }
    this.readString(entry, read, maxLength, true);
    return read.text;
  }
  valueNow(key) {
    if (this.object !== void 0) {
      if (!Object.hasOwn(this.object, key)) return void 0;
      const field = this.object[key];
      return typeof field === "string" ? void 0 : field;
    }
    const entry = __privateGet(this, _entries).get(key);
    if (entry?.kind !== "value" || entry.end < 0 || entry.invalid) return void 0;
    if (entry.parsed === void 0) try {
      entry.parsed = JSON.parse(this.slice(entry.start, entry.end));
    } catch (_error) {
      entry.invalid = true;
      __privateSet(this, _invalidValue, true);
    }
    return entry.parsed;
  }
  chunkAt(at) {
    let low = 0;
    let high = __privateGet(this, _ends).length;
    while (low < high) {
      const mid = low + high >>> 1;
      if (__privateGet(this, _ends)[mid] <= at) low = mid + 1;
      else high = mid;
    }
    return low;
  }
  /** Materialize only a requested range, never the cumulative source. */
  slice(start, end) {
    if (start >= end) return "";
    const first = this.chunkAt(start);
    const last = this.chunkAt(end - 1);
    const base = first === 0 ? 0 : __privateGet(this, _ends)[first - 1];
    if (first === last) return this.chunks[first].slice(start - base, end - base);
    const parts = [this.chunks[first].slice(start - base)];
    for (let i = first + 1; i < last; i++) parts.push(this.chunks[i]);
    parts.push(this.chunks[last].slice(0, end - __privateGet(this, _ends)[last - 1]));
    return parts.join("");
  }
  readString(entry, read, limit, materialize) {
    const end = Math.min(entry.end < 0 ? __privateGet(this, _consumed) : entry.end, entry.invalidAt ?? Number.POSITIVE_INFINITY, __privateGet(this, _invalidAt) ?? Number.POSITIVE_INFINITY);
    if (!entry.needsDecoding) {
      const length = Math.min(end - read.at, limit - read.length);
      if (length <= 0) return;
      if (materialize) read.text += this.slice(read.at, read.at + length);
      read.at += length;
      read.length += length;
      return;
    }
    let chunkIndex = this.chunkAt(read.at);
    while (read.at < end && read.length < limit) {
      const base = chunkIndex === 0 ? 0 : __privateGet(this, _ends)[chunkIndex - 1];
      const chunk = this.chunks[chunkIndex];
      const remaining = chunk.slice(read.at - base, Math.min(chunk.length, end - base));
      const boundary = remaining.search(CONTENT_ESCAPE);
      const length = Math.min(boundary < 0 ? remaining.length : boundary, limit - read.length);
      if (length > 0) {
        if (materialize) read.text += remaining.slice(0, length);
        read.at += length;
        read.length += length;
        if (read.at === base + chunk.length) chunkIndex++;
        continue;
      }
      const type = remaining.length > 1 ? remaining[1] : read.at + 1 < end ? this.chunks[chunkIndex + 1][0] : void 0;
      let decoded;
      let width = 2;
      if (remaining[0] === "\\" && type === void 0 && entry.end < 0) return;
      if (remaining[0] === "\\" && type === "u") {
        const hex = this.slice(read.at + 2, Math.min(end, read.at + 6));
        let valid = true;
        for (let i = 0; i < hex.length; i++) if (!isHex(hex[i])) valid = false;
        if (valid) {
          if (hex.length < 4 && entry.end < 0) return;
          if (hex.length === 4) decoded = String.fromCharCode(Number.parseInt(hex, 16));
        }
        width = 6;
      } else if (remaining[0] === "\\" && type !== void 0) decoded = SIMPLE_ESCAPES[type];
      if (decoded === void 0) {
        entry.invalidAt = read.at;
        __privateSet(this, _invalidValue, true);
        return;
      }
      if (materialize) read.text += decoded;
      read.length++;
      read.at += width;
      while (chunkIndex < this.chunks.length && read.at >= __privateGet(this, _ends)[chunkIndex]) chunkIndex++;
    }
  }
  /** Locate new field ranges without decoding or parsing their contents. */
  scan() {
    if (this.object !== void 0 || __privateGet(this, _consumed) === __privateGet(this, _size)) return;
    for (let i = this.chunkAt(__privateGet(this, _consumed)); i < this.chunks.length && __privateGet(this, _invalidAt) === void 0; i++) {
      const pending = this.chunks[i];
      const base = i === 0 ? 0 : __privateGet(this, _ends)[i - 1];
      for (let index = __privateGet(this, _consumed) - base; index < pending.length && __privateGet(this, _mode) !== "invalid"; index++) {
        if (__privateGet(this, _mode) === "string" || __privateGet(this, _mode) === "nested" && __privateGet(this, _nestedInString)) {
          const end = this.stringBoundary(pending, index);
          __privateSet(this, _consumed, __privateGet(this, _consumed) + (end - index));
          index = end;
          if (index === pending.length) break;
        }
        this.step(pending[index], __privateGet(this, _consumed));
        __privateWrapper(this, _consumed)._++;
      }
    }
  }
  /** Only raw quotes and their preceding backslash runs can terminate a string. */
  stringBoundary(fragment, start) {
    let at = start;
    while (true) {
      const quote = fragment.indexOf('"', at);
      const end = quote < 0 ? fragment.length : quote;
      if (__privateGet(this, _mode) === "string") {
        const entry = __privateGet(this, _current);
        if (!entry.needsDecoding && CONTENT_ESCAPE.test(fragment.slice(at, end))) entry.needsDecoding = true;
      }
      let slashStart = end;
      while (slashStart > at && fragment[slashStart - 1] === "\\") slashStart--;
      const escaped = (end - slashStart) % 2 === 1 !== (slashStart === at && __privateGet(this, _escape));
      __privateSet(this, _escape, quote < 0 && escaped);
      if (quote < 0 || !escaped) return end;
      at = quote + 1;
    }
  }
  step(c, at) {
    switch (__privateGet(this, _mode)) {
      case "root":
        if (isWhitespace(c)) return;
        if (c === "{") {
          __privateSet(this, _mode, "key-or-end");
          return;
        }
        this.fail();
        return;
      case "key-or-end":
        if (isWhitespace(c)) return;
        if (c === "}") {
          __privateSet(this, _mode, "closed");
          return;
        }
        if (c === '"') {
          this.beginKey(at);
          return;
        }
        this.fail();
        return;
      case "key-only":
        if (isWhitespace(c)) return;
        if (c === '"') {
          this.beginKey(at);
          return;
        }
        this.fail();
        return;
      case "key":
        this.stepKey(c, at);
        return;
      case "colon":
        if (isWhitespace(c)) return;
        if (c === ":") {
          __privateSet(this, _mode, "value");
          return;
        }
        this.fail();
        return;
      case "value":
        this.beginValue(c, at);
        return;
      case "string": {
        const entry = __privateGet(this, _current);
        entry.end = at;
        __privateSet(this, _current, null);
        __privateSet(this, _mode, "comma-or-end");
        return;
      }
      case "scalar":
        this.stepScalar(c, at);
        return;
      case "nested":
        this.stepNested(c, at);
        return;
      case "comma-or-end":
        if (isWhitespace(c)) return;
        if (c === ",") {
          __privateSet(this, _mode, "key-only");
          return;
        }
        if (c === "}") {
          __privateSet(this, _mode, "closed");
          return;
        }
        this.fail();
        return;
      case "closed":
        if (isWhitespace(c)) return;
        this.fail();
        return;
      /* v8 ignore next 2 -- scan() stops stepping once the view is invalid. */
      case "invalid":
        return;
      /* v8 ignore next 2 -- Every scanner mode has a handler above. */
      default:
        assertNever(__privateGet(this, _mode));
    }
  }
  fail() {
    __privateSet(this, _invalidAt, __privateGet(this, _consumed));
    __privateSet(this, _mode, "invalid");
    __privateSet(this, _current, null);
  }
  beginKey(at) {
    __privateSet(this, _mode, "key");
    __privateSet(this, _keyStart, at + 1);
    __privateSet(this, _keyEscaped, false);
    __privateSet(this, _escape, false);
  }
  stepKey(c, at) {
    if (c < " ") {
      this.fail();
      return;
    }
    if (__privateGet(this, _escape)) {
      __privateSet(this, _escape, false);
      return;
    }
    if (c === "\\") {
      __privateSet(this, _escape, true);
      __privateSet(this, _keyEscaped, true);
      return;
    }
    if (c !== '"') return;
    const raw = this.slice(__privateGet(this, _keyStart), at);
    if (__privateGet(this, _keyEscaped)) try {
      __privateSet(this, _key, JSON.parse(`"${raw}"`));
    } catch (_error) {
      this.fail();
      return;
    }
    else __privateSet(this, _key, raw);
    __privateSet(this, _mode, "colon");
  }
  open(entry) {
    if (!__privateGet(this, _entries).has(__privateGet(this, _key))) __privateGet(this, _order).push(__privateGet(this, _key));
    __privateGet(this, _entries).set(__privateGet(this, _key), entry);
    __privateSet(this, _current, entry);
  }
  beginValue(c, at) {
    if (isWhitespace(c)) return;
    if (c === '"') {
      this.open({
        kind: "string",
        start: at + 1,
        end: -1,
        needsDecoding: false,
        invalidAt: void 0,
        length: void 0,
        text: void 0,
        prefixes: void 0
      });
      __privateSet(this, _escape, false);
      __privateSet(this, _mode, "string");
      return;
    }
    if (c === "}" || c === "," || c === ":" || c === "]") {
      this.fail();
      return;
    }
    this.open({
      kind: "value",
      start: at,
      end: -1,
      parsed: void 0,
      invalid: false
    });
    if (c === "{" || c === "[") {
      __privateSet(this, _mode, "nested");
      __privateSet(this, _nestedEnds, [c === "{" ? "}" : "]"]);
      __privateSet(this, _nestedInString, false);
      __privateSet(this, _escape, false);
      return;
    }
    __privateSet(this, _mode, "scalar");
  }
  stepScalar(c, at) {
    if (c !== "," && c !== "}" && !isWhitespace(c)) return;
    this.closeValue(at);
    __privateSet(this, _mode, c === "," ? "key-only" : c === "}" ? "closed" : "comma-or-end");
  }
  stepNested(c, at) {
    if (__privateGet(this, _nestedInString)) {
      __privateSet(this, _nestedInString, false);
      return;
    }
    if (c === '"') {
      __privateSet(this, _nestedInString, true);
      return;
    }
    if (c === "{" || c === "[") {
      __privateGet(this, _nestedEnds).push(c === "{" ? "}" : "]");
      return;
    }
    if (c === "}" || c === "]") {
      if (__privateGet(this, _nestedEnds).pop() !== c) {
        this.fail();
        return;
      }
      if (__privateGet(this, _nestedEnds).length === 0) {
        this.closeValue(at + 1);
        __privateSet(this, _mode, "comma-or-end");
      }
    }
  }
  closeValue(end) {
    const entry = __privateGet(this, _current);
    entry.end = end;
    __privateSet(this, _current, null);
  }
}, _ends = new WeakMap(), _size = new WeakMap(), _consumed = new WeakMap(), _mode = new WeakMap(), _escape = new WeakMap(), _keyStart = new WeakMap(), _keyEscaped = new WeakMap(), _key = new WeakMap(), _current = new WeakMap(), _nestedEnds = new WeakMap(), _nestedInString = new WeakMap(), _invalidAt = new WeakMap(), _invalidValue = new WeakMap(), _entries = new WeakMap(), _order = new WeakMap(), _reads = new WeakMap(), /** The view of a call with no arguments available. */
__publicField(_a, "EMPTY", _a.fromObject({})), _a);
function assertNever(value, context) {
  const rendered = JSON.stringify(value) ?? String(value);
  throw new Error(`unreachable variant${context ? ` in ${context}` : ""}: ${rendered}`);
}

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

// src/client/tree.ts
var UNGROUPED_KEY = "";
var EMPTY_IDS = /* @__PURE__ */ new Set();
function owningGroupKey(workspaces, sessionId) {
  return workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))?.workspaceId ?? UNGROUPED_KEY;
}
function mainSessionId(list) {
  return Object.values(list.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id;
}
function workspaceLabel(cwd) {
  if (cwd === void 0 || cwd === "") return "";
  const base = workspaceTitleOf(cwd);
  return base !== "" ? base : cwd;
}
function orderByRecency(sessionIds, summaries) {
  return sessionIds.flatMap((id) => {
    const summary = summaries[id];
    if (summary === void 0) return [];
    return [{ id, rank: summary.updatedAt }];
  }).sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank;
    return a.id < b.id ? -1 : 1;
  }).map((member) => member.id);
}
function reconcileManualOrder(memberIds, savedOrder, summaries, rowState) {
  const members = new Map(memberIds.map((id) => [id, id]));
  const included = /* @__PURE__ */ new Set();
  const ordered = [];
  for (const key of savedOrder ?? []) {
    const id = members.get(key);
    if (id === void 0 || included.has(key)) continue;
    ordered.push(id);
    included.add(key);
  }
  const archived = new Set(rowState?.archivedSessionIds);
  const pins = [];
  for (const sessionId of rowState?.pinnedSessionIds ?? []) {
    const id = members.get(sessionId);
    if (id === void 0 || included.has(id) || archived.has(id) || summaries[id] === void 0) continue;
    pins.push(id);
    included.add(id);
  }
  const ordinary = [];
  const archives = [];
  for (const id of orderByRecency([...members.values()].filter((id2) => !included.has(id2)), summaries)) {
    if (archived.has(id)) archives.push(id);
    else ordinary.push(id);
  }
  const result = [...pins, ...ordered, ...ordinary, ...archives];
  const pending = new Set(ordinary);
  const placeFork = (id) => {
    if (!pending.delete(id)) return;
    const parentId = summaries[id]?.parentId;
    if (parentId === void 0 || parentId === id || !result.includes(parentId)) return;
    placeFork(parentId);
    result.splice(result.indexOf(id), 1);
    result.splice(result.indexOf(parentId), 0, id);
  };
  for (const id of [...ordinary].reverse()) placeFork(id);
  return result;
}
function pinCurrentBlank(order, currentBlank) {
  if (currentBlank === void 0) return [...order];
  return [currentBlank, ...order.filter((id) => id !== currentBlank)];
}
function sessionVisible(session, current, archived, archivedFilter) {
  if (session.origin === "subagent") return false;
  if (session.blank && session.id !== current) return false;
  switch (archivedFilter) {
    case "default":
      return !archived.has(session.id);
    case "show":
      return true;
    case "only":
      return archived.has(session.id);
    /* v8 ignore next 2 -- closed-union backstop; only reached if the filter is forged */
    default:
      return assertNever(archivedFilter);
  }
}
function sectionMembers(members, pinned, archived) {
  const placeholders = [];
  const leading = [];
  const rest = [];
  for (const member of members) {
    if (member.blank) placeholders.push(member);
    else if (!archived.has(member.id) && pinned.has(member.id)) leading.push(member);
    else rest.push(member);
  }
  return [...placeholders, ...leading, ...rest];
}
function sessionTitle(session) {
  return session.blank ? "" : session.title?.trim() ?? "";
}
function buildGroup(key, workspaceId, cwd, createdAt, label, members) {
  return { key, workspaceId, cwd, createdAt, label, sessions: [...members] };
}
function orderedUngrouped(members, stored, summaries) {
  const byId = new Map(members.map((session) => [session.id, session]));
  const ids = stored === void 0 ? orderByRecency(members.map((session) => session.id), summaries) : reconcileManualOrder(members.map((session) => session.id), stored, summaries);
  return ids.flatMap((id) => {
    const session = byId.get(id);
    return session === void 0 ? [] : [session];
  });
}
function groupByWorkspace(list, workspaces, archived, archivedFilter, ungroupedOrder, excludedSessionIds = EMPTY_IDS) {
  const current = mainSessionId(list);
  const groups = [];
  const accounted = /* @__PURE__ */ new Set();
  for (const workspace of workspaces) {
    const members = [];
    for (const id of workspace.sessionIds) {
      const summary = list.byId[id];
      if (summary === void 0) continue;
      accounted.add(id);
      if (excludedSessionIds.has(id)) continue;
      if (!sessionVisible(summary, current, archived, archivedFilter)) continue;
      members.push(summary);
    }
    if (archivedFilter === "only" && members.length === 0) continue;
    groups.push(buildGroup(
      workspace.workspaceId,
      workspace.workspaceId,
      workspace.path,
      Date.parse(workspace.createdAt),
      workspace.title,
      members
    ));
  }
  const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && !excludedSessionIds.has(s.id) && sessionVisible(s, current, archived, archivedFilter));
  if (stray.length > 0) {
    groups.push(buildGroup(
      UNGROUPED_KEY,
      void 0,
      void 0,
      void 0,
      "",
      orderedUngrouped(stray, ungroupedOrder, list.byId)
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
function runningChildCount(list, parentId, statuses) {
  return list.projectionsBySession[parentId]?.values.subagentCatalog?.reduce(
    (count, child) => count + ((statuses.get(child.id)?.running ?? list.byId[child.id]?.running) === true ? 1 : 0),
    0
  ) ?? 0;
}
function sessionNode(s, list, statuses, pinned, archived) {
  const status = statuses.get(s.id);
  const pendingInteraction = visiblePendingKind(status?.pendingInteraction?.kind);
  return {
    id: s.id,
    title: sessionTitle(s),
    blank: s.blank,
    running: status?.running ?? s.running,
    runningSubagentCount: runningChildCount(list, s.id, statuses),
    completed: status?.completionUnread === true,
    pinned: !archived.has(s.id) && pinned.has(s.id),
    archived: archived.has(s.id),
    updatedAt: s.updatedAt,
    ...pendingInteraction === void 0 ? {} : { pendingInteraction }
  };
}
function deriveGroups(list, workspaces, rowState, statuses, view, excludedSessionIds = EMPTY_IDS) {
  const archived = new Set(rowState.archivedSessionIds);
  const pinned = new Set(rowState.pinnedSessionIds);
  const expandedGroups = new Set(view.expandedGroups);
  const current = mainSessionId(list);
  const currentGroup = current === void 0 ? void 0 : owningGroupKey(workspaces, current);
  const groups = [];
  for (const g of groupByWorkspace(
    list,
    workspaces,
    archived,
    rowState.archivedFilter,
    view.ungroupedOrder,
    excludedSessionIds
  )) {
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
      sessions: expanded ? sectionMembers(g.sessions, pinned, archived).map((session) => sessionNode(session, list, statuses, pinned, archived)) : []
    });
  }
  return groups;
}
function sessionMemberIds(list) {
  return visibleSessionIds(list, [], "show");
}
function visibleSessionIds(list, archivedSessionIds, archivedFilter) {
  const archived = new Set(archivedSessionIds);
  const current = mainSessionId(list);
  return list.ids.filter((id) => {
    const s = list.byId[id];
    return s !== void 0 && sessionVisible(s, current, archived, archivedFilter);
  });
}
function deriveFlat(list, sessionIds, rowState, statuses, excludedSessionIds = EMPTY_IDS) {
  const archived = new Set(rowState.archivedSessionIds);
  const pinned = new Set(rowState.pinnedSessionIds);
  const current = mainSessionId(list);
  const members = sessionIds.flatMap((id) => {
    const session = list.byId[id];
    return session !== void 0 && !excludedSessionIds.has(id) && sessionVisible(session, current, archived, rowState.archivedFilter) ? [session] : [];
  });
  return sectionMembers(members, pinned, archived).map((session) => sessionNode(session, list, statuses, pinned, archived));
}
function deriveSearchResults(list, workspaces, query, archivedSessionIds, archivedFilter, statuses, content, limit) {
  const q = query.trim().toLowerCase();
  if (q === "") return { items: [], hasMore: false };
  const archived = new Set(archivedSessionIds);
  const current = mainSessionId(list);
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
    if (summary === void 0 || summary.blank || !sessionVisible(summary, current, archived, archivedFilter)) continue;
    if (sessionTitle(summary).toLowerCase().includes(q) || labelOf(summary).toLowerCase().includes(q)) {
      local.push(summary);
    }
  }
  const localById = new Map(local.map((summary) => [summary.id, summary]));
  const orderedLocal = orderByRecency(local.map((summary) => summary.id), list.byId).map((id) => localById.get(id));
  const ordered = [];
  const included = /* @__PURE__ */ new Set();
  const include = (summary) => {
    if (included.has(summary.id)) return;
    included.add(summary.id);
    ordered.push(summary);
  };
  for (const summary of orderedLocal) include(summary);
  for (const item of content.items) {
    const summary = list.byId[item.sessionId];
    if (summary !== void 0 && !summary.blank && sessionVisible(summary, current, archived, archivedFilter)) include(summary);
  }
  return {
    items: ordered.slice(0, limit).map((summary) => {
      const match = contentBySession.get(summary.id);
      const status = statuses.get(summary.id);
      const pendingInteraction = visiblePendingKind(status?.pendingInteraction?.kind);
      return {
        id: summary.id,
        title: sessionTitle(summary),
        workspace: labelOf(summary),
        running: status?.running ?? summary.running,
        runningSubagentCount: runningChildCount(list, summary.id, statuses),
        ...pendingInteraction === void 0 ? {} : { pendingInteraction },
        completed: status?.completionUnread === true,
        archived: archived.has(summary.id),
        ...match === void 0 ? {} : { snippet: match.snippet }
      };
    }),
    hasMore: content.hasMore || ordered.length > limit
  };
}
function folderPath(path) {
  const windows = /^[A-Za-z]:[/\\]/.test(path) || path.startsWith("\\\\");
  return (windows ? path.replaceAll("\\", "/") : path).replace(/\/+$/, "");
}
function owningParentFolder(path, parents) {
  const child = folderPath(path);
  let owner;
  let length = -1;
  for (const parent of parents) {
    const root = folderPath(parent);
    if (root.length > length && child !== root && child.startsWith(`${root}/`)) {
      owner = parent;
      length = root.length;
    }
  }
  return owner;
}

// src/client/stores.ts
var FLAT_SESSION_ORDER_KEY = "__flat_session_order__";
function copySessionOrders(orders) {
  return Object.fromEntries(Object.entries(orders).map(([key, order]) => [key, [...order]]));
}
function createWorkspaceViewStore() {
  return (0, import_dsh_client_store2.defineStore)({
    init: () => ({
      groupBy: "workspace",
      orderBy: "updated",
      groupExpansion: {},
      sessionOrderByAccount: {},
      archivedFilter: "default"
    }),
    persist: "dsh.workspace.view.v5",
    actions: {
      setGroupBy: (d, mode) => {
        d.groupBy = mode;
      },
      setOrderBy: (d, mode, initialOrders) => {
        if (mode === d.orderBy) return;
        d.sessionOrderByAccount = mode === "manual" ? copySessionOrders(initialOrders) : {};
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
        delete d.sessionUpdatedAtByAccount;
      },
      syncSessionOrders: (d, orders) => {
        if (d.orderBy !== "manual") return;
        Object.assign(d.sessionOrderByAccount, copySessionOrders(orders));
      },
      setSessionOrder: (d, accountKey, order, initialOrders) => {
        if (d.orderBy === "updated") d.sessionOrderByAccount = copySessionOrders(initialOrders);
        else Object.assign(d.sessionOrderByAccount, copySessionOrders(initialOrders));
        d.orderBy = "manual";
        d.sessionOrderByAccount[accountKey] = [...order];
      },
      pinSessionOrder: (d, sessionId, accountKeys, source) => {
        const selected = new Set(accountKeys);
        d.sessionOrderByAccount = Object.fromEntries(Object.entries(source.members).map(([key, members]) => {
          const order = reconcileManualOrder(members, d.sessionOrderByAccount[key], source.summaries, source.rowState);
          return [key, selected.has(key) ? [sessionId, ...order.filter((id) => id !== sessionId)] : order];
        }));
      },
      setArchivedFilter: (d, filter) => {
        d.archivedFilter = filter;
      }
    }
  });
}

// src/client/pin-order.ts
function pinOrderSource(workspaces, list, rowState) {
  const accounted = new Set(workspaces.flatMap((workspace) => workspace.sessionIds));
  return {
    members: Object.fromEntries([
      ...workspaces.map((workspace) => [workspace.workspaceId, workspace.sessionIds]),
      [UNGROUPED_KEY, list.ids.filter((id) => list.byId[id] !== void 0 && !accounted.has(id))],
      [FLAT_SESSION_ORDER_KEY, sessionMemberIds(list)]
    ]),
    summaries: list.byId,
    rowState
  };
}
function pinOrderAccounts(workspaces, sessionId) {
  return [owningGroupKey(workspaces, sessionId), FLAT_SESSION_ORDER_KEY];
}

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
   * @param view - the browser's viewing-store write set (one instance shared with its registration).
   * @param notify - show one notice through the Workspace notice channel.
   */
  constructor(ctx, directoryPicker, workspaces, sessions, view, notify) {
    super(ctx, "uiWorkspace");
    this.directoryPicker = directoryPicker;
    this.workspaces = workspaces;
    this.sessions = sessions;
    this.view = view;
    this.notify = notify;
    __publicField(this, "connecting", /* @__PURE__ */ new Map());
    __publicField(this, "lifetime", new AbortController());
    __publicField(this, "selection", (0, import_dsh_client_store3.createSnapshotStore)(
      {},
      { persist: { name: "dsh.sessions.current" } }
    ));
    __publicField(this, "mainReference");
    ctx.effect(() => {
      const stop = this.watchNavigation();
      return () => {
        stop();
        this.lifetime.abort();
        const reference = this.mainReference;
        this.mainReference = void 0;
        reference?.release();
      };
    }, "ui-workspace: Workspace navigation policy");
  }
  /**
   * Route a no-argument New Session to a new chat when the focus is a chat
   * Session or there is no focus; an explicit Workspace target and a
   * workspace-focused current Session keep the shipped inheritance. The
   * patched method is restored by the returned disposer. The chat flow runs
   * under the shared in-flight gate and its failure falls back to the pristine
   * `startSession()` (the captured `original`), never back into this wrapper.
   * @param guards - render-observed chat focus plus the chat flow opener.
   * @returns the disposal function restoring the pristine method.
   */
  installChatRouting({ currentId, chatIds, startChat }) {
    const original = this.startSession.bind(this);
    const routed = (workspaceId, options) => {
      if (workspaceId !== void 0) return original(workspaceId, options);
      const current = currentId();
      if (current !== void 0 && !chatIds().has(current)) return original(void 0, options);
      runChatFlow(startChat, () => {
        original(void 0, options);
      });
    };
    this.startSession = routed;
    return () => {
      if (this.startSession === routed) this.startSession = original;
    };
  }
  async connectWorkspace(workspaceId) {
    const workspace = this.workspaces.list.getSnapshot().items.find((item) => item.workspaceId === workspaceId);
    if (workspace === void 0) {
      throw new Error(`uiWorkspace.connectWorkspace: unknown workspace ${workspaceId}`);
    }
    const inflight = this.connecting.get(workspaceId);
    if (inflight !== void 0) return inflight;
    const attempt = this.reuseOrCreateBlank(workspace).finally(() => {
      this.connecting.delete(workspaceId);
    });
    this.connecting.set(workspaceId, attempt);
    return attempt;
  }
  reuseOrCreateBlank(workspace) {
    const archived = this.workspaces.list.getSnapshot().archivedSessionIds;
    const sessions = this.sessions.list.getSnapshot();
    for (const id of sessions.ids) {
      const summary = sessions.byId[id];
      if (summary === void 0 || !summary.blank || summary.cwd !== workspace.path || !workspace.sessionIds.includes(id) || archived.includes(id)) continue;
      return this.reuseBlank(workspace.workspaceId, id);
    }
    return this.sessions.create({ workspaceId: workspace.workspaceId });
  }
  async reuseBlank(workspaceId, sessionId) {
    try {
      return await this.sessions.create({ workspaceId, sessionId });
    } catch (error) {
      if (sessionCreateErrorOf(error)?.rpcError.code !== "session/writer-held") throw error;
      return this.sessions.create({ workspaceId });
    }
  }
  openSession(target) {
    this.replaceMain(target, this.lifetime.signal, "reveal");
  }
  async openWorkspace(workspaceId, beforeOpen) {
    const navigation = AbortSignal.any([this.ctx.layout.beginNavigation(), this.lifetime.signal]);
    let sessionId;
    try {
      sessionId = await this.connectWorkspace(workspaceId);
    } catch (error) {
      if (!navigation.aborted) this.notify({ kind: "createFailed", message: creationFailureMessage(error) });
      throw error;
    }
    if (navigation.aborted) return;
    this.replaceMain(sessionId, navigation, "reveal", beforeOpen);
  }
  async forkSession(sessionId, onCreated) {
    return this.sessions.fork({ sessionId, increaseTitle: true, ...onCreated === void 0 ? {} : { onCreated } });
  }
  startSession(workspaceId, options) {
    const draftOptions = options === void 0 ? void 0 : { ...options };
    const initializeDraft = draftOptions !== void 0 && (draftOptions.prompt !== void 0 || draftOptions.clearPreviousDraft === true);
    const workspace = this.workspaces.list.getSnapshot();
    const sessions = this.sessions.list.getSnapshot();
    const current = this.mainReference?.sessionId;
    const currentWorkspaceId = current === void 0 ? void 0 : workspace.items.find((item) => item.sessionIds.includes(current))?.workspaceId;
    const recent = workspace.phase === "ready" && sessions.phase === "ready" ? recentWorkspace(workspace.items, sessions.byId) : void 0;
    const target = workspaceId ?? currentWorkspaceId ?? recent;
    if (target === void 0) {
      if (initializeDraft) {
        this.notify({ kind: "createFailed", message: this.ctx.locale.bind("workspace")("draft.workspaceRequired") });
        return;
      }
      this.clearMain();
      return;
    }
    void this.openWorkspace(target, initializeDraft ? (id) => {
      const binding = this.sessions.binding(id);
      if (binding === void 0) this.draftPreparationFailed();
      this.prepareDraft(binding, draftOptions);
    } : void 0).catch(
      (reason) => {
        console.warn("new session failed:", reason);
      }
    );
  }
  prepareDraft(binding, options) {
    const conversation = this.ctx.get("conversation");
    if (conversation === void 0) this.draftPreparationFailed();
    if (conversation.input.requestDraftInitialization(binding, options) === "blocked") this.draftPreparationFailed();
  }
  draftPreparationFailed() {
    const message = this.ctx.locale.bind("workspace")("draft.initializationFailed");
    this.notify({ kind: "createFailed", message });
    throw new Error(message);
  }
  async archiveSession(sessionId, options = {}) {
    await this.workspaces.archiveSession(sessionId, options);
    if (this.mainReference?.sessionId === sessionId) this.clearMain();
  }
  async unarchiveSession(sessionId) {
    await this.workspaces.unarchiveSession(sessionId);
  }
  async pinSession(sessionId) {
    await this.workspaces.pinSession(sessionId);
    const { items, pinnedSessionIds, archivedSessionIds } = this.workspaces.list.getSnapshot();
    this.view.pinSessionOrder(
      sessionId,
      pinOrderAccounts(items, sessionId),
      pinOrderSource(items, this.sessions.list.getSnapshot(), { pinnedSessionIds, archivedSessionIds })
    );
  }
  async unpinSession(sessionId) {
    await this.workspaces.unpinSession(sessionId);
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
    const reconcile = () => {
      if (this.lifetime.signal.aborted) return;
      if (this.clearArchivedCurrent()) return;
      if (initial !== "waiting") return;
      const workspace = this.workspaces.list.getSnapshot();
      const sessions = this.sessions.list.getSnapshot();
      if (workspace.phase !== "ready" || sessions.phase !== "ready") return;
      if (this.mainReference !== void 0) {
        initial = "done";
        return;
      }
      initial = "connecting";
      void this.restoreSelection(workspace, sessions).then(
        () => {
          initial = "done";
        },
        (reason) => {
          if (this.lifetime.signal.aborted) return;
          initial = "waiting";
          console.warn("initial Session restoration failed:", reason);
        }
      );
    };
    const disposeWorkspaces = this.workspaces.list.subscribe(reconcile);
    const disposeSessions = this.sessions.list.subscribe(reconcile);
    reconcile();
    return () => {
      this.lifetime.abort();
      disposeSessions();
      disposeWorkspaces();
    };
  }
  async restoreSelection(workspaces, sessions) {
    const saved = this.selection.getSnapshot();
    if (saved.subagentAddress !== void 0) {
      this.replaceMain(saved.subagentAddress, this.lifetime.signal, "preserve");
      return;
    }
    const summary = saved.sessionId === void 0 ? void 0 : sessions.byId[saved.sessionId];
    const workspace = summary === void 0 ? void 0 : workspaces.items.find((item) => item.sessionIds.includes(summary.id));
    if (summary !== void 0 && (!summary.blank || workspace === void 0)) {
      this.replaceMain(summary.id, this.lifetime.signal, "preserve");
      return;
    }
    const navigation = AbortSignal.any([this.ctx.layout.beginNavigation(), this.lifetime.signal]);
    let sessionId;
    if (summary !== void 0 && workspace !== void 0 && summary.cwd === workspace.path && !workspaces.archivedSessionIds.includes(summary.id)) {
      sessionId = await this.reuseBlank(workspace.workspaceId, summary.id);
    }
    let target = workspace?.workspaceId ?? recentWorkspace(workspaces.items, sessions.byId);
    if (target === void 0 && workspaces.items.length === 0 && sessions.ids.length === 0) {
      const prepared = await this.initializeDefaultWorkspace(navigation);
      if (navigation.aborted) return;
      target = prepared?.workspaceId;
    }
    if (sessionId === void 0 && target !== void 0) sessionId = await this.connectWorkspace(target);
    if (sessionId !== void 0 && !navigation.aborted) {
      this.replaceMain(sessionId, navigation, "preserve");
    }
  }
  async initializeDefaultWorkspace(signal) {
    try {
      return await this.workspaces.initializeDefault(signal);
    } catch (_error) {
      if (!signal.aborted) this.notify({ kind: "defaultWorkspaceFailed" });
      return void 0;
    }
  }
  /** @returns true when an archived current selection was cleared. */
  clearArchivedCurrent() {
    const current = this.mainReference?.sessionId;
    if (current === void 0 || !this.workspaces.list.getSnapshot().archivedSessionIds.includes(current)) return false;
    this.clearMain();
    return true;
  }
  clearMain() {
    const previous = this.mainReference;
    this.mainReference = void 0;
    this.selection.set({});
    previous?.release();
    this.ctx.layout.selectPanel(null);
  }
  replaceMain(target, signal, panel, beforeOpen) {
    signal.throwIfAborted();
    const reference = this.sessions.retain(target, { source: "mainView" });
    try {
      signal.throwIfAborted();
      beforeOpen?.(reference.sessionId);
      if (signal.aborted) {
        reference.release();
        return;
      }
      const subagentAddress = typeof target === "string" ? this.sessions.subagentAddress(reference.sessionId) : target;
      this.selection.set({
        sessionId: reference.sessionId,
        ...subagentAddress === void 0 ? {} : { subagentAddress }
      });
    } catch (error) {
      reference.release();
      throw error;
    }
    const previous = this.mainReference;
    this.mainReference = reference;
    previous?.release();
    if (panel === "reveal") this.ctx.layout.selectPanel(null);
  }
};
function sessionCreateErrorOf(error) {
  return error instanceof Error && error.name === "SessionCreateError" ? error : void 0;
}
function creationFailureMessage(error) {
  const refused = sessionCreateErrorOf(error);
  if (refused !== void 0) return `${refused.rpcError.code}: ${refused.rpcError.message}`;
  return error instanceof Error ? error.message : String(error);
}
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

// src/client/rows/WorkspaceBrowser.tsx
var import_react5 = require("react");

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

// node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/types/default-workspace.js
var DEFAULT_WORKSPACE_DIRECTORY = "default-workspace";
function workspaceDisplayTitle(title, localizedDefault) {
  return title === DEFAULT_WORKSPACE_DIRECTORY ? localizedDefault : title;
}

// src/client/rows/Rows.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/rows/Rows.module.css
var cssText = ".m951506_projectRow,\n.m951506_sessionRow {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  border-radius: var(--dsw-radius-md);\n  padding: 0 8px;\n  padding-inline-start: calc(8px + var(--dsh-workspace-indent, 0px));\n  cursor: pointer;\n  user-select: none;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m951506_projectRow:hover,\n.m951506_sessionRow:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m951506_sessionRow.m951506_selected {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m951506_searchResultRow {\n  display: flex;\n  flex-direction: column;\n  align-items: stretch;\n  width: 100%;\n  min-height: 48px;\n  box-sizing: border-box;\n  border: none;\n  border-radius: var(--dsw-radius-lg);\n  padding: 4px 8px;\n  background: transparent;\n  cursor: pointer;\n  text-align: left;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m951506_searchResultRow:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m951506_searchResultRow.m951506_selected {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m951506_searchResultHeading {\n  display: flex;\n  align-items: center;\n  min-width: 0;\n}\n\n.m951506_searchResultTitle {\n  flex: 0 1 auto;\n  min-width: 0;\n  margin-left: 4px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 14px;\n  line-height: 20px;\n}\n\n.m951506_searchResultMeta {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  margin-left: 20px;\n}\n\n.m951506_searchResultWorkspace,\n.m951506_searchResultSnippet {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12px;\n  line-height: 17px;\n}\n\n.m951506_searchResultWorkspace {\n  flex: none;\n  max-width: 40%;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* The 40% share only protects a snippet; a snippetless match keeps the row. */\n.m951506_searchResultWorkspace:only-child {\n  max-width: 100%;\n}\n\n.m951506_searchResultSnippet {\n  flex: 1;\n  min-width: 0;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* Compact one-line Workspace row after removing the session-count subtitle. */\n.m951506_projectRow {\n  height: 34px;\n  align-items: center;\n  box-sizing: border-box;\n}\n\n.m951506_projectRow .m951506_rowActions {\n  height: 20px;\n}\n\n/* Session cell (figma): pad 8, a 16px status slot, then a 4px title gap. */\n.m951506_sessionRow {\n  height: 32px;\n  gap: 0;\n}\n\n.m951506_sessionRow .m951506_title {\n  margin: 0 6px 0 4px;\n}\n\n.m951506_slot {\n  flex: none;\n  width: 16px;\n  height: 20px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_visuallyHidden {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  overflow: hidden;\n  clip: rect(0 0 0 0);\n  white-space: nowrap;\n}\n\n.m951506_folderActive {\n  color: var(--dsw-alias-state-business-primary);\n}\n\n\n/* Project leading slot: folder by default, expand arrow on row hover. */\n.m951506_projectRow .m951506_chevron { display: none; }\n.m951506_projectRow:hover .m951506_chevron { display: inline-flex; }\n.m951506_projectRow:hover .m951506_folder { display: none; }\n\n/* Expand arrow (filled triangle): points right closed, rotates to point down open. */\n.m951506_arrow {\n  transition: transform 150ms var(--ds-ease-in-out);\n}\n\n.m951506_arrowOpen {\n  transform: rotate(90deg);\n}\n\n.m951506_projectText {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.m951506_title {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 14px;\n  line-height: 20px;\n}\n\n.m951506_renameInput {\n  min-width: 0;\n  font-size: 14px;\n  line-height: 20px;\n  padding: 0 2px;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-button-elevated-fill);\n  color: inherit;\n  outline: none;\n}\n\n/* Hovering a session row marquees a title wider than its cell: Rows.tsx crawls\n   it at a constant speed to its far edge while the pointer rests on the row,\n   holds it there, and returns it to the start in one step when the pointer\n   leaves. The motion is scripted frame by frame (reduced motion jumps), so no\n   scroll-behavior applies here. */\n.m951506_sessionRow .m951506_title {\n  flex: 1;\n}\n\n/* While the marquee travels, both clipping edges fade in over 12px instead of\n   hard-cutting a character: the left once the title has moved off its start\n   (data-scrolled), the right while text still remains beyond the cell\n   (data-clipped) \u2014 at the far edge the right fade lifts so the final character\n   reads at full strength. The mask rides the title span itself, so the status\n   slot and every other leading cell keep their full color. */\n.m951506_sessionRow .m951506_title[data-scrolled] {\n  mask-image: linear-gradient(to right, transparent, #000 12px);\n}\n\n.m951506_sessionRow .m951506_title[data-clipped] {\n  mask-image: linear-gradient(to left, transparent, #000 12px);\n}\n\n.m951506_sessionRow .m951506_title[data-scrolled][data-clipped] {\n  mask-image: linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent);\n}\n\n.m951506_meta {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_time {\n  flex: none;\n  font-size: 10px;\n  line-height: 16px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_pinIndicator {\n  display: inline-flex;\n  flex: none;\n  width: 16px;\n  height: 20px;\n  align-items: center;\n  justify-content: center;\n  margin-left: 6px;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* Archived rows stay in place but read as inactive: titles drop to\n   the caption label step (one step above dimmed, which reads as too faint\n   over the sidebar fill). Archived search rows drop their meta line to the\n   same step so both lines read as one unit. */\n.m951506_sessionRow.m951506_archived .m951506_title,\n.m951506_searchResultRow.m951506_archived .m951506_searchResultTitle,\n.m951506_searchResultRow.m951506_archived .m951506_searchResultWorkspace,\n.m951506_searchResultRow.m951506_archived .m951506_searchResultSnippet {\n  color: var(--dsw-alias-label-caption);\n}\n\n.m951506_dot {\n  flex: none;\n}\n\n/* Trailing action buttons surface on hover only (figma 27:4668 / 27:4656):\n   bare 16px glyphs, tertiary grey; the figma gap 12 reads too airy beside\n   the 16px glyphs, so the buttons sit at 10. */\n.m951506_rowActions {\n  flex: none;\n  display: none;\n  align-items: center;\n  gap: 10px;\n}\n\n.m951506_projectRow:hover .m951506_rowActions,\n.m951506_sessionRow:hover .m951506_rowActions,\n.m951506_searchResultRow:hover .m951506_rowActions,\n.m951506_projectRow.m951506_menuOpen .m951506_rowActions,\n.m951506_sessionRow.m951506_menuOpen .m951506_rowActions {\n  display: inline-flex;\n}\n\n/* The search heading has no trailing time cell, so the unarchive action\n   right-aligns itself. */\n.m951506_searchResultHeading .m951506_rowActions {\n  margin-left: auto;\n}\n\n.m951506_sessionRow:hover .m951506_time,\n.m951506_sessionRow.m951506_menuOpen .m951506_time {\n  display: none;\n}\n\n/* Hover swaps the trailing cell to the action buttons, which already carry\n   the pin/archive glyphs \u2014 hide the static markers so they do not double. */\n.m951506_sessionRow:hover .m951506_pinIndicator,\n.m951506_sessionRow.m951506_menuOpen .m951506_pinIndicator {\n  display: none;\n}\n\n/* The unclipped hover state drops the ellipsis, which would otherwise cover\n   the characters the marquee reached. Guarded because a touch tap\n   latches `:hover` on the row after the title has already returned: an\n   unguarded rule would strand that row without its ellipsis. */\n@media (hover: hover) {\n  .m951506_sessionRow:hover .m951506_title,\n  .m951506_sessionRow.m951506_menuOpen .m951506_title {\n    text-overflow: clip;\n  }\n}\n\n/* An open row menu pins the hover affordances (figma: the row keeps its\n   hover fill while its dropdown is up). */\n.m951506_projectRow.m951506_menuOpen,\n.m951506_sessionRow.m951506_menuOpen {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* Session drag insert marker: a leading chevron and 2px rule between rows,\n   absolutely positioned so it neither resembles a row border nor changes layout. */\n.m951506_sessionRow.m951506_dropBefore,\n.m951506_sessionRow.m951506_dropAfter {\n  position: relative;\n}\n\n.m951506_sessionRow.m951506_dropBefore::before,\n.m951506_sessionRow.m951506_dropAfter::after {\n  content: '';\n  position: absolute;\n  z-index: 1;\n  left: 0;\n  right: 4px;\n  height: 12px;\n  background:\n    linear-gradient(\n      55deg,\n      transparent calc(50% - 1px),\n      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),\n      transparent calc(50% + 1px)\n    ) 0 0 / 5px 7px no-repeat,\n    linear-gradient(\n      125deg,\n      transparent calc(50% - 1px),\n      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),\n      transparent calc(50% + 1px)\n    ) 0 5px / 5px 7px no-repeat,\n    linear-gradient(\n      var(--dsw-alias-state-business-primary) 0 0\n    ) 4px 5px / calc(100% - 4px) 2px no-repeat;\n  pointer-events: none;\n}\n\n.m951506_sessionRow.m951506_dropBefore::before {\n  top: -7px;\n}\n\n.m951506_sessionRow.m951506_dropAfter::after {\n  bottom: -7px;\n}\n\n/* Hover-card body (figma 169:16903): dark surface, fixed colors both themes. */\n.m951506_hoverContent {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.m951506_hoverTitle {\n  font-size: 14px;\n  line-height: 20px;\n  color: #FFFFFF;\n  overflow-wrap: break-word;\n}\n\n.m951506_hoverPath {\n  font-size: 12px;\n  line-height: 16px;\n  color: #CFD3D6;\n  word-break: break-all;\n}\n\n.m951506_hoverTime {\n  font-size: 12px;\n  line-height: 16px;\n  color: #CFD3D6;\n}\n\n.m951506_hoverStatus {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  line-height: 20px;\n  color: #ADB2B8;\n}\n\n/* Archive glyph rides the status row's text color; slight inset aligns it with the 6px status dots. */\n.m951506_hoverArchived svg {\n  flex-shrink: 0;\n  margin: 0 -4px;\n}\n\n.m951506_iconButton {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 16px;\n  border: none;\n  border-radius: var(--dsw-radius-xs);\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m951506_iconButton:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Chevrons ride the caption grey (#ADB2B8); the folder glyph stays one step\n   darker (tertiary, #81858C) per the cell spec. */\n.m951506_chevron {\n  color: var(--dsw-alias-label-caption);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .m951506_arrow {\n    animation: none;\n    transition: none;\n  }\n}\n";
var classMap = { "projectRow": "m951506_projectRow", "sessionRow": "m951506_sessionRow", "selected": "m951506_selected", "searchResultRow": "m951506_searchResultRow", "searchResultHeading": "m951506_searchResultHeading", "searchResultTitle": "m951506_searchResultTitle", "searchResultMeta": "m951506_searchResultMeta", "searchResultWorkspace": "m951506_searchResultWorkspace", "searchResultSnippet": "m951506_searchResultSnippet", "rowActions": "m951506_rowActions", "title": "m951506_title", "slot": "m951506_slot", "visuallyHidden": "m951506_visuallyHidden", "folderActive": "m951506_folderActive", "chevron": "m951506_chevron", "folder": "m951506_folder", "arrow": "m951506_arrow", "arrowOpen": "m951506_arrowOpen", "projectText": "m951506_projectText", "renameInput": "m951506_renameInput", "meta": "m951506_meta", "time": "m951506_time", "pinIndicator": "m951506_pinIndicator", "archived": "m951506_archived", "dot": "m951506_dot", "menuOpen": "m951506_menuOpen", "dropBefore": "m951506_dropBefore", "dropAfter": "m951506_dropAfter", "hoverContent": "m951506_hoverContent", "hoverTitle": "m951506_hoverTitle", "hoverPath": "m951506_hoverPath", "hoverTime": "m951506_hoverTime", "hoverStatus": "m951506_hoverStatus", "hoverArchived": "m951506_hoverArchived", "iconButton": "m951506_iconButton" };
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
  return node.blank ? t("session.new") : node.title || t("session.untitled");
}
var MIN_TITLE_REVEAL_PX = 8;
var TITLE_MARQUEE_PX_PER_MS = 0.03;
function placeTitle(title, left, range) {
  if (typeof title.scrollTo === "function") title.scrollTo({ left, behavior: "instant" });
  else title.scrollLeft = left;
  if (left > 0) title.dataset.scrolled = "";
  else delete title.dataset.scrolled;
  if (left < range) title.dataset.clipped = "";
  else delete title.dataset.clipped;
}
function restTitle(title) {
  if (typeof title.scrollTo === "function") title.scrollTo({ left: 0, behavior: "instant" });
  else title.scrollLeft = 0;
  delete title.dataset.scrolled;
  delete title.dataset.clipped;
}
function useTitleMarquee(title) {
  const frame = (0, import_react.useRef)(0);
  (0, import_react.useEffect)(() => () => {
    cancelAnimationFrame(frame.current);
  }, []);
  return (0, import_react.useMemo)(() => ({
    enter: () => {
      if (title.current === null) return;
      const element = title.current;
      const range = element.scrollWidth - element.clientWidth;
      if (range <= MIN_TITLE_REVEAL_PX) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        placeTitle(element, range, range);
        return;
      }
      cancelAnimationFrame(frame.current);
      let previous;
      let position = 0;
      const step = (now) => {
        position += previous === void 0 ? 0 : (now - previous) * TITLE_MARQUEE_PX_PER_MS;
        previous = now;
        placeTitle(element, Math.min(position, range), range);
        if (position < range) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    leave: () => {
      cancelAnimationFrame(frame.current);
      if (title.current === null) return;
      restTitle(title.current);
    }
  }), [title]);
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
function ProjectRowItem({ group, containsCurrentDescendant = false, onToggle, onCreate, actions, drag, home, newShortcut, t }) {
  const row = group;
  const label = row.workspaceId === void 0 ? t("group.ungrouped") : row.label;
  const active = containsCurrentDescendant || group.expanded && group.containsCurrent;
  const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
  const workspaceMenuItems = [
    { id: "rename", label: t("rename"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEditOutlineRegular, {}) },
    { id: "delete", label: t("delete.workspace"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTrashOutlineRegular, {}), danger: true }
  ];
  const ownRow = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: clsx_default(Rows_default.projectRow, menuOpen && Rows_default.menuOpen),
      "data-row-key": `workspace:${group.key}`,
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: clsx_default(Rows_default.slot, Rows_default.folder, active && Rows_default.folderActive), children: row.expanded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderOpenRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderCloseRegular, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: clsx_default(Rows_default.slot, Rows_default.chevron), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTriangleRightFillRegular, { className: clsx_default(Rows_default.arrow, row.expanded && Rows_default.arrowOpen) }) }),
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
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEllipsisOutlineRegular, {})
                }
              )
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t("actions.newSession"), shortcutKeys: newShortcut?.keys, side: "bottom", align: "end", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: Rows_default.iconButton,
              "aria-keyshortcuts": newShortcut?.aria,
              "aria-label": t("actions.newSession.aria", { name: label }),
              onClick: (e) => {
                e.stopPropagation();
                onCreate();
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconNewChatOutlineRegular, {})
            }
          ) })
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
      openDelayMs: 800,
      disabled: menuOpen,
      copyText: row.cwd,
      copyLabel: t("copy"),
      copiedLabel: t("hover.copied")
    }
  );
}
function assertNever2(value) {
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
      pending = {
        state: "warning",
        label: t("status.waitingApproval"),
        trailingLabel: t("status.compact.approval")
      };
      break;
    case "plan-review":
      pending = {
        state: "warning",
        label: t("status.planReview"),
        trailingLabel: t("status.compact.planReview")
      };
      break;
    case "question":
      pending = {
        state: "warning",
        label: t("status.waitingAnswer"),
        trailingLabel: t("status.compact.answer")
      };
      break;
    case void 0:
      break;
    /* v8 ignore next -- closed PendingInteractionStatus union */
    default:
      return assertNever2(node.pendingInteraction);
  }
  if (pending !== void 0) return subagents === void 0 ? [pending] : [pending, subagents];
  if (node.running) {
    const primary = { state: "ongoing", label: t("status.running") };
    return subagents === void 0 ? [primary] : [primary, subagents];
  }
  if (subagents !== void 0) return [subagents];
  if (node.completed) return [{ state: "done", label: t("status.completed") }];
  return [{ state: "idle", label: t("status.idle") }];
}
function SessionStatusDots({ statuses }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: statuses[0].state }),
    statuses.map((status) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.visuallyHidden, children: status.label }, status.label))
  ] });
}
function PinnedIndicator({ t }) {
  const label = t("row.pinned");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.pinIndicator, role: "img", "aria-label": label, title: label, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPinFillRegular, { size: 14 }) });
}
function SessionHoverContent({ node, now, renderSlot, t }) {
  const statuses = sessionStatuses(node, t).filter((status) => !(node.archived && (status.state === "done" || status.state === "idle")));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Rows_default.hoverContent, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Rows_default.hoverTitle, children: displayTitle(node, t) }),
    !node.blank && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Rows_default.hoverTime, children: hoverTimeLabel(node.updatedAt, now, t) }),
    renderSlot("sidebar.session.row.hover", { sessionId: node.id }),
    statuses.map((status) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Rows_default.hoverStatus, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: status.state }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: status.label })
    ] }, status.label)),
    node.archived && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: clsx_default(Rows_default.hoverStatus, Rows_default.hoverArchived), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconArchiveOutlineRegular, { size: 14 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("row.archived") })
    ] })
  ] });
}
function SearchResultItem({ result, currentId, onOpen, onUnarchive, t }) {
  const selected = result.id === currentId;
  const statuses = sessionStatuses(result, t);
  const primaryStatus = statuses[0];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: clsx_default(Rows_default.searchResultRow, selected && Rows_default.selected, result.archived && Rows_default.archived),
      role: "treeitem",
      "aria-selected": selected,
      "aria-description": result.archived ? t("toast.archivedNotOpenable") : void 0,
      onClick: () => {
        onOpen(result.id);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Rows_default.searchResultHeading, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.slot, children: !result.archived && primaryStatus.state !== "idle" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionStatusDots, { statuses }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.searchResultTitle, children: result.title || t("session.untitled") }),
          result.archived && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.rowActions, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t("actions.unarchive"), side: "bottom", align: "end", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: Rows_default.iconButton,
              "aria-label": t("menu.unarchiveSession"),
              onClick: (e) => {
                e.stopPropagation();
                onUnarchive(result.id);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconUnarchiveOutlineRegular, { size: 14 })
            }
          ) }) })
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
  onRenameRequest,
  renderSlot,
  onReveal,
  drag,
  t
}) {
  const row = node;
  const title = displayTitle(node, t);
  const selected = node.id === currentId;
  const statuses = sessionStatuses(node, t);
  const primaryStatus = statuses[0];
  const showStatus = primaryStatus.state !== "idle";
  const draggable = drag !== void 0 && !row.blank && !row.archived;
  const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
  const menuOpenState = (0, import_react.useMemo)(() => [menuOpen, setMenuOpen], [menuOpen]);
  const rowRef = (0, import_react.useRef)(null);
  const titleRef = (0, import_react.useRef)(null);
  const marquee = useTitleMarquee(titleRef);
  (0, import_react.useEffect)(() => {
    if (onReveal === void 0) return;
    rowRef.current?.scrollIntoView({ block: "nearest" });
    onReveal();
  }, [onReveal]);
  const ownRow = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      ref: rowRef,
      "data-row-key": `session:${node.id}`,
      className: clsx_default(
        Rows_default.sessionRow,
        selected && Rows_default.selected,
        menuOpen && Rows_default.menuOpen,
        row.archived && Rows_default.archived,
        drag?.marker === "before" && Rows_default.dropBefore,
        drag?.marker === "after" && Rows_default.dropAfter
      ),
      role: "treeitem",
      "aria-selected": selected,
      "aria-description": row.archived ? t("toast.archivedNotOpenable") : void 0,
      onClick: () => {
        onOpen(node.id);
      },
      onPointerEnter: marquee.enter,
      onPointerLeave: marquee.leave,
      draggable,
      onDragStart: !draggable ? void 0 : (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", node.id);
        drag.start();
      },
      onDragEnd: !draggable ? void 0 : drag.end,
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Rows_default.slot, children: !row.archived && !row.blank && (showStatus ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionStatusDots, { statuses }) : renderSlot("sidebar.session.row.leading", { sessionId: node.id })) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "span",
          {
            ref: titleRef,
            className: Rows_default.title,
            onDoubleClick: row.blank ? void 0 : (e) => {
              e.stopPropagation();
              onRenameRequest(node.id, row.title);
            },
            children: title
          }
        ),
        !row.blank && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "span",
          {
            className: Rows_default.time,
            "aria-hidden": primaryStatus.trailingLabel === void 0 ? void 0 : true,
            children: primaryStatus.trailingLabel ?? timeLabel(row.updatedAt, now, t)
          }
        ),
        row.pinned && !row.archived && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PinnedIndicator, { t }),
        !row.blank && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Rows_default.rowActions, onClick: (e) => {
          e.stopPropagation();
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Menu,
            {
              open: menuOpen,
              onClose: () => {
                setMenuOpen(false);
              },
              portal: true,
              closeOnPointerLeave: true,
              anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: Rows_default.iconButton,
                  "aria-label": t("actions.session.aria", { name: title }),
                  onClick: () => {
                    setMenuOpen((v) => !v);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEllipsisOutlineRegular, {})
                }
              ),
              children: renderSlot(
                "sidebar.workspaces.session.menu.item",
                { sessionId: node.id, displayTitle: row.title },
                { hookContext: menuOpenState }
              )
            }
          ),
          renderSlot("sidebar.workspaces.session.row.action", { sessionId: node.id, displayTitle: row.title })
        ] })
      ]
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.HoverCard,
    {
      anchor: ownRow,
      content: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionHoverContent, { node, now, renderSlot, t }),
      openDelayMs: 800,
      disabled: menuOpen || drag?.active === true,
      copyText: row.blank || row.title === "" ? void 0 : row.title,
      copyLabel: t("copy"),
      copiedLabel: t("hover.copied")
    }
  );
}

// src/client/rows/AnimatedRows.tsx
var import_react2 = require("react");

// src/client/rows/AnimatedRows.module.css
var cssText2 = ".m52811e_exits {\n  position: absolute;\n  inset: 0;\n  contain: strict;\n  overflow: clip;\n  pointer-events: none;\n}\n";
var classMap2 = { "exits": "m52811e_exits" };
var tagId2 = "dsh-chat-manager/client/rows/AnimatedRows.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId2) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-chat-manager";
  tag.dataset.pluginCss = tagId2;
  tag.textContent = cssText2;
  document.head.appendChild(tag);
}
var AnimatedRows_default = classMap2;

// src/client/rows/AnimatedRows.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var ROW_FADE_MS = 100;
var ROW_GLIDE_MS = 200;
function sameRows(previous, next) {
  return previous.rowKeys.length === next.rowKeys.length && previous.rowKeys.every((key, index) => key === next.rowKeys[index]);
}
function intersects(row, viewport) {
  return row.bottom > viewport.top && row.top < viewport.bottom && row.right > viewport.left && row.left < viewport.right;
}
var AnimatedRows = class extends import_react2.Component {
  constructor() {
    super(...arguments);
    __publicField(this, "armed", false);
    __publicField(this, "list", (0, import_react2.createRef)());
    __publicField(this, "overlay", (0, import_react2.createRef)());
    __publicField(this, "movements", /* @__PURE__ */ new Map());
    __publicField(this, "exits", /* @__PURE__ */ new Map());
  }
  getSnapshotBeforeUpdate(previous) {
    const list = this.list.current;
    if (!this.armed || sameRows(previous, this.props) || previous.resetKey !== this.props.resetKey || !previous.ready || !this.props.ready || list === null || typeof list.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    const viewport = list.getBoundingClientRect();
    const positions = this.readPositions();
    const nextKeys = new Set(this.props.rowKeys);
    const removed = /* @__PURE__ */ new Map();
    for (const [key, row] of positions) {
      if (nextKeys.has(key) || !intersects(row.rect, viewport)) continue;
      const clone = row.element.cloneNode(true);
      clone.removeAttribute("data-row-key");
      clone.inert = true;
      clone.style.setProperty(
        "--dsh-workspace-indent",
        getComputedStyle(row.element).getPropertyValue("--dsh-workspace-indent")
      );
      removed.set(key, { ...row, element: clone });
    }
    return { positions, removed };
  }
  componentDidUpdate(previous, _state, snapshot) {
    if (snapshot === null) {
      if (!sameRows(previous, this.props) || previous.resetKey !== this.props.resetKey || previous.ready !== this.props.ready) this.clear();
      return;
    }
    this.cancelMovements();
    const list = this.list.current;
    const overlay = this.overlay.current;
    const viewport = list.getBoundingClientRect();
    const origin = overlay.getBoundingClientRect();
    const positions = this.readPositions();
    for (const [key, row] of positions) {
      this.removeExit(key);
      const previousRow = snapshot.positions.get(key);
      if (!intersects(row.rect, viewport) && (previousRow === void 0 || !intersects(previousRow.rect, viewport))) continue;
      if (previousRow === void 0) {
        this.move(row.element, [{ opacity: 0 }, { opacity: 1 }], ROW_FADE_MS);
        continue;
      }
      const dx = previousRow.rect.left - row.rect.left;
      const dy = previousRow.rect.top - row.rect.top;
      if (dx === 0 && dy === 0 && previousRow.opacity === 1) continue;
      this.move(row.element, [
        { transform: `translate(${String(dx)}px, ${String(dy)}px)`, opacity: previousRow.opacity },
        { transform: "translate(0, 0)", opacity: 1 }
      ], ROW_GLIDE_MS);
    }
    for (const [key, row] of snapshot.removed) {
      const { element } = row;
      this.removeExit(key);
      Object.assign(element.style, {
        position: "absolute",
        margin: "0",
        transform: "none",
        boxSizing: "border-box",
        left: `${String(row.rect.left - origin.left)}px`,
        top: `${String(row.rect.top - origin.top)}px`,
        width: `${String(row.rect.width)}px`,
        height: `${String(row.rect.height)}px`
      });
      overlay.append(element);
      const animation = element.animate([{ opacity: row.opacity }, { opacity: 0 }], {
        duration: ROW_FADE_MS,
        easing: "ease-out",
        fill: "forwards"
      });
      this.exits.set(key, { element, animation });
      animation.onfinish = () => {
        this.removeExit(key);
      };
    }
  }
  componentWillUnmount() {
    this.clear();
  }
  readPositions() {
    const list = this.list.current;
    const rows = list.querySelectorAll("[data-row-key]");
    return new Map(Array.from(rows, (element) => [element.dataset.rowKey, {
      element,
      rect: element.getBoundingClientRect(),
      opacity: this.movements.has(element) ? Number(getComputedStyle(element).opacity) : 1
    }]));
  }
  move(element, keyframes, duration) {
    const animation = element.animate(keyframes, { duration, easing: "ease-out" });
    this.movements.set(element, animation);
    animation.onfinish = () => {
      this.movements.delete(element);
      animation.cancel();
    };
  }
  cancelMovements() {
    for (const animation of this.movements.values()) {
      animation.onfinish = null;
      animation.cancel();
    }
    this.movements.clear();
  }
  removeExit(key) {
    const exit = this.exits.get(key);
    if (exit === void 0) return;
    exit.animation.onfinish = null;
    exit.animation.cancel();
    exit.element.remove();
    this.exits.delete(key);
  }
  clear() {
    this.cancelMovements();
    for (const key of this.exits.keys()) this.removeExit(key);
  }
  render() {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          ref: this.list,
          className: this.props.className,
          role: "tree",
          "aria-label": this.props.label,
          onPointerDownCapture: () => {
            this.armed = true;
          },
          onKeyDownCapture: () => {
            this.armed = true;
          },
          children: this.props.children
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { ref: this.overlay, className: AnimatedRows_default.exits, "aria-hidden": "true" })
    ] });
  }
};

// src/client/WorkspacePicker.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/WorkspacePicker.module.css
var cssText3 = "/* The adoption error dialog's footer and message styles; the dialog itself is\n * the shared Modal (same figma dialog family as the browser's own dialogs). */\n.m662cb4_modalAction {\n  min-width: 72px;\n}\n\n.m662cb4_modalError,\n.m662cb4_menuStatus {\n  margin-top: 8px;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.m662cb4_modalError {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.m662cb4_menuStatus {\n  color: var(--dsw-alias-label-secondary);\n}\n";
var classMap3 = { "modalAction": "m662cb4_modalAction", "modalError": "m662cb4_modalError", "menuStatus": "m662cb4_menuStatus" };
var tagId3 = "dsh-chat-manager/client/WorkspacePicker.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId3) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-chat-manager";
  tag.dataset.pluginCss = tagId3;
  tag.textContent = cssText3;
  document.head.appendChild(tag);
}
var WorkspacePicker_default = classMap3;

// src/client/WorkspacePicker.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
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
  onBusyChange,
  side = "bottom",
  selectedId
}) {
  const workspaceSnapshot = useWorkspaces((state) => state);
  const workspaces = workspaceSnapshot.items;
  const getAnchorRect = (0, import_react3.useCallback)(
    () => anchorRef?.current?.getBoundingClientRect() ?? null,
    [anchorRef]
  );
  const [errorOpen, setErrorOpen] = (0, import_react3.useState)(false);
  const [modalError, setModalError] = (0, import_react3.useState)(null);
  const [flowOpen, setFlowOpen] = (0, import_react3.useState)(false);
  const [pickingFolder, setPickingFolder] = (0, import_react3.useState)(false);
  const flowBusy = flowOpen || pickingFolder;
  (0, import_react3.useEffect)(() => {
    onBusyChange?.(flowBusy);
  }, [flowBusy, onBusyChange]);
  const flowAvailable = useDirectoryFlow((occupied) => occupied);
  (0, import_react3.useEffect)(() => {
    if (flowOpen && !flowAvailable) setFlowOpen(false);
  }, [flowOpen, flowAvailable]);
  const addEntries = flowAvailable ? [{ id: ADD_WORKSPACE, label: t("menu.addWorkspace"), icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.IconPlusOutlineRegular, { size: 16 }), disabled: flowBusy }] : [];
  const pinAdd = !addOnly && workspaces.length > 0;
  const items = pinAdd ? workspaces.map((workspace) => ({
    id: workspace.workspaceId,
    label: workspaceDisplayTitle(workspace.title, t("workspace.defaultName")),
    icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.IconFolderCloseRegular, { size: 16 }),
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
  const openDirectoryFlow = (0, import_react3.useCallback)(() => {
    onClose();
    setErrorOpen(false);
    setModalError(null);
    setFlowOpen(true);
  }, [onClose]);
  const listSettled = addOnly || workspaceSnapshot.phase === "ready";
  const addIsTheOnlyEntry = !pinAdd && listSettled && addEntries.length === 1;
  (0, import_react3.useEffect)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
    open && !addIsTheOnlyEntry && !menuIsEmpty && workspaceSnapshot.phase === "pending" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: WorkspacePicker_default.menuStatus, role: "status", children: t("picker.loading") }),
    renderDirectoryFlow(flowOwner),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives2.Modal,
      {
        open: errorOpen,
        onClose: closeModal,
        closeLabel: t("close"),
        title: t("folderError.title"),
        footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", className: WorkspacePicker_default.modalAction, onClick: closeModal, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "primary", className: WorkspacePicker_default.modalAction, disabled: !flowAvailable, onClick: openDirectoryFlow, children: t("folderError.retry") })
        ] }),
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: WorkspacePicker_default.modalError, role: "alert", children: modalError })
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
var import_react4 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/rows/WorkspaceBrowser.module.css
var cssText4 = ".m02ab30_root {\n  --dsh-session-list-edge-inset: var(--dsh-sidebar-inline-padding);\n  --dsh-session-list-scrollbar-width: 5px;\n  --dsh-session-list-scrollbar-offset: 2px;\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  padding-right: var(--dsh-session-list-edge-inset);\n}\n\n.m02ab30_root.m02ab30_rail {\n  padding-right: 0;\n}\n\n.m02ab30_iconButton {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* The action cluster animates its width and the search pill rounds its corners,\n * so both clip an outer ring; these controls keep theirs inside instead. */\n.m02ab30_iconButton:focus-visible,\n.m02ab30_searchButton:focus-visible,\n.m02ab30_clearButton:focus-visible {\n  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: -2px;\n}\n\n.m02ab30_iconButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* View-options dropdown card: labels are short, so a content-sized card reads\n   cramped and its width shifts with the locale \u2014 hold a stable floor. */\n.m02ab30_viewOptionsMenu {\n  min-width: 200px;\n}\n\n/* Section header: title, an inline search control, and the two trailing\n   actions. Expanding search collapses the action cluster and takes its room. */\n.m02ab30_sectionHeader {\n  flex: none;\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 4px;\n  height: 36px;\n  padding-left: 4px;\n  margin-bottom: 4px;\n  box-sizing: border-box;\n  border-radius: var(--dsw-radius-md);\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m02ab30_root:not(.m02ab30_rail) .m02ab30_sectionHeader {\n  margin-top: 2px;\n  margin-right: -4px;\n}\n\n.m02ab30_sectionLabel {\n  flex: none;\n  max-width: 45%;\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  line-height: 20px;\n  opacity: 1;\n  visibility: visible;\n  transition:\n    max-width 180ms var(--ds-ease-in-out),\n    margin-right 180ms var(--ds-ease-in-out),\n    opacity 120ms var(--ds-ease-in-out),\n    transform 180ms var(--ds-ease-in-out),\n    visibility 0s linear;\n}\n\n.m02ab30_sectionLabelHidden {\n  max-width: 0;\n  margin-right: -4px;\n  opacity: 0;\n  transform: translateX(-4px);\n  visibility: hidden;\n  transition-delay: 0s, 0s, 0s, 0s, 180ms;\n}\n\n.m02ab30_searchSlot {\n  flex: 1;\n  max-width: 28px;\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  margin-left: auto;\n  padding-left: 0;\n  box-sizing: border-box;\n  transition:\n    max-width 180ms var(--ds-ease-in-out),\n    padding-left 180ms var(--ds-ease-in-out);\n}\n\n.m02ab30_searchSlotExpanded {\n  max-width: 100%;\n  padding-left: 0;\n}\n\n.m02ab30_headerActions {\n  flex: none;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  max-width: 60px;\n  opacity: 1;\n  overflow: hidden;\n  visibility: visible;\n  transition:\n    max-width 180ms var(--ds-ease-in-out),\n    opacity 120ms var(--ds-ease-in-out),\n    transform 180ms var(--ds-ease-in-out),\n    visibility 0s linear;\n}\n\n.m02ab30_headerActionsHidden {\n  max-width: 0;\n  opacity: 0;\n  transform: translateX(4px);\n  visibility: hidden;\n  pointer-events: none;\n  transition-delay: 0s, 0s, 0s, 180ms;\n}\n\n/* Inline search always fills the room between the title and trailing actions;\n   it grows farther right when the action cluster collapses. */\n.m02ab30_search {\n  flex: none;\n  display: flex;\n  align-items: center;\n  gap: 0;\n  width: 100%;\n  height: 28px;\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n  cursor: text;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  transition:\n    width 180ms var(--ds-ease-in-out),\n    padding 180ms var(--ds-ease-in-out),\n    border-color 180ms var(--ds-ease-in-out),\n    background-color 180ms var(--ds-ease-in-out);\n}\n\n.m02ab30_searchExpanded {\n  width: calc(100% + 4px);\n  height: 30px;\n  margin-inline: -2px;\n  padding: 0 4px 0 0;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: var(--dsw-radius-md);\n  background: transparent;\n  color: var(--dsw-alias-label-caption);\n}\n\n.m02ab30_searchButton {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  color: inherit;\n}\n\n.m02ab30_searchExpanded .m02ab30_searchButton {\n  width: 28px;\n  height: 30px;\n}\n\n.m02ab30_searchButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.m02ab30_searchExpanded .m02ab30_searchButton:hover {\n  background: transparent;\n}\n\n.m02ab30_searchInput {\n  flex: 1;\n  width: 0;\n  min-width: 0;\n  border: none;\n  outline: none;\n  background: transparent;\n  opacity: 0;\n  pointer-events: none;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n  transition: opacity 120ms var(--ds-ease-in-out);\n}\n\n.m02ab30_searchExpanded .m02ab30_searchInput {\n  margin-left: -2px;\n  opacity: 1;\n  pointer-events: auto;\n}\n\n.m02ab30_searchInput::placeholder {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m02ab30_clearButton {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 24px;\n  height: 24px;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.m02ab30_clearButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* Rail variant (own .rail class from the wide owner prop \u2014 the region never\n   reads the shell's class names): the two icon controls stack as 36x36\n   circles matching the shell's rail rhythm. Both use the rail's shared base\n   left anchor so the outer shell can translate the whole region uniformly. */\n.m02ab30_rail .m02ab30_sectionHeader {\n  gap: 0;\n  padding-left: 0;\n  margin-bottom: 12px;\n  justify-content: flex-start;\n}\n\n.m02ab30_rail .m02ab30_headerActions {\n  max-width: none;\n}\n\n.m02ab30_rail .m02ab30_iconButton {\n  width: 36px;\n  height: 36px;\n  /* Rail hovers share the shell rail's 12px rounding. */\n  border-radius: var(--dsw-radius-md);\n  color: var(--dsw-alias-label-primary);\n}\n\n.m02ab30_rail .m02ab30_search {\n  width: 36px;\n  height: 36px;\n  padding: 0;\n  margin: 0 0 12px;\n  gap: 0;\n  /* The collapsed search frame clips its button's hover, so it must carry the\n     rail's 12px rounding itself. */\n  border-radius: var(--dsw-radius-md);\n  border-color: transparent;\n  background: transparent;\n}\n\n.m02ab30_rail .m02ab30_searchButton {\n  width: 36px;\n  height: 36px;\n  border-radius: var(--dsw-radius-md);\n  color: var(--dsw-alias-label-primary);\n}\n\n.m02ab30_rail .m02ab30_searchButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* List seat: always mounted so the shell foot never moves. */\n.m02ab30_listArea {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  margin-left: -4px;\n  margin-right: calc(-1 * var(--dsh-session-list-edge-inset));\n  padding-left: 4px;\n  /* The list remains the scroll clip. This seat stays visible so the\n     absolutely positioned first-boundary marker can occupy the header gap. */\n  overflow: visible;\n}\n\n.m02ab30_rail .m02ab30_listArea {\n  margin-left: 0;\n  margin-right: 0;\n  padding-left: 0;\n}\n\n/* Relative for the bottom fade overlay. */\n.m02ab30_treeBody {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  position: relative;\n}\n\n/* Bottom fade: compact overlay pinned to the visible bottom,\n   transparent -> sidebar fill so it tracks the theme. */\n.m02ab30_fade {\n  position: absolute;\n  left: 0;\n  right: var(--dsh-session-list-edge-inset);\n  bottom: 0;\n  height: 24px;\n  background: linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill));\n  pointer-events: none;\n}\n\n/* macOS desktop: the sidebar is translucent over window vibrancy, so the\n   opaque fill gradient would paint a solid smear instead of a fade. */\n[data-platform='darwin'] .m02ab30_fade {\n  display: none;\n}\n\n/* Wide-only content fades back in on expand remount (mirrors the shell). */\n.m02ab30_wide {\n  animation: wide-in 200ms var(--ds-ease-in-out);\n}\n\n@keyframes wide-in {\n  from { opacity: 0; }\n}\n\n/* List: the only scrolling region. Block children keep their design heights\n   under content overflow. The 2px edge offset, stable 5px themed scrollbar,\n   and remaining padding equal the shell's right inset, with or without\n   overflow, so moving the bar does not move the rows. */\n.m02ab30_list {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  margin-left: -4px;\n  margin-right: var(--dsh-session-list-scrollbar-offset);\n  padding-left: 4px;\n  padding-right: calc(\n    var(--dsh-session-list-edge-inset)\n    - var(--dsh-session-list-scrollbar-width)\n    - var(--dsh-session-list-scrollbar-offset)\n  );\n  /* Clears the compact bottom fade overlay: at scroll end the last row sits\n     above the gradient instead of under it. */\n  padding-bottom: 16px;\n  scrollbar-gutter: stable;\n}\n\n.m02ab30_flatList > * + *,\n.m02ab30_searchTree > [role='treeitem'] + [role='treeitem'],\n.m02ab30_groupSection > * + * {\n  margin-top: 2px;\n}\n\n.m02ab30_searchStatus {\n  padding: 10px 12px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* Pending content search: skeleton rows on searchResultRow metrics \u2014 a round\n   leading glyph beside a title bar and a wider snippet bar, breathing through\n   opacity (same pulse as the input-trigger menu skeleton). */\n.m02ab30_skeletonRow {\n  display: flex;\n  /* Top alignment lines the 16px dot up with the equally tall title bar;\n     the paddings center the 35px content in the 48px row. */\n  align-items: flex-start;\n  gap: 8px;\n  box-sizing: border-box;\n  min-height: 48px;\n  padding: 6px 8px 7px;\n}\n\n.m02ab30_skeletonDot {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  corner-shape: round;\n}\n\n.m02ab30_skeletonBars {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.m02ab30_skeletonDot,\n.m02ab30_skeletonBar {\n  background: var(--dsw-alias-bg-skeleton);\n  animation: search-skeleton 2s cubic-bezier(0.36, 0, 0.64, 1) infinite;\n}\n\n.m02ab30_skeletonBar {\n  width: 65%;\n  height: 16px;\n  border-radius: var(--dsw-radius-xs);\n}\n\n.m02ab30_skeletonBarWide {\n  width: 90%;\n  height: 13px;\n}\n\n@keyframes search-skeleton {\n  0% { opacity: 1; }\n  40% { opacity: 0.6; }\n  80%, 100% { opacity: 1; }\n}\n\n/* One workspace section: header row + a compact expanded session run. */\n.m02ab30_groupSection {\n  position: relative;\n}\n\n.m02ab30_groupSection + .m02ab30_groupSection {\n  margin-top: 4px;\n}\n\n.m02ab30_listTopDropIndicator,\n.m02ab30_workspaceDropBefore::before,\n.m02ab30_workspaceDropAfter::after {\n  content: '';\n  position: absolute;\n  z-index: 1;\n  left: 0;\n  right: 0;\n  height: 12px;\n  background:\n    linear-gradient(\n      55deg,\n      transparent calc(50% - 1px),\n      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),\n      transparent calc(50% + 1px)\n    ) 0 0 / 5px 7px no-repeat,\n    linear-gradient(\n      125deg,\n      transparent calc(50% - 1px),\n      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),\n      transparent calc(50% + 1px)\n    ) 0 5px / 5px 7px no-repeat,\n    linear-gradient(\n      var(--dsw-alias-state-business-primary) 0 0\n    ) 4px 5px / calc(100% - 4px) 2px no-repeat;\n  pointer-events: none;\n}\n\n/* The first insertion boundary keeps the same -8px coordinate as every\n   Workspace boundary, but lives outside the scrolling clip. */\n.m02ab30_listTopDropIndicator {\n  top: -8px;\n  left: 0;\n  right: var(--dsh-session-list-edge-inset);\n}\n\n.m02ab30_listTopDropActive > .m02ab30_workspaceDropBefore:first-child::before {\n  display: none;\n}\n\n.m02ab30_workspaceDropBefore::before {\n  top: -8px;\n}\n\n.m02ab30_workspaceDropAfter::after {\n  bottom: -8px;\n}\n\n.m02ab30_sessionOverflowButton {\n  width: 100%;\n  height: 28px;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  padding: 0 12px 0 calc(28px + var(--dsh-workspace-indent, 0px));\n  background: transparent;\n  cursor: pointer;\n  text-align: left;\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.m02ab30_groupSection > .m02ab30_sessionOverflowButton {\n  margin-top: 0;\n}\n\n.m02ab30_sessionOverflowButton:hover {\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.m02ab30_empty {\n  padding: 16px 12px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 13px;\n}\n\n.m02ab30_emptyState {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  margin-top: 80px;\n  padding: 0 12px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.m02ab30_emptyState > svg {\n  margin-bottom: 4px;\n  color: var(--dsw-alias-label-caption);\n}\n\n.m02ab30_emptyAction {\n  padding: 0;\n  border: none;\n  background: none;\n  cursor: pointer;\n  font-size: 13px;\n  line-height: 20px;\n  color: var(--dsw-alias-link);\n}\n\n/* Rename dialog form (same figma dialog family as the create modals). */\n.m02ab30_renameInput {\n  box-sizing: border-box;\n  width: 100%;\n  height: 44px;\n  padding: 7px 14px;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: var(--dsw-radius-lg);\n  outline: none;\n  background: transparent;\n  font-size: 14px;\n  font-weight: 400;\n  line-height: 22px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m02ab30_renameInput:disabled {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n.m02ab30_renameError {\n  margin-top: 8px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.m02ab30_deleteAction:not(:disabled) {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.m02ab30_deleteStatus {\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* The stop-and-archive dialog's list of work that will be stopped. */\n.m02ab30_archiveActivity {\n  margin: 0 0 8px;\n  padding-left: 18px;\n  font-size: 13px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.m02ab30_archiveActivity li {\n  overflow-wrap: anywhere;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .m02ab30_wide {\n    animation: none;\n  }\n\n  .m02ab30_skeletonDot,\n  .m02ab30_skeletonBar {\n    animation: none;\n  }\n\n  .m02ab30_search,\n  .m02ab30_sectionLabel,\n  .m02ab30_searchSlot,\n  .m02ab30_searchInput,\n  .m02ab30_headerActions {\n    transition: none;\n  }\n}\n\n/* ---- dsh-chat-manager additions ---- */\n.m02ab30_chatSection {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n\n.m02ab30_chatList {\n  flex: 1;\n  min-height: 0;\n}\n\n.m02ab30_split {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  padding-top: 2px;\n}\n\n.m02ab30_pane {\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.m02ab30_divider {\n  flex: none;\n  height: 8px;\n  cursor: row-resize;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  touch-action: none;\n}\n\n.m02ab30_divider::before {\n  content: '';\n  width: 28px;\n  height: 2px;\n  border-radius: 1px;\n  background: var(--dsw-alias-interactive-border, rgba(128, 128, 128, 0.35));\n}\n\n.m02ab30_archivedPage {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  padding: 4px 0;\n}\n\n.m02ab30_archivedRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 12px;\n  border-radius: 10px;\n  background: var(--dsw-alias-interactive-bg-subtle, transparent);\n}\n\n.m02ab30_archivedTitle {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary, inherit);\n}\n\n.m02ab30_archivedTime {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary, inherit);\n  font-size: 12px;\n  line-height: 17px;\n}\n";
var classMap4 = { "root": "m02ab30_root", "rail": "m02ab30_rail", "iconButton": "m02ab30_iconButton", "searchButton": "m02ab30_searchButton", "clearButton": "m02ab30_clearButton", "viewOptionsMenu": "m02ab30_viewOptionsMenu", "sectionHeader": "m02ab30_sectionHeader", "sectionLabel": "m02ab30_sectionLabel", "sectionLabelHidden": "m02ab30_sectionLabelHidden", "searchSlot": "m02ab30_searchSlot", "searchSlotExpanded": "m02ab30_searchSlotExpanded", "headerActions": "m02ab30_headerActions", "headerActionsHidden": "m02ab30_headerActionsHidden", "search": "m02ab30_search", "searchExpanded": "m02ab30_searchExpanded", "searchInput": "m02ab30_searchInput", "listArea": "m02ab30_listArea", "treeBody": "m02ab30_treeBody", "fade": "m02ab30_fade", "wide": "m02ab30_wide", "list": "m02ab30_list", "flatList": "m02ab30_flatList", "searchTree": "m02ab30_searchTree", "groupSection": "m02ab30_groupSection", "searchStatus": "m02ab30_searchStatus", "skeletonRow": "m02ab30_skeletonRow", "skeletonDot": "m02ab30_skeletonDot", "skeletonBars": "m02ab30_skeletonBars", "skeletonBar": "m02ab30_skeletonBar", "skeletonBarWide": "m02ab30_skeletonBarWide", "listTopDropIndicator": "m02ab30_listTopDropIndicator", "workspaceDropBefore": "m02ab30_workspaceDropBefore", "workspaceDropAfter": "m02ab30_workspaceDropAfter", "listTopDropActive": "m02ab30_listTopDropActive", "sessionOverflowButton": "m02ab30_sessionOverflowButton", "empty": "m02ab30_empty", "emptyState": "m02ab30_emptyState", "emptyAction": "m02ab30_emptyAction", "renameInput": "m02ab30_renameInput", "renameError": "m02ab30_renameError", "deleteAction": "m02ab30_deleteAction", "deleteStatus": "m02ab30_deleteStatus", "archiveActivity": "m02ab30_archiveActivity", "chatSection": "m02ab30_chatSection", "chatList": "m02ab30_chatList", "split": "m02ab30_split", "pane": "m02ab30_pane", "divider": "m02ab30_divider", "archivedPage": "m02ab30_archivedPage", "archivedRow": "m02ab30_archivedRow", "archivedTitle": "m02ab30_archivedTitle", "archivedTime": "m02ab30_archivedTime" };
var tagId4 = "dsh-chat-manager/client/rows/WorkspaceBrowser.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId4) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-chat-manager";
  tag.dataset.pluginCss = tagId4;
  tag.textContent = cssText4;
  document.head.appendChild(tag);
}
var WorkspaceBrowser_default = classMap4;

// src/client/addon/ChatSection.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function ChatSection({
  wide,
  useSessions,
  useSessionStatus,
  useWorkspaces,
  useChat,
  renderSlot,
  currentId,
  deletedSessionIds,
  open,
  onRenameRequest,
  onNewChat,
  searchChats,
  t
}) {
  const list = useSessions((s) => s);
  const statuses = useSessionStatus((s) => s);
  const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds);
  const pinnedSessionIds = useWorkspaces((s) => s.pinnedSessionIds);
  const chat = useChat((s) => s);
  const chatRoot = typeof chat?.root === "string" ? chat.root : null;
  const [query, setQuery] = (0, import_react4.useState)("");
  const [searchExpanded, setSearchExpanded] = (0, import_react4.useState)(false);
  const [hits, setHits] = (0, import_react4.useState)([]);
  const [searching, setSearching] = (0, import_react4.useState)(false);
  const searchRootRef = (0, import_react4.useRef)(null);
  const searchInputRef = (0, import_react4.useRef)(null);
  const normalizedQuery = sanitizeSearchQuery(query).trim().toLowerCase();
  const chatNodes = (0, import_react4.useMemo)(() => {
    const rowState = {
      pinnedSessionIds,
      archivedSessionIds,
      archivedFilter: "default"
    };
    const memberIds = visibleSessionIds(list, rowState.archivedSessionIds, "default");
    return deriveFlat(list, memberIds, rowState, statuses, deletedSessionIds).filter((row) => isUnderChatRoot(list.byId[row.id]?.cwd, chatRoot));
  }, [list, statuses, archivedSessionIds, pinnedSessionIds, deletedSessionIds, chatRoot]);
  const shown = (0, import_react4.useMemo)(() => {
    if (normalizedQuery === "") return chatNodes;
    const matchedIds = /* @__PURE__ */ new Set();
    for (const node of chatNodes) {
      if (node.title === "") continue;
      if (node.title.toLowerCase().includes(normalizedQuery)) matchedIds.add(node.id);
    }
    for (const hit of hits) matchedIds.add(hit.sessionId);
    return chatNodes.filter((node) => matchedIds.has(node.id));
  }, [normalizedQuery, chatNodes, hits]);
  (0, import_react4.useEffect)(() => {
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
  (0, import_react4.useEffect)(() => {
    if (!wide || !searchExpanded) return;
    searchInputRef.current?.focus({ preventScroll: true });
  }, [wide, searchExpanded]);
  (0, import_react4.useEffect)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: WorkspaceBrowser_default.chatSection, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: WorkspaceBrowser_default.sectionHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: clsx_default(WorkspaceBrowser_default.sectionLabel, WorkspaceBrowser_default.wide, searchExpanded && WorkspaceBrowser_default.sectionLabelHidden), children: t("chat.section") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: clsx_default(WorkspaceBrowser_default.searchSlot, searchExpanded && WorkspaceBrowser_default.searchSlotExpanded), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "div",
        {
          ref: searchRootRef,
          className: clsx_default(WorkspaceBrowser_default.search, searchExpanded && WorkspaceBrowser_default.searchExpanded),
          onClick: () => {
            setSearchExpanded(true);
            searchInputRef.current?.focus();
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("search"), side: "bottom", delayMs: 500, disabled: searchExpanded, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                className: WorkspaceBrowser_default.searchButton,
                "aria-label": t("chat.search.aria"),
                "aria-expanded": searchExpanded,
                onClick: () => {
                  setSearchExpanded(true);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconSearchOutlineRegular, { size: searchExpanded ? 11 : 14 })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
                children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconCloseFillRegular, {})
              }
            )
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: clsx_default(WorkspaceBrowser_default.headerActions, searchExpanded && WorkspaceBrowser_default.headerActionsHidden), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("chat.add"), side: "bottom", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: WorkspaceBrowser_default.iconButton,
          "aria-label": t("chat.add"),
          onClick: () => {
            onNewChat();
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconPlusOutlineRegular, {})
        }
      ) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.treeBody, WorkspaceBrowser_default.wide, WorkspaceBrowser_default.chatList), children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.list, WorkspaceBrowser_default.flatList), role: "tree", "aria-label": t("chat.section"), children: [
        shown.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: WorkspaceBrowser_default.empty, children: normalizedQuery === "" ? t("chat.empty") : searching ? t("search.pending") : t("search.noMatches") }),
        shown.map((node) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          SessionNodeItem,
          {
            node,
            currentId,
            now,
            onOpen: open,
            onRenameRequest,
            renderSlot,
            t
          },
          node.id
        ))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: WorkspaceBrowser_default.fade })
    ] })
  ] });
}

// src/client/rows/WorkspaceBrowser.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var EXPAND_SLIDE_MS = 300;
var SEARCH_DEBOUNCE_MS = 250;
var SEARCH_QUERY_MAX_CODE_UNITS = 500;
var COLLAPSED_SESSION_LIMIT = 5;
function collapsedSessionRows(sessions, limit = COLLAPSED_SESSION_LIMIT) {
  let idleCount = 0;
  const rows = sessions.filter((session) => {
    if (session.blank || session.running || session.runningSubagentCount > 0) return true;
    if (idleCount >= limit) return false;
    idleCount += 1;
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
function useNativeDragAcceptance(active) {
  (0, import_react5.useEffect)(() => {
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
function ViewOptionsMenu({ groupBy, orderBy, archivedFilter, onGroupPick, onOrderPick, onArchivedFilterPick, t }) {
  const [open, setOpen] = (0, import_react5.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    import_dsh_client_ui_primitives4.Menu,
    {
      open,
      onClose: () => {
        setOpen(false);
      },
      items: [
        { type: "label", id: "group-by", text: t("groupBy.label") },
        { id: "workspace", label: t("groupBy.workspace"), icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconFolderCloseRegular, {}) },
        { id: "workspace-tree", label: t("groupBy.workspaceTree"), icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconWorkspaceTreeOutlineRegular, {}) },
        { id: "flat", label: t("groupBy.flat"), icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconFlatListOutlineRegular, {}) },
        { type: "separator", id: "order-by-separator" },
        { type: "label", id: "order-by", text: t("orderBy.label") },
        { id: "manual", label: t("orderBy.manual"), icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconChevronsUpDownOutlineRegular, {}) },
        { id: "updated", label: t("orderBy.updated"), icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconClockOutlineRegular, {}) },
        { type: "separator", id: "archived-filter-separator" },
        { type: "label", id: "filter-by", text: t("filterBy.label") },
        { id: "hide-archived", label: t("viewOptions.hideArchived"), icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconArchiveOffOutlineRegular, {}) },
        { id: "show-archived", label: t("viewOptions.showArchived"), icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconQueueOutlineRegular, {}) },
        { id: "only-archived", label: t("viewOptions.onlyArchived"), icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconArchiveCheckOutlineRegular, {}) }
      ],
      selectedIds: [
        groupBy,
        orderBy,
        { default: "hide-archived", show: "show-archived", only: "only-archived" }[archivedFilter]
      ],
      onSelect: (id) => {
        if (id === "workspace" || id === "workspace-tree" || id === "flat") onGroupPick(id);
        else if (id === "manual" || id === "updated") onOrderPick(id);
        else if (id === "hide-archived") onArchivedFilterPick("default");
        else if (id === "show-archived") onArchivedFilterPick("show");
        else if (id === "only-archived") onArchivedFilterPick("only");
        setOpen(false);
      },
      align: "end",
      dense: true,
      listClassName: WorkspaceBrowser_default.viewOptionsMenu,
      portal: true,
      anchor: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("viewOptions.label"), side: "bottom", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: clsx_default(WorkspaceBrowser_default.iconButton, WorkspaceBrowser_default.wide),
          "aria-label": t("viewOptions.label"),
          onClick: () => {
            setOpen((v) => !v);
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconSlidersTwoOutlineRegular, {})
        }
      ) })
    }
  );
}
function sessionDragOrder(order, rows, drag, over) {
  const source = rows.find((row) => row.id === drag.sessionId);
  const target = rows.find((row) => row.id === over.id);
  if (source === void 0 || target === void 0 || source.blank || source.pinned !== drag.pinned || target.pinned !== drag.pinned || source.id === target.id || !order.includes(source.id)) return;
  const section = rows.filter((row) => row.pinned === drag.pinned);
  const sourceIndex = section.findIndex((row) => row.id === source.id);
  const withoutSource = section.filter((row) => row.id !== source.id);
  const insertAt = withoutSource.findIndex((row) => row.id === target.id) + (over.half === "after" ? 1 : 0);
  if (insertAt === sourceIndex) return;
  const next = order.filter((id) => id !== source.id);
  const targetIndex = next.indexOf(target.id);
  if (targetIndex === -1) return;
  next.splice(targetIndex + (over.half === "after" ? 1 : 0), 0, source.id);
  return pinCurrentBlank(next, rows.find((row) => row.blank)?.id);
}
function workspaceGroupHalf(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
function EmptySessions({ rowState, onLeaveArchivedOnly, t }) {
  const archivedOnly = rowState.archivedFilter === "only";
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: WorkspaceBrowser_default.emptyState, "data-row-key": "empty", children: [
    archivedOnly ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconArchiveOutlineRegular, { size: 24 }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconQueueOutlineRegular, { size: 24 }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { children: archivedOnly ? t("empty.noneArchived") : t("empty.none") }),
    archivedOnly && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: WorkspaceBrowser_default.emptyAction, onClick: onLeaveArchivedOnly, children: t("empty.viewOthers") })
  ] });
}
function SessionTree({
  list,
  useSessionStatus,
  startSession,
  open,
  workspaces,
  ungroupedSessionIds,
  excludedSessionIds,
  rowState,
  onLeaveArchivedOnly,
  workspaceReady,
  animationResetKey,
  usePanelInfo,
  onRenameRequest,
  onDeleteRequest,
  onSessionRenameRequest,
  renderSlot,
  insertWorkspaceBefore,
  nestWorkspaces,
  groupExpansion,
  setGroupExpanded,
  setSessionOrder,
  home,
  t,
  revealSessionId,
  onSessionRevealed,
  shortcuts
}) {
  const panelActive = usePanelInfo((info) => info.activePanelId !== null);
  const statuses = useSessionStatus((s) => s);
  const current = panelActive ? void 0 : Object.values(list.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id;
  const revealGroup = revealSessionId === void 0 || !workspaceReady ? void 0 : owningGroupKey(workspaces, revealSessionId);
  const [sessionLimits, setSessionLimits] = (0, import_react5.useState)({});
  const [drag, setDrag] = (0, import_react5.useState)(null);
  const sessionDropCommitted = (0, import_react5.useRef)(false);
  const [workspaceDrag, setWorkspaceDrag] = (0, import_react5.useState)(null);
  const workspaceDropCommitted = (0, import_react5.useRef)(false);
  const nativeDragActive = drag !== null || workspaceDrag !== null;
  useNativeDragAcceptance(nativeDragActive);
  const currentGroup = current === void 0 || !workspaceReady ? void 0 : owningGroupKey(workspaces, current);
  (0, import_react5.useEffect)(() => {
    if (current === void 0 || currentGroup === void 0 || Object.hasOwn(groupExpansion, currentGroup)) return;
    setGroupExpanded(currentGroup, true);
  }, [current, currentGroup, setGroupExpanded, groupExpansion]);
  const parents = (0, import_react5.useMemo)(() => {
    if (!nestWorkspaces) return /* @__PURE__ */ new Map();
    const keysByPath = new Map(workspaces.map((workspace) => [workspace.path, workspace.workspaceId]));
    const paths = [...keysByPath.keys()];
    return new Map(workspaces.map((workspace) => {
      const path = owningParentFolder(workspace.path, paths);
      return [workspace.workspaceId, path === void 0 ? void 0 : keysByPath.get(path)];
    }));
  }, [nestWorkspaces, workspaces]);
  const currentAncestors = (0, import_react5.useMemo)(() => {
    const keys = /* @__PURE__ */ new Set();
    for (let key = currentGroup === void 0 ? void 0 : parents.get(currentGroup); key !== void 0; key = parents.get(key)) {
      keys.add(key);
    }
    return keys;
  }, [currentGroup, parents]);
  const expandedGroups = (0, import_react5.useMemo)(() => {
    const ancestorKeys = new Set(parents.values());
    return [...workspaces.map((workspace) => workspace.workspaceId), UNGROUPED_KEY].filter((key) => groupExpansion[key] ?? ancestorKeys.has(key));
  }, [groupExpansion, parents, workspaces]);
  const groups = (0, import_react5.useMemo)(
    () => deriveGroups(list, workspaces, rowState, statuses, {
      expandedGroups,
      ungroupedOrder: ungroupedSessionIds
    }, excludedSessionIds),
    [list, workspaces, rowState, statuses, expandedGroups, ungroupedSessionIds, excludedSessionIds]
  );
  (0, import_react5.useEffect)(() => {
    for (let key = revealGroup; key !== void 0; key = parents.get(key)) {
      if (groupExpansion[key] === false || key === revealGroup && groupExpansion[key] !== true) {
        setGroupExpanded(key, true);
      }
    }
  }, [groupExpansion, parents, revealGroup, setGroupExpanded]);
  (0, import_react5.useEffect)(() => {
    if (revealSessionId === void 0 || revealGroup === void 0) return;
    const group = groups.find((candidate) => candidate.key === revealGroup);
    if (group === void 0 || !group.expanded || !group.sessions.some((row) => row.id === revealSessionId)) return;
    if (collapsedSessionRows(group.sessions).rows.some((row) => row.id === revealSessionId)) return;
    setSessionLimits((limits) => limits[revealGroup] === Infinity ? limits : { ...limits, [revealGroup]: Infinity });
  }, [groups, revealGroup, revealSessionId]);
  const now = Date.now();
  const commitSessionDrag = (activeDrag, over) => {
    if (sessionDropCommitted.current) return;
    sessionDropCommitted.current = true;
    setDrag(null);
    const group = groups.find((candidate) => candidate.key === activeDrag.accountKey);
    if (group === void 0) return;
    if (over.id === activeDrag.sessionId) return;
    const accountSessionIds = activeDrag.accountKey === UNGROUPED_KEY ? ungroupedSessionIds : workspaces.find((workspace) => workspace.workspaceId === activeDrag.accountKey)?.sessionIds;
    if (accountSessionIds === void 0) return;
    const renderedSessions = collapsedSessionRows(group.sessions, sessionLimits[group.key]).rows;
    const nextOrder = sessionDragOrder(accountSessionIds, renderedSessions, activeDrag, over);
    if (nextOrder !== void 0) setSessionOrder(activeDrag.accountKey, nextOrder);
  };
  const commitWorkspaceDrag = (activeDrag, over) => {
    if (workspaceDropCommitted.current) return;
    workspaceDropCommitted.current = true;
    setWorkspaceDrag(null);
    const owner = parents.get(activeDrag.workspaceId);
    const siblings = workspaces.filter((workspace) => parents.get(workspace.workspaceId) === owner);
    const rowIndex = siblings.findIndex((workspace) => workspace.workspaceId === over.id);
    if (rowIndex === -1) return;
    const anchor = over.half === "before" ? over.id : siblings[rowIndex + 1]?.workspaceId;
    if (anchor === activeDrag.workspaceId) return;
    const sourceIndex = siblings.findIndex((workspace) => workspace.workspaceId === activeDrag.workspaceId);
    const anchorIndex = anchor === void 0 ? siblings.length : siblings.findIndex((workspace) => workspace.workspaceId === anchor);
    if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;
    insertWorkspaceBefore(activeDrag.workspaceId, anchor).catch((reason) => {
      console.warn("workspace reorder rejected:", reason);
    });
  };
  const childrenByParent = (0, import_react5.useMemo)(() => {
    const rendered = new Set(groups.map((group) => group.key));
    const children = /* @__PURE__ */ new Map();
    for (const group of groups) {
      let parent = parents.get(group.key);
      while (parent !== void 0 && !rendered.has(parent)) parent = parents.get(parent);
      const siblings = children.get(parent);
      if (siblings === void 0) children.set(parent, [group]);
      else siblings.push(group);
    }
    return children;
  }, [groups, parents]);
  const rootGroups = childrenByParent.get(void 0) ?? [];
  const workspaceDropAtListStart = rootGroups[0]?.workspaceId !== void 0 && workspaceDrag?.over?.id === rootGroups[0].workspaceId && workspaceDrag.over.half === "before";
  const rowKeys = groups.length === 0 ? ["empty"] : [];
  const renderGroup = (group, depth) => {
    const workspaceId = group.workspaceId;
    const children = childrenByParent.get(group.key) ?? [];
    const compatibleDrag = workspaceDrag !== null && parents.get(workspaceDrag.workspaceId) === parents.get(group.key);
    const collapsed = collapsedSessionRows(group.sessions);
    const visible = collapsedSessionRows(group.sessions, sessionLimits[group.key]);
    const sessionsExpanded = visible.hiddenCount === 0;
    rowKeys.push(`workspace:${group.key}`);
    const childRows = group.expanded ? children.map((child) => renderGroup(child, depth + 1)) : [];
    const sessions = visible.rows;
    for (const node of sessions) rowKeys.push(`session:${node.id}`);
    if (collapsed.hiddenCount > 0) rowKeys.push(`overflow:${group.key}`);
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
    const hoverWorkspace = workspaceId === void 0 || !compatibleDrag ? void 0 : (half) => {
      setWorkspaceDrag((active) => active === null ? active : { ...active, over: { id: workspaceId, half } });
    };
    const dropWorkspace = workspaceId === void 0 || !compatibleDrag ? void 0 : (half) => {
      commitWorkspaceDrag(workspaceDrag, { id: workspaceId, half });
    };
    return (
      // Group section: header, descendant Workspaces, and own Session rows. The
      // inter-group breathing room is the section's own margin
      // (WorkspaceBrowser.module.css).
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "div",
        {
          style: { "--dsh-workspace-indent": `${depth * 12}px` },
          className: clsx_default(
            WorkspaceBrowser_default.groupSection,
            workspaceMarker === "before" && WorkspaceBrowser_default.workspaceDropBefore,
            workspaceMarker === "after" && WorkspaceBrowser_default.workspaceDropAfter
          ),
          onDragOver: workspaceDrag === null ? void 0 : (e) => {
            e.preventDefault();
            if (hoverWorkspace === void 0 && parents.get(group.key) !== void 0) return;
            e.stopPropagation();
            if (hoverWorkspace === void 0) {
              e.dataTransfer.dropEffect = "none";
              if (workspaceDrag.over !== null) setWorkspaceDrag({ ...workspaceDrag, over: null });
            } else {
              e.dataTransfer.dropEffect = "move";
              hoverWorkspace(workspaceGroupHalf(e));
            }
          },
          onDrop: workspaceDrag === null ? void 0 : (e) => {
            e.preventDefault();
            if (dropWorkspace === void 0 && parents.get(group.key) !== void 0) return;
            e.stopPropagation();
            if (dropWorkspace === void 0) {
              workspaceDropCommitted.current = true;
              setWorkspaceDrag(null);
            } else {
              dropWorkspace(workspaceGroupHalf(e));
            }
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              ProjectRowItem,
              {
                newShortcut: shortcuts.find((row) => row.id === "session.new"),
                group,
                containsCurrentDescendant: currentAncestors.has(group.key),
                home,
                t,
                onToggle: () => {
                  if (group.expanded) {
                    setSessionLimits((limits) => ({ ...limits, [group.key]: COLLAPSED_SESSION_LIMIT }));
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
            childRows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: "group", children: childRows }),
            sessions.map((node) => {
              const sameGroupDrag = drag !== null && drag.accountKey === group.key;
              const compatibleTarget = sameGroupDrag && drag.pinned === node.pinned;
              const normalizeHalf = (half) => node.blank ? "after" : half;
              const dragProps = {
                start: () => {
                  sessionDropCommitted.current = false;
                  setDrag({ accountKey: group.key, sessionId: node.id, pinned: node.pinned, over: null });
                },
                active: compatibleTarget,
                marker: sameGroupDrag && drag.over?.id === node.id ? drag.over.half : null,
                hover: (half) => {
                  setDrag((d) => d === null ? d : {
                    ...d,
                    over: { id: node.id, half: normalizeHalf(half) }
                  });
                },
                drop: (half) => {
                  if (drag === null) return;
                  commitSessionDrag(drag, { id: node.id, half: normalizeHalf(half) });
                },
                end: () => {
                  if (drag?.over !== null && drag?.over !== void 0) commitSessionDrag(drag, drag.over);
                  else setDrag(null);
                  sessionDropCommitted.current = false;
                }
              };
              return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                SessionNodeItem,
                {
                  node,
                  currentId: current,
                  now,
                  onOpen: open,
                  onRenameRequest: onSessionRenameRequest,
                  renderSlot,
                  onReveal: node.id === revealSessionId && group.key === revealGroup ? () => {
                    onSessionRevealed(node.id);
                  } : void 0,
                  drag: dragProps,
                  t
                },
                node.id
              );
            }),
            collapsed.hiddenCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "button",
              {
                type: "button",
                className: WorkspaceBrowser_default.sessionOverflowButton,
                "data-row-key": `overflow:${group.key}`,
                "aria-expanded": sessionsExpanded,
                onClick: () => {
                  setSessionLimits((limits) => ({
                    ...limits,
                    [group.key]: sessionsExpanded ? COLLAPSED_SESSION_LIMIT : visible.hiddenCount <= COLLAPSED_SESSION_LIMIT ? Infinity : (limits[group.key] ?? COLLAPSED_SESSION_LIMIT) + COLLAPSED_SESSION_LIMIT
                  }));
                },
                children: sessionsExpanded ? t("sessions.collapse") : t("sessions.expand", { n: visible.hiddenCount })
              }
            )
          ]
        },
        group.key
      )
    );
  };
  const groupRows = rootGroups.map((group) => renderGroup(group, 0));
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.treeBody, WorkspaceBrowser_default.wide), children: [
    workspaceDropAtListStart && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: WorkspaceBrowser_default.listTopDropIndicator, "aria-hidden": "true" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      AnimatedRows,
      {
        className: clsx_default(WorkspaceBrowser_default.list, workspaceDropAtListStart && WorkspaceBrowser_default.listTopDropActive),
        label: t("section.sessions"),
        rowKeys,
        ready: list.phase === "ready" && workspaceReady && !nativeDragActive,
        resetKey: JSON.stringify([animationResetKey, sessionLimits]),
        children: [
          groups.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(EmptySessions, { rowState, onLeaveArchivedOnly, t }),
          groupRows
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: WorkspaceBrowser_default.fade })
  ] });
}
function FlatList({
  list,
  sessionIds,
  rowState,
  excludedSessionIds,
  onLeaveArchivedOnly,
  useSessionStatus,
  open,
  onSessionRenameRequest,
  usePanelInfo,
  setSessionOrder,
  workspaceReady,
  animationResetKey,
  revealSessionId,
  onSessionRevealed,
  renderSlot,
  t
}) {
  const panelActive = usePanelInfo((info) => info.activePanelId !== null);
  const statuses = useSessionStatus((s) => s);
  const rows = (0, import_react5.useMemo)(
    () => deriveFlat(list, sessionIds, rowState, statuses, excludedSessionIds),
    [list, sessionIds, rowState, statuses, excludedSessionIds]
  );
  const [drag, setDrag] = (0, import_react5.useState)(null);
  const dropCommitted = (0, import_react5.useRef)(false);
  useNativeDragAcceptance(drag !== null);
  const currentId = panelActive ? void 0 : Object.values(list.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id;
  const commitDrag = (activeDrag, over) => {
    if (dropCommitted.current) return;
    dropCommitted.current = true;
    setDrag(null);
    const nextOrder = sessionDragOrder(sessionIds, rows, activeDrag, over);
    if (nextOrder !== void 0) setSessionOrder(FLAT_SESSION_ORDER_KEY, nextOrder);
  };
  const now = Date.now();
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.treeBody, WorkspaceBrowser_default.wide), children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      AnimatedRows,
      {
        className: clsx_default(WorkspaceBrowser_default.list, WorkspaceBrowser_default.flatList),
        label: t("section.sessions"),
        rowKeys: rows.length === 0 ? ["empty"] : rows.map((row) => `session:${row.id}`),
        ready: list.phase === "ready" && workspaceReady && drag === null,
        resetKey: animationResetKey,
        children: [
          rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(EmptySessions, { rowState, onLeaveArchivedOnly, t }),
          rows.map((node) => {
            const active = drag !== null && drag.pinned === node.pinned;
            const normalizeHalf = (half) => node.blank ? "after" : half;
            return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              SessionNodeItem,
              {
                node,
                currentId,
                now,
                onOpen: open,
                onRenameRequest: onSessionRenameRequest,
                renderSlot,
                onReveal: node.id === revealSessionId ? () => {
                  onSessionRevealed(node.id);
                } : void 0,
                drag: {
                  start: () => {
                    dropCommitted.current = false;
                    setDrag({ accountKey: FLAT_SESSION_ORDER_KEY, sessionId: node.id, pinned: node.pinned, over: null });
                  },
                  active,
                  marker: active && drag.over?.id === node.id ? drag.over.half : null,
                  hover: (half) => {
                    setDrag((current) => current === null ? current : {
                      ...current,
                      over: { id: node.id, half: normalizeHalf(half) }
                    });
                  },
                  drop: (half) => {
                    if (drag !== null) commitDrag(drag, { id: node.id, half: normalizeHalf(half) });
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
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: WorkspaceBrowser_default.fade })
  ] });
}
function SearchResults({
  useSessions,
  useSessionStatus,
  open,
  onUnarchive,
  workspaces,
  archivedSessionIds,
  archivedFilter,
  query,
  remote,
  resultLimit,
  excludedSessionIds,
  usePanelInfo,
  t
}) {
  const panelActive = usePanelInfo((info) => info.activePanelId !== null);
  const list = useSessions((s) => s);
  const statuses = useSessionStatus((s) => s);
  const currentRemote = remote.query === query ? remote : { query, status: "loading", items: [], hasMore: false };
  const results = (0, import_react5.useMemo)(() => {
    const derived = deriveSearchResults(
      list,
      workspaces,
      query,
      archivedSessionIds,
      archivedFilter,
      statuses,
      currentRemote,
      resultLimit
    );
    return { ...derived, items: derived.items.filter((row) => !excludedSessionIds.has(row.id)) };
  }, [list, workspaces, query, archivedSessionIds, archivedFilter, statuses, currentRemote, resultLimit, excludedSessionIds]);
  const pending = currentRemote.status === "loading";
  const currentId = panelActive ? void 0 : Object.values(list.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.treeBody, WorkspaceBrowser_default.wide), children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: WorkspaceBrowser_default.list, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.searchTree, role: "tree", "aria-label": t("search.results.aria"), children: results.items.map((result) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        SearchResultItem,
        {
          result,
          currentId,
          onOpen: open,
          onUnarchive,
          t
        },
        result.id
      )) }),
      pending && /* Two skeleton rows on an empty list, one when local matches already
         show and only the content hits are outstanding. */
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: "status", "aria-label": t("search.pending"), children: (results.items.length === 0 ? [0, 1] : [0]).map((i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: WorkspaceBrowser_default.skeletonRow, "aria-hidden": "true", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: WorkspaceBrowser_default.skeletonDot }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: WorkspaceBrowser_default.skeletonBars, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: WorkspaceBrowser_default.skeletonBar }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: clsx_default(WorkspaceBrowser_default.skeletonBar, WorkspaceBrowser_default.skeletonBarWide) })
        ] })
      ] }, i)) }),
      !pending && results.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.empty, children: t("search.noMatches") }),
      results.hasMore && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.searchStatus, children: t("search.hasMore", { n: resultLimit }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: WorkspaceBrowser_default.fade })
  ] });
}
function WorkspaceBrowser({
  wide,
  usePanelInfo,
  expandSidebar,
  useSessions,
  useSessionStatus,
  useWorkspaces,
  useStore,
  actions,
  startSession,
  open,
  requestSessionRename,
  notifyArchivedNotOpenable,
  renameWorkspace,
  deleteWorkspace,
  insertWorkspaceBefore,
  unarchiveSession,
  createWorkspace,
  searchSessions,
  searchResultLimit,
  useDirectoryFlow,
  useHostInfo,
  useChat,
  chatSearch,
  startChat,
  useShortcuts,
  useWorkspaceShortcuts,
  requestSearch,
  requestAddWorkspace,
  closeAddWorkspace,
  setDirectoryBusy,
  dismissForkError,
  renderSlot,
  t
}) {
  const home = useHostInfo((info) => info.home);
  const shortcuts = useShortcuts((rows) => rows);
  const searchShortcut = shortcuts.find((row) => row.id === "session.search");
  const addShortcut = shortcuts.find((row) => row.id === "workspace.add");
  const shortcutState = useWorkspaceShortcuts((state) => state);
  const list = useSessions((state) => state);
  const storedWorkspaces = useWorkspaces((state) => state.items);
  const defaultWorkspaceName = t("workspace.defaultName");
  const workspaces = (0, import_react5.useMemo)(
    () => storedWorkspaces.map((workspace) => ({
      ...workspace,
      title: workspaceDisplayTitle(workspace.title, defaultWorkspaceName)
    })),
    [storedWorkspaces, defaultWorkspaceName]
  );
  const workspacePhase = useWorkspaces((state) => state.phase);
  const workspaceStreamState = useWorkspaces((state) => state.state);
  const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
  const pinnedSessionIds = useWorkspaces((state) => state.pinnedSessionIds);
  const directoryFlowAvailable = useDirectoryFlow((occupied) => occupied);
  const groupBy = useStore((s) => s.groupBy);
  const orderBy = useStore((s) => s.orderBy);
  const archivedFilter = useStore((s) => s.archivedFilter ?? "default");
  const groupExpansion = useStore((s) => s.groupExpansion);
  const sessionOrderByAccount = useStore((s) => s.sessionOrderByAccount);
  const guardedOpen = (sessionId) => {
    if (archivedSessionIds.includes(sessionId)) {
      notifyArchivedNotOpenable();
      return;
    }
    open(sessionId);
  };
  const leaveArchivedOnly = () => {
    actions.setArchivedFilter("default");
  };
  const workspaceReady = workspacePhase === "ready" && workspaceStreamState !== "loading";
  const mainSessionId2 = Object.values(list.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id;
  const currentBlank = mainSessionId2 !== void 0 && list.byId[mainSessionId2]?.blank === true ? mainSessionId2 : void 0;
  const chatSnapshot = useChat((state) => state);
  const chatRoot = typeof chatSnapshot?.root === "string" ? chatSnapshot.root : null;
  const chatSessionIds = (0, import_react5.useMemo)(() => {
    const ids = /* @__PURE__ */ new Set();
    if (chatRoot === null) return ids;
    for (const id of list.ids) {
      const session = list.byId[id];
      if (session !== void 0 && isUnderChatRoot(session.cwd, chatRoot)) ids.add(id);
    }
    return ids;
  }, [list, chatRoot]);
  const deletedIds = (0, import_react5.useSyncExternalStore)(deletedIdsSource.subscribe, deletedIdsSource.getSnapshot);
  const excludedSessionIds = (0, import_react5.useMemo)(() => {
    const set = new Set(chatSessionIds);
    for (const id of deletedIds) set.add(id);
    return set;
  }, [chatSessionIds, deletedIds]);
  (0, import_react5.useEffect)(() => {
    if (list.phase !== "ready" || deletedIds.size === 0) return;
    pruneDeletedIds(new Set(list.ids));
  }, [list, deletedIds]);
  (0, import_react5.useEffect)(() => {
    setChatRuntimeSnapshot({
      currentId: mainSessionId2,
      chatIds: chatSessionIds,
      workspaces: workspaces.map((workspace) => ({ path: workspace.path, workspaceId: workspace.workspaceId }))
    });
  }, [mainSessionId2, chatSessionIds, workspaces]);
  const splitRef = (0, import_react5.useRef)(null);
  const [splitRatio, setSplitRatio] = (0, import_react5.useState)(0.5);
  const startSplitDrag = (event) => {
    event.preventDefault();
    const onMove = (moveEvent) => {
      const element = splitRef.current;
      if (element === null) return;
      const rect = element.getBoundingClientRect();
      if (rect.height < 1) return;
      const minFraction = Math.min(80 / rect.height, 0.45);
      setSplitRatio(Math.min(1 - minFraction, Math.max(minFraction, (moveEvent.clientY - rect.top) / rect.height)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const ungroupedMemberIds = (0, import_react5.useMemo)(() => {
    const accounted = new Set(workspaces.flatMap((workspace) => workspace.sessionIds));
    return list.ids.filter((id) => list.byId[id] !== void 0 && !accounted.has(id) && !excludedSessionIds.has(id));
  }, [list, workspaces, excludedSessionIds]);
  const orderState = (0, import_react5.useMemo)(
    () => ({ pinnedSessionIds, archivedSessionIds }),
    [archivedSessionIds, pinnedSessionIds]
  );
  const rowState = (0, import_react5.useMemo)(
    () => ({ ...orderState, archivedFilter }),
    [orderState, archivedFilter]
  );
  const flatMemberIds = (0, import_react5.useMemo)(
    () => sessionMemberIds(list).filter((id) => !excludedSessionIds.has(id)),
    [list, excludedSessionIds]
  );
  const orderedWorkspaces = (0, import_react5.useMemo)(() => workspaces.map((workspace) => {
    const memberIds = workspace.sessionIds;
    const baseOrder = orderBy === "updated" ? orderByRecency(memberIds, list.byId) : reconcileManualOrder(memberIds, sessionOrderByAccount[workspace.workspaceId], list.byId, orderState);
    return {
      ...workspace,
      sessionIds: pinCurrentBlank(
        baseOrder,
        currentBlank !== void 0 && memberIds.includes(currentBlank) ? currentBlank : void 0
      )
    };
  }), [currentBlank, list.byId, orderBy, orderState, sessionOrderByAccount, workspaces]);
  const orderedWorkspaceAreaWorkspaces = (0, import_react5.useMemo)(
    () => chatRoot === null ? orderedWorkspaces : orderedWorkspaces.filter((workspace) => !isUnderChatRoot(workspace.path, chatRoot)),
    [orderedWorkspaces, chatRoot]
  );
  const orderedUngroupedSessionIds = (0, import_react5.useMemo)(() => {
    const baseOrder = orderBy === "updated" ? orderByRecency(ungroupedMemberIds, list.byId) : reconcileManualOrder(ungroupedMemberIds, sessionOrderByAccount[UNGROUPED_KEY], list.byId, orderState);
    return pinCurrentBlank(
      baseOrder,
      currentBlank !== void 0 && ungroupedMemberIds.includes(currentBlank) ? currentBlank : void 0
    );
  }, [currentBlank, list.byId, orderBy, orderState, sessionOrderByAccount, ungroupedMemberIds]);
  const orderedFlatSessionIds = (0, import_react5.useMemo)(() => {
    const baseOrder = orderBy === "updated" ? orderByRecency(flatMemberIds, list.byId) : reconcileManualOrder(flatMemberIds, sessionOrderByAccount[FLAT_SESSION_ORDER_KEY], list.byId, orderState);
    return pinCurrentBlank(
      baseOrder,
      currentBlank !== void 0 && flatMemberIds.includes(currentBlank) ? currentBlank : void 0
    );
  }, [currentBlank, flatMemberIds, list.byId, orderBy, orderState, sessionOrderByAccount]);
  const activeSessionOrders = (0, import_react5.useMemo)(() => Object.fromEntries([
    ...orderedWorkspaces.map((workspace) => [workspace.workspaceId, workspace.sessionIds]),
    [UNGROUPED_KEY, orderedUngroupedSessionIds],
    [FLAT_SESSION_ORDER_KEY, orderedFlatSessionIds]
  ]), [orderedFlatSessionIds, orderedUngroupedSessionIds, orderedWorkspaces]);
  (0, import_react5.useEffect)(() => {
    if (workspacePhase !== "ready") return;
    actions.retainAccountKeys([
      UNGROUPED_KEY,
      FLAT_SESSION_ORDER_KEY,
      // Filtered from `workspaces` (the Workspace stream alone), never from an
      // order-derived array: this effect writes `sessionOrderByAccount`, so an
      // order-derived dependency would re-run it on its own write and exhaust
      // React's nested-update limit.
      ...workspaces.filter((workspace) => chatRoot === null || !isUnderChatRoot(workspace.path, chatRoot)).map((workspace) => workspace.workspaceId)
    ]);
  }, [actions.retainAccountKeys, workspacePhase, workspaces, chatRoot]);
  (0, import_react5.useEffect)(() => {
    if (list.phase !== "ready" || workspaceReady || orderBy !== "manual" || currentBlank === void 0) return;
    const changed = {};
    for (const [key, ids] of Object.entries(activeSessionOrders)) {
      if (key !== FLAT_SESSION_ORDER_KEY && workspacePhase !== "ready") continue;
      const saved = sessionOrderByAccount[key] ?? [];
      if (ids[0] !== currentBlank || saved[0] === currentBlank) continue;
      changed[key] = [currentBlank, ...saved.filter((id) => id !== currentBlank)];
    }
    if (Object.keys(changed).length > 0) actions.syncSessionOrders(changed);
  }, [
    actions.syncSessionOrders,
    activeSessionOrders,
    currentBlank,
    list.phase,
    orderBy,
    sessionOrderByAccount,
    workspacePhase,
    workspaceReady
  ]);
  (0, import_react5.useEffect)(() => {
    if (list.phase !== "ready" || !workspaceReady || orderBy !== "manual" || currentBlank === void 0) return;
    const moved = Object.entries(activeSessionOrders).some(([key, ids]) => ids[0] === currentBlank && sessionOrderByAccount[key]?.[0] !== currentBlank);
    if (moved) actions.syncSessionOrders(activeSessionOrders);
  }, [
    actions.syncSessionOrders,
    activeSessionOrders,
    currentBlank,
    list.phase,
    orderBy,
    sessionOrderByAccount,
    workspaceReady
  ]);
  const saveSessionOrder = (accountKey, order) => {
    actions.setSessionOrder(accountKey, order, activeSessionOrders);
  };
  const [query, setQuery] = (0, import_react5.useState)("");
  const [searchExpanded, setSearchExpanded] = (0, import_react5.useState)(false);
  const [revealSessionId, setRevealSessionId] = (0, import_react5.useState)(void 0);
  const normalizedQuery = sanitizeSearchQuery(query).trim();
  const [remoteSearch, setRemoteSearch] = (0, import_react5.useState)({
    query: "",
    status: "idle",
    items: [],
    hasMore: false
  });
  const searchRoot = (0, import_react5.useRef)(null);
  const searchInput = (0, import_react5.useRef)(null);
  const wsPickerOpen = shortcutState.addRequested;
  const wsPlusRef = (0, import_react5.useRef)(null);
  const composingRef = (0, import_react5.useRef)(false);
  const openSearchResult = (sessionId) => {
    if (archivedSessionIds.includes(sessionId)) {
      notifyArchivedNotOpenable();
      return;
    }
    setRevealSessionId(sessionId);
    setQuery("");
    setSearchExpanded(false);
    open(sessionId);
  };
  const acknowledgeSessionReveal = (sessionId) => {
    setRevealSessionId((current) => current === sessionId ? void 0 : current);
  };
  (0, import_react5.useEffect)(() => {
    if (normalizedQuery !== "") setRevealSessionId(void 0);
  }, [normalizedQuery]);
  const [searchOnExpand, setSearchOnExpand] = (0, import_react5.useState)(false);
  (0, import_react5.useEffect)(() => {
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
  (0, import_react5.useEffect)(() => {
    if (shortcutState.searchRequest === 0) return;
    closeAddWorkspace();
    setSearchExpanded(true);
    if (!wide) {
      setSearchOnExpand(true);
      expandSidebar();
    } else searchInput.current?.focus({ preventScroll: true });
  }, [shortcutState.searchRequest]);
  (0, import_react5.useEffect)(() => {
    if (!wide || !searchExpanded || searchOnExpand) return;
    searchInput.current?.focus({ preventScroll: true });
  }, [wide, searchExpanded, searchOnExpand]);
  (0, import_react5.useEffect)(() => {
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
  (0, import_react5.useEffect)(() => {
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
  const [renameTarget, setRenameTarget] = (0, import_react5.useState)(null);
  const [renameDraft, setRenameDraft] = (0, import_react5.useState)("");
  const [renaming, setRenaming] = (0, import_react5.useState)(false);
  const [renameError, setRenameError] = (0, import_react5.useState)(null);
  const renameTrimmed = renameDraft.trim();
  const renameDuplicate = renameTarget !== null && renameTrimmed !== "" && workspaces.some((w) => w.workspaceId !== renameTarget.workspaceId && w.title === renameTrimmed);
  const renameBlocked = renaming || renameTrimmed === "" || renameTarget === null || renameTrimmed === renameTarget.storedTitle || renameDuplicate;
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
  const onSessionUnarchive = (sessionId) => {
    unarchiveSession(sessionId).catch((reason) => {
      console.warn("session unarchive rejected:", reason);
    });
  };
  const [deleteTarget, setDeleteTarget] = (0, import_react5.useState)(null);
  const [deleting, setDeleting] = (0, import_react5.useState)(false);
  const [deleteCommittedId, setDeleteCommittedId] = (0, import_react5.useState)(null);
  const [deleteError, setDeleteError] = (0, import_react5.useState)(null);
  (0, import_react5.useEffect)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.root, !wide && WorkspaceBrowser_default.rail), children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: WorkspaceBrowser_default.sectionHeader, children: [
      wide && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: clsx_default(WorkspaceBrowser_default.sectionLabel, WorkspaceBrowser_default.wide, searchExpanded && WorkspaceBrowser_default.sectionLabelHidden), children: groupBy === "flat" ? t("section.sessions") : t("section.workspaces") }),
      wide && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: clsx_default(WorkspaceBrowser_default.searchSlot, searchExpanded && WorkspaceBrowser_default.searchSlotExpanded), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "div",
        {
          ref: searchRoot,
          className: clsx_default(WorkspaceBrowser_default.search, searchExpanded && WorkspaceBrowser_default.searchExpanded),
          onClick: () => {
            closeAddWorkspace();
            setSearchExpanded(true);
            searchInput.current?.focus();
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("search"), shortcutKeys: searchShortcut?.keys, side: "bottom", delayMs: 500, disabled: searchExpanded, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "button",
              {
                type: "button",
                className: WorkspaceBrowser_default.searchButton,
                "aria-label": t("search.sessions.aria"),
                "aria-keyshortcuts": searchShortcut?.aria,
                "aria-expanded": searchExpanded,
                onClick: () => {
                  requestSearch();
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconSearchOutlineRegular, { size: searchExpanded ? 11 : 14 })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
            searchExpanded && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
                children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconCloseFillRegular, {})
              }
            )
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: clsx_default(WorkspaceBrowser_default.headerActions, wide && searchExpanded && WorkspaceBrowser_default.headerActionsHidden), children: [
        wide && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          ViewOptionsMenu,
          {
            groupBy,
            orderBy,
            archivedFilter,
            onGroupPick: actions.setGroupBy,
            onOrderPick: (mode) => {
              actions.setOrderBy(mode, activeSessionOrders);
            },
            onArchivedFilterPick: actions.setArchivedFilter,
            t
          }
        ),
        directoryFlowAvailable && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("workspace.add"), shortcutKeys: addShortcut?.keys, side: "bottom", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            ref: wsPlusRef,
            type: "button",
            className: WorkspaceBrowser_default.iconButton,
            "aria-label": t("workspace.add"),
            "aria-keyshortcuts": addShortcut?.aria,
            onClick: () => {
              requestAddWorkspace();
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconProjectAddOutlineRegular, { size: wide ? 16 : 18 })
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
          onBusyChange: setDirectoryBusy,
          side: "right",
          onPick: (workspaceId) => {
            closeAddWorkspace();
            startSession(workspaceId);
          },
          onClose: () => {
            closeAddWorkspace();
          }
        }
      )
    ] }),
    !wide && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.search, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("search"), shortcutKeys: searchShortcut?.keys, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "button",
      {
        type: "button",
        className: WorkspaceBrowser_default.searchButton,
        "aria-label": t("search.sessions.aria"),
        "aria-keyshortcuts": searchShortcut?.aria,
        onClick: () => {
          requestSearch();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconSearchOutlineRegular, { size: 18 })
      }
    ) }) }),
    wide ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { ref: splitRef, className: WorkspaceBrowser_default.split, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.pane, style: { flexBasis: `${(splitRatio * 100).toFixed(2)}%` }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.listArea, children: normalizedQuery !== "" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        SearchResults,
        {
          usePanelInfo,
          useSessions,
          useSessionStatus,
          open: openSearchResult,
          onUnarchive: onSessionUnarchive,
          workspaces,
          archivedSessionIds,
          archivedFilter,
          excludedSessionIds,
          query: normalizedQuery,
          remote: remoteSearch,
          resultLimit: searchResultLimit,
          t
        }
      ) : groupBy === "flat" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        FlatList,
        {
          usePanelInfo,
          list,
          sessionIds: orderedFlatSessionIds,
          rowState,
          excludedSessionIds,
          onLeaveArchivedOnly: leaveArchivedOnly,
          workspaceReady,
          animationResetKey: `${groupBy}/${orderBy}/${archivedFilter}`,
          useSessionStatus,
          open: guardedOpen,
          onSessionRenameRequest: requestSessionRename,
          renderSlot,
          setSessionOrder: saveSessionOrder,
          revealSessionId,
          onSessionRevealed: acknowledgeSessionReveal,
          t
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        SessionTree,
        {
          usePanelInfo,
          list,
          shortcuts,
          useSessionStatus,
          onSessionRenameRequest: requestSessionRename,
          renderSlot,
          workspaces: orderedWorkspaceAreaWorkspaces,
          ungroupedSessionIds: orderedUngroupedSessionIds,
          excludedSessionIds,
          workspaceReady,
          nestWorkspaces: groupBy === "workspace-tree",
          animationResetKey: `${groupBy}/${orderBy}/${archivedFilter}`,
          groupExpansion,
          setGroupExpanded: actions.setGroupExpanded,
          setSessionOrder: saveSessionOrder,
          rowState,
          onLeaveArchivedOnly: leaveArchivedOnly,
          startSession,
          open: guardedOpen,
          insertWorkspaceBefore,
          revealSessionId,
          onSessionRevealed: acknowledgeSessionReveal,
          home,
          t,
          onRenameRequest: (workspaceId, displayTitle2) => {
            setRenameTarget({
              workspaceId,
              storedTitle: storedWorkspaces.find((w) => w.workspaceId === workspaceId)?.title ?? displayTitle2
            });
            setRenameDraft(displayTitle2);
            setRenameError(null);
          },
          onDeleteRequest: (workspaceId, title) => {
            setDeleteTarget({ workspaceId, title });
            setDeleteError(null);
          }
        }
      ) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.divider, onMouseDown: startSplitDrag }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.pane, style: { flexBasis: `${((1 - splitRatio) * 100).toFixed(2)}%` }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ChatSection,
        {
          wide,
          useSessions,
          useSessionStatus,
          useWorkspaces,
          useChat,
          renderSlot,
          currentId: mainSessionId2,
          deletedSessionIds: deletedIds,
          open: guardedOpen,
          onRenameRequest: requestSessionRename,
          onNewChat: () => {
            runChatFlow(startChat);
          },
          searchChats: chatSearch,
          t
        }
      ) })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.listArea }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      import_dsh_client_ui_primitives4.Modal,
      {
        open: renameTarget !== null,
        onClose: closeRename,
        closeLabel: t("close"),
        title: t("rename.workspace.title"),
        footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "outline", disabled: renaming, onClick: closeRename, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "primary", disabled: renameBlocked, onClick: confirmRename, children: t("rename") })
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              className: WorkspaceBrowser_default.renameInput,
              value: renameDraft,
              "aria-label": t("field.workspaceName"),
              "data-modal-autofocus": true,
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
          renameDuplicate && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: t("conflict.named", { name: renameTrimmed }) }),
          renameError !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: renameError })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      import_dsh_client_ui_primitives4.Modal,
      {
        open: deleteTarget !== null,
        onClose: closeDelete,
        closeLabel: t("close"),
        title: t("delete.workspace"),
        ...deleteTarget === null ? {} : { description: t("delete.desc", { name: deleteTarget.title }) },
        footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "outline", disabled: deleting, onClick: closeDelete, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
          deleting && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.deleteStatus, role: "status", children: t("delete.pending") }),
          deleteError !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: deleteError })
        ]
      }
    ),
    shortcutState.forkError !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_dsh_client_ui_primitives4.Toast,
      {
        text: t(shortcutState.forkError.reason === "unavailable" ? "shortcut.noCompletedTurn" : "shortcut.forkFailed"),
        onDone: dismissForkError
      },
      shortcutState.forkError.seq
    )
  ] });
}

// src/client/session-actions/ArchiveSession.tsx
var import_react6 = require("react");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime6 = require("react/jsx-runtime");
function ArchiveSessionMenuItem({
  sessionId,
  useArchived,
  useMenuOpenState,
  useShortcuts,
  archiveSession,
  unarchiveSession,
  t
}) {
  const [, setMenuOpen] = useMenuOpenState();
  const shortcut = useShortcuts((rows) => rows.find((row) => row.id === "session.archive"));
  const archived = useArchived((set) => set.has(sessionId));
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    import_dsh_client_ui_primitives5.MenuItemButton,
    {
      shortcut: archived ? void 0 : shortcut,
      icon: archived ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconUnarchiveOutlineRegular, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconArchiveOutlineRegular, { size: 14 }),
      onSelect: () => {
        setMenuOpen(false);
        (archived ? unarchiveSession : archiveSession)(sessionId);
      },
      children: t(archived ? "menu.unarchiveSession" : "menu.archiveSession")
    }
  );
}
function ArchiveSessionRowButton({
  sessionId,
  useArchived,
  archiveSession,
  unarchiveSession,
  t
}) {
  const archived = useArchived((set) => set.has(sessionId));
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip, { label: t(archived ? "actions.unarchive" : "actions.archive"), side: "bottom", align: "end", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "button",
    {
      type: "button",
      className: Rows_default.iconButton,
      "aria-label": t(archived ? "menu.unarchiveSession" : "menu.archiveSession"),
      onClick: () => {
        (archived ? unarchiveSession : archiveSession)(sessionId);
      },
      children: archived ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconUnarchiveOutlineRegular, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconArchiveOutlineRegular, { size: 14 })
    }
  ) });
}
function SessionArchiveConfirmDialog({
  useArchiveRequest,
  settleSessionArchive,
  stopAndArchiveSession,
  t
}) {
  const request = useArchiveRequest((pending) => pending);
  if (request === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    ArchiveConfirmForm,
    {
      request,
      stopAndArchiveSession,
      onSettle: settleSessionArchive,
      t
    },
    request.sessionId
  );
}
function ArchiveConfirmForm({ request, stopAndArchiveSession, onSettle, t }) {
  const [archiving, setArchiving] = (0, import_react6.useState)(false);
  const [error, setError] = (0, import_react6.useState)(null);
  const close = () => {
    if (archiving) return;
    onSettle();
  };
  const confirm = () => {
    setArchiving(true);
    setError(null);
    stopAndArchiveSession(request.sessionId).then(() => {
      setArchiving(false);
      onSettle();
    }).catch((reason) => {
      setArchiving(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    import_dsh_client_ui_primitives5.Modal,
    {
      open: true,
      onClose: close,
      closeLabel: t("close"),
      title: t("archive.confirm.title"),
      description: t("archive.confirm.desc", { title: request.displayTitle }),
      footer: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "outline", disabled: archiving, onClick: close, children: t("cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          import_dsh_client_ui_primitives5.Button,
          {
            variant: "outline",
            className: WorkspaceBrowser_default.deleteAction,
            disabled: archiving,
            onClick: confirm,
            children: t("archive.confirm.action")
          }
        )
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: WorkspaceBrowser_default.archiveActivity, "aria-label": t("archive.confirm.activity"), children: request.activity.map((entry, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("li", { children: activityLine(entry, t) }, `${entry.kind}-${String(index)}`)) }),
        archiving && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: WorkspaceBrowser_default.deleteStatus, role: "status", children: t("archive.confirm.pending") }),
        error !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: error })
      ]
    }
  );
}
function activityLine(entry, t) {
  const items = entry.items ?? [];
  const n = items.length;
  const names = items.map((item) => item.label ?? item.id).join(t("archive.confirm.listSeparator"));
  const plural = n === 1 ? "one" : "other";
  switch (entry.kind) {
    case "turn":
      return t("archive.confirm.turn");
    case "subagent":
      return t(`archive.confirm.subagents.${plural}`, { n, names });
    case "job":
      return t(`archive.confirm.jobs.${plural}`, { n, names });
    case "schedule":
      return t(`archive.confirm.schedules.${plural}`, { n, names });
    default:
      return t(`archive.confirm.other.${plural}`, { kind: entry.kind, n });
  }
}

// src/client/session-actions/DeleteSession.tsx
var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/addon/ConfirmDeleteDialog.tsx
var import_react7 = require("react");
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime7 = require("react/jsx-runtime");
function ConfirmDeleteDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  closeLabel,
  onConfirm,
  onClose
}) {
  const [deleting, setDeleting] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)(null);
  const close = () => {
    if (deleting) return;
    onClose();
  };
  const confirm = () => {
    setDeleting(true);
    setError(null);
    onConfirm().then(() => {
      setDeleting(false);
      onClose();
    }).catch((reason) => {
      setDeleting(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
    import_dsh_client_ui_primitives6.Modal,
    {
      open: true,
      onClose: close,
      closeLabel,
      title,
      description,
      footer: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives6.Button, { variant: "outline", disabled: deleting, onClick: close, children: cancelLabel }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          import_dsh_client_ui_primitives6.Button,
          {
            variant: "outline",
            className: WorkspaceBrowser_default.deleteAction,
            disabled: deleting,
            onClick: confirm,
            children: confirmLabel
          }
        )
      ] }),
      children: [
        deleting && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: WorkspaceBrowser_default.deleteStatus, role: "status", children: pendingLabel }),
        error !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: error })
      ]
    }
  );
}

// src/client/session-actions/DeleteSession.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function DeleteSessionMenuItem({
  sessionId,
  displayTitle: displayTitle2,
  useMenuOpenState,
  requestSessionDelete,
  t
}) {
  const [, setMenuOpen] = useMenuOpenState();
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    import_dsh_client_ui_primitives7.MenuItemButton,
    {
      danger: true,
      icon: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives7.IconTrashOutlineRegular, {}),
      onSelect: () => {
        setMenuOpen(false);
        requestSessionDelete(sessionId, displayTitle2);
      },
      children: t("menu.deleteSession")
    }
  );
}
function SessionDeleteConfirmDialog({
  useDeleteRequest,
  settleSessionDelete,
  deleteSession,
  t
}) {
  const request = useDeleteRequest((pending) => pending);
  if (request === null) return null;
  const displayTitle2 = request.displayTitle.trim() === "" ? t("session.untitled") : request.displayTitle;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    ConfirmDeleteDialog,
    {
      title: t("delete.session"),
      description: t("delete.session.desc", { name: displayTitle2 }),
      confirmLabel: t("delete.session"),
      pendingLabel: t("delete.session.pending"),
      cancelLabel: t("cancel"),
      closeLabel: t("close"),
      onConfirm: () => deleteSession(request.sessionId),
      onClose: settleSessionDelete
    },
    request.sessionId
  );
}

// src/client/session-actions/derived.ts
function derive(source, project) {
  let seen;
  let value;
  return {
    getSnapshot: () => {
      const snapshot = source.getSnapshot();
      if (value === void 0 || snapshot !== seen) {
        seen = snapshot;
        value = project(snapshot);
      }
      return value;
    },
    subscribe: (listener) => source.subscribe(listener)
  };
}

// src/client/session-actions/ForkSession.tsx
var import_dsh_client_ui_primitives8 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime9 = require("react/jsx-runtime");
function ForkSessionMenuItem({
  sessionId,
  useMenuOpenState,
  useShortcuts,
  forkSession,
  t
}) {
  const [, setMenuOpen] = useMenuOpenState();
  const shortcut = useShortcuts((rows) => rows.find((row) => row.id === "session.fork"));
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
    import_dsh_client_ui_primitives8.MenuItemButton,
    {
      shortcut,
      icon: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives8.IconBranchOutlineRegular, {}),
      onSelect: () => {
        setMenuOpen(false);
        forkSession(sessionId);
      },
      children: t("menu.fork")
    }
  );
}

// src/client/session-actions/PinSession.tsx
var import_dsh_client_ui_primitives9 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime10 = require("react/jsx-runtime");
function usePinState({ sessionId, usePinned, useArchived }) {
  return {
    pinned: usePinned((pinned) => pinned.has(sessionId)),
    archived: useArchived((archived) => archived.has(sessionId))
  };
}
function PinSessionMenuItem(props) {
  const { sessionId, useMenuOpenState, pinSession, unpinSession, t } = props;
  const [, setMenuOpen] = useMenuOpenState();
  const { pinned, archived } = usePinState(props);
  if (archived) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    import_dsh_client_ui_primitives9.MenuItemButton,
    {
      icon: pinned ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives9.IconPinFillRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives9.IconPinOutlineRegular, {}),
      onSelect: () => {
        setMenuOpen(false);
        (pinned ? unpinSession : pinSession)(sessionId);
      },
      children: t(pinned ? "menu.unpinSession" : "menu.pinSession")
    }
  );
}
function PinSessionRowButton(props) {
  const { sessionId, pinSession, unpinSession, t } = props;
  const { pinned, archived } = usePinState(props);
  if (archived) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives9.Tooltip, { label: t(pinned ? "actions.unpin" : "actions.pin"), side: "bottom", align: "end", delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    "button",
    {
      type: "button",
      className: Rows_default.iconButton,
      "aria-label": t(pinned ? "menu.unpinSession" : "menu.pinSession"),
      onClick: () => {
        (pinned ? unpinSession : pinSession)(sessionId);
      },
      children: pinned ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives9.IconPinFillRegular, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives9.IconPinOutlineRegular, { size: 14 })
    }
  ) });
}

// src/client/session-actions/RenameSession.tsx
var import_react8 = require("react");
var import_dsh_client_ui_primitives10 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime11 = require("react/jsx-runtime");
function RenameSessionMenuItem({
  sessionId,
  displayTitle: displayTitle2,
  useMenuOpenState,
  useShortcuts,
  requestSessionRename,
  t
}) {
  const [, setMenuOpen] = useMenuOpenState();
  const shortcut = useShortcuts((rows) => rows.find((row) => row.id === "session.rename"));
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
    import_dsh_client_ui_primitives10.MenuItemButton,
    {
      shortcut,
      icon: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives10.IconEditOutlineRegular, {}),
      onSelect: () => {
        setMenuOpen(false);
        requestSessionRename(sessionId, displayTitle2);
      },
      children: t("rename")
    }
  );
}
function SessionRenameDialog({ useRenameRequest, settleSessionRename, renameSession, t }) {
  const request = useRenameRequest((pending) => pending);
  if (request === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
    RenameForm,
    {
      request,
      renameSession,
      onSettle: settleSessionRename,
      t
    },
    request.sessionId
  );
}
function RenameForm({ request, renameSession, onSettle, t }) {
  const [draft, setDraft] = (0, import_react8.useState)(request.currentTitle);
  const [renaming, setRenaming] = (0, import_react8.useState)(false);
  const [error, setError] = (0, import_react8.useState)(null);
  const composingRef = (0, import_react8.useRef)(false);
  const trimmed = draft.trim();
  const blocked = renaming || trimmed === "";
  const close = () => {
    if (renaming) return;
    onSettle();
  };
  const confirm = () => {
    if (blocked) return;
    setRenaming(true);
    setError(null);
    renameSession(request.sessionId, trimmed).then(() => {
      setRenaming(false);
      onSettle();
    }).catch((reason) => {
      setRenaming(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
    import_dsh_client_ui_primitives10.Modal,
    {
      open: true,
      onClose: close,
      closeLabel: t("close"),
      title: t("rename.session.title"),
      footer: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives10.Button, { variant: "outline", disabled: renaming, onClick: close, children: t("cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives10.Button, { variant: "primary", disabled: blocked, onClick: confirm, children: t("rename") })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "input",
          {
            className: WorkspaceBrowser_default.renameInput,
            value: draft,
            "aria-label": t("field.sessionName"),
            "data-modal-autofocus": true,
            disabled: renaming,
            onFocus: (e) => {
              e.target.select();
            },
            onChange: (e) => {
              setDraft(e.target.value);
              setError(null);
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
                confirm();
              }
            }
          }
        ),
        error !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: error })
      ]
    }
  );
}

// src/client/session-actions/RowActionToast.tsx
var import_dsh_client_ui_primitives11 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime12 = require("react/jsx-runtime");
var LONG_TOAST_HOLD_MS = 6e3;
function RowActionToast({ useToast, useStore, dismissToast, undoArchive, showArchived, t }) {
  const toast = useToast((current) => current);
  const archivedRowsVisible = useStore((state) => (state.archivedFilter ?? "default") !== "default");
  if (toast === null) return null;
  if (toast.kind === "archived" || toast.kind === "stoppedAndArchived") {
    const { sessionId } = toast;
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      import_dsh_client_ui_primitives11.Toast,
      {
        text: t(toast.kind === "archived" ? "toast.archived" : "toast.stoppedAndArchived"),
        tone: "success",
        holdMs: LONG_TOAST_HOLD_MS,
        actions: [
          { label: t("toast.archivedUndo"), onClick: () => {
            dismissToast();
            undoArchive(sessionId);
          } },
          ...archivedRowsVisible ? [] : [
            { prefix: t("toast.archivedOr"), label: t("toast.archivedFilter"), onClick: () => {
              dismissToast();
              showArchived();
            } }
          ]
        ],
        onDone: dismissToast
      },
      `toast-${String(toast.seq)}`
    );
  }
  if (toast.kind === "createFailed") {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      import_dsh_client_ui_primitives11.Toast,
      {
        text: t("toast.createFailed", { message: toast.message }),
        icon: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives11.IconWarningOutlineRegular, {}),
        holdMs: LONG_TOAST_HOLD_MS,
        onDone: dismissToast
      },
      `toast-${String(toast.seq)}`
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
    import_dsh_client_ui_primitives11.Toast,
    {
      text: plainNoticeText(toast, t),
      icon: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives11.IconWarningOutlineRegular, {}),
      onDone: dismissToast
    },
    `toast-${String(toast.seq)}`
  );
}
function plainNoticeText(toast, t) {
  switch (toast.kind) {
    case "pinFailed":
      return t("toast.pinFailed");
    case "unpinFailed":
      return t("toast.unpinFailed");
    case "defaultWorkspaceFailed":
      return t("defaultWorkspace.failed");
    case "archivedNotOpenable":
      return t("toast.archivedNotOpenable");
    /* v8 ignore next 2 -- closed-union backstop; only reached if a notice kind is forged */
    default:
      return assertNever(toast);
  }
}

// src/client/addon/ArchivedSessionsPage.tsx
var import_react9 = require("react");
var import_dsh_client_ui_primitives12 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime13 = require("react/jsx-runtime");
function timeLabel2(updatedAt, now, t) {
  const { unit, n } = (0, import_dsh_client_ui_primitives12.relativeTime)(updatedAt, now);
  return unit === "now" ? t("time.now") : t(`time.${unit}`, { n });
}
function ArchivedSessionsPage({ t }) {
  const chat = (0, import_react9.useSyncExternalStore)(chatStateSource.subscribe, chatStateSource.getSnapshot);
  const deletedIds = (0, import_react9.useSyncExternalStore)(deletedIdsSource.subscribe, deletedIdsSource.getSnapshot);
  const maskedIds = (0, import_react9.useSyncExternalStore)(archivedMaskSource.subscribe, archivedMaskSource.getSnapshot);
  const rows = chat.archived;
  const loaded = chat.loaded;
  const [restoring, setRestoring] = (0, import_react9.useState)(null);
  const [error, setError] = (0, import_react9.useState)(null);
  const [deleteTarget, setDeleteTarget] = (0, import_react9.useState)(null);
  const hiddenRow = (sessionId) => deletedIds.has(sessionId) || maskedIds.has(sessionId);
  const visibleRows = rows.filter((row) => !hiddenRow(row.sessionId));
  const load = (0, import_react9.useCallback)(() => {
    setError(null);
    return refreshChatState().catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, []);
  (0, import_react9.useEffect)(() => {
    void load();
  }, [load]);
  const restore = (sessionId) => {
    setRestoring(sessionId);
    rpcPost("/api/chat-manager/restore-session", { sessionId }).then(async () => {
      markArchivedMasked(sessionId);
      await refreshChatState().catch(() => {
      });
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      setRestoring(null);
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: WorkspaceBrowser_default.archivedPage, children: [
    !loaded && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: WorkspaceBrowser_default.empty, children: t("archived.loading") }),
    loaded && visibleRows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: WorkspaceBrowser_default.empty, children: t("archived.empty") }),
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: WorkspaceBrowser_default.renameError, role: "alert", children: error }),
    visibleRows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: WorkspaceBrowser_default.archivedRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: WorkspaceBrowser_default.archivedTitle, children: [
        row.workspaceTitle.trim().length > 0 ? `${row.workspaceTitle}\uFF1A` : "",
        row.title.trim().length > 0 ? row.title : t("archived.untitled")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: WorkspaceBrowser_default.archivedTime, children: row.updatedAt > 0 ? timeLabel2(row.updatedAt, Date.now(), t) : "" }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        import_dsh_client_ui_primitives12.Button,
        {
          variant: "outline",
          disabled: restoring !== null,
          onClick: () => {
            restore(row.sessionId);
          },
          children: restoring === row.sessionId ? t("archived.restoring") : t("archived.restore")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        import_dsh_client_ui_primitives12.Button,
        {
          variant: "outline",
          className: WorkspaceBrowser_default.deleteAction,
          disabled: restoring !== null,
          onClick: () => {
            setDeleteTarget(row);
          },
          children: t("archived.delete")
        }
      )
    ] }, row.sessionId)),
    deleteTarget !== null && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      ConfirmDeleteDialog,
      {
        title: t("archived.delete"),
        description: t("archived.delete.desc", {
          name: deleteTarget.title.trim().length > 0 ? deleteTarget.title : t("archived.untitled")
        }),
        confirmLabel: t("archived.delete"),
        pendingLabel: t("archived.deleting"),
        cancelLabel: t("cancel"),
        closeLabel: t("close"),
        onConfirm: () => performSessionDelete(deleteTarget.sessionId),
        onClose: () => {
          setDeleteTarget(null);
        }
      },
      deleteTarget.sessionId
    )
  ] });
}

// src/client/locales.ts
var zh = {
  "defaultWorkspace.failed": "\u65E0\u6CD5\u521B\u5EFA\u9ED8\u8BA4\u5DE5\u4F5C\u533A\uFF0C\u8BF7\u901A\u8FC7\u201C\u9009\u62E9\u5DE5\u4F5C\u533A\u201D\u9009\u62E9\u6587\u4EF6\u5939",
  "draft.workspaceRequired": "\u8BF7\u5148\u9009\u62E9\u5DE5\u4F5C\u533A",
  "draft.initializationFailed": "\u6682\u65F6\u65E0\u6CD5\u586B\u5165\u8349\u7A3F\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  "group.ungrouped": "\u672A\u5206\u7EC4",
  "session.new": "\u65B0\u4F1A\u8BDD",
  "session.untitled": "\u672A\u547D\u540D",
  "shortcut.noSession": "\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u4F1A\u8BDD",
  "shortcut.noPicker": "\u76EE\u5F55\u9009\u62E9\u5668\u4E0D\u53EF\u7528",
  "shortcut.directoryBusy": "\u6B63\u5728\u9009\u62E9\u6216\u6DFB\u52A0\u5DE5\u4F5C\u533A",
  "shortcut.noCompletedTurn": "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u5DF2\u7ED3\u675F\u7684\u8F6E\u6B21",
  "shortcut.forkFailed": "\u65E0\u6CD5\u5206\u53C9\u4F1A\u8BDD\uFF0C\u8BF7\u91CD\u8BD5",
  "section.workspaces": "\u5DE5\u4F5C\u533A",
  "section.sessions": "\u4F1A\u8BDD",
  "viewOptions.label": "\u89C6\u56FE\u9009\u9879",
  "groupBy.label": "\u5206\u7EC4\u65B9\u5F0F",
  "groupBy.workspace": "\u6309\u5DE5\u4F5C\u533A",
  "groupBy.workspaceTree": "\u6309\u5DE5\u4F5C\u533A\u6811",
  "groupBy.flat": "\u5355\u5217\u8868",
  "orderBy.label": "\u6392\u5E8F\u65B9\u5F0F",
  "orderBy.manual": "\u624B\u52A8\u6392\u5E8F",
  "orderBy.updated": "\u6700\u8FD1\u66F4\u65B0",
  "filterBy.label": "\u7B5B\u9009\u4F1A\u8BDD",
  "viewOptions.hideArchived": "\u9690\u85CF\u5DF2\u5F52\u6863",
  "viewOptions.showArchived": "\u5168\u90E8\u5BF9\u8BDD\uFF08\u663E\u793A\u5DF2\u5F52\u6863\uFF09",
  "viewOptions.onlyArchived": "\u4EC5\u663E\u793A\u5DF2\u5F52\u6863",
  "sessions.expand": "\u5C55\u5F00\u5176\u4F59 {n} \u4E2A\u4F1A\u8BDD",
  "sessions.collapse": "\u6536\u8D77",
  "empty.none": "\u6682\u65E0\u4F1A\u8BDD",
  "empty.noneArchived": "\u6682\u65E0\u5DF2\u5F52\u6863\u4F1A\u8BDD",
  "empty.viewOthers": "\u67E5\u770B\u5176\u4ED6\u4F1A\u8BDD",
  "empty.noMatches": "\u65E0\u5339\u914D\u7ED3\u679C",
  "workspace.add": "\u6DFB\u52A0\u5DE5\u4F5C\u533A",
  "search.sessions.aria": "\u641C\u7D22\u4F1A\u8BDD",
  "search.placeholder": "\u641C\u7D22\u4F1A\u8BDD\u540D\u79F0",
  "search.clear": "\u6E05\u9664\u641C\u7D22",
  "search.results.aria": "\u641C\u7D22\u7ED3\u679C",
  "search.pending": "\u6B63\u5728\u641C\u7D22\u4F1A\u8BDD\u5386\u53F2\u2026",
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
  // One irreversible action, one sentence: this key and the archived page's
  // `archived.delete.desc` (addon/chat-runtime.ts) are the same string, in zh
  // and in en alike — the two dialogs must not drift apart.
  "delete.session.desc": "\u5C06\u5220\u9664\u4F1A\u8BDD\u201C{name}\u201D\u7684\u804A\u5929\u8BB0\u5F55\u3002\u5176\u6587\u4EF6\u5939\u4F1A\u4FDD\u7559\u5728\u78C1\u76D8\u4E0A\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  "delete.session.pending": "\u6B63\u5728\u5220\u9664\u4F1A\u8BDD\u2026",
  "chat.section": "\u804A\u5929",
  "chat.add": "\u65B0\u5EFA\u804A\u5929",
  "chat.empty": "\u6682\u65E0\u804A\u5929",
  "chat.search.placeholder": "\u641C\u7D22\u804A\u5929\u2026",
  "chat.search.aria": "\u641C\u7D22\u804A\u5929",
  "menu.unarchiveSession": "\u53D6\u6D88\u5F52\u6863",
  "menu.pinSession": "\u7F6E\u9876\u4F1A\u8BDD",
  "menu.unpinSession": "\u53D6\u6D88\u7F6E\u9876",
  "row.archived": "\u5DF2\u5F52\u6863",
  "row.pinned": "\u5DF2\u7F6E\u9876",
  "toast.archivedNotOpenable": "\u5DF2\u5F52\u6863\u5BF9\u8BDD\u6682\u65F6\u65E0\u6CD5\u67E5\u770B\uFF0C\u8BF7\u53D6\u6D88\u5F52\u6863\u540E\u67E5\u770B",
  "toast.archived": "\u4F1A\u8BDD\u5DF2\u5F52\u6863\uFF0C\u53EF",
  "toast.stoppedAndArchived": "\u5DF2\u505C\u6B62\u5E76\u5F52\u6863\uFF0C\u53EF",
  "archive.confirm.title": "\u505C\u6B62\u5E76\u5F52\u6863\u6B64\u4F1A\u8BDD\uFF1F",
  "archive.confirm.desc": "\u201C{title}\u201D\u4ECD\u6709\u6B63\u5728\u8FDB\u884C\u7684\u5DE5\u4F5C\u3002\u5F52\u6863\u4F1A\u5148\u505C\u6B62\u8FD9\u4E9B\u5DE5\u4F5C\uFF1B\u4E4B\u540E\u53EF\u5728\u4FA7\u680F\u7B5B\u9009\u201C\u5168\u90E8\u5BF9\u8BDD\uFF08\u663E\u793A\u5DF2\u5F52\u6863\uFF09\u201D\u4E2D\u6062\u590D\u4F1A\u8BDD\uFF0C\u88AB\u505C\u6B62\u7684\u5DE5\u4F5C\u4E0D\u4F1A\u81EA\u52A8\u7EE7\u7EED\u3002",
  "archive.confirm.activity": "\u5C06\u88AB\u505C\u6B62\u7684\u5DE5\u4F5C",
  "archive.confirm.turn": "\u8FDB\u884C\u4E2D\u7684\u56DE\u5408",
  "archive.confirm.subagents.one": "{n} \u4E2A\u8FD0\u884C\u4E2D\u7684\u5B50\u667A\u80FD\u4F53\uFF1A{names}",
  "archive.confirm.subagents.other": "{n} \u4E2A\u8FD0\u884C\u4E2D\u7684\u5B50\u667A\u80FD\u4F53\uFF1A{names}",
  "archive.confirm.jobs.one": "{n} \u4E2A\u540E\u53F0\u4EFB\u52A1\uFF1A{names}",
  "archive.confirm.jobs.other": "{n} \u4E2A\u540E\u53F0\u4EFB\u52A1\uFF1A{names}",
  "archive.confirm.schedules.one": "{n} \u6761\u5B9A\u65F6\u63D0\u9192\uFF1A{names}",
  "archive.confirm.schedules.other": "{n} \u6761\u5B9A\u65F6\u63D0\u9192\uFF1A{names}",
  "archive.confirm.other.one": "{n} \u9879\u5176\u4ED6\u5DE5\u4F5C\uFF08{kind}\uFF09",
  "archive.confirm.other.other": "{n} \u9879\u5176\u4ED6\u5DE5\u4F5C\uFF08{kind}\uFF09",
  "archive.confirm.listSeparator": "\u3001",
  "archive.confirm.action": "\u505C\u6B62\u5E76\u5F52\u6863",
  "archive.confirm.pending": "\u6B63\u5728\u505C\u6B62\u5E76\u5F52\u6863\u2026",
  "toast.archivedUndo": "\u64A4\u9500",
  "toast.archivedOr": "\u6216",
  "toast.archivedFilter": "\u7B5B\u9009\u5DF2\u5F52\u6863\u4F1A\u8BDD",
  "toast.pinFailed": "\u7F6E\u9876\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  "toast.unpinFailed": "\u53D6\u6D88\u7F6E\u9876\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  "toast.createFailed": "\u65B0\u5EFA\u4F1A\u8BDD\u5931\u8D25\uFF1A{message}",
  "sessions.count.one": "{n} \u4E2A\u4F1A\u8BDD",
  "sessions.count.other": "{n} \u4E2A\u4F1A\u8BDD",
  "actions.workspace.aria": "\u5DE5\u4F5C\u533A\u201C{name}\u201D\u7684\u64CD\u4F5C",
  "actions.session.aria": "\u4F1A\u8BDD\u201C{name}\u201D\u7684\u64CD\u4F5C",
  "actions.archive": "\u5F52\u6863\u4F1A\u8BDD",
  "actions.unarchive": "\u53D6\u6D88\u5F52\u6863",
  "actions.pin": "\u7F6E\u9876\u4F1A\u8BDD",
  "actions.unpin": "\u53D6\u6D88\u7F6E\u9876",
  "actions.newSession": "\u65B0\u4F1A\u8BDD",
  "actions.newSession.aria": "\u5728\u201C{name}\u201D\u4E2D\u65B0\u5EFA\u4F1A\u8BDD",
  "status.running": "\u8FDB\u884C\u4E2D",
  "status.subagentsRunning.one": "{n} \u4E2A\u5B50\u667A\u80FD\u4F53\u8FD0\u884C\u4E2D",
  "status.subagentsRunning.other": "{n} \u4E2A\u5B50\u667A\u80FD\u4F53\u8FD0\u884C\u4E2D",
  "status.idle": "\u7A7A\u95F2",
  "status.waitingApproval": "\u7B49\u5F85\u5BA1\u6279",
  "status.planReview": "\u8BA1\u5212\u5F85\u5BA1",
  "status.waitingAnswer": "\u7B49\u5F85\u56DE\u7B54",
  "status.compact.approval": "\u5F85\u5BA1\u6279",
  "status.compact.planReview": "\u8BA1\u5212\u5F85\u5BA1",
  "status.compact.answer": "\u5F85\u56DE\u7B54",
  "status.completed": "\u5DF2\u5B8C\u6210",
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
  "defaultWorkspace.failed": "Unable to create default workspace. Use Choose workspace to select a folder.",
  "draft.workspaceRequired": "Choose a workspace first.",
  "draft.initializationFailed": "Could not fill the draft. Please try again shortly.",
  "group.ungrouped": "Ungrouped",
  "session.new": "New Session",
  "session.untitled": "Untitled",
  "shortcut.noSession": "Select a session first",
  "shortcut.noPicker": "Directory picker unavailable",
  "shortcut.directoryBusy": "Selecting or adding a workspace",
  "shortcut.noCompletedTurn": "This session has no completed turn",
  "shortcut.forkFailed": "Could not fork the session. Try again.",
  "section.workspaces": "Workspaces",
  "section.sessions": "Sessions",
  "viewOptions.label": "View options",
  "groupBy.label": "Group by",
  "groupBy.workspace": "WorkSpace",
  "groupBy.workspaceTree": "Workspace Tree",
  "groupBy.flat": "In one list",
  "orderBy.label": "Order by",
  "orderBy.manual": "Manual",
  "orderBy.updated": "Last updated",
  "filterBy.label": "Filter sessions",
  "viewOptions.hideArchived": "Hide archived",
  "viewOptions.showArchived": "All conversations (show archived)",
  "viewOptions.onlyArchived": "Archived only",
  "sessions.expand": "Show {n} more sessions",
  "sessions.collapse": "Show less",
  "empty.none": "No sessions yet",
  "empty.noneArchived": "No archived sessions yet",
  "empty.viewOthers": "View other sessions",
  "empty.noMatches": "No matches",
  "workspace.add": "Add workspace",
  "search.sessions.aria": "Search sessions",
  "search.placeholder": "Search session names",
  "search.clear": "Clear search",
  "search.results.aria": "Search results",
  "search.pending": "Searching session history\u2026",
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
  "menu.unarchiveSession": "Unarchive session",
  "menu.pinSession": "Pin session",
  "menu.unpinSession": "Unpin session",
  "row.archived": "Archived",
  "row.pinned": "Pinned",
  "toast.archivedNotOpenable": "Archived sessions cannot be opened. Unarchive it to view.",
  "toast.archived": "Session archived. You can ",
  "toast.stoppedAndArchived": "Session stopped and archived. You can ",
  "archive.confirm.title": "Stop and archive this session?",
  "archive.confirm.desc": "\u201C{title}\u201D still has work in progress. Archiving stops it first; you can restore the session later from the \u201CAll conversations (show archived)\u201D filter in the sidebar, and the stopped work will not resume on its own.",
  "archive.confirm.activity": "Work that will be stopped",
  "archive.confirm.turn": "The turn in progress",
  "archive.confirm.subagents.one": "{n} running subagent: {names}",
  "archive.confirm.subagents.other": "{n} running subagents: {names}",
  "archive.confirm.jobs.one": "{n} background job: {names}",
  "archive.confirm.jobs.other": "{n} background jobs: {names}",
  "archive.confirm.schedules.one": "{n} scheduled reminder: {names}",
  "archive.confirm.schedules.other": "{n} scheduled reminders: {names}",
  "archive.confirm.other.one": "{n} other item of work ({kind})",
  "archive.confirm.other.other": "{n} other items of work ({kind})",
  "archive.confirm.listSeparator": ", ",
  "archive.confirm.action": "Stop and archive",
  "archive.confirm.pending": "Stopping and archiving\u2026",
  "toast.archivedUndo": "undo",
  "toast.archivedOr": " or ",
  "toast.archivedFilter": "filter archived sessions",
  "toast.pinFailed": "Pin failed. Try again later.",
  "toast.unpinFailed": "Unpin failed. Try again later.",
  "toast.createFailed": "New session failed: {message}",
  "sessions.count.one": "{n} session",
  "sessions.count.other": "{n} sessions",
  "actions.workspace.aria": "Workspace actions for {name}",
  "actions.session.aria": "Session actions for {name}",
  "actions.archive": "Archive",
  "actions.unarchive": "Unarchive",
  "actions.pin": "Pin",
  "actions.unpin": "Unpin",
  "actions.newSession": "New session",
  "actions.newSession.aria": "New session in {name}",
  "status.running": "Running",
  "status.subagentsRunning.one": "{n} subagent running",
  "status.subagentsRunning.other": "{n} subagents running",
  "status.idle": "Idle",
  "status.waitingApproval": "Waiting for approval",
  "status.planReview": "Plan awaiting review",
  "status.waitingAnswer": "Waiting for answer",
  "status.compact.approval": "Approval",
  "status.compact.planReview": "Plan review",
  "status.compact.answer": "Answer",
  "status.completed": "Completed",
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

// src/client/index.ts
var NS = "workspace";
var CHAT_NS = "chatManager";
var inject = [
  "slots",
  "sessions",
  "workspaces",
  "locale",
  "remote",
  "remote.directoryPicker",
  "layout",
  "shortcuts"
];
function apply(ctx) {
  const sessions = ctx.get("sessions");
  const workspaces = ctx.get("workspaces");
  const viewHandle = createWorkspaceViewStore();
  const viewInstance = viewHandle.create();
  const viewStore = { ...viewHandle, create: () => viewInstance };
  const rowToast = (0, import_dsh_client_store4.createSnapshotStore)(null);
  let toastSeq = 0;
  const notify = (toast) => {
    rowToast.set({ ...toast, seq: ++toastSeq });
  };
  const uiWorkspace = new UiWorkspaceService(
    ctx,
    ctx.remote.directoryPicker,
    workspaces,
    sessions,
    viewInstance.actions,
    notify
  );
  ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list, chat: chatStateSource } });
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-workspace: dictionaries");
  ctx.effect(
    () => ctx.locale.register(CHAT_NS, { zh: chatManagerZh, en: chatManagerEn }),
    "dsh-chat-manager: dictionaries"
  );
  setRefreshSessions(() => {
    void sessions.refresh();
  });
  void refreshChatState().catch(() => {
  });
  const shortcutControls = createWorkspaceShortcutControls();
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
  const openSession = (sessionId) => {
    uiWorkspace.openSession(sessionId);
  };
  const pinnedSet = derive(workspaces.list, (snapshot) => new Set(snapshot.pinnedSessionIds));
  const archivedSet = derive(workspaces.list, (snapshot) => new Set(snapshot.archivedSessionIds));
  const renameRequest = derive(shortcutControls.state, (state) => state.renameTarget);
  const archiveRequest = (0, import_dsh_client_store4.createSnapshotStore)(null);
  const requestSessionRename = shortcutControls.rename;
  const unarchiveSession = (sessionId) => {
    uiWorkspace.unarchiveSession(sessionId).catch((reason) => {
      console.warn("session unarchive rejected:", reason);
    });
  };
  const renameSession = async (sessionId, title) => {
    const result = await sessions.using(
      sessionId,
      { source: "workspaceOperation" },
      (reference) => reference.binding.session.rename(title)
    );
    if (!result.ok) throw new Error(result.error.message);
  };
  const pinInjected = () => ({
    hooks: { pinned: pinnedSet, archived: archivedSet },
    // Pin failures surface as a notice: nothing else on the surface moves, so
    // a silent failure would read as a dead action.
    pinSession: (sessionId) => {
      uiWorkspace.pinSession(sessionId).catch(() => {
        notify({ kind: "pinFailed" });
      });
    },
    unpinSession: (sessionId) => {
      uiWorkspace.unpinSession(sessionId).catch(() => {
        notify({ kind: "unpinFailed" });
      });
    }
  });
  const archiveInjected = () => ({
    hooks: { archived: archivedSet },
    // Archive preserves the log and the account position, so a quiet Session
    // needs no confirmation; the notice offers undo and the archived filter.
    // The Host's refusal for running work is the one case that asks first:
    // the confirmation names that work and offers to stop it.
    archiveSession: (sessionId) => {
      uiWorkspace.archiveSession(sessionId).then(() => {
        notify({ kind: "archived", sessionId });
      }).catch((reason) => {
        const activity = activeSessionRefusal(reason);
        if (activity === void 0) {
          console.warn("session archive rejected:", reason);
          return;
        }
        const displayTitle2 = sessions.list.getSnapshot().byId[sessionId]?.displayTitle ?? sessionId;
        archiveRequest.set({ sessionId, displayTitle: displayTitle2, activity });
      });
    },
    unarchiveSession
  });
  installWorkspaceShortcuts(ctx, uiWorkspace, shortcutControls, archiveInjected().archiveSession);
  const archiveConfirmInjected = () => ({
    hooks: { archiveRequest },
    settleSessionArchive: () => {
      archiveRequest.set(null);
    },
    stopAndArchiveSession: async (sessionId) => {
      await uiWorkspace.archiveSession(sessionId, { stopActivity: true });
      notify({ kind: "stoppedAndArchived", sessionId });
    }
  });
  const forkInjected = () => ({
    forkSession: (sessionId) => {
      uiWorkspace.forkSession(sessionId, (childId) => {
        ctx.get("productAnalytics")?.track("branch_session_click", { session_id: childId, parent_session_id: sessionId, click_position: "sidebar" });
      }).catch(() => {
      });
    }
  });
  const renameInjected = () => ({ requestSessionRename });
  const renameDialogInjected = () => ({
    hooks: { renameRequest },
    settleSessionRename: shortcutControls.closeRename,
    renameSession
  });
  const rowToastInjected = () => ({
    hooks: { toast: rowToast },
    dismissToast: () => {
      rowToast.set(null);
    },
    undoArchive: unarchiveSession,
    showArchived: () => {
      viewInstance.actions.setArchivedFilter("show");
    }
  });
  const chatSearchRpc = (query) => rpcPost("/api/chat-manager/search-chats", { query }).then((data) => data.items ?? []);
  const waitForChatWorkspace = (dateFolder) => waitFor(() => {
    const found = chatRuntimeSource.getSnapshot().workspaces.find((workspace) => workspace.path === dateFolder || samePath(workspace.path, dateFolder));
    return found === void 0 || found.workspaceId.length === 0 ? void 0 : found.workspaceId;
  }, 12);
  const waitForRegisteredWorkspace = (workspaceId) => waitFor(() => workspaces.list.getSnapshot().items.some((item) => item.workspaceId === workspaceId) ? workspaceId : void 0, 24);
  const startChatRpc = async () => {
    const data = await rpcPost("/api/chat-manager/ensure-date-folder", {});
    const payload = data;
    const declared = typeof payload.workspaceId === "string" && payload.workspaceId.length > 0 ? payload.workspaceId : void 0;
    const resolved = declared ?? (typeof payload.dateFolder === "string" ? await waitForChatWorkspace(payload.dateFolder) : void 0);
    if (resolved === void 0) throw new Error("chat-manager: the date-folder Workspace is unknown");
    if (await waitForRegisteredWorkspace(resolved) === void 0) {
      throw new Error("chat-manager: the date-folder Workspace did not reach the client");
    }
    uiWorkspace.startSession(resolved);
    void refreshChatState().catch(() => {
    });
  };
  const browserInjected = () => ({
    // Explicit group actions keep their target; unscoped New Session inherits
    // the current Session Workspace before the recent-Workspace fallback.
    startSession: (workspaceId) => {
      uiWorkspace.startSession(workspaceId);
    },
    open: openSession,
    searchSessions,
    searchResultLimit: sessions.searchResultLimit,
    requestSessionRename,
    notifyArchivedNotOpenable: () => {
      notify({ kind: "archivedNotOpenable" });
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
    unarchiveSession: async (sessionId) => {
      await uiWorkspace.unarchiveSession(sessionId);
    },
    createWorkspace: (input) => workspaces.create(input),
    requestSearch: shortcutControls.search,
    requestAddWorkspace: shortcutControls.add,
    closeAddWorkspace: shortcutControls.closeAdd,
    setDirectoryBusy: shortcutControls.directoryBusy,
    dismissForkError: shortcutControls.dismissForkError,
    chatSearch: chatSearchRpc,
    startChat: startChatRpc,
    hooks: {
      directoryFlow: browserFlowSource,
      hostInfo,
      workspaceShortcuts: shortcutControls.state,
      shortcuts: ctx.shortcuts.catalog,
      chat: chatStateSource
    }
  });
  const pickerInjected = () => ({
    createWorkspace: (input) => workspaces.create(input),
    hooks: { directoryFlow: pickerFlowSource }
  });
  const deleteRequest = (0, import_dsh_client_store4.createSnapshotStore)(null);
  const deleteInjected = () => ({
    requestSessionDelete: (sessionId, displayTitle2) => {
      deleteRequest.set({ sessionId, displayTitle: displayTitle2 });
    }
  });
  const deleteConfirmInjected = () => ({
    hooks: { deleteRequest },
    settleSessionDelete: () => {
      deleteRequest.set(null);
    },
    // The tombstone plus baseline refresh live in the shared choreography, so a
    // delete from the settings page leaves every list in the same state.
    deleteSession: performSessionDelete
  });
  ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register(
    {
      name: "sidebar.workspaces",
      children: {
        "sidebar.workspaces.directoryFlow": { kind: "single", scope: "root" },
        // Every row entry reads the menu's open state through a hook bound
        // from the row's render occurrence (the owner passes the state pair
        // as hookContext).
        "sidebar.workspaces.session.menu.item": {
          kind: "list",
          scope: "root",
          inject: { hooks: { menuOpenState: menuOpenStateFactory, shortcuts: ctx.shortcuts.catalog } }
        },
        "sidebar.workspaces.session.row.action": { kind: "list", scope: "root" },
        "sidebar.session.row.leading": { kind: "list", scope: "root" },
        "sidebar.session.row.hover": { kind: "list", scope: "root" }
      },
      store: viewStore,
      inject: browserInjected,
      locale: NS
    },
    WorkspaceBrowser
  ));
  ctx.slots.inject("sidebar.workspaces.session.menu.item", function* () {
    yield ctx.slots.register({ name: "sidebar.workspaces.session.menu.item", id: "pin", order: 100, locale: NS, inject: pinInjected }, PinSessionMenuItem);
    yield ctx.slots.register({ name: "sidebar.workspaces.session.menu.item", id: "rename", order: 200, locale: NS, inject: renameInjected }, RenameSessionMenuItem);
    yield ctx.slots.register({ name: "sidebar.workspaces.session.menu.item", id: "fork", order: 300, locale: NS, inject: forkInjected }, ForkSessionMenuItem);
    yield ctx.slots.register({ name: "sidebar.workspaces.session.menu.item", id: "archive", order: 400, locale: NS, inject: archiveInjected }, ArchiveSessionMenuItem);
    yield ctx.slots.register({ name: "sidebar.workspaces.session.menu.item", id: "delete", order: 500, locale: NS, inject: deleteInjected }, DeleteSessionMenuItem);
  });
  ctx.slots.inject("sidebar.workspaces.session.row.action", function* () {
    yield ctx.slots.register({ name: "sidebar.workspaces.session.row.action", id: "archive", order: 100, locale: NS, inject: archiveInjected }, ArchiveSessionRowButton);
    yield ctx.slots.register({ name: "sidebar.workspaces.session.row.action", id: "pin", order: 200, locale: NS, inject: pinInjected }, PinSessionRowButton);
  });
  ctx.slots.inject("shell.overlay", function* () {
    yield ctx.slots.register({
      name: "shell.overlay",
      id: "workspace.session-rename",
      locale: NS,
      inject: renameDialogInjected
    }, SessionRenameDialog);
    yield ctx.slots.register({
      name: "shell.overlay",
      id: "workspace.session-archive",
      locale: NS,
      inject: archiveConfirmInjected
    }, SessionArchiveConfirmDialog);
    yield ctx.slots.register({
      name: "shell.overlay",
      id: "workspace.row-toast",
      locale: NS,
      store: viewStore,
      inject: rowToastInjected
    }, RowActionToast);
    yield ctx.slots.register({
      name: "shell.overlay",
      id: "workspace.session-delete",
      locale: NS,
      inject: deleteConfirmInjected
    }, SessionDeleteConfirmDialog);
  });
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
    label: () => ctx.locale.bind(CHAT_NS)("settings.archived"),
    locale: CHAT_NS,
    inject: () => ({})
  }, ArchivedSessionsPage));
}
function activeSessionRefusal(reason) {
  if (!(reason instanceof Error) || reason.name !== "WorkspaceArchiveError") return void 0;
  const { rpcError } = reason;
  return rpcError.code === "workspace/session-active" ? rpcError.details.activity : void 0;
}
async function waitFor(probe, attempts, intervalMs = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = probe();
    if (value !== void 0) return value;
    await new Promise((resolve) => {
      window.setTimeout(resolve, intervalMs);
    });
  }
  return void 0;
}

		return module.exports;
	}
});
