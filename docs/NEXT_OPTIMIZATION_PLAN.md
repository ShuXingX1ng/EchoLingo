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

## 当前项目状态

EchoLingo 已经从 MVP 进入稳定化阶段。当前不缺主要功能，下一阶段重点不是继续堆新功能，而是让现有学习路径、数据路径和工程质量更稳定。

已确认完成的核心能力：

- [x] 核心练习流程：IELTS Part 1/2/3、多模式练习、AI 考官对话、会话反馈、预估分数。
- [x] 模拟考试：Part 1 -> Part 2 -> Part 3 完整流程、阶段指示、Part 2 计时、综合反馈。
- [x] 跟读练习：标准发音播放、模仿录音、Azure 发音评估、逐句评分和总结。
- [x] 发音评估：Azure Pronunciation Assessment，支持单词级和音素级评分。
- [x] 学习复盘：`FeedbackPanel` / `FeedbackReview` 统一普通练习、模拟考试和历史详情的复盘 UI。
- [x] 历史页复盘升级：历史列表展示 Band、Top weakness、下一步建议和练习模式，历史详情复用学习复盘。
- [x] 统计页学习化：统计页从图表集合调整为目标进度、趋势、薄弱项和推荐行动。
- [x] 桌面端统一：`DesktopNav` 共享组件，Home/Practice/Exam/Shadowing/Setup/Stats/History/Settings/Admin 统一桌面导航。
- [x] 视觉与文案一致性：gray -> slate，主按钮、Band 标签、页面宽度和 i18n key 统一。
- [x] 组件测试扩展：`FeedbackPanel`、`MobileNav`、`practice/setup` 核心分支已有测试。
- [x] lint 清零：文档记录 `npm run lint` 为 0 warning / 0 error。
- [x] Next 16 配置清理：`turbopack.root` 固定项目根目录，`src/proxy.ts` 替代 deprecated `middleware.ts`。
- [x] CI 基础质量门：`.github/workflows/ci.yml` 已存在，运行 lint、typecheck、unit test、build。
- [x] 数据层第一轮 review：已记录 `history.ts`、`supabase-history.ts`、`unified-history.ts` 职责边界和登录/未登录保存策略。
- [x] 代码结构第一轮收敛：反馈生成/保存逻辑、语音录音边界、聊天 loading/error/suspense UI 已抽取共享模块。

当前工作区 diff 还显示 Phase F 相关改动和文档记录：`VoiceControls`、`useShadowingPractice`、`practice/page.tsx`、`practice/exam/page.tsx` 已进一步使用共享录音和 UI 状态模块。后续 agent 接手前应先确认这些改动是否已经验证并提交。

## 下一阶段总目标

下一阶段目标：把 EchoLingo 从"功能齐全"推进到"体验连续、路径清晰、数据稳定、工程可接手"的状态。

产品侧目标：

- 用户完成一次练习后，能自然进入复盘、历史回看、统计理解和下一次练习。
- 桌面端网页体验先稳定，不急于开展移动端专项打磨。
- 学习建议要尽量来自真实反馈、错误模式和进度，而不是泛化文案。

工程侧目标：

- 质量门稳定可重复：本地和 CI 都能跑 lint、typecheck、unit test、build。
- 数据保存路径清楚：localStorage、Supabase、IndexedDB 的职责边界明确。
- 外部服务可 mock：LLM、Azure、Supabase、audio recording 不阻塞自动化测试设计。
- 每次重构只抽一个明确边界，避免大范围改名、搬文件或跨页面重写。

## 当前优先级

当前推荐顺序：

1. **Phase E：数据与云端同步稳定性深化**，先 review，再做小步、单边界重构。✅
2. **Phase F：代码结构收敛补强**，每次只抽一个仍然重复或职责不清的边界。✅
3. **Phase D3：E2E mock 规划**，先定义路径和 mock 策略，不急着安装 Playwright。✅
4. **Phase C：移动端核心流程打磨** ✅。

明确策略：

- 移动端不是当前最高优先级。
- 商业化、支付、订阅、排行榜、学习小组、分享/社交不进入当前阶段。
- 不做依赖真实 LLM、Azure、Supabase 或外部付费 API 的 E2E。
- 当前先把桌面端网页体验、工程质量、数据路径和后续接手安全性打磨稳定。

---

## Phase A: 学习闭环统一 ✅

目标：让用户每次练习后都知道下一步做什么。

背景：反馈页已经从单纯评分升级为学习复盘入口，需要和下一次练习、跟读练习、历史回看保持一致。

### A1. 复盘结果联动下一次练习 ✅

具体任务：

- [x] 将 `FeedbackPanel` 的 Top 3 建议转化为可携带的练习参数。
- [x] 点击"专项练习"时，把建议或薄弱项带到 `/practice/setup`。
- [x] 在 setup 页面显示"本轮训练目标"，例如 fluency、grammar、pronunciation。
- [x] 保持后端反馈 JSON 结构不变，优先用前端状态或 query 参数串联。

涉及文件：

- `src/components/FeedbackPanel.tsx`
- `src/app/practice/setup/page.tsx`
- `src/app/practice/page.tsx`
- `src/app/practice/exam/page.tsx`

验收标准：

- [x] 用户从反馈页点击后能进入带目标提示的练习设置页。
- [x] 不真实调用 LLM 的情况下也能通过组件/页面测试覆盖主要 UI。

不做：

- 不修改 LLM feedback schema。
- 不新增后端推荐服务。

### A2. 跟读练习衔接发音队列 ✅

具体任务：

- [x] 将误读词汇从 `FeedbackPanel` 带到 `/practice/shadowing`。
- [x] 跟读 setup 中展示"本次优先练习词"。
- [x] 如果没有发音评估结果，保持当前默认跟读流程。

涉及文件：

- `src/components/FeedbackPanel.tsx`
- `src/app/practice/shadowing/page.tsx`
- `src/hooks/useShadowingPractice.ts`

验收标准：

- [x] 有误读词时，跟读页能呈现优先词汇。
- [x] 无误读词时，不影响现有 shadowing 流程。

不做：

- 不强制所有练习都生成发音队列。
- 不依赖真实 Azure key 做自动化测试。

## Phase B: 历史与统计页学习化 ✅

目标：历史页和统计页不只是记录，而是帮助用户决定下一步。

背景：EchoLingo 已有历史、统计、目标和推荐能力，Phase B 的重点是把这些信息组织成学习闭环。

### B1. 历史页复盘升级 ✅

具体任务：

- [x] 历史列表优先展示 Band、Top weakness、下一步建议和练习模式。
- [x] 详情页复用从 `FeedbackPanel` 抽出的 `FeedbackReview`，避免两套反馈 UI 分叉。
- [x] 保留 transcript、导出、删除、备份、搜索、排序、批量选择和录音回放能力。

涉及文件：

- `src/app/history/page.tsx`
- `src/components/FeedbackPanel.tsx`
- `src/lib/history.ts`
- `src/lib/unified-history.ts`

验收标准：

- [x] 历史详情里的反馈视觉和当前复盘面板保持一致。
- [x] 历史页搜索/筛选/导出不回归。

不做：

- 不重写历史页数据层。
- 不删除已有导出、备份和录音回放能力。

### B2. 统计页改成学习进度页 ✅

具体任务：

- [x] 将统计页从图表集合调整为"目标进度 + 最近趋势 + 薄弱项 + 推荐行动"。
- [x] 首屏避免过多卡片堆叠，保持学习软件风格。
- [x] 检查统计图表小屏无横向溢出。

涉及文件：

- `src/app/stats/page.tsx`
- `src/lib/stats.ts`
- `src/lib/recommendations.ts`
- `src/lib/supabase-progress.ts`

验收标准：

- [x] 用户在统计页首屏能看到当前目标、趋势、下一步建议。
- [x] 图表在手机端不横向溢出。

不做：

- 不新增商业化分析面板。
- 不把统计页改成运营后台。

## Phase D: 测试与 CI ✅

目标：把当前手动验证沉淀成稳定质量门，并为后续 E2E 做 mock-first 设计。

背景：组件测试和 CI 基础工作已经完成。下一步不是重复创建 CI，而是补齐 E2E 的规划边界，确保未来自动化测试不依赖真实外部服务。

### D1. CI 工作流 ✅

当前状态：已完成。`.github/workflows/ci.yml` 已存在，`package.json` 已包含所需 scripts。

已确认 scripts：

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test:unit:run`
- [x] `npm run build`

已确认 CI 配置：

- [x] `npm ci`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test:unit:run`
- [x] `npm run build`
- [x] push 触发。
- [x] pull_request 触发。
- [x] 使用 Node.js 20，与当前依赖和 `@types/node` 主版本匹配。
- [x] 不使用真实 secret。
- [x] 不依赖真实 LLM、Azure、Supabase 或外部付费 API。

涉及文件：

- `.github/workflows/ci.yml`
- `package.json`
- `docs/PROJECT_CONTEXT.md`
- `docs/TASKS.md`
- `docs/DEVELOPMENT_LOG.md`

验收标准：

- [x] CI 文件存在。
- [x] YAML 结构清楚，包含 checkout、setup-node、npm ci、lint、typecheck、unit test、build。
- [x] 本地质量门命令已记录：`npm run lint && npm run typecheck && npm run test:unit:run && npm run build`。
- [x] 如果未来某个命令失败，需要在 `docs/DEVELOPMENT_LOG.md` 记录原因、影响范围和后续处理。

不做：

- 不在 CI 中配置真实 API key。
- 不在 CI 中跑依赖真实 LLM、Azure、Supabase 的测试。
- 不把 Playwright 安装混入 D1。

### D2. 组件测试扩展 ✅

已完成：

- [x] `MobileNav` 路由隐藏/显示逻辑。
- [x] `FeedbackPanel` 发音队列/无发音队列状态。
- [x] `practice/setup` 的训练类型和 start URL。

涉及文件：

- `src/components/FeedbackPanel.test.tsx`
- `src/components/MobileNav.test.tsx`
- `src/app/practice/setup/page.test.tsx`

验收标准：

- [x] 单元/组件测试覆盖关键分支。
- [x] `npm run test:unit:run` 稳定通过。

不做：

- 不追求覆盖率数字本身。
- 不为稳定 UI 快照引入脆弱的大量 snapshot。

### D3. E2E 规划 ✅

目标：先定义最值得覆盖的路径、mock 边界和验收标准，暂时不急着安装 Playwright。

背景：EchoLingo 的核心路径依赖 LLM、Azure pronunciation、Supabase auth/history 和浏览器录音。直接做真实 API E2E 会慢、不稳定、需要 secret，也不适合默认 CI。

#### D3.1 候选 E2E 路径与 smoke 验收

| 路径 | 页面职责 | 关键 smoke 验收 |
|------|---------|----------------|
| `/` | 落地页，学习进度入口 | DesktopNav 可见；主 CTA（开始练习/模拟考试/跟读）链接可点；无 console error |
| `/practice/setup` | 模式与话题选择 | 三种训练类型卡片渲染；四种模式（Part1/2/3/Full）可选；话题列表渲染；start URL 拼接正确 |
| `/practice` | 普通练习聊天页 | 初始考官消息加载；输入框和 Send 按钮可见；text/voice 模式切换可用；结束会话按钮可见 |
| `/practice/exam` | 模拟考试页 | Part 1 考官 greeting 加载；阶段指示器渲染；输入框可见；End Exam 按钮可见 |
| `/practice/shadowing` | 跟读练习页 | setup 视图渲染；模式和话题选择可用；start 按钮可点 |
| `/history` | 历史记录页 | 空状态引导 CTA 可见；加载状态不崩溃；搜索框渲染 |
| `/stats` | 学习进度页 | 空状态引导 CTA 可见；加载状态不崩溃；DesktopNav stats 高亮 |

#### D3.2 外部依赖 mock 方案

**1. LLM API（`/api/examiner` + `/api/feedback`）**

- 依赖：`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 环境变量
- 文件：`src/app/api/examiner/route.ts`、`src/app/api/feedback/route.ts`
- mock 策略：
  - E2E 层：拦截 `fetch("/api/examiner", ...)` 和 `fetch("/api/feedback", ...)`，返回固定 JSON 响应
  - API route 层：不修改业务代码；通过 MSW（Mock Service Worker）或 Playwright `page.route()` 拦截
- mock 响应示例：
  ```json
  // examiner
  { "message": "That's interesting. Can you tell me more about your hometown?" }
  // feedback
  {
    "estimatedBand": 6.5,
    "fluencyAndCoherence": "Good fluency with minor hesitations.",
    "lexicalResource": "Adequate vocabulary range.",
    "grammarRangeAndAccuracy": "Mix of simple and complex structures.",
    "pronunciation": "Clear pronunciation overall.",
    "strengths": ["Good use of examples"],
    "weaknesses": ["Limited complex vocabulary"],
    "improvementSuggestions": ["Practice using more advanced vocabulary", "Work on linking words"],
    "improvedSampleAnswer": "Sample improved answer..."
  }
  ```

**2. Azure TTS（`/api/tts`）**

- 依赖：`AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION`
- 文件：`src/app/api/tts/route.ts`、`src/components/VoiceOutput.tsx`
- mock 策略：
  - E2E 层：拦截 `fetch("/api/tts", ...)`，返回空音频 blob 或短静音 WAV
  - 或直接 stub `VoiceOutput` 的 audio play 调用为 noop

**3. Azure Pronunciation（`/api/pronunciation`）**

- 依赖：同上 Azure 凭据
- 文件：`src/app/api/pronunciation/route.ts`
- mock 策略：
  - E2E 层：拦截 `fetch("/api/pronunciation", ...)`，返回固定评估结果 JSON
- mock 响应示例：
  ```json
  {
    "score": 85,
    "accuracyScore": 82,
    "fluencyScore": 88,
    "completenessScore": 91,
    "words": [{ "word": "hello", "score": 90, "accuracyScore": 88 }],
    "summary": "Good pronunciation."
  }
  ```

**4. Supabase Auth / History**

- 依赖：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 文件：`src/lib/auth-context.tsx`、`src/lib/supabase-history.ts`、`src/lib/unified-history.ts`
- mock 策略：
  - E2E 层：未登录场景不需要 mock Supabase（走 localStorage 路径）
  - 已登录场景：stub `useAuth` 返回 `{ user: { id: "test-user" } }`，拦截 Supabase REST 请求返回空数据
  - 或设置测试环境变量指向 Supabase 本地模拟（未来考虑）

**5. Audio Recording / Microphone**

- 依赖：浏览器 `MediaRecorder` / `getUserMedia` API
- 文件：`src/hooks/useAudioRecorder.ts`、`src/components/VoiceInput.tsx`、`src/components/VoiceControls.tsx`
- mock 策略：
  - Playwright Chromium：使用 `--use-fake-device-for-media-stream` 和 `--use-fake-ui-for-media-stream` 启动参数
  - 或通过 `page.context().grantPermissions(["microphone"])` 授权
  - 不实际录制音频，VoiceInput/VoiceControls 的 STT 结果通过 stub 注入

**6. localStorage**

- 文件：`src/lib/history.ts`、`src/lib/reminders.ts`、`src/lib/goals.ts`
- mock 策略：
  - 默认不 mock，E2E 测试使用 fresh context（Playwright 每个测试独立 browserContext）
  - 需要预置数据时，通过 `page.evaluate()` 直接写入 localStorage

#### D3.3 测试层级划分

| 层级 | 工具 | 覆盖范围 | 是否需要 mock |
|------|------|---------|--------------|
| 单元/组件测试 | Vitest + RTL | 纯 UI 渲染、参数拼接、工具函数 | 不需要外部 mock，已有覆盖 |
| E2E 测试（推荐优先） | Playwright | 跨页面导航、关键交互路径、状态转换 | 需要 mock 外部 API |
| 真实 API E2E | Playwright + 真实 key | 完整端到端（不纳入 CI） | 不 mock，手动运行 |

#### D3.4 推荐 E2E 测试用例（按优先级）

**P0 — 核心路径 smoke：**

1. **首页 → setup → 练习 → 结束 → 反馈 → 历史**
   - 从首页点击"开始练习"
   - setup 页选择 Part 1 + 任意话题
   - 练习页发送一条消息，收到 mock 考官回复
   - 结束会话，等待 mock 反馈
   - 反馈面板展示预估 Band
   - 导航到历史页，确认会话已保存

2. **首页 → 模拟考试**
   - 从首页点击"模拟考试"
   - 考试页 Part 1 greeting 加载
   - 阶段指示器可见

3. **历史页空状态**
   - 无数据时展示空状态引导 CTA

4. **统计页空状态**
   - 无数据时展示空状态引导 CTA

**P1 — 关键交互：**

5. **setup 页参数传递**
   - 带 `?focus=fluency,grammar` 参数访问 setup
   - 训练目标横幅正确显示

6. **练习页 text/voice 模式切换**
   - 切换到 voice 模式，VoiceControls 可见
   - 切换回 text 模式，输入框可见

7. **考试 Part 2 计时器**
   - 进入 Part 2 阶段后计时器可见

**P2 — 边界场景：**

8. **API 错误处理**
   - examiner API 返回 500，页面展示错误横幅
   - feedback API 返回 500，页面展示错误提示

9. **深色模式**
   - 切换深色模式后页面不崩溃

#### D3.5 Playwright 安装前置条件 ✅

Playwright 已安装并配置完成：

- [x] mock 方案已验证可行（使用 Playwright `page.route()` 拦截 API）
- [x] CI 工作流稳定通过（lint、typecheck、unit test、build）
- [x] E2E 运行环境：本地（`npm run test:e2e`），webServer 自动启动 dev server
- [x] API mock 层：纯用 Playwright `page.route()`，未引入 MSW
- [x] 15 个 smoke tests 覆盖 P0/P1/P2（含跟读 setup、考试页、话题选择、反馈错误、深色模式）

#### D3.6 文件清单

不涉及业务代码修改。规划文档更新：

- `docs/NEXT_OPTIMIZATION_PLAN.md` — 本章节

验收标准：

- [x] 文档中列出每条候选 E2E 路径、mock 点和不依赖 secret 的验收标准。
- [x] 明确暂不做真实 API key E2E。
- [x] 明确是否需要安装 Playwright，以及安装前的判断标准。
- [x] 未修改业务代码。

## Phase E: 数据与云端同步稳定性 ✅

目标：让 localStorage、Supabase、IndexedDB、progress、error patterns 和 recommendations 的数据路径更清楚，避免重复保存、覆盖、丢失或不同步。

背景：项目已经有本地历史、云端历史、统一历史入口、错误模式、推荐引擎、学习进度、录音回放等多个数据源。Entry 29 已完成第一轮职责边界 review，下一步应在不大改数据层的前提下深化数据流说明，并只对最小边界做重构。

### E1. 数据流 review 深化 ✅

review 结论已记录在 `docs/DEVELOPMENT_LOG.md` Entry 33。关键发现：

**🔴 P0 — `unified-history.ts` 是死代码**

`unified-history.ts` 设计了云端+本地双写逻辑，但实际只有 `DataMigration.tsx` 引用它。核心写入路径 `feedback-actions.ts` 直接调用 `history.ts`，完全绕过云端保存。`history/page.tsx` 和 `stats.ts` 也直接读取 `history.ts`，不读云端数据。

**🟡 P1 — Session ID 不一致 / error-patterns 不跨设备 / backup 不完整**

最小可行重构建议（按优先级）：

1. `feedback-actions.ts` 第 2 行 `import { saveSession } from "./history"` → 改为 `"./unified-history"`
2. 统一 Session ID 为 `crypto.randomUUID()`
3. `history/page.tsx` 改用 `unified-history.ts`（需处理 async）
4. `stats.ts` 改用 `unified-history.ts`（需处理 async）
5. `backup.ts` 增加 error-patterns 导出

具体任务：

- [x] 输出当前数据流说明：
  - 未登录：会话、反馈、错误模式、进度、录音如何保存。
  - 已登录：云端保存、本地备份、读取优先级如何工作。
  - 离线或 API 失败：是否降级到本地，用户是否可恢复。
- [x] 梳理每个文件职责：
  - `src/lib/history.ts`
  - `src/lib/supabase-history.ts`
  - `src/lib/unified-history.ts`
  - `src/lib/error-patterns.ts`
  - `src/lib/recommendations.ts`
  - `src/lib/supabase-progress.ts`
  - `src/lib/feedback-actions.ts`
  - `src/lib/recordings.ts`（IndexedDB 录音存储）
- [x] 检查是否存在重复保存、覆盖、丢失、不同步：
  - `saveSession` 是否同时触发本地和云端写入。
  - `saveSessionAndUpdateLearning` 是否清楚区分保存会话、更新错误模式、记录 progress。
  - 历史页、统计页、复盘页是否读取同一份最终结果。
  - 录音文件是否和 session id 稳定关联。
- [x] 给出最小可行重构建议：
  - 每条建议只包含一个明确边界。
  - 先写 review 结论，再决定是否改代码。
- [x] 判断需要补充哪些测试。

候选文件：

- `src/lib/history.ts`
- `src/lib/supabase-history.ts`
- `src/lib/unified-history.ts`
- `src/lib/error-patterns.ts`
- `src/lib/recommendations.ts`
- `src/lib/supabase-progress.ts`
- `src/lib/feedback-actions.ts`
- `src/lib/audio-utils.ts`
- `src/hooks/useAudioRecorder.ts`
- `src/hooks/useShadowingPractice.ts`
- `src/app/history/page.tsx`
- `src/app/stats/page.tsx`

风险点：

- 数据层牵涉历史页、统计页、练习复盘和登录状态，直接重构容易引入回归。
- Supabase、localStorage 和 IndexedDB 的异步/同步 API 不一致。
- 离线、未登录、已登录三条路径容易在测试中只覆盖其中一条。

验收标准：

- [x] 先产出 review 结论，记录在 `docs/DEVELOPMENT_LOG.md` 或当前任务指定文档中。
- [x] 不直接大改数据层。
- [x] 如果重构，只做一个明确边界，例如只调整保存入口或只补一类测试。
- [x] 不破坏历史页、统计页、复盘页。
- [x] 质量门至少跑：`npm run lint && npm run typecheck && npm run test:unit:run`；涉及 build 风险时再跑 `npm run build`。

不做：

- 不迁移数据库 schema，除非另开明确任务。
- 不引入新的云存储服务。
- 不删除本地备份路径。
- 不实现商业化、订阅、配额或运营统计。

### E2. 错误模式与推荐联动补强 ✅

具体任务：

- [x] 检查 `error-patterns.ts` 是否只消费 `feedback.weaknesses`。
- [x] 评估是否应消费 `errorAnnotations` 和 `improvementSuggestions`。
- [x] 检查 `recommendations.ts` 的推荐理由是否能关联最近几次练习的具体错误。
- [x] 设计最小数据结构调整，优先兼容旧历史数据。
- [x] 能补测试就补测试，尤其是旧数据缺字段时的降级。

候选文件：

- `src/lib/error-patterns.ts`
- `src/lib/recommendations.ts`
- `src/lib/supabase-progress.ts`
- `src/lib/feedback-actions.ts`
- `src/types/index.ts`

风险点：

- 旧历史记录可能没有 `errorAnnotations`。
- 推荐理由如果过度依赖 LLM 文案，可能出现空值或泛化内容。
- 数据结构变更需要兼容 localStorage 旧数据。

验收标准：

- [x] 推荐理由比泛化提示更贴近最近反馈。
- [x] 旧数据缺少新字段时不崩溃。
- [x] 相关测试覆盖有字段/无字段两种路径。

不做：

- 不新增真实 LLM 调用来生成推荐理由。
- 不让推荐系统依赖在线状态。

## Phase F: 代码结构收敛 ✅

目标：减少重复页面逻辑，为后续优化留出空间，但保持有限范围、可测试、每次只抽一个边界。

背景：Entry 30 和 Entry 31 已经抽取了 `feedback-actions.ts`、`useAudioRecorder` 和 `ChatUIStates.tsx`。后续 Phase F 不应继续大面积搬文件，而是针对仍然重复或职责不清的点做小步收敛。

已完成：

- [x] 普通练习和模拟考试的反馈生成/保存共用逻辑。
- [x] `saveSession`、`updateErrorPatterns`、`recordProgress` 的组合入口初步收敛到 `saveSessionAndUpdateLearning`。
- [x] 语音录音边界抽取到 `useAudioRecorder`。
- [x] 跟读练习改用共享录音和发音评估调用。
- [x] 聊天 loading / error / suspense / feedback loading UI 抽到 `ChatUIStates.tsx`。

### F1. 练习结束保存流程边界复查 ✅

具体任务：

- [x] Review `saveSessionAndUpdateLearning` 是否职责过宽。
- [x] 明确 `saveSession`、`updateErrorPatterns`、`recordProgress` 的成功/失败处理边界。
- [x] 检查普通练习和模拟考试是否对保存失败给出一致反馈。
- [x] 若要改，只调整一个边界，例如统一错误返回结构。

候选文件：

- `src/lib/feedback-actions.ts`
- `src/app/practice/page.tsx`
- `src/app/practice/exam/page.tsx`
- `src/lib/unified-history.ts`
- `src/lib/error-patterns.ts`
- `src/lib/supabase-progress.ts`

风险点：

- 保存流程失败可能影响历史、统计、推荐三个区域。
- 把太多职责塞进一个 helper 会让后续调试困难。

验收标准：

- [x] 职责边界有明确结论。
- [x] 如果改代码，普通练习和模拟考试均能结束并保存。
- [x] 至少通过 lint、typecheck、unit test。

不做：

- 不一次性重写数据层。
- 不大规模重命名保存相关文件。

### F2. setup 页面重复 UI 逻辑收敛 ✅

具体任务：

- [x] Review `/practice/setup` 中 CTA、mode card、topic selector 是否存在重复结构。
- [x] 如确有重复，只抽一个小组件或 helper。
- [x] 保持页面文案、i18n key 和 URL 参数行为不变。
- [x] 补充或更新 setup 页面测试。

候选文件：

- `src/app/practice/setup/page.tsx`
- `src/app/practice/setup/page.test.tsx`
- `src/lib/i18n.tsx`
- `src/locales/en.json`
- `src/locales/zh.json`

风险点：

- setup 页面承载普通练习、跟读、专项目标等入口，抽象过度会降低可读性。
- URL 参数拼接一旦回归，会打断学习闭环。

验收标准：

- [x] URL 参数行为不变。
- [x] setup 页面测试通过。
- [x] 不引入新的视觉风格。

不做：

- 不为了抽象而抽象。
- 不把 setup 页面重写成全新流程。

### F3. UI 状态组件使用范围复查 ✅

具体任务：

- [x] 检查 `ChatUIStates.tsx` 是否只服务聊天/反馈场景。
- [x] 判断 history/stats/settings 是否存在类似 loading/empty/error，但不要强行复用聊天组件。
- [x] 若需要共享，另开更通用的边界，例如 `EmptyState`，且只改一个页面。

候选文件：

- `src/components/ChatUIStates.tsx`
- `src/app/history/page.tsx`
- `src/app/stats/page.tsx`
- `src/app/settings/page.tsx`

风险点：

- 聊天状态组件和列表/统计空状态语义不同，盲目复用会让 UI 变怪。
- 通用组件太早抽象会增加 props 复杂度。

验收标准：

- [x] 明确是否继续复用或停止扩散。
- [x] 如果抽象新组件，只覆盖一个实际重复场景。
- [x] 现有页面视觉不回归。

不做：

- 不一次性重构多个页面。
- 不创建过度通用的"万能状态组件"。

## Phase C: 移动端核心流程打磨（推迟）

目标：手机端能顺畅完成"开始练习 -> 回答 -> 结束 -> 复盘 -> 下一步"。

背景：项目已有响应式布局、PWA 和 `MobileNav`，但当前策略是优先稳定桌面端网页体验和工程质量。移动端只在发现严重阻塞问题时临时处理。

当前状态：**进行中**（C1 已完成，C2 部分完成）。

### C1. `/practice` 与 `/practice/exam` 小屏练习流程 ✅

具体任务：

- [x] 练习页上下文条手机端隐藏（`hidden sm:block`），节省 ~168px
- [x] VoiceInput 临时文字溢出修复（`overflow-hidden min-w-0` + `shrink-0`）
- [x] 考试页 Part 2 计时器移动端紧凑化（减少 padding/字号/进度条高度）
- [x] 保持 `/practice*` 路由不渲染移动底部导航，避免遮挡输入区
- [x] setup 页 topic chip 触屏高度优化（`py-2` → `py-2.5 sm:py-2`）

候选文件：

- `src/app/practice/page.tsx`
- `src/app/practice/exam/page.tsx`
- `src/components/MobileNav.tsx`
- `src/components/VoiceControls.tsx`

风险点：

- 移动端键盘行为在浏览器间差异较大。
- 练习页包含语音、输入、状态条和反馈弹窗，局部 CSS 改动容易影响桌面端。

验收标准：

- [ ] 390px 宽度下输入区、发送按钮、语音按钮不重叠。
- [ ] 练习中、loading、error、feedback 状态均无横向滚动。
- [ ] 桌面端布局不回归。

不做：

- 当前不做移动端专项视觉重写。
- 当前不引入新的手势系统。

### C2. `/practice/setup`、首页、history/stats 小屏体验 ✅

具体任务：

- [x] 检查 `/practice/setup` sticky CTA 和 topic chip 手机端可点区域。
- [x] 首页 hero 缩小，CTA 更靠近首屏（`text-3xl` + 减少间距）
- [x] 首页 Current Target 边框响应式（堆叠时用 `border-t`）
- [x] 历史页工具栏 `flex-wrap` 防溢出
- [x] 历史页导出下拉改为 `onClick` toggle（触屏可用）
- [x] 历史页删除按钮手机端始终可见
- [x] 统计页 QuickStat gap 缩小，ScoreCard 改为单列

候选文件：

- `src/app/practice/setup/page.tsx`
- `src/app/page.tsx`
- `src/app/history/page.tsx`
- `src/app/stats/page.tsx`

风险点：

- 首页和 setup 页面已经经过桌面端统一，移动端调整要避免重新引入不一致颜色和宽度。
- history/stats 信息密度高，过度压缩会损失学习复盘价值。

验收标准：

- [ ] 手机端无需横向滚动。
- [ ] 主要 CTA 可见且可点击。
- [ ] history/stats 关键学习信息仍可快速扫描。

不做：

- 不把移动端作为当前最高优先级。
- 不为了移动端改动重写桌面端页面结构。

---

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
- 移动端专项优化，除非桌面端核心质量门已稳定或发现严重阻塞问题。
- Python 重写或大规模技术栈迁移，除非另开明确迁移任务。

## 推荐下一项开发任务

Phase A-F 全部完成，E2E 测试已落地（15 个 smoke tests），Phase C 移动端打磨已全部完成。下一步可选方向：

1. **E2E 测试继续扩展** — 补充更多交互路径测试（跟读完整流程、考试 Part 2 计时器等）。
2. **单元测试覆盖扩展** — 已有 7 文件 / 45 测试，可继续补充关键模块覆盖。
3. **新功能探索** — 根据用户反馈决定优先级。
4. **Python 化评估** — API 路由层（examiner、feedback）适合逐步迁移到 Python 服务。
