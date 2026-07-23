# EchoLingo Development Log

本文件保留阶段级结果，不保存逐文件流水账。更细的历史可通过 Git commit 和旧版本查看。

## Timeline

| 日期 | 阶段 | 实际完成 | 验证 |
|---|---|---|---|
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
- EchoLingo Speech Evaluator 只有已确认的路线与 ADR，实施尚未开始。
- Speech Evaluator 首阶段只服务 Read Aloud；Repeat Sentence 需要独立数据和校准。
- 所有分数都属于学习用途参考，不声称复刻 Pearson 官方评分。

## 记录规范

- 只记录已完成的工作，不把计划写成完成项。
- 验证列写真实运行过的命令或检查；未运行就明确写“未运行”。
- 阶段优先级放在 `ROADMAP.md`，详细实施计划放在专项 roadmap 或变更规格中，不在这里展开。
- 商业化、支付、订阅和社交功能在明确实施前只留在 backlog。
