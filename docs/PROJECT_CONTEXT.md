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
- **存储**: 浏览器 localStorage (MVP)

### 部署

- 平台: Vercel 或类似托管服务
- 环境变量: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`

---

## 核心功能

### 1. 练习模式

- **IELTS Part 1**: 日常话题问答
- **IELTS Part 2**: 长独白（话题卡）
- **IELTS Part 3**: 深度讨论

### 2. 交互方式

- **文本模式**: 传统打字输入
- **语音模式**: Web Speech API 语音输入/输出
  - STT (Speech-to-Text): 语音识别
  - TTS (Text-to-Speech): 语音合成
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

### 5. 数据管理

- 本地历史记录保存
- 历史记录搜索和筛选
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
| `/history` | 历史记录 |
| `/stats` | 统计页面 |
| `/settings` | 设置页面 |
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
  strengths: string[];
  weaknesses: string[];
  improvementSuggestions: string[];
  improvedSampleAnswer: string;
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
  ...
}
```

---

## 关键文件结构

```
src/
├── app/
│   ├── page.tsx              # 落地页
│   ├── practice/
│   │   ├── page.tsx          # 练习页面
│   │   └── setup/page.tsx    # 模式选择
│   ├── history/page.tsx      # 历史记录
│   ├── stats/page.tsx        # 统计页面
│   ├── settings/page.tsx     # 设置页面
│   ├── debug/page.tsx        # 调试页面
│   └── api/
│       ├── examiner/route.ts # 考官 API
│       └── feedback/route.ts # 反馈 API
├── components/
│   ├── VoiceInput.tsx        # 语音输入
│   ├── VoiceOutput.tsx       # 语音输出
│   ├── VoiceControls.tsx     # 语音控制栏
│   ├── VoiceVisualizer.tsx   # 音波可视化
│   ├── Chart.tsx             # 图表组件
│   ├── BackupModal.tsx       # 备份弹窗
│   └── ...
├── hooks/
│   ├── useVoiceConversation.ts # 语音对话 hook
│   ├── useMobile.ts          # 移动端检测
│   ├── useNetworkStatus.ts   # 网络状态
│   └── useCleanup.ts         # 清理 hook
├── lib/
│   ├── history.ts            # 历史记录管理
│   ├── topics.ts             # 话题库
│   ├── stats.ts              # 统计计算
│   ├── goals.ts              # 目标管理
│   ├── backup.ts             # 备份恢复
│   ├── error-logger.ts       # 错误日志
│   ├── api-cache.ts          # API 缓存
│   └── performance.ts        # 性能监控
└── types/
    ├── index.ts              # 核心类型
    └── speech.d.ts           # 语音 API 类型
```

---

## 当前状态

### ✅ 已完成内容

| 类别 | 完成项 |
|------|--------|
| 核心练习流程 | Part 1/2/3 多模式、AI考官对话、会话反馈、预估分数 |
| 语音功能 | STT 语音输入、TTS 语音输出、语音交互流程、Real-time 模式 |
| 数据管理 | 本地历史、搜索筛选、导出导入、备份恢复 |
| 用户体验 | 深色模式、动画效果、PWA、响应式布局、无障碍访问 |
| 统计与目标 | 练习统计、趋势图、目标设定 |
| 稳定性 | 错误边界、网络检测、错误日志 |

### ❌ 待补齐内容

**核心功能缺失** (高优先级):
- 用户注册/登录 - 目前纯本地存储，换设备数据丢失
- 云端数据同步 - 练习记录、进度需要持久化存储
- ~~发音评估 - 目前是占位符，需集成语音评分 API~~ ✅

**功能增强** (中优先级):
- 模拟考试模式 - 完整 Part 1→2→3 连续考试流程，含计时
- 话题库扩充 - 目前仅 6 个话题，需覆盖雅思常考话题
- 录音回放 - 保存用户语音供回听对比
- AI 个性化记忆 - 记住用户常犯错误，针对性练习
- 学习路径推荐 - 基于薄弱项推荐练习内容

**平台化功能** (低优先级):
- 管理员后台、界面国际化、支付系统、社交功能

### 📋 下一阶段重点

1. 用户系统 + 云端存储
2. 发音评估集成
3. 完整模拟考试模式
