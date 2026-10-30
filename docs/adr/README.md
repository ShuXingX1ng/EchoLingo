# Architecture Decision Records

ADR 记录决策产生时的背景和理由。阶段完成不代表 ADR 失效，因此这里保留全部有效决策；实现状态与决策状态分开管理。

## 状态定义

- **Accepted**：当前仍有效的决策。
- **Superseded**：已被后续 ADR 替代，保留供追溯。
- **Rejected**：讨论过但明确不采用。

## 决策索引

| ADR | 决策状态 | 实现状态 | 主题 |
|---|---|---|---|
| [0001](0001-pivot-to-pte.md) | Accepted | Implemented | 产品完全转向 PTE Academic |
| [0002](0002-generic-practice-task-model.md) | Accepted | Implemented | 统一 `PracticeTask` 模型 |
| [0003](0003-no-official-pte-scoring-simulation.md) | Accepted | Implemented | 不冒充 Pearson 官方评分 |
| [0004](0004-agent-architecture-no-router.md) | Accepted | Implemented | 已知 `taskType`，不增加 Router Agent |
| [0005](0005-langgraph-rag-refactor.md) | Accepted | Implemented | LangGraph + rubric RAG 反馈管线 |
| [0006](0006-word-lookup-translation-source.md) | Accepted | Implemented | 词典优先查词与云端词汇表 |
| [0007](0007-frontend-backend-separation.md) | Accepted | Implemented | FastAPI 是唯一业务后端 |
| [0008](0008-stimulus-exemplar-model.md) | Accepted | Implemented | Exemplar 仅用于检索增强生成 |
| [0009](0009-hybrid-retrieval-theme-practice.md) | Accepted | Implemented | Theme Practice 使用混合检索 |
| [0010](0010-study-assistant-tool-using-agent.md) | Accepted | Implemented | Study Assistant 的工具与边界 |
| [0011](0011-pretrained-speech-encoder-with-echolingo-adaptation.md) | Accepted | In progress（M0–M5 完成） | 基于预训练编码器构建 Speech Evaluator |
| [0012](0012-switchable-speech-evaluation-providers.md) | Accepted | In progress（模式、契约与 Compare 已在 M5 实现；开发者面板属 M6） | Read Aloud 的 EchoLingo / compare 模式 |
| [0013](0013-separate-speech-evaluation-worker.md) | Accepted（训练环境段落由 ADR-0014 修订，Worker 位置由 ADR-0015 确定） | Implemented（Bundle、Worker 与 FastAPI 集成） | 独立私有 speech worker |
| [0014](0014-train-speech-evaluator-on-rented-linux-gpu.md) | Accepted | In progress | 在租用的 Linux 云 GPU 上训练 Speech Evaluator |
| [0015](0015-run-the-speech-evaluation-worker-on-the-development-mac.md) | Accepted | Implemented | 开发阶段 Worker 在本机 Mac CPU 上运行 |
| [0016](0016-normalize-read-aloud-scores-in-fastapi-per-bundle.md) | Accepted | Implemented | 10–90 归一化在 FastAPI 按 Bundle 区分；Content 策略；段落按句评分 |
| [0017](0017-report-reading-diagnostics-only-where-alignment-and-asr-agree.md) | Accepted | Implemented | 漏读、多读、重复与流利度事件只在强制对齐与自由 ASR 一致时报告 |
| [0018](0018-show-content-only-when-little-of-the-passage-was-heard.md) | Accepted | Implemented | 校正覆盖率低于 0.28 时只给 Content，不给发音、流利度与总分（补充 ADR-0016） |

## 维护约定

新增 ADR 使用四位连续编号，并至少包含 Context、Decision、Consequences。若决策改变，不重写旧 ADR 的历史理由；新增 ADR，并把旧项改为 `Superseded by ADR-NNNN`。
