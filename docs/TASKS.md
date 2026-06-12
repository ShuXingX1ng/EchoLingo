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

## Current Test Baseline

| Suite | Count / Status |
|-------|----------------|
| Frontend unit | 13 files / 122 tests |
| E2E | 55 tests (14 smoke + 12 listening + 14 reading + 9 mock exam + 6 other) |
| Backend | 132 tests (111 original + 21 new graph tests) |
| Quality gate | lint 0, typecheck pass, build pass |

## Next Phase

**Resume point (2026-06-13):** Phase RAG-2 complete. LangGraph `StateGraph` pipeline is live in `backend/services/feedback_graph.py`; `pte_feedback.py` router is reduced to validation + `run_feedback_graph` call; 132/132 backend tests pass. Ready for Phase RAG-3 (wire live Supabase pgvector into the graph) or Phase Cleanup (remove IELTS legacy code).

What's done:
- All 15 PTE task types live with full practice + mock exam flows
- Design token system complete across every page
- 122 frontend unit tests + 55 E2E tests + 132 backend tests passing
- `backend/services/feedback_graph.py` — 6-node LangGraph StateGraph: `retrieve_context` → (`call_primary` ‖ `call_judge`) → `check_divergence` → `retry_primary` → `finalize`; RAG rubric injection; `run_feedback_graph(request)->dict`
- `backend/services/vector_store.py` — lazy `vecs` import (try/except); DashScope embeddings
- `backend/services/rag.py` — `retrieve_context(task_type) -> str` with silent fallback
- `backend/tests/test_feedback_graph.py` — 21 node-level unit tests + E2E graph tests

What's next (Phase RAG-3):
- [ ] Enable pgvector extension in Supabase dashboard SQL editor; create `rubric_chunks` table
- [ ] Run `python backend/scripts/seed_rubrics.py` to populate vector store (requires `DASHSCOPE_API_KEY` + `SUPABASE_DB_URL`)
- [ ] Integration smoke: call `POST /api/pte/feedback` with env vars set; confirm `retrieved_context` non-empty in graph logs
- [ ] Add rubric YAML files for remaining task types (describe_image, re_tell_lecture, re_order_paragraphs, multiple_choice_reading, summarize_spoken_text, fill_in_the_blanks_listening, highlight_correct_summary, write_from_dictation, answer_short_question, personal_intro)
- [ ] Monitor Judge divergence rate before/after RAG as quality metric

Key files to open first:
- `backend/services/feedback_graph.py` — main graph implementation
- `backend/scripts/seed_rubrics.py` — run to populate vector store
- `backend/data/rubrics/` — YAML rubric files (5 done, 10 remaining)
- `docs/adr/0005-langgraph-rag-refactor.md` — architecture rationale

### Phase RAG-3: Wire RAG into graph
- [ ] `retrieve_context` node calls `rag.py`; retrieved rubrics injected into Scoring Agent system prompt
- [ ] Integration test: feedback quality with vs. without RAG context (manual eval)
- [ ] Monitor Judge divergence rate before/after as quality metric

### Phase Data-1: Scraped stimulus bank (backlog)
- [ ] Identify public PTE prep sources (GitHub question banks, public blogs)
- [ ] Build scraper + AI-assisted cleaning pipeline
- [ ] Embed scraped stimuli into Supabase; wire into Task Bank as alternative to AI generation
- [ ] Evaluate dropping AI stimulus generation once bank reaches critical mass per task type

### Phase Cleanup: IELTS 遗留代码清除
前提：必须先修 MobileNav，断开通往 IELTS 流程的入口，再整体删除。

**Step 1 — 断链（先做）：**
- [ ] `src/components/MobileNav.tsx` 第 62 行：`/practice/setup` 改为 `/practice`

**Step 2 — 整体删除（断链后）：**
- [ ] `src/app/practice/setup/page.tsx` + `src/app/practice/setup/page.test.tsx`
- [ ] `src/app/practice/exam/page.tsx`
- [ ] `src/lib/feedback-actions.ts`
- [ ] `src/app/api/examiner/route.ts`
- [ ] `src/app/api/feedback/route.ts`
- [ ] `backend/routers/examiner.py`
- [ ] `backend/routers/feedback.py`
- [ ] `backend/prompts/ielts/`（整个目录）
- [ ] `backend/tests/test_examiner.py`
- [ ] `backend/tests/test_feedback.py`
- [ ] `backend/tests/test_integration_examiner.py`
- [ ] `backend/tests/test_integration_feedback.py`
- [ ] `backend/models/schemas.py`：删除 `ChatMessage`、`ExaminerRequest`、`ExaminerResponse`、`FeedbackRequest`、`SessionFeedback` 类
- [ ] `backend/main.py`：移除 `examiner`、`feedback` 的 import 和 router 注册

**验收：**`cd backend && pytest` 通过（删除后测试数从 105 减少是正常的）

Key files to open first:
- `docs/adr/0005-langgraph-rag-refactor.md` — full architecture rationale
- `backend/routers/pte_feedback.py` — current pipeline to be replaced
- `backend/services/llm_chain.py` — retained as low-level LLM utility

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
