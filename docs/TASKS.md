# EchoLingo Tasks

## Current Recommendation

Proceed with **Phase H: personalized learning plan deepening**, with one corrected product rule:

> Personalized recommendations should be generated after login from Supabase-backed user data. localStorage is not the authority for logged-in recommendations.

Why this first:

- The app already has a daily learning plan on the home page.
- Existing Supabase history, progress, sessions, feedback-derived signals, recommendations, and stats can make the plan more useful without a large new subsystem.
- It keeps the next phase focused on learning value instead of more infrastructure.

## Phase H: Personalized Learning Plan Deepening

Goal: make the logged-in daily plan explainable, completable, and connected to Supabase-backed review/history/stats.

Personalization source rules:

- Logged-in: Supabase is the authority for personalized plan and recommendation decisions.
- Logged-out: show general practice entry points or login prompt; do not present localStorage as personalized recommendation data.
- Supabase failure: show generic/unavailable fallback; do not silently treat localStorage as complete personalization.
- localStorage: only migration, backup, temporary local state, or non-authoritative fallback.

### H1. Review Plan Data Sources ✅

- [x] Read `src/lib/learning-plan.ts`
- [x] Check how it consumes progress, sessions, error patterns, and recommendations
- [x] Document logged-in, logged-out, empty-history, and cloud-failure behavior
- [x] Decide whether any data boundary needs a small refactor

Acceptance:

- Review conclusion recorded in `docs/DEVELOPMENT_LOG.md` ✅
- No behavior change unless a clear boundary problem is found ✅

Review findings:

- `learning-plan.ts` queries Supabase directly, bypassing `unified-history.ts` — no local fallback on cloud failure
- Logged-out users see no DailyTasks (returns null)
- Empty history → generic tasks for all topics (correct)
- Cloud failure → generic tasks (acceptable fallback only if clearly non-personalized)
- Completion matching uses `mode.includes(part)` — loose but safe with current mode values
- `recommendations.ts` still mixes Supabase progress with localStorage error patterns; this should be corrected before relying on it for logged-in personalization
- Decision: no localStorage-backed personalization should be added in H2/H3

### H2a. Align Personalization Data Authority ✅

- [x] Review `src/lib/recommendations.ts` and remove or isolate localStorage error profile as a primary logged-in recommendation source
- [x] Decide where feedback-derived weak areas should live in Supabase
- [x] For logged-out users, keep recommendation UI generic or ask the user to log in
- [x] For Supabase errors, show a generic/unavailable state instead of localStorage-personalized output

Acceptance:

- Logged-in personalized recommendations are based on Supabase-backed data ✅
- localStorage is documented and treated as non-authoritative ✅
- No new real LLM call is introduced ✅

Changes:

- Created `supabase-migration-002.sql` with `user_error_patterns` and `user_weak_areas` tables
- Created `src/lib/supabase-error-patterns.ts` for Supabase error pattern operations
- Updated `src/lib/recommendations.ts` to use Supabase error patterns via `getWeakSkills()` and `getTopErrorForSkill()`
- Updated `src/lib/error-patterns.ts` to sync with Supabase for logged-in users while keeping localStorage as backup
- Updated `src/components/PersonalizedSuggestions.tsx` to use Supabase error patterns
- Updated `src/lib/feedback-actions.ts` to await async `updateErrorPatterns()`
- Updated `src/lib/error-patterns.test.ts` with async tests and Supabase mock

Validation:

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run test:unit:run` — 10 files, 86 tests passed
- `npm run build` — passed

### H2. Make Task Reasons Specific ✅

- [x] Add a short reason for each daily task
- [x] Prefer real Supabase-backed data where available: recent low score, weak topic, recent session signal
- [x] Keep fallback copy for empty or old data
- [x] Do not call a real LLM to generate reasons

Acceptance:

- Home page tasks explain why they were recommended ✅
- Old/empty data does not crash or show awkward blanks ✅

Changes:

- Added `reason` field to `DailyTask` interface
- Unpracticed topic: "You haven't practiced this topic yet — give it a try"
- Random variety: "Review for variety — keep your skills fresh"
- Shadowing: "Build fluency and natural rhythm through repetition"
- Review low-score: "Your best score here is Band X.Y — targeted practice can help raise it"
- Rendered in `DailyTasks.tsx` as italic text below description

Follow-up:

- Current reasons are useful but still generic. Next iteration should avoid presenting localStorage-only error patterns as logged-in personalization.

### H3. Tighten Completion State

- [ ] Check how practice, exam, and shadowing completion map to daily tasks
- [ ] Keep completion derived from existing sessions/progress where possible
- [ ] Avoid adding a second task-status store unless review proves it is needed

Acceptance:

- Completing a relevant activity updates the daily plan consistently
- History/stats and plan state do not disagree

### H4. Test Coverage

- [ ] Unit tests for learning plan generation
- [ ] Component test for `DailyTasks`
- [ ] E2E smoke only if cross-page behavior changes

Acceptance:

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit:run`
- Relevant E2E smoke if the home/practice flow changes

## Alternative Next Phases

Choose only one if Phase H is intentionally paused. The full long-term roadmap lives in `docs/PRODUCT_ROADMAP.md`.

| Phase | Scope | Boundary |
|-------|-------|----------|
| Pronunciation enhancement | Better phoneme/word feedback and next shadowing queue | Consume existing Azure assessment data only |
| Vocabulary notebook | Extract useful vocabulary from feedback/sample answers | Start local-first, no spaced repetition system |
| History analytics | Clearer trend/weakness review | No admin/operations analytics |
| Export reports | PDF/Markdown learning report | No social sharing |

## Roadmap After Phase H

Use `docs/PRODUCT_ROADMAP.md` as the source of truth for later phases:

- Phase I: Learner Profile
- Phase J: Pronunciation Intelligence
- Phase K: Vocabulary Notebook
- Phase L: Learning Reports
- Phase M: Backend Product APIs

## Completed Phase Summary

| Phase | Status | Notes |
|-------|--------|-------|
| MVP | Done | Practice, LLM examiner, feedback, local history |
| Voice | Done | STT, Azure TTS, voice conversation |
| Pronunciation | Done | Azure assessment, word/phoneme scoring |
| Shadowing | Done | Listen, record, assess, summarize |
| Mock exam | Done | Part 1 -> Part 2 -> Part 3 |
| Learning review | Done | Shared `FeedbackPanel` / `FeedbackReview` |
| History/stats learning UX | Done | History and stats guide next action |
| Desktop consistency | Done | Shared nav, slate palette, i18n cleanup |
| Data stability | Done | Unified history read/write, cloud fallback, backups |
| Code consolidation | Done | Feedback save flow, audio recorder, chat UI states |
| CI/E2E | Done | Frontend CI, backend CI, 20 Playwright smoke tests |
| Mobile blockers | Done | Current small-screen blockers addressed |
| Python backend | Done | FastAPI backend + frontend API client + deployment docs |

## Current Test Baseline

| Suite | Count / Status |
|-------|----------------|
| Frontend unit | 10 files / 86 tests |
| E2E | 20 tests |
| Backend | 86 tests |
| Quality gate | npm ci dry-run pass, lint 0, typecheck pass, build pass |

## Future / Backlog

Keep these out of the current phase unless explicitly requested:

- Payment
- Subscriptions
- Commercial operations
- Leaderboards
- Learning groups
- Social sharing
- Full mobile redesign
- Real API E2E in CI
- Frontend framework migration
- Removing Next.js API Routes fallback

## Architecture Improvements (2026-06-06) ✅

Four codebase deepening tasks completed:

- **C1 — Error pattern dual-storage schism**: `inferTypeFromText` deduplicated (now exported from `supabase-error-patterns.ts`); misleading sync `getPersonalizedSuggestions` / `getErrorStats` removed from `error-patterns.ts`; file header clarifies localStorage-only responsibility
- **C2 — Learning plan data source duplication**: `learning-plan.ts` now imports `getUserProgress` and `LearningProgress` from `supabase-progress.ts` instead of defining its own copies
- **C3 — Scattered component-level data fetching**: `DailyTasks` and `LearningPath` are now pure render components accepting props; `page.tsx` owns auth + parallel fetch + loading state
- **C4 — Session completion god function**: `saveSessionAndUpdateLearning` now accepts a single `CompletionInput` object (was 7 positional args); internal mutation replaced with immutable spread; callers use the return value

Validation: lint 0, typecheck pass, 82 unit tests pass, build pass.

## Known Technical Debt

- Continue expanding focused unit tests as new behavior lands
- Performance monitoring can be improved
- Keep `package-lock.json` synchronized with `package.json` so frontend CI can pass `npm ci`
- Local native binding signing issue may still affect some startup paths: Next SWC / Vitest Rolldown can be rejected by macOS `dlopen`
- Project docs should stay concise; put long implementation history in development-log summaries, not active plans
