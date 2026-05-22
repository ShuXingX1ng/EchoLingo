# EchoLingo 下一阶段优化方案

## 新窗口接手方式

新窗口建议先阅读：

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/TASKS.md`
4. `docs/DEVELOPMENT_LOG.md`
5. `docs/NEXT_OPTIMIZATION_PLAN.md`
6. `git diff`

当前项目已经完成核心练习、模拟考试、跟读、发音评估、学习复盘、桌面端统一（DesktopNav 共享组件、颜色/宽度/i18n 统一）、D2 组件测试扩展、B1 历史页复盘升级、lint 清零、Next 16 配置清理。商业化、支付、订阅和社交能力暂不实施，继续保留在 future/backlog。

## 优化目标

下一阶段不做大范围新功能，重点把 EchoLingo 从"功能齐全"推进到"学习体验更连续、产品结构更稳定、验证体系更可靠"。

**当前优先级说明**：移动端暂不作为重点，优先把网页端（桌面端）体验打磨到位。移动端相关任务推迟到网页端核心体验完善后再考虑。

优先顺序：

1. ~~学习闭环统一~~ ✅
2. ~~历史与统计页学习化~~ ✅
3. ~~桌面端网页统一~~ ✅
4. 测试与 CI
5. 数据与云端同步稳定性
6. 代码结构收敛
7. 移动端核心流程打磨（推迟）

## Phase A: 学习闭环统一

目标：让用户每次练习后都知道下一步做什么。

### A1. 复盘结果联动下一次练习 ✅

- 将 `FeedbackPanel` 的 Top 3 建议转化为可携带的练习参数。
- 点击“专项练习”时，把建议或薄弱项带到 `/practice/setup`。
- 在 setup 页面显示“本轮训练目标”，例如 fluency、grammar、pronunciation。
- 保持后端反馈 JSON 结构不变，优先用前端状态或 query 参数串联。

验收：
- 用户从反馈页点击后能进入带目标提示的练习设置页。
- 不真实调用 LLM 的情况下也能通过组件/页面测试覆盖主要 UI。

### A2. 跟读练习衔接发音队列 ✅

- 将误读词汇从 `FeedbackPanel` 带到 `/practice/shadowing`。
- 跟读 setup 中展示“本次优先练习词”。
- 如果没有发音评估结果，保持当前默认跟读流程。

验收：
- 有误读词时，跟读页能呈现优先词汇。
- 无误读词时，不影响现有 shadowing 流程。

## Phase B: 历史与统计页学习化

目标：历史页和统计页不只是记录，而是帮助用户决定下一步。

### B1. 历史页复盘升级 ✅

- 已完成：历史列表优先展示 Band、Top weakness、下一步建议和练习模式。
- 已完成：详情页复用从 `FeedbackPanel` 抽出的 `FeedbackReview`，避免两套反馈 UI 分叉。
- 已完成：保留原有 transcript、导出、删除、备份、搜索、排序、批量选择和录音回放能力。

验收：
- 历史详情里的反馈视觉和当前复盘面板保持一致。
- 历史页搜索/筛选/导出不回归。

### B2. 统计页改成学习进度页 ✅

- 将统计页从图表集合调整为“目标进度 + 最近趋势 + 薄弱项 + 推荐行动”。
- 首屏避免过多卡片堆叠，保持学习软件风格。
- 强化移动端扫描体验。

验收：
- 用户在统计页首屏能看到当前目标、趋势、下一步建议。
- 图表在手机端不横向溢出。

## Phase C: 移动端核心流程打磨（推迟）

目标：手机端能顺畅完成"开始练习 -> 回答 -> 结束 -> 复盘 -> 下一步"。

> **注意**：此阶段暂时推迟，优先完成桌面端体验和测试/CI 建设。移动端在网页端核心体验完善后再处理。

### C1. 移动端练习页输入区

- 检查 `/practice` 和 `/practice/exam` 在小屏下的 header、context strip、输入区高度。
- 必要时折叠次要信息，保留模式、话题、结束按钮、输入控件。
- 避免键盘弹出后内容被遮挡。

验收：
- 390px 宽度下输入框、发送按钮、语音按钮不重叠。
- 练习页仍不显示底部移动导航。

### C2. 设置页和首页移动端密度

- 检查 `/practice/setup` 的 sticky CTA 和 topic chip 在手机端的可点区域。
- 首页首屏确保主 CTA 在手机端不被推到过深位置。

验收：
- 手机端无需横向滚动。
- 主要 CTA 在首屏或接近首屏位置。

## Phase D: 测试与 CI

目标：把目前手动验证变成稳定质量门。

### D1. CI 工作流

- 新增 GitHub Actions 或等价 CI，运行：
  - `npm ci`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:unit:run`
  - `npm run build`

验收：
- CI 文件存在并通过本地语法检查。
- README 或 docs 记录本地质量门。

### D2. 组件测试扩展 ✅

已完成：
- `MobileNav` 路由隐藏/显示逻辑
- `FeedbackPanel` 发音队列/无发音队列状态
- `Practice setup` 的训练类型和 start URL

验收：
- 单元/组件测试覆盖关键分支。
- `npm run test:unit:run` 稳定通过。

### D3. E2E 规划

暂不急着大规模安装 Playwright。若要做：
- 先覆盖静态路径加载：`/`、`/practice/setup`、`/stats`、`/history`
- 对 LLM/Azure 调用做 mock，避免真实外部请求

验收：
- E2E 不依赖真实 API key。

## Phase E: 数据与云端同步稳定性

目标：减少 localStorage、Supabase、IndexedDB 多源数据的割裂感。

### E1. 历史数据统一

- 审查 `history.ts`、`supabase-history.ts`、`unified-history.ts` 的职责边界。
- 明确未登录/已登录/离线时的保存策略。
- 写入文档，必要时补测试。

验收：
- 新窗口先做 code review，再决定是否重构。
- 不直接大改数据层。

### E2. 错误模式和学习路径联动

- 检查 `error-patterns.ts` 与 `recommendations.ts` 是否能消费最新复盘结果。
- 让推荐理由更贴近反馈中的 weakness/suggestions。

验收：
- 推荐不再像泛化提示，而是能关联最近几次练习。

## Phase F: 代码结构收敛

目标：减少重复页面逻辑，为后续优化留出空间。

优先候选：

- 普通练习与模拟考试的反馈生成逻辑
- 语音录音/发音评估调用逻辑
- 练习结束后的 saveSession、updateErrorPatterns、recordProgress
- 重复的 loading / empty / error UI

验收：
- 每次只抽一个明确边界。
- 抽象必须有测试或至少通过现有质量门。

## 明确不做

下一阶段默认不做：

- 支付、订阅、商业化运营配置
- 排行榜、学习小组、分享等社交功能
- 大规模视觉重写
- 未 mock 的真实 LLM/Azure E2E 测试
- 移动端专项优化（推迟到网页端核心体验完善后）

## 推荐下一步

下一项建议做：

**Phase D1: CI 工作流。**

原因：

- Phase A（学习闭环统一）、B（历史与统计页学习化）、桌面端统一均已完成。
- 移动端暂不优先，下一步应建立自动化质量门，确保后续改动不会引入回归。
- CI 建立后，再考虑 Phase E（数据同步稳定性）和 Phase F（代码结构收敛）。
