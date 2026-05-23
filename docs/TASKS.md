# EchoLingo Tasks

## Current Recommendation

Proceed with **Phase H: personalized learning plan deepening**.

Why this first:

- The app already has a daily learning plan on the home page.
- Existing history, feedback, error patterns, recommendations, and stats can make the plan more useful without a large new subsystem.
- It keeps the next phase focused on learning value instead of more infrastructure.

## Phase H: Personalized Learning Plan Deepening

Goal: make the daily plan explainable, completable, and connected to review/history/stats.

### H1. Review Plan Data Sources

- [ ] Read `src/lib/learning-plan.ts`
- [ ] Check how it consumes progress, sessions, error patterns, and recommendations
- [ ] Document logged-in, logged-out, empty-history, and cloud-failure behavior
- [ ] Decide whether any data boundary needs a small refactor

Acceptance:

- Review conclusion recorded in `docs/DEVELOPMENT_LOG.md`
- No behavior change unless a clear boundary problem is found

### H2. Make Task Reasons Specific

- [ ] Add a short reason for each daily task
- [ ] Prefer real data: recent low score, repeated error type, weak topic, low pronunciation word
- [ ] Keep fallback copy for empty or old data
- [ ] Do not call a real LLM to generate reasons

Acceptance:

- Home page tasks explain why they were recommended
- Old/empty data does not crash or show awkward blanks

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

Choose only one if Phase H is intentionally paused.

| Phase | Scope | Boundary |
|-------|-------|----------|
| Pronunciation enhancement | Better phoneme/word feedback and next shadowing queue | Consume existing Azure assessment data only |
| Vocabulary notebook | Extract useful vocabulary from feedback/sample answers | Start local-first, no spaced repetition system |
| History analytics | Clearer trend/weakness review | No admin/operations analytics |
| Export reports | PDF/Markdown learning report | No social sharing |

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
| Quality gate | lint 0, typecheck pass, build pass |

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

## Known Technical Debt

- Continue expanding focused unit tests as new behavior lands
- Performance monitoring can be improved
- Local native binding signing issue may still affect some startup paths: Next SWC / Vitest Rolldown can be rejected by macOS `dlopen`
- Project docs should stay concise; put long implementation history in development-log summaries, not active plans
