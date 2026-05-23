# EchoLingo 部署指南

本文档说明如何部署 EchoLingo 前端和 Python 后端。

## 架构概览

```
┌─────────────────┐                  ┌─────────────────┐
│   Next.js 前端   │ ──api-client──► │  FastAPI 后端     │
│  (TypeScript)   │                  │  (Python)        │
└─────────────────┘                  └─────────────────┘
        │                                     │
        ▼                                     ▼
   Vercel/静态部署                      Railway/Render/自建
```

## 前端部署（Vercel）

### 1. 连接 GitHub 仓库

1. 登录 [Vercel](https://vercel.com)
2. 点击 "New Project"
3. 导入 GitHub 仓库 `EchoLingo`
4. 选择 "Next.js" 框架预设

### 2. 配置环境变量

在 Vercel 项目设置中添加以下环境变量：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# API 后端（可选，不设置则使用 Next.js API Routes）
NEXT_PUBLIC_API_BASE_URL=https://your-backend-url.railway.app
```

### 3. 部署

Vercel 会自动部署，每次推送到 `main` 分支都会触发新部署。

---

## 后端部署

### 方案 A: Railway（推荐）

#### 1. 准备工作

确保 `backend/` 目录包含：
- `Procfile`
- `requirements.txt`
- `main.py`

#### 2. 部署到 Railway

1. 登录 [Railway](https://railway.app)
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择仓库，设置根目录为 `backend`
4. Railway 会自动检测 `Procfile` 并部署

#### 3. 配置环境变量

在 Railway 项目设置中添加：

```bash
# LLM
LLM_API_KEY=your_deepseek_api_key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# Azure Speech
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=eastus

# Supabase（可选）
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### 4. 获取部署 URL

Railway 会提供一个 URL，如 `https://your-app.railway.app`。

将此 URL 设置为前端的 `NEXT_PUBLIC_API_BASE_URL`。

---

### 方案 B: Render

#### 1. 部署到 Render

1. 登录 [Render](https://render.com)
2. 点击 "New" → "Web Service"
3. 连接 GitHub 仓库
4. 配置：
   - **Name**: `echolingo-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

#### 2. 配置环境变量

在 Render 项目设置中添加环境变量（同 Railway）。

---

### 方案 C: Docker 自建部署

#### 1. 构建镜像

```bash
cd backend
docker build -t echolingo-backend .
```

#### 2. 运行容器

```bash
docker run -d \
  --name echolingo-backend \
  -p 8000:8000 \
  -e LLM_API_KEY=your_key \
  -e LLM_BASE_URL=https://api.deepseek.com \
  -e LLM_MODEL=deepseek-chat \
  -e AZURE_SPEECH_KEY=your_key \
  -e AZURE_SPEECH_REGION=eastus \
  echolingo-backend
```

#### 3. 使用 Docker Compose

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - LLM_API_KEY=${LLM_API_KEY}
      - LLM_BASE_URL=${LLM_BASE_URL}
      - LLM_MODEL=${LLM_MODEL}
      - AZURE_SPEECH_KEY=${AZURE_SPEECH_KEY}
      - AZURE_SPEECH_REGION=${AZURE_SPEECH_REGION}
    restart: unless-stopped
```

运行：
```bash
docker-compose up -d
```

---

## 本地开发

### 1. 使用 Next.js API Routes（默认）

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### 2. 使用 Python 后端

```bash
# 终端 1: 启动 Python 后端
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
cp .env.example .env  # 编辑 .env 填入真实 key
uvicorn main:app --reload

# 终端 2: 启动前端（配置使用 Python 后端）
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > .env.local
npm run dev
```

访问 http://localhost:3000，API 请求会发送到 http://localhost:8000

---

## 环境变量说明

### 前端环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名 key | ✅ |
| `NEXT_PUBLIC_API_BASE_URL` | Python 后端 URL | ❌ |

### 后端环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `LLM_API_KEY` | DeepSeek/OpenAI API key | ✅ |
| `LLM_BASE_URL` | LLM API base URL | ✅ |
| `LLM_MODEL` | LLM 模型名称 | ✅ |
| `AZURE_SPEECH_KEY` | Azure Speech 服务 key | ✅ |
| `AZURE_SPEECH_REGION` | Azure Speech 服务区域 | ✅ |
| `SUPABASE_URL` | Supabase 项目 URL | ❌ |
| `SUPABASE_ANON_KEY` | Supabase 匿名 key | ❌ |

---

## CI/CD

### 前端 CI

已配置 `.github/workflows/ci.yml`：
- Lint
- TypeCheck
- Unit Tests
- Build

### 后端 CI

已配置 `.github/workflows/ci-backend.yml`：
- Lint (ruff)
- Type Check (mypy)
- Tests (pytest)
- Docker Build

---

## 故障排查

### 1. CORS 错误

确保后端 `main.py` 中的 CORS 配置包含前端域名：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://your-frontend.vercel.app",  # 添加生产域名
    ],
    ...
)
```

### 2. API 请求失败

检查 `NEXT_PUBLIC_API_BASE_URL` 是否正确设置，且后端服务正在运行。

### 3. Azure Speech 错误

确保 `AZURE_SPEECH_KEY` 和 `AZURE_SPEECH_REGION` 正确配置。

---

## 监控

### 健康检查

后端提供健康检查端点：

```bash
curl https://your-backend.railway.app/health
# 返回: {"status": "ok", "service": "echolingo-api"}
```

### 日志

- **Railway**: 在项目面板查看实时日志
- **Render**: 在服务面板查看日志
- **Docker**: `docker logs echolingo-backend`
