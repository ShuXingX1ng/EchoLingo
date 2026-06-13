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
| Design token completion | Done | `--border-strong` token; exam + settings fully tokenized; Playwright visual verification passed |
| Phase RAG-1: Vector store + Rubrics | Done | `vector_store.py` (DashScope embeddings + vecs), `rag.py` (retrieve_context), 5 YAML rubrics, seed script, 6 unit tests — 105 existing tests unaffected |
| Phase i18n-Fix: 中文模式 UI 修复 | Done | 3 missing locale keys added (en+zh); 13 IELTS-legacy zh.json strings → PTE wording; 2 lint errors fixed in `MicrophoneMonitor.tsx` |
| Phase RAG-2: LangGraph feedback pipeline | Done | `feedback_graph.py` (6-node StateGraph, parallel fan-out, divergence retry, RAG injection); `pte_feedback.py` simplified to router-only; 21 new graph tests; all 42 stale tests fixed; 132/132 backend tests pass |
| Phase RAG-3: Complete rubric coverage + RAG wiring (code) | Done | All 15 task-type rubric YAMLs authored; `setup_pgvector.sql`; env vars documented; structured divergence-rate logging in `finalize_node`; `test_rubrics.py` (18 tests); 150/150 backend tests pass. |
| Phase Study-Aids-1: Word Lookup + Vocabulary List | Done | ECDICT import script + `services/ecdict.py` + `POST /api/word-lookup` (dict-first → DeepSeek fallback); `WordLookup` widget mounted on Task Practice only (excludes `/mock`); `/vocabulary` page; Supabase migration 003 + cloud-synced vocabulary libs; `backup.ts` vocabulary field. 10/10 word_lookup tests pass; tsc 0, eslint 0 on new files. See ADR 0006 |
| Phase Cleanup: IELTS 遗留代码清除 | Done | Removed IELTS examiner/feedback backend (routers, prompts/ielts, schemas, prompt_loader bits, 4 test files + trimmed 3 shared test files); deleted frontend setup/exam pages, api/examiner+feedback routes, feedback-actions; removed home-page IELTS daily-plan subsystem (learning-plan.ts, DailyTasks, LearningPath, FeedbackPanel/Review, dead stats.ts); MobileNav → /practice; home renders static PTE archive entry. Backend 123 pass, frontend 115 unit pass, lint 0/typecheck/build green. Legacy history/backup island (history.ts, unified-history.ts, supabase-history.ts, DataMigration, SessionFeedback type) intentionally retained per ADR/backup-compat |
| Phase: 前后端彻底分离 | Done | Migrated all Next.js API business routes (`/api/pte/stimulus`, `/api/pte/feedback`, `/api/read-aloud/*`, `/api/tts`, `/api/pronunciation`, `/api/word-lookup`) to FastAPI; deleted Next.js routes; enforced `NEXT_PUBLIC_API_BASE_URL`; removed backend secrets (`LLM_*`, `AZURE_SPEECH_*`) from Next.js config; 112/112 unit tests, lint 0, typecheck/build pass. |
| Live Infra Verification | Done | Ran `supabase-migration-003.sql` and `setup_pgvector.sql`; configured `SUPABASE_DB_URL`; seeded 53 RAG rubric chunks using DashScope `text-embedding-v4` (1024 dims); imported 3.4M entries for ECDICT; successfully passed Python integration test for RAG retrieval. |
| Circuit Breaker & Fallback | Done | Added CircuitBreaker to `api-client.ts`, practice/mock error boundaries. |
## Current Test Baseline

| Suite | Count / Status |
|-------|----------------|
| Frontend unit | 11 files / 115 tests (setup/page + FeedbackPanel tests removed in Phase Cleanup) |
| E2E | 55 tests (14 smoke + 12 listening + 14 reading + 9 mock exam + 6 other) |
| Backend | 123 tests (after Phase Cleanup removed 27 IELTS tests) |
| Quality gate | lint 0, typecheck pass, build pass |

## Next Phase

**Resume point (2026-06-13):** Phase Data-1: Scraped stimulus bank — Build scraper pipeline for public PTE prep sources to replace/supplement AI generation.

What's done:
- Backend-unavailable degradation implemented (Circuit Breaker).
- Practice and Mock ErrorBoundaries added.
- API client tests updated and passing.

What's next:
- [ ] Identify public PTE prep sources (GitHub question banks, public blogs)
- [ ] Build scraper + AI-assisted cleaning pipeline
- [ ] Embed scraped stimuli into Supabase; wire into Task Bank as alternative to AI generation

Key files to open first:
- `src/lib/task-bank.ts`
- `backend/scripts/` (for creating scraper)

---

Legacy history/backup island intentionally retained: `src/lib/history.ts`, `unified-history.ts`, `supabase-history.ts`, `src/components/DataMigration.tsx`, and the `SessionFeedback`/`ChatMessage` types in `src/types/index.ts` — these back the IELTS-session backup/migration path and are not surfaced in the PTE UI (see "Known Technical Debt").

### Phase Data-1: Scraped stimulus bank (backlog)
- [ ] Identify public PTE prep sources (GitHub question banks, public blogs)
- [ ] Build scraper + AI-assisted cleaning pipeline
- [ ] Embed scraped stimuli into Supabase; wire into Task Bank as alternative to AI generation
- [ ] Evaluate dropping AI stimulus generation once bank reaches critical mass per task type

### Phase Cleanup: IELTS 遗留代码清除 — DONE (2026-06-13)
全部完成。前端 setup/exam 页面、`api/examiner`+`api/feedback` 路由、`feedback-actions.ts`、home 页 IELTS 每日计划子系统（`learning-plan.ts`、`DailyTasks`、`LearningPath`、`FeedbackPanel`/`FeedbackReview`、死代码 `stats.ts`）已删；`MobileNav` 改指 `/practice`；home 页改为静态 PTE archive 入口。后端 examiner/feedback 路由、`prompts/ielts/`、schemas 中 5 个 IELTS 类、`prompt_loader` 的 IELTS 部分、4 个 IELTS 测试文件删除，另修剪 3 个共享测试文件（`test_error_handling`/`test_health`/`test_middleware_integration`）的 examiner/feedback 用例，CORS 探针改指 `/api/pte/feedback`。

**已验收：** 后端 `pytest` 123 通过；前端 lint 0 / typecheck / build / 115 unit 通过。

**有意保留（不在本次范围）：** legacy 历史/备份孤岛 `src/lib/history.ts`、`unified-history.ts`、`supabase-history.ts`、`src/components/DataMigration.tsx` 及 `src/types/index.ts` 的 `SessionFeedback`/`ChatMessage` 类型 —— 支撑 IELTS-session 备份/迁移，未在 PTE UI 暴露（见 Known Technical Debt）。`recommendations.ts` 的 legacy `getRecommendations` 现已无调用方，但与 `getPteRecommendations` 同处一文件，保留待后续。

## Future / Backlog

- Phase Data-1: Scraped stimulus bank (see above)
- Payment / subscriptions / commercial operations
- Leaderboards / learning groups / social sharing
- Full mobile redesign
- Real API E2E in CI
- Frontend framework migration

## Known Technical Debt

- Expand focused unit tests as new behaviour lands
- Keep `package-lock.json` synchronized with `package.json` for CI
- Local native binding signing issue may affect some startup paths (Next SWC / Vitest Rolldown)
- IELTS session data remains in Supabase — not surfaced in UI, no migration needed at current scale
