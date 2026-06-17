# Study Assistant: tool-using agent, hand-authored navigation knowledge, news-grounded generation reuses the Exemplar path

## Context

We are adding the **Study Assistant** — the learner-facing, tool-using conversational agent for the whole app. A learner chats with it in natural language; it decides which tool to call. Its MVP tools are:

1. **Navigation / app help** — "how / where / what is" questions, answered with clickable jump links.
2. **Generate practice on a topic** — produce an original **Stimulus** (text Task Types only at MVP) for a learner-named topic.
3. **PTE knowledge Q&A** — exam formats, scoring dimensions, study tips.

It is reachable from a global floating entry point on every page **except during an in-progress Mock Exam** (same exclusion as **Word Lookup**: a help/generation affordance in a timed mock breaks exam realism and could be used to fish for answers). Conversation is multi-turn within one session and is not persisted; answers follow the current UI language.

Several decisions here are non-obvious and worth recording:

1. **It is a tool-using agent but is deliberately *not* an "Agent."** The codebase already overloads "Agent" — it means the internal feedback/scoring pipeline (Speaking Agent, Scoring Agent, Coach Agent, LLM-as-Judge; see `docs/agent-architecture.md`, ADR-0004). A future reader will ask why the one thing that *is* literally a tool-using agent is **not** called an Agent.
2. **Navigation knowledge is hand-authored, not RAG.** EchoLingo already ships a RAG stack — `rag.py`, `vector_store.py`, pgvector (ADR-0005, ADR-0009). A reader will assume the Study Assistant should reuse it.
3. **"Generate practice from news" does not serve news verbatim, and is not a new generation pipeline.** ADR-0008 made a hard decision that real/scraped source text is never served as a Stimulus; everything goes through original generation with an **originality guard** (`originality.py`). A reader will wonder whether the news feature violates that.

## Decision

### A tool-using agent, named Study Assistant — not an Agent

The Study Assistant is implemented as a **LangGraph tool-calling agent** (consistent with `feedback_graph.py` / `onboarding_graph.py`) driven by DeepSeek via the existing `llm_chain`. But the canonical term is **Study Assistant** (see `CONTEXT.md`); the bare word "Agent" stays reserved for the internal feedback pipeline stages, which the Study Assistant never invokes. This extends ADR-0004: "Agent" denotes a feedback-pipeline stage, not any AI feature that happens to call tools.

**Action boundary.** The Study Assistant may generate practice content and navigate the learner into a **Practice Task**, but it never submits a **Response**, never scores, and never mutates saved learner data on the learner's behalf. Jump links come from a **fixed route allow-list**; the model returns a structured shape the frontend renders, so it cannot invent broken routes.

### Navigation & PTE-knowledge tools: hand-authored knowledge file, not RAG

The navigation and PTE-Q&A tools are grounded by a **hand-authored knowledge file** (app feature map + route allow-list + curated PTE FAQ) injected into the prompt — not retrieval over `docs/`. The app surface is small and stable enough that a curated file answers "where is X" accurately, which is the thing the assistant most needs to get right; dev-facing docs are the wrong corpus and offer no precision guarantee. Cost is manual upkeep when pages move.

### "Generate practice on a topic": one capability, two grounding sources, default Exemplars

Tools "news → practice" and "Theme Practice" are the **same operation** — produce a topic-conditioned original Stimulus — differing only in grounding source. They are unified into one tool with a `source` parameter, reusing `stimulus_service.py`:

- **`source = exemplars` (default).** The existing **Theme Practice** path: hybrid retrieval over **Stimulus Exemplars** seeds generation.
- **`source = news`.** Fetch via **GNews** (free tier, **title + summary only — never full text**) → summarise/rewrite → generate an original Stimulus. The fetched news text is injected as the generation anchor, so the **originality guard runs against it** exactly as it does for Exemplars. News is never served verbatim. This stays fully consistent with ADR-0008 (original output, copyright-clean) — news is just a *fresh, live anchor source* alongside the pre-ingested Exemplar corpus.

**Routing rule.** `source` defaults to `exemplars`. It switches to `news` **only** when the learner's message contains an explicit recency cue — currently: `recent`, `latest`, `current`, `news`, `real-time`, `最近新闻`, `实时新闻`, `最新事件`. This keeps the cheaper, copyright-clean, always-available Exemplar path as the default and makes live-news an explicit opt-in.

**Scope.** MVP targets **text Task Types only** (e.g. Summarize Written Text, Write Essay, Read Aloud, Reading Fill in the Blanks / Multiple Choice). Audio Task Types are out of MVP — they would need TTS over the generated Stimulus.

## Considered Options

- **Call it an "Agent" / fold into the feedback pipeline.** Superficially consistent. Rejected: it shares no responsibility with the feedback Agents, and the name is reserved (ADR-0004); reusing it would make the architecture diagram ambiguous.
- **RAG over `docs/` for navigation knowledge.** Auto-updates, reuses infra. Rejected: dev-facing docs are the wrong corpus for learner "how/where" questions and give no precision guarantee on the answers that matter most.
- **Serve fetched news articles verbatim as practice text.** Highest authenticity/freshness. Rejected: redistributes copyrighted news from a public repo and drives through the ADR-0008 originality guard — the same reasoning that rejected verbatim scraped questions.
- **Two separate tools (news-gen and theme-gen).** Rejected: they are one operation with different anchors; two parallel tools duplicate `stimulus_service` logic and confuse the model's tool choice.
- **Always-on news (no recency gate).** Rejected: every topic request would hit GNews (rate limits, latency) and lose the copyright-clean, offline-capable Exemplar default for no benefit when the learner did not ask for current events.

## Consequences

- New `backend/routers/study_assistant.py` (LangGraph tool-calling agent over `llm_chain`); knowledge file (feature map + route allow-list + PTE FAQ) under `backend/prompts/`, updated whenever pages/features move — the accepted maintenance cost.
- New GNews adapter (`backend/services/`), title+summary only, behind an API key in env; failures degrade to `source = exemplars` (never a bare error, per ADR-0007).
- "Generate practice on a topic" reuses `stimulus_service.py` + `originality.py`; the news anchor path adds a summarise/rewrite step before generation.
- New frontend proxy route under `src/app/api/`; floating Study Assistant panel mounted globally, gated off during an in-progress Mock Exam (same gating as `WordLookup`); multi-turn history held in session state only.
- Preset "common question" strings added to `en.json` / `zh.json`.
- No new Supabase table, no login requirement, no entry in `BackupData`.
