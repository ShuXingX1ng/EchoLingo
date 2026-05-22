# EchoLingo 任务清单

## ✅ 已完成内容

| 类别 | 完成项 |
|------|--------|
| 核心练习流程 | Part 1/2/3 多模式、AI考官对话、会话反馈、预估分数 |
| 语音功能 | STT 语音输入、TTS 语音输出、语音交互流程、Real-time 模式 |
| 数据管理 | 本地历史、搜索筛选、导出导入、备份恢复、历史复盘回看 |
| 用户体验 | 深色模式、动画效果、PWA、响应式布局、无障碍访问 |
| 统计与目标 | 练习统计、趋势图、目标设定 |
| 稳定性 | 错误边界、网络检测、错误日志 |
| 用户认证 | 邮箱登录、Google OAuth、云端数据同步 |
| 内容丰富 | 话题库扩充至 36 个、录音回放、AI 个性化记忆 |
| 平台化 | 管理后台、学习路径推荐、国际化 (中英文) |
| 模拟考试 | Part 1→2→3 完整流程、计时器、阶段指示、综合反馈 |
| 错误标注 | 反馈中具体标注语法/词汇/流利度错误并给出纠正 |
| 发音评估 | Azure Pronunciation Assessment 集成，支持单词级和音素级评分 |
| 跟读练习 | 听标准发音后模仿跟读，Azure 发音评估对比差异并给出反馈 |
| Azure TTS | 浏览器 TTS 替换为 Azure Neural TTS，11 种音色可选 |
| 学习提醒 | 考试倒计时、每日练习提醒、连续练习天数统计 |
| 学习复盘 | 练习/考试/历史详情统一复用学习复盘面板，提供 Top 3 优先项、下一步练习入口和可折叠详情 |
| 项目协作 | 标准化 `$update-project-docs` skill，并在 AGENTS.md 中要求开发任务后同步更新项目文档 |
| 移动端体验 | 增加手机端底部学习导航，练习页自动隐藏避免遮挡输入 |
| 代码质量 | 清理剩余 lint warnings，当前 `npm run lint` 为 0 warning / 0 error |
| Next 16 配置 | 固定 `turbopack.root`，迁移 `middleware.ts` 到 `proxy.ts`，构建提示清零 |
| 本地开发稳定性 | 修复 AuthProvider Supabase client 循环，默认 dev 切到 webpack fallback |
| 桌面端统一 | DesktopNav 共享组件、gray→slate 颜色统一、布局宽度标准化、i18n 全覆盖（120+ key） |

### 详细完成记录

#### MVP 开发 (Phase 1-7)

- [x] **Phase 1**: 项目初始化 - Next.js + TypeScript + Tailwind CSS
- [x] **Phase 2**: 落地页 - Hero 区域、特性卡片、开始按钮
- [x] **Phase 3**: 文本练习 UI - 聊天界面、消息气泡、输入框
- [x] **Phase 4**: AI 考官 API - `/api/examiner` 端点
- [x] **Phase 5**: 反馈生成 - `/api/feedback` 端点
- [x] **Phase 6**: 本地历史 - localStorage 存储、历史页面
- [x] **Phase 7**: 优化部署 - UI 响应式、错误处理、README

#### 语音功能升级 (Phase 1-5)

- [x] **语音 Phase 1**: 语音输入 (STT) - VoiceInput 组件
- [x] **语音 Phase 2**: 语音输出 (TTS) - VoiceOutput 组件
- [x] **语音 Phase 3**: 语音交互整合 - VoiceControls 组件
- [x] **语音 Phase 4**: 用户体验优化 - 设置页面、音波可视化
- [x] **语音 Phase 5**: Real-time 模式 - 流式识别、超时打断

#### 全面优化 (Phase 1-11)

- [x] **优化 Phase 1**: UI/UX 优化 - 深色模式、动画、骨架屏
- [x] **优化 Phase 2**: 移动端适配 - PWA、Service Worker
- [x] **优化 Phase 3**: 性能优化 - 缓存、存储优化
- [x] **优化 Phase 4**: 错误处理 - 错误边界、网络检测
- [x] **优化 Phase 5**: 数据管理 - 搜索、筛选、导出
- [x] **优化 Phase 6**: 无障碍访问 - 键盘导航、ARIA
- [x] **优化 Phase 7**: 练习功能扩展 - Part 2/3 支持
- [x] **优化 Phase 8**: 进度统计 - 统计页面、趋势图
- [x] **优化 Phase 9**: 练习目标 - 目标设定、进度追踪
- [x] **优化 Phase 10**: 数据备份 - 导出导入、完整性校验
- [x] **优化 Phase 11**: 错误日志 - 日志收集、查看页面

#### 用户认证系统 (Supabase)

- [x] **认证 Phase 1**: Supabase 集成 - 安装依赖、配置客户端
- [x] **认证 Phase 2**: 用户认证 - 邮箱登录、Google OAuth
- [x] **认证 Phase 3**: 云端同步 - 数据库表结构、会话存储
- [x] **认证 Phase 4**: 数据迁移 - 本地数据迁移到云端

#### 内容丰富 (Phase 1-3)

- [x] **内容 Phase 1**: 话题库扩充 - 从 6 个扩充至 36 个话题，覆盖 10 个类别
- [x] **内容 Phase 2**: 录音回放 - 使用 IndexedDB 存储录音，支持历史回放
- [x] **内容 Phase 3**: AI 个性化记忆 - 错误模式分析、个性化建议

#### 平台化功能 (Phase 3)

- [x] **平台化 Phase 3A**: 数据库基础 - profiles、topics、learning_progress 表
- [x] **平台化 Phase 3B**: 国际化基础设施 - 翻译文件、I18nContext、语言切换
- [x] **平台化 Phase 3C**: 管理后台 - 角色系统、路由保护、话题/用户管理
- [x] **平台化 Phase 3D**: 学习路径推荐 - 进度追踪、推荐引擎、UI 组件
- [x] **平台化 Phase 3E**: i18n 全面铺开 - 所有页面文本国际化

#### 模拟考试

- [x] **模拟考试**: 完整考试流程 - Part 1→2→3 + 阶段指示器 + 计时器 + 综合反馈

#### 学习体验增强

- [x] **错误标注**: 反馈中具体标注语法/词汇/流利度错误，展示原文→纠正对照和解释
- [x] **Part 2 计时**: 模拟考试中 1 分钟准备 + 2 分钟答题倒计时
- [x] **学习路径推荐**: 基于薄弱项智能推荐话题
- [x] **发音评估**: Azure Pronunciation Assessment 集成，支持单词级和音素级评分

#### 跟读练习

- [x] **跟读练习**: 听标准发音后模仿跟读，Azure 发音评估对比差异并给出反馈
- [x] **音频工具提取**: 从 VoiceControls 提取 WAV 编码逻辑到共享模块
- [x] **跟读 Hook**: 状态管理、录音控制、发音评估调用
- [x] **子组件**: 进度指示器、练习卡片、总结页面
- [x] **主页面**: 模式/话题选择 + 练习流程
- [x] **入口**: 首页和设置页面添加跟读练习入口

#### Azure Neural TTS

- [x] **TTS API**: 创建 `/api/tts` 端点，使用 Azure Speech SDK SSML 合成
- [x] **VoiceOutput 重写**: 从浏览器 SpeechSynthesis 切换为 Azure TTS API 调用
- [x] **音色选择**: 11 种 Azure Neural 音色可选，设置页面下拉选择器
- [x] **语速控制**: SSML prosody rate 参数控制播放语速

#### 学习提醒

- [x] **提醒模块**: 考试日期设置、每日提醒开关、提醒时间选择
- [x] **考试倒计时**: 首页展示距考试天数
- [x] **每日练习状态**: 首页展示今日是否已练习
- [x] **连续天数**: 统计连续练习天数

#### Part 2 计时器优化

- [x] **进度条**: 添加可视化进度条，实时显示剩余时间比例
- [x] **醒目显示**: Part 2 阶段显示大型计时器，带颜色编码
- [x] **警告提示**: 准备时间 ≤10 秒和发言时间 ≤30 秒时显示警告信息
- [x] **紧急状态**: 时间 ≤10% 时脉冲动画和红色高亮

#### 学习复盘反馈

- [x] **共享反馈面板**: 抽取 `src/components/FeedbackPanel.tsx`，普通练习和模拟考试统一复用
- [x] **学习闭环**: 展示预估分数、Top 3 下一步学习计划、优势、重点改进项和行动入口
- [x] **发音衔接**: 将低分误读词汇整理为发音练习队列，并提供跟读练习入口
- [x] **详情收纳**: IELTS 评分维度、发音详情、示例答案、错误纠正改为可折叠区域
- [x] **测试覆盖**: 新增 FeedbackPanel 组件测试，验证复盘面板核心内容渲染
- [x] **测试扩展**: 覆盖 FeedbackPanel 发音队列/无队列状态、MobileNav 路由显示/隐藏、practice setup start URL

#### 项目文档追踪

- [x] **文档更新 skill**: 标准化 `.agents/skills/update-dev-log`，添加 `name` / `description` frontmatter
- [x] **自动触发提示**: 添加 `agents/openai.yaml`，提升 skill 在 UI 和隐式调用中的可发现性
- [x] **项目规则**: 在 `AGENTS.md` 中要求完成开发任务后更新三份项目文档
- [x] **校验通过**: 使用 skill-creator 的 `quick_validate.py` 校验 skill 结构

#### 移动端体验与代码质量

- [x] **lint 清零**: 清理未使用导入/变量、头像图片 warning、Hook dependency warning
- [x] **移动底部导航**: 新增 `MobileNav`，手机端提供首页、练习、统计、历史入口
- [x] **练习页避让**: `/practice*` 路由不渲染移动底部导航，避免遮挡聊天输入和语音控制
- [x] **浏览器烟测**: 验证首页存在移动导航结构、练习页隐藏导航、输入框正常、console 无 error/warn

#### Next 16 配置清理

- [x] **Turbopack root**: 在 `next.config.ts` 顶层 `turbopack.root` 固定项目根目录，避免父级 lockfile 触发 root inference warning
- [x] **Proxy 迁移**: 删除 `src/middleware.ts`，新增 `src/proxy.ts` 并将导出函数改为 `proxy`
- [x] **构建输出清理**: `npm run build` 不再出现 workspace root warning 和 middleware deprecated warning

#### 本地开发稳定性

- [x] **AuthProvider 循环修复**: Supabase browser client 使用 `useMemo` 稳定，避免 auth effect 因新对象依赖反复执行
- [x] **dev fallback**: 默认 `npm run dev` 改为 `next dev --webpack`，规避当前 Turbopack dev 首屏编译卡死和内存暴涨
- [x] **Turbopack 对照入口**: 新增 `npm run dev:turbo`
- [x] **CSS 实验链路收敛**: 移除 `experimental.optimizeCss`

#### 历史页学习化

- [x] **历史列表复盘摘要**: 历史列表展示 Band、Top weakness、下一步建议和练习模式
- [x] **历史详情复盘复用**: 抽出 `FeedbackReview`，历史详情复用练习/考试反馈同一套学习复盘 UI
- [x] **能力保留**: 保留历史搜索、排序、导出、备份、删除、批量选择、录音回放和 transcript 查看

#### 桌面端网页统一

- [x] **共享导航组件**: 创建 `DesktopNav`，统一 Logo、导航链接、LanguageSwitcher、UserMenu、MuteButton
- [x] **全页面替换**: 9 个页面（Home、Practice、Exam、Shadowing、Setup、Stats、History、Settings、Admin）统一使用 DesktopNav
- [x] **颜色系统统一**: 全站 gray→slate，主按钮→slate-950，Band 标签→emerald
- [x] **布局宽度标准化**: 统一 max-w-5xl（Home max-w-7xl，Practice 子页面 max-w-4xl）
- [x] **i18n 全覆盖**: History/Settings/Home 约 85 个硬编码字符串替换为 i18n keys，新增 120+ 翻译
- [x] **i18n 参数插值**: i18n.tsx 新增 `{param}` 支持，用于动态文案
- [x] **代码质量**: 清理未使用导入，测试添加 useAuth mock

---

## ❌ 待补齐内容 / Backlog

### 下一阶段优化路线

详见 `docs/NEXT_OPTIMIZATION_PLAN.md`。D2 和 B1 已完成，下一步建议执行 Phase A1。

### Phase A: 学习闭环统一

- [x] 反馈页"专项练习"携带 Top 3 建议或薄弱项进入 `/practice/setup`
- [x] setup 页面展示"本轮训练目标"
- [x] 发音队列联动 `/practice/shadowing`
- [x] 无发音评估时保持默认跟读流程

### Phase B: 历史与统计页学习化

- [x] 历史列表展示 Band、Top weakness、下一步建议
- [x] 历史详情复用学习复盘 UI 或抽取只读复盘组件
- [x] 统计页首屏调整为目标进度、趋势、薄弱项、推荐行动
- [x] 检查统计图表移动端无横向溢出

### Phase C: 移动端核心流程打磨 [暂缓 — 优先网页端]

- [ ] `/practice` 和 `/practice/exam` 小屏输入区不重叠、不被键盘遮挡
- [ ] `/practice/setup` sticky CTA 和 topic chip 手机端可点区域优化
- [ ] 首页手机端主 CTA 保持在首屏或接近首屏

### Phase D: 测试与 CI

- [x] 增加 `MobileNav` 显示/隐藏逻辑组件测试
- [x] 扩展 `FeedbackPanel` 发音队列/无发音队列状态测试
- [x] 覆盖 practice setup 训练类型和 start URL
- [x] 新增 CI 质量门：lint、typecheck、unit test、build
- [ ] 规划 mock 外部 API 的 E2E 测试

### Phase E: 数据与云端同步稳定性

- [x] Review `history.ts`、`supabase-history.ts`、`unified-history.ts` 职责边界
- [x] 明确未登录/已登录/离线时的保存策略
- [x] 检查 error patterns 与 recommendations 是否消费最新复盘结果

### Phase F: 代码结构收敛

- [x] 抽取普通练习与模拟考试的反馈生成/保存共用逻辑
- [x] 抽取语音录音与发音评估调用边界
- [x] 收敛重复 loading / empty / error UI

### Future / Backlog

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 管理员后台 | 话题管理、用户管理、内容审核 | ~~低~~ ✅ |
| 界面国际化 | 中英文切换 | ~~低~~ ✅ |
| 支付系统 / 订阅 | 商业化能力，future/backlog，当前不实施 | Future |
| 社交功能 | 排行榜、学习小组、分享，future/backlog，当前不实施 | Future |

---

## 📋 建议优先级路线

> **当前策略**：优先做好网页端体验，移动端优化暂缓。

### 第一阶段：核心体验 (已完成)

1. ~~**用户系统 + 云端存储** - 解决数据持久化问题~~ ✅
2. ~~**发音评估集成** - 完善语音练习反馈~~ ✅
3. ~~**完整模拟考试模式** - 提供真实考试体验~~ ✅

### 第二阶段：内容丰富 (已完成)

4. ~~**话题库扩充至 30+** - 覆盖雅思常考话题~~ ✅ (36 个话题)
5. ~~**录音回放功能** - 支持用户自我对比~~ ✅
6. ~~**AI 个性化记忆** - 提供针对性练习~~ ✅

### 第三阶段：平台化 (已完成)

7. ~~**管理后台** - 支持内容管理~~ ✅
8. ~~**学习路径推荐** - 智能化学习体验~~ ✅
9. ~~**国际化** - 扩大用户群体~~ ✅

### 第四阶段：网页端优化 (当前)

10. **E2E 测试** - 规划 mock 外部 API 的端到端测试
11. **数据同步稳定性** - 审查 localStorage、Supabase、IndexedDB 职责边界
12. **网页端交互打磨** - 练习流程、反馈展示、历史回看的桌面端体验优化

### 第五阶段：移动端优化 (暂缓)

- `/practice` 和 `/practice/exam` 小屏输入区适配
- `/practice/setup` sticky CTA 和 topic chip 可点区域优化
- 首页手机端主 CTA 首屏位置

### Future / Backlog

- [ ] 支付系统、订阅计划、商业化运营配置
- [ ] 社交功能：排行榜、学习小组、分享

---

## 技术债务

- [ ] 单元测试覆盖持续扩展（已有 topics、backup、audio-utils、FeedbackPanel 发音队列、MobileNav、practice setup 覆盖）
- [ ] E2E 测试
- [ ] 性能监控完善
- [x] lint warnings 清零
- [x] Next 16 构建提示清零（Turbopack root + Proxy 迁移）
- [ ] 处理本机 native binding 签名问题（Next SWC / Vitest Rolldown 在部分启动路径下被 macOS 拒绝 dlopen）
- [ ] 代码文档补充
