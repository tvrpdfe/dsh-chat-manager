# 项目初始化

本仓库 = DSH 会话管理插件（工作区/聊天双区域 + 删除会话 + 已归档会话管理）。新 agent 开工前先读本文件、`CONTEXT.md`（领域词汇）与 `docs/agents/`（工作流约定）。

## 项目概况

- 交付形态：**固化进宿主组合的 bundle 插件**——包声明 `dsh.bundle`（随包分发 `packages/dsh-chat-manager/cordis.patch.yml`：禁用内置 `ui-workspace` 行、插入 `ui-chat-manager`），`dsh plugin add/install` 自动注册进 profile 的 `dsh.profile.bundles` 层栈。浏览器半是内置 `ui-workspace` 客户端源码的 **TS/TSX 分叉**（`src/client/`，从 DSH 源码检出拷贝后做插件改动），视觉/交互与内置一致；配合 DSH 0.1.2-rc.1 / 0.1.3-alpha.1 的 client-modules 装载机制（`window.__ModuleLoader__.load` 工厂 + 平台种子词外部依赖）。
- 需求与验收：`.scratch/chat-manager/spec.md`；领域词汇：`CONTEXT.md`；命名时序决策：`docs/adr/0001-chat-folder-naming.md`。

## 仓库与部署拓扑

- 插件代码 `packages/dsh-chat-manager/`：源码 `src/`（宿主半 `src/index.ts`；浏览器半 `src/client/` = ui-workspace 分叉 + 插件 addon），构建产物 `lib/index.js`（ESM，webServer 路由 `/api/chat-manager/{state,ensure-date-folder,search-chats,delete-session,restore-session}`）与 `lib/client.js`（`__ModuleLoader__.load` 工厂 bundle，仅 require 平台种子词：react/jsx-runtime、cordis、dsh-client-store、dsh-client-ui-primitives）。
- 构建：`node scripts/build.mjs`（esbuild：宿主 ESM + 客户端工厂形态 + `.module.css` 哈希类映射/样式注入）；类型门禁 `npx tsc --noEmit`（devDependencies 为 0.1.2-rc.1 发布包类型，仅构建期使用）。**CSS 哈希类名固定以字母 `m` 前缀开头**：纯十六进制哈希经常以数字开头，`.0x1abc_*` 是非法 CSS 选择器，整张样式表会被浏览器丢弃（历史教训，勿改回）。
- 部署路径按 `dsh plugin add "link:..."` 经 profile 的 `node_modules` junction → 仓库目录：改仓库文件即对 dsh 生效，勿复制文件过去（验证用接缝：`dsh plugin --profile cmtest add "link:F:/workdir/dsh-chat-manager/packages/dsh-chat-manager"` 后 `dsh --profile cmtest --port <P> --no-open`）。
- 装配：profile 的 `dsh.profile.bundles` 层栈含 `dsh-chat-manager`（由 `dsh plugin add/install` 按 `dsh.bundle` 声明自动 reconcile）；用户层 `cordis.patch.yml` 已清空为 `[]`，不要再往里面加插件条目。
- 补丁层 `packages/dsh-chat-manager/cordis.patch.yml`（bundle patch）的 `# (reload marker rN: ...)` 注释保留为历史演进标注；新版下浏览器 bundle 的 rev 由服务端启动图重算，生效 = 重启 dsh + 浏览器强制刷新。
- 生效规则：浏览器半 → `node scripts/build.mjs` 重出 `lib/client.js` → 重启 dsh web（bundle rev 随启动图更新）+ Ctrl+F5；宿主半 → 重启 dsh 进程。

## 开发循环

1. 需求/验收变更先写进 `spec.md`（必要时同步刷新本文件与 CONTEXT.md 相关表述）。
2. 改 `src/client/`（ui-workspace 分叉）或 `src/index.ts` → `npm run build` → `npm run typecheck` → 重启验证实例 → CDP 探针。
3. 分叉同步：DSH 上游 ui-workspace 客户端源码升级时，把 `packages/client/ui-workspace/src/client/` 重新签到 `src/client/`（保留插件改动：`addon/`、`locales.ts` 追加键、`contract/slots.ts` 注入面、`rows/Rows.tsx` 删除菜单项、`rows/WorkspaceBrowser.tsx` 分栏/聊天区、`tree.ts` excludedSessionIds、CSS 追加类；另注意 `index.ts`（注册/注入接线）、`navigation.ts`（installChatRouting 新会话路由）两个基线文件的插件改动。全量对比产物在 `.scratch/std-fork-diffs/`，0 字节 diff = 该分叉文件与上游逐字节一致）。

## 验证纪律（提交前必须全绿）

- `npx tsc --noEmit`（`packages/dsh-chat-manager/`）零错误；`node --check` 两个 `lib/*.js`。
- `node scripts/build.mjs` 产出 lib 后，`lib/client.js` 的 require 集合必须全部落在平台种子词（react、react/jsx-runtime、cordis、dsh-client-store、dsh-client-ui-primitives、dsh-client-ui-slots），否则运行时模块表无法解析。
- 真机验证（headless Chrome，`$DSH_CHROME` 可覆盖路径）：共享 `tools/cdp-lib.mjs`（启动/连接/求值/清理——等 stderr 管道关闭后删临时 profile，检查 `%TEMP%\dsh-cdp-*` 残留为 0）。探针脚本放在 `.scratch/`：boot 探针（无失败页、双区域渲染、零 console 错误）、设置页探针（已归档会话 tab 注册、无 `time.*` 键名泄漏）、宿主路由探针（`/api/chat-manager/*` 在页面上下文 fetch）。
- 辅助：`tools/dump-css.mjs`（CSS 类名转储——对 `src/` 内 `.module.css` 使用）、`.scratch/` 探针脚本。

## Agent skills

### Issue tracker

本仓库的 issue 与 spec 以 Markdown 文件存放在 `.scratch/<feature>/` 下。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个规范 triage 标签（默认值）：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`。见 `docs/agents/domain.md`。

### DSH 源码参照

- DSH 官方源码检出位于 `F:\workdir\deepseek-harness`（用户为本项目下载的参考副本，与部署的发行版同源；当前目标版本 0.1.3-alpha.1，已发布运行基线 0.1.2-rc.1）。它是内置组件行为与平台 API 的**权威依据**，比 bundle 反推或记忆猜测可靠。
- **以下场景必须先查源码、再动手或下结论**：
  - 修改 fork 自内置的客户端分叉（`src/client/` 对应 ui-workspace）时：组件树、CSS 类名、菜单数组、状态机逻辑以 `packages/client/ui-workspace/src/client/` 为准；装载/外部化协议以 `packages/client/modules/`（client-modules）与 `packages/client/tsdown.client.ts` 为准；
  - 调用平台服务或排查平台行为时：方法签名、语义、不变量以对应包源码为准（常见：`api/session-controller/src/client`、`api/workspace-controller/src/client`、`client/store/src`、`client/ui-slots`、`workspace/workspace/src`、`session-query/session-query/src`）；
  - 判断"平台是否支持某能力"（如按 id 销毁会话）时：先全文检索 API/事件/RPC，确认存在再实现；不存在则如实说明，采用平台约束内的替代方案（如墓碑过滤）。
- 本插件为 TS 源码 + 构建产物：改完必须 `npm run typecheck` + `node scripts/build.mjs` + `node --check` lib 产物。浏览器半（`src/client/`）改完重建 `lib/client.js` 并重启 dsh 验证实例；宿主半（`src/index.ts`）改完重建 `lib/index.js` 并重启 dsh。
