# 项目初始化

本仓库 = DSH 会话管理插件（工作区/聊天双区域 + 删除会话 + 已归档会话管理），**Web UI 与桌面端通用**。新 agent 开工前先读本文件、`CONTEXT.md`（领域词汇）与 `docs/agents/`（工作流约定）。

## 项目概况

- 交付形态：**固化进宿主组合的 bundle 插件**——仓库根目录即插件包，声明 `dsh.bundle`（随包分发 `cordis.patch.yml`：禁用内置 `ui-workspace` 行、插入 `ui-chat-manager`），`dsh plugin add/install` 自动注册进 profile 的 `dsh.profile.bundles` 层栈。浏览器半是内置 `ui-workspace` 客户端源码的 **TS/TSX 分叉**（`src/client/`，从 DSH 源码检出拷贝后做插件改动），视觉/交互与内置一致；配合 DSH 0.2.x 的 client-modules 装载机制（`window.__ModuleLoader__.load` 工厂 + 平台种子词外部依赖）。
- **Web UI 与桌面端共用同一份代码**：`apps/desktop-host` 用同一个 Web 应用启动，只是 profile 名不同（`web` vs `desktop`）。插件只需一份，但要**分别装进两个 profile**；`desktop` profile 由 Electron 应用独占管理，CLI 会拒绝 `--profile desktop`，只能通过桌面端「插件」页安装/卸载。
- 需求与验收：`.scratch/chat-manager/spec.md`；领域词汇：`CONTEXT.md`；命名时序决策：`docs/adr/0001-chat-folder-naming.md`。

## 仓库与部署拓扑

- 插件代码就在仓库根：源码 `src/`（宿主半 `src/index.ts`；浏览器半 `src/client/` = ui-workspace 分叉 + 插件 addon），构建产物 `lib/index.js`（ESM，webServer 路由 `/api/chat-manager/{state,ensure-date-folder,search-chats,delete-session,restore-session}`）与 `lib/client.js`（`__ModuleLoader__.load` 工厂 bundle，仅 require 平台种子词）。**仓库根有且只有一份 `package.json`，不再有 `packages/` 这一层。**
- 构建：`npm run build` = `node scripts/build.mjs`（esbuild：宿主 ESM + 客户端工厂形态 + `.module.css` 哈希类映射/样式注入）**+ `node scripts/verify-bundle.mjs` 门禁**；类型门禁 `npm run typecheck`（devDependencies 为 0.2.1-alpha.1 发布包类型，仅构建期使用）；两者合一为 `npm run verify`。**CSS 哈希类名固定以字母 `m` 前缀开头**：纯十六进制哈希经常以数字开头，`.0x1abc_*` 是非法 CSS 选择器，整张样式表会被浏览器丢弃（历史教训，勿改回，门禁会拦）。
- 部署路径按 `dsh plugin add "link:..."` 经 profile 的 `node_modules` junction → 仓库根目录：改仓库文件即对 dsh 生效，勿复制文件过去（验证用接缝：`dsh plugin --profile cmtest add "link:F:/workdir/dsh-chat-manager"` 后 `dsh --profile cmtest --port <P> --no-open`）。
- 装配：profile 的 `dsh.profile.bundles` 层栈含 `dsh-chat-manager`（由 `dsh plugin add/install` 按 `dsh.bundle` 声明自动 reconcile）。**已知陷阱**：reconcile 只为「本次 pnpm 运行里新增的依赖」追加层项；依赖已在 `dependencies` 里而 `bundles` 缺项时，重复 `add` 只报 `Already up to date` 而不会补层项——此时按插件管理器的写法手工把 `dsh-chat-manager` 补到 `~/.dsh/profiles/<profile>/package.json` 的 `bundles` 数组末尾。
- 补丁层 `cordis.patch.yml`（bundle patch）不再使用旧版的 `# (reload marker rN: ...)` 手工失效标记：0.2.x 的浏览器 bundle rev 由服务端按产物 mtime/ctime/size 重算，生效 = 重启 dsh + 浏览器强制刷新。
- 生效规则：浏览器半 → `node scripts/build.mjs` 重出 `lib/client.js` → 重启 dsh web（bundle rev 随启动图更新）+ Ctrl+F5；宿主半 → 重启 dsh 进程。

## 开发循环

1. 需求/验收变更先写进 `spec.md`（必要时同步刷新本文件与 CONTEXT.md 相关表述）。
2. 改 `src/client/`（ui-workspace 分叉）或 `src/index.ts` → `npm run build` → `npm run typecheck` → 重启验证实例 → CDP 探针。
3. 分叉同步：DSH 上游 ui-workspace 客户端源码升级时，把 `F:\workdir\deepseek-harness\packages\client\ui-workspace\src\client\` **整体重新签入** `src/client/`，再按下表逐项重施插件增量，最后用 `node scripts/fork-diff.mjs` 复核。**当前锚定上游 commit `5badb15`（dsh 0.2.1-alpha.1）**：上游 22 个文件中 15 个逐字节一致、7 个带插件增量，插件另有 5 个自有文件。0.2.x 上游把会话动作**外置成槽条目**（`sidebar.workspaces.session.menu.item` / `sidebar.workspaces.session.row.action`，实现见 `session-actions/`），并新增 `pin-order.ts`、`shortcuts.ts`、`rows/AnimatedRows.tsx`——这些都必须原样签入。

   | 文件 | 插件改动 |
   | --- | --- |
   | `rows/WorkspaceBrowser.tsx` | 导出 `SEARCH_DEBOUNCE_MS` / `SEARCH_QUERY_MAX_CODE_UNITS` / `sanitizeSearchQuery`；聊天区状态（chat root、墓碑、`excludedSessionIds`、`setChatRuntimeSnapshot`）；工作区/聊天分栏（`.split`/`.pane`/`.divider` + 拖拽）；`SessionTree`/`FlatList`/`SearchResults` 透传 `excludedSessionIds` |
   | `rows/WorkspaceBrowser.module.css` | 文件末尾追加插件类（`.chatSection`、`.chatList`、`.split`、`.pane`、`.divider`、`.archived*`） |
   | `tree.ts` | `groupByWorkspace` / `deriveGroups` / `deriveFlat` 新增 `excludedSessionIds` 参数（聊天会话与墓碑不得进入工作区区域） |
   | `contract/slots.ts` | 注入面扩展：`hooks.chat`、`chatSearch`、`startChat`，以及 `DeleteSessionInjected` / `SessionDeleteConfirm{Request,Injected,Props}` |
   | `locales.ts` | 追加 `menu.deleteSession`、`delete.session*`、`chat.*`（zh/en 各 9 键） |
   | `navigation.ts` | `UiWorkspace.installChatRouting` + `ChatRoutingGuards`（无参 `startSession` 在聊天焦点/无焦点时路由到新聊天） |
   | `index.ts` | 注册接线：`chatManager` 字典、`chat` hook 根、删除会话槽条目 + `shell.overlay` 确认框、`settings.section` 归档页、`installChatRouting` |
   | `addon/chat-runtime.ts`、`addon/ChatSection.tsx`、`addon/ArchivedSessionsPage.tsx`、`addon/ConfirmDeleteDialog.tsx`、`session-actions/DeleteSession.tsx` | 插件自有文件，上游无对应文件 |

   会话菜单里的「删除会话」**不是**分叉改动：它是 `session-actions/DeleteSession.tsx` 注册进 `sidebar.workspaces.session.menu.item`（order 500）的槽条目，因此 `rows/Rows.tsx`、`rows/Rows.module.css`、`rows/AnimatedRows.*`、`pin-order.ts`、`shortcuts.ts`、`stores.ts`、`WorkspacePicker.*`，以及 `session-actions/` 下除插件自有 `DeleteSession.tsx` 之外的 6 个文件（`ArchiveSession.tsx`、`ForkSession.tsx`、`PinSession.tsx`、`RenameSession.tsx`、`RowActionToast.tsx`、`derived.ts`）都与上游逐字节一致。

   对比记录由 `node scripts/fork-diff.mjs` 生成到 `.scratch/std-fork-diffs/`（空 diff = 该文件与上游逐字节一致；脚本同时打印锚定的上游 commit）。**不要手工维护这些 diff**。

## 验证纪律（提交前必须全绿）

- `npm run verify`（= `tsc --noEmit` + `node scripts/build.mjs` + `node scripts/verify-bundle.mjs`）零错误；`node --check` 两个 `lib/*.js`。门禁本身会拒绝**过期产物**：任何 `src/**/*.{ts,tsx,css}`、`scripts/build.mjs` 或 `package.json` 比 `lib/*.js` 新即失败并提示重建（门禁只认产物，不重建产物；`npm run verify` 因此必须含 build——此前它只做 typecheck + 门禁，源码改动后可以对着陈旧 bundle 报绿灯）。
- `scripts/verify-bundle.mjs` 断言（`npm run build` 已内置）：`lib/client.js` 的 require 集合全部落在平台种子词（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`，与 `scripts/build.mjs` 的 `PLATFORM_EXTERNALS` 必须逐项相等）；不含 0.1.x 图标/hook 名（`Icon*Outline16|20|14`、`IconFolderClose16`、`useSessionPendingInteraction`、`sessions.open(`）；**逐张检查每个 CSS 类映射**（成对读取 `var cssTextN` 与 `var classMapN`；哈希必须以 `m` + 6 位十六进制开头；**改名后的类必须出现在本表的选择器里**，且**不得残留未哈希的 `.local`**），且「一张都没扫到」或「成对数量对不上」本身即失败——空扫不是绿灯；工厂 id **等于 `package.json` 的包名**（平台按包名 stamp 并由 `client-modules` 校验，**不是** `cordis.patch.yml` 的行 id）。
- 真机验证（headless Chrome，`$DSH_CHROME` 可覆盖路径）：共享 `tools/cdp-lib.mjs`（启动/连接/求值/清理——等 stderr 管道关闭后删临时 profile，检查 `%TEMP%\dsh-cdp-*` 残留为 0）。探针脚本放在 `.scratch/`：boot 探针（无失败页、双区域渲染、零 console 错误、**`[data-slot-error="sidebar.workspaces"]` 不存在且 `[data-row-key]` > 0**）、菜单探针（会话菜单项各出现一次、删除确认框）、设置页探针（已归档会话 tab 注册、无 `time.*` 键名泄漏）、宿主路由探针（`/api/chat-manager/*` 在页面上下文 fetch）。
- **探针夹具的三个坑（都已修在共享 harness 里）**：① 一个**刚启动的隔离实例**要 30s 级才会画出第一行，`accept2-lib.waitForApp` 的等待预算现在默认 90×2s；② 它的存活判据曾经是「正文 >200 字符」，而一个确实渲染好的实例正文只有 187 字符 —— 判据是「有行 **且** 有文本」，**不要**再引入固定字符数下限；③ 全新浏览器 profile 没有持久化的展开状态，**工作分区默认折叠**、工作区区域可能一行都不渲染，而 DSH 会**复用**同日期文件夹里已有的空白聊天（对当前空白聊天点「新建聊天」不会产生新会话）。所以取行要**跨两区**取「有动作条的行」，要空白聊天就直接取聊天区里那行没有动作条的当前行。
- **验证实例必须与实盘宿主隔离 `$DSH_HOME`（已踩过一次）**：`DSH_HOME` 是受支持的覆盖点（`resolveDshHome`：显式配置 > `DSH_HOME` > `~/.dsh`）。做法是把 `~/.dsh` 复制成一次性副本（`robocopy <源> <副本> /E /XJ` 跳过 reparse point，随后**只需**把 `profiles/<profile>/node_modules/<插件>` 按原名重建为 junction——那是 profile 里唯一的链接），再 `DSH_HOME=<副本> dsh --profile cmtest --port 3199 --no-open`。因为 storages/sessions 都在副本里，删除、归档、账目写入只落在副本上，实盘 `~/.dsh` 逐字不变；`.credentials.yaml` 也随副本走，模型轮次照常可用。探针脚本一律用 `process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')` 解析 home（`accept5` / `accept6` / `accept6-phase2` / `accept7*` 已如此）。**绝不要两个宿主共用一个 `$DSH_HOME`**：`storage-json` 以内存为准、只在打开时读一次盘，两个进程会互相覆盖对方的写入（历史事故：验证实例里的写路由把真实会话从工作区账目里 detach）。聊天根（`文档/DSH`）由系统 Documents 派生、不随 `DSH_HOME` 隔离，探针只能对自己创建的那一个聊天文件夹动手，事后清理。
- **effect 依赖自馈陷阱（已踩过一次，静态门禁抓不到）**：`WorkspaceBrowser` 的 `retainAccountKeys` effect 会无条件重写 view store 的 `sessionOrderByAccount`。它的依赖**只能是不读该 store 的值**（上游用 `workspaces`）；一旦换成由 `sessionOrderByAccount` 派生的数组（`orderedWorkspaces` / `orderedWorkspaceAreaWorkspaces` 之类），就形成 写入 → 派生值换新身份 → effect 重跑 的自馈环，表现为 React #185「Maximum update depth exceeded」，`sidebar.workspaces` 槽条目被错误边界接住、整个侧栏浏览区空白（其余面板正常）。改动任何写 store 的 effect 依赖后，必须真机跑 boot 探针。
- **CSS Modules 复合选择器陷阱（已踩过一次，门禁现在会拦）**：`scripts/build.mjs` 的 CSS 插件必须重命名选择器里的**每一个**类名。曾经的实现只重命名「前面不是单词字符」的类名（`.row.menuOpen` 里的 `menuOpen` 逃过重命名），于是元素拿到 `m…_menuOpen` 而样式表里仍写 `.menuOpen` —— 五条 `.menuOpen` 规则全死。可见后果：会话行的动作条在指针离开行的一瞬回落到 `display:none`，`Menu` 的锚点包裹元素随之失去盒子（矩形全零），而 portal 列表**每帧**按该矩形重新定位，于是打开的行菜单瞬间跳到视口左上角、再被 `closeOnPointerLeave` 关掉——鼠标完全点不到菜单项；`.selected` / `.archived` / `.dropBefore` / `.dropAfter` 等复合规则同时失效。`verify-bundle.mjs` 现在逐表断言「改名后的类必须出现在自己的样式表里」且「不得残留未哈希的 `.local`」，且**只判选择器位置**（注释与字符串在断言前被剥掉，否则注释里的类名会喂饱「必须出现」那条造成假绿），回退旧实现必然报错。变换只改选择器：**注释与引号字符串被 parking 后原样还原**（注释里的 `Rows.tsx`、`content: '.rail'` 都不是选择器），`:local(...)`/`:global(...)` 按 CSS Modules 语义剥离包装；parking 顺序必须是「注释 → 全局 → 字符串」，否则嵌套占位符会在单次还原后残留字面量。
- **会话删除的五条平台约束（宿主半，已各踩过一次）**：
  - `sessionPersistence.list()` 返回的是 **snapshot**（`{ header, revision, … }`），id 与 cwd 在 `snapshot.header` 上，**没有** `snapshot.id`；按 `snapshot.id` 过滤会永远匹配不到，删除静默变成空操作却仍回 200（`HostCtx` 里手写的服务形状一度也写错，类型门禁因此漏过）。`list()` 未命中时还要用公开 API `stat(id)` 复查一次，两道都查不到才能判定「平台不认识该会话」。
  - `locate(header)` 给的是**当前格式**的文件名（如 `session.v4.jsonl.zstd`），而迁移过的会话目录里留的是旧世代（`session.jsonl.zstd` + `session.v3.jsonl.zstd`）。持久化单位是**会话目录**（`<root>/<slug>/<session-id>`），只删 `locate` 那一个文件名 = 什么都没删，重启即复活。实现须校验 `path.basename(dirname(artifact)) === sid` 后再整目录删除，并在删除后 `existsSync` 复核。
  - **删除前无条件 `flush()`**（不只是「目录还不存在」时）：目录存在并不证明没有 pending 写入，活跃会话关机时的 flush 会把刚删掉的日志重新写出来。
  - **删不掉/拿不出工件一律 500，绝不「告警 + 200」**，并且「平台不认识它」这一分支还要复查 `ctx.get('sessions')?.get?.(id)`（与注册表 `sessionKnown` 同源的公开读取）：宿主仍以活性句柄持有该会话时同样 500。**边界要写准**（初版注释写错过）：jsonl 后端把「本进程创建但未落盘」的 pending 会话补进 `list()`/`stat()`，所以未落盘的活跃会话走的是**工件分支**、由那条老 500 拦住；本守卫真正覆盖的是「列表看不见但宿主仍持有」——工件在进程存活期间被带外删除、或工件头损坏/格式更高而被 `list()` 跳过。两者都必须 500（活跃写句柄能把工件写回来），文案统一带「重启宿主后重试」。只有「持久化列表没有 + 宿主内存也没有」的幽灵 id 才清账目回 200。因为客户端拿到 200 就会写墓碑隐藏该行，磁盘却仍有日志——界面与磁盘不一致，且墓碑永不清除。
  - **`/state` 会下发 `hostStartedAt`**（宿主进程启动时刻，`Date.now() - process.uptime()`）：阶段二探针靠它断言「这确实是另一个宿主进程」，否则同一条磁盘状态在没重启时也能全绿。客户端不消费该字段。
  - **归档集合与置顶集合只能走注册表公开方法**（`workspaceRegistry.unarchiveSession` / `unpinSession`；删除路由第 ③/⑥ 步）：`setState`/`requireState` 是 TS 私有成员，运行时能调但绕过注册表操作写链（`enqueueOperation`），与并发的归档/置顶/工作区增删交错时会互相覆盖整份状态，极端时序还会把 `workspaceIds` 与表不一致的状态落盘，令下次启动 `validateStoredState` 直接拒绝启动。删除同时要摘置顶（否则 `workspace.json` 留悬空 id；该失败只告警，因为置顶排序的成员表由当前列表派生、悬空 id 惰性）。
- 辅助：`tools/dump-css.mjs`（CSS 类名转储——对 `src/` 内 `.module.css` 使用）、`.scratch/` 探针脚本（`accept5-menu-mouse.mjs` = 菜单鼠标可达性，`accept6-delete-durable.mjs` + `accept6-phase2.mjs` = 设置页删除持久性两阶段，`accept7-row-menu-delete.mjs` + `accept7-phase2.mjs` = **行菜单**删除持久性两阶段 + 置顶集清理（夹具 = 聊天区当前空白行；空白行的动作条被上游整条隐藏，所以先给它一轮真实对话），`accept8-restore.mjs` + `accept8-phase2.mjs` = **归档恢复持久性**两阶段（恢复后账本 `workspace.json` 立刻不含该 id、日志文件清单逐项未变、行回到聊天区、重启后仍在原位；夹具取隔离副本里现成的非空白聊天行，所以既不建聊天文件夹也不花模型轮次），`accept9-live-guard.mjs` + `accept9-phase2.mjs` = **删除的诚实边界**两阶段（活跃会话的日志被带外删除 ⇒ 请求必须被拒且不写墓碑；重启后同一幽灵行必须能删掉）。后两者**要求显式 `DSH_HOME`**（未设即 exit 2），因为它们要动归档账本——`accept8` 是「归档→恢复」的往返（另断言夹具不在置顶集，否则归档摘 pin 会让往返不等价）。**删除类探针的夹具必须是探针自建**：删除路由第 ④ 步会改写实盘聊天根的 `.dsh-chat.json`（聊天根不随 `DSH_HOME` 隔离），用复制来的真实聊天会话当夹具会摘掉用户的登记（本轮踩过一次，已按原文补回并写入报告）。

## Agent skills

### Issue tracker

本仓库的 issue 与 spec 以 Markdown 文件存放在 `.scratch/<feature>/` 下。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个规范 triage 标签（默认值）：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`。见 `docs/agents/domain.md`。

### DSH 源码参照

- DSH 官方源码检出位于 `F:\workdir\deepseek-harness`（用户为本项目下载的参考副本，与部署的发行版同源；当前源码版本 0.2.1-alpha.1，已发布运行基线 0.2.0-rc.2）。它是内置组件行为与平台 API 的**权威依据**，比 bundle 反推或记忆猜测可靠。
- **以下场景必须先查源码、再动手或下结论**：
  - 修改 fork 自内置的客户端分叉（`src/client/` 对应 ui-workspace）时：组件树、CSS 类名、菜单数组、状态机逻辑以 `packages/client/ui-workspace/src/client/` 为准；装载/外部化协议以 `packages/client/modules/`（client-modules）与 `packages/client/tsdown.client.ts` 为准；
  - 调用平台服务或排查平台行为时：方法签名、语义、不变量以对应包源码为准（常见：`api/session-controller/src/client`、`api/workspace-controller/src/client`、`client/store/src`、`client/ui-slots`、`client/ui-session`、`workspace/workspace/src`、`session-query/session-query/src`）；
  - 判断"平台是否支持某能力"（如按 id 销毁会话）时：先全文检索 API/事件/RPC，确认存在再实现；不存在则如实说明，采用平台约束内的替代方案（如墓碑过滤）。
- 本插件为 TS 源码 + 构建产物：改完必须 `npm run typecheck` + `node scripts/build.mjs` + `node --check` lib 产物。浏览器半（`src/client/`）改完重建 `lib/client.js` 并重启 dsh 验证实例；宿主半（`src/index.ts`）改完重建 `lib/index.js` 并重启 dsh。
