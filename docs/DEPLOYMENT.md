# EchoLingo Deployment

更新日期：2026-07-21

## Target Shape

```text
Browser -> Next.js frontend -> FastAPI backend -> LLM / Azure / Supabase
```

FastAPI 是唯一业务后端。`NEXT_PUBLIC_API_BASE_URL` 必须配置；不存在 Next.js 业务 API fallback。

## Prerequisites

- Node.js 20+
- Python 3.11+
- Supabase project，并确认所需 migrations 已应用
- OpenAI-compatible LLM credentials
- Azure Speech credentials
- DashScope credentials 与 Postgres connection（RAG/Exemplar 路径）
- 部署前准备 backend-local ECDICT SQLite 数据文件

实际变量名以 [`.env.example`](../.env.example) 和 [`backend/.env.example`](../backend/.env.example) 为准，避免在本文复制一份会漂移的完整清单。

## Frontend Command Reference

以下区块由根目录 `package.json` 的 `scripts` 字段派生；脚本发生变化时使用 ECC `/update-docs` 只更新标记范围。

<!-- AUTO-GENERATED: source=../package.json#scripts -->
| Command | Purpose |
|---|---|
| `npm run dev` | 使用 webpack 启动开发服务器 |
| `npm run dev:turbo` | 使用默认 Turbopack 启动开发服务器 |
| `npm run build` | 创建生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 运行 ESLint |
| `npm run typecheck` | 运行 TypeScript 类型检查 |
| `npm run test:unit` | 以 watch 模式运行 Vitest |
| `npm run test:unit:run` | 单次运行 Vitest |
| `npm run test:e2e` | 运行 Playwright E2E |
| `npm run test:e2e:ui` | 打开 Playwright UI |
| `npm run clean` | 删除 `.next` 构建目录 |
<!-- END AUTO-GENERATED -->

## Local Development

Frontend：

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Backend（Windows PowerShell）：

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend（Linux/macOS）：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

默认地址：

- Frontend：`http://localhost:3000`
- Backend health：`http://localhost:8000/health`
- OpenAPI docs：`http://localhost:8000/docs`

## Required Runtime Checks

1. 前端 `NEXT_PUBLIC_API_BASE_URL` 指向可从浏览器访问的 FastAPI URL。
2. Backend `ALLOWED_ORIGINS` 包含生产 frontend origin。代码也允许 localhost 和常见 LAN development origins。
3. Supabase URL/key 与 `SUPABASE_DB_URL` 指向同一目标环境。
4. 所需 migrations 已实际应用，而不仅是文件存在。
5. ECDICT、rubric embeddings 和 stimulus exemplars 已按目标环境准备。
6. 所有第三方 secret 只存在于 backend deployment。

## Deployment Options

Frontend 可部署到 Vercel 或其他支持 Next.js 16 的平台。Backend 可部署到支持 Python web service 的平台或容器环境；启动命令：

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

容器方式：

```bash
cd backend
docker build -t echolingo-backend .
docker run -p 8000:8000 --env-file .env echolingo-backend
```

## Validation

Frontend：

```powershell
npm run lint
npm run typecheck
npm run test:unit:run
npm run build
```

Backend：

```powershell
Set-Location backend
ruff check .
pytest
```

部署后至少验证：

- `GET /health` 返回 `{"status":"ok","service":"echolingo-api"}`。
- 浏览器对 FastAPI 的 CORS preflight 成功。
- 登录、随机练习、反馈、TTS、pronunciation、word lookup 各完成一次 smoke check。
- Theme Practice 的 retrieval 依赖可用；依赖失败时 fallback 行为符合预期。

普通 CI/E2E 不调用真实 LLM、Azure、Supabase 或其他付费服务。

## Speech Evaluator Deployment Boundary

ADR 0013 描述的 GPU speech worker 尚未实现。实施后它是私有 backend dependency，不直接暴露给浏览器，也不与当前 FastAPI 进程共享 CUDA/PyTorch runtime。完成验收前，生产 Read Aloud 继续使用现有 Azure 路径。
