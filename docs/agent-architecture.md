# EchoLingo Agent Architecture

```mermaid
flowchart TD
    INPUT["用户输入\ntaskType · stimulus · response · audio?"]

    subgraph SA["🎤 Speaking Agent"]
        SA1["Azure Pronunciation Assessment\nRead Aloud · Repeat Sentence\n词级别 + 音素级别评分"]
        SA2["Whisper 转录\n其他口语题型\nAnswer Short Question · Describe Image"]
        SA3["维度分析\nFluency · Pronunciation · Content"]
        SA1 --> SA3
        SA2 --> SA3
    end

    subgraph WA["✍️ Writing Agent"]
        WA1["RAGAS\nFaithfulness + Answer Relevancy\nSummarize Written Text"]
        WA2["LLM Rubric 评分\nWrite Essay"]
        WA3["维度分析\nContent · Form · Grammar · Vocabulary"]
        WA1 --> WA3
        WA2 --> WA3
    end

    subgraph RA["📖 Reading Agent  ⚠️ 设计态，未实现"]
        RA1["对错评分\nFill in the Blanks · Multiple Choice"]
        RA2["序列分析\nRe-order Paragraphs"]
    end

    subgraph LA["🎧 Listening Agent"]
        LA1["Whisper 转录 + 时间戳"]
        LA2["关键信息提取 + 答案对比\nWrite from Dictation · Summarize Spoken Text ⚠️"]
        LA1 --> LA2
    end

    SCORE["Scoring Agent\n10–90 分值，对齐 PTE 官方维度\n口语分加注「仅供参考」"]

    DIAG["Diagnosis Agent\n推导 Task-Type Weakness\n以 Task Type 为粒度 · 近期记录滚动加权"]

    COACH["Coach Agent\n针对薄弱维度生成可操作建议"]

    JUDGE["LLM-as-Judge\n独立重评 Scoring Agent 分数\n任意维度分差 > 15 触发重评\n记录分歧案例 → 量化 Judge 一致率"]

    OUT["输出\nFeedback Details\n维度缺口分析（对比用户目标分）\nDaily Plan 更新（优先推弱 Task Type）"]

    INPUT --> SA
    INPUT --> WA
    INPUT --> RA
    INPUT --> LA

    SA --> SCORE
    WA --> SCORE
    RA --> SCORE
    LA --> SCORE

    SCORE --> JUDGE
    JUDGE -->|"一致 ✓"| DIAG
    JUDGE -->|"分歧 → 重评"| SCORE

    DIAG --> COACH
    COACH --> OUT
```

## 关键设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 无 Router Agent | 题型由调用方直接传入 | taskType 始终已知，路由层没有实际判断价值 |
| Azure PA vs Whisper | Azure 做发音评分，Whisper 做其他题型转录 | Azure 提供音素级别数据，Whisper 只有时间戳 |
| 评分范围 | 10–90，对齐 PTE 官方维度 | Reading/Writing 维度客观可测；Speaking 加免责标注 |
| RAGAS 范围 | 仅用于 Summarize Written Text | Write Essay 无 context，RAGAS 不适用 |
| LLM-as-Judge 阈值 | 任意维度差值 > 15 分触发重评 | 规则简单可解释，分歧率可量化 |
| 用户画像粒度 | Task Type 级别 | Section 级别聚合会丢失诊断信息 |
| 学习轨迹 | 缺口分析（对比目标分） | 不预测绝对考试分数，避免不可验证的承诺 |

## 实现状态

| 组件 | 状态 |
|---|---|
| Speaking Agent（Read Aloud, Repeat Sentence, Answer Short Question） | ✅ 已实现 |
| Writing Agent（Summarize Written Text, Write Essay） | ✅ 已实现 |
| Listening Agent（Write from Dictation） | ✅ 已实现 |
| Reading Agent | 🔵 设计完成，待实现 |
| Listening Agent（Summarize Spoken Text, FitB, Highlight Correct Summary） | 🔵 设计完成，待实现 |
| Scoring Agent · Diagnosis Agent · Coach Agent | ✅ 核心逻辑已实现（task-weakness.ts · recommendations.ts） |
| LLM-as-Judge | 🔵 设计完成，待实现 |
| 学习轨迹可视化 | 🔵 设计完成，待实现 |
```
