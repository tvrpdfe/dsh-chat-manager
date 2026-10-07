# 领域文档

工程类 skill 在探索代码库时应如何消费本仓库的领域文档。

## 探索前先读这些

- 仓库根目录的 **`GLOSSARY.md`**，或
- 若根目录存在 **`GLOSSARY-MAP.md`** —— 它指向每个上下文的 `GLOSSARY.md`，逐一阅读与主题相关的部分
- **`docs/adr/`** —— 阅读与你即将工作的领域相关的 ADR。多上下文仓库中还需检查 `src/<context>/docs/adr/` 下的上下文级决策

若这些文件不存在，**静默继续**。不要标记缺失，也不要主动建议创建。`/domain-modeling` skill（经由 `/grill-with-docs` 与 `/improve-codebase-architecture` 触达）会在术语或决策真正落地时按需创建。

## 文件结构

单上下文仓库（大多数仓库）：

```
/
├── GLOSSARY.md
├── docs/adr/
│   └── 0001-chat-folder-naming.md
└── src/
```

多上下文仓库（根目录存在 `GLOSSARY-MAP.md` 时）：

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## 使用词汇表的术语

输出中命名领域概念时（issue 标题、重构提案、假设、测试名），使用 `GLOSSARY.md` 中定义的说法，不要漂移到词汇表明确规避的同义词。

若所需概念尚未收录，这是一个信号 —— 要么你在发明项目不用的语言（重新考虑），要么存在真实缺口（记下来交给 `/domain-modeling`）。

## 标记 ADR 冲突

若你的输出与既有 ADR 冲突，明确提出来而不是默默覆盖：

> _与 ADR-0001（聊天文件夹命名时序）冲突 —— 但值得重新讨论，因为…_
