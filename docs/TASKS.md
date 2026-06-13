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
| Phase RAG-3: Complete rubric coverage + RAG wiring (code) | Done | All 15 task-type rubric YAMLs authored; `setup_pgvector.sql`; env vars documented; structured divergence-rate logging in `finalize_node`; `test_rubrics.py` (18 tests); 150/150 backend tests pass. Live seeding + integration smoke deferred (need `DASHSCOPE_API_KEY` + `SUPABASE_DB_URL`) |
| Phase Study-Aids-1: Word Lookup + Vocabulary List | Done | ECDICT import script + `services/ecdict.py` + `POST /api/word-lookup` (dict-first → DeepSeek fallback); `WordLookup` widget mounted on Task Practice only (excludes `/mock`); `/vocabulary` page; Supabase migration 003 + cloud-synced vocabulary libs; `backup.ts` vocabulary field. 10/10 word_lookup tests pass; tsc 0, eslint 0 on new files. See ADR 0006 |
| Phase Cleanup: IELTS 遗留代码清除 | Done | Removed IELTS examiner/feedback backend (routers, prompts/ielts, schemas, prompt_loader bits, 4 test files + trimmed 3 shared test files); deleted frontend setup/exam pages, api/examiner+feedback routes, feedback-actions; removed home-page IELTS daily-plan subsystem (learning-plan.ts, DailyTasks, LearningPath, FeedbackPanel/Review, dead stats.ts); MobileNav → /practice; home renders static PTE archive entry. Backend 123 pass, frontend 115 unit pass, lint 0/typecheck/build green. Legacy history/backup island (history.ts, unified-history.ts, supabase-history.ts, DataMigration, SessionFeedback type) intentionally retained per ADR/backup-compat |

## Current Test Baseline

| Suite | Count / Status |
|-------|----------------|
| Frontend unit | 11 files / 115 tests (setup/page + FeedbackPanel tests removed in Phase Cleanup) |
| E2E | 55 tests (14 smoke + 12 listening + 14 reading + 9 mock exam + 6 other) |
| Backend | 123 tests (after Phase Cleanup removed 27 IELTS tests) |
| Quality gate | lint 0, typecheck pass, build pass |

## Next Phase

**Resume point (2026-06-13):** Phase Study-Aids-1 (Word Lookup + Vocabulary List) **code** complete — backend translation chain (ECDICT dict-first → DeepSeek fallback) verified live, frontend widget + `/vocabulary` page + Supabase migration 003 in place. Remaining items are **live-infra / verification**: run migration 003 in Supabase, set `NEXT_PUBLIC_API_BASE_URL` so the proxy reaches the FastAPI backend, run the import script on deploy, and browser-test selection/drag-drop end-to-end. Other open code-side option: Phase Data-1 (scraped stimulus bank).

What's done (Study-Aids-1):
- `backend/scripts/import_ecdict.py` — downloads ECDICT 1.0.28 sqlite from GitHub → gitignored `backend/data/ecdict.sqlite` (verified: 3.4M entries)
- `backend/services/ecdict.py` — read-only single-word lookup; parses pos-grouped meanings + maps exam tags
- `backend/prompts/word_lookup/prompts.yaml` + loader registration — DeepSeek fallback (JSON mode, low temp/tokens)
- `backend/routers/word_lookup.py` — `POST /api/word-lookup`; clean → single-word→ECDICT (miss→DeepSeek) / phrase→DeepSeek; unified `{source,text,phonetic,entries,tags}` schema
- `backend/tests/test_word_lookup.py` — 10 tests (routing, cleaning, validation, ECDICT parse units) — all pass
- `src/app/api/word-lookup/route.ts` — proxy → FastAPI (`NEXT_PUBLIC_API_BASE_URL`)
- `src/lib/word-lookup.ts` + types `WordLookupResult`/`WordLookupEntry`/`VocabularyEntry`
- `src/components/WordLookup.tsx` — selection "译" button + desktop drag-drop → one-shot card (原文/音标/分词性释义/考试标签 + 收藏)
- `src/app/practice/layout.tsx` — mounts the widget on Task Practice pages only (Mock Exam at `/mock` excluded by construction)
- `src/lib/{vocabulary,supabase-vocabulary,unified-vocabulary}.ts` — cloud-synced Vocabulary List with localStorage fallback
- `supabase-migration-003.sql` — `vocabulary` table + RLS + case-insensitive unique index
- `src/app/vocabulary/page.tsx` — view + delete (no SRS in v1)
- `src/lib/backup.ts` — `vocabulary` field added to `BackupData` (create/validate/import)

What's next:
- [ ] Run `supabase-migration-003.sql` in the Supabase dashboard SQL editor (creates `vocabulary` table + RLS)
- [ ] Set `NEXT_PUBLIC_API_BASE_URL` to the FastAPI base URL so `/api/word-lookup` can reach ECDICT (the proxy returns 503 if unset)
- [ ] Run `cd backend && python scripts/import_ecdict.py` on any fresh deploy (data file is gitignored)
- [ ] Browser-test: selection "译" button (mobile + desktop), desktop drag-drop, save → `/vocabulary`, logged-in cloud sync vs logged-out localStorage
- [ ] Optional: add a `/vocabulary` entry point to `DesktopNav`/`MobileNav` (currently reachable only via the Word Lookup card link)

Key files to open first:
- `docs/adr/0006-word-lookup-translation-source.md` — full design + decision rationale
- `backend/routers/word_lookup.py` — translation routing
- `src/components/WordLookup.tsx` — widget capture + card UI
- `src/lib/unified-vocabulary.ts` — cloud/local vocabulary entry point
- `supabase-migration-003.sql` — run in Supabase before cloud sync works

---

### Phase RAG-3 — live infra (deferred, needs real credentials)
- [ ] Run `backend/scripts/setup_pgvector.sql` in the Supabase dashboard SQL editor (enables `vector` extension; `vecs` auto-creates `rubric_chunks`)
- [ ] Set `DASHSCOPE_API_KEY` + `SUPABASE_DB_URL`, then `cd backend && python scripts/seed_rubrics.py` to populate the vector store
- [ ] Integration smoke: call `POST /api/pte/feedback` with env vars set; confirm `rag_chars > 0` in the `[feedback-graph]` log line
- [ ] Manual eval: feedback quality and Judge divergence rate with vs. without RAG context

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
- Removing Next.js API Routes fallback

## Known Technical Debt

- Expand focused unit tests as new behaviour lands
- Keep `package-lock.json` synchronized with `package.json` for CI
- Local native binding signing issue may affect some startup paths (Next SWC / Vitest Rolldown)
- IELTS session data remains in Supabase — not surfaced in UI, no migration needed at current scale
