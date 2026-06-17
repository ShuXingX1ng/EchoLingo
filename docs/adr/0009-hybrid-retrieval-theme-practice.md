# Hybrid retrieval for Theme Practice — and only there

## Context

Stimulus Exemplars (ADR 0008) are retrieved to seed generation. Three practice
modes consume them with different retrieval needs:

- **`random`** (plain Task Practice and Mock Exam) — sample Exemplars by Task
  Type; no query, authenticity via randomness.
- **`targeted`** (the Daily Plan / Task-Type Weakness engine, surfaced as
  "Targeted Practice") — filter Exemplars by Task Type plus difficulty/feature
  metadata matched to the learner's weak dimension.
- **`theme`** (Theme Practice) — the learner types a theme ("environment",
  "technology") and the system generates on that theme.

Only `theme` has a real text query, so only it can justify hybrid retrieval
(dense + sparse fusion). Putting hybrid on `targeted` was considered and
rejected: weakness is a Task-Type + dimension signal over the learner's
*response*, with no natural keyword to match against the *stimulus* text — a
sparse retriever there matches nothing meaningful and would be resume-driven
over-engineering.

## Decision

**Theme Practice uses hybrid retrieval — pgvector dense + Postgres `tsvector`
sparse, fused with Reciprocal Rank Fusion — over a dedicated relational
`stimulus_exemplars` table. `random` and `targeted` use plain
metadata-filtered/dense selection.**

1. **Dedicated relational table over a `vecs` collection.** Hybrid needs a
   `tsvector` full-text index alongside the embedding. Bolting `tsvector` onto a
   `vecs`-managed table is hacky, so Exemplars get an explicit table (migration
   004) carrying both `embedding vector(1024)` and a generated `tsv tsvector` (GIN
   index), plus `task_type`, `difficulty`, `features`, status/audit columns, and a
   `sha256(text)` primary key for idempotent upserts. This trades full reuse of
   `vector_store.py`'s `vecs` path for clean single-query hybrid SQL; the rubric
   `rubric_chunks` collection is unaffected and stays on `vecs`.
2. **Backend service-role access, no RLS.** Exemplars are shared content reached
   only by the backend and never sent to the client verbatim on the default path,
   so the table needs no per-user RLS policy (unlike the `vocabulary` table in
   migration 003). This also keeps copyrighted recall content off any
   client-reachable surface.
3. **`mode` is defined by retrieval strategy, not product name.** The backend
   `mode ∈ {random, targeted, theme}`; Mock vs plain Task Practice differ only in
   frontend UX (timing, verbatim eligibility), so both send `random`.

## Consequences

- The same dense + sparse + RRF pattern is a natural future fit for rubric
  retrieval in the feedback pipeline (`rag.py`), where exact scoring terminology
  matters — deferred, not done here.
- Theme results are not cached in `task-bank.ts` (it keys by Task Type only and
  would mis-serve across themes).
- One new migration (004) and a new `backend/services/exemplar_store.py` (hybrid
  SQL + sampling); `pte_stimulus.py` stays router-thin, consistent with the
  router-only shape of `pte_feedback.py`.
