# EchoLingo Roadmap

更新日期：2026-10-29

本文件只描述阶段、优先级和范围，不维护逐文件实施清单。详细 Speech Evaluator 任务与验收标准只保存在 [`SPEECH_EVALUATOR_ROADMAP.md`](SPEECH_EVALUATOR_ROADMAP.md)。

## 当前阶段

EchoLingo 已完成 PTE 产品 MVP、前后端分离、反馈 Agent/RAG、Exemplar 数据管线、学习辅助功能和 Study Assistant。当前阶段是 **Read Aloud Speech Evaluator**。

运行时 Read Aloud 默认由 EchoLingo Speech Evaluator（本机私有 Worker + FastAPI 的 10–90 Provisional Score Normalization）评估，Worker 不可用时明确报告失败，不回退 Azure；Repeat Sentence 仍用 Azure Pronunciation Assessment，Azure 另作为 Read Aloud 显式 `compare` 模式的基线。自研评估器已完成 M0（环境与骨架）、M1（SpeechOcean762 数据管线）和 M2（A0 冻结编码器基线）；句子级达到验收门槛，单词/音素级仍有已标记缺口。2026-10-23 已在租用 GPU 上重建数据并复现 A0，并完成 M2.5 基线修复：封存 Test 上句子 Accuracy Pearson 0.71、Fluency 0.79，单词错误检测 Macro F1 0.63（超过无学习基线 0.48）。2026-10-25 完成 M3 候选改进：定稿候选 3.2c（专家平均目标、特征 Mask、离线音频增强）在封存 Test 上单词错误检测 Macro F1 0.68/0.67，单词与音素级全部提升，句子级持平；Loquacious CTC Adapter（A1）改善了识别 WER，但没有可确认的评分收益，未采纳。M4 同日完成：3.2c（种子 42）导出为不可变 Checkpoint Bundle `speech-evaluator-v0.1.0`，私有 Speech Evaluation Worker 在本机 Mac CPU 上运行（ADR-0015）。Worker 在 Validation 上复现了 Bundle 记录的指标；完整请求路径句子级持平，单词错误检测 AP 约低 0.03；中位延迟 3.0 秒。M5 自 2026-10-26 进行中：FastAPI 已通过 provider-neutral 契约调用 Worker，Read Aloud 默认使用 EchoLingo，10–90 归一化、Content 门控、多句段落按句评分与 Azure Compare Adapter 已实现，2026-10-29 用真实 Azure 跑通了 Compare，并在浏览器中走通了完整的 Read Aloud 流程；该次运行发现的 LLM Feedback 以 ASR 转写认定误读、缺少 i18n 键与时长提示文案问题已修复。

## 当前优先级

1. **完成 M5 FastAPI 与 Read Aloud**：真实 Azure Compare 与浏览器完整流程均已跑通，发现的 Feedback 问题已修复；剩下 rubric RAG 的数据库连接（`SUPABASE_DB_URL`）与 M5 收尾。
2. **M6 反馈与诊断**：单词级与流利度事件标注、重点建议摘要、Compare 开发者面板与结构化比较持久化。

## 下一道阶段门槛

M5 完成门槛：第 7.2 节其余验收中，非英语与读错段落由 M5 的机会校正 Content 门控处理（已实现）；Azure Compare 已在真实凭据下确认可用，浏览器中的完整流程已跑通（均为 2026-10-29）；该次运行发现的问题已修复。见 [`SPEECH_EVALUATOR_ROADMAP.md`](SPEECH_EVALUATOR_ROADMAP.md) 第 7 节。具体清单不在本文件复制。

## 运维与文档

- [ ] 在目标 Supabase 环境确认 `supabase-migration-006.sql` 是否已经应用。
- [ ] 部署前按 [`DEPLOYMENT.md`](DEPLOYMENT.md) 核对环境变量、migrations 与目标平台。
- [ ] 为 Judge 补充稳定性、分歧率和固定回归集说明。
- [ ] 为仓库 README 增加当前产品截图或短演示。
- [ ] 清理仓库中被跟踪的临时文件（`scratch_test_vocabulary_db.mjs`、`test-results/.last-run.json`，以及已在 `.gitignore` 中却仍被跟踪的 `skills-lock.json`）。
- [ ] 处理前端 9 条 ESLint warning（0 error；见 `npm run lint`）。
- [ ] 评估是否为 `speech/` 增加仅 CPU 的 CI（当前两个 workflow 都不覆盖它）。

## Future / Backlog

- PTE Task Calibrator：等待合法、足量且多样的 PTE Read Aloud task-level labels 与独立 gold benchmark。
- Native Speech Model：只在 Speech Evaluator 完成训练、验收、服务化和集成后启动。
- Repeat Sentence：单独建立标签、benchmark 和 calibration，不直接沿用 Read Aloud policy。
- 商业化、支付、订阅、排行榜、学习小组和社交分享：保持 future scope，除非明确立项。

## 更新规则

- 阶段或优先级改变时更新本文件。
- 实施步骤只更新专项路线图或以后建立的变更规格，不复制到这里。
- 当前系统事实变化时更新 `PROJECT_CONTEXT.md`。
- 只有完成并验证阶段性里程碑时才更新 `DEVELOPMENT_LOG.md`。
