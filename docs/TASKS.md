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
| Phase 4: Mock exam | Done | `/mock` orchestrator (7-task PTE sequence, strict timing); `/mock/summary` (per-task breakdown, weaknesses, pronunciation avg); 7 `MockXxx` components in `src/components/mock/` |
| Phase 5: Deferred task types | Done | `/practice/describe-image` (image bank, 25s prep, 40s record); `/practice/re-tell-lecture` (AI text → Azure TTS, play → 10s prep → 40s record); `src/lib/image-bank.ts`; API extended; `PteTaskType` + all lookup tables updated |
| Phase 6: Agent Architecture (core pipeline) | Done | Scoring Agent + Coach Agent + LLM-as-Judge in `feedback/route.ts`; Diagnosis Agent (per-dimension) in `task-weakness.ts`; new types in `src/types/index.ts`; `TaskFeedbackDisplay` updated |
| Phase 7: Reading section (3 task types) | Done | Fill in the Blanks, Re-order Paragraphs, Multiple Choice (Reading); `ReadingDimensionScores`; reading scoring in feedback pipeline; all lookup tables updated |

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

**Resume point (2026-06-07):** Phase 7 (Reading section) fully complete. Phase 8 (Listening extended types) is next.

What's done (Phase 7 — full):
- `src/types/index.ts` — `fill_in_the_blanks_reading`, `re_order_paragraphs`, `multiple_choice_reading` added to `PteTaskType`; `ReadingDimensionScores`; 3 new `TaskFeedbackDetails` subtypes
- `src/app/api/pte/stimulus/route.ts` — JSON prompts + `response_format: json_object` + 800-token limit for reading task types
- `src/app/api/pte/feedback/route.ts` — `SCORED_READING` set; reading system prompts, detail schemas, Judge prompt, score extraction, divergence check
- `src/lib/task-weakness.ts` — `ALL_TASK_TYPES`, `scoreFromTask`, `aggregateDimensions` extended for reading
- All `Record<PteTaskType, string>` lookups updated: `history/page.tsx`, `stats/page.tsx`, `mock/summary/page.tsx`, `recommendations.ts`
- `src/components/TaskFeedbackDisplay.tsx` — `DimensionScoresBlock` + `DetailsBlock` extended for reading types
- `src/app/practice/fill-in-the-blanks/page.tsx` — inline dropdown blanks, 7 min timer, task bank, saveTask
- `src/app/practice/re-order-paragraphs/page.tsx` — HTML5 drag-and-drop + arrow button fallback, 3 min timer, task bank, saveTask
- `src/app/practice/multiple-choice/page.tsx` — radio buttons, 5 options, 4 min timer, task bank, saveTask
- `src/app/practice/page.tsx` — "Reading" section added with 3 task cards

What's next (Phase 8 — Listening extended types):
- [ ] Summarize Spoken Text — key file: `src/app/practice/summarize-spoken-text/page.tsx` (new); needs Azure TTS audio + transcript → written summary
- [ ] Fill in the Blanks (Listening) — key file: `src/app/practice/fill-in-the-blanks-listening/page.tsx` (new); audio playback + dropdown blanks
- [ ] Highlight Correct Summary — key file: `src/app/practice/highlight-correct-summary/page.tsx` (new); audio + select best summary from options

Key files to open first for Phase 8:
- `src/types/index.ts` — extend `PteTaskType` and add new `TaskFeedbackDetails` subtypes
- `src/app/api/pte/stimulus/route.ts` — add listening stimulus prompts
- `src/app/api/pte/feedback/route.ts` — add listening system prompts + detail schemas
- `src/app/practice/re-tell-lecture/page.tsx` — reference for Azure TTS + listen → respond pattern
- `src/app/practice/fill-in-the-blanks/page.tsx` — reference for JSON stimulus parsing pattern

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

### Phase 4 — Mock exam ✅

- [x] `/mock` entry point — intro screen, 7-task PTE sequence, progress bar, sessionStorage handoff to summary
- [x] Full task sequence following PTE Academic order — 7 `MockXxx` components in `src/components/mock/`
- [x] Strict timing mode — no stop button on speaking tasks; writing tasks auto-submit on timeout, allow early submit
- [x] End-of-exam summary report — `/mock/summary`: per-task feedback, top weaknesses, avg pronunciation score, practice links

### Phase 5 — Deferred task types ✅

- [x] Describe Image — hardcoded image bank (`src/lib/image-bank.ts`), `/practice/describe-image`
- [x] Re-tell Lecture — AI text + Azure TTS, `/practice/re-tell-lecture`

### Phase 6 — Agent Architecture (Portfolio Design)

- [x] Scoring Agent — per-dimension scores (0–100 internal scale, for reference only); speaking: fluency/pronunciation/content; writing: grammar/vocabulary/form/content
- [x] Diagnosis Agent — `aggregateDimensions` in `task-weakness.ts`; `TaskTypeWeakness.dimensions` populated
- [x] Coach Agent — `coachSuggestions` in feedback response; targeted per-dimension tips
- [x] LLM-as-Judge — independent parallel call; >15-point divergence triggers retry + `judgeLog`
- [x] Learner profile — `WeaknessBar` expandable sub-dimension bars; "Learner Profile" section with SVG radar + speaking/writing tab; target slider + gap analysis
- [x] Learning trajectory visualisation — radar chart overlay (actual vs target); score trajectory line chart per task type with pill selector

### Phase 7 — Extended Task Types (Reading) ✅

- [x] Reading section: Fill in the Blanks — `/practice/fill-in-the-blanks`
- [x] Reading section: Re-order Paragraphs — `/practice/re-order-paragraphs`
- [x] Reading section: Multiple Choice — `/practice/multiple-choice`

### Phase 8 — Extended Task Types (Listening, Planned)

- [ ] Summarize Spoken Text — `/practice/summarize-spoken-text`
- [ ] Fill in the Blanks (Listening) — `/practice/fill-in-the-blanks-listening`
- [ ] Highlight Correct Summary — `/practice/highlight-correct-summary`

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
