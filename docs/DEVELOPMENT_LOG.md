# EchoLingo Development Log

This is a compressed project timeline. Older blow-by-blow entries were intentionally summarized on 2026-05-24 to keep handoff documents readable. Use git history for exact diffs.

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
| 2026-05-23 | Learning plan v1 | Daily learning plan added to the home page | lint/typecheck/build/unit/E2E recorded in earlier work |
| 2026-05-24 | Docs compaction | Active docs compressed and reorganized around current state and Phase H | `git diff --check` |

## Major Completed Capabilities

- IELTS Part 1/2/3 practice with AI examiner
- Full mock exam flow
- Structured feedback and estimated band score
- Error annotations and improved sample answer
- Azure Neural TTS
- Azure Pronunciation Assessment
- Shadowing practice
- Unified learning review UI
- History review and stats learning progress
- Supabase auth and cloud sync
- Local fallback and backup paths
- Recording playback through IndexedDB
- Desktop and mobile navigation
- Admin, topics, users, i18n
- Frontend CI, backend CI, E2E smoke tests
- FastAPI backend beside Next.js API Routes fallback

## Recent Detailed Entries

### 2026-05-24: Docs Compaction

Scope: documentation maintenance.

Completed:

- Added `docs/README.md` as the docs entry point
- Rewrote `docs/PROJECT_CONTEXT.md` around current architecture and current facts
- Rewrote `docs/TASKS.md` around Phase H and active backlog
- Compressed `docs/DEVELOPMENT_LOG.md` from long-form history into a timeline
- Kept `docs/NEXT_OPTIMIZATION_PLAN.md` as the handoff and next-phase plan
- Reduced `docs/dev-log.md` to a legacy pointer
- Shortened `docs/DEPLOYMENT.md` to current deployment essentials

Validation:

- `git diff --check` passed
- No code changes, so lint/typecheck/tests were not run

### 2026-05-24: NEXT_OPTIMIZATION_PLAN Compaction

Scope: documentation maintenance.

Completed:

- Rewrote `docs/NEXT_OPTIMIZATION_PLAN.md` from a long completed checklist into a handoff plan
- Preserved new-window instructions, stable baseline, Phase A-G summaries, quality gates, and non-goals
- Added recommended next phase: Phase H personalized learning plan deepening
- Updated project context and task list to point at Phase H

Validation:

- `git diff --check` passed
- No code changes, so lint/typecheck/tests were not run

## Documentation Policy

After meaningful development work, update:

- `docs/DEVELOPMENT_LOG.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/TASKS.md`

Keep entries short and factual:

- What changed
- Key files
- Validation actually run
- Follow-up work, if any

Do not paste long implementation plans for completed work into active planning docs. Move details into concise summaries.
