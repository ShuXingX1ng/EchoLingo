# EchoLingo 开发日志

## 2026-05-13

### Entry 1: 初始 MVP UI 设置

**完成阶段**: Phase 1-3

**完成内容**:
- 初始化 Next.js 项目 (TypeScript + Tailwind CSS)
- 创建基础布局和 EchoLingo 元数据
- 构建落地页 (Hero 区域、特性卡片、开始按钮)
- 构建 `/practice` 页面 (聊天界面、模拟考官响应)

**关键文件**:
- `.env.example` - 环境变量模板
- `src/types/index.ts` - TypeScript 类型定义
- `src/app/layout.tsx` - 应用布局
- `src/app/page.tsx` - 落地页
- `src/app/practice/page.tsx` - 练习页面

---

### Entry 2: LLM API 集成和反馈

**完成阶段**: Phase 4-5

**完成内容**:
- 创建 `/api/examiner` 端点 (AI 考官问题生成)
- 创建 `/api/feedback` 端点 (结构化反馈生成)
- 替换模拟考官为真实 API 调用
- 添加反馈模态框展示

**关键文件**:
- `src/app/api/examiner/route.ts` - 考官 API
- `src/app/api/feedback/route.ts` - 反馈 API
- `src/app/practice/page.tsx` - 更新为真实 API 调用

---

### Entry 3: 实时 LLM 测试

**测试结果**:
- ✅ Examiner API 成功生成追问
- ✅ Feedback API 成功生成结构化反馈
- ✅ 环境变量配置正常
- ✅ 核心练习循环验证通过

---

### Entry 4: 本地历史记录

**完成阶段**: Phase 6

**完成内容**:
- 创建 localStorage 工具 (`src/lib/history.ts`)
- 创建 `/history` 历史记录页面
- 会话自动保存到本地
- 支持查看历史会话详情

**关键文件**:
- `src/lib/history.ts` - 历史记录管理
- `src/app/history/page.tsx` - 历史页面
- `src/app/practice/page.tsx` - 集成保存功能
- `src/app/page.tsx` - 添加历史入口

---

### Entry 5: 优化和部署

**完成阶段**: Phase 7

**完成内容**:
- UI 间距和响应式优化
- 空状态和加载状态设计
- 错误信息优化
- README 文档更新

**关键文件**:
- `src/app/page.tsx` - 落地页优化
- `src/app/practice/page.tsx` - 练习页优化
- `src/app/history/page.tsx` - 历史页优化
- `README.md` - 项目文档

---

## 2026-05-14

### Entry 6: 语音功能升级

**完成阶段**: 语音 Phase 1-5

**完成内容**:

**Phase 1 - 语音输入 (STT)**:
- VoiceInput 组件 (麦克风按钮 + 录音状态)
- Web Speech API SpeechRecognition 集成
- 浏览器兼容性检测和降级方案

**Phase 2 - 语音输出 (TTS)**:
- VoiceOutput 组件 (播放按钮)
- Web Speech API SpeechSynthesis 集成
- 考官回复自动朗读

**Phase 3 - 语音交互整合**:
- VoiceControls 组件 (语音控制栏)
- 文本/语音模式切换
- 对话状态机 (idle → listening → processing → speaking)

**Phase 4 - 用户体验优化**:
- Settings 页面 (语音选择、语速调节)
- VoiceVisualizer 音波动画
- 语音设置持久化

**Phase 5 - Real-time 模式**:
- 流式语音识别优化
- AI 超时自动打断
- 全局静音开关

**关键文件**:
- `src/components/VoiceInput.tsx` - 语音输入
- `src/components/VoiceOutput.tsx` - 语音输出
- `src/components/VoiceControls.tsx` - 语音控制
- `src/components/VoiceVisualizer.tsx` - 音波可视化
- `src/components/MuteButton.tsx` - 静音按钮
- `src/hooks/useVoiceConversation.ts` - 语音对话 hook
- `src/app/settings/page.tsx` - 设置页面
- `src/types/speech.d.ts` - 语音 API 类型

---

### Entry 7: 全面优化

**完成阶段**: 优化 Phase 1-11

**Phase 1 - UI/UX 优化**:
- 深色模式优化
- 动画过渡效果 (页面切换、消息出现)
- 骨架屏加载状态
- 空状态设计优化

**Phase 2 - 移动端适配**:
- PWA 支持 (manifest.json)
- Service Worker 离线缓存
- 移动端语音按钮优化
- 键盘弹出布局调整 (dvh 单位)

**Phase 3 - 性能优化**:
- API 请求缓存和去重
- 本地存储优化 (限制 + 清理策略)
- 内存泄漏检测和修复

**Phase 4 - 错误处理**:
- 全局错误边界 (Error Boundary)
- 网络断开检测和重试
- API 超时处理优化
- 用户友好错误提示

**Phase 5 - 数据管理**:
- 历史记录搜索和筛选
- 数据导出功能 (JSON/CSV)
- 批量删除功能
- 存储空间管理

**Phase 6 - 无障碍访问**:
- 键盘导航支持
- 屏幕阅读器兼容
- ARIA 标签完善
- 高对比度模式支持

**Phase 7 - 练习功能扩展**:
- IELTS Part 2 支持 (长独白)
- IELTS Part 3 支持 (深度讨论)
- 话题分类和选择

**Phase 8 - 进度统计**:
- 统计页面 `/stats`
- 练习次数统计
- 分数变化折线图
- 各 Part 练习分布饼图

**Phase 9 - 练习目标**:
- 目标设定 UI
- 目标数据存储
- 目标进度展示
- 目标达成提醒

**Phase 10 - 数据备份**:
- 完整数据导出 (JSON)
- 数据导入恢复
- 自动备份提示
- 数据完整性校验

**Phase 11 - 错误日志**:
- 错误日志收集器
- 本地错误日志存储
- 错误日志查看页面
- 错误日志导出功能

**关键文件**:
- `src/app/globals.css` - 全局样式和动画
- `src/app/error.tsx` - 全局错误页面
- `src/app/not-found.tsx` - 404 页面
- `src/app/stats/page.tsx` - 统计页面
- `src/app/debug/page.tsx` - 调试页面
- `src/app/practice/setup/page.tsx` - 模式选择
- `src/components/ErrorBoundary.tsx` - 错误边界
- `src/components/NetworkStatus.tsx` - 网络状态
- `src/components/SkipLink.tsx` - 跳过导航
- `src/components/VisuallyHidden.tsx` - 屏幕阅读器文本
- `src/components/Chart.tsx` - 图表组件
- `src/components/BackupModal.tsx` - 备份弹窗
- `src/components/PWAInstallPrompt.tsx` - PWA 安装提示
- `src/components/ServiceWorkerRegistration.tsx` - SW 注册
- `src/components/ClientLayout.tsx` - 客户端布局
- `src/hooks/useMobile.ts` - 移动端检测
- `src/hooks/useNetworkStatus.ts` - 网络状态
- `src/hooks/useCleanup.ts` - 清理 hook
- `src/lib/topics.ts` - 话题库
- `src/lib/stats.ts` - 统计计算
- `src/lib/goals.ts` - 目标管理
- `src/lib/backup.ts` - 备份恢复
- `src/lib/error-logger.ts` - 错误日志
- `src/lib/api-cache.ts` - API 缓存
- `src/lib/performance.ts` - 性能监控
- `public/manifest.json` - PWA 配置
- `public/sw.js` - Service Worker
- `next.config.ts` - Next.js 配置

---

### Entry 8: 用户认证系统 (Supabase)

**完成阶段**: 认证 Phase 1-4

**完成内容**:

**Phase 1 - Supabase 集成**:
- 安装 @supabase/supabase-js 和 @supabase/ssr
- 创建客户端和服务端 Supabase 配置
- 创建 middleware 处理会话刷新

**Phase 2 - 用户认证**:
- 创建 AuthContext 和 useAuth hook
- 创建登录页面 (邮箱 + Google OAuth)
- 创建 OAuth 回调路由
- 创建 UserMenu 用户菜单组件

**Phase 3 - 云端同步**:
- 创建 Supabase 数据库表结构 (sessions, goals)
- 创建 supabase-history.ts 云端操作模块
- 创建 unified-history.ts 统一历史管理器
- 支持自动检测用户状态选择存储方式

**Phase 4 - 数据迁移**:
- 创建 DataMigration 迁移提示组件
- 支持本地数据一键迁移到云端
- 迁移完成后自动提示

**关键文件**:
- `src/lib/supabase.ts` - Supabase 客户端配置
- `src/lib/supabase-server.ts` - Supabase 服务端配置
- `src/lib/auth-context.tsx` - 认证上下文和 hook
- `src/lib/supabase-history.ts` - 云端历史记录操作
- `src/lib/unified-history.ts` - 统一历史管理器
- `src/middleware.ts` - 会话中间件
- `src/app/login/page.tsx` - 登录页面
- `src/app/auth/callback/route.ts` - OAuth 回调
- `src/components/UserMenu.tsx` - 用户菜单组件
- `src/components/DataMigration.tsx` - 数据迁移组件
- `supabase-schema.sql` - 数据库表结构

---

## 进度汇总

| 日期 | 阶段 | 完成内容 |
|------|------|----------|
| 2026-05-13 | MVP Phase 1-3 | 项目初始化、落地页、练习 UI |
| 2026-05-13 | MVP Phase 4-5 | LLM API 集成、反馈生成 |
| 2026-05-13 | MVP Phase 6 | 本地历史记录 |
| 2026-05-13 | MVP Phase 7 | 优化部署 |
| 2026-05-14 | 语音 Phase 1-5 | 完整语音功能 |
| 2026-05-14 | 优化 Phase 1-11 | 全面优化升级 |
| 2026-05-16 | 认证 Phase 1-4 | 用户认证系统 (Supabase) |

---

## 当前状态

**MVP 状态**: ✅ 已完成

**已完成功能**:
- 文本和语音练习
- IELTS Part 1/2/3 支持
- AI 考官对话
- 结构化反馈
- 本地历史记录
- 统计和目标
- 数据备份恢复
- PWA 支持
- 无障碍访问
- 错误处理和日志
- 用户认证 (邮箱 + Google OAuth)
- 云端数据同步
- 管理后台 (话题管理、用户管理)
- 学习路径推荐
- 国际化 (中英文切换)
- 模拟考试模式 (Part 1→2→3 + 计时器)
- 错误标注与纠正详情
- 发音评估 (Azure Pronunciation Assessment)
- 跟读/模仿练习 (逐句评分 + 练习总结)
- Azure Neural TTS (11 种音色可选，替换浏览器内置 TTS)
- 学习提醒 (考试倒计时、每日练习提醒、连续天数)

**待优化**:
- 反馈页面语音化
- 触摸手势支持
- 流式 TTS 取消
- 服务端语音处理 (Whisper)

---

### Entry 9: 内容丰富

**完成阶段**: 内容 Phase 1-3

**完成内容**:

**Phase 1 - 话题库扩充**:
- 从 6 个话题扩充至 36 个话题
- 覆盖 10 个类别: Place, Life, Leisure, Nature, Modern Life, Lifestyle, People, Events, Objects, Abstract
- 每个话题包含 Part 1/2/3 完整问题

**Phase 2 - 录音回放**:
- 创建 IndexedDB 录音存储模块
- 创建 AudioRecorder 录音组件
- 创建 AudioPlayback 回放组件
- 创建 RecordingsList 列表组件
- 集成到历史记录详情页面

**Phase 3 - AI 个性化记忆**:
- 创建 error-patterns.ts 错误模式分析模块
- 创建 PersonalizedSuggestions 组件
- 练习完成后自动更新用户错误模式
- 在历史记录页面显示个性化建议

**关键文件**:
- `src/lib/topics.ts` - 扩充的话题库
- `src/lib/recordings.ts` - 录音存储模块
- `src/lib/error-patterns.ts` - 错误模式分析
- `src/components/AudioRecorder.tsx` - 录音组件
- `src/components/AudioPlayback.tsx` - 回放组件
- `src/components/RecordingsList.tsx` - 录音列表
- `src/components/PersonalizedSuggestions.tsx` - 个性化建议
- `src/app/history/page.tsx` - 集成录音回放和建议
- `src/app/practice/page.tsx` - 集成错误模式更新

### Entry 10: 平台化功能 (Phase 3)

**完成阶段**: 平台化 Phase 3A-3E

**完成内容**:

**Phase 3A - 数据库基础**:
- 创建 profiles 表 (用户角色系统)
- 创建 topics 表 (话题数据库化)
- 创建 learning_progress 表 (学习进度追踪)
- 自动创建 profile 的触发器
- RLS 安全策略和 is_admin() 函数

**Phase 3B - 国际化 (i18n)**:
- 创建 en.json / zh.json 翻译文件 (中英文)
- 创建 I18nContext 和 useTranslation hook
- 创建 LanguageSwitcher 语言切换组件
- localStorage 持久化语言偏好

**Phase 3C - 管理后台**:
- 扩展 auth-context 添加 profile/role 信息
- 扩展 middleware 添加 /admin/* 路由保护
- 创建管理后台布局和首页
- 创建话题管理页面 (CRUD 操作)
- 创建用户管理页面 (角色切换)
- 创建 TopicForm 话题表单组件

**Phase 3D - 学习路径推荐**:
- 创建 supabase-progress 学习进度追踪模块
- 创建 recommendations 推荐引擎
- 基于薄弱技能维度的智能推荐算法
- 创建 LearningPath 推荐 UI 组件
- 集成到首页和练习页面

**Phase 3E - i18n 全面铺开**:
- 替换首页所有硬编码文本
- 替换登录页面所有硬编码文本
- 替换练习页面所有硬编码文本
- 替换反馈面板所有硬编码文本
- 替换用户菜单所有硬编码文本

**关键文件**:
- `supabase-migration-001.sql` - 数据库迁移脚本
- `src/lib/i18n.tsx` - i18n 上下文和 hook
- `src/locales/en.json` - 英文翻译
- `src/locales/zh.json` - 中文翻译
- `src/components/LanguageSwitcher.tsx` - 语言切换组件
- `src/lib/admin.ts` - 管理员工具函数
- `src/lib/supabase-topics.ts` - 话题 CRUD
- `src/lib/supabase-progress.ts` - 学习进度追踪
- `src/lib/recommendations.ts` - 推荐引擎
- `src/components/LearningPath.tsx` - 推荐 UI 组件
- `src/app/admin/layout.tsx` - 管理后台布局
- `src/app/admin/page.tsx` - 管理后台首页
- `src/app/admin/topics/page.tsx` - 话题管理页面
- `src/app/admin/users/page.tsx` - 用户管理页面
- `src/components/admin/TopicForm.tsx` - 话题表单组件
- `src/middleware.ts` - 扩展路由保护
- `src/lib/auth-context.tsx` - 扩展角色信息
- `src/components/UserMenu.tsx` - 扩展管理员链接
- `src/components/ClientLayout.tsx` - 包裹 I18nProvider

---

### Entry 11: 模拟考试模式

**完成阶段**: 模拟考试

**完成内容**:
- 创建 `/practice/exam` 独立考试页面
- 实现 Part 1 → Part 2 → Part 3 完整考试流程
- Part 2 准备阶段倒计时 (60 秒)
- Part 2 答题阶段倒计时 (120 秒)
- 阶段指示器 (步骤条 + 当前阶段状态)
- 考官消息自动检测阶段转换
- 超时自动推进到下一阶段
- 考试结束后综合反馈
- 设置页面添加模拟考试入口横幅
- 首页添加模拟考试按钮
- 添加考试相关 i18n 翻译

**关键文件**:
- `src/app/practice/exam/page.tsx` - 模拟考试页面
- `src/app/practice/setup/page.tsx` - 更新添加考试入口
- `src/app/page.tsx` - 首页添加考试按钮
- `src/locales/en.json` - 英文翻译更新
- `src/locales/zh.json` - 中文翻译更新

---

### Entry 12: 词汇/语法纠错详情

**完成内容**:
- 扩展 SessionFeedback 类型，新增 errorAnnotations 字段
- 更新反馈 API prompt，要求 LLM 返回具体错误标注
- 每个标注包含：原文、纠正后、错误类型、解释
- 创建 ErrorAnnotations 组件，展示错误纠正卡片
- 练习页面和考试页面 FeedbackPanel 均集成错误标注
- 增加 max_tokens 至 3000 以容纳更多反馈数据
- 添加相关 i18n 翻译

**关键文件**:
- `src/types/index.ts` - 新增 ErrorAnnotation 类型
- `src/app/api/feedback/route.ts` - 更新 LLM prompt
- `src/components/ErrorAnnotations.tsx` - 错误标注组件
- `src/app/practice/page.tsx` - 集成错误标注
- `src/app/practice/exam/page.tsx` - 集成错误标注

---

### Entry 13: 发音评估功能

**完成内容**:
- 集成 Azure Speech SDK Pronunciation Assessment API
- 创建 `/api/pronunciation` 端点，支持音频上传和发音评估
- 修改 VoiceControls 组件，支持录制原始音频数据
- 创建 PronunciationFeedback 组件，展示详细发音评估结果
- 集成到练习页面和考试页面
- 支持整体分数、单词级评分、音素级分析
- 添加中英文 i18n 翻译

**关键文件**:
- `src/app/api/pronunciation/route.ts` - 发音评估 API
- `src/components/VoiceControls.tsx` - 修改支持音频录制
- `src/components/PronunciationFeedback.tsx` - 发音评估展示组件
- `src/app/practice/page.tsx` - 集成发音评估
- `src/app/practice/exam/page.tsx` - 集成发音评估
- `src/app/history/page.tsx` - 展示发音评估结果
- `src/types/index.ts` - 添加发音评估类型
- `src/locales/en.json` - 英文翻译
- `src/locales/zh.json` - 中文翻译

---

## 进度汇总

| 日期 | 阶段 | 完成内容 |
|------|------|----------|
| 2026-05-13 | MVP Phase 1-3 | 项目初始化、落地页、练习 UI |
| 2026-05-13 | MVP Phase 4-5 | LLM API 集成、反馈生成 |
| 2026-05-13 | MVP Phase 6 | 本地历史记录 |
| 2026-05-13 | MVP Phase 7 | 优化部署 |
| 2026-05-14 | 语音 Phase 1-5 | 完整语音功能 |
| 2026-05-14 | 优化 Phase 1-11 | 全面优化升级 |
| 2026-05-16 | 认证 Phase 1-4 | 用户认证系统 (Supabase) |
| 2026-05-16 | 内容 Phase 1-3 | 话题库扩充、录音回放、AI 个性化记忆 |
| 2026-05-16 | 平台化 Phase 3A-3E | 管理后台、学习路径推荐、国际化 |
| 2026-05-16 | 模拟考试 | 完整考试流程、计时器、阶段指示 |
| 2026-05-16 | 学习体验 | 错误标注、词汇/语法纠正详情 |
| 2026-05-17 | 发音评估 | Azure Pronunciation Assessment 集成 |
| 2026-05-17 | 跟读练习 | 听标准发音模仿跟读 + 发音评估反馈 |
| 2026-05-17 | 学习提醒 | 考试倒计时、每日练习提醒、连续练习天数 |
| 2026-05-17 | Azure TTS | 浏览器 TTS 替换为 Azure Neural TTS，支持 11 种音色选择 |
| 2026-05-17 | 计时器优化 | Part 2 准备/答题倒计时 UX 优化 |
| 2026-05-18 | 学习复盘反馈 | 练习/考试反馈统一为学习复盘面板，补齐下一步学习闭环 |
| 2026-05-18 | 项目文档追踪 | 标准化 `$update-project-docs` skill，并加入 AGENTS.md 协作规则 |
| 2026-05-18 | 质量与移动端体验 | 清理 lint warnings，增加移动端底部学习导航 |
| 2026-05-18 | Next 16 配置清理 | 固定 Turbopack root，迁移 middleware 到 proxy，构建提示清零 |
| 2026-05-18 | 下一阶段优化方案 | 新增优化路线文档，明确新窗口接手顺序 |
| 2026-05-22 | 桌面端网页统一 | DesktopNav 共享组件、颜色/宽度统一、i18n 全覆盖（120+ key） |
| 2026-05-22 | E2E Mock 规划 | Phase D3 完成：7 条路径 smoke 验收、6 类外部依赖 mock 方案、Playwright 安装前置条件 |
| 2026-05-22 | 数据流 Review | Phase E1 完成：发现 unified-history 为死代码、feedback-actions 绕过云端保存等 4 个 P0/P1 风险 |
| 2026-05-22 | E2 修复 + 退出登录 | feedback-actions 改用 unified-history 保存到云端；设置页面新增退出登录按钮 |
| 2026-05-22 | 历史页云端读取 | history/page.tsx 改用 unified-history 读取/删除会话，补齐历史页 P0 数据流 |
| 2026-05-22 | 统计页云端读取 | stats.ts 改用 unified-history，统计页等待异步会话数据后渲染 |
| 2026-05-22 | Session ID 与模式保存 | 本地会话改用 crypto.randomUUID，并保留 unified-history 传入的练习模式 |
| 2026-05-22 | 备份错误模式 | backup.ts 导出/恢复 error-patterns，备份校验覆盖可选用户画像 |

---

### Entry 14: 跟读/模仿练习功能

**完成阶段**: 跟读练习

**完成内容**:
- 从 VoiceControls 提取 WAV 编码逻辑到 `audio-utils.ts` 共享模块
- 创建 `useShadowingPractice` hook 管理练习状态和流程
- 创建 ShadowingProgress 进度指示组件
- 创建 ShadowingSentenceCard 练习卡片组件（集成 TTS、录音、评估）
- 创建 ShadowingSummary 练习总结组件
- 创建 `/practice/shadowing` 主页面（设置 + 练习流程）
- 支持 Part 1/2/3 三种练习模式
- 支持话题选择或随机话题
- 集成 Azure 发音评估 API 进行逐句评分
- 首页和设置页面添加跟读练习入口
- 添加中英文 i18n 翻译

**关键文件**:
- `src/lib/audio-utils.ts` - 音频录制和 WAV 编码工具
- `src/hooks/useShadowingPractice.ts` - 跟读练习状态管理 hook
- `src/components/ShadowingProgress.tsx` - 进度指示组件
- `src/components/ShadowingSentenceCard.tsx` - 练习卡片组件
- `src/components/ShadowingSummary.tsx` - 练习总结组件
- `src/app/practice/shadowing/page.tsx` - 跟读练习主页面
- `src/app/page.tsx` - 首页添加跟读入口
- `src/app/practice/setup/page.tsx` - 设置页添加跟读入口
- `src/locales/en.json` - 英文翻译更新
- `src/locales/zh.json` - 中文翻译更新

---

### Entry 15: 学习提醒功能

**完成阶段**: 学习提醒

**完成内容**:
- 创建 `reminders.ts` 数据管理模块，支持考试日期、每日提醒设置
- 实现考试倒计时计算和今日练习状态检测
- 实现连续练习天数统计功能
- 设置页面添加学习提醒设置区域（考试日期选择器、每日提醒开关、提醒时间选择）
- 首页添加提醒卡片展示（考试倒计时卡片、每日练习状态卡片）
- 添加中英文 i18n 翻译支持
- 支持条件渲染，未设置时不显示提醒卡片

**关键文件**:
- `src/lib/reminders.ts` - 提醒数据管理模块
- `src/app/settings/page.tsx` - 设置页面添加提醒设置
- `src/app/page.tsx` - 首页添加提醒卡片
- `src/locales/en.json` - 英文翻译更新
- `src/locales/zh.json` - 中文翻译更新

---

### Entry 16: Azure Neural TTS 替换

**完成阶段**: 语音引擎升级

**完成内容**:
- 创建 `/api/tts` API 端点，使用 Azure Speech SDK 的 `SpeechSynthesizer`
- 使用 SSML 控制语音参数（音色、语速）
- 重写 VoiceOutput 组件，从浏览器 SpeechSynthesis 切换为 Azure Neural TTS API 调用
- 导出 `AZURE_VOICES` 常量，包含 11 种 Azure Neural 音色（Aria、Jenny、Guy、Davis 等）
- 使用 HTMLAudioElement 播放合成音频，支持 AbortController 取消
- 设置页面更新为 Azure 音色下拉选择器
- 测试语音功能改为调用 `/api/tts` API
- 语音偏好持久化为 `echolingo_azure_voice` (localStorage)

**关键文件**:
- `src/app/api/tts/route.ts` - Azure TTS API 端点
- `src/components/VoiceOutput.tsx` - 重写为 Azure TTS 调用
- `src/app/settings/page.tsx` - Azure 音色选择 UI

---

### Entry 17: Part 2 计时器优化

**完成阶段**: 模拟考试体验优化

**完成内容**:
- 添加醒目计时器组件，在 Part 2 准备和发言阶段显示大型倒计时
- 实现可视化进度条，实时显示剩余时间比例
- 添加时间紧迫度分级系统（正常/警告/紧急），对应不同颜色
- 准备时间 ≤10 秒和发言时间 ≤30 秒时显示警告提示信息
- 时间 ≤10% 时触发脉冲动画和红色高亮
- 背景颜色根据紧迫度动态变化（黄色→橙色→红色）
- 添加中英文 i18n 翻译支持

**关键文件**:
- `src/app/practice/exam/page.tsx` - 计时器 UI 和逻辑优化
- `src/locales/en.json` - 英文翻译更新
- `src/locales/zh.json` - 中文翻译更新

---

## 2026-05-18

### Entry 18: 学习复盘反馈面板

**完成阶段**: 前端学习体验优化

**完成内容**:
- 抽取共享 `FeedbackPanel` 组件，普通练习和模拟考试统一使用同一套反馈 UI
- 将原本偏“报告展示”的长反馈模态框改为“学习复盘”结构
- 首屏突出预估 Band、学习复盘说明和下一步学习计划
- 从 `improvementSuggestions` 中提取 Top 3 优先改进项
- 分区展示本次优势、重点改进项、发音练习队列
- 增加专项练习和跟读练习入口，让反馈自然连接下一轮学习
- 将 IELTS 评分维度、发音详情、示例答案、错误纠正收纳到可折叠详情里
- 补充中英文 i18n 文案
- 新增 FeedbackPanel 组件测试，并修复测试环境 localStorage polyfill

**关键文件**:
- `src/components/FeedbackPanel.tsx` - 学习复盘反馈面板
- `src/components/FeedbackPanel.test.tsx` - 组件渲染测试
- `src/app/practice/page.tsx` - 普通练习接入共享反馈面板
- `src/app/practice/exam/page.tsx` - 模拟考试接入共享反馈面板
- `src/locales/en.json` - 英文反馈复盘文案
- `src/locales/zh.json` - 中文反馈复盘文案
- `src/test/setup.ts` - 测试环境 Storage polyfill

**验证结果**:
- `npm run lint` 通过，仍保留既有 17 个 warning
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，4 个测试文件 / 10 个测试
- `npm run build` 通过；沙箱内曾因 Turbopack 端口权限失败，沙箱外重跑成功
- 浏览器打开 `http://localhost:3001/practice` 验证首屏、输入框和 Send 按钮可用，console 无 error/warn；截图接口本轮超时

---

### Entry 19: 项目文档追踪 Skill 标准化

**完成阶段**: 项目协作流程优化

**完成内容**:
- 检查项目已有本地 skills，确认 `.agents/skills/update-dev-log` 已存在
- 将该 skill 标准化为 `$update-project-docs`，补充 `name` 和 `description` frontmatter
- 补充执行规则：完成开发任务后更新 `DEVELOPMENT_LOG`、`PROJECT_CONTEXT`、`TASKS`，记录真实验证结果，不虚构完成项
- 添加 `.agents/skills/update-dev-log/agents/openai.yaml`，提升 skill 在 UI 和隐式调用中的可发现性
- 更新 `AGENTS.md`，加入完成有意义开发任务后同步更新三份项目文档的项目规则

**关键文件**:
- `.agents/skills/update-dev-log/SKILL.md` - 标准化 skill 元数据和执行规则
- `.agents/skills/update-dev-log/agents/openai.yaml` - UI 元数据和隐式调用策略
- `AGENTS.md` - 项目级文档更新规则
- `docs/PROJECT_CONTEXT.md` - 记录项目协作约定和 skill 位置
- `docs/TASKS.md` - 记录项目文档追踪能力完成状态
- `docs/DEVELOPMENT_LOG.md` - 记录本次协作流程优化

**验证结果**:
- `python3 /Users/xiaozhangdemac/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/update-dev-log` 通过，输出 `Skill is valid!`

---

### Entry 20: lint 清理与移动端底部导航

**完成阶段**: 代码质量与移动端体验优化

**完成内容**:
- 清理剩余 17 个 lint warning，当前 `npm run lint` 为 0 warning / 0 error
- 移除未使用导入、变量和 props
- 稳定模拟考试页的 `fetchExaminerResponse` / `fetchFeedback` / `handleSpeakTimeout` Hook 依赖
- 将用户头像 `<img>` 替换为 CSS 背景头像，避免未配置远程图片域名时引入 Next Image 配置风险
- 新增移动端底部学习导航，提供首页、练习、统计、历史四个常用入口
- 移动导航在 `/practice*`、管理、调试、登录、认证路由自动隐藏，避免遮挡练习输入区

**关键文件**:
- `src/components/MobileNav.tsx` - 移动端底部学习导航
- `src/components/ClientLayout.tsx` - 全局接入移动端导航
- `src/app/practice/exam/page.tsx` - Hook 依赖和未使用状态清理
- `src/components/VoiceControls.tsx` - Hook dependency 清理
- `src/components/UserMenu.tsx` - 头像渲染 warning 清理
- `src/app/admin/users/page.tsx` - 头像渲染 warning 清理
- `src/components/ShadowingSentenceCard.tsx` - 未使用 props 清理
- `src/app/practice/shadowing/page.tsx` - 调用端同步清理

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，4 个测试文件 / 10 个测试
- `npm run build` 通过；沙箱内仍会触发 Turbopack 端口权限问题，沙箱外重跑成功
- 浏览器打开 `http://127.0.0.1:3001/`，验证首页可加载、移动导航 DOM 存在、console 无 error/warn
- 浏览器打开 `http://127.0.0.1:3001/practice`，验证练习页不渲染移动导航、输入框存在、console 无 error/warn

---

### Entry 21: Next 16 配置提示清理

**完成阶段**: Next.js 16 兼容性与构建输出清理

**完成内容**:
- 阅读本地 Next 16 文档，确认 Turbopack 配置位于 `next.config.ts` 顶层 `turbopack`
- 在 `next.config.ts` 中使用 `turbopack.root` 固定项目根目录，避免父级 `/Users/xiaozhangdemac/yarn.lock` 影响 workspace root 推断
- 阅读 Next 16 升级文档，确认 `middleware` 文件约定已 deprecated，需要迁移到 `proxy`
- 删除 `src/middleware.ts`
- 新增 `src/proxy.ts`，保留 Supabase session refresh 和 admin 路由保护逻辑，并将导出函数从 `middleware` 改为 `proxy`
- 构建输出不再出现 workspace root warning 和 middleware deprecated warning

**关键文件**:
- `next.config.ts` - 添加 `turbopack.root`
- `src/proxy.ts` - Next 16 Proxy 入口
- `src/middleware.ts` - 删除 deprecated 文件
- `docs/PROJECT_CONTEXT.md` - 更新 Next 16 项目约定
- `docs/TASKS.md` - 更新配置清理完成状态
- `docs/DEVELOPMENT_LOG.md` - 记录本次配置清理npm

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，4 个测试文件 / 10 个测试
- `npm run build` 通过，且不再显示 Turbopack root inference warning 或 middleware deprecated warning

---

### Entry 22: 下一阶段优化方案

**完成阶段**: 项目规划与新窗口交接

**完成内容**:
- 新增 `docs/NEXT_OPTIMIZATION_PLAN.md`，作为新窗口继续优化的入口文档
- 明确下一阶段不做商业化、支付、订阅和社交功能
- 制定六个优化阶段：学习闭环统一、历史与统计页学习化、移动端核心流程、测试与 CI、数据同步稳定性、代码结构收敛
- 在 `docs/TASKS.md` 中将 Backlog 改写为可执行任务列表
- 在 `docs/PROJECT_CONTEXT.md` 中加入下一阶段优化路线入口
- 推荐新窗口第一步先补 `MobileNav` / `FeedbackPanel` 组件测试，第二步做历史页复盘升级

**关键文件**:
- `docs/NEXT_OPTIMIZATION_PLAN.md` - 下一阶段优化方案和新窗口接手方式
- `docs/TASKS.md` - 下一阶段任务拆解
- `docs/PROJECT_CONTEXT.md` - 当前项目上下文新增优化路线入口
- `docs/DEVELOPMENT_LOG.md` - 记录本次规划更新

**验证结果**:
- 文档更新，无代码变更；未运行 lint/typecheck/test/build

---

### Entry 23: D2 组件测试与 B1 历史页复盘升级

**完成阶段**: 下一阶段优化 Phase D2 / Phase B1

**完成内容**:
- 新增 `MobileNav` 组件测试，覆盖常规页面显示、当前路由高亮，以及 `/practice*`、管理、调试、登录、认证路由隐藏逻辑
- 扩展 `FeedbackPanel` 测试，覆盖低分误读词发音队列展示和无优先发音词时隐藏队列
- 新增 `/practice/setup` 组件测试，覆盖 Speaking Drill、Mock Exam、Shadowing Lab 的 start URL 生成
- 将 `FeedbackPanel` 拆出可嵌入的 `FeedbackReview`，练习结束保留原 modal，历史详情复用同一套学习复盘 UI
- 历史列表增加 Band、Top weakness、下一步建议和模式展示，保留搜索、筛选、导出、删除、备份和录音回放入口

**关键文件**:
- `src/components/FeedbackPanel.tsx` - 抽出 `FeedbackReview` 并保留原 `FeedbackPanel` modal 行为
- `src/components/FeedbackPanel.test.tsx` - 扩展复盘面板发音队列测试
- `src/components/MobileNav.test.tsx` - 新增移动导航显示/隐藏测试
- `src/app/practice/setup/page.test.tsx` - 新增训练类型与 start URL 测试
- `src/app/history/page.tsx` - 历史列表学习化，历史详情复用学习复盘 UI
- `src/test/setup.ts` - 测试后清理 RTL DOM 和 storage

**验证结果**:
- `npm run test:unit:run` 通过，6 个测试文件 / 23 个测试；当前 Vitest 仍输出 `--localstorage-file` Node warning，但测试结果通过
- `npm run typecheck` 通过
- `npm run lint` 通过，0 warning / 0 error
- `npm run build` 通过，Next.js 16.2.6 / Turbopack 构建成功

---

### Entry 24: 本地 dev 内存暴涨诊断与止血

**完成阶段**: dev server 稳定性修复

**完成内容**:
- 复现 `next dev` 首次访问 `/` 后停在 `Compiling / ...`，系统内存压力快速升高的问题
- 修复 `AuthProvider` 每次 render 都创建新 Supabase client 导致 `useEffect` 反复执行的客户端循环
- 将默认 `npm run dev` 切换为 `next dev --webpack`，规避当前 Turbopack dev 首屏编译卡死路径
- 新增 `npm run dev:turbo` 保留 Turbopack 对照入口
- 移除 `experimental.optimizeCss`，减少 dev/build CSS 实验链路变量

**关键文件**:
- `src/lib/auth-context.tsx` - 使用 `useMemo` 稳定 Supabase browser client
- `package.json` - 默认 dev script 改为 webpack fallback，新增 `dev:turbo`
- `next.config.ts` - 移除 `experimental.optimizeCss`

**验证结果**:
- `npm run typecheck` 通过
- `npm run lint` 通过，0 warning / 0 error
- `npm run test:unit:run` 当前受本机 native binding 签名问题阻塞，`@rolldown/binding-darwin-arm64` 被 macOS 拒绝 dlopen
- `npm run build` 当前受本机 native binding / Turbopack sandbox 权限问题影响，非代码验证未完成

---

### Entry 25: 学习闭环 Phase A — 复盘结果联动下一次练习

**完成阶段**: Phase A1 / A2 学习闭环统一

**完成内容**:

**A1 - 复盘结果联动 setup 页面**:
- 修改 `FeedbackPanel` 的"专项练习"链接，将 Top 3 弱项和建议编码为 `focus` 和 `suggestions` 查询参数带到 `/practice/setup`
- setup 页面读取查询参数，展示"本轮训练目标"横幅，显示待改进领域和具体建议
- 新增 `useSearchParams` + Suspense 包裹，遵循 Next.js App Router 约定

**A2 - 发音队列联动跟读页面**:
- 修改 `FeedbackPanel` 的"训练发音"链接，将低分误读词编码为 `words` 查询参数带到 `/practice/shadowing`
- 跟读 setup 视图展示"优先练习词汇"横幅，提示用户重点关注
- 无误读词时不影响现有跟读流程

**i18n**:
- 新增 `setup.trainingGoal`、`setup.priorityWords`、`setup.priorityWordsHint` 中英文翻译

**测试**:
- 更新 `practice/setup/page.test.tsx`，添加 `next/navigation` mock 以适配新增的 `useSearchParams` 调用

**关键文件**:
- `src/components/FeedbackPanel.tsx` - 链接携带 focus/words 查询参数
- `src/app/practice/setup/page.tsx` - 读取 focus 参数并展示训练目标 banner
- `src/app/practice/shadowing/page.tsx` - 读取 words 参数并展示优先练习词
- `src/app/practice/setup/page.test.tsx` - 添加 next/navigation mock
- `src/locales/en.json` - 英文翻译
- `src/locales/zh.json` - 中文翻译

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，6 个测试文件 / 23 个测试
- `npm run build` 通过，Next.js 16.2.6 / Turbopack 构建成功

---

### Entry 26: 统计页学习化 — Phase B2

**完成阶段**: Phase B2 统计页改成学习进度页

**完成内容**:

**stats.ts 数据模型扩展**:
- 新增 `trendDirection`（"up"/"down"/"stable"）：比较最近 5 次与前 5 次 Band 平均值
- 新增 `weakDimensions`：从最近 10 次会话的 weaknesses 提取薄弱维度（fluency/vocabulary/grammar/pronunciation）
- 新增 `practiceDays`：去重练习天数
- 新增 `getDimensionLabel()` 辅助函数

**stats/page.tsx 全面重写**:
- 首屏：学习进度摘要（Band + 趋势箭头 + 本周/总计/天数 + 每周目标进度条）
- 第二区：薄弱维度列表 + 推荐行动入口（专项练习/跟读训练/回顾历史）
- 第三区：Band 趋势折线图（可折叠）
- 第四区：详细统计（分数卡片 + 每周活动 + 练习分布，可折叠）
- 第五区：最近会话列表
- 统一 Header 组件，与 setup/feedback 页面设计语言一致
- 空数据状态引导用户去练习

**i18n**:
- 新增约 30 个 `stats.*` 中英文翻译 key
- 覆盖维度标签、趋势描述、行动入口、空状态文案

**设计原则**:
- 移动端友好：使用 `<details>` 折叠非关键图表，减少首屏卡片堆叠
- 学习软件风格：优先展示"下一步做什么"而非纯数据展示
- 与 FeedbackPanel、setup 页面的设计语言保持一致（slate/emerald 色系）

**关键文件**:
- `src/lib/stats.ts` - 扩展 PracticeStats 类型和 calculateStats()
- `src/app/stats/page.tsx` - 全面重写
- `src/locales/en.json` - 英文翻译
- `src/locales/zh.json` - 中文翻译

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，6 个测试文件 / 23 个测试
- `npm run build` 通过，Next.js 16.2.6 / Turbopack 构建成功

---

### Entry 27: 桌面端网页统一

**完成阶段**: 桌面端体验一致性

**完成内容**:

**共享导航组件**:
- 创建 `DesktopNav` 共享组件，统一 Logo、导航链接、LanguageSwitcher、UserMenu 和 MuteButton
- 支持 `active` 高亮当前页面、`maxWidth` 控制内容宽度、`rightContent` 插槽扩展
- 所有 9 个页面（Home、Practice、Exam、Shadowing、Setup、Stats、History、Settings、Admin）统一使用 DesktopNav

**颜色系统统一**:
- 全站 `gray-*` 替换为 `slate-*`，与设计系统一致
- 主按钮从 `blue-600` 统一为 `slate-950 dark:bg-white`
- Band 分数标签统一使用 `emerald-*` 色系

**布局宽度标准化**:
- 统一页面使用 `max-w-5xl`（Home 保持 `max-w-7xl`，Practice 子页面使用 `max-w-4xl`）

**i18n 完整覆盖**:
- History 页面约 30 个硬编码字符串替换为 `history.*` i18n keys
- Settings 页面约 30 个硬编码字符串替换为 `settings.*` i18n keys
- Home 页面约 25 个硬编码字符串替换为 `home.*` i18n keys
- i18n.tsx 新增 `{param}` 参数插值支持（用于 `history.selected` 等动态文案）
- 新增约 120+ 中英文翻译 key

**代码质量**:
- 清理未使用导入（Link、MuteButton、MODE_LABELS、getTopicById 等）
- setup 测试添加 `useAuth` mock 以适配 DesktopNav 内的 UserMenu

**关键文件**:
- `src/components/DesktopNav.tsx` - 共享导航组件（新建）
- `src/lib/i18n.tsx` - 新增参数插值支持
- `src/app/page.tsx` - Home 页面重写
- `src/app/history/page.tsx` - History 页面重写
- `src/app/settings/page.tsx` - Settings 页面重写
- `src/app/stats/page.tsx` - 替换 Header 为 DesktopNav
- `src/app/practice/page.tsx` - 替换 Header、清理未使用导入
- `src/app/practice/exam/page.tsx` - 替换 Header、gray→slate
- `src/app/practice/shadowing/page.tsx` - 替换 Header、gray→slate、修复宽度
- `src/app/practice/setup/page.tsx` - 替换 Header 为 DesktopNav
- `src/app/practice/setup/page.test.tsx` - 添加 useAuth mock
- `src/components/LanguageSwitcher.tsx` - gray→slate
- `src/components/UserMenu.tsx` - gray→slate
- `src/locales/en.json` - 新增约 120+ 翻译 key
- `src/locales/zh.json` - 新增约 120+ 翻译 key

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，6 个测试文件 / 23 个测试
- `npm run build` 通过，Next.js 16.2.6 / Turbopack 构建成功

---

### Entry 28: CI 工作流

**完成阶段**: Phase D1 测试与 CI

**完成内容**:
- 创建 GitHub Actions CI 工作流文件 `.github/workflows/ci.yml`
- 配置质量门：lint、typecheck、unit test、build
- 触发条件：push 和 pull_request 到 main 分支
- 使用 Node.js 20 和 npm 缓存

**关键文件**:
- `.github/workflows/ci.yml` - CI 工作流配置

**验证结果**:
- YAML 语法验证通过
- CI 文件存在并通过本地检查

---

### Entry 29: 数据层审查 (Phase E)

**完成阶段**: Phase E 数据与云端同步稳定性

**完成内容**:

**E1. 数据层职责边界审查**:
- `history.ts`: 本地 localStorage 存储，同步 API，最大 50 会话
- `supabase-history.ts`: Supabase 云端存储，异步 API，最大 100 会话
- `unified-history.ts`: 统一入口，自动检测登录状态选择后端

**保存策略确认**:
- 已登录：云端 + 本地备份，读取优先云端
- 未登录：本地存储
- 迁移：支持本地 → 云端一键迁移

**E2. 错误模式与推荐联动审查**:
- `error-patterns.ts` 只消费 `feedback.weaknesses` 数组
- 未使用 `errorAnnotations`（具体错误标注）和 `improvementSuggestions`
- `recommendations.ts` 生成泛化理由，未关联用户具体错误
- 推荐引擎依赖 `error-patterns.ts` + `supabase-progress.ts`

**发现的改进空间**:
- 推荐理由可引用具体错误模式（如 "Practice: Subject-verb agreement"）
- 但需修改数据结构，当前保持稳定优先

**关键文件**:
- `src/lib/history.ts` - 本地存储模块
- `src/lib/supabase-history.ts` - 云端存储模块
- `src/lib/unified-history.ts` - 统一入口
- `src/lib/error-patterns.ts` - 错误模式分析
- `src/lib/recommendations.ts` - 推荐引擎

**验证结果**:
- Code review 完成，数据层职责边界清晰
- 不做大改，记录发现供后续优化参考

---

### Entry 30: 代码结构收敛 — 反馈保存逻辑抽取 (Phase F)

**完成阶段**: Phase F 代码结构收敛

**完成内容**:
- 创建 `src/lib/feedback-actions.ts` 共享模块
- 抽取 `fetchFeedback` - 统一反馈 API 调用
- 抽取 `fetchPronunciationAssessment` - 统一发音评估调用
- 抽取 `saveSessionAndUpdateLearning` - 统一保存会话 + 更新错误模式 + 记录进度
- 重构 `practice/page.tsx` 使用新模块，移除重复代码
- 重构 `exam/page.tsx` 使用新模块，移除重复代码

**关键文件**:
- `src/lib/feedback-actions.ts` - 反馈保存共享模块（新建）
- `src/app/practice/page.tsx` - 重构使用新模块
- `src/app/practice/exam/page.tsx` - 重构使用新模块

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过

**代码减少**:
- practice/page.tsx 减少约 40 行
- exam/page.tsx 减少约 50 行
- 消除重复的 fetchFeedback、fetchPronunciationAssessment 和反馈保存逻辑

---

### Entry 31: 代码结构收敛 — 语音录音边界抽取与 UI 状态收敛 (Phase F)

**完成阶段**: Phase F 代码结构收敛

**完成内容**:

**语音录音边界抽取**:
- 创建 `src/hooks/useAudioRecorder` hook，统一管理音频录制生命周期
- 重构 `VoiceControls` 组件，移除内联 AudioContext/ScriptProcessor 逻辑，改用 `useAudioRecorder`
- 重构 `useShadowingPractice` hook，移除 `startAudioCapture`/`stopAudioCapture` 直接调用，改用 `useAudioRecorder` + `fetchPronunciationAssessment`

**重复 UI 状态收敛**:
- 创建 `src/components/ChatUIStates.tsx` 共享组件模块
- 抽取 `ChatLoadingIndicator` — 统一聊页"AI 思考中"骨架 + 跳动圆点
- 抽取 `ChatErrorBanner` — 统一聊页错误提示横幅
- 抽取 `SuspenseFallback` — 统一 Suspense 加载占位
- 抽取 `FeedbackLoadingIndicator` — 统一反馈生成中状态
- 重构 `practice/page.tsx` 使用 4 个共享组件
- 重构 `exam/page.tsx` 使用 4 个共享组件

**关键文件**:
- `src/hooks/useAudioRecorder.ts` - 音频录制 hook（新建）
- `src/components/ChatUIStates.tsx` - 共享 UI 状态组件（新建）
- `src/components/VoiceControls.tsx` - 重构使用 useAudioRecorder
- `src/hooks/useShadowingPractice.ts` - 重构使用共享模块
- `src/app/practice/page.tsx` - 使用共享 UI 组件
- `src/app/practice/exam/page.tsx` - 使用共享 UI 组件

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，6 个测试文件 / 23 个测试

**代码减少**:
- VoiceControls.tsx 移除约 40 行内联录音逻辑
- useShadowingPractice.ts 移除约 30 行重复录音/API 调用
- practice/page.tsx 移除约 30 行重复 UI 模板
- exam/page.tsx 移除约 30 行重复 UI 模板

---

### Entry 32: E2E Mock 规划 (Phase D3)

**完成阶段**: Phase D3 测试与 CI — E2E 规划

**完成内容**:

**D3.1 候选 E2E 路径与 smoke 验收**:
- 盘点 7 条最值得覆盖的页面路径：`/`、`/practice/setup`、`/practice`、`/practice/exam`、`/practice/shadowing`、`/history`、`/stats`
- 为每条路径定义"无外部 API"的 smoke 验收标准（页面加载、关键 CTA 可见、空状态不崩溃、无 console error）

**D3.2 外部依赖 mock 方案**:
- LLM API（`/api/examiner` + `/api/feedback`）：通过 Playwright `page.route()` 拦截，返回固定 JSON 响应
- Azure TTS（`/api/tts`）：拦截返回空音频 blob 或 stub audio play 为 noop
- Azure Pronunciation（`/api/pronunciation`）：拦截返回固定评估结果 JSON
- Supabase Auth/History：未登录走 localStorage 路径无需 mock；已登录场景 stub `useAuth` 返回测试用户
- Audio Recording：Playwright Chromium 使用 `--use-fake-device-for-media-stream` 启动参数
- localStorage：默认不 mock，使用 fresh context；需预置数据时通过 `page.evaluate()` 写入

**D3.3 测试层级划分**:
- 单元/组件测试（Vitest + RTL）：纯 UI 渲染、参数拼接、工具函数
- E2E 测试（Playwright）：跨页面导航、关键交互路径、状态转换
- 真实 API E2E（手动）：完整端到端，不纳入 CI

**D3.4 推荐 E2E 测试用例**:
- P0：首页→setup→练习→结束→反馈→历史 核心路径 smoke
- P0：首页→模拟考试 smoke
- P0：历史页/统计页空状态
- P1：setup 参数传递、text/voice 模式切换、考试计时器
- P2：API 错误处理、深色模式

**D3.5 Playwright 安装前置条件**:
- 明确当前不安装 Playwright
- 安装前需满足：mock 方案验证可行、CI 稳定、维护责任人确定、运行环境确定
- 判断标准：Phase E/F 重构频繁触碰核心路径且组件测试不足时安装

**关键文件**:
- `docs/NEXT_OPTIMIZATION_PLAN.md` — D3 章节全面更新
- `docs/TASKS.md` — 标记 D3 完成
- `docs/DEVELOPMENT_LOG.md` — 本次记录

**验证结果**:
- 文档更新，无代码变更
- 未修改业务代码，未引入新依赖

---

### Entry 33: 数据流 Review (Phase E1)

**完成阶段**: Phase E1 数据层 review 深化

**完成内容**:

#### E1.1 文件职责梳理

| 文件 | 职责 | 存储层 | 读取方 |
|------|------|--------|--------|
| `history.ts` | 会话 CRUD（同步） | localStorage `echolingo_sessions` | `feedback-actions.ts`、`history/page.tsx`、`stats.ts`、`backup.ts` |
| `supabase-history.ts` | 会话 CRUD（云端） | Supabase `sessions` 表 | `unified-history.ts`（但无页面直接调用） |
| `unified-history.ts` | 会话路由层（local/cloud） | 两者 | `DataMigration.tsx`（仅迁移功能） |
| `feedback-actions.ts` | 保存会话 + 更新学习数据 | localStorage + Supabase | `practice/page.tsx`、`exam/page.tsx` |
| `error-patterns.ts` | 用户错误模式分析 | localStorage `echolingo_user_profile_{userId}` | `recommendations.ts`、`PersonalizedSuggestions.tsx` |
| `recommendations.ts` | 个性化话题推荐 | 读取 error-patterns + supabase-progress | `PersonalizedSuggestions.tsx` |
| `supabase-progress.ts` | 学习进度记录 | Supabase `learning_progress` 表 | `feedback-actions.ts`、`recommendations.ts` |
| `recordings.ts` | 音频录制存储 | IndexedDB `echolingo_recordings` | `RecordingsList.tsx` |
| `stats.ts` | 学习统计计算 | 读取 `history.ts` | `stats/page.tsx` |
| `backup.ts` | 数据备份/导入导出 | 读取 `history.ts` + `goals.ts` | `BackupModal.tsx` |

#### E1.2 保存策略分析

**未登录场景**：
- 会话：`feedback-actions.ts` → `history.ts`（localStorage）✅ 正常
- 错误模式：`error-patterns.ts`（localStorage）✅ 正常
- 学习进度：`supabase-progress.ts`（Supabase，静默失败）⚠️ 数据丢失
- 录音：IndexedDB ✅ 正常
- 统计/历史/备份：读取 localStorage ✅ 正常

**已登录场景**：
- 会话：`feedback-actions.ts` → `history.ts`（仅 localStorage）❌ **云端未保存**
- 错误模式：`error-patterns.ts`（仅 localStorage）❌ **不同设备不共享**
- 学习进度：`supabase-progress.ts`（Supabase）✅ 正常
- 录音：IndexedDB（仅本地）❌ **不上传云端**
- 统计/历史/备份：读取 localStorage ❌ **云端会话不可见**

#### E1.3 关键风险发现

**🔴 P0 — `unified-history.ts` 是死代码**

`unified-history.ts` 设计了云端+本地双写逻辑，但实际只有 `DataMigration.tsx` 引用它（仅用于迁移）。核心写入路径 `feedback-actions.ts` 直接调用 `history.ts`，完全绕过云端保存。

影响：已登录用户的所有练习会话只保存在 localStorage，换设备后数据丢失。

**🔴 P0 — History/Stats 页不读取云端数据**

`history/page.tsx` 和 `stats.ts` 直接导入 `history.ts`，只读 localStorage。即使 `unified-history.ts` 的 `getSessions()` 能合并云端+本地数据，也从未被调用。

影响：已登录用户在新设备上看到空历史记录。

**🟡 P1 — Session ID 不一致**

- 本地会话 ID：`Date.now().toString()`（时间戳字符串）
- 云端会话 ID：Supabase UUID
- 迁移后 ID 变化，IndexedDB 录音的 `sessionId` 引用断裂

影响：迁移本地数据到云端后，录音关联丢失。

**🟡 P1 — error-patterns 不跨设备同步**

`error-patterns.ts` 使用 localStorage（`echolingo_user_profile_{userId}`），不上传云端。`recommendations.ts` 同时依赖 error-patterns（本地）和 supabase-progress（云端），数据源不一致。

影响：换设备后个性化建议丢失，推荐引擎基于不完整数据工作。

**🟡 P1 — backup.ts 只备份本地数据**

`backup.ts` 的 `createBackup()` 读取 `history.ts`（localStorage），不包含 error-patterns、learning-progress 或 recordings。导入也只写入 localStorage。

影响：备份不完整，恢复后缺少学习进度和个性化数据。

**🟢 P2 — supabase-progress 无本地回退**

`supabase-progress.ts` 直接操作 Supabase，无 localStorage 备份。未登录时 `recordProgress()` 静默失败，学习进度丢失。

影响：未登录用户的学习进度不可恢复。

#### E1.4 最小可行重构建议

**建议 1：让 `feedback-actions.ts` 使用 `unified-history.ts`**（解决 P0）

将 `feedback-actions.ts` 第 2 行：
```
import { saveSession } from "./history";
```
改为：
```
import { saveSession } from "./unified-history";
```

影响范围：`practice/page.tsx`、`exam/page.tsx` 的保存路径。需验证 `saveSessionAndUpdateLearning` 返回类型兼容。

**建议 2：让 `history/page.tsx` 使用 `unified-history.ts`**（解决 P0）

将 `history/page.tsx` 第 5-6 行：
```
import { getSessions, deleteSession, clearAllSessions } from "@/lib/history";
import type { SavedSession } from "@/lib/history";
```
改为：
```
import { getSessions, deleteSession, clearAllSessions } from "@/lib/unified-history";
import type { SavedSession } from "@/lib/history";
```

注意：`getSessions()` 变为 async，需调整 `useEffect` 调用方式。`deleteSession` 和 `clearAllSessions` 也变为 async。

**建议 3：让 `stats.ts` 使用 `unified-history.ts`**（解决 P0）

`stats.ts` 第 1 行改为从 `unified-history.ts` 导入。`calculateStats()` 需变为 async。

**建议 4：统一 Session ID 生成**（解决 P1）

在 `history.ts` 的 `saveSession()` 中，将 ID 生成从 `Date.now().toString()` 改为使用 `crypto.randomUUID()`，确保本地和云端 ID 格式一致。

**建议 5：error-patterns 增加云端同步**（解决 P1，可延后）

在 `feedback-actions.ts` 中，调用 `updateErrorPatterns()` 后同步写入 Supabase。或在 `supabase-progress.ts` 中增加 error-patterns 表。

**建议 6：backup.ts 增加 error-patterns 导出**（解决 P1，可延后）

在 `createBackup()` 中增加 `errorPatterns` 字段，导入时恢复。

#### E1.5 建议执行顺序

1. 建议 1（feedback-actions → unified-history）— 一行改动，修复核心保存路径
2. 建议 4（统一 Session ID）— 独立改动，为后续铺路
3. 建议 2（history page → unified-history）— 需处理 async 变化
4. 建议 3（stats → unified-history）— 需处理 async 变化
5. 建议 5、6 — 可延后，不影响核心功能

**关键文件**:
- `src/lib/feedback-actions.ts` — 核心保存路径，当前绕过云端
- `src/lib/history.ts` — localStorage CRUD
- `src/lib/supabase-history.ts` — Supabase CRUD
- `src/lib/unified-history.ts` — 路由层（设计正确但未被使用）
- `src/app/history/page.tsx` — 直接读取 localStorage
- `src/lib/stats.ts` — 直接读取 localStorage
- `src/lib/error-patterns.ts` — localStorage only
- `src/lib/backup.ts` — 只备份本地数据

**验证结果**:
- 文档更新，无代码变更
- 未修改业务代码，未引入新依赖
- review 结论基于代码静态分析

---

### Entry 34: E2 数据流修复 + 退出登录修复

**完成阶段**: Phase E2 + Bug fix

**完成内容**:

**E2: 修复 `feedback-actions.ts` 绕过云端保存（P0）**

- `src/lib/feedback-actions.ts` 第 2 行 `import { saveSession } from "./history"` → `"./unified-history"`
- 第 82 行 `saveSession()` 调用增加 `await` 和 `practiceMode` 参数传递
- 效果：已登录用户练习/考试结束后，会话正确保存到 Supabase 云端 + localStorage 本地备份

**退出登录修复**

- `src/lib/auth-context.tsx`：`signOut` 函数增加 try-catch 错误处理，`signOut()` 失败时仍清空本地 user/profile 状态
- `src/app/settings/page.tsx`：设置页面新增"账户"区域，显示用户邮箱和退出登录按钮
- `src/locales/en.json` + `src/locales/zh.json`：新增 `settings.account` 翻译 key
- 效果：用户在设置页面可直接退出登录，不再依赖 DesktopNav 头像下拉菜单

**关键文件**:
- `src/lib/feedback-actions.ts` — import 路径修改
- `src/lib/auth-context.tsx` — signOut 错误处理
- `src/app/settings/page.tsx` — 新增账户区域
- `src/locales/en.json` — 新增 `settings.account`
- `src/locales/zh.json` — 新增 `settings.account`

**验证结果**:
- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，6 文件 / 23 测试

---

### Entry 35: 历史页云端读取修复

**完成阶段**: Phase E 数据与云端同步稳定性 — P0 历史页读取路径

**完成内容**:
- `src/app/history/page.tsx` 从 `@/lib/history` 切换为 `@/lib/unified-history`，历史页读取会话时自动走已登录云端优先、未登录本地 fallback。
- 将历史页初始化加载、单条删除、批量删除、清空全部和导入后刷新调整为 async，匹配统一历史 API。
- 保留现有历史列表、详情复盘、搜索排序、导出、备份导入、录音回放和批量选择 UI 行为。

**关键文件**:
- `src/app/history/page.tsx` — 历史页数据入口改为 unified history，并处理 async 状态更新。
- `docs/DEVELOPMENT_LOG.md` — 记录本次完成内容和验证结果。
- `docs/PROJECT_CONTEXT.md` — 更新当前数据管理能力说明。
- `docs/TASKS.md` — 标记 Phase E 历史页 P0 修复完成，保留下一项数据流任务。

**验证结果**:
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:unit:run` 通过，6 个测试文件 / 23 个测试。
- `npm run build` 通过。

---

### Entry 36: 统计页云端读取修复

**完成阶段**: Phase E 数据与云端同步稳定性 — P0 统计页读取路径

**完成内容**:
- `src/lib/stats.ts` 从 `history.ts` 切换为 `unified-history.ts`，`calculateStats()` 改为 async，统计计算会读取已登录云端优先、本地 fallback 的统一会话列表。
- `src/app/stats/page.tsx` 在 `useEffect` 中等待 `calculateStats()` 完成后再更新 UI，并保留现有 300ms loading 过渡和本地目标进度计算。
- 增加卸载保护，避免统计异步读取返回后更新已卸载组件。

**关键文件**:
- `src/lib/stats.ts` — 统计数据源改为 unified history。
- `src/app/stats/page.tsx` — 统计页加载流程改为 async。
- `docs/DEVELOPMENT_LOG.md` — 记录本次完成内容和验证结果。
- `docs/PROJECT_CONTEXT.md` — 更新数据管理状态。
- `docs/TASKS.md` — 标记 Phase E 统计页 P0 修复完成。

**验证结果**:
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:unit:run` 通过，6 个测试文件 / 23 个测试。
- `npm run build` 通过。

---

### Entry 37: Session ID 与本地模式保存修复

**完成阶段**: Phase E 数据与云端同步稳定性 — P1 Session ID 与本地备份准确性

**完成内容**:
- `src/lib/history.ts` 新增 `createSessionId()`，优先使用 `crypto.randomUUID()` 生成本地会话 ID，降低迁移和本地/云端 ID 格式不一致风险。
- `history.saveSession()` 增加 `mode` 参数并默认保持 `ielts_part_1`，避免未登录或云端失败 fallback 时练习模式被固定成 Part 1。
- `src/lib/unified-history.ts` 在云端保存成功后的本地备份和本地 fallback 中都传入 `mode`，让历史和统计的 Part 分布更准确。

**关键文件**:
- `src/lib/history.ts` — 本地会话 ID 生成和 mode 保存。
- `src/lib/unified-history.ts` — 本地备份/fallback 传递真实练习模式。
- `docs/DEVELOPMENT_LOG.md` — 记录本次完成内容和验证结果。
- `docs/PROJECT_CONTEXT.md` — 更新数据层稳定性状态。
- `docs/TASKS.md` — 标记 Phase E Session ID 修复完成。

**验证结果**:
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:unit:run` 通过，6 个测试文件 / 23 个测试。
- `npm run build` 通过。

---

### Entry 38: 备份错误模式补齐

**完成阶段**: Phase E 数据与云端同步稳定性 — P1 备份范围

**完成内容**:
- `src/lib/error-patterns.ts` 增加 `getAllUserProfiles()` 和 `restoreUserProfiles()`，用于导出/恢复 localStorage 中的用户错误模式画像。
- `src/lib/backup.ts` 在备份数据中增加可选 `errorPatterns` 字段，导出时包含用户画像，导入时恢复该字段。
- 备份校验保持向后兼容：旧备份没有 `errorPatterns` 仍然有效；新备份会校验用户画像的核心结构。
- `src/lib/backup.test.ts` 增加 error-patterns 备份校验用例。

**关键文件**:
- `src/lib/error-patterns.ts` — 错误模式画像导出/恢复工具。
- `src/lib/backup.ts` — 备份格式增加可选 `errorPatterns` 并支持导入恢复。
- `src/lib/backup.test.ts` — 新增备份校验测试。
- `docs/DEVELOPMENT_LOG.md` — 记录本次完成内容和验证结果。
- `docs/PROJECT_CONTEXT.md` — 更新备份能力状态。
- `docs/TASKS.md` — 标记 Phase E 备份范围补齐完成。

**验证结果**:
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:unit:run` 通过，6 个测试文件 / 25 个测试。
- `npm run build` 通过。

---

### Entry 39: Phase F 代码结构收敛完成

**完成阶段**: Phase F 代码结构收敛

**完成内容**:

**F1. 练习结束保存流程边界复查**:
- 审查 `saveSessionAndUpdateLearning` 职责：发音评估、会话保存、错误模式更新、进度记录
- 各子操作委托给专用模块（unified-history、error-patterns、supabase-progress）
- practice 和 exam 页面错误处理一致（try-catch + 错误消息展示）
- 结论：函数职责边界合理，无需重构

**F2. setup 页面重复 UI 逻辑收敛**:
- `practice/setup/page.tsx` 内联 Suspense fallback 改用共享 `SuspenseFallback` 组件
- `practice/shadowing/page.tsx` 同步修复，统一使用 `SuspenseFallback`
- 与 `practice/page.tsx` 和 `practice/exam/page.tsx` 保持一致

**F3. UI 状态组件使用范围复查**:
- `ChatUIStates` 组件仅用于聊天/反馈场景（practice、exam、shadowing、setup），范围合理
- History/Stats 的 loading/empty 状态语义不同于聊天场景（页面级数据加载 vs AI 思考）
- 各页面空状态内容独特（不同图标、文案、CTA），不适合强行抽象
- 结论：当前分离适当，无需创建通用 EmptyState 组件

**关键文件**:
- `src/app/practice/setup/page.tsx` — Suspense fallback 统一
- `src/app/practice/shadowing/page.tsx` — Suspense fallback 统一
- `src/components/ChatUIStates.tsx` — 共享 UI 状态组件（已存在）

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，6 个测试文件 / 25 个测试

---

### Entry 40: 网页端交互打磨

**完成阶段**: 网页端体验优化

**完成内容**:

**Practice 页面**:
- context strip 硬编码英文文案国际化：Session goal / Evidence collected / candidate answers
- 新增 i18n key：`practice.sessionGoal`、`practice.sessionGoalHint`、`practice.evidenceCollected`、`practice.candidateAnswers`
- 消息气泡 `gray-*` → `slate-*` 颜色统一（examiner 气泡背景、边框、文字）
- 模式切换按钮 `gray-*` → `slate-*` 颜色统一

**FeedbackPanel 组件**:
- `bandLevel()` 函数改为使用 i18n，新增 `feedback.bandLevel.ready/building/strengthen/foundation` 中英文翻译
- footer CTA 按钮从 `emerald-600` 统一为 `slate-950`（与全站主按钮风格一致）

**关键文件**:
- `src/app/practice/page.tsx` — i18n 和颜色统一
- `src/components/FeedbackPanel.tsx` — bandLevel i18n 和 CTA 颜色
- `src/locales/en.json` — 新增 8 个翻译 key
- `src/locales/zh.json` — 新增 8 个翻译 key

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，6 个测试文件 / 25 个测试

---

### Entry 41: Phase E2 — 错误模式与推荐联动补强

**完成阶段**: Phase E2 数据与云端同步稳定性深化

**完成内容**:

**error-patterns.ts 数据消费扩展**:
- `updateErrorPatterns` 新增消费 `errorAnnotations`：从标注错误中提取 typed pattern、corrected 文本和 examples
- 新增消费 `improvementSuggestions`：自动填充 `ErrorPattern.improvement` 字段
- 抽取 `inferTypeFromText()` 辅助函数，减少重复代码
- 新增 `ErrorAnnotation` 类型导入
- 兼容旧数据：`errorAnnotations` 和 `improvementSuggestions` 均为可选字段，缺失时不崩溃
- examples 上限 5 条，commonErrors 上限 20 条（保持不变）

**recommendations.ts 推荐理由优化**:
- 新增 `getTopErrorForSkill()` 函数，按 skill type 获取最高频具体错误
- 推荐理由从泛化 `"Improve your grammar"` 改为具体 `"Work on grammar: "subject-verb agreement""`
- 无匹配错误时保持 fallback 泛化理由

**测试覆盖**:
- 新增 `src/lib/error-patterns.test.ts`，20 个测试用例
- 覆盖：基础 weakness 处理、type 推断、errorAnnotations 提取、duplicate 合并、examples 累积上限、improvementSuggestions 填充、不覆盖已有 improvement、向后兼容（缺失字段）、getUserProfile、getPersonalizedSuggestions、getErrorStats

**关键文件**:
- `src/lib/error-patterns.ts` — 数据消费扩展
- `src/lib/recommendations.ts` — 推荐理由关联具体错误
- `src/lib/error-patterns.test.ts` — 新增测试文件

**验证结果**:
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，7 个测试文件 / 45 个测试

---

### Entry 42: E2E 测试落地 — Playwright 安装与 P0/P1/P2 smoke 测试

**完成阶段**: Phase D3 E2E 测试规划 → 落地

**完成内容**:

**Playwright 安装与配置**:
- 安装 `@playwright/test` 和 Chromium 浏览器
- 创建 `playwright.config.ts`：单 worker、非并行、list reporter、webServer 自动启动 dev server
- Chromium 配置 `--use-fake-device-for-media-stream` 和 `--use-fake-ui-for-media-stream` 绕过麦克风权限
- 新增 `test:e2e` 和 `test:e2e:ui` npm scripts

**Mock 工具层 (`e2e/helpers.ts`)**:
- `mockExaminerApi()` — 拦截 `/api/examiner` 返回固定考官消息
- `mockFeedbackApi()` — 拦截 `/api/feedback` 返回完整 SessionFeedback（含 errorAnnotations）
- `mockTtsApi()` — 拦截 `/api/tts` 返回空音频 blob
- `mockPronunciationApi()` — 拦截 `/api/pronunciation` 返回固定评分结果
- `mockAllApis()` — 一次性设置所有 mock

**Smoke 测试 (`e2e/smoke.spec.ts`)**:

P0 — 核心路径：
1. 首页加载 DesktopNav 和主 CTA 链接，无 console error
2. setup 页渲染训练类型、模式卡片和 Start 按钮
3. 练习 → 结束 → 反馈 → 历史完整流程（mock API）
4. 首页 → 模拟考试入口导航
5. 历史页空状态展示
6. 统计页空状态展示

P1 — 关键交互：
7. setup 页 `?focus=fluency,grammar` 参数传递
8. 练习页 text/voice 模式切换

P2 — 边界场景：
9. examiner API 返回 500 时展示错误横幅
10. 深色模式下首页和 setup 页不崩溃

**Vitest 配置修复**:
- `vitest.config.mts` 新增 `exclude: ["e2e/**"]`，避免 Vitest 误加载 Playwright 测试文件

**关键文件**:
- `playwright.config.ts` — Playwright 配置
- `e2e/helpers.ts` — API mock 工具
- `e2e/smoke.spec.ts` — P0/P1/P2 smoke 测试
- `vitest.config.mts` — 排除 e2e 目录
- `package.json` — 新增 @playwright/test 依赖和 scripts

**验证结果**:
- `npx playwright test` 10 passed (8.7s)
- `npm run lint` 通过，0 warning / 0 error
- `npm run typecheck` 通过
- `npm run test:unit:run` 通过，7 个测试文件 / 45 个测试
