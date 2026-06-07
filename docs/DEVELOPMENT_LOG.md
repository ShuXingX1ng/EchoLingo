# EchoLingo Development Log

Older entries were intentionally summarized to keep this file readable. Use git history for exact diffs.

## Timeline

| Date | Entry | Summary | Validation |
|------|-------|---------|------------|
| 2026-05-13 | MVP setup | Next.js app, landing page, text practice, LLM examiner/feedback, local history | Core loop manually verified |
| 2026-05-14 | Voice and platform foundations | STT, TTS, voice controls, dark mode, PWA, accessibility, stats, goals, backups, error logging | Manual checks |
| 2026-05-15 to 2026-05-20 | Product expansion | Supabase auth/sync, topic library, recording playback, admin, i18n, recommendations, mock exam | Feature checks |
| 2026-05-21 | Learning review | Shared `FeedbackPanel` / `FeedbackReview`, history review reuse, next-action links | Unit tests added |
| 2026-05-22 | Stability and CI | Desktop nav, Next 16 config cleanup, lint cleanup, CI, E2E planning | lint/typecheck/unit/build |
| 2026-05-22 to 2026-05-23 | Data and structure | Unified history save/read, session ID consistency, error-pattern backup, recommendation improvements, audio/feedback/chat UI consolidation | lint/typecheck/unit |
| 2026-05-23 | Mobile blockers and E2E | Current mobile blockers fixed, Playwright smoke suite expanded | 20 E2E tests |
| 2026-05-23 | Python backend | FastAPI backend, LLM/Azure/Supabase services, frontend `api-client`, backend CI, deployment guide | 86 backend tests, frontend quality gates |
| 2026-05-23 | Learning plan v1 | Daily learning plan added to the home page | lint/typecheck/build/unit/E2E |
| 2026-05-24 | Docs compaction | Active docs compressed and reorganized around current state and Phase H | `git diff --check` |
| 2026-05-24 | H1 review | Reviewed learning plan data sources; no code changes; findings documented | lint/typecheck/unit (86 tests) |
| 2026-05-24 | H2 task reasons | Added `reason` field to `DailyTask`; rendered in `DailyTasks.tsx` | lint/typecheck/unit (86 tests) |
| 2026-05-24 | H2a personalization authority | Moved error pattern storage to Supabase for logged-in users; `supabase-error-patterns.ts` created; `recommendations.ts` updated | lint/typecheck/unit (86 tests)/build |
| 2026-06-06 | Architecture deepening (C1–C4) | Eliminated error-pattern dual-storage schism; deduplicated learning plan data source; lifted data fetching out of `DailyTasks`/`LearningPath`; replaced 7-arg god function with `CompletionInput` object | lint/typecheck/unit (82 tests)/build |
| 2026-06-07 | Phase 1 — PTE data model skeleton | Added PTE types (`PracticeTask`, `TaskFeedback`, `PteTaskType`, `TaskTypeWeakness`) to `src/types/index.ts`; created `task-history.ts`, `supabase-task-history.ts`, `unified-task-history.ts`, `task-weakness.ts`; added `getPteRecommendations` to `recommendations.ts`; deleted shadowing route and all shadowing components/hooks; removed shadowing refs from home, stats, nav, learning-plan, DailyTasks | typecheck 0 errors, 82/82 unit tests pass |
| 2026-06-07 | Phase 2 — Read Aloud vertical slice | New `POST /api/read-aloud/stimulus` (AI passage generation), `POST /api/read-aloud/feedback` (AI oral-fluency + pronunciation feedback); new `/practice/read-aloud` page with 6-phase state machine (idle → generating → ready → recording → processing → done); 35s prep timer, 40s recording countdown, WAV conversion via Web Audio API, parallel Azure pronunciation + AI feedback calls, `saveTask` via `unified-task-history`; home page CTA updated to link to `/practice/read-aloud` | lint 0 errors, typecheck pass |
| 2026-06-07 | Phase 2 — all remaining task slices + practice hub | `src/lib/wav-encoder.ts` (shared WAV util); `src/components/TaskFeedbackDisplay.tsx` (shared feedback UI); `POST /api/pte/stimulus` + `POST /api/pte/feedback` (unified LLM routes for all task types); 6 new pages: `/practice/repeat-sentence`, `/practice/answer-short-question`, `/practice/personal-intro`, `/practice/summarize-written-text`, `/practice/write-essay`, `/practice/write-from-dictation`; `/practice/page.tsx` replaced with PTE task-type hub grid; home CTA updated to `/practice` | lint 0 errors, typecheck pass |
| 2026-06-07 | Phase 3 — Timing enforcement (min recording guard) | Added `MIN_REC_SECONDS = 5` to `read-aloud`, `repeat-sentence`, `answer-short-question`, `personal-intro`; Stop/Done button disabled for first 5s, shows countdown label "Hold on… Xs" while waiting | typecheck 0 errors, lint 0 errors |
| 2026-06-07 | Phase 3 — Task Bank wired into all 6 task pages | Added `getStimulusFromBank` / `addStimulusToBank` calls to `read-aloud`, `repeat-sentence`, `answer-short-question`, `summarize-written-text`, `write-essay`, `write-from-dictation`; personal-intro skipped (fixed prompt) | typecheck 0 errors, lint 0 errors |
| 2026-06-07 | Agent architecture design | Grilling session resolved 7 design decisions: no Router Agent (ADR 0004); Azure PA authoritative for pronunciation, Whisper for transcription only; 10–90 scoring with PTE-aligned dimensions (ADR 0003 updated); RAGAS scoped to Summarize Written Text only; LLM-as-Judge triggers on > 15-point dimension divergence; user profile keyed by Task Type not Section; learning trajectory uses gap analysis not score prediction. New files: `docs/agent-architecture.md`, `docs/agent-architecture.html`. Updated: `CONTEXT.md`, `docs/PROJECT_CONTEXT.md`, `docs/adr/0003`, `docs/adr/0004` | Docs only, no code changes |
| 2026-06-07 | Phase 3 — Practice infrastructure | Rewrote `/history` page to display `PracticeTask` records (task-type filter tabs, search, delete, export CSV/JSON, detail view with `TaskFeedbackDisplay`); rewrote `/stats` page to show task-type weakness profile (custom `WeaknessBar` rows + ranked weakness list, practice distribution bar chart, weekly activity); added `clearAllTasksLocal` to `unified-task-history.ts`; created `src/lib/task-bank.ts` (localStorage stimulus cache: `getStimulusFromBank`, `addStimulusToBank`, `getBankSize`, `clearBankForType`, `clearAllBank`) | lint 0 errors, typecheck pass, 82/82 unit tests, build pass |

## Major Completed Capabilities

- IELTS Part 1/2/3 practice with AI examiner
- Full mock exam flow
- Structured feedback and estimated band score
- Error annotations and improved sample answer
- Azure Neural TTS and Pronunciation Assessment
- Shadowing practice with per-sentence scoring
- Unified learning review UI (`FeedbackPanel` / `FeedbackReview`)
- History review and stats learning progress
- Supabase auth and cloud sync with local fallback
- Recording playback through IndexedDB
- Desktop and mobile navigation
- Admin, topics, users, i18n
- Frontend CI, backend CI, 20 E2E smoke tests
- FastAPI backend beside Next.js API Routes fallback
- Daily learning plan with Supabase-authoritative personalization

## Documentation Policy

After meaningful development work, update:

- `docs/DEVELOPMENT_LOG.md` (add a row to Timeline)
- `docs/PROJECT_CONTEXT.md` (update Current Status if needed)
- `docs/TASKS.md` (mark completed, add next phase tasks)

Keep entries short and factual: what changed, key files, validation actually run.
