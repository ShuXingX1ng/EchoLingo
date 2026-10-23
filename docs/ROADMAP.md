# EchoLingo Roadmap

更新日期：2026-10-23

本文件只描述阶段、优先级和范围，不维护逐文件实施清单。详细 Speech Evaluator 任务与验收标准只保存在 [`SPEECH_EVALUATOR_ROADMAP.md`](SPEECH_EVALUATOR_ROADMAP.md)。

## 当前阶段

EchoLingo 已完成 PTE 产品 MVP、前后端分离、反馈 Agent/RAG、Exemplar 数据管线、学习辅助功能和 Study Assistant。当前阶段是 **Read Aloud Speech Evaluator**。

运行时仍由 Azure Pronunciation Assessment 服务 Read Aloud 与 Repeat Sentence。自研评估器已完成 M0（环境与骨架）、M1（SpeechOcean762 数据管线）和 M2（A0 冻结编码器基线）；句子级达到验收门槛，单词/音素级仍有已标记缺口。2026-10-23 已在租用 GPU 上重建数据并复现 A0，并完成 M2.5 基线修复：封存 Test 上句子 Accuracy Pearson 0.71、Fluency 0.79，单词错误检测 Macro F1 0.63（超过无学习基线 0.48）。尚无 Bundle、Worker 或运行时集成；在独立验收通过前，不切换默认提供方。

## 当前优先级

1. **M3 候选改进**：评分者分歧、轻量增强、成人目标域、Loquacious CTC Adapter；只保留被封存基准支持的改进。
2. **通过独立 worker 集成**：模型验收后才建立 Bundle、Worker、provider-neutral FastAPI contract 和显式 compare 模式（M4–M6）。

## 下一道阶段门槛

M2.5 已完成（2026-10-23）。M3 每个候选都要在同一封存基准上超过 M2.5 候选才保留；进入 M4（Bundle 与 Worker）前须有一个通过 [`SPEECH_EVALUATOR_ROADMAP.md`](SPEECH_EVALUATOR_ROADMAP.md) 第 7 节验收的候选。具体清单不在本文件复制。

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
