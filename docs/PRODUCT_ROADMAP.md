# EchoLingo Product Roadmap

This roadmap describes the next major product arcs after the current MVP and stabilization work. It should guide future agents for many development cycles without turning active task docs into a giant checklist.

## Product Principles

- Logged-in personalization must be based on Supabase-backed user data.
- localStorage is not authoritative for logged-in recommendations. Use it only for logged-out temporary state, migration, backup, and non-authoritative fallback.
- If Supabase is unavailable, show generic or temporarily unavailable recommendation UI instead of pretending local data is complete personalization.
- Every personalized recommendation should explain why it exists.
- Prefer learning value over feature volume.
- Keep automated tests mock-first. Do not require real LLM, Azure, Supabase, or paid APIs in CI.
- Each phase should start with a small review, then one clear implementation boundary.
- Commercialisation, payment, subscriptions, leaderboards, groups, and social sharing stay out of scope unless explicitly requested.

## Current Baseline

Completed:

- IELTS Part 1/2/3 practice
- Full mock exam
- Shadowing and pronunciation assessment
- Feedback review and history review
- Learning stats and recommendations
- Daily learning plan v1
- Supabase auth and cloud sync
- FastAPI backend beside Next.js API fallback
- CI, unit tests, E2E smoke tests

Current next work:

- **Phase H: Personalized Learning Plan** with Supabase-authoritative data.

## Phase H: Personalized Learning Plan

Goal: make the logged-in daily plan explainable, completable, and connected to Supabase-backed review/history/stats.

### H1. Data Authority Alignment

Tasks:

- Audit `src/lib/learning-plan.ts`, `src/lib/recommendations.ts`, `src/lib/error-patterns.ts`, and Supabase progress/session tables.
- Remove or isolate localStorage error patterns from logged-in recommendation decisions.
- Decide the smallest Supabase-backed place for weak areas/error patterns.
- Keep logged-out users on generic practice entry points or login prompts.
- Handle Supabase failure with generic/unavailable UI.

Acceptance:

- Logged-in personalized plan/recommendations do not treat localStorage as authority.
- The data source policy is documented in `PROJECT_CONTEXT.md`.
- No real LLM call is added for recommendations.

### H2. Explainable Daily Tasks

Tasks:

- Add clear reasons to tasks using Supabase-backed signals:
  - low band topic
  - repeated weak part
  - recent missed practice
  - recent pronunciation need
- Keep fallback reasons for empty history.
- Avoid vague motivational text when real signals exist.

Acceptance:

- Each task answers “why this today?”
- Empty/new users still get useful generic tasks.
- Old/missing fields do not crash.

### H3. Completion Consistency

Tasks:

- Map practice, exam, and shadowing completion to daily tasks.
- Prefer deriving completion from existing sessions/progress.
- Avoid adding a separate task-status store unless clearly necessary.

Acceptance:

- Completing a relevant activity updates task status.
- Home plan, history, and stats do not disagree.

### H4. Plan Tests

Tasks:

- Unit-test learning plan generation.
- Component-test `DailyTasks`.
- Add E2E only if cross-page behavior changes.

Acceptance:

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit:run`
- Relevant E2E smoke when needed

## Phase I: Learner Profile

Goal: create a Supabase-backed learner profile that can power plans, recommendations, stats, reports, and future APIs.

Candidate fields:

- current estimated band
- target band
- exam date
- Part 1/2/3 strength
- fluency / grammar / vocabulary / pronunciation trend
- weak topics
- high-frequency error types
- pronunciation weak words/phonemes
- recent activity and streak
- confidence or completion rate if already derivable

Tasks:

- Design a minimal schema or view that can be derived from existing session/progress data.
- Prefer derived profile first; persist only if it removes real cost or complexity.
- Document migration path for any new Supabase table.
- Add a compact learner profile summary to home or stats.

Acceptance:

- Profile can be computed for a logged-in user.
- Empty profile state is clear and useful.
- User can understand current learning state in one glance.
- Existing history and stats do not regress.

## Phase J: Pronunciation Intelligence

Goal: make pronunciation data more actionable using existing Azure assessment results.

Tasks:

- Aggregate low-scoring words and phonemes.
- Build a pronunciation queue from recent weak words.
- Link feedback pronunciation issues to shadowing practice.
- Track pronunciation trend: accuracy, fluency, completeness.
- Add targeted shadowing tasks to the daily plan.

Acceptance:

- User sees what to repeat next, not just a score.
- No new Azure capability is required at first.
- Pronunciation data works with old sessions that lack phonemes.

Boundaries:

- Consume existing Azure assessment output first.
- Do not build a full speech-analysis service.
- Do not require real Azure in automated tests.

## Phase K: Vocabulary Notebook

Goal: help users collect and reuse IELTS-ready expressions from their practice.

Tasks:

- Extract candidate phrases from feedback, improved sample answers, or manually selected text.
- Save vocabulary items with topic, example sentence, source session, and status.
- Add states: new, practicing, mastered.
- Let setup suggest a few expressions to use in the next answer.

Acceptance:

- User can review useful expressions by topic.
- Vocabulary items can link back to the source session.
- Empty state guides the user to practice first.

Boundaries:

- Start simple and user-private.
- No complex spaced repetition system at first.
- No social sharing.

## Phase L: Learning Reports

Goal: turn sessions and weekly progress into private reports users can review or export.

Report types:

- single session report
- weekly report
- topic/skill report

Candidate content:

- estimated band trend
- practice count
- completed tasks
- strongest area
- most repeated weakness
- pronunciation trend
- suggested next week focus

Tasks:

- Define report data builder from existing sessions/progress/profile.
- Add Markdown or PDF export.
- Keep reports private and local/downloadable.

Acceptance:

- Report can be generated without real external API calls.
- Empty/low-data report still gives a clear next step.
- Export does not break history backup/export.

Boundaries:

- No public share links.
- No social posting.
- No paid report tier.

## Phase M: Backend Product APIs

Goal: gradually move product intelligence behind stable FastAPI endpoints where it improves maintainability.

Candidate APIs:

- learner profile API
- learning plan API
- recommendation API
- error pattern API
- pronunciation history API
- vocabulary notebook API
- report generation API

Execution order:

1. Keep frontend implementation until the data contract is clear.
2. Add FastAPI schema and tests.
3. Switch frontend through `api-client`.
4. Keep Next.js fallback only where still useful.

Acceptance:

- API schemas align with TypeScript types.
- Backend tests cover success, empty, and error states.
- Frontend still works with mock-first E2E.

Boundaries:

- Do not migrate all frontend logic at once.
- Do not remove Next.js API Routes fallback without a dedicated phase.

## Later UX Polish

These are useful but should follow the learning-data phases:

- Better onboarding for target band and exam date
- More compact stats page
- Better empty states for logged-out users
- Optional mobile polish pass
- Accessibility review for new widgets

## Explicit Non-goals

Do not implement by default:

- Payment
- Subscriptions
- Commercial operations
- Leaderboards
- Learning groups
- Social sharing
- Public profile pages
- Real API E2E in CI
- Frontend framework migration
- Full-stack Python rewrite

## Agent Execution Rules

For future agents:

1. Read `AGENTS.md`, `docs/README.md`, `docs/PROJECT_CONTEXT.md`, `docs/TASKS.md`, `docs/PRODUCT_ROADMAP.md`, `docs/NEXT_OPTIMIZATION_PLAN.md`, and current `git diff`.
2. Confirm whether the worktree has uncommitted changes.
3. If touching Next.js code, read relevant docs in `node_modules/next/dist/docs/`.
4. Pick one phase and one boundary.
5. Review first, then implement.
6. Preserve user/previous-agent changes.
7. Update `DEVELOPMENT_LOG.md`, `PROJECT_CONTEXT.md`, and `TASKS.md`.
8. Run the relevant quality gate and record actual results.
