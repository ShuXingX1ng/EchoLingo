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
