# Issue tracker: 本地 Markdown

本仓库的 issue 与 spec（即 PRD）以 Markdown 文件形式存放在 `.scratch/` 下。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- spec 位于 `.scratch/<feature-slug>/spec.md`
- 实现 issue 是每个 ticket 一个文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号 —— 绝不合并成一个综合 tickets 文件
- triage 状态以 `Status:` 行记录在各 issue 文件顶部附近（角色字符串见 `triage-labels.md`）
- 评论与对话记录以 `## Comments` 标题追加到文件底部

## 当 skill 说"发布到 issue tracker"时

在 `.scratch/<feature-slug>/` 下新建文件（必要时创建目录）。

## 当 skill 说"获取相关 ticket"时

读取引用路径对应的文件。用户通常会直接给出路径或 issue 编号。

## 路径导航操作

由 `/wayfinder` 使用。**map** 是一个文件，每个 **child** 文件对应一个 ticket。

- **Map**：`.scratch/<effort>/map.md` —— Notes / Decisions-so-far / Fog 正文
- **子 ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，问题写在正文；`Type:` 行记录 ticket 类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`
- **阻塞**：`Blocked by: NN, NN` 行；当列出的每个文件均为 `resolved` 时 ticket 解除阻塞
- **Frontier**：扫描 `.scratch/<effort>/issues/` 中打开、未阻塞且未认领的文件；编号最小者优先
- **认领**：工作前先写入 `Status: claimed` 并保存
- **解决**：在 `## Answer` 标题下追加答案，设置 `Status: resolved`，然后在 `map.md` 的 Decisions-so-far 中追加上下文指针（gist + 链接）
