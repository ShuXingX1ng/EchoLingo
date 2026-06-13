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
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4; DM Serif Display + DM Sans via `next/font/google` |
| Backend | FastAPI is the single authoritative backend (ADR 0007). All Next.js API business routes have been migrated and deleted. |
| Data | Supabase + localStorage + IndexedDB recordings |
| Auth | Supabase email + Google OAuth |
| Tests | 115 frontend unit tests (11 files), 55 E2E tests (14 PTE smoke + 12 listening + 14 reading + 9 mock exam + 6 other), 247 backend tests (123 core + 60 scraper/cleaner + 28 embed_exemplars + 36 serving/originality) |
| Quality gate | lint 0 errors; typecheck pass; build pass |
| Pivot status | Mock exam complete — all 15 practice task types live; 15-task mock sequence covering all 15 PTE task types across all 4 sections; RAG infrastructure and local Dictionary seeded |
| UI | Design token system complete — every page (practice tasks, settings, nav, history, stats, home) uses CSS variable tokens; `--border-strong` added for bold-card borders; DM Serif Display + DM Sans typography; Playwright visual verification passed (light + dark) |

## Architecture

### Frontend

- Framework: Next.js 16 App Router
- UI: React + Tailwind CSS
- State: React hooks + browser storage
- i18n: `src/lib/i18n.tsx`, `src/locales/en.json`, `src/locales/zh.json`
- Shared navigation: `src/components/DesktopNav.tsx`, `src/components/MobileNav.tsx`

Important: before editing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` as required by `AGENTS.md`.

### Backend

**Target architecture (ADR 0007): FastAPI is the single authoritative backend.**
All business and LLM logic lives in exactly one place — the Python backend.
Next `src/app/api/*` business routes have been migrated to call FastAPI
and **deleted**. The browser calls FastAPI directly via
`NEXT_PUBLIC_API_BASE_URL`, with CORS configured on the backend.
All third-party secrets (`LLM_API_KEY`, `AZURE_SPEECH_KEY`/`REGION`,
`DASHSCOPE_API_KEY`, Supabase service-role key) live only in the backend runtime.

| Path | Target end state | Current state |
|------|------------------|---------------|
| `src/app/api/pte/stimulus` · `pte/feedback` | Deleted | **Done** — routes deleted; all 42 callers now use `apiPost` via `api-client.ts` |
| `src/app/api/read-aloud/stimulus` · `read-aloud/feedback` | Deleted | **Done** — routes deleted; `practice/read-aloud/page.tsx` + `MockReadAloud.tsx` now use `apiPost` via `api-client.ts` |
| `src/app/api/tts` · `pronunciation` | Deleted | **Done** — routes deleted; callers migrated to `apiPostBlob`/`apiPostForm` via `api-client.ts` |
| `src/app/api/word-lookup` | Deleted | **Done** — route deleted; callers migrated to `apiPost` via `api-client.ts` |
| Python FastAPI (`backend/routers/*`) | Authoritative | Already implements all of the above via LangGraph + RAG + LLM-as-Judge (ADRs 0005, 0006) |

Frontend requests go through `src/lib/api-client.ts`. Target behaviour:

- `NEXT_PUBLIC_API_BASE_URL` is **required**; a missing value fails fast.
- All requests target the FastAPI base URL directly.

**Backend-unavailable degradation principle (ADR 0007):** health check + friendly
"temporarily unavailable" UI + bounded-timeout / circuit-breaker implemented — never
surface a bare `502`.

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
| Describe Image | Speaking & Writing | Hardcoded image bank (5 public-domain charts/maps) | Spoken audio | No |
| Re-tell Lecture | Speaking & Writing | AI-generated text → Azure TTS audio | Spoken audio | No |
| Fill in the Blanks (Reading) | Reading | AI-generated passage with blanks (JSON) | Dropdown selection | No |
| Re-order Paragraphs | Reading | AI-generated shuffled paragraphs (JSON) | Drag-and-drop order | No |
| Multiple Choice (Reading) | Reading | AI-generated passage + question (JSON) | Radio button selection | No |
| Summarize Spoken Text | Listening | AI-generated text → Azure TTS audio | Typed summary (50–70 words) | No |
| Fill in the Blanks (Listening) | Listening | AI-generated text → Azure TTS audio + blanks (JSON) | Dropdown selection | No |
| Highlight Correct Summary | Listening | AI-generated text → Azure TTS audio + 5 summaries (JSON) | Radio button selection | No |

Deferred / planned task types (not yet implemented):

| Task Type | Section | Blocker |
|---|---|---|

## Core Features (Target State)

- **All 15 PTE task types live**: Speaking, Writing, Reading, and Listening task routes each include stimulus, timed response, AI feedback, `saveTask`
- **`/practice` hub page** — task-type grid linking all 15 task routes, with Mock Exam CTA
- **`/mock` page** — full mock exam orchestrator: intro screen → 15-task PTE sequence covering all 15 task types across all four sections (Speaking & Writing, Reading, Listening; strict timing) → `/mock/summary`
- **`/mock/summary` page** — per-task feedback breakdown, top weaknesses, avg pronunciation score, practice links
- **`/history` page** — displays `PracticeTask` records with task-type filter, search, delete, CSV/JSON export, detail view
- **`/stats` page** — task-type weakness profile (ranked `WeaknessBar` rows, expandable per-dimension sub-bars); Learner Profile (SVG radar chart, speaking/writing/listening tabs, target score slider, gap analysis); Score Trajectory (weekly avg score line chart per task type); practice distribution, weekly activity
- **Task Bank** — `src/lib/task-bank.ts` caches AI-generated stimuli per task type; wired into all 6 generating task pages
- **Word Lookup** (Study Aid) — floating helper on Task Practice pages only (never Mock Exam): select text → "译" button or desktop drag-drop → one-shot translation card. Single English words resolve against the bundled ECDICT SQLite dictionary (instant, offline); phrases and dictionary misses fall through to DeepSeek. See ADR 0006.
- **Vocabulary List** (Study Aid) — explicit save on the Word Lookup card adds a word; `/vocabulary` page (view + delete only, no SRS in v1); Supabase cloud sync from v1 with localStorage fallback; included in `backup.ts`. See ADR 0006.
- **Min recording guard** — Stop/Done button disabled for first 5s on all 4 spoken task pages (Read Aloud, Repeat Sentence, Answer Short Question, Personal Intro)
- PTE task-type practice with timed exercises
- Full mock exam flow covering the original 7-task sequence plus 3 extended Listening tasks
- AI-generated feedback: generic envelope (summary, strengths, weaknesses, suggestions) + task-specific details + per-dimension scores (0–100 internal scale) + targeted coaching suggestions via Coach Agent + LLM-as-Judge (independent parallel call; >15-point divergence triggers retry and `judgeLog`)
- Azure Neural TTS for stimulus audio generation and caching
- Azure Pronunciation Assessment for Read Aloud and Repeat Sentence
- History page with Practice Task records, search/filter/export
- Stats page: task-type weakness, trend, recommended actions
- Home page: PTE-oriented entry cards (Practice / Mock Exam / Stats) + static practice-archive entry (the IELTS daily-plan subsystem was removed in Phase Cleanup)
- Supabase auth and cloud sync
- PWA, dark mode, responsive layout, i18n

## Data Model

Core types live in `src/types/index.ts`.

Key domain types: `PracticeTask`, `TaskFeedback`, `FeedbackDetails`, `PronunciationAssessmentResult`, `WordAssessment`, `PhonemeAssessment`, `WordLookupResult`, `WordLookupEntry`, `VocabularyEntry`

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
| `src/lib/image-bank.ts` | Hardcoded bank of 5 public-domain image URLs (charts, maps) for Describe Image task type | static |
| `backend/services/vector_store.py` | DashScope embedding client (`text-embedding-v4`) + Supabase pgvector `vecs` connection; `rubric_chunks` collection | Supabase pgvector |
| `backend/services/rag.py` | `retrieve_context(task_type) -> str`; queries `rubric_chunks` with task_type filter; silent fallback | computed |
| `backend/services/feedback_graph.py` | LangGraph `StateGraph` for the PTE feedback pipeline; `FeedbackState` TypedDict; nodes: `retrieve_context`, `call_primary`, `call_judge`, `check_divergence`, `retry_primary`, `finalize`; exposes `run_feedback_graph(request)->dict` | computed |
| `backend/data/rubrics/` | Hand-written YAML rubric files — one per PTE task type (15/15 complete); each file has `task_type`, `description`, `dimensions[]` (name/description/criteria) and `scoring_notes` | static YAML |
| `backend/scripts/seed_rubrics.py` | One-time script: reads rubric YAMLs → embeds → upserts to Supabase `rubric_chunks` | — |
| `src/lib/recordings.ts` | Audio recordings | IndexedDB |
| `src/lib/backup.ts` | Export/import (now includes `vocabulary`) | local JSON/CSV backup |
| `src/lib/word-lookup.ts` | Word Lookup client → `/api/word-lookup` proxy | — |
| `src/components/WordLookup.tsx` | Floating Word Lookup helper (selection "译" button + desktop drag-drop card); mounted via `src/app/practice/layout.tsx`, excluded from `/mock` | — |
| `src/lib/unified-vocabulary.ts` | Vocabulary List read/write entry point | Supabase + local fallback |
| `src/lib/vocabulary.ts` | Local Vocabulary List storage | localStorage |
| `src/lib/supabase-vocabulary.ts` | Cloud Vocabulary List — `vocabulary` table (migration 003) | Supabase |
| `backend/services/ecdict.py` | Read-only ECDICT lookup (pos/tag parse); single-word offline path | SQLite `backend/data/ecdict.sqlite` (gitignored) |
| `backend/scripts/import_ecdict.py` | Downloads ECDICT 1.0.28 sqlite from GitHub into `backend/data/` | — |
| `backend/scripts/scrape_exemplars/base.py` | `RawExemplar` dataclass + `SourceAdapter` ABC | — |
| `backend/scripts/scrape_exemplars/sources/wikipedia.py` | `WikipediaAdapter`: Wikipedia REST summary API (read_aloud leads) + MediaWiki explaintext API (body sections → swt); rate-limited, UA-identified | network (gitignored output) |
| `backend/scripts/scrape_exemplars/__main__.py` | Pipeline entry point: runs a `SourceAdapter` → `backend/data/exemplars_raw/<source>.jsonl` (gitignored) | — |
| `backend/scripts/scrape_exemplars/cleaner.py` | Deterministic cleaning rules (markup strip, English filter, length gates, SHA-256 dedup) + optional DeepSeek accept/reject gate; exposes `clean_exemplars()` + `print_metrics()` | — |
| `backend/scripts/clean_exemplars.py` | CLI wrapper: reads `exemplars_raw/<source>.jsonl` → applies `clean_exemplars()` → writes `exemplars_clean/<source>.jsonl` (gitignored) + prints metrics | — |
| `backend/scripts/embed_exemplars.py` | Ingestion back-half: reads `status=accept` clean entries, `id=sha256(text)`, embeds via `vector_store.embed_texts` (DashScope, 1024-dim), per-`task_type` near-dup drop (cosine ≥ 0.95), idempotent `ON CONFLICT (id) DO UPDATE` upsert into `stimulus_exemplars` via direct `psycopg2`/`SUPABASE_DB_URL` (bypasses RLS); `--force`/`--source` | Supabase (service-role direct) |
| `supabase-migration-004.sql` | `stimulus_exemplars` table — shared retrieval corpus for Stimulus Exemplar-grounded generation; `hnsw vector_cosine_ops` + GIN tsvector + task_type btree indexes; RLS enabled with no policies (PostgREST-deny; backend direct Postgres connection bypasses RLS, ADR 0009 §2) | Supabase pgvector |
| `backend/services/exemplar_store.py` | Read path over `stimulus_exemplars`: `retrieve(task_type,mode,topic?,targeting?,n)` (`random`=`ORDER BY random()`; `targeted`=task_type+difficulty/`features @> jsonb`; `theme`=single-SQL hybrid dense `embedding <=>` + sparse `plainto_tsquery`, RRF-fused `FULL OUTER JOIN`) + `get_verbatim`; direct `psycopg2` via `asyncio.to_thread`, silent `[]` on any failure (ADR 0008 §4) | Supabase (service-role direct) |
| `backend/services/originality.py` | Local word-shingle Jaccard guard (4-gram, threshold 0.5): `shingles`/`jaccard`/`max_overlap`/`is_too_similar`; no API calls (ADR 0008 §3) | computed |
| `backend/services/stimulus_service.py` | Stimulus serving logic behind `POST /api/pte/stimulus`: three-tier fallback (verbatim → exemplar-grounded few-shot generation → empty-bank pure-AI → silent pure-AI) + originality guard (regenerate once if a generation overlaps an injected exemplar above threshold) | computed |
| `backend/scripts/eval_originality.py` | Offline originality eval: samples generations vs injected exemplars, prints overlap distribution + over-threshold rate; real LLM/embedding/DB calls, NOT wired into CI | — |

Personalization policy:

- Logged-in: Supabase is the authority for personalized recommendations and daily plans.
- Logged-out: show general entry points or a login prompt; do not show personalized recommendations.
- Supabase failure: show generic or temporarily unavailable UI; do not fall back to localStorage as personalization.
- localStorage: migration, backup, temporary local state, and graceful UI fallback only.

## API Endpoints

Same `POST /api/*` paths are served on **both** runtimes today. Per ADR 0007 the
authoritative implementation is FastAPI (`backend/routers/*`); the Next route of
the same path is the legacy direct/proxy implementation being migrated away and
deleted. In the end state these are served only by FastAPI and reached from the
browser via `NEXT_PUBLIC_API_BASE_URL`.

| Endpoint | Purpose | Request | Response |
|----------|---------|---------|----------|
| `POST /api/tts` | Azure TTS | `{ text, voice, rate }` | WAV audio stream |
| `POST /api/pronunciation` | Azure pronunciation assessment | FormData audio + reference text | `PronunciationAssessmentResult` JSON |
| `POST /api/read-aloud/stimulus` | Generate a PTE Read Aloud passage (50–70 words) | — | `{ text: string }` |
| `POST /api/read-aloud/feedback` | AI oral fluency + pronunciation feedback for Read Aloud | `{ stimulus, transcript, pronunciationAssessment? }` | `TaskFeedback` JSON |
| `POST /api/pte/stimulus` | Generate stimulus for any PTE task type (Exemplar-grounded when a bank exists, else pure-AI; ADR 0008) | `{ taskType, mode?: random\|targeted\|theme, topic?, targeting?, verbatim? }` | `{ text: string }` |
| `POST /api/pte/feedback` | AI feedback for any PTE task type | `{ taskType, stimulus, response, pronunciationAssessment? }` | `TaskFeedback` JSON |
| `POST /api/word-lookup` | Translate a selected word/phrase (dictionary-first, LLM fallback) | `{ query: string }` | `WordLookupResult` JSON (`{ source, text, phonetic, entries, tags }`) |

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
| Reading Agent | Implemented | Fill in the Blanks (Reading), Re-order Paragraphs, Multiple Choice (Reading) |
| Listening Agent | Implemented | Write from Dictation, Summarize Spoken Text, Fill in the Blanks (Listening), Highlight Correct Summary |

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

### Scoring Agent — implemented

Produces per-dimension qualitative scores (0–100 internal scale, for reference only) for each Feedback dimension. Speaking: fluency, pronunciation, content. Writing: grammar, vocabulary, form, content. Entry point: `src/app/api/pte/feedback/route.ts`.

### Diagnosis Agent — implemented

Extends `src/lib/task-weakness.ts`: `aggregateDimensions` computes per-dimension weighted averages from `PracticeTask` history; `scoreFromTask` uses actual dimension scores when available, falling back to the strengths/weaknesses heuristic. Results stored in `TaskTypeWeakness.dimensions`.

### Coach Agent — implemented

Generates targeted coaching tips per weak dimension. Returned in `TaskFeedback.coachSuggestions[]`. Produced inline by the primary LLM call as part of the same JSON response.

### LLM-as-Judge — implemented

An independent LLM call runs in parallel with the primary Scoring Agent call. Trigger rule: if any single dimension diverges by more than 15 points between the two calls, the system retries the primary call and attaches a `JudgeLog` record to `TaskFeedback.judgeLog`. Disagreement rate is a quantifiable quality metric for prompt iteration.

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

### Learning Trajectory Visualisation — implemented

- SVG radar chart overlaying actual vs target dimension scores (speaking: fluency/pronunciation/content; writing: grammar/vocabulary/form/content)
- Target score slider (40–95) with live gap analysis bars per dimension
- Score trajectory line chart per task type (weekly average, last 8 weeks), selectable via task-type pill buttons
- All implemented in `src/app/stats/page.tsx`

No absolute exam score prediction is made. Predicting a real PTE score from practice data is unverifiable and would conflict with ADR 0003's principle of not misleading learners with unvalidated numbers.

## Project Conventions

- Keep payment, subscription, commercial operations, leaderboard, learning groups, and social sharing in future/backlog unless explicitly requested.
- Do not run CI/E2E against real LLM, Azure, Supabase, or paid external APIs.
- Prefer mock-first E2E through Playwright `page.route()`.
- FastAPI is the single authoritative backend (ADR 0007). Do not add new business or LLM logic to Next `src/app/api/*`; Next business routes are being migrated to FastAPI and deleted. All third-party secrets live only in the backend runtime.
- After meaningful development work, update `docs/DEVELOPMENT_LOG.md`, `docs/PROJECT_CONTEXT.md`, `docs/TASKS.md`.
- See `CONTEXT.md` at repo root for canonical domain terminology.
- See `docs/adr/` for key architectural decisions.
