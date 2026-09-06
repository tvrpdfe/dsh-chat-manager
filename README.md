# dsh-chat-manager

DSH Web 的用户级插件：侧边栏拆成「工作区」「聊天」两块，聊天会话按日期自动建文件夹，会话可以从菜单删除，删掉的会话在设置页里还能恢复或彻底删掉。

## 功能特性

- **双区域侧边栏**：左栏上为工作区、下为聊天区，视觉风格一致。工作区保留 DSH 原生的全部行为（搜索、视图选项、拖拽、展开/收起）；聊天区里的会话不要求挂在某个工作区，可以用「添加聊天」新建，也能按标题或内容搜索。

  ![Snipaste_2026-08-16_14-50-45](./docs/pictures/Snipaste_2026-08-16_14-50-45.png)

- **新会话打开到哪**：焦点在工作区时，开进那个工作区；焦点在聊天会话、或没有焦点时，开进聊天区。

- **聊天文件夹自动归档**：新聊天会话落在系统文档目录的 `DSH/年-月-日/` 下。发出第一句话后，LLM 顺着内容起一个 2–4 个英文小写单词的子文件夹（起不出来时退回本地规则），代理之后的文件读写默认都在这个子文件夹里。日期文件夹本身不会出现在工作区区域。

- **删除会话**：工作区与聊天区的会话菜单都新增了红色「删除会话」（垃圾桶图标，二次确认）。删除会清掉会话日志、工作区账目席位、聊天登记与归档集合引用，但**会话文件夹原样留在磁盘上**，产物不丢。

  ![Snipaste_2026-08-16_14-48-48](./docs/pictures/Snipaste_2026-08-16_14-48-48.png)

  ![Snipaste_2026-08-16_14-49-04](./docs/pictures/Snipaste_2026-08-16_14-49-04.png)

- **已归档会话管理**：设置面板新增「已归档会话」，列出会话标题与最近更新时间，可「恢复」（回到原工作区位置）或「删除」（走完整删除流程）。

  ![Snipaste_2026-08-16_14-49-50](./docs/pictures/Snipaste_2026-08-16_14-49-50.png)

## 版本要求

插件依赖新版 DSH 的 client-modules 装载机制，适配 0.1.2-rc.1 及更新版本（开发对照 0.1.3-alpha.1）；旧版 Harness 没有这套机制，装不上。之前装过旧版插件的，先按「从旧版升级」重装一遍。

## 前置依赖

```bash
# Node.js：22.19+（或 24+，DSH 上游的 engines 要求）

# pnpm：DSH 的 plugin 命令会转发给 profile 里的 pnpm
npm install -g pnpm

# DSH CLI
npm install -g @deepseek-ai/dsh
```

## 从旧版升级

旧版插件的装载方式跟现在不一样，光拉新代码不够，先卸掉旧包再装回新包：

```bash
#第一步 git pull 或 重新clone
方式一 cd dsh-chat-manager
      git pull
      
方式二 git clone https://github.com/tvrpdfe/dsh-chat-manager.git
      cd dsh-chat-manager

#第二步 移除旧插件后重新安装
dsh plugin --profile web remove dsh-chat-manager
dsh plugin --profile web add "link:$(pwd)/packages/dsh-chat-manager"
```

前提是先拿到新版源码：旧安装同样是 `link:` 指向本克隆的话，`git pull` 即可；否则重新 `git clone`。然后重启 `dsh web` 并 **Ctrl+F5**。

卸载只是摘掉插件层，聊天文件夹、登记表和归档记录都留着。

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

（`link:` 指向你本地克隆的这份代码，之后改文件、拉新版本都直接生效。bash 和 PowerShell 里 `$(pwd)` 都会展开成当前目录。）

### 3. 重启 dsh 并强刷

1. 重启 dsh 宿主进程：`dsh web`（宿主半和层装配走模块缓存，不重启不生效）；
2. 浏览器打开界面后按 **Ctrl+F5** 强制刷新（浏览器半按 bundle rev 缓存）。

## 使用说明

- **新建聊天**：点聊天区头部的「添加聊天」，或焦点在聊天会话/无焦点时点「新建会话」；会话自动落在 `文档/DSH/当天日期/` 下，第一句话后生成 slug 子文件夹。
- **删除会话**：会话「⋯」菜单 → 红色「删除会话」→ 二次确认。删除后行立即消失（不整页刷新），文件夹与其中文件留在磁盘。
- **已归档会话**：设置 → 已归档会话。每行显示「工作区名：会话名」与最近更新时间，可「恢复」或「删除」。

## 数据位置

| 数据 | 位置 |
| --- | --- |
| 聊天根目录 | `文档/DSH/`（如 `D:\Documents\DSH\`） |
| 聊天登记表 | 每个日期文件夹内的 `.dsh-chat.json`（`{ sessionId: { slug, folder } }`，缺失时启动扫描重建） |
| 归档集合 / 工作区账目 | `~/.dsh/storages/workspace.json`（workspace 存储域，沿用 DSH 原生机制） |
| 删除墓碑（仅客户端过滤） | 浏览器 `localStorage` 的 `dsh-chat-manager.deletedSessionIds`，基线不再列出后自动清除 |

## 卸载

```bash
# 移除依赖并自动从 dsh.profile.bundles 层栈摘除（转发给 pnpm remove）
dsh plugin --profile web remove dsh-chat-manager

# 重启 dsh，侧边栏恢复内置 ui-workspace
dsh web
```

插件产生的数据（聊天文件夹、登记表、归档集合条目）默认保留。

## 升级

`link:` 装的插件，代码就在你的克隆目录里：`git pull` 拿到新版本后，重启 dsh 并按 **Ctrl+F5** 强刷即可，依赖与层注册不用重做。旧版安装过来的用户先按「从旧版升级」处理。

## 开发与验证

- 源码用 TypeScript/TSX 维护（`packages/dsh-chat-manager/src/`，浏览器半是内置 ui-workspace 客户端源码的分叉 + 插件 addon），构建产物为 Harness 加载的 JS bundle：`cd packages/dsh-chat-manager && npm install && npm run build`（esbuild：宿主 ESM + 客户端 `__ModuleLoader__.load` 工厂 bundle）。
- 类型门禁：`npm run typecheck`（`npx tsc --noEmit`）零错误；产物改动后跑 `node --check lib/index.js lib/client.js`。
- 浏览器半改完跑 `npm run build` 并重启 dsh（客户端 bundle rev 随服务端启动图更新）+ Ctrl+F5；宿主半改完重启 dsh 即可；`cordis.patch.yml` 的 `# (reload marker rN: ...)` 注释保留为演进标注。
- 真机验证（headless Chrome，可用 `$DSH_CHROME` 指定 Chrome 路径）：`.scratch/` 下的 CDP 探针脚本（boot 探针：无失败页 + 双区域渲染 + 零 console 错误；设置页探针：已归档会话 tab 注册、相对时间渲染、无 `time.*` 键名泄漏；宿主路由探针）；共享 `tools/cdp-lib.mjs`。
- 需求与规格：`.scratch/chat-manager/spec.md`；领域词汇：`CONTEXT.md`；命名时序决策：`docs/adr/0001-chat-folder-naming.md`。

## 许可证

[MIT](LICENSE)（插件包 `packages/dsh-chat-manager/package.json` 声明 `license: MIT`）。
