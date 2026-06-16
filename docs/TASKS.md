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
| Phase Data-1: Embed + dedup | Done | `backend/scripts/embed_exemplars.py` — read `status=accept` clean entries, `id=sha256(text)`, DashScope embed, per-`task_type` near-dup drop (cosine ≥ 0.95), idempotent `ON CONFLICT (id) DO UPDATE` upsert via `psycopg2`/`SUPABASE_DB_URL`; `--force`/`--source`; 28 tests (embed+DB mocked); 211/211 backend pytest, lint 0 |
| Phase Data-1: Serving + originality guard | Done | `exemplar_store.py` (random/targeted/theme + single-SQL RRF hybrid + `get_verbatim`); `originality.py` (4-gram shingle Jaccard); `stimulus_service.py` (three-tier fallback + guard); `PteStimulusRequest` extended (`mode/topic/targeting/verbatim`); router kept thin; `scripts/eval_originality.py` (offline); 36 new tests; 247/247 backend pytest, ruff 0 |
| Phase i18n-2: All 15 practice task pages fully internationalised | Done | ~180 keys added to `en.json`+`zh.json` (`practiceTask.common.*` + `practiceTask.<slug>.*`); all 15 pages use `useTranslation`+`t()`; `useCallback` deps updated; PTE proper nouns in h1/breadcrumb kept hardcoded; lint 0, 112/112 unit tests, build pass |
| Phase Data-1 Frontend: Theme Practice + Targeted Practice | Done | `practice-mode.ts` (URL param parser + extras builder, 12 tests); `/practice` hub — Theme Practice UI (input + 6 chips, dynamic hrefs), Targeted Practice (top-3 weakness cards); mode/topic pass-through + cache bypass in all 13 practice pages; 18 new i18n keys (en+zh); lint 0, typecheck pass, 124/124 unit tests, build pass |
| Bug fix: Theme input Enter key + topic pass-through in pure-AI path | Done | (1) `/practice` hub input: added `onKeyDown` Enter handler → smooth-scrolls to task section + added `taskSectionRef` anchor div. (2) `backend/services/stimulus_service.py` pure-AI path (Tier 2/3) now injects topic when `mode=theme` (was silently ignored when exemplar bank empty). |
| Phase Data-2: Live Exemplar Ingestion | Done | Extended WikipediaAdapter; scraped, cleaned, and embedded 1478 Wikipedia exemplars; verified originality guard and serving layer |
| Phase Data-3: Expand Ingestion (4 new task types + JijingAdapter) | Done | WikipediaAdapter extended for repeat_sentence, write_from_dictation, answer_short_question, describe_image; JijingAdapter created (public code, gitignored data); 45/45 tests pass; live embed: Upserted=2690, DB now 4168 rows covering all 9 text/audio task types |
| Phase Data-4: JSON task type exemplar banks | Done | Evaluated all 5 JSON task types; 5 LENGTH_GATES + WikipediaAdapter 14 task types; live embed Upserted=3767, DB now 7935 rows; re_order_paragraphs first 79 rows live; 292/292 tests |
| Migration 005: composite PK (id, task_type) | Done | `supabase-migration-005.sql` applied; cleaner + embed_exemplars updated; re-pipeline Upserted=6070; DB now **14,005 rows** across all 14 task types; all 5 JSON task types have Exemplar banks |
| Optimize near-dedup in embed_exemplars.py | Done | Replaced O(n²) Python list copy + loop with BLAS matrix ops; pre-normalised existing matrix + pre-allocated kept buffer; 292/292 tests pass |
| Architecture deepening (Candidate 1) — extract recording session + stimulus loader | Done | `useRecordingSession` hook, `loadStimulusText` util, shared `CountdownRing`; refactored read-aloud + repeat-sentence pages and Mock components; tsc 0 |
| Architecture deepening (Candidate 1) — migrate remaining 4 audio pages + 4 Mock components | Done | All 8 audio-recording files now use `useRecordingSession` + `loadStimulusText`; inline recording stacks eliminated; tsc 0 |
| Architecture deepening (Candidate 1) — migrate all 9 text-input practice pages to `loadStimulusText` | Done | All 9 text-input pages now use `loadStimulusText`; manual cache/API/store blocks removed; `practice-mode.ts` consumed only by `stimulus-loader.ts`; tsc 0 |
| Architecture deepening (C1 收尾) — `usePracticeTaskRunner` hook + 3 page + 3 Mock migrations | Done | Hook encapsulates phase SM / timer / stimulus / feedback / saveTask / audio recording. `write-essay`, `summarize-written-text`, `read-aloud` pages migrated; `MockWriteEssay`, `MockSummarizeWrittenText`, `MockReadAloud` migrated with `savedTask`→`onComplete`. JSON-stimulus + TTS-stimulus pages remain self-managed. tsc 0. |
| Architecture deepening (C1 完成) — `submit(overrides?)` + 3 JSON-stimulus pages + 3 Mock components | Done | Added `overrides?` param to `submit()` in hook; migrated `multiple-choice`, `re-order-paragraphs`, `fill-in-the-blanks` pages + `MockMultipleChoiceReading`, `MockReOrderParagraphs`, `MockFillInTheBlanksReading`; 3 pre-existing `onClick={submit}` callers fixed. 9 pages + 6 Mock components now use the hook. tsc 0. |
| Architecture deepening (C2) — Read Aloud backend unification | Done | Deleted `backend/routers/read_aloud.py`; removed `read_aloud` from `backend/main.py`; removed `randomEndpoint` from read-aloud page + MockReadAloud (now use `/api/pte/stimulus`); added `process_pronunciation_node` to LangGraph graph; `pron_context` field in `FeedbackState`; 294/294 backend pytest, tsc 0 |
| Architecture deepening (C3) — Task Type metadata registry | Done | Created `src/lib/task-type-registry.ts` (15-type registry with displayName/category/stimulusFormat/TimerConfig); `src/data/task-types.json` for Python backend; `task-weakness.ts` `ALL_TASK_TYPES` now imported from registry; `pte_feedback.py` + `pte_stimulus.py` load `VALID_TASK_TYPES` from JSON file; 294/294 backend pytest, tsc 0 |
| Architecture deepening (C4) — `createSyncedStore` factory | Done | New `src/lib/synced-store.ts`; `unified-task-history.ts` + `unified-vocabulary.ts` delegate save/listAll/delete to factory; external signatures unchanged; tsc 0, 124/124 unit tests |
| UI Visual Upgrade | Done | All 7 UI surfaces upgraded: globals.css tokens + body gradient; DesktopNav icon tiles; Home, Practice, Stats, History, Vocabulary, Settings pages unified to `rounded-[22px]`/`rounded-[28px]` card system + lucide icon tiles + section heading style; all `bg-[var(--background)]` outer-div overrides removed so body gradient shows through |

## Current Test Baseline

| Suite | Count / Status |
|-------|----------------|
| Frontend unit | 12 files / 124 tests |
| E2E | 55 tests (14 smoke + 12 listening + 14 reading + 9 mock exam + 6 other) |
| Backend | 294 tests (123 core + 101 scraper/cleaner + 28 embed_exemplars + 36 serving/originality + 6 new graph tests) |
| Quality gate | lint 0, typecheck pass, build pass |

## Current Status (as of 2026-06-15)

Architecture Candidates 1, 2, and 3 are **fully complete**.

- C1: `usePracticeTaskRunner` — 9 practice pages + 6 Mock components migrated; `submit(overrides?)` contract in place.
- C2: Read Aloud backend unified — `read_aloud.py` deleted; `process_pronunciation_node` added to LangGraph graph; read-aloud stimulus now served by `/api/pte/stimulus`.
- C3: Task Type registry — `src/lib/task-type-registry.ts` is the single metadata source; `src/data/task-types.json` consumed by Python backend to populate `VALID_TASK_TYPES` dynamically.

DB: 14,005 Stimulus Exemplar rows across all 14 task types; embed pipeline BLAS-accelerated.

## Next Phase

**Resume point (2026-06-16):** UI Visual Upgrade fully complete — all 7 surfaces (Home, Practice, DesktopNav, Stats, History, Vocabulary, Settings) now share the premium card system. Architecture Candidates 1–4 also complete.

What's done:
- UI Round 1 (Home + Practice + Nav): lucide-react installed; globals.css gradient body; DesktopNav icon tiles + inset-shadow active; Home glass metric card + Practice hero + color-coded task section cards
- UI Round 2 (Stats + History): removed `bg-[var(--background)]` body overrides; Stats page hero (`BarChart2`), section icon tiles (`AlertTriangle`/`Target`/`TrendingUp`); History page lucide `Search` + explicit `border-violet-200` hero card tokens
- UI Round 3 (Vocabulary + Settings): `vocabulary/page.tsx` outer-div bg override removed; hero card + `VocabularyCard` canonical tokens; `settings/page.tsx` outer-div bg override removed; new Settings hero card (`Settings2` indigo tile); Goals/Reminders/Voice/Account section cards canonical tokens + lucide icon tiles
- C1: `usePracticeTaskRunner` hook covering 9 pages + 6 Mock components; `submit(overrides?)` for JSON-stimulus pages
- C2: `backend/routers/read_aloud.py` deleted; `process_pronunciation_node` in `feedback_graph.py`; stimulus unified to `/api/pte/stimulus`
- C3: `src/lib/task-type-registry.ts` (TASK_TYPE_REGISTRY + ALL_TASK_TYPES + helpers); `src/data/task-types.json`; both Python routers load VALID_TASK_TYPES from JSON
- C4: `src/lib/synced-store.ts` factory; `unified-task-history.ts` + `unified-vocabulary.ts` delegate to factory; external APIs unchanged

What's next:
- [ ] **Populate JijingAdapter data** — place PTE recall data at `backend/data/jijing_raw/jijing.jsonl`, run full pipeline (`scrape → clean → embed`) — key file: `backend/scripts/scrape_exemplars/sources/jijing.py`
- [ ] **supabase-migration-006.sql** — `practice_tasks` table migration (file already created, needs applying to live DB)

Key files to open first:
- `src/lib/synced-store.ts` — new generic synced-store factory (C4)
- `src/lib/unified-task-history.ts` — delegates save/listAll/delete to factory
- `src/lib/unified-vocabulary.ts` — delegates save/listAll/delete to factory
- `backend/scripts/scrape_exemplars/sources/jijing.py` — JijingAdapter (public code, gitignored data)

Key resolved decisions (so we don't re-litigate):
- **Exemplars are retrieval-only**; default path generates an original Stimulus
  seeded by few-shot Exemplars. `verbatim=true` is a backend-only private path.
- **JSON task type exemplars** = passage-text anchors only; LLM still outputs full JSON structure.
  `json_mode=True` is preserved in `_generate`; few-shot injection is identical to text task types.
- **Code public, copyrighted recall data gitignored** (mirrors ECDICT). First
  adapter = Wikipedia/Simple Wikipedia (CC, clean); 机经 adapter comes later under
  the same `SourceAdapter` abstraction + gitignored ingestion.
- **Three retrieval modes** `random` (Task Practice + Mock) · `targeted` (Daily
  Plan engine) · `theme` (Theme Practice, the only hybrid-retrieval mode).
- **Storage** = explicit relational table `stimulus_exemplars` (migration 004),
  pgvector + `tsvector`, RRF hybrid; RLS enabled with no policies (PostgREST-deny; backend direct Postgres bypasses RLS).
- **AI generation demoted to fallback** (exemplar-grounded → empty-bank pure-AI →
  silent pure-AI on failure).

### Build order
- [x] **Migration 004** — `stimulus_exemplars` table (id `sha256(text)`, task_type,
      text, `embedding vector(1024)`, `tsv tsvector` + GIN, source_url, license,
      status, reason, difficulty, features, word_count, lang, created_at). → `supabase-migration-004.sql`
- [x] **Scraper** — `backend/scripts/scrape_exemplars/` with `SourceAdapter` base
      + first adapter (Wikipedia/Simple Wikipedia REST API) → `exemplars_raw/`
      (gitignored). Reuse `Samkarya/online-exam-questions` only as a JSON-parser
      shape reference for a future GitHub adapter.
- [x] **Cleaning** — `clean_exemplars.py`: deterministic rules (markup/citation
      strip, whitespace, English-only, per-task-type length gate, exact-hash
      dedup) + one cheap DeepSeek accept/reject gate (no rewrite). Print
      accepted/rejected + reject-reason metrics → `exemplars_clean/` (gitignored).
- [x] **Embed + dedup** — `embed_exemplars.py`: DashScope `text-embedding-v4`,
      near-dup drop (cosine ≥ 0.95 within task_type), idempotent
      `ON CONFLICT (id)` upsert. `--force` re-embed. → 28 tests, embed+DB mocked.
- [x] **Serving** — `backend/services/exemplar_store.py` (hybrid SQL + RRF +
      sampling) + `services/stimulus_service.py`; extended `PteStimulusRequest` with
      `mode/topic/targeting/verbatim`; three-tier fallback wired into
      `pte_stimulus.py` (kept router-thin; logic in the service).
- [x] **Originality guard** — generation-time word-shingle Jaccard (4-gram, >0.5)
      vs injected exemplars (over threshold → regenerate once) in
      `services/originality.py`; offline `scripts/eval_originality.py`.
- [x] **Frontend** — Theme Practice topic input on `/practice` (polished UI +
      common-theme chips), `mode=theme`; Targeted Practice reuses Daily Plan with
      `mode=targeted`; `task-bank.ts` unchanged (random path only; not used for theme).
- [x] **Tests** — exemplar_store random/targeted/theme + RRF fusion, three-tier
      fallback, shingle guard regeneration (36 new tests, all external calls mocked);
      cleaning rules + hash idempotency covered earlier. ruff 0 / pytest 247 green.


---

Legacy history/backup island intentionally retained: `src/lib/history.ts`, `unified-history.ts`, `supabase-history.ts`, `src/components/DataMigration.tsx`, and the `SessionFeedback`/`ChatMessage` types in `src/types/index.ts` — these back the IELTS-session backup/migration path and are not surfaced in the PTE UI (see "Known Technical Debt").

### Phase Data-1: Stimulus Exemplar bank
See **Next Phase → Build order** above for the resolved, ordered plan, and
ADR 0008 / ADR 0009 for the rationale. (This section intentionally no longer
duplicates the task list.)

### Phase Cleanup: IELTS 遗留代码清除 — DONE (2026-06-13)
全部完成。前端 setup/exam 页面、`api/examiner`+`api/feedback` 路由、`feedback-actions.ts`、home 页 IELTS 每日计划子系统（`learning-plan.ts`、`DailyTasks`、`LearningPath`、`FeedbackPanel`/`FeedbackReview`、死代码 `stats.ts`）已删；`MobileNav` 改指 `/practice`；home 页改为静态 PTE archive 入口。后端 examiner/feedback 路由、`prompts/ielts/`、schemas 中 5 个 IELTS 类、`prompt_loader` 的 IELTS 部分、4 个 IELTS 测试文件删除，另修剪 3 个共享测试文件（`test_error_handling`/`test_health`/`test_middleware_integration`）的 examiner/feedback 用例，CORS 探针改指 `/api/pte/feedback`。

**已验收：** 后端 `pytest` 123 通过；前端 lint 0 / typecheck / build / 115 unit 通过。

**有意保留（不在本次范围）：** legacy 历史/备份孤岛 `src/lib/history.ts`、`unified-history.ts`、`supabase-history.ts`、`src/components/DataMigration.tsx` 及 `src/types/index.ts` 的 `SessionFeedback`/`ChatMessage` 类型 —— 支撑 IELTS-session 备份/迁移，未在 PTE UI 暴露（见 Known Technical Debt）。`recommendations.ts` 的 legacy `getRecommendations` 现已无调用方，但与 `getPteRecommendations` 同处一文件，保留待后续。

## Future / Backlog

### Learning Experience

- **Phase SRS-1: 词汇 SRS（间隔重复）** — 基于 SM-2 算法为词汇表中每个单词计算下次复习时间；`/vocabulary` 页增加"开始复习"入口；后端新增 `POST /api/vocabulary/review` 端点记录复习结果；Supabase 存储 `next_review_at` + `ease_factor` + `interval_days`。可由 SRS Scheduling Agent 驱动（根据用户历史表现动态调整难度权重）。
- **Phase Streak-1: 每日目标 + 练习连击** — 用户可设定每日练习题数目标；主页/练习页显示当日进度环 + 连击天数；Supabase `daily_activity` 表记录每日完成数；连击断裂发送 PWA push notification 提醒。
- **Phase Onboarding-1: 新用户引导** — 首次登录触发三步引导：(1) 快速水平自测（2 道 Read Aloud + 1 道 Write Essay）；(2) Diagnosis Agent 生成初始弱项画像；(3) 展示个性化"入门学习路径"并直接跳转第一道练习题。Agent 机会：Onboarding Orchestrator Agent 串联评估→诊断→计划生成三步。
- **Phase Strategy-1: 题型解题策略内容** — 每个练习题页面增加可折叠"策略提示"面板，内容为静态 Markdown（15 种题型各一份）；后续可升级为 Strategy Coach Agent，根据用户当前弱项动态选取最相关的策略片段。
- **Phase AWL-1: 学术词汇表（AWL）覆盖情况** — 将 Academic Word List（570 词族）内置为静态数据；在 `/vocabulary` 页展示用户已掌握的 AWL 覆盖率（已学 / 570）；单词查询时标注"AWL"徽章。
- **Phase ModelAnswer-1: 对比示范答案** — 反馈页增加"查看示范"按钮：Read Aloud 用 Azure TTS 生成标准朗读音频供对比；Write Essay / SWT 用 DeepSeek 生成一份目标分数段的示范文本。可由 Model Answer Agent 驱动（按目标分数带生成不同难度的示范）。

### Infrastructure / Ops

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
