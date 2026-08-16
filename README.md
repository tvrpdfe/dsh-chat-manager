# dsh-chat-manager

为Web 界面提供「工作区 / 聊天」双区域会话管理、聊天文件夹、会话删除与已归档会话管理的用户级插件

## 功能特性

- **双区域侧边栏**：左侧边栏拆分为「工作区」与「聊天」两个区域。工作区保留 DSH 内置的全部行为（搜索、视图选项、拖拽、展开/收起），聊天区以同一套视觉风格承载聊天会话，并支持标题+内容搜索与「添加聊天」。
- **新建会话焦点路由**：焦点在工作区时新会话开进该工作区；焦点在聊天会话或无焦点时开进聊天区。
- **聊天文件夹自动归档**：新建聊天会话自动落在跨平台的文档目录 `文档/DSH/年-月-日/` 下；发送第一句话后由 LLM 生成 2–4 个英文小写单词的 `xxxx` 子文件夹（失败时本地规则回退），代理的文件读写默认落在这个子文件夹里。日期文件夹不会出现在工作区区域。
- **删除会话**：工作区与聊天区会话菜单均新增红色「删除会话」（垃圾桶图标、二次确认）。删除会移除会话日志工件、工作区账目席位、聊天登记与归档集合引用，但**保留会话文件夹**（产物不丢失）。
- **已归档会话管理**：设置面板新增「已归档会话」栏目，展示真实标题与最近更新时间，支持「恢复」（回到原工作区位置）与「删除」（走完整删除流程）。

## 前置依赖

```bash
# git：克隆仓库（已预装则跳过；Windows 可安装 Git for Windows）

# Node.js（>= 22）与 pnpm：dsh plugin 会把命令转发给 profile 目录里的 pnpm
npm install -g pnpm

# DSH CLI：提供 dsh 命令（dsh web 启动器、dsh plugin 插件管理）
npm install -g @deepseek-ai/dsh
```

## 安装（克隆安装）

### 1. 克隆仓库

```bash
git clone https://github.com/tvrpdfe/dsh-chat-manager.git
cd dsh-chat-manager
```

### 2. 用 dsh plugin 安装插件包

```bash
dsh plugin --profile web add "link:$(pwd)/packages/dsh-chat-manager"
```

### 3. 重启生效

1. **重启 dsh**（宿主半与层装配走模块缓存，必须重启才生效）：`dsh web`；
2. 浏览器打开 DSH Web 界面后按 **Ctrl+F5** 强制刷新（浏览器半走 bundle 版本号缓存）。

## 使用说明

- **新建聊天**：聊天区头部「添加聊天」，或焦点在聊天会话/无焦点时点「新建会话」；新会话自动获得 `文档/DSH/当天日期/` 工作目录，第一句话后生成 slug 子文件夹。
- **删除会话**：任意会话的「⋯」菜单 → 红色「删除会话」→ 二次确认。删除后行立即消失（不整页刷新）；会话文件夹与其中文件保留在磁盘。
- **查看/恢复/删除已归档会话**：设置 → 已归档会话，每行显示「工作区名：会话名」与最近更新时间，可「恢复」或「删除」。

## 数据位置

| 数据 | 位置 |
| --- | --- |
| 聊天根目录 | `文档/DSH/`（如 `D:\Documents\DSH\`） |
| 聊天登记表 | 每个日期文件夹内 `.dsh-chat.json`（`{ sessionId: { slug, folder } }`，缺失时启动扫描重建） |
| 归档集合 / 工作区账目 | `~/.dsh/storages/workspace.json`（workspace 存储域，沿用 DSH 原生机制） |
| 删除墓碑（仅客户端过滤） | 浏览器 `localStorage` 的 `dsh-chat-manager.deletedSessionIds`，基线不再列出后自动清除 |

**卸载**：

```bash
# 移除依赖并自动从 dsh.profile.bundles 层栈摘除（转发给 pnpm remove）
dsh plugin --profile web remove dsh-chat-manager

# 重启 dsh，侧边栏恢复内置 ui-workspace
dsh web
```

插件产生的数据（聊天文件夹、登记表、归档集合条目）默认保留。

**升级**：仓库是 `link:` 指向的本地目录，直接 `git pull` 拉取新版本，然后重启 dsh 并在浏览器 **Ctrl+F5** 强刷即可（依赖与层注册无需重新执行）。

## 开发与验证

- 两半均为直接运行的无编译 JS：改完先 `node --check`。
- 浏览器半改动后需在 `packages/dsh-chat-manager/cordis.patch.yml`（bundle patch）追加 `# (reload marker rN: ...)` 注释并让用户 Ctrl+F5 生效；宿主半改动需重启 dsh。
- 回归门禁：`node tools/test-patch-fork4.mjs`（把当前浏览器半反向还原到 r5 基线、重放 `tools/patch-fork4.mjs` 补丁，断言字节一致）。
- 真机验证（headless Chrome，可用 `$DSH_CHROME` 指定 Chrome 路径）：`tools/cdp-metrics.mjs` 布局探针、`tools/cdp-settings-probe.mjs` 设置页断言（相对时间渲染、无 `time.*` 键名泄漏）。
- 需求与规格：`.scratch/chat-manager/spec.md`；领域词汇：`CONTEXT.md`；命名时序决策：`docs/adr/0001-chat-folder-naming.md`。

## 许可证

[MIT](LICENSE)（插件包 `packages/dsh-chat-manager/package.json` 声明 `license: MIT`）。
