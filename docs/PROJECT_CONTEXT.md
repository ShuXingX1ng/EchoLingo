# EchoLingo Project Context

## Product

EchoLingo is an AI-powered IELTS Speaking practice app. It helps learners practice with an AI examiner, review structured feedback, track progress, and choose the next practice action.

Target users:

- IELTS Speaking candidates
- International students building spoken English confidence
- Learners who want low-pressure, repeatable practice
- Users who need feedback, estimated band scores, and practical next steps

## Current Status

EchoLingo is past MVP and stabilization. Core practice, history, stats, data sync, E2E smoke tests, desktop consistency, mobile blockers, and Python backend migration are complete.

Current baseline:

| Area | Status |
|------|--------|
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS |
| Backend | FastAPI exists beside Next.js API Routes fallback |
| Data | Supabase + localStorage + IndexedDB recordings |
| Auth | Supabase email + Google OAuth |
| Tests | 86 frontend unit tests, 20 E2E tests, 86 backend tests |
| Quality gate | lint 0, typecheck pass, build pass |
| Next focus | Phase H: personalized learning plan deepening |

## Architecture

### Frontend

- Framework: Next.js 16 App Router
- UI: React + Tailwind CSS
- State: React hooks + browser storage
- i18n: `src/lib/i18n.tsx`, `src/locales/en.json`, `src/locales/zh.json`
- Shared navigation: `src/components/DesktopNav.tsx`, `src/components/MobileNav.tsx`

Important Next.js rule: before editing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` as required by `AGENTS.md`.

### Backend

The app supports two API paths:

| Path | Status | Notes |
|------|--------|-------|
| Next.js API Routes | Fallback kept | Do not delete yet |
| Python FastAPI | Implemented | Preferred deployable backend |

Frontend requests go through `src/lib/api-client.ts`:

- `NEXT_PUBLIC_API_BASE_URL` empty: use Next.js `/api/*`
- `NEXT_PUBLIC_API_BASE_URL` set: call FastAPI backend

FastAPI files:

- `backend/main.py`
- `backend/routers/examiner.py`
- `backend/routers/feedback.py`
- `backend/routers/tts.py`
- `backend/routers/pronunciation.py`
- `backend/services/llm.py`
- `backend/services/azure_speech.py`
- `backend/services/supabase.py`
- `backend/middleware/auth.py`
- `backend/models/schemas.py`

## Core Features

- IELTS Part 1/2/3 practice with AI examiner dialogue
- Full mock exam flow: Part 1 -> Part 2 -> Part 3
- Text and voice practice
- Azure Neural TTS
- Azure Pronunciation Assessment with word and phoneme details
- Shadowing practice with recording and per-sentence assessment
- Structured feedback with estimated band score, strengths, weaknesses, suggestions, improved answer, and error annotations
- Unified learning review UI via `FeedbackPanel` / `FeedbackReview`
- History page with transcript, feedback review, search/filter/export/backup/delete, and recording playback
- Stats page as learning progress view: goal, trend, weak areas, recommended actions
- Daily learning plan on the home page
- Supabase auth and cloud sync
- Admin pages for topics/users
- PWA, dark mode, responsive layout, i18n

## Data Model Summary

Core types live in `src/types/index.ts`.

Key domain types:

- `ChatMessage`
- `SpeakingSession`
- `SessionFeedback`
- `ErrorAnnotation`
- `PronunciationAssessmentResult`
- `WordAssessment`
- `PhonemeAssessment`

## Data Paths

| Module | Responsibility | Storage |
|--------|----------------|---------|
| `src/lib/unified-history.ts` | Main session read/write entry | Supabase + local fallback |
| `src/lib/history.ts` | Local session storage | localStorage |
| `src/lib/supabase-history.ts` | Cloud session storage | Supabase |
| `src/lib/error-patterns.ts` | Weakness/error profile | localStorage today; should not be the authority for logged-in personalization |
| `src/lib/recommendations.ts` | Learning recommendations | Supabase progress plus legacy local error patterns today |
| `src/lib/supabase-progress.ts` | Progress records | Supabase |
| `src/lib/recordings.ts` | Audio recordings | IndexedDB |
| `src/lib/backup.ts` | Export/import | local JSON/CSV backup |

Current save/read strategy:

- Logged in: cloud first, local backup, local fallback on cloud failure
- Logged out: local storage
- Recordings: IndexedDB keyed to session/recording metadata
- Error patterns: local, included in backup/restore
- Session IDs: `crypto.randomUUID()` with fallback where needed

Personalization policy:

- Logged-in personalized recommendations and daily plans should treat Supabase as the authority.
- Logged-out users should see general entry points or a login prompt, not personalized recommendations.
- localStorage can support migration, backups, temporary local state, and graceful UI fallback.
- localStorage should not be used as the primary source for logged-in recommendation decisions.
- If Supabase fails, show generic or temporarily unavailable recommendation UI instead of pretending local data is complete personalization.

## API Endpoints

The same logical API contract is implemented in Next.js and FastAPI.

| Endpoint | Purpose | Request | Response |
|----------|---------|---------|----------|
| `POST /api/examiner` | Generate next examiner message | JSON `{ mode, messages }` | JSON `{ message }` |
| `POST /api/feedback` | Generate session feedback | JSON `{ mode, messages }` | `SessionFeedback` JSON |
| `POST /api/tts` | Azure TTS | JSON `{ text, voice, rate }` | WAV audio stream |
| `POST /api/pronunciation` | Azure pronunciation assessment | FormData audio + reference text | `PronunciationAssessmentResult` JSON |

## Quality Gates

Frontend:

```bash
npm run lint
npm run typecheck
npm run test:unit:run
npm run build
```

E2E:

```bash
npm run test:e2e
```

Backend:

```bash
cd backend
pytest
```

CI:

- `.github/workflows/ci.yml`: `npm ci`, frontend lint, typecheck, unit tests, build
- `.github/workflows/ci-backend.yml`: backend lint, typecheck, pytest, Docker build

Frontend CI depends on `package.json` and `package-lock.json` staying synchronized; update and commit the lockfile whenever npm dependency resolution changes.

## Project Conventions

- Keep payment, subscription, commercial operations, leaderboard, learning groups, and social sharing in future/backlog unless explicitly requested.
- Do not run CI/E2E against real LLM, Azure, Supabase, or paid external APIs.
- Prefer mock-first E2E through Playwright `page.route()`.
- Keep Next.js API Routes until FastAPI deployment and traffic are proven stable.
- After meaningful development work, update:
  - `docs/DEVELOPMENT_LOG.md`
  - `docs/PROJECT_CONTEXT.md`
  - `docs/TASKS.md`

## Next Step

Recommended next phase: **Phase H: personalized learning plan deepening with Supabase-authoritative personalization**.

Start with a review of `src/lib/learning-plan.ts`, `src/components/DailyTasks.tsx`, `src/app/page.tsx`, `src/lib/recommendations.ts`, and `src/lib/error-patterns.ts`.

Longer-term product phases are documented in `docs/PRODUCT_ROADMAP.md`.
