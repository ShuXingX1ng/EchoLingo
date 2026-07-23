# EchoLingo Roadmap

更新日期：2026-07-21

本文件只描述阶段、优先级和范围，不维护逐文件实施清单。详细 Speech Evaluator 任务与验收标准只保存在 [`SPEECH_EVALUATOR_ROADMAP.md`](SPEECH_EVALUATOR_ROADMAP.md)。

## 当前阶段

EchoLingo 已完成 PTE 产品 MVP、前后端分离、反馈 Agent/RAG、Exemplar 数据管线、学习辅助功能和 Study Assistant。当前阶段是 **Read Aloud Speech Evaluator**。

运行时仍由 Azure Pronunciation Assessment 服务 Read Aloud 与 Repeat Sentence。自研评估器目前只有已确认路线和 ADR，尚未实现；在独立验收通过前，不切换默认提供方。

## 当前优先级

1. **建立可复现基线**：完成 Speech Evaluator M0 环境、依赖、目录和 smoke test。
2. **建立合法且可审计的数据管线**：完成 SpeechOcean 数据许可、不可变原始数据、speaker-independent split、manifest 与 hash。
3. **训练并评估冻结编码器基线**：先获得可复现实验结果，再评估 LoRA、adapter 或其他候选改进。
4. **通过独立 worker 集成**：模型验收后才建立 provider-neutral FastAPI contract 和显式 compare 模式。

## 下一道阶段门槛

进入 M0 前，先完成 [`SPEECH_EVALUATOR_ROADMAP.md`](SPEECH_EVALUATOR_ROADMAP.md) 中 M0 的环境、依赖、存储与 smoke-test 前置条件，并重新运行当前前后端质量基线。具体清单不在本文件复制。

## 运维与文档

- [ ] 在目标 Supabase 环境确认 `supabase-migration-006.sql` 是否已经应用。
- [ ] 部署前按 [`DEPLOYMENT.md`](DEPLOYMENT.md) 核对环境变量、migrations 与目标平台。
- [ ] 为 Judge 补充稳定性、分歧率和固定回归集说明。
- [ ] 为仓库 README 增加当前产品截图或短演示。

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
