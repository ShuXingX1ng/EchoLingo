# EchoLingo 下一阶段优化方案

## 新窗口接手方式

新窗口必须先阅读：

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/TASKS.md`
4. `docs/DEVELOPMENT_LOG.md`
5. `docs/NEXT_OPTIMIZATION_PLAN.md`
6. 当前 `git diff`

接手后先确认当前工作区是否已有未提交改动，不要覆盖用户或上一位 agent 的修改。涉及 Next.js 代码前，按 `AGENTS.md` 要求阅读 `node_modules/next/dist/docs/` 中与本次改动相关的文档。

Python 后端相关：

- Python 后端代码放在 `backend/`，与 Next.js 前端并存。
- 后端技术栈为 FastAPI、Pydantic、OpenAI Python SDK、Azure Speech SDK for Python、Supabase Python Client。
- 环境变量需在两个位置配置：`.env.local`（前端）和 `backend/.env`（后端）。
- `NEXT_PUBLIC_API_BASE_URL` 为空时，前端继续使用 Next.js API Routes fallback；指向 FastAPI 时调用 Python 后端。

## 当前稳定基线

EchoLingo 已经从 MVP 进入稳定化后的探索阶段。核心练习、学习复盘、历史回看、统计理解、E2E mock、数据同步、桌面端统一和 Python 后端迁移均已完成。下一阶段不需要继续修补基础能力，重点应转向“学习效果更强”的产品能力，且每次只推进一个清晰边界。

当前基线：

| 指标 | 当前状态 |
|------|----------|
| 前端单元测试 | 10 文件 / 86 测试 |
| E2E 测试 | 20 测试 |
| 后端测试 | 86 测试 |
| 总测试量 | 192 测试 |
| 质量门 | lint 0、typecheck pass、build pass |
| API 架构 | Next.js API Routes fallback + FastAPI 后端 |
| 默认策略 | 不依赖真实 LLM、Azure、Supabase 或外部付费 API 跑自动化测试 |

已确认核心能力：

- IELTS Part 1/2/3、多模式练习、AI 考官对话、会话反馈、预估分数。
- 模拟考试 Part 1 -> Part 2 -> Part 3 完整流程、阶段指示、Part 2 计时、综合反馈。
- 跟读练习、标准发音播放、模仿录音、Azure 发音评估、逐句评分和总结。
- `FeedbackPanel` / `FeedbackReview` 统一普通练习、模拟考试和历史详情复盘 UI。
- 历史页展示 Band、Top weakness、下一步建议和练习模式，详情页复用学习复盘。
- 统计页已调整为目标进度、趋势、薄弱项和推荐行动。
- `DesktopNav` 统一 Home/Practice/Exam/Shadowing/Setup/Stats/History/Settings/Admin。
- 数据层已完成第一轮收敛：`unified-history.ts` 成为会话读写统一入口，云端失败 fallback 本地。
- Phase G 已完成：FastAPI 后端、前端 `api-client`、后端 CI、部署文档已存在。
- 每日学习计划功能已加入首页，作为下一阶段产品探索的起点。

## 已完成阶段摘要

详细执行历史保留在 `docs/DEVELOPMENT_LOG.md` 和 `docs/TASKS.md`。本文件只保留接手所需摘要。

### Phase A: 学习闭环统一 ✅

反馈结果已经能进入下一次练习：`FeedbackPanel` 将 Top 3 建议、薄弱项和发音队列带到 `/practice/setup` 或 `/practice/shadowing`。setup 页面能展示本轮训练目标；无发音数据时保持默认跟读流程。

关键文件：`src/components/FeedbackPanel.tsx`、`src/app/practice/setup/page.tsx`、`src/app/practice/shadowing/page.tsx`、`src/hooks/useShadowingPractice.ts`。

### Phase B: 历史与统计页学习化 ✅

历史页和统计页已经从“记录/图表集合”升级为学习决策入口。历史列表展示 Band、Top weakness 和下一步建议；历史详情复用复盘 UI；统计页首屏展示目标、趋势、薄弱项和推荐行动。

关键文件：`src/app/history/page.tsx`、`src/app/stats/page.tsx`、`src/lib/stats.ts`、`src/lib/recommendations.ts`。

### Phase C: 移动端核心流程打磨 ✅

已完成当前阶段需要的移动端阻塞修复：练习页避让移动导航、输入区和语音控制防溢出、Part 2 计时器紧凑化、首页/历史/统计/setup 的小屏可用性修复。后续移动端专项优化暂不作为最高优先级，除非出现严重阻塞。

关键文件：`src/app/page.tsx`、`src/app/practice/page.tsx`、`src/app/practice/exam/page.tsx`、`src/app/practice/setup/page.tsx`、`src/app/history/page.tsx`、`src/app/stats/page.tsx`。

### Phase D: 测试与 CI ✅

CI 基础质量门已建立，Playwright E2E 已安装并使用 `page.route()` mock 外部 API。现有测试覆盖 P0/P1/P2 smoke，包括首页到练习、反馈、历史、模拟考试、跟读 setup、错误处理和深色模式。

关键文件：`.github/workflows/ci.yml`、`package.json`、`e2e/smoke.spec.ts`、`e2e/helpers.ts`。

### Phase E: 数据与云端同步稳定性 ✅

数据路径已经收敛：会话保存/读取改用 `unified-history.ts`，已登录优先云端并保留本地备份，未登录走本地，云端失败 fallback 本地。Session ID 已统一，backup 增加 error-patterns，推荐系统消费 `errorAnnotations` 和 `improvementSuggestions`。

关键文件：`src/lib/unified-history.ts`、`src/lib/feedback-actions.ts`、`src/lib/error-patterns.ts`、`src/lib/recommendations.ts`、`src/lib/backup.ts`、`src/lib/stats.ts`。

### Phase F: 代码结构收敛 ✅

普通练习和模拟考试已共用反馈生成/保存逻辑；语音录音边界抽取到 `useAudioRecorder`；跟读练习复用共享录音和发音评估调用；聊天 loading/error/suspense/feedback loading UI 收敛到 `ChatUIStates.tsx`。当前不建议继续扩大通用组件范围。

关键文件：`src/lib/feedback-actions.ts`、`src/hooks/useAudioRecorder.ts`、`src/components/ChatUIStates.tsx`、`src/components/VoiceControls.tsx`、`src/hooks/useShadowingPractice.ts`。

### Phase G: Python 后端迁移 ✅

FastAPI 后端已完成，包含 examiner、feedback、tts、pronunciation、Supabase service、JWT middleware、Pydantic schemas、后端测试、Docker/Procfile、后端 CI 和部署文档。Next.js API Routes 保留为 fallback，前端通过 `src/lib/api-client.ts` 根据 `NEXT_PUBLIC_API_BASE_URL` 选择调用路径。

关键文件：`backend/main.py`、`backend/routers/*`、`backend/services/*`、`backend/models/schemas.py`、`backend/middleware/auth.py`、`src/lib/api-client.ts`、`.github/workflows/ci-backend.yml`、`docs/DEPLOYMENT.md`。

## 当前打开的问题

下一阶段应先选一个产品方向，不建议同时推进多个大功能。

| 问题 | 当前判断 |
|------|----------|
| 是否继续做基础稳定性 | 只有发现回归时再做；当前质量门已足够进入功能探索 |
| 是否做移动端专项 | 暂缓，除非 390px 核心路径再次出现遮挡或横向滚动 |
| 是否删除 Next.js API Routes | 暂不删除，继续作为 fallback，等 FastAPI 部署和真实流量稳定后再评估 |
| 是否做商业化 | 不做，继续留在 future/backlog |
| 是否跑真实 API E2E | 不纳入 CI，只能作为手动验证 |

## 推荐下一阶段

### Phase H: 个性化学习计划深化（推荐优先）

目标：把首页每日学习计划从“任务列表”推进到“可解释、可完成、可复盘”的学习路径，让用户知道今天练什么、为什么练、完成后有什么反馈。

背景：每日学习计划功能已经出现，但还可以继续和历史反馈、错误模式、推荐系统、跟读练习、统计页形成闭环。这个方向复用现有能力最多，风险低于全新功能。

建议拆分：

1. **H1. 学习计划数据来源 review**
   - 检查 `learning-plan.ts` 如何消费 progress、sessions、error-patterns 和 recommendations。
   - 明确已登录、未登录、云端失败时的计划生成降级策略。
   - 先产出 review 结论，再决定是否改代码。

2. **H2. 任务理由可解释化**
   - 每个任务展示一句来自真实数据的理由，例如最近低分话题、反复出现的错误类型、发音低分词。
   - 兼容旧数据和空数据，避免泛化文案过多。
   - 不新增真实 LLM 调用。

3. **H3. 任务完成反馈**
   - 用户完成普通练习、模拟考试或跟读后，首页任务状态应能反映完成情况。
   - 保持保存入口统一，不新增第二套任务状态存储，除非 review 证明有必要。

4. **H4. 测试补强**
   - 为学习计划生成逻辑补单元测试。
   - 对首页任务渲染补组件测试或 E2E smoke。
   - 不依赖真实 Supabase 或真实 LLM。

候选文件：

- `src/lib/learning-plan.ts`
- `src/components/DailyTasks.tsx`
- `src/app/page.tsx`
- `src/lib/recommendations.ts`
- `src/lib/error-patterns.ts`
- `src/lib/unified-history.ts`
- `src/lib/supabase-progress.ts`

验收标准：

- 首页每日任务能解释推荐原因。
- 空历史、旧数据、未登录、云端失败时页面不崩溃。
- 完成任务后，任务状态和现有历史/统计数据保持一致。
- 至少通过 `npm run lint && npm run typecheck && npm run test:unit:run`。
- 涉及首页或跨页行为时，补跑相关 E2E smoke。

不做：

- 不新增商业化、订阅、排行榜或社交能力。
- 不让学习计划依赖真实 LLM 在线生成。
- 不新增复杂日历系统。
- 不大改首页视觉结构。

## 备选方向

如果暂不做 Phase H，可从以下方向选一个单独开 Phase。

### 发音练习增强

目标：让 Azure 发音评估结果更可操作，突出音素级反馈、常见误读词、下一次跟读队列。

适合文件：`src/hooks/useShadowingPractice.ts`、`src/app/practice/shadowing/page.tsx`、`src/components/FeedbackPanel.tsx`、`src/types/index.ts`。

边界：只消费已有发音评估数据，不新增 Azure 调用类型。

### 词汇积累

目标：从练习反馈和 improved sample answer 中提取高级词汇，形成可复习词汇本。

适合文件：新增 `src/lib/vocabulary.ts`、新增词汇组件、必要时扩展 localStorage/Supabase 保存策略。

边界：先做本地数据结构和 UI，不做 spaced repetition 大系统。

### 历史数据分析增强

目标：让历史页/统计页展示更清楚的进步趋势、薄弱环节和复盘入口。

适合文件：`src/app/history/page.tsx`、`src/app/stats/page.tsx`、`src/lib/stats.ts`、`src/lib/recommendations.ts`。

边界：不做运营后台，不新增商业化分析。

### 导出功能增强

目标：支持更适合学习复盘的报告导出，例如 PDF/Markdown 报告。

适合文件：`src/lib/backup.ts`、`src/app/history/page.tsx`，必要时新增 report helper。

边界：先做静态报告，不做在线分享或社交传播。

## 质量门

常规前端改动：

```bash
npm run lint
npm run typecheck
npm run test:unit:run
```

涉及构建、Next.js 配置、路由或 API client：

```bash
npm run build
```

涉及 E2E 路径：

```bash
npm run test:e2e
```

涉及 Python 后端：

```bash
cd backend
pytest
```

如果某个命令失败，需要在 `docs/DEVELOPMENT_LOG.md` 记录原因、影响范围和后续处理。

## 明确不做

下一阶段默认不做：

- 支付。
- 订阅。
- 商业化运营配置。
- 排行榜。
- 学习小组。
- 分享/社交。
- 大规模视觉重写。
- 未 mock 的真实 LLM/Azure/Supabase E2E。
- 依赖真实 API key 的 CI。
- 前端框架迁移（保留 Next.js）。
- 全栈 Python 化（仅后端迁移）。
- 删除 Next.js API Routes fallback。
