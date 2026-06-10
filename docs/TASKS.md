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
| Phase 8: Listening extended types (3 task types) | Done | Summarize Spoken Text, Fill in the Blanks (Listening), Highlight Correct Summary; `ListeningDimensionScores`; listening scoring pipeline; all lookup tables updated |
| Mock exam extension | Done | Added the 3 extended Listening task types to `/mock`; 10-task sequence now saves to `/mock/summary` |
| E2E — Listening task types | Done | 12 Playwright tests for Summarize Spoken Text, FIB-Listening, Highlight Correct Summary; `mockAudioAutoEnd` helper added |
| FastAPI backend parity | Done | `POST /api/pte/stimulus` + `POST /api/pte/feedback` in FastAPI; all 15 task types; LLM-as-Judge pipeline; 19 new backend tests (105 total) |
| Stats Listening profile | Done | `listeningProfile` (comprehension + accuracy) added to radar chart / gap analysis; 3-tab switcher (speaking/writing/listening) |
| Mock exam Reading section | Done | `MockFillInTheBlanksReading`, `MockReOrderParagraphs`, `MockMultipleChoiceReading`; `/mock` now 13-task sequence covering all 4 PTE sections |
| Mock exam Describe Image + Re-tell Lecture | Done | `MockDescribeImage`, `MockReTellLecture`; `/mock` now 15-task sequence covering all 15 PTE task types |
| E2E — Reading practice pages | Done | `e2e/reading-tasks.spec.ts`; 14 tests for FIB-Reading, Re-order Paragraphs, Multiple Choice |
| E2E — Mock exam full flow | Done | `e2e/mock-exam.spec.ts`; 9 tests — intro screen, Start→task-1 transition, summary with injected 15-task session |
| Unit test expansion | Done | 40 new tests across `task-weakness.test.ts` (14), `task-bank.test.ts` (14), `unified-task-history.test.ts` (14); total 122 unit tests |
| Smoke test PTE rewrite | Done | `e2e/smoke.spec.ts` rewritten: all stale IELTS routes removed; 14 PTE-focused P0/P1/P2 smoke tests |
| UI redesign — learning platform aesthetic | Done | DM Serif Display + DM Sans fonts; redesigned DesktopNav + MobileNav; home page stats bar + 4-card feature grid + staggered animations |
| UI token pass — remaining pages | Done | `var(--surface)` / `var(--border)` / `var(--brand)` tokens applied to `/practice/setup`, `/history`, `/stats`; all hardcoded slate colors replaced |
| UI token pass — all 15 practice task pages | Done | All 15 practice task pages tokenized; 401 token usages; bold-card borders intentionally kept; typecheck clean |

## Current Test Baseline

| Suite | Count / Status |
|-------|----------------|
| Frontend unit | 13 files / 122 tests |
| E2E | 55 tests (14 smoke + 12 listening + 14 reading + 9 mock exam + 6 other) |
| Backend | 105 tests |
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

**Resume point (2026-06-10):** Design token pass complete across all pages — all 15 practice task pages, nav, home, history, stats now use CSS variable tokens; typecheck clean.

What's done:
- UI token pass: all 15 practice task pages — `bg-white`, `bg-slate-*`, `border-slate-*`, `text-slate-*` replaced with `var(--surface)` / `var(--background)` / `var(--border)` / `var(--foreground)` / `var(--text-secondary)` / `var(--text-muted)` tokens (401 total usages)
- Bold-card borders (`border-slate-900 dark:border-white/15`) intentionally kept as design elements
- Functional state colors (red recording, emerald brand, amber warning) untouched

What's next:
- [ ] Smoke test visual changes in browser (dark mode + light mode) — check all 15 task pages render correctly
- [ ] Check `src/app/practice/exam/page.tsx` — may still have untokenized patterns; tokenize if needed
- [ ] Consider a `/settings` page styled to the same token system — key file: `src/app/settings/page.tsx` (if it exists)
- [ ] Consider converting bold-card borders to a new `--border-strong` token for full consistency

Key files to open first:
- `src/app/globals.css` — token definitions (`--surface`, `--border`, `--brand`, `--foreground`, etc.)
- `src/app/page.tsx` — canonical visual pattern for reference
- `src/app/practice/read-aloud/page.tsx` — representative tokenized task page

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

- [x] `/mock` entry point — intro screen, 10-task PTE sequence, progress bar, sessionStorage handoff to summary
- [x] Full task sequence following PTE Academic order — 10 `MockXxx` components in `src/components/mock/`
- [x] Strict timing mode — no stop button on speaking tasks; writing tasks auto-submit on timeout, allow early submit
- [x] End-of-exam summary report — `/mock/summary`: per-task feedback, top weaknesses, avg pronunciation score, practice links
- [x] Extended Listening tasks — Summarize Spoken Text, Fill in the Blanks (Listening), Highlight Correct Summary added to `/mock`

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

### Phase 8 — Extended Task Types (Listening) ✅

- [x] Summarize Spoken Text — `/practice/summarize-spoken-text`
- [x] Fill in the Blanks (Listening) — `/practice/fill-in-the-blanks-listening`
- [x] Highlight Correct Summary — `/practice/highlight-correct-summary`

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
