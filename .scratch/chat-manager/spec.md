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
- 客户端分叉不再携带旧的 `@deepseek-ai/dsh-client-ui-workspace` no-op shim：client-modules 的 bundle purity 门禁禁止跨插件 value import，其余行声明的 ui-workspace inject 边仅作到达元数据，分叉注册自己的同名模块即可。

### 客户端：分叉改动清单

1. **会话菜单加项**：`SessionNodeItem` 的 `sessionMenuItems` 数组追加 `{id:"delete", label: t("menu.deleteSession"), icon: IconTrashOutline16, danger: true}`；`onSelect` 增派 `delete`；组件新增 `onDelete` prop。
2. **接线删除**：`FlatList`、`SessionTree` 透传 `onDelete`；`WorkspaceBrowser` 持有删除目标状态并渲染确认 Modal（复用内置"删除工作区"确认框的样式与红色按钮变体），确认后调用注入的 `deleteSession(sessionId)`，成功后**不刷新页面**（写墓碑 → `sessions.refresh()` → 重取聊天状态，见「一致性收尾」）。
3. **聊天区**：在 `WorkspaceBrowser` 根节点内、工作区列表下方渲染 `ChatSection`（仅 `wide` 状态）。复用 `sectionHeader`/`sectionLabel` CSS 与 `SessionNodeItem` 行组件；分区头含「聊天」标签、搜索框（防抖、本地标题过滤 + 宿主内容搜索）、「添加聊天」按钮（`IconPlusOutline16`）；列表 = cwd 位于聊天根目录下、未归档、非空白（或当前空白）的会话，按 `updatedAt` 降序。
4. **工作区过滤**：`SessionTree` 的 `workspaces` 入参排除 cwd 位于聊天根目录下的工作区（日期文件夹）；`FlatList` 与 `SearchResults` 新增 `excludeIds`/过滤 prop，排除聊天会话。
5. **文案**：`workspace` 命名空间字典（zh/en）追加删除、聊天区、聊天搜索等键。

### 客户端：数据与交互机制

- **注入面扩展**：注册选项沿用内置的 `children`（`sidebar.workspaces.directoryFlow`）、`store`（`createWorkspaceViewStore`）、`locale: "workspace"`；`inject` 在保留全部内置动作（startSession/open/searchSessions/renameSession/forkSession/renameWorkspace/deleteWorkspace/insertWorkspaceBefore/archiveSession/insertSessionBefore/createWorkspace/hooks.directoryFlow）之外，追加：`deleteSession`、`chatSearch`、`startChat`、`hooks.chat`（`{root, folders, archived}` 状态源，经 fetch 刷新）。
- **新会话焦点路由（决策 2）**：`UiWorkspaceService.installChatRouting` 包装 `ctx.uiWorkspace.startSession`（dispose 时还原；新版 Workspace 导航能力已从 `workspaces` 服务迁至 `uiWorkspace` 服务）。参数非空→原样透传；参数为空时读取包内运行时镜像（当前会话 id + 聊天会话 id 集合，由浏览器渲染期维护）：当前会话是普通工作区会话→原样（内置"继承当前会话工作区"语义即满足"焦点在工作区"）；当前是聊天会话或无焦点→先 `ensure-date-folder` 拿到日期文件夹 workspaceId，等客户端 workspace 流可见后再以它调用原实现；并发点击用 in-flight 标志去重，失败回退原实现。
- **跨端调用（宿主↔浏览器 RPC）**：宿主经 `ctx.webServer.register` 注册 exact 路由，浏览器半直接 `fetch` 同源 `/api/chat-manager/*`（JSON）。路由契约：
  - `GET /api/chat-manager/state` → `{ documentsRoot, dshRoot, folders: { [sessionId]: { slug, folder } }, archived: [{ sessionId, title, workspaceTitle, updatedAt }] }`（`workspaceTitle` 由宿主按 `workspaceRegistry.list()` 账目解析，客户端免依赖槽位标准钩子）
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
- **归档集合（决策 5）**：继续使用 workspace 存储域的 `archivedSessionIds`（全局状态），恢复 = 从集合摘除（保留账目位置，天然"回到原位"）；`/state` 路由每次实时读取该集合（无缓存，无需对账监听）。
- **删除会话（决策 4 语义）**：宿主路由按序执行——① `sessionPersistence.locate(meta)` 定位日志工件并递归删除（空父目录一并清理）；② 对每个仍列出该 id 的工作区记录调用 `workspace.detachSession(id)`（注册表实体方法，正规记账，账目席位**移除**）；③ 清理 `.dsh-chat.json` 登记；④ **尽力清理平台投影缓存**：`storageDomain.get('session_projcache').table('sessions').delete(id)`（该缓存域无清理路径、行非权威且 identity 绑定，失败仅告警）；⑤ **最后**从归档集合摘除（经 `workspaceRegistry.setState` 的注册表写链，触发 `host/archived-sessions-changed` 帧）。聊天文件夹保留。**取消归档放在最后**：步骤①–②失败即整体 500；步骤③–④为尽力而为（失败仅告警）。任何失败都不会触碰归档集合，杜绝"删失败却回到工作区"。
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
- 真机缝 = headless Chrome（CDP）：`.scratch/cdp-boot-probe.mjs` 探启动/双区域/console 错误、`.scratch/cdp-verify.mjs` 探设置-已归档会话页（断言出现真实相对时间文案、页面文本无 `time.*` 键名泄漏）与侧边栏布局；两者共享 `tools/cdp-lib.mjs`（启动/连接/求值/清理——等 stderr 管道关闭后再删临时 profile，`%TEMP%\dsh-cdp-*` 残留必须为 0）。

**验收清单（按用户故事 2/4/5/11/21-24/27 编排）**：
1. 新建聊天→发送第一句→磁盘出现 `文档/DSH/YYYY-MM-DD/xxxx/` 与 `.dsh-chat.json`；日期文件夹不出现在工作区。
2. 工作区会话菜单含红色「删除会话」（垃圾桶图标），其余菜单项图标、顺序、悬停行为与改造前一致且不重复。
3. 删除会话（工作区与聊天区各一次）：确认框出现→确认后行**立即消失且无整页刷新**、日志工件被移除、聊天文件夹仍在磁盘；**再手动刷新页面，行仍不出现**（墓碑过滤）。
4. 归档→设置页「已归档会话」显示该会话**真实标题**；恢复→回到原工作区位置；删除→归档列表与磁盘日志均消失。
5. 三种焦点下的「新建会话」路由各自落点正确。
6. 聊天区搜索命中仅聊天会话（标题与内容），聊天区列表按最新对话排序。
7. zh/en 切换后新增文案完整。
8. 设置-已归档会话页显示真实相对时间（刚刚 / 1天 / 23分钟…），无 `time.days` 类字面量键名（`.scratch/cdp-verify.mjs` 自动断言）。

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
- 已知限制：活跃（attached）会话被删后，其宿主内存态会保留到进程重启（平台无公开销毁 API）；期间由客户端墓碑过滤器在所有聊天管理器列表隐藏该行，重启后基线不再列出、墓碑自动清除、删除真正完成；`.dsh-chat.json` 为自描述登记，损坏或缺失时扫描自动重建。
- 平台投影缓存 `~/.dsh/storages/session_projcache.json`（`session_projcache` 域）为每个会话写一次检查点、**本身无清理路径**，已删会话的行由删除路由第 ④ 步尽力清理；活跃会话在进程关闭时会被平台 detach 检查点写回一次（插件无法拦截），重启后不再产生。该缓存非权威、读取按 identity 绑定，残留行永不外显、不影响任何列表。
- **DSH 源码参照**：`D:\Downloads\deepseek-harness` 为官方源码检出（用户提供），内置组件与服务行为以它为权威——组件树/CSS/菜单见 `packages/client/ui-workspace/src/client/`；平台 API 与不变量见 `session/session-persistence*/src`、`session/session-projection-cache/src`、`core/session/src`、`core/agent/src`、`host/apiproxy/src/api-proxy.ts`、`workspace/workspace/src`、`client/runtime/src/client/sessions/`。排查"平台是否支持某能力"（如按 id 销毁会话）先全文检索源码确认，不存在则采用约束内替代方案。
- 组合层细节：禁用 `ui-workspace` 后，目录选择器包的引导图 inject 边仍指向该模块，浏览器 bundle 额外注册了一个同名空表面 shim 兜住该边；`ensure-date-folder` 的 workspaceId 在客户端有按路径匹配的兜底解析（兼容宿主进程未重启时的旧代码）。
- 安装已按 AGENTS.md 取得用户确认；改动落在用户档案补丁层（`~/.dsh/profiles/web/`），不触碰发行版内置安装。
