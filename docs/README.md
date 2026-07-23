# EchoLingo 项目文档

本目录保存仍参与产品决策、开发或运行维护的长期文档。临时会话状态由 ECC `/save-session` 管理，详细代码历史由 Git 保存，不在 `docs/` 中重复记账。

## 按任务读取

| 需要了解的内容 | 首选文档 | 何时读取 |
|---|---|---|
| 领域术语与产品边界 | [`../CONTEXT.md`](../CONTEXT.md) | 产品、命名、反馈或评分相关工作 |
| 当前产品与运行状态 | [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) | 影响系统边界、架构或数据的工作 |
| 当前阶段与未来方向 | [`ROADMAP.md`](ROADMAP.md) | 选择下一项工作或判断范围 |
| Speech Evaluator 详细计划 | [`SPEECH_EVALUATOR_ROADMAP.md`](SPEECH_EVALUATOR_ROADMAP.md) | 自研语音评估器相关工作 |
| 架构决策 | [`adr/README.md`](adr/README.md) | 设计、重构或替换既有方案 |
| 本地运行与部署 | [`DEPLOYMENT.md`](DEPLOYMENT.md) | 环境、CI、发布或故障排查 |
| 反馈 Agent 边界 | [`agent-architecture.md`](agent-architecture.md) | feedback graph 或 Study Assistant 工作 |
| 已完成里程碑 | [`DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md) | 回顾历史；默认不加载 |

## 单一事实来源

| 信息 | 权威来源 | 更新触发条件 |
|---|---|---|
| 产品语言与不变量 | `CONTEXT.md` | 领域概念或产品边界改变 |
| 当前实现状态 | `PROJECT_CONTEXT.md` | 现行产品、架构、数据或运行时事实改变 |
| 战略优先级 | `ROADMAP.md` | 阶段或优先级改变 |
| Speech Evaluator 实施顺序 | `SPEECH_EVALUATOR_ROADMAP.md` | 里程碑、验收标准或研究路线改变 |
| 决策及理由 | `adr/` | 形成或替代长期架构决策 |
| 命令、依赖、路由、schema | 代码与 manifests | 通过 `/update-docs` 同步受影响的文档 |
| 完成历史 | Git + `DEVELOPMENT_LOG.md` | 完成并验证阶段性里程碑 |

## ECC 文档规则

1. 代码派生内容必须从 `package.json`、`.env.example`、路由、schema、Dockerfile 或其他实际来源生成，不能凭记忆维护。
2. 自动同步内容放在 `<!-- AUTO-GENERATED -->` 标记范围内；手写说明不得被 `/update-docs` 覆盖。
3. 一次任务只更新真正受影响的文档。样式、小型修复和内部重构通常不需要修改项目上下文或路线图。
4. 计划不能写成已完成；验证结果只能记录本次真正运行过的命令或检查。
5. ADR 不随阶段切换而删除。决策改变时新增 ADR，并把旧 ADR 标记为 `Superseded`。
6. 不为同一事实创建第二份文档。需要新文档时，必须先说明它与现有文档不同的唯一职责。

## 当前结构

```text
docs/
├── README.md                    文档索引与维护规则
├── PROJECT_CONTEXT.md           当前事实
├── ROADMAP.md                   阶段与战略优先级
├── SPEECH_EVALUATOR_ROADMAP.md  当前专项路线图
├── DEVELOPMENT_LOG.md           阶段级完成历史
├── DEPLOYMENT.md                本地运行与部署
├── agent-architecture.md        反馈 Agent 架构
└── adr/                         架构决策及索引
```
