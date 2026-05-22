# EchoLingo 项目上下文

## 产品概述

**EchoLingo** 是一个 AI 驱动的 IELTS Speaking 练习应用。

### 核心价值

帮助 IELTS 学习者以更自然、互动、个性化的方式练习口语。用户可以与 AI 考官进行模拟对话，获得结构化反馈和预估分数。

### 目标用户

- 准备 IELTS 口语考试的学生
- 想提高英语口语自信的国际学生
- 需要低压练习环境的学习者
- 希望获得答题反馈和分数预估的用户

---

## 技术架构

### 前端技术栈

- **框架**: Next.js (App Router)
- **语言**: TypeScript
- **UI**: React + Tailwind CSS
- **状态管理**: React Hooks + localStorage

### 后端技术栈

- **API**: Next.js API Routes
- **AI**: OpenAI 兼容 LLM API
- **语音**: Azure Speech SDK (TTS + Pronunciation Assessment)
- **存储**: Supabase (PostgreSQL) + 浏览器 localStorage
- **认证**: Supabase Auth (邮箱 + Google OAuth)

### 部署

- 平台: Vercel 或类似托管服务
- 环境变量: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 商业化能力（付费计划、支付系统、订阅、商业运营配置等）当前不实施，统一放入 future/backlog。

### 项目协作约定

- `AGENTS.md` 要求在修改 Next.js 代码前阅读 `node_modules/next/dist/docs/` 中的相关文档。
- Next.js 16 配置已迁移：Turbopack 使用 `next.config.ts` 顶层 `turbopack.root` 固定项目根目录，路由边界文件使用 `src/proxy.ts` 而不是 deprecated `middleware.ts`。
- 当前默认本地开发命令使用 `next dev --webpack`，用于规避本机 Turbopack dev 首屏编译卡死和内存暴涨；`npm run dev:turbo` 保留为 Turbopack 对照入口。
- 下一阶段优化路线记录在 `docs/NEXT_OPTIMIZATION_PLAN.md`，新窗口接手时应优先阅读。
- 完成有意义的开发任务后，使用 `.agents/skills/update-dev-log` / `$update-project-docs` 更新 `docs/DEVELOPMENT_LOG.md`、`docs/PROJECT_CONTEXT.md` 和 `docs/TASKS.md`。
- 文档更新只记录实际完成的工作和真实验证结果；商业化、支付、订阅、社交能力默认保持在 future/backlog。

### CI/CD

- GitHub Actions 工作流：`.github/workflows/ci.yml`
- 触发条件：push 和 pull_request 到 main 分支
- 质量门：lint、typecheck、unit test、build
- 本地质量门命令：`npm run lint && npm run typecheck && npm run test:unit:run && npm run build`

### 数据层架构

| 模块 | 职责 | 存储 | API |
|------|------|------|-----|
| `history.ts` | 本地会话存储 | localStorage (max 50) | 同步 |
| `supabase-history.ts` | 云端会话存储 | Supabase (max 100) | 异步 |
| `unified-history.ts` | 统一入口 | 自动选择 | 异步 |
| `error-patterns.ts` | 错误模式分析 | localStorage | 同步 |
| `recommendations.ts` | 话题推荐 | 读取 progress + error-patterns | 异步 |

**保存策略**：
- 已登录：云端 + 本地备份，读取优先云端
- 未登录：本地存储
- 迁移：支持本地 → 云端一键迁移

---

## 核心功能

### 1. 练习模式

- **IELTS Part 1**: 日常话题问答
- **IELTS Part 2**: 长独白（话题卡）
- **IELTS Part 3**: 深度讨论

### 2. 交互方式

- **文本模式**: 传统打字输入
- **语音模式**: 语音输入/输出
  - STT (Speech-to-Text): Web Speech API 语音识别
  - TTS (Text-to-Speech): Azure Neural TTS (11 种音色可选)
  - 实时对话流程

### 3. AI 考官

- 模拟真实 IELTS 考官行为
- 一次只问一个问题
- 根据用户回答进行追问
- 会话期间不提供反馈

### 4. 反馈系统

- 预估 IELTS 分数 (Band Score)
- 流利度与连贯性评估
- 词汇资源评估
- 语法范围与准确性评估
- 优点和改进建议
- 改进版示例答案
- 学习复盘面板：将反馈转化为下一步学习计划，展示 Top 3 优先改进项、优势、重点改进区、发音练习队列和后续练习入口
- 评分维度、发音详情、错误纠正和示例答案默认收纳为可展开详情，避免反馈页过长
- 历史详情复用同一套学习复盘内容组件，避免练习结束反馈和历史回看反馈分叉

### 5. 数据管理

- 本地历史记录保存
- 历史记录搜索和筛选
- 历史列表展示 Band、Top weakness、下一步建议和练习模式，帮助用户从记录回看进入下一步学习
- 数据导出 (JSON/CSV)
- 数据备份和恢复
- 存储空间管理

### 6. 统计与目标

- 练习次数统计
- 分数趋势图表
- 练习目标设定
- 进度追踪

---

## 页面结构

| 路径 | 功能 |
|------|------|
| `/` | 落地页，产品介绍 |
| `/practice` | 练习页面 |
| `/practice/setup` | 模式和话题选择 |
| `/practice/exam` | 模拟考试 (Part 1→2→3 完整流程) |
| `/practice/shadowing` | 跟读/模仿练习 |
| `/history` | 历史记录 |
| `/stats` | 统计页面 |
| `/settings` | 设置页面 |
| `/login` | 登录页面 |
| `/auth/callback` | Supabase OAuth 回调 |
| `/admin` | 管理后台 |
| `/admin/topics` | 话题管理 |
| `/admin/users` | 用户管理 |
| `/debug` | 调试页面 |

---

## 数据模型

### ChatMessage

```typescript
type ChatMessage = {
  id: string;
  role: "examiner" | "user";
  content: string;
  createdAt: string;
};
```

### SpeakingSession

```typescript
type SpeakingSession = {
  id: string;
  mode: "ielts_part_1" | "ielts_part_2" | "ielts_part_3";
  messages: ChatMessage[];
  feedback?: SessionFeedback;
  createdAt: string;
  endedAt?: string;
};
```

### SessionFeedback

```typescript
type SessionFeedback = {
  estimatedBand: number;
  fluencyAndCoherence: string;
  lexicalResource: string;
  grammarRangeAndAccuracy: string;
  pronunciation: string;
  pronunciationAssessment?: PronunciationAssessmentResult;
  strengths: string[];
  weaknesses: string[];
  improvementSuggestions: string[];
  improvedSampleAnswer: string;
  errorAnnotations?: ErrorAnnotation[];
};

type ErrorAnnotation = {
  original: string;
  corrected: string;
  type: "grammar" | "vocabulary" | "fluency" | "pronunciation";
  explanation: string;
};

type PronunciationAssessmentResult = {
  score: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  words: WordAssessment[];
  summary: string;
};

type WordAssessment = {
  word: string;
  score: number;
  accuracyScore: number;
  errorType?: string; // Azure: None, Omission, Insertion, Mispronunciation
  phonemes?: PhonemeAssessment[];
};

type PhonemeAssessment = {
  phoneme: string;
  score: number;
  accuracyScore: number;
};
```

---

## API 端点

### POST /api/examiner

生成下一个 IELTS 考官问题。

**请求体:**
```json
{
  "mode": "ielts_part_1",
  "messages": [...]
}
```

**响应:**
```json
{
  "message": "What do you like most about your hometown?"
}
```

### POST /api/feedback

生成结构化 IELTS 口语反馈。

**请求体:**
```json
{
  "mode": "ielts_part_1",
  "messages": [...]
}
```

**响应:**
```json
{
  "estimatedBand": 6.0,
  "fluencyAndCoherence": "...",
  "lexicalResource": "...",
  "errorAnnotations": [...],
  ...
}
```

### POST /api/tts

Azure Neural TTS 语音合成。

**请求体:**
```json
{
  "text": "Hello, how are you?",
  "voice": "en-US-AriaNeural",
  "rate": 0.95
}
```

**响应:** WAV 音频流

### POST /api/pronunciation

Azure 发音评估。

**请求体:** FormData (audio file + reference text)

**响应:**
```json
{
  "score": 85,
  "accuracyScore": 82,
  "fluencyScore": 88,
  "completenessScore": 91,
  "words": [...],
  "summary": "Good pronunciation with minor areas for improvement."
}
```

---

## 关键文件结构

```
src/
├── app/
│   ├── page.tsx              # 落地页
│   ├── login/page.tsx        # 登录页面
│   ├── auth/callback/route.ts # OAuth 回调
│   ├── proxy.ts              # Next 16 Proxy，刷新 Supabase session 并保护 admin 路由
│   ├── practice/
│   │   ├── page.tsx          # 练习页面
│   │   ├── setup/page.tsx    # 模式选择
│   │   ├── exam/page.tsx     # 模拟考试
│   │   └── shadowing/page.tsx # 跟读练习
│   ├── history/page.tsx      # 历史记录
│   ├── stats/page.tsx        # 统计页面
│   ├── settings/page.tsx     # 设置页面
│   ├── admin/
│   │   ├── layout.tsx        # 管理后台布局
│   │   ├── page.tsx          # 管理后台首页
│   │   ├── topics/page.tsx   # 话题管理
│   │   └── users/page.tsx    # 用户管理
│   ├── debug/page.tsx        # 调试页面
│   └── api/
│       ├── examiner/route.ts # 考官 API
│       ├── feedback/route.ts # 反馈 API
│       ├── tts/route.ts      # Azure TTS API
│       └── pronunciation/route.ts # 发音评估 API
├── components/
│   ├── VoiceInput.tsx        # 语音输入
│   ├── VoiceOutput.tsx       # 语音输出 (Azure TTS)
│   ├── VoiceControls.tsx     # 语音控制栏
│   ├── VoiceVisualizer.tsx   # 音波可视化
│   ├── FeedbackPanel.tsx     # 学习复盘反馈面板和可嵌入 FeedbackReview
│   ├── DesktopNav.tsx        # 共享桌面端导航组件
│   ├── PronunciationFeedback.tsx # 发音评估展示
│   ├── ShadowingProgress.tsx # 跟读进度指示
│   ├── ShadowingSentenceCard.tsx # 跟读练习卡片
│   ├── ShadowingSummary.tsx  # 跟读练习总结
│   ├── ErrorAnnotations.tsx  # 错误标注组件
│   ├── LearningPath.tsx      # 学习路径推荐
│   ├── MobileNav.tsx         # 移动端底部学习导航
│   ├── UserMenu.tsx          # 用户菜单
│   ├── DataMigration.tsx     # 数据迁移
│   ├── MuteButton.tsx        # 静音按钮
│   ├── Chart.tsx             # 图表组件
│   ├── BackupModal.tsx       # 备份弹窗
│   └── ...
├── hooks/
│   ├── useVoiceConversation.ts # 语音对话 hook
│   ├── useShadowingPractice.ts # 跟读练习 hook
│   ├── useMobile.ts          # 移动端检测
│   ├── useNetworkStatus.ts   # 网络状态
│   └── useCleanup.ts         # 清理 hook
├── lib/
│   ├── supabase.ts           # Supabase 客户端
│   ├── supabase-server.ts    # Supabase 服务端
│   ├── auth-context.tsx      # 认证上下文
│   ├── unified-history.ts    # 统一历史管理
│   ├── supabase-history.ts   # 云端历史操作
│   ├── i18n.tsx              # 国际化
│   ├── history.ts            # 本地历史记录
│   ├── topics.ts             # 话题库 (36 个)
│   ├── stats.ts              # 统计计算
│   ├── goals.ts              # 目标管理
│   ├── backup.ts             # 备份恢复
│   ├── reminders.ts          # 学习提醒
│   ├── recordings.ts         # 录音存储 (IndexedDB)
│   ├── error-patterns.ts     # 错误模式分析
│   ├── recommendations.ts    # 推荐引擎
│   ├── audio-utils.ts        # 音频录制/WAV 编码
│   ├── error-logger.ts       # 错误日志
│   ├── api-cache.ts          # API 缓存
│   └── performance.ts        # 性能监控
├── locales/
│   ├── en.json               # 英文翻译
│   └── zh.json               # 中文翻译
└── types/
    ├── index.ts              # 核心类型
    └── speech.d.ts           # 语音 API 类型
.agents/
└── skills/
    ├── update-dev-log/       # 完成开发任务后更新项目文档
    ├── diagnose/             # 调试诊断流程
    ├── prototype/            # 逻辑/UI 原型
    └── ...
```

---

## 当前状态

### ✅ 已完成内容

| 类别 | 完成项 |
|------|--------|
| 核心练习流程 | Part 1/2/3 多模式、AI考官对话、会话反馈、预估分数 |
| 语音功能 | STT 语音输入、Azure Neural TTS (11 种音色)、语音交互流程 |
| 发音评估 | Azure Pronunciation Assessment，单词级和音素级评分 |
| 跟读练习 | 听标准发音模仿跟读、逐句评分、练习总结 |
| 模拟考试 | Part 1→2→3 完整流程、计时器、阶段指示、综合反馈 |
| 错误标注 | 反馈中具体标注语法/词汇/流利度错误并给出纠正 |
| 数据管理 | 本地历史、搜索筛选、导出导入、备份恢复、历史页学习复盘回看 |
| 用户体验 | 深色模式、动画效果、PWA、响应式布局、无障碍访问、移动端底部学习导航 |
| 桌面端统一 | DesktopNav 共享组件、颜色/宽度/i18n 统一、9 个页面一致体验 |
| 统计与目标 | 练习统计、趋势图、目标设定 |
| 稳定性 | 错误边界、网络检测、错误日志 |
| 用户认证 | 邮箱登录、Google OAuth、云端数据同步 |
| 内容丰富 | 话题库扩充至 36 个、录音回放、AI 个性化记忆 |
| 平台化 | 管理后台、学习路径推荐、国际化 (中英文) |
| 学习提醒 | 考试倒计时、每日练习提醒、连续练习天数 |
| 项目协作 | `$update-project-docs` skill 和 AGENTS.md 规则用于持续同步项目文档 |

### ❌ 待补齐内容

**下一阶段优化**:
- ~~学习闭环统一：反馈建议联动下一次练习，发音队列联动跟读~~ ✅
- ~~历史与统计页学习化：历史页已升级，统计页已改为学习进度页~~ ✅
- ~~桌面端网页统一：共享导航、颜色/宽度/i18n 统一~~ ✅
- 移动端核心流程打磨：练习输入区、setup CTA、首页首屏密度
- 测试与 CI：组件测试扩展、CI 质量门、E2E mock 规划
- 数据与云端同步稳定性：审查 localStorage、Supabase、IndexedDB 职责边界
- 代码结构收敛：减少普通练习/模拟考试/反馈保存逻辑重复

**平台化功能** (低优先级):
- 支付系统 / 订阅 / 商业化运营：future/backlog，当前不实施
- 社交功能 (排行榜、学习小组)：future/backlog，当前不实施

**技术债务**:
- 单元测试覆盖持续扩展（已有 topics、backup、audio-utils、FeedbackPanel 发音队列、MobileNav 路由显示/隐藏、practice setup start URL 覆盖）
- E2E 测试
- 性能监控完善
- lint 当前为 0 warning / 0 error
- 本机 native binding 签名问题需继续处理：Next SWC / Vitest Rolldown 在部分启动路径下会被 macOS 拒绝 dlopen
