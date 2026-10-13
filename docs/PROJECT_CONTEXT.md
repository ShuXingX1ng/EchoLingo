# EchoLingo Project Context

更新日期：2026-10-13

## Product

EchoLingo 是面向 PTE Academic 学习者的个人全栈 AI 练习平台。产品提供 15 个 Task Types 的单项练习、Mock Exam、结构化反馈、学习历史/统计、主题与弱项练习，以及学习辅助工具。

评分与反馈只用于学习参考。系统不复刻、不预测 Pearson 官方 PTE 总分，也不应把 EchoLingo 或 Azure 输出表述为官方评分。

权威术语和领域边界见仓库根目录 [`CONTEXT.md`](../CONTEXT.md)。

## Current Stage

PTE 产品 MVP 和平台架构已完成，当前进入 **Read Aloud Speech Evaluator** 阶段。

- 已完成：PTE 练习与 Mock、FastAPI 分离、LangGraph feedback、rubric RAG、Exemplar retrieval、Study Assistant、Onboarding、Supabase 同步、i18n。
- 当前运行：Azure Pronunciation Assessment 为 Read Aloud 和 Repeat Sentence 提供语音证据。
- 已完成：Speech Evaluator M0（`speech/` 包骨架、固定 encoder revision、smoke test）、M1（SpeechOcean762 下载/校验、说话人隔离切分、MFA 对齐、Wav2Vec2 特征缓存）、M2（A0 冻结编码器多任务评分基线，两个种子；结果见 `speech/docs/m2-acceptance-report.md`）。
- A0 现状：封存测试集句子级 Accuracy/Fluency Pearson 达到 0.60 门槛；单词/音素级相关性约 0.27–0.29，单词错误检测与无学习基线持平。A0 是研究基线，不是已验收模型。
- 训练环境：原 WSL2 + RTX 4070 机器已不可用，训练迁移到租用的 Linux 云 GPU（ADR-0014）。数据、特征缓存、MLflow 记录和检查点不在 Git 中，需在新环境重建。
- 已实施的 seam：`backend/services/speech_evaluation.py` 定义 provider-neutral 的 Speech Evaluation Result，目前只有 Azure 一个 adapter；前端与 Feedback 流程不再接触 Azure 字段名。
- 已确认但未实施：M3 候选改进、Checkpoint Bundle、独立 GPU worker 服务、EchoLingo provider 和显式 compare mode。
- 当前权威计划：[`SPEECH_EVALUATOR_ROADMAP.md`](SPEECH_EVALUATOR_ROADMAP.md) 与 ADR 0011–0014。

## Runtime Architecture

```mermaid
flowchart LR
    UI["Next.js 16 / React 19 UI"] -->|"NEXT_PUBLIC_API_BASE_URL"| API["FastAPI"]
    UI --> AUTH["Supabase Auth"]
    API --> FG["LangGraph Feedback Graph"]
    API --> OA["Onboarding Graph"]
    API --> SA["Study Assistant Graph"]
    API --> AZ["Azure Speech / TTS"]
    API --> LLM["OpenAI-compatible LLM"]
    FG --> RR["Rubric RAG"]
    API --> ER["Stimulus Exemplar Retrieval"]
    RR --> DB["Supabase Postgres + pgvector"]
    ER --> DB
```

FastAPI 是唯一业务后端。Next.js 中不存在 PTE、LLM、TTS、pronunciation 或 word lookup 的业务 API fallback；第三方密钥只属于 backend runtime。Next.js route handler 仅保留 Supabase auth callback 等前端平台职责。

## Frontend

- Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4。
- 主要页面：home、practice hub、15 个 task pages、mock、history、stats、vocabulary、settings、onboarding、admin。
- `src/lib/api-client.ts` 统一访问 FastAPI，并包含 timeout/circuit-breaker 行为。
- `src/data/task-types.json` 是前后端共用的 Task Type Catalogue（Section、路由、标签键、Stimulus 形式、计时、计分维度与满分、Mock Exam 顺序）；前端经 `src/lib/task-type-registry.ts` 读取，backend 经 `backend/services/task_types.py` 读取，两侧各有一致性测试。
- `usePracticeTaskRun` 是全部 15 个 Task Type 的 Practice Task 运行模块（加载 Stimulus、TTS 播放、准备/作答计时、录音、Feedback 请求、保存；Read Aloud 与 Repeat Sentence 的录音通过一次 `POST /api/pte/spoken-feedback` 请求同时取得 Speech Evaluation Result 与 Feedback）；Task Practice 页面、Mock Exam 屏幕和 onboarding 诊断面板只负责展示（onboarding 传入预置 Stimulus 并只收集 Response，四题合并评估）。结构化 Stimulus 的解析与评分字符串集中在 `src/lib/structured-stimulus.ts`，`useRecordingSession` 负责录音状态。
- `src/lib/synced-store.ts` 是 learner data store：Practice Tasks 与 Vocabulary List 的保存、列表、删除、按 Task Type 查询和清空都经过同一套“已登录走 Supabase、否则走 localStorage”的策略（登录状态缓存、超时、降级）。首页与设置页的连续天数、今日是否练习、每周目标由 `src/lib/practice-activity.ts` 从 Practice Tasks 计算。
- Supabase 不可用时，适用的数据层使用本地存储降级；这不代表业务 API 有本地 fallback。
- 已移除的 IELTS 遗留：会话历史、错误模式、IELTS 话题库及其管理页、band 目标、本地备份导出。对应的 Supabase 表未改动。

## Backend

- FastAPI 入口：`backend/main.py`。
- HTTP routers：TTS、PTE stimulus、PTE feedback（含录音作答的 spoken-feedback）、word lookup、onboarding、Study Assistant。
- `feedback_graph.py`：rubric retrieval → speech evaluation context → Primary/Judge 并行 → divergence check → optional retry → Coach → finalize。
- `llm_chain.py` 是唯一构造模型 client 的模块，提供纯文本、JSON 解析和有上限的工具调用循环；Feedback coach 与 Study Assistant 都经由它调用模型。
- `onboarding_graph.py`：并行评估诊断任务，生成 weakness profile 与第一周计划。
- `study_assistant_graph.py`：最多四轮的工具调用循环；只能返回 allow-listed routes。
- 外部付费服务不得进入普通 CI/E2E；测试默认 mock LLM、Azure、Supabase 与 embedding 调用。

## API Authority

FastAPI 路由、OpenAPI 输出和 Pydantic models 是 API 的事实来源：

- 应用入口与 router 注册：`backend/main.py`。
- HTTP 路由：`backend/routers/`。
- 共享请求/响应模型：`backend/models/schemas.py` 与各 router 中的 Pydantic models。
- 本地运行时 API 文档：`http://localhost:8000/docs`。

本文件只记录 API 边界，不复制会随代码变化的完整 endpoint 或 schema 清单。需要静态 API 参考时，应由 ECC `/update-docs` 从上述来源生成并使用自动生成标记。

## Practice and Feedback

平台覆盖 Speaking & Writing、Reading、Listening 共 15 个 Task Types。调用方始终知道 `taskType`，因此没有 Router Agent（ADR 0004）。

Stimulus 路径：

- `random`：普通 Task Practice 与 Mock。
- `targeted`：根据 Task-Type Weakness 生成练习。
- `theme`：使用 pgvector dense + Postgres full-text sparse retrieval，并通过 RRF 融合。
- `news`：仅当 Study Assistant 检测到明确的实时/最新意图时使用 GNews 标题与摘要作为 anchor。

Exemplar 默认只作为 few-shot grounding，不向学习者逐字提供。生成结果经过本地 4-gram Jaccard originality guard；依赖失败时静默退化到纯 AI 生成（ADR 0008–0010）。

## Data

| Data | Authority | Notes |
|---|---|---|
| Auth/profile/history/vocabulary | Supabase | 客户端同步；部分能力有 localStorage fallback |
| Rubric chunks | Supabase pgvector | DashScope 1024-dim embeddings |
| Stimulus exemplars | Postgres + pgvector + `tsvector` | 迁移 004/005；最后确认 14,005 rows / 14 task types |
| ECDICT | Backend-local SQLite | 文件不进入普通 Git，部署时准备 |
| Prompt/rubric/task metadata | Repository | YAML、JSON 和 TypeScript registry |
| Speech datasets/checkpoints | 训练机上 `speech.yaml` 配置的 `data_root` / `artifact_root` | 通过 manifest 管理，不进入普通 Git；换机器需重建或显式备份 |

根目录 `supabase-migration-001.sql` 至 `006.sql` 记录 schema 演进。某个 migration 文件存在不等于目标环境已经应用；部署前必须核对数据库状态。

## Speech Evaluation Boundary

### Current

- Read Aloud、Repeat Sentence：Azure 提供 word/phoneme 证据，经 Azure adapter 转为 Speech Evaluation Result（不含 10–90 的 Spoken Task Score Estimate）。
- 其他需要转录的口语任务：使用现有 STT/LLM 路径生成学习反馈。

### Confirmed target for Read Aloud

- 基于固定的 open pretrained speech encoder 构建 EchoLingo Speech Evaluator。
- 评估 pronunciation、oral fluency、prosody 与 reference-derived completeness/content。
- 默认 `echolingo` 与显式开发者 `compare` 是可见模式；Azure 不是静默 fallback。
- 模型运行在独立私有 GPU worker；FastAPI 通过 provider-neutral contract 调用。
- 10–90 仅为透明标注的 EchoLingo reference scale，直到独立 PTE-specific benchmark 支持校准。
- Repeat Sentence 不自动迁移，必须另行收集标签并校准。

## Quality and Safety Rules

- Frontend gates：`npm run lint`、`npm run typecheck`、`npm run test:unit:run`、`npm run build`。
- Backend gates：在 `backend/` 运行 `pytest`；按 CI 配置运行 ruff。
- E2E：`npm run test:e2e`，外部调用使用 mock-first 策略。
- 不在日志、客户端 bundle、截图或 committed fixtures 中放置密钥或学习者音频。
- 新业务与 LLM 逻辑进入 FastAPI，不恢复 Next.js API 业务分叉。
- 商业化、支付、订阅、排行榜、学习小组和社交分享保持 future/backlog，除非明确请求。

## Documentation Ownership

- 当前事实：本文件。
- 阶段与战略优先级：`ROADMAP.md`。
- Speech Evaluator 详细实施路线：`SPEECH_EVALUATOR_ROADMAP.md`。
- 已完成里程碑与验证：`DEVELOPMENT_LOG.md`。
- 决策理由：`adr/`。
- 领域术语：根目录 `CONTEXT.md`。
- 命令、依赖、路由和 schema：代码与 manifests；通过 ECC `/update-docs` 同步。
