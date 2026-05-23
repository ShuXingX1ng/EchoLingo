# EchoLingo Deployment

EchoLingo can run with either:

- Next.js frontend + Next.js API Routes fallback
- Next.js frontend + Python FastAPI backend

Recommended production shape:

```text
Next.js frontend  ->  src/lib/api-client.ts  ->  FastAPI backend
Vercel or similar                         Railway / Render / Docker
```

## Environment Variables

### Frontend

Set in Vercel or `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Optional. Empty means use Next.js API Routes fallback.
NEXT_PUBLIC_API_BASE_URL=https://your-backend.example.com
```

### Backend

Set in Railway/Render/Docker or `backend/.env`:

```bash
LLM_API_KEY=...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...

SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

Supabase backend variables are optional for endpoints that do not need authenticated session access.

## Local Development

### Frontend with Next.js API fallback

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Frontend with FastAPI backend

Terminal 1:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

Terminal 2:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/health`
- Backend docs: `http://localhost:8000/docs`

## Frontend Deployment

Use Vercel or any Next.js host.

1. Import the GitHub repo.
2. Use Node 20.
3. Set frontend environment variables.
4. Deploy.

CI quality gate:

```bash
npm run lint
npm run typecheck
npm run test:unit:run
npm run build
```

Workflow: `.github/workflows/ci.yml`.

## Backend Deployment

### Railway

1. Create a Railway project from GitHub.
2. Set root directory to `backend`.
3. Railway should use `backend/Procfile`.
4. Set backend environment variables.
5. Use the Railway URL as `NEXT_PUBLIC_API_BASE_URL` in the frontend.

### Render

Create a Web Service:

- Root directory: `backend`
- Runtime: Python 3
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Docker

```bash
cd backend
docker build -t echolingo-backend .
docker run -p 8000:8000 --env-file .env echolingo-backend
```

Backend CI:

```bash
cd backend
pytest
```

Workflow: `.github/workflows/ci-backend.yml`.

## Health Check

```bash
curl https://your-backend.example.com/health
```

Expected:

```json
{"status":"ok","service":"echolingo-api"}
```

## CORS

If frontend requests fail with CORS errors, update `backend/main.py` allowed origins to include the production frontend domain.

Expected local origin:

```text
http://localhost:3000
```

## Release Checklist

- [ ] Frontend env vars set
- [ ] Backend env vars set
- [ ] Backend `/health` passes
- [ ] `NEXT_PUBLIC_API_BASE_URL` points to backend, or is intentionally empty for fallback
- [ ] Frontend CI passes
- [ ] Backend CI passes
- [ ] Smoke check: practice, feedback, TTS, pronunciation
