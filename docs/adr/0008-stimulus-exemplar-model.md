# Stimulus Exemplars — retrieval-grounded generation, not verbatim serving

## Context

Phase Data-1's original brief was to "scrape a public PTE question bank and
serve it as an alternative to AI generation." The original task plan remains
available through Git history. Pursued
literally, that means **serving scraped questions verbatim**, which collides with
two hard constraints:

1. **Copyright.** The high-value public PTE material is "机经 / recall" content —
   leaked, copyrighted Pearson exam questions circulating on GitHub and blogs.
   Copying it for personal practice is low-enforcement-risk, but **committing it
   into a public portfolio repo is redistribution** and invites DMCA takedown.
2. **Source availability.** A web search confirmed there is no clean, well-formed,
   permissively-licensed public PTE question bank to scrape; what exists is either
   leaked recall content or generic/learner corpora that aren't PTE-shaped.

The project already owns a vector stack — `backend/services/vector_store.py`
(DashScope `text-embedding-v4`, 1024-dim) + `rag.py` over Supabase pgvector —
currently used only by the *feedback* pipeline to retrieve rubric context.

## Decision

**Scraped source text is ingested as Stimulus Exemplars: a retrieval-only corpus
that seeds original generation. It is never the default served Stimulus.**

1. **Route 3 — store verbatim, serve generated.** Each cleaned source item is
   stored verbatim in Supabase (`stimulus_exemplars`). It serves two purposes:
   (a) a RAG retrieval corpus that supplies few-shot anchors at generation time,
   and (b) a private "practice the real question" path (`verbatim=true`, a
   backend-only flag, never exposed in the public UI). The **default** stimulus
   path retrieves N similar Exemplars and generates an *original* Stimulus in
   matching style/difficulty/topic — the Exemplar text is not returned.

2. **Code public, copyrighted data out of the repo.** The scraper/cleaning/embed
   pipeline is the portfolio artifact and is committed. Raw and cleaned data live
   in `backend/data/exemplars_raw/` and `exemplars_clean/` (both gitignored) and
   in Supabase; copyrighted recall content never enters git history. This mirrors
   the existing ECDICT pattern (`ecdict.sqlite` is gitignored, fetched on deploy —
   see ADR 0006).

3. **"Generated ≠ original" is enforced and measured.** A local word-shingle
   overlap guard at generation time (n-gram Jaccard vs the injected Exemplars;
   over threshold → regenerate once, no extra API call) prevents accidental
   verbatim regurgitation, and an offline eval reports an originality
   distribution. Combined with default-no-verbatim, this keeps the served output
   copyright-clean.

4. **AI generation becomes the fallback, not the primary.** The current
   pure-LLM `pte_stimulus.py` path is demoted to a graceful-degradation tier:
   Exemplar-grounded generation when a Task Type has Exemplars → pure AI when the
   bank is empty (e.g. the JSON task types, or types not yet scraped) → silent
   pure-AI fallback on any retrieval/DB failure (never a bare 502, per ADR 0007).

## Considered Options

- **Serve scraped questions verbatim (the literal brief).** Rejected. It is the
  highest-fidelity practice but redistributes copyrighted exam content from a
  public repo and depends on a clean source that doesn't exist.
- **Pure open-corpus only, no recall content at all.** Viable and fully clean,
  but gives up the authenticity that makes recall content valuable. Kept as the
  *first* adapter (Wikipedia/Simple Wikipedia, CC-licensed) precisely because it
  needs no special handling; a recall adapter can be added later under the
  gitignored ingestion path.
- **Exemplar-grounded generation (chosen).** Original output (copyright-clean,
  publishable), reuses the existing pgvector/embedding infrastructure, keeps a
  private verbatim path for personal use, and turns "drop AI generation once the
  bank is large enough" into a tunable fallback-hit-rate question rather than a
  rewrite.

## Consequences

- The `task-bank.ts` localStorage cache is unchanged in contract; it now also
  serves as the Circuit-Breaker offline fallback for the `random` path.
- A new domain term, **Stimulus Exemplar**, is added to `CONTEXT.md`, kept
  distinct from **Stimulus** (what the learner receives).
- Storage and hybrid-retrieval mechanics are decided separately in ADR 0009.
- Whether to eventually retire pure-AI generation is deferred and observable via
  fallback-hit-rate per Task Type.
