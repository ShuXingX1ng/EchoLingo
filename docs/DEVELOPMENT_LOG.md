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
| 2026-05-24 | Product roadmap | Added long-term phases H-M and removed redundant legacy doc | `git diff --check` |
| 2026-05-24 | H1 review | Reviewed learning plan data sources and degradation strategy | lint/typecheck/unit (86 tests) |
| 2026-05-24 | H2 task reasons | Added reason field to DailyTask with real data | lint/typecheck/unit (86 tests) |
| 2026-05-24 | H2a personalization authority | Moved error pattern storage to Supabase for logged-in users, localStorage as backup | lint/typecheck/unit (86 tests)/build |
| 2026-06-06 | Architecture deepening (C1–C4) | Eliminated error-pattern dual-storage schism, deduplicated learning plan data source, lifted data fetching out of DailyTasks/LearningPath, replaced 7-arg god function with CompletionInput object | lint/typecheck/unit (82 tests)/build |

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
- Removed redundant legacy `docs/dev-log.md`
- Shortened `docs/DEPLOYMENT.md` to current deployment essentials

Validation:

- `git diff --check` passed
- No code changes, so lint/typecheck/tests were not run

### 2026-05-24: H1 — Learning Plan Data Source Review

Scope: Phase H1 code review, no code changes.

Reviewed files:

- `src/lib/learning-plan.ts`
- `src/components/DailyTasks.tsx`
- `src/app/page.tsx`
- `src/lib/recommendations.ts`
- `src/lib/error-patterns.ts`
- `src/lib/unified-history.ts`
- `src/lib/supabase-progress.ts`
- `src/lib/reminders.ts`

Findings:

1. **Data source**: `learning-plan.ts` queries Supabase directly (`learning_progress` + `sessions` tables) via its own `getUserProgress`/`getRecentSessions` functions. It does NOT use `unified-history.ts` or `supabase-progress.ts`.
2. **Logged-in, cloud works**: Two Supabase queries feed `generateDailyTasks()`. Progress determines unpracticed/low-score topics; sessions (last 7 days) determine today's completion.
3. **Logged-out**: `DailyTasks` checks `useAuth()`, returns null if no user. No plan shown, no crash.
4. **Empty history**: Both queries return `[]`. `getUnpracticedTopics([])` returns all topics → 2 practice tasks + 1 shadowing task. Correct behavior.
5. **Cloud failure**: Supabase errors are caught and return `[]`. Function treats it as a new user — generic tasks shown. Graceful degradation but loses personalization. No local fallback (unlike `unified-history.ts` which falls back to localStorage).
6. **Old/missing data**: `getRecentSessions` only looks at last 7 days. `learning_progress` is cumulative. Old progress still drives topic selection; old sessions don't affect completion.
7. **Completion matching**: `s.mode.includes(task.part!)` is loose but safe with current mode strings (`ielts_part_1`, `ielts_part_2`, `ielts_part_3`, `shadowing`).
8. **Separation from recommendations.ts**: The learning plan and recommendation engine are independent. `recommendations.ts` uses `supabase-progress.ts` + `error-patterns.ts`; `learning-plan.ts` has its own Supabase queries. No shared data path.
9. **No existing tests** for `learning-plan.ts` or `DailyTasks.tsx`.

Decision:

- No code change in H1. The cloud-fallback gap is a known limitation but not a crash-risk boundary problem.
- The gap should be addressed in H2/H3 if task reasons or completion state need local data.

Validation:

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run test:unit:run` — 10 files, 86 tests passed

### 2026-05-24: H2 — Task Reasons Specific

Scope: minor feature addition.

Changed files:

- `src/lib/learning-plan.ts` — added `reason: string` to `DailyTask` interface; populated in `createPracticeTask`, `createShadowingTask`, `createReviewTask`
- `src/components/DailyTasks.tsx` — renders `task.reason` as italic text below description

Reason content by task type:

- Unpracticed topic: "You haven't practiced this topic yet — give it a try"
- Random variety: "Review for variety — keep your skills fresh"
- Shadowing: "Build fluency and natural rhythm through repetition"
- Review low-score: "Your best score here is Band X.Y — targeted practice can help raise it"

Follow-up decision:

- Product direction was corrected after review: logged-in personalization should treat Supabase as the authority.
- localStorage should remain migration/backup/temporary/fallback data, not the primary source for logged-in recommendations.
- `recommendations.ts` currently mixes Supabase progress with localStorage error patterns, so the next pass should align it before expanding personalized recommendation behavior.

### 2026-05-24: H2a — Align Personalization Data Authority

Scope: data authority alignment for personalized recommendations.

Changed files:

- `supabase-migration-002.sql` — created `user_error_patterns` and `user_weak_areas` tables with RLS policies and auto-update trigger
- `src/lib/supabase-error-patterns.ts` — new Supabase service for error pattern CRUD operations and weak areas queries
- `src/lib/recommendations.ts` — updated to use Supabase error patterns via async `getWeakSkills()` and `getTopErrorForSkill()` functions
- `src/lib/error-patterns.ts` — updated `updateErrorPatterns()` to sync with Supabase for logged-in users while keeping localStorage as backup
- `src/components/PersonalizedSuggestions.tsx` — updated to use Supabase error patterns for logged-in users
- `src/lib/feedback-actions.ts` — added `await` to async `updateErrorPatterns()` call
- `src/lib/error-patterns.test.ts` — updated tests to handle async function and mock Supabase calls

Data authority rules implemented:

- Logged-in users: Supabase is the authority for personalized recommendations and error patterns
- Logged-out users: localStorage only (no personalization shown)
- Supabase failure: graceful degradation, no localStorage fallback for personalization
- localStorage: backup, migration, temporary local state only

Validation:

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run test:unit:run` — 10 files, 86 tests passed
- `npm run build` — passed

### 2026-05-24: Product Roadmap

Scope: documentation planning.

Completed:

- Added `docs/PRODUCT_ROADMAP.md`
- Defined long-term phases H-M:
  - Personalized Learning Plan
  - Learner Profile
  - Pronunciation Intelligence
  - Vocabulary Notebook
  - Learning Reports
  - Backend Product APIs
- Updated docs entry points to include the roadmap
- Removed the legacy `docs/dev-log.md` pointer because it duplicated `DEVELOPMENT_LOG.md`

Validation:

- `git diff --check` passed

Notes:

- Reasons use hardcoded English (consistent with existing description pattern). i18n keys can be added in a follow-up if needed.
- Empty/old data: reasons are always set — no blank or missing state possible.

Validation:

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run test:unit:run` — 10 files, 86 tests passed

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

### 2026-05-24: CI Lockfile Sync Fix

Scope: dependency lockfile maintenance.

Completed:

- Regenerated `package-lock.json` metadata so GitHub Actions `npm ci` can install from a synchronized lockfile
- Added the missing bundled optional dependency records required by Tailwind's wasm oxide package

Validation:

- `npm ci --dry-run --cache ./.npm-cache` passed after the lockfile update
- Previous local quality checks in this session passed: `npm run lint`, `npm run typecheck`, `npm run test:unit:run`, `npm run build`

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
