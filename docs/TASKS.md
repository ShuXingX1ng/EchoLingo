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
| Phase 2: All task slices | Done | All 15 task routes live; shared `/api/pte/stimulus` + `/api/pte/feedback`; `TaskFeedbackDisplay`; `wav-encoder` |
| Phase 3: Practice infrastructure | Done | `/history` + `/stats` rewritten for PTE; `task-bank.ts`; 5s min-recording guard |
| Phase 4: Mock exam | Done | 15-task sequence across all 4 PTE sections; `/mock/summary`; strict timing |
| Phase 5: Deferred task types | Done | Describe Image + Re-tell Lecture |
| Phase 6: Agent Architecture | Done | Scoring Agent + Coach Agent + LLM-as-Judge + Diagnosis Agent |
| Phase 7: Reading section | Done | Fill in the Blanks, Re-order Paragraphs, Multiple Choice (Reading) |
| Phase 8: Listening extended types | Done | Summarize Spoken Text, FIB-Listening, Highlight Correct Summary |
| FastAPI backend parity | Done | `POST /api/pte/stimulus` + `POST /api/pte/feedback`; all 15 task types; 105 backend tests |
| Stats Listening profile | Done | `listeningProfile` (comprehension + accuracy); 3-tab switcher |
| Unit test expansion | Done | 122 frontend unit tests across 13 files |
| E2E suite | Done | 55 tests (14 smoke + 12 listening + 14 reading + 9 mock exam + 6 other) |
| UI redesign | Done | DM Serif Display + DM Sans; design token pass across all pages |

## Current Test Baseline

| Suite | Count / Status |
|-------|----------------|
| Frontend unit | 13 files / 122 tests |
| E2E | 55 tests (14 smoke + 12 listening + 14 reading + 9 mock exam + 6 other) |
| Backend | 105 tests |
| Quality gate | lint 0, typecheck pass, build pass |

## Next Steps

- [x] Tokenize `src/app/practice/exam/page.tsx` — replaced all hardcoded slate classes with CSS variable tokens
- [x] Add `--border-strong` token to `globals.css` (light: `#0f172a`, dark: `rgba(255,255,255,0.15)`) and apply across all 16 practice pages
- [x] Tokenize `src/app/settings/page.tsx` — replaced all slate surface/border/text classes with tokens
- [ ] Smoke test visual changes in browser (dark mode + light mode) — check all practice pages render correctly

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
