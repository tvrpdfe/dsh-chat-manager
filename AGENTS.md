# 项目初始化

本仓库 = DSH 会话管理插件（工作区/聊天双区域 + 删除会话 + 已归档会话管理）。新 agent 开工前先读本文件、`CONTEXT.md`（领域词汇）与 `docs/agents/`（工作流约定）。

## 项目概况

- 交付形态：**固化进宿主组合的 bundle 插件**——包声明 `dsh.bundle`（随包分发 `packages/dsh-chat-manager/cordis.patch.yml`：禁用内置 `ui-workspace` 行、插入 `ui-chat-manager`），`dsh plugin add/install` 自动注册进 profile 的 `dsh.profile.bundles` 层栈。浏览器半是内置 `ui-workspace` 客户端 bundle 的字节级拷贝 + 外科补丁（`//#region dsh-chat-manager additions`），视觉/交互与内置一致。
- 需求与验收：`.scratch/chat-manager/spec.md`；领域词汇：`CONTEXT.md`；命名时序决策：`docs/adr/0001-chat-folder-naming.md`。

## 仓库与部署拓扑

- 插件代码 `packages/dsh-chat-manager/`：宿主半 `lib/index.js`（ESM，webServer 路由 `/api/chat-manager/{state,ensure-date-folder,search-chats,delete-session,restore-session}`）；浏览器半 `lib/client.js`（~3100 行，含 zh/en 字典与 CSS 模块类映射）。
- 部署路径 `C:\Users\<你的用户名>\.dsh\profiles\web\packages\dsh-chat-manager` 是 **junction** → 仓库目录：改仓库文件即对 dsh 生效，勿复制文件过去。
- 装配：profile 的 `dsh.profile.bundles` 层栈含 `dsh-chat-manager`（由 `dsh plugin add/install` 按 `dsh.bundle` 声明自动 reconcile）；用户层 `cordis.patch.yml` 已清空为 `[]`，不要再往里面加插件条目。
- 补丁层 `packages/dsh-chat-manager/cordis.patch.yml`（bundle patch）的 `# (reload marker rN: ...)` 注释是浏览器 bundle **rev 重哈希触发器**：浏览器半每次改动都要追加/更新标记，用户 **Ctrl+F5** 后新 bundle 才生效。
- 生效规则：浏览器半 → 标记 + Ctrl+F5；宿主半 → 重启 dsh 进程（模块缓存）。

## 开发循环

1. 需求/验收变更先写进 `spec.md`（必要时同步刷新本文件与 CONTEXT.md 相关表述）。

## 验证纪律（提交前必须全绿）

- `node --check`：两个 `lib/*.js` 与全部改动文件。
- **回归门禁** `node tools/test-patch-fork4.mjs`：将当前 client.js 反向还原到 r5 基线 → 重放 `tools/patch-fork4.mjs`（r6+r7+r8 补丁）→ 断言字节一致。client.js 改动必须过此门禁才能提交；补丁脚本与 client.js 同步演进（新轮次折进 fork4、更新反向锚点）。
- 真机验证（headless Chrome，`$DSH_CHROME` 可覆盖路径）：`tools/cdp-metrics.mjs`（布局探针）、`tools/cdp-settings-probe.mjs`（设置页断言：真实相对时间、无 `time.*` 键名泄漏）；共享 `tools/cdp-lib.mjs`（启动/连接/求值/清理——等 stderr 管道关闭后删临时 profile，检查 `%TEMP%\dsh-cdp-*` 残留为 0）。
- 辅助：`tools/dump-css.mjs`（CSS 类名转储）、`tools/gen-repro.mjs`（本地复现页，经本地 HTTP 服务访问——内置浏览器禁 `file://`）。

## Agent skills

### Issue tracker

本仓库的 issue 与 spec 以 Markdown 文件存放在 `.scratch/<feature>/` 下。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个规范 triage 标签（默认值）：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`。见 `docs/agents/domain.md`。

### DSH 源码参照

- DSH 官方源码检出位于 `D:\Downloads\deepseek-harness`（用户为本项目下载的参考副本，与部署的发行版同源）。它是内置组件行为与平台 API 的**权威依据**，比 bundle 反推或记忆猜测可靠。
- **以下场景必须先查源码、再动手或下结论**：
  - 修改 fork 自内置的浏览器 bundle（如 `ui-workspace`）时：组件树、CSS 类名、菜单数组、状态机逻辑以 `packages/client/ui-workspace/src/client/` 为准；
  - 调用平台服务或排查平台行为时：方法签名、语义、不变量以对应包源码为准（常见：`session/session-persistence*/src`、`session/session-projection-cache/src`、`core/session/src`、`core/agent/src`、`host/apiproxy/src/api-proxy.ts`、`workspace/workspace/src`、`client/runtime/src/client/sessions/`）；
  - 判断"平台是否支持某能力"（如按 id 销毁会话）时：先全文检索 API/事件/RPC，确认存在再实现；不存在则如实说明，采用平台约束内的替代方案（如墓碑过滤）。
- 本插件两半均直接运行、无编译步骤：改完必须 `node --check`。浏览器半（`lib/client.js`）改完在 `packages/dsh-chat-manager/cordis.patch.yml`（bundle patch）追加注释标记并让用户 Ctrl+F5 生效；宿主半（`lib/index.js`）改完需重启 dsh 进程才生效（模块缓存）。
