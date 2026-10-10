# EchoLingo Development Log

本文件保留阶段级结果，不保存逐文件流水账。更细的历史可通过 Git commit 和旧版本查看。

## Timeline

| 日期 | 阶段 | 实际完成 | 验证 |
|---|---|---|---|
| 2026-07-31 | Speech Evaluator M2 | 完成 A0 冻结编码器基线：数据集组装、三级标签归一化、Huber/BCE 多任务损失、注意力统计池化评分网络、MLflow 训练/评估循环、无学习常数基线。两个种子（42、1337）在真实 SpeechOcean762 manifest 上训练。封存测试集句子 Accuracy Pearson 0.631/0.636、Fluency 0.728/0.720（达到 0.60 门槛）；单词 Accuracy Pearson 0.273/0.274、音素 0.288/0.278；单词错误检测 Macro F1 与无学习基线相同（0.4801），作为已标记缺口保留。未做 M3 候选、Bundle 或 Worker。 | 记录于 commit `a2e730a` 与 `speech/docs/m2-acceptance-report.md`（WSL2 + RTX 4070 上两次完整训练 + 基线对比）；该机器现已不可用，MLflow 记录与检查点未保存在 Git 中，2026-10-11 未能重新运行 |
| 2026-07-24 | Speech Evaluator M1 | 完成 SpeechOcean762 数据管线：OpenSLR 下载与 SHA-256 冻结、Kaldi 格式解析、按年龄/性别分层的说话人隔离 Validation 切分（官方 Test 封存）、泄漏审计、MFA `english_us_arpa` 对齐与 TextGrid 解析、Wav2Vec2 隐藏状态缓存、`configs/datasets/speechocean762.yaml` 注册记录。 | 记录于 commit `18eb224`：真实语料端到端运行，5000 条、128 成人 / 122 儿童说话人、13 个 Validation 说话人、泄漏审计 PASS、MFA 对齐 5000/5000、全部特征缓存完成；2026-10-11 未重新运行 |
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
