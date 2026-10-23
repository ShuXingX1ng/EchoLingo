# EchoLingo Development Log

本文件保留阶段级结果，不保存逐文件流水账。更细的历史可通过 Git commit 和旧版本查看。

## Timeline

| 日期 | 阶段 | 实际完成 | 验证 |
|---|---|---|---|
| 2026-10-23 | Speech Evaluator A0 复现 | 在 Featurize RTX 3090 租用实例上从零重建 M1 并重训 A0（ADR-0014）：uv 环境与 MFA `aligner` 环境、SpeechOcean762 下载（elda 镜像）与解压、manifest、MFA 对齐、特征缓存、两个种子与无学习基线。封存测试集句子 Accuracy Pearson 0.626/0.644、Fluency 0.722/0.725（验收报告 0.631/0.636、0.728/0.720，相差不超过 0.01）；单词错误检测仍为 0.4801（模型从不预测"错误"类）。修复：MLflow 3.14 文件存储拒绝路径中含 `artifacts` 目录的 run，mlruns 移出 `artifact_root`，`config validate` 拒绝该布局，`env_check` 不再要求 `artifacts/mlruns`；README 按实际运行更新（Featurize 存储与 SSH 公钥位置、hf-mirror、镜像下载、5090 不兼容、实测耗时）。未开始 M2.5 诊断。 | 实例上：`pytest` 84 passed（含 GPU）、`ruff` 通过、`config validate` 与 `env_check` OK；tarball SHA-256、13 个 Validation 说话人与冻结值一致，泄漏审计 PASS，MFA 5000/5000；两次完整训练 + 基线（`speech/docs/m2-acceptance-report.md` 第 6 节）；备份的 `best.pt` 与 manifest 经 SHA-256 核对。配置校验改动后在实例上重跑：`pytest` 85 passed、`ruff` 通过、`env_check` OK，旧布局被 `config validate` 拒绝 |
| 2026-10-13 | 架构深化（三） | 架构评审其余三项。(4) 语音评估 seam：`services/speech_evaluation.py` 定义 provider-neutral 的 Speech Evaluation Result 与 Azure adapter；新增 `POST /api/pte/spoken-feedback`（一次请求完成评估与 Feedback，评估分数进入评分步骤），删除 `/api/pronunciation`；前端显示与保存改用中性结果，旧记录经 `src/lib/speech-evaluation.ts` 读取。未实现 EchoLingo provider、compare 模式和 10–90 分数估计。(5) LLM 模块：`llm_chain` 成为唯一构造模型 client 的位置，新增 JSON 解析与工具调用循环，Feedback coach 与 Study Assistant 改用它，新增两者的首批循环测试。(6) learner data store：`synced-store` 增加按策略执行的查询与变更，清空历史同时清云端；连续天数、今日练习、每周目标改为基于 Practice Tasks；删除 IELTS 遗留模块（会话历史、错误模式、话题库与管理页、band 目标、备份导出）及无人引用的组件，清理 139 条无引用的翻译条目。未做：真实麦克风与 Azure 经新接口的人工实测；Supabase 遗留表未清理。 | backend `ruff check .` 通过、`pytest` 375 passed；frontend `typecheck`、`lint`（0 errors）、`test:unit:run` 177 passed、`build` 通过；`test:e2e` 51 passed |
| 2026-10-11 | 架构深化（二） | 三项加深改造。(1) Evaluator Training Run：`fit` 统一接口、`RunTracker` seam（MLflow / 内存）、每 epoch 写 `last.pt`/`best.pt` 并支持 `--resume`、`evaluate` 子命令独立评估 checkpoint、指标组装与 score scale 单一定义；去掉 smoke 测试对 RTX 4070 的断言，MFA 定位支持 `ECHOLINGO_MFA_BIN` 与 `/opt/conda`。(2) Task Type Catalogue：`src/data/task-types.json` 扩为前后端共用目录，前端经 `task-type-registry.ts`、backend 经 `services/task_types.py` 读取，替换两侧重复声明。(3) Practice Task 运行模块：`usePracticeTaskRun` 覆盖全部 15 个 Task Type，30 个 Task Practice 页面与 Mock Exam 屏幕迁移完成并删除 `usePracticeTaskRunner`；修复 Mock Exam 阅读填空恒为 0 分；onboarding 诊断的四个面板也改用该模块（预置 Stimulus、只收集 Response、不请求单题 Feedback）。更新过时的 e2e 用例（页面打开即加载 Stimulus，不再有"Generate"入口按钮）并新增 onboarding e2e。按 `/code-review` 结果修复：离开页面时仍保存已提交的 Practice Task、未作答的 Multiple Choice 不再可能判对、播放被中断或被拒不再当作播完、结构化 Stimulus 统一校验、畸形 dimension scores 不再抛异常、`--resume` 校验训练配置。后续清理（2026-10-13）：练习首页与 Mock Exam 介绍页的计时文案改由目录生成，删除 backend 未使用的 `PteTaskType` 字面量；backend 测试新增拦截真实 HTTP 请求的 fixture，并修复两个因 coach 步骤未 mock 而向 LLM 服务发出请求的 Feedback 测试。未在真实 GPU 上运行训练；口语录音与音频播放流程未做人工实测。 | speech（本机 CPU 临时环境）`pytest` 82 passed / 2 skipped（GPU）、`ruff check` 通过；backend `ruff check .` 通过、`pytest` 355 passed；frontend `typecheck`、`lint`（0 errors）、`test:unit:run` 206 passed、`build` 通过；`test:e2e` 51 passed（改动前基线 22 passed / 27 failed） |
| 2026-07-31 | Speech Evaluator M2 | 完成 A0 冻结编码器基线：数据集组装、三级标签归一化、Huber/BCE 多任务损失、注意力统计池化评分网络、MLflow 训练/评估循环、无学习常数基线。两个种子（42、1337）在真实 SpeechOcean762 manifest 上训练。封存测试集句子 Accuracy Pearson 0.631/0.636、Fluency 0.728/0.720（达到 0.60 门槛）；单词 Accuracy Pearson 0.273/0.274、音素 0.288/0.278；单词错误检测 Macro F1 与无学习基线相同（0.4801），作为已标记缺口保留。未做 M3 候选、Bundle 或 Worker。 | 记录于 commit `1f917fa` 与 `speech/docs/m2-acceptance-report.md`（WSL2 + RTX 4070 上两次完整训练 + 基线对比）；该机器现已不可用，MLflow 记录与检查点未保存在 Git 中，2026-10-11 未能重新运行 |
| 2026-07-24 | Speech Evaluator M1 | 完成 SpeechOcean762 数据管线：OpenSLR 下载与 SHA-256 冻结、Kaldi 格式解析、按年龄/性别分层的说话人隔离 Validation 切分（官方 Test 封存）、泄漏审计、MFA `english_us_arpa` 对齐与 TextGrid 解析、Wav2Vec2 隐藏状态缓存、`configs/datasets/speechocean762.yaml` 注册记录。 | 记录于 commit `22ddfd5`：真实语料端到端运行，5000 条、128 成人 / 122 儿童说话人、13 个 Validation 说话人、泄漏审计 PASS、MFA 对齐 5000/5000、全部特征缓存完成；2026-10-11 未重新运行 |
| 2026-07-23 | Speech Evaluator M0 | 完成 WSL2 Ubuntu 环境（RTX 4070 GPU 可见）、`speech/` 包骨架（8 个子包 + config/paths/env_check）、`uv.lock` 锁定依赖（torch 2.5.1+cu121、transformers 5.14.1、mlflow 3.14.0）、固定 encoder revision（`facebook/wav2vec2-base-960h`@`22aad52d435eb6dbaf354bdad9b0da84ce7d6156`）、数据/artifact 目录结构（`~/echolingo-speech/{data,artifacts}`）。未下载数据集、未训练、未实现 M1–M6。 | WSL 内 `uv run pytest tests/` 9 passed（含真实 CUDA matmul、真实 encoder 前向推理、MLflow file-store round-trip）；`uv run ruff check` 通过；`config validate`/`env_check` 通过；回归门：backend `ruff check .` 通过 + `pytest tests/ -v` 343 passed；frontend `lint`（0 errors）、`typecheck`、`test:unit:run`（128 passed）、`build` 全部通过 |
| 2026-07-21 | ECC 文档工作流 | 确认用户级 `ecc@ecc 2.0.0` 已启用；按 ECC 的最小入口、单一事实来源和生成内容边界重整 `CLAUDE.md`、仓库规则与 docs 索引；将任务流水账收敛为 `ROADMAP.md`，移除失效的旧收尾 skill 依赖。 | `git diff --check`；Markdown 引用扫描；ECC deterministic harness audit |
| 2026-07-21 | Speech Evaluator 规划 | 确认 Read Aloud 自研评估器 M0–M6 路线、预训练编码器适配策略、显式 provider compare 模式与独立 GPU worker；新增 ADR 0011–0013。尚未创建模型、数据集或运行时实现。 | 文档一致性检查；`git diff --check` |
| 2026-07-21 | 文档阶段整理 | 删除重复架构 HTML、两个过期 mockup 和已完成的 PTE pivot PRD；重写 docs 索引、项目上下文、任务、部署和 Agent 架构文档；增加 ADR 状态索引。 | 文档引用检查；`git diff --check` |
| 2026-06-17 | Study Assistant | 完成 LangGraph 工具循环、导航/PTE 知识/主题练习工具、GNews 明确触发路径、前端全局入口和中英文 UI。 | Backend 343 passed；frontend typecheck、lint、build 通过 |
| 2026-06-15 | 架构深化 | 完成 `usePracticeTaskRunner`、统一 Read Aloud backend、Task Type registry 和 `createSyncedStore`。 | Backend 294 passed；frontend unit 124 passed；typecheck 通过 |
| 2026-06-13 至 06-14 | Exemplar 与 RAG | 完成 15 类 rubric、LangGraph feedback graph、Exemplar 抓取/清洗/embedding/去重/混合检索/originality guard；数据库最后确认 14,005 rows / 14 task types。 | Backend 292 passed；live ingestion/retrieval checks |
| 2026-06-13 | 前后端分离 | 所有业务 API 迁至 FastAPI，删除 Next.js 业务 API routes，前端要求 `NEXT_PUBLIC_API_BASE_URL`，增加 circuit breaker 和错误边界。 | Frontend lint、typecheck、unit、build 通过 |
| 2026-06-07 至 06-13 | PTE pivot | 清除 IELTS 产品路径，完成 15 个 PTE Task Types、Mock Exam、历史/统计/弱项、Agent feedback pipeline 和 Supabase 数据路径。 | Backend、frontend unit、E2E 分阶段通过 |
| 2026-05-13 至 05-20 | 平台基础 | 完成早期练习闭环、语音、Supabase auth/sync、PWA、i18n、可访问性、设置、备份和初始测试。 | 分阶段手工与自动化验证 |

## 当前阶段边界

- 当前运行时仍使用 Azure Pronunciation Assessment 支持 Read Aloud 和 Repeat Sentence。
- EchoLingo Speech Evaluator 已完成 M0–M2（环境、数据管线、A0 基线），尚无通过验收的模型、Bundle、Worker 或运行时集成。
- Speech Evaluator 首阶段只服务 Read Aloud；Repeat Sentence 需要独立数据和校准。
- 所有分数都属于学习用途参考，不声称复刻 Pearson 官方评分。

## 记录规范

- 只记录已完成的工作，不把计划写成完成项。
- 验证列写真实运行过的命令或检查；未运行就明确写“未运行”。
- 阶段优先级放在 `ROADMAP.md`，详细实施计划放在专项 roadmap 或变更规格中，不在这里展开。
- 商业化、支付、订阅和社交功能在明确实施前只留在 backlog。
