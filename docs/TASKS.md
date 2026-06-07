# EchoLingo Tasks

## Completed Phases

| Phase | Status | Notes |
|-------|--------|-------|
| MVP | Done | Practice, LLM examiner, feedback, local history |
| Voice | Done | STT, Azure TTS, voice conversation |
| Pronunciation | Done | Azure assessment, word/phoneme scoring |
| Shadowing | Done | Listen, record, assess, summarize |
| Mock exam | Done | IELTS Part 1 → Part 2 → Part 3 |
| Learning review | Done | Shared `FeedbackPanel` / `FeedbackReview` |
| History/stats learning UX | Done | History and stats guide next action |
| Desktop consistency | Done | Shared nav, slate palette, i18n cleanup |
| Data stability | Done | Unified history read/write, cloud fallback, backups |
| Code consolidation | Done | Feedback save flow, audio recorder, chat UI states |
| CI/E2E | Done | Frontend CI, backend CI, 20 Playwright smoke tests |
| Mobile blockers | Done | Current small-screen blockers addressed |
| Python backend | Done | FastAPI backend + frontend API client + deployment docs |
| Phase H: Personalized Plan | Done | Supabase-authoritative error patterns, task reasons, architecture deepening (C1–C4) |
| PTE pivot planning | Done | Domain glossary (CONTEXT.md), ADRs 0001–0003, all architectural decisions resolved |
| Phase 1: PTE data model skeleton | Done | PTE types, 4 new storage/weakness modules, `getPteRecommendations`, shadowing deleted |
| Phase 2a: Read Aloud vertical slice | Done | `/practice/read-aloud`, `/api/read-aloud/stimulus`, `/api/read-aloud/feedback`, WAV conversion, parallel Azure + AI, saveTask |
| Phase 2b: All remaining task slices | Done | All 7 task routes live; shared `/api/pte/stimulus` + `/api/pte/feedback`; `TaskFeedbackDisplay`; `wav-encoder`; `/practice` hub page |
| Phase 3: Practice infrastructure | Done | `/history` + `/stats` rewritten for PTE; `task-bank.ts` wired into all 6 task pages; 5s min-recording guard on all spoken tasks |

## Current Test Baseline

| Suite | Count / Status |
|-------|----------------|
| Frontend unit | 10 files / 82 tests |
| E2E | 20 tests |
| Backend | 86 tests |
| Quality gate | lint 0, typecheck pass, build pass |

## Active: PTE Pivot

### Phase 1 — Data model skeleton ✅

- [x] Replace `SpeakingSession` / `ChatMessage` with `PracticeTask` in `src/types/index.ts`
- [x] Replace `SessionFeedback` with `TaskFeedback` (generic envelope + `details`)
- [x] Update Supabase schema: `practice_tasks` table SQL documented in `supabase-task-history.ts`; apply via Supabase SQL editor
- [x] New storage modules: `task-history.ts`, `supabase-task-history.ts`, `unified-task-history.ts`
- [x] New `task-weakness.ts` — derives `TaskTypeWeakness` from `PracticeTask` history
- [x] Update `recommendations.ts` — added `getPteRecommendations` using task-type weakness
- [x] Delete `/shadowing` route and all shadowing components/hooks

## Next Phase

**Resume point (2026-06-07):** Phase 3 fully complete. Phase 4 (Mock Exam) is next — `/mock` entry point and orchestrator are not yet built.

What's done (Phase 3):
- `/history` rewritten — `PracticeTask` records, task-type filter, search, detail view, CSV/JSON export
- `/stats` rewritten — task-type weakness `WeaknessBar` rows, practice distribution, weekly activity
- `src/lib/task-bank.ts` created and wired into all 6 generating task pages
- 5s min-recording guard on all 4 spoken task pages (Stop/Done button disabled + countdown label)
- `clearAllTasksLocal` added to `src/lib/unified-task-history.ts`
- Supabase `practice_tasks` SQL documented in `src/lib/supabase-task-history.ts` — **must be applied manually via Supabase SQL editor before cloud save works**

What's next (Phase 4):
- [ ] Apply `practice_tasks` Supabase SQL (top of `src/lib/supabase-task-history.ts`) — prerequisite for cloud save on all tasks
- [ ] `src/app/mock/page.tsx` — mock exam entry and task orchestrator; sequences all 7 task types in PTE order
- [ ] Strict timing in mock mode: auto-submit response when window expires; no stop button
- [ ] `src/app/mock/summary/page.tsx` — end-of-exam summary aggregating feedback across all task types

Key files to open first:
- `src/types/index.ts` — `PteTaskType`, `PracticeTask` (task sequence and data shape)
- `src/app/practice/read-aloud/page.tsx` — reference state machine for spoken tasks
- `src/app/practice/write-essay/page.tsx` — reference state machine for written tasks
- `src/lib/unified-task-history.ts` — `saveTask`, `getTasks` for collecting mock exam results

---

### Phase 2 — Task type implementations (vertical slices)

Each slice: stimulus display → timed response → AI feedback → save → history entry

- [x] Read Aloud (AI text + Azure Pronunciation Assessment) — `/practice/read-aloud`
- [x] Repeat Sentence (Azure TTS audio + Azure Pronunciation Assessment) — `/practice/repeat-sentence`
- [x] Answer Short Question (AI question + spoken response) — `/practice/answer-short-question`
- [x] Summarize Written Text (AI passage + typed response) — `/practice/summarize-written-text`
- [x] Write Essay (AI prompt + typed response) — `/practice/write-essay`
- [x] Personal Introduction (fixed prompt + spoken response, unscored) — `/practice/personal-intro`
- [x] Write from Dictation (Azure TTS audio + typed response) — `/practice/write-from-dictation`

### Phase 3 — Practice infrastructure

- [x] `/practice` task-type selection page — hub grid live
- [x] History page updated for `PracticeTask` records — task-type filter, search, detail view, export
- [x] Stats page updated for task-type weakness dimensions — ranked `WeaknessBar` rows, distribution chart
- [x] Task Bank module created — `src/lib/task-bank.ts`
- [x] Task Bank wired into all 6 generating task pages (personal-intro skipped — fixed prompt)
- [x] Timing enforcement — `MIN_REC_SECONDS = 5` guard on all 4 spoken task pages; Stop/Done button disabled + countdown label for first 5s

### Phase 4 — Mock exam

- [ ] `/mock` entry point
- [ ] Full task sequence following PTE Academic order
- [ ] Strict timing mode
- [ ] End-of-exam summary report

### Phase 5 — Deferred task types

- [ ] Describe Image (requires image stimulus library)
- [ ] Re-tell Lecture (requires audio lecture library)

### Phase 6 — Agent Architecture (Portfolio Design)

Design complete (see `docs/agent-architecture.md` and `docs/PROJECT_CONTEXT.md`). Implementation pending.

- [ ] Scoring Agent — per-dimension scores (10–90, PTE-aligned); Speaking scores labelled "for reference only"
- [ ] Diagnosis Agent — Task-Type Weakness derivation (already partially implemented in `task-weakness.ts`)
- [ ] Coach Agent — targeted suggestions per weak Task Type
- [ ] LLM-as-Judge — independent re-evaluation; trigger when any dimension diverges > 15 points; log disagreement cases
- [ ] Learner profile — Task-Type-keyed weakness profile driving adaptive task selection
- [ ] Learning trajectory visualisation — radar chart, progress curve, gap analysis vs. target score

### Phase 7 — Extended Task Types (Planned)

- [ ] Reading section: Fill in the Blanks, Re-order Paragraphs, Multiple Choice
- [ ] Listening section: Summarize Spoken Text, Fill in the Blanks (Listening), Highlight Correct Summary
- [ ] Speaking section: Describe Image (requires image stimulus library), Re-tell Lecture (requires audio lecture library)

## Future / Backlog

- Payment / subscriptions / commercial operations
- Leaderboards / learning groups / social sharing
- Full mobile redesign
- Real API E2E in CI
- Frontend framework migration
- Removing Next.js API Routes fallback

## Known Technical Debt

- Expand focused unit tests as new behaviour lands
- Keep `package-lock.json` synchronized with `package.json` for CI
- Local native binding signing issue may affect some startup paths (Next SWC / Vitest Rolldown)
- IELTS session data remains in Supabase — not surfaced in UI, no migration needed at current scale
