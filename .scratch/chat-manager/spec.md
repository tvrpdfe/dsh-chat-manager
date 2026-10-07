Status: ready-for-agent

# DSH 会话管理插件（工作区/聊天双区域 + 删除会话 + 已归档会话管理）

## Problem Statement

DSH Web 界面的左侧边栏把所有会话混在单一工作区浏览器里：临时聊天与会话的文件读写工作区共用一套分组视图，聊天会话没有专属的磁盘归属（用户希望默认落在系统"文档"目录下按日期组织的文件夹里），会话无法删除（只能重命名/分叉/归档），已归档会话也没有任何查看、恢复或删除的入口。用户需要：

1. 把左侧边栏拆成「工作区」与「聊天」两个区域，工作区保持现有全部行为，聊天区以同样视觉风格承载聊天会话；
2. 「新建会话」按钮能感知当前焦点（工作区 / 聊天会话 / 无焦点）并把新会话开进对应区域；
3. 聊天会话默认落在跨平台的文档目录 `文档/DSH/年-月-日/xxxx/` 下，`xxxx` 由第一句话生成的英文短描述命名；
4. 两个区域的会话菜单都能「删除会话」（红字、二次确认）；
5. 设置面板新增「已归档会话」栏目，可恢复与删除，归档集合沿用 DSH 现有机制。

第一版以动态 Cordis 插件交付时，因自绘 UI 替换内置浏览器，出现了交互失效（点击会话无响应、无法收起）、视觉风格劣化（图标丢失/变化、菜单项重复 3–4 遍、悬停焦点串扰）、归档列表全部显示"未命名会话"等问题，用户已将其删除。本 spec 覆盖修复后的最终行为与实现路径。

## Solution

在工作区区域**原样保留** DSH 内置的 WorkspaceBrowser 组件（字节级拷贝后做最小外科修改，仅新增一项"删除会话"菜单与对应确认框），在其下方新增一个使用同一套 CSS 与行组件的「聊天」区；工作区区域过滤掉聊天会话及其日期文件夹（保持原有观感）。宿主端新增本地插件，提供聊天根目录、日期文件夹创建、聊天搜索、删除会话、恢复会话、归档列表（带真实标题）等能力，经 `webServer` 注册的 `/api/chat-manager/*` 路由供浏览器端调用。设置面板通过 `settings.section` 槽位新增「已归档会话」页。删除/恢复后**不整页刷新**：以 `sessions.refresh()` 重拉基线 + 本地墓碑过滤保证列表一致（见「一致性收尾」）。

## User Stories

1. As a 用户，I want 左侧边栏拆分为「工作区」和「聊天」两个区域，so that 文件读写会话与临时聊天各归其位、互不干扰。
2. As a 用户，I want 工作区区域与改造前**完全一致**（分区头、搜索、视图选项、添加工作区、展开/收起、点击打开、悬停卡片、拖拽排序），so that 现有使用习惯不受影响。
3. As a 用户，I want 工作区区域每个会话的「⋯」菜单在原"重命名/分叉/归档"之后多一项红色「删除会话」（垃圾桶图标），so that 我能直观识别并执行破坏性操作。
4. As a 用户，I want 点击「删除会话」弹出二次确认对话框（说明保留文件夹边界），so that 误触不会直接销毁会话。
5. As a 用户，I want 删除会话后该会话从工作区/聊天区/归档集合中消失且日志被移除，so that 会话真正被清理。
6. As a 用户，I want 删除会话时其文件夹保留在磁盘上，so that 会话产生的文件产物不因删除会话而丢失。
7. As a 用户，I want 聊天区拥有与工作区一致的视觉风格（同样的分区头、行高、状态点、悬停卡片、菜单），so that 界面观感统一。
8. As a 用户，I want 聊天区支持搜索（仅搜索聊天会话的标题+内容），so that 聊天多起来后我能快速定位。
9. As a 用户，I want 聊天区支持「添加聊天」，so that 我能随时开一个新聊天会话。
10. As a 用户，I want 聊天区的聊天会话按最新对话排序，so that 最近聊的排在最前。
11. As a 用户，I want 聊天区每个聊天会话的菜单同样提供重命名/分叉/归档/删除会话（删除为红色+垃圾桶），so that 两个区域能力一致。
12. As a 用户，I want 焦点在某个工作区时点「新建会话」把新会话开进该工作区，so that 延续当前工作上下文。
13. As a 用户，I want 焦点在某个聊天会话时点「新建会话」把新会话开进聊天区，so that 延续聊天上下文。
14. As a 用户，I want 无焦点（无当前会话）时点「新建会话」默认开进聊天区，so that 默认行为可预期。
15. As a 用户，I want 新建聊天会话时系统自动在文档目录创建 `DSH/年-月-日/` 日期文件夹并作为该会话的工作目录，so that 我不需要手动选目录。
16. As a Windows/Linux/macOS 用户，I want 聊天根目录解析为各自平台的"文档"目录，so that 跨平台行为一致。
17. As a 用户，I want 发送第一句话后系统在该日期文件夹下生成一个 2–4 个英文小写单词（连字符分隔）的 `xxxx` 子文件夹，so that 每个聊天有专属的产物文件夹。
18. As a 用户，I want slug 名称由 LLM 根据第一句话生成、失败时用本地规则回退（保证一定生成），so that 文件夹名贴切且流程不中断。
19. As a 用户，I want 聊天会话的代理默认把文件读写放到该 slug 子文件夹，so that 聊天产生的文件集中有序。
20. As a 用户，I want 日期文件夹不显示在工作区区域，so that 工作区不被聊天机制产生的条目污染。
21. As a 用户，I want 归档操作沿用 DSH 现有归档集合且归档会话保留原账目位置，so that 恢复时能回到原位。
22. As a 用户，I want 设置面板新增「已归档会话」栏目并列出每个已归档会话的**真实标题**，so that 我能分辨哪个是哪个。
23. As a 用户，I want 已归档会话支持「恢复」（回到原工作区位置），so that 误归档可以撤销。
24. As a 用户，I want 已归档会话支持「删除」（走完整删除流程），so that 归档列表可以清理。
25. As a 用户，I want 菜单项只出现一次、不随悬停移动焦点、文字前保留原图标，so that 菜单行为与内置一致。
26. As a 用户，I want 所有新增文案同时提供中文与英文，so that 切换语言后界面完整。
27. As a 用户，I want 删除或恢复后界面状态与磁盘一致，so that 我不会看到指向已删除会话的死行。

## Implementation Decisions

### 交付形态（决策 1 的演进）

- 动态插件方案被废弃（自绘 UI 无法达到视觉/交互一致性，插件已被用户删除）。改为**固化进宿主组合的 bundle 插件**：插件包声明 `dsh.bundle`（随包分发 `cordis.patch.yml`：禁用内置 `ui-workspace` 行、插入 `ui-chat-manager`），`dsh plugin add/install` 自动把它注册进 profile 的 `dsh.profile.bundles` 层栈，用户无需编辑补丁层；宿主半 `lib/index.js` + 浏览器半 `lib/client.js` 经 profile 的 pnpm 依赖（`link:` 或 `workspace:*`）安装。
- 浏览器半是内置 `@deepseek-ai/dsh-client-ui-workspace` 客户端源码的 **TS/TSX 分叉**（`src/client/` 从 DSH 源码检出拷贝，分叉改动见下），以 esbuild 构建为 `__ModuleLoader__.load` 工厂 bundle（仅 require 平台种子词：react/jsx-runtime、cordis、dsh-client-store、dsh-client-ui-primitives；CSS Modules 转为哈希类映射 + 工厂执行时样式注入——哈希固定以字母 `m` 前缀开头，保证 `.mXXXXXX_*` 选择器合法，数字开头的十六进制哈希会被 CSSOM 整条丢弃导致界面无样式），因此 CSS、图标、行组件、菜单行为与内置版本天然一致。代价是后续 DSH 升级不会自动跟随上游视觉，需要时可从 `packages/client/ui-workspace/src/client/` 重新签到一次（保留插件改动：`addon/`、`locales.ts` 追加键、`contract/slots.ts` 注入面、`rows/Rows.tsx` 删除菜单项、`rows/WorkspaceBrowser.tsx` 分栏/聊天区、`tree.ts` excludedSessionIds、CSS 追加类）。宿主同为 TS 源码（`src/index.ts`）构建输出。
- 0.2.x 已不再需要旧的 `@deepseek-ai/dsh-client-ui-workspace` no-op shim：客户端分叉自带 `contract/slots.ts` 与槽注册，不使用旧 shim；client-modules 的 bundle purity 门禁禁止跨插件 value import，其余行声明的 ui-workspace inject 边仅作到达元数据，分叉注册自己的同名模块即可。

### 客户端：分叉改动清单

1. **会话菜单加项（槽条目化）**：删除项不再是 `Rows.tsx` 的硬编码改动，而是新增 `session-actions/DeleteSession.tsx` 并注册进 `sidebar.workspaces.session.menu.item`（`id: 'delete'`、`order: 500`、`danger`、`IconTrashOutlineRegular`）；`rows/Rows.tsx` 因此与上游 0.2.x 逐字节一致。
2. **接线删除**：二次确认框注册进 `shell.overlay`（`SessionDeleteConfirmDialog`，请求/settle/in-flight 随请求生命周期，与菜单条目共享同一请求 store）；确认后走 `performSessionDelete`（宿主路由 → 写墓碑 → `sessions.refresh()` → 重取聊天状态，**不整页刷新**，见「一致性收尾」）。
3. **聊天区**：`addon/ChatSection.tsx` 渲染在工作区分栏的相邻窗格（`WorkspaceBrowser` 的 `.split`/`.pane`/`.divider`，仅 `wide` 状态，分隔条可拖拽）。复用 `sectionHeader`/`sectionLabel` CSS 与 `SessionNodeItem` 行组件（含同一套槽驱动菜单）；分区头含「聊天」标签、搜索框（防抖、本地标题过滤 + 宿主内容搜索）、「新建聊天」按钮（`IconPlusOutlineRegular`）；列表 = cwd 位于聊天根目录下、未归档、非空白（或当前空白）的会话，按 `updatedAt` 降序。
4. **工作区过滤**：`tree.ts` 的 `groupByWorkspace`/`deriveGroups`/`deriveFlat` 新增 `excludedSessionIds`（聊天会话 ∪ 删除墓碑），`WorkspaceBrowser` 把它透传给 `SessionTree`/`FlatList`/`SearchResults`；日期文件夹工作区由 `orderedWorkspaceAreaWorkspaces` 排除，`ungroupedMemberIds`/`flatMemberIds` 按同一集合过滤。
5. **文案**：`workspace` 命名空间字典（zh/en）追加删除、聊天区、聊天搜索等键；设置页归档列表与其弹窗使用插件自有 `chatManager` 命名空间。

### 客户端：数据与交互机制

- **注入面扩展**：注册选项沿用内置的 `children`（`sidebar.workspaces.directoryFlow`）、`store`（`createWorkspaceViewStore`）、`locale: "workspace"`；`inject` 在保留全部内置动作（startSession/open/searchSessions/renameSession/forkSession/renameWorkspace/deleteWorkspace/insertWorkspaceBefore/archiveSession/insertSessionBefore/createWorkspace/hooks.directoryFlow）之外，追加：`deleteSession`、`chatSearch`、`startChat`、`hooks.chat`（`{root, folders, archived}` 状态源，经 fetch 刷新）。
- **新会话焦点路由（决策 2）**：`UiWorkspaceService.installChatRouting` 包装 `ctx.uiWorkspace.startSession`（dispose 时还原；新版 Workspace 导航能力已从 `workspaces` 服务迁至 `uiWorkspace` 服务）。参数非空→原样透传；参数为空时读取包内运行时镜像（当前会话 id + 聊天会话 id 集合，由浏览器渲染期维护）：当前会话是普通工作区会话→原样（内置"继承当前会话工作区"语义即满足"焦点在工作区"）；当前是聊天会话或无焦点→先 `ensure-date-folder` 拿到日期文件夹 workspaceId，等客户端 workspace 流可见后再以它调用原实现；并发点击用 in-flight 标志去重，失败回退原实现。
- **跨端调用（宿主↔浏览器 RPC）**：宿主经 `ctx.webServer.register` 注册 exact 路由，浏览器半直接 `fetch` 同源 `/api/chat-manager/*`（JSON）。路由契约：
  - `GET /api/chat-manager/state` → `{ documentsRoot, dshRoot, folders: { [sessionId]: { slug, folder } }, archived: [{ sessionId, title, workspaceTitle, updatedAt }], hostStartedAt }`（`workspaceTitle` 由宿主按 `workspaceRegistry.list()` 账目解析，客户端免依赖槽位标准钩子；`hostStartedAt` = 本宿主进程的启动时刻（`Date.now() - process.uptime()`），客户端不用它，它让「重启后仍然如此」这类断言有进程级依据——否则同一条磁盘状态在没重启时也能全绿）
  - `POST /api/chat-manager/ensure-date-folder` → `{ workspaceId, dateFolder }`（幂等；日期文件夹即"聊天工作区"，用 `workspaceRegistry.resolveByPath`/`create` 注册）
  - `POST /api/chat-manager/search-chats` `{ query }` → `{ items: [{ sessionId, title }] }`（仅聊天会话——cwd 在聊天根下、非归档、非 subagent；标题子串与宿主内容命中取**并集**）
  - `POST /api/chat-manager/delete-session` `{ sessionId }` → `{ ok: true }`
  - `POST /api/chat-manager/restore-session` `{ sessionId }` → `{ ok: true }`
- **一致性收尾**：wire 没有"会话移除"帧，但客户端 `sessions.refresh()`（公开方法，重拉 `session.list` 基线）可清除已删**冷**会话的死行；**活跃（attached）会话**会一直留在宿主基线里（平台无公开的销毁会话 API），因此客户端另设**墓碑过滤器**：删除成功后把 id 写入 `localStorage`（`dsh-chat-manager.deletedSessionIds`），工作区/聊天区/搜索结果全部按「聊天 id ∪ 墓碑 id」过滤；当基线（`phase === 'ready'`）不再包含某墓碑 id 时（即进程重启后删除真正完成）自动清除该墓碑。工作区、聊天区、归档页三处删除均**不再整页刷新**，统一走「RPC 成功 → 写墓碑 → `sessions.refresh()` → 重取状态/归档列表」。

### 宿主端

- **文件面**：宿主半是常规 Node 插件，直接使用 `node:fs/path/os` 与 `node:child_process`（不再走子进程脚本）。跨平台文档目录：Windows `powershell GetFolderPath('MyDocuments')`、Linux `xdg-user-dir DOCUMENTS`、macOS `~/Documents`，缓存结果。
- **聊天文件夹登记**：每个日期文件夹内写 `.dsh-chat.json`（`{ "sessions": { [sessionId]: { slug, folder } } }`，带 `sessions` 包装以便将来扩展元数据；读侧对无包装的旧形状不兼容），启动时扫描 `DSH` 根重建登记表；删除会话时清理对应条目，文件夹本身保留（决策 4）。
- **首句 slug（决策 2/3）**：监听 `session/event`，命中"会话 cwd 位于 DSH 根下 + 首个用户消息 + 尚未登记"时，用 `llm.stream`（模型取 `agentDefaultModel.currentSelection()`）把第一句话生成 2–4 个英文小写单词的连字符 slug；生成中按会话 id 做 in-flight 去重（该会话的后续用户消息在生成完成前不再触发；成功/失败/超时均清除），避免 15s LLM 窗口内的重复生成；失败（无模型/异常/超时）时用本地规则回退（取首句切词，去标点、小写、截断，与 LLM 结果共用同一 `cleanSlug` 收口：不足 2 词用固定 `session` 补齐、上限 4 词），保证 2–4 词范围且目录一定生成；目录名冲突时 `uniqueSlug` 的计数候选同样收在 2–4 词内（末词让位计数，如 `a-b-c-d` 冲突 → `a-b-c-2`）；成功后 mkdir + 写 `.dsh-chat.json`。
- **代理指引**：`systemPrompt.section` 注册一节（order 150），告知代理：聊天会话的文件读写工作区是 `日期文件夹/slug/`，而非会话 cwd 本身。
- **归档集合（决策 5）**：继续使用 workspace 存储域的 `archivedSessionIds`（全局状态），恢复 = 从集合摘除（保留账目位置，天然"回到原位"）；`/state` 路由每次实时读取该集合（无缓存，无需对账监听）。**恢复走平台公开的 `workspaceRegistry.unarchiveSession(id)`**（与平台自带「取消归档」同一个实现、同一条注册表操作写链）：早先的实现直接调 `registry.setState`/`requireState`（TS 私有成员，运行时可用）自行拼状态，绕过了注册表的操作队列——与并发的归档/置顶/工作区增删交错时会互相覆盖（整份状态后写者胜），极端时序下还会把 `workspaceIds` 与表不一致的状态落盘，令下次启动 `validateStoredState` 直接拒绝启动。公开方法字段语义逐字等价（`archivedSessionIds.filter(id => id !== sid)`）且串行化在写链里，无理由自绘。
- **删除会话（决策 4 语义）**：宿主路由按序执行——① 定位并删除持久化工件：`sessionPersistence.list()` 的条目是 snapshot，**id/cwd 在 `snapshot.header` 上**（`snapshot.id` 不存在，曾因此永远匹配不到、静默不删却回 200），未命中时再用公开 API `stat(id)` 复查；`locate(snapshot.header)` 给的是**当前格式**的文件名（`session.v4.jsonl.zstd`），而迁移过的会话目录里留的是旧世代（`session.jsonl.zstd` + `session.v3.jsonl.zstd`），所以持久化单位取**会话目录** `<root>/<slug>/<session-id>`（校验 `basename(dirname(artifact)) === sid` 后整目录递归删除；退化为删单文件时若目录里还剩兄弟世代即 500）；删除前**无条件**先 `flush()`（目录存在并不证明没有 pending 写入：活跃会话关机时的 flush 会把刚删掉的日志重建出来）；删后 `existsSync` 复核，删不掉即 500。只有 `list()` 与 `stat()` 都查不到该会话时才判定「平台不认识它」，此时**还要复查宿主是否仍以活性句柄持有它**（`ctx.get('sessions')?.get?.(id)`，平台自己的 Session 存储服务、公开读取，与 `workspaceRegistry.sessionKnown` 同源）：仍持有 ⇒ 500。**这一格的准确边界**（初版注释曾写错，已纠正）：jsonl 后端会把「本进程创建但未落盘」的会话（pending tracker）补进 `list()` 与 `stat()`，所以**未落盘的活跃会话不会走到这里**——它落到工件分支，由「后端声称有存储会话却拿不出工件」那条 500 拦住；本守卫真正覆盖的是**列表看不见、但宿主仍持有**的会话：工件在进程存活期间被带外删除，或工件头损坏/格式版本更高而被 `list()` 跳过。两者都必须 500 而不是清账目回 200，因为活跃写句柄还能把工件写回来——界面与磁盘就此不一致。两条 500 的文案统一带「重启宿主后重试」的处置建议。只有「持久化列表没有 + 宿主内存也没有」的幽灵 id（例如日志早已不在的归档行）才清账目回 200（另打一条告警）。「后端声称有存储会话却拿不出工件」一律 500 —— 绝不「告警 + 200」，因为客户端拿到 200 就会写墓碑隐藏该行、而日志仍在：界面与磁盘不一致，且墓碑因基线仍含该 id 永不清除；② 对每个仍列出该 id 的工作区记录调用 `workspace.detachSession(id)`（注册表实体方法，正规记账，账目席位**移除**）；③ **尽力取消置顶**：`workspaceRegistry.unpinSession(id)`（公开方法、无存在性检查；删除不置顶会在 `workspace.json` 的 `pinnedSessionIds` 留一条悬空 id——当前无外显影响，因为置顶排序的成员表由当前列表/账目派生，所以这里失败只告警，绝不因一条惰性残留把「日志已删成功」的请求变成 500）；④ 清理 `.dsh-chat.json` 登记；⑤ **尽力清理平台投影缓存**：`storageDomain.get('session_projcache').table('sessions').delete(id)`（该缓存域无清理路径、行非权威且 identity 绑定，失败仅告警）；⑥ **最后**从归档集合摘除（经 `workspaceRegistry.unarchiveSession` 的注册表写链，触发 workspace-controller 的 `archived` 增量帧）。聊天文件夹保留。**取消归档放在最后**：步骤①–②失败即整体 500（此时归档集合、账目、置顶全未动，杜绝"删失败却回到工作区"）；步骤③–⑤为尽力而为（失败仅告警，因为日志已经删掉，让一条惰性残留把成功变成 500 只会把行留在界面上）；步骤⑥失败仍回 500，但日志与账目都已处理完，用户重试即走「幽灵 id」分支清账目。
- **归档列表标题（修复问题 4）**：`sessionQuery.readTitleSnapshots(ids)` 读取真实标题（含默认生成的会话名），缺失者回退标题占位；列表项展示标题与最近更新时间。

### 设置页

- 通过 `settings.section`（list，additive）注册 `id: "chat-archived"`、`order: 25`、label 跟随语言；页面内为每条归档会话提供「恢复」与「删除」（删除二次确认），操作成功后无需整页刷新（见一致性收尾）。
- 展示格式为「工作区名：会话名」：工作区名由宿主 `/state` 按 `workspaceRegistry.list()` 的 `sessionIds` 账目解析后随行下发（归档会话保留账目席位），无账目者仅显示会话名。
- **相对时间显示（r8 修复）**：每条归档会话展示会话自身最近更新时间（来自 `/state` 的 `updatedAt`）的相对文案（刚刚 / N 分钟 / N 小时 / N 天 / N 个月 / N 年），经 `t("time.now")` / `` t(`time.${unit}`, {n}) `` 生成。键位于页面绑定命名空间 `chatManager`：locale 回退链（active → 该 NS zh → common → **原样返回键名**）意味着缺键会渲染字面量（此前出现 `time.days` / `time.minutes`），r8 为 chatManager 字典补齐 zh/en 各 6 个 `time.*` 键（不含 `time.ago`；文案与 workspace 字典同源）。

### 客户端：区域布局与状态

- **左右上下的分栏**：工作区列表与聊天区装入一个可拖拽分割容器——默认各占 50%，分隔条拖拽调整（每侧最小约 80px，即分区头 + 约 1 条会话行），两侧各自滚动（复用内置 `.list` 滚动区域）。
- **聊天区搜索**：与工作区头部同一套可展开搜索控件（图标按钮 → 展开输入框、外部点击收起、Esc 清空收起、标签隐藏动画、清除按钮）。
- **会话状态**：聊天区行经 `sessionNode(summary, descendants)` 映射（与内置列表同源），状态点与内置列表完全一致（进行中/空闲/已完成/等待审批等），不再出现"已结束仍转圈"。
- **归档过滤**：聊天区列表排除已归档会话与 subagent 子会话（与内置 `sessionVisible` 语义一致）。

## Testing Decisions

**好测试的定义**：只验证外部可观察行为（视觉、点击、菜单、确认框、磁盘落盘、标题显示），不依赖内部实现细节（组件函数名、存储格式、路由路径均可在不破坏测试的情况下重构）。

**测试缝（seam）**：
- 主缝 = Web GUI 手工验收清单（与内置行为逐项对照）：工作区区域的全部既有操作（搜索/视图/添加/展开收起/点击打开/悬停/拖拽）在 fork 后必须与改造前逐一一致；新增项仅限会话菜单中的「删除会话」。
- 次缝 = 宿主路由：重启后可用 `curl http://127.0.0.1:3080/api/chat-manager/state` 等直测响应 JSON；文件落盘用磁盘断言（日期文件夹、slug 子文件夹、`.dsh-chat.json`、日志工件移除、聊天文件夹保留）。
- 真机缝 = headless Chrome（CDP），探针都在 `.scratch/`：`accept2-regress.mjs` 探启动（无失败页、双区域、零 console 错误、视图 store 无自馈重写）、`accept3-boot-chat.mjs` 探启动+双区域（工作区/聊天同时渲染、分栏与拖拽条）、`accept3-settings.mjs` 探设置-已归档会话页（真实相对时间文案、页面文本无 `time.*` 键名泄漏）、`accept3-routes.mjs` 探宿主路由（`/api/chat-manager/*` 在页面上下文 fetch）、`accept3-menu-pin-hover.mjs` 探行内动作与置顶/取消置顶；全部共享 `accept2-lib.mjs` → `tools/cdp-lib.mjs`（启动/连接/求值/清理——等 stderr 管道关闭后再删临时 profile，`%TEMP%\dsh-cdp-*` 残留必须为 0）。删除类断言见验收项 2/3 里点名的三个探针，归档恢复见验收项 4 的 `accept8-restore.mjs` + `accept8-phase2.mjs`，删除的诚实边界（活跃拒绝 / 重启后幽灵行可删）见验收项 4b 的 `accept9-live-guard.mjs` + `accept9-phase2.mjs`。**探针夹具纪律**：删除路由第 ④ 步会改写**实盘聊天根**（不随 `DSH_HOME` 隔离）的 `.dsh-chat.json`，所以删除类探针的夹具必须是探针自建的聊天会话（当前空白聊天 + 一轮真实对话，事后删掉自己的空文件夹）——拿复制来的真实聊天会话当夹具会摘掉用户的登记。

**验收清单（按用户故事 2/4/5/11/21-24/27 编排）**：
1. 新建聊天→发送第一句→磁盘出现 `文档/DSH/YYYY-MM-DD/xxxx/` 与 `.dsh-chat.json`；日期文件夹不出现在工作区。
2. 工作区会话菜单含红色「删除会话」（垃圾桶图标），其余菜单项图标、顺序、悬停行为与改造前一致且不重复；**菜单对真实鼠标可用**：指针从「…」滑向列表的整个过程菜单保持锚定在触发按钮下方（不跳到视口左上角、不因 `closeOnPointerLeave` 提前关闭），可直接点中任一项（`.scratch/accept5-menu-mouse.mjs` 自动断言）。
3. 删除会话（**行菜单**与设置页各一次）：确认框出现→确认后行**立即消失且无整页刷新**、**会话目标录被真正移除**、聊天文件夹仍在磁盘；**再手动刷新页面，行仍不出现**（墓碑过滤）；**重启宿主后仍不出现**（持久化 —— 行菜单路径 = `.scratch/accept7-row-menu-delete.mjs` + `accept7-phase2.mjs` 两阶段；设置页路径 = `accept6-delete-durable.mjs` + `accept6-phase2.mjs`）。
4. 归档→设置页「已归档会话」显示该会话**真实标题**；恢复→回到原工作区位置、**账本立即不含该 id**、日志目录逐文件未被触碰（与恢复前清单逐项比较）、**重启宿主后仍在原位且不再出现在归档列表**（`.scratch/accept8-restore.mjs` + `accept8-phase2.mjs` 两阶段，阶段二断言宿主启动时刻已变）；删除→归档列表与磁盘日志均消失。
4b. **删除的诚实边界**（`.scratch/accept9-live-guard.mjs` + `accept9-phase2.mjs` 两阶段）：把当前活跃会话的日志带外删除后，设置页点「删除」必须**被拒**（对话框留在原地并显示宿主的处置建议、行仍在归档列表、账本与置顶集不动、客户端不写墓碑）；重启宿主后同一条**幽灵行**（账本在列、磁盘与宿主内存都无）必须能删掉——账本摘除、日志仍不在、对话框无错误关闭。
5. 三种焦点下的「新建会话」路由各自落点正确。
6. 聊天区搜索命中仅聊天会话（标题与内容），聊天区列表按最新对话排序。
7. zh/en 切换后新增文案完整。
8. 设置-已归档会话页显示真实相对时间（刚刚 / 1天 / 23分钟…），无 `time.days` 类字面量键名（`.scratch/accept3-settings.mjs` 自动断言）。

**Prior art**：本项目此前验证过的路径 —— 用户实测产生的 `D:\Documents\DSH\2026-08-15` 与空白会话（cwd 冻结为日期文件夹）证明宿主链路正确，可作为回归基线。

## Out of Scope

- 聊天区拖拽排序（v1 不做）。
- 归档**动作**时间戳（归档集合是纯 id 数组、无归档动作时间；列表展示的是会话自身最近更新时间——已实现，含 r8 相对时间文案，见 L86 与设置页）。
- 模糊内容搜索与事件深链接（沿用内置的字面匹配能力）。
- 删除会话的撤销/回收站。
- fork 随上游 DSH 升级自动同步（维护性任务，另行处理）。
- 多用户鉴权与远程部署加固（本插件面向本地单用户部署）。

## Further Notes

- **领域词汇**见 `CONTEXT.md`（工作区/工作区会话/聊天会话/聊天区/聊天文件夹/日期文件夹/归档集合/删除会话/已归档会话栏目）；**命名时序 ADR** 见 `docs/adr/0001-chat-folder-naming.md`。
- 已知限制：**空白会话的行内动作不可达** —— 上游 `Rows.tsx` 对 `blank` 行整条隐藏动作条（`{!row.blank && <span className={css.rowActions}>…}`），菜单触发按钮也在其中，所以「新建聊天」刚产生、尚未产生任何轮次的会话无法从其行菜单删除；此时可发送第一句使之非空白，或 `Ctrl+Alt+A` 归档后从设置页「已归档会话」删除（`accept6` 覆盖的正是这条路径）。这是内置行为，插件不改分叉。
- 已知限制（活跃会话的次生风险）：活跃（attached）会话被删后，其宿主内存句柄仍在，**继续在该会话里对话/跑轮次时新事件写不回磁盘**——日志目录已不存在，后端的追加路径是 `open(path,'a')`（父目录不重建），于是事件留在内存缓冲、宿主只打告警，宿主重启后这些轮次不复存在。插件不代平台停止会话，也不强迫用户切走当前对话（平台没有"按 id 销毁会话"的公开 API，见平台约束）；**不会**因此让日志复活（已落盘句柄的 `flush()` 是早退）。同理：`list()`/`stat()` 都查不到但宿主仍持有的会话现在直接 500（见删除路由第 ① 步的活性守卫），文案提示重启宿主后重试。
- 已知限制（跨平台）：Windows 的写租约是命名内核信号量、**目录里没有锁文件**，整目录删除即完整移除持久化足迹；POSIX 的 `session.lock` 会随目录一并删除（平台注释假设"没有任何东西会删掉活跃会话的锁文件"），所以插件在 Linux/macOS 上删除活跃会话会连带放弃该会话的跨进程写互斥。真要跨平台部署时，应先把该会话停成非活跃（或先重启宿主）再删。
- 已知限制：活跃（attached）会话被删后，其宿主内存态会保留到进程重启（平台无公开销毁 API）；期间由客户端墓碑过滤器在所有聊天管理器列表隐藏该行，重启后基线不再列出、墓碑自动清除、删除真正完成；`.dsh-chat.json` 为自描述登记，损坏或缺失时扫描自动重建。**磁盘侧不再有此限制**：删除路由现在真的移除会话目录并复核（若工件被占用删不掉，则请求 500 而非谎报成功，客户端不写墓碑、行保持可见）。
- 平台投影缓存 `~/.dsh/storages/session_projcache.json`（`session_projcache` 域）为每个会话写一次检查点、**本身无清理路径**，已删会话的行由删除路由第 ④ 步尽力清理；活跃会话在进程关闭时会被平台 detach 检查点写回一次（插件无法拦截），重启后不再产生。该缓存非权威、读取按 identity 绑定，残留行永不外显、不影响任何列表。
- **DSH 源码参照**：`F:\workdir\deepseek-harness` 为官方源码检出（用户提供），内置组件与服务行为以它为权威——组件树/CSS/菜单见 `packages/client/ui-workspace/src/client/`；平台 API 与不变量见 `session/session-persistence*/src`、`session/session-projection-cache/src`、`core/session/src`、`core/agent/src`、`host/apiproxy/src/api-proxy.ts`、`workspace/workspace/src`、`client/runtime/src/client/sessions/`。排查"平台是否支持某能力"（如按 id 销毁会话）先全文检索源码确认，不存在则采用约束内替代方案。
- 组合层细节：禁用 `ui-workspace` 后，目录选择器包的引导图 inject 边仍指向该模块，但 0.2.x 已不再需要该 shim——客户端分叉自带 `contract/slots.ts` 与槽注册，不使用旧 shim；`ensure-date-folder` 的 workspaceId 在客户端有按路径匹配的兜底解析（兼容宿主进程未重启时的旧代码）。
- 安装已按 AGENTS.md 取得用户确认；改动落在用户档案补丁层（`~/.dsh/profiles/web/`），不触碰发行版内置安装。
