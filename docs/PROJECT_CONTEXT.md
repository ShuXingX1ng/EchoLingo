# EchoLingo Project Context

## Product

EchoLingo is an AI-powered PTE Academic practice platform. Learners practice individual PTE task types, receive AI-generated feedback, track progress by task-type weakness, and take full mock exams.

Target users:

- PTE Academic candidates
- International students building English proficiency
- Learners who want low-pressure, repeatable practice with structured feedback

## Current Status

| Area | Status |
|------|--------|
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS |
| Backend | FastAPI beside Next.js API Routes fallback |
| Data | Supabase + localStorage + IndexedDB recordings |
| Auth | Supabase email + Google OAuth |
| Tests | 82 frontend unit tests, 20 E2E tests, 86 backend tests |
| Quality gate | lint 0, typecheck pass, build pass |
| Pivot status | Phase 3 complete — Phase 4 (Mock Exam) next |

## Architecture

### Frontend

- Framework: Next.js 16 App Router
- UI: React + Tailwind CSS
- State: React hooks + browser storage
- i18n: `src/lib/i18n.tsx`, `src/locales/en.json`, `src/locales/zh.json`
- Shared navigation: `src/components/DesktopNav.tsx`, `src/components/MobileNav.tsx`

Important: before editing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` as required by `AGENTS.md`.

### Backend

| Path | Status | Notes |
|------|--------|-------|
| Next.js API Routes | Fallback kept | Do not delete yet |
| Python FastAPI | Implemented | Preferred deployable backend |

Frontend requests go through `src/lib/api-client.ts`:

- `NEXT_PUBLIC_API_BASE_URL` empty → use Next.js `/api/*`
- `NEXT_PUBLIC_API_BASE_URL` set → call FastAPI backend

FastAPI files: `backend/main.py`, `backend/routers/`, `backend/services/`, `backend/middleware/auth.py`, `backend/models/schemas.py`

## PTE Task Types (MVP Scope)

| Task Type | Section | Input | Response | Azure Pronunciation |
|---|---|---|---|---|
| Read Aloud | Speaking & Writing | AI-generated text | Spoken audio | Yes |
| Repeat Sentence | Speaking & Writing | Azure TTS audio | Spoken audio | Yes |
| Answer Short Question | Speaking & Writing | AI-generated question | Spoken audio | No |
| Summarize Written Text | Speaking & Writing | AI-generated passage | Typed text | No |
| Write Essay | Speaking & Writing | AI-generated prompt | Typed text | No |
| Personal Introduction | Speaking & Writing | Fixed prompt | Spoken audio (unscored) | No |
| Write from Dictation | Listening | Azure TTS audio | Typed text | No |

Deferred / planned task types (designed, not yet implemented):

| Task Type | Section | Blocker |
|---|---|---|
| Describe Image | Speaking & Writing | Requires image stimulus assets |
| Re-tell Lecture | Speaking & Writing | Requires audio stimulus assets |
| Fill in the Blanks (Reading) | Reading | Reading section not yet built |
| Re-order Paragraphs | Reading | Reading section not yet built |
| Multiple Choice (Reading) | Reading | Reading section not yet built |
| Summarize Spoken Text | Listening | Extended Listening section not yet built |
| Fill in the Blanks (Listening) | Listening | Extended Listening section not yet built |
| Highlight Correct Summary | Listening | Extended Listening section not yet built |

## Core Features (Target State)

- **All 7 Phase-2 PTE task types live**: Read Aloud, Repeat Sentence, Answer Short Question, Personal Introduction (Speaking); Summarize Written Text, Write Essay (Writing); Write from Dictation (Listening) — each with AI stimulus, timed response, AI feedback, `saveTask`
- **`/practice` hub page** — task-type grid linking all 7 task routes, replacing legacy IELTS chat
- **`/history` page** — displays `PracticeTask` records with task-type filter, search, delete, CSV/JSON export, detail view
- **`/stats` page** — task-type weakness profile (ranked `WeaknessBar` rows), practice distribution, weekly activity
- **Task Bank** — `src/lib/task-bank.ts` caches AI-generated stimuli per task type; wired into all 6 generating task pages
- **Min recording guard** — Stop/Done button disabled for first 5s on all 4 spoken task pages (Read Aloud, Repeat Sentence, Answer Short Question, Personal Intro)
- PTE task-type practice with timed exercises
- Full mock exam flow covering all supported task types
- AI-generated feedback: generic envelope (summary, strengths, weaknesses, suggestions) + task-specific details
- Azure Neural TTS for stimulus audio generation and caching
- Azure Pronunciation Assessment for Read Aloud and Repeat Sentence
- History page with Practice Task records, search/filter/export
- Stats page: task-type weakness, trend, recommended actions
- Daily learning plan on home page (task-type weakness driven, Supabase-authoritative for logged-in users)
- Supabase auth and cloud sync
- PWA, dark mode, responsive layout, i18n

## Data Model

Core types live in `src/types/index.ts`.

Key domain types: `PracticeTask`, `TaskFeedback`, `FeedbackDetails`, `PronunciationAssessmentResult`, `WordAssessment`, `PhonemeAssessment`

## Data Paths

| Module | Responsibility | Storage |
|--------|----------------|---------|
| `src/lib/unified-task-history.ts` | PracticeTask read/write entry point (new) | Supabase + local fallback |
| `src/lib/task-history.ts` | Local PracticeTask storage (new) | localStorage |
| `src/lib/supabase-task-history.ts` | Cloud PracticeTask storage — `practice_tasks` table (new) | Supabase |
| `src/lib/task-weakness.ts` | Derive task-type weakness from PracticeTask history (new) | computed |
| `src/lib/recommendations.ts` | IELTS recommendations (legacy) + `getPteRecommendations` (new) | task-type weakness |
| `src/lib/unified-history.ts` | Legacy IELTS session read/write (retained for backup compat) | Supabase + local fallback |
| `src/lib/supabase-error-patterns.ts` | Legacy error-pattern storage | Supabase |
| `src/lib/wav-encoder.ts` | Convert browser audio Blob → WAV for Azure pronunciation API | computed (Web Audio API) |
| `src/components/TaskFeedbackDisplay.tsx` | Shared feedback UI — Azure scores + AI summary/strengths/weaknesses/details | — |
| `src/lib/task-bank.ts` | localStorage cache for AI-generated stimuli per task type (max 10/type) | localStorage |
| `src/lib/recordings.ts` | Audio recordings | IndexedDB |
| `src/lib/backup.ts` | Export/import | local JSON/CSV backup |

Personalization policy:

- Logged-in: Supabase is the authority for personalized recommendations and daily plans.
- Logged-out: show general entry points or a login prompt; do not show personalized recommendations.
- Supabase failure: show generic or temporarily unavailable UI; do not fall back to localStorage as personalization.
- localStorage: migration, backup, temporary local state, and graceful UI fallback only.

## API Endpoints

| Endpoint | Purpose | Request | Response |
|----------|---------|---------|----------|
| `POST /api/examiner` | Generate task stimulus or next prompt | `{ taskType, context }` | `{ content }` |
| `POST /api/feedback` | Generate Practice Task feedback | `{ taskType, stimulus, response }` | `TaskFeedback` JSON |
| `POST /api/tts` | Azure TTS | `{ text, voice, rate }` | WAV audio stream |
| `POST /api/pronunciation` | Azure pronunciation assessment | FormData audio + reference text | `PronunciationAssessmentResult` JSON |
| `POST /api/read-aloud/stimulus` | Generate a PTE Read Aloud passage (50–70 words) | — | `{ text: string }` |
| `POST /api/read-aloud/feedback` | AI oral fluency + pronunciation feedback for Read Aloud | `{ stimulus, transcript, pronunciationAssessment? }` | `TaskFeedback` JSON |
| `POST /api/pte/stimulus` | Generate stimulus for any PTE task type | `{ taskType: PteTaskType }` | `{ text: string }` |
| `POST /api/pte/feedback` | AI feedback for any PTE task type | `{ taskType, stimulus, response, pronunciationAssessment? }` | `TaskFeedback` JSON |

## Quality Gates

```bash
npm run lint
npm run typecheck
npm run test:unit:run
npm run build        # when touching Next.js config, routes, or API client
npm run test:e2e     # when touching cross-page behavior
cd backend && pytest # when touching Python backend
```

## Agent Architecture (Portfolio Design)

This section describes the AI agent pipeline designed for EchoLingo. It is a portfolio-level design intended to demonstrate architectural thinking. Implementation status is noted per component.

### Pipeline (no Router layer — see ADR 0004)

```
User input (taskType + stimulus + response + audio?)
        ↓
Section Agent  ← invoked directly by caller, taskType always known
(Speaking / Writing / Reading / Listening)
        ↓
Scoring Agent  ← per-dimension qualitative scores, not simulated PTE 10–90 (see ADR 0003)
        ↓
Diagnosis Agent  ← derives Task-Type Weakness from Feedback history
        ↓
Coach Agent  ← generates targeted suggestions
        ↓
LLM-as-Judge  ← independent model re-evaluates Coach output; disagreement triggers retry
```

### Section Agents — implementation status

| Section Agent | Status | Implemented Task Types |
|---|---|---|
| Speaking Agent | Implemented | Read Aloud, Repeat Sentence, Answer Short Question, Personal Introduction |
| Writing Agent | Implemented | Summarize Written Text, Write Essay |
| Reading Agent | Designed, not implemented | Fill in the Blanks, Re-order Paragraphs, Multiple Choice |
| Listening Agent | Partially implemented | Write from Dictation (implemented); Summarize Spoken Text, FitB, Highlight Correct Summary (designed) |

### Speaking Agent — key design decisions

- Azure Pronunciation Assessment is the authoritative source for word-level and phoneme-level scoring on Read Aloud and Repeat Sentence. It runs in parallel with AI Feedback and results are merged into Feedback Details.
- Whisper (speech-to-text) is used only for task types not covered by Azure Pronunciation Assessment (e.g. Answer Short Question, Describe Image) to produce a transcript for AI Feedback.
- Scoring dimensions: fluency (pause rate, speech rate, filler words), pronunciation (Azure word/phoneme accuracy), content (keyword coverage rate).

### Writing Agent — key design decisions

Scoring dimensions and evaluation method differ by task type:

| Task Type | Evaluation Method | Dimensions |
|---|---|---|
| Summarize Written Text | RAGAS Faithfulness + Answer Relevancy (original passage = context, student summary = answer) | Content accuracy, information coverage |
| Write Essay | LLM-based rubric scoring | Grammar (error rate by type), Vocabulary (diversity index, academic word ratio), Form (word count, paragraph structure), Content (argument coherence) |

RAGAS applies only to Summarize Written Text because it requires a source context (the original passage). Write Essay has no retrievable context — RAGAS metrics are not applicable there.

### Scoring Agent

Produces per-dimension qualitative scores (0–100% internal scale) for each Feedback dimension. Does not simulate or imply PTE 10–90 scores. Each score has an explicit calculation basis (Azure data, keyword coverage rate, etc.) so learners understand what the number means.

### Diagnosis Agent

Maps to the existing Task-Type Weakness concept. Derives a weakness profile from recent Feedback history, weighted toward recent Practice Tasks (rolling signal, not lifetime average).

### LLM-as-Judge

An independent LLM re-evaluates the Scoring Agent's per-dimension scores. Trigger rule: if any single PTE-aligned scoring dimension diverges by more than 15 points (on the 10–90 scale) between the primary model and the Judge, the system triggers a re-evaluation and logs the disagreement case.

Disagreement rate is a quantifiable quality metric for prompt iteration — e.g. "Judge agreement rate improved from 71% to 89% after prompt revision." Logged disagreement cases form a test set for ongoing prompt improvement.

Note: a "direction-based" trigger (one model says strong, the other says weak) is not a separate signal — it is a subset of the score-divergence rule and covered by the 15-point threshold.

### Learner Profile (adaptive task selection)

Weakness profile keyed by Task Type (not Section), consistent with the Task-Type Weakness model in CONTEXT.md:

```json
{
  "task_type_weakness": {
    "read_aloud": { "fluency": 0.65, "pronunciation": 0.78, "content": 0.82 },
    "write_essay": { "grammar_error_types": ["subject-verb agreement", "tense"], "vocab_diversity": 0.71 },
    "repeat_sentence": { "overall": 0.58 }
  },
  "weak_task_types": ["repeat_sentence", "re_order_paragraphs"],
  "study_history": []
}
```

Daily Plan prioritises weak Task Types. This is the primary personalization signal for logged-in learners.

### Learning Trajectory Visualisation (planned)

- Per-dimension radar chart (one axis per PTE scoring dimension)
- Daily progress curve per Task Type
- **Gap analysis against target score** — user sets a target band (e.g. 79); system shows per-dimension shortfall ("Write Essay Grammar: 12 points below target"). No absolute exam score prediction — gap analysis is more actionable and more defensible.

No absolute exam score prediction is made. Predicting a real PTE score from practice data is unverifiable and would conflict with ADR 0003's principle of not misleading learners with unvalidated numbers.

## Project Conventions

- Keep payment, subscription, commercial operations, leaderboard, learning groups, and social sharing in future/backlog unless explicitly requested.
- Do not run CI/E2E against real LLM, Azure, Supabase, or paid external APIs.
- Prefer mock-first E2E through Playwright `page.route()`.
- Keep Next.js API Routes until FastAPI deployment and traffic are proven stable.
- After meaningful development work, update `docs/DEVELOPMENT_LOG.md`, `docs/PROJECT_CONTEXT.md`, `docs/TASKS.md`.
- See `CONTEXT.md` at repo root for canonical domain terminology.
- See `docs/adr/` for key architectural decisions.
