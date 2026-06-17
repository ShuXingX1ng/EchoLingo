# Frontend / backend separation — FastAPI as the single authoritative backend

## Context

EchoLingo currently runs **two backends that have quietly forked**. The same PTE
business logic exists in two places with diverging behaviour:

- **Next.js API Routes** (`src/app/api/pte/stimulus`, `src/app/api/pte/feedback`,
  `src/app/api/read-aloud/stimulus`, `src/app/api/read-aloud/feedback`) call
  DeepSeek's `/chat/completions` **directly** with prompts inlined in the route
  file. No RAG, no LangGraph, no LLM-as-Judge.
- **Python FastAPI** (`backend/routers/pte_stimulus.py`, `pte_feedback.py`,
  `read_aloud.py`) implements the same endpoints through the full pipeline:
  LangGraph `StateGraph`, RAG rubric retrieval (ADR 0005), and the parallel
  LLM-as-Judge divergence/retry loop.

The two paths now return materially different feedback quality for the same
input, and which one a request hits depends on a single environment variable.

Three consequences of the split, all confirmed by reading the code:

1. **Secrets live in two runtimes.** `LLM_API_KEY` is read by the four Next
   routes above *and* by `backend/services/llm_chain.py`. `AZURE_SPEECH_KEY` /
   `AZURE_SPEECH_REGION` are read by `src/app/api/tts/route.ts` and
   `src/app/api/pronunciation/route.ts` *and* by the backend's `tts.py` /
   `pronunciation.py` routers. Every third-party key is duplicated across the
   Node and Python processes.

2. **`NEXT_PUBLIC_API_BASE_URL` is an optional fallback, and that is the root of
   the fork.** `src/lib/api-client.ts` routes to the FastAPI backend when the
   variable is set and silently falls back to the Next `/api/*` routes when it is
   empty. The default (empty) path is the direct-to-DeepSeek one. Nothing in the
   build fails if the variable is missing, so the lower-quality path is the
   easy-to-ship default.

3. **Only Word Lookup is in the correct shape.** `src/app/api/word-lookup/route.ts`
   is a thin proxy that forwards to FastAPI (it has to — the ECDICT dictionary
   lives in Python; see ADR 0006). It already *requires* `NEXT_PUBLIC_API_BASE_URL`
   and returns `503` when unset. It is the model the rest of the surface should
   follow — or, given the decision below, be replaced by.

The FastAPI side already implements **every** endpoint the frontend needs
(`pte_stimulus`, `pte_feedback`, `read_aloud`, `pronunciation`, `tts`,
`word_lookup`), so consolidation removes code rather than requiring new backend
work.

## Decision

**FastAPI is the single authoritative backend. All business and LLM logic exists
in exactly one place: the Python backend.**

Concretely:

1. **One implementation per concern.** The direct-to-DeepSeek logic in the Next
   routes is deleted, not kept as a fallback. The LangGraph + RAG + Judge
   pipeline in FastAPI is the only PTE stimulus/feedback implementation.

2. **Next.js holds no business routes in the end state.** Rather than leave thin
   proxies in place long-term, the target is to **remove `src/app/api/*` business
   routes entirely**. `src/lib/api-client.ts` calls the FastAPI base URL directly
   from the browser/client; cross-origin access is handled by **CORS configured
   on the FastAPI side**. The Word Lookup proxy is retired the same way once the
   frontend points at the backend directly. (During migration a route may pass
   through a transitional thin-proxy step — see ADR 0006's proxy as the
   reference shape — but the committed end state is no Next `api/*` business
   route.)

3. **All third-party secrets live only on the backend.** `LLM_API_KEY`,
   `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `DASHSCOPE_API_KEY`, and the
   Supabase service-role key are removed from the Next/Vercel runtime. The
   frontend deployment carries only public config (`NEXT_PUBLIC_*`) and the
   Supabase anon key.

4. **`NEXT_PUBLIC_API_BASE_URL` becomes required configuration.** The optional
   fallback branch in `api-client.ts` is removed. A missing base URL is a
   misconfiguration that fails fast (build-time or first-request error), not a
   silent downgrade to a second code path.

5. **Degradation principle when the backend is unavailable.** Because the
   frontend can no longer "self-serve" via inlined LLM calls, backend
   unavailability must be handled deliberately rather than surfacing a bare
   `502`:
   - **Health check** — the backend exposes a health endpoint; the frontend may
     gate or warn based on it.
   - **Friendly errors** — client surfaces a clear "service temporarily
     unavailable, please retry" state, never a raw stack/proxy error.
   - **Circuit-breaker direction** — repeated backend failures should short-
     circuit (bounded timeout + fail-fast) instead of hanging the UI; exact
     mechanism is deferred to implementation. This ADR fixes the *principle*; the
     migration tasks own the concrete wiring.

6. **ECDICT deployment (one-line re-evaluation).** The 206 MB ECDICT SQLite file
   **stays bundled inside the FastAPI application container for now**; splitting
   it into a standalone data service is deferred until scale (multi-instance
   backend, container-size pressure, or shared-cache needs) actually justifies
   it. Not decided here beyond "keep as-is, revisit when it hurts."

## Considered Options

- **Keep both backends (status quo, dual-track).** Rejected. This is the
  condition that produced the fork: two diverging implementations, duplicated
  secrets across two runtimes, two test surfaces that must be kept in lockstep,
  and a quality outcome that depends on one env var. There is no path where
  maintaining two implementations of the same endpoint converges on its own.

- **Make Next.js the authoritative backend (collapse onto Node).** Rejected. The
  high-value logic — LangGraph `StateGraph`, RAG retrieval over Supabase
  pgvector, DashScope embeddings, LLM-as-Judge, the ECDICT SQLite path — is all
  Python and leans on the Python ML/LLM ecosystem. Re-homing it into the Next
  runtime would be a large rewrite against the weaker ecosystem, and it would put
  every third-party key back into the public-facing web runtime. The direction of
  collapse is backend-ward, not frontend-ward.

- **Keep thin proxies in Next permanently (the Word Lookup shape, forever).**
  Considered and *not* chosen as the end state. Permanent proxies would keep one
  hop of indirection, a second place to configure timeouts/CORS/error mapping,
  and a Node surface to test — for no benefit once the browser can call FastAPI
  directly with CORS. Proxies remain valid as a *transitional* step per route;
  the committed end state deletes them. (If a future need appears — hiding the
  backend origin, edge auth, request shaping — a proxy/BFF layer can be
  reintroduced deliberately; it is not load-bearing today.)

- **Consolidate onto FastAPI + delete Next business routes (chosen).** One
  implementation, secrets in one runtime, one test surface, a consistent request
  path for every feature, and the smallest long-term frontend footprint.

## Consequences

- **Deployment.** The Next/Vercel deployment stops carrying `LLM_API_KEY`,
  `AZURE_SPEECH_KEY`/`REGION`, `DASHSCOPE_API_KEY`, and the Supabase service-role
  key; those move to (and stay only in) the FastAPI deployment. The frontend
  must be configured with a required `NEXT_PUBLIC_API_BASE_URL`. The backend must
  enable CORS for the frontend origin(s).

- **Secret management.** Single source of truth for every third-party key.
  Rotating a key touches one runtime. The public web bundle can no longer leak a
  provider key through a server route.

- **Fate of the Next routes.** `src/app/api/pte/*`, `src/app/api/read-aloud/*`,
  `src/app/api/tts`, `src/app/api/pronunciation`, and finally
  `src/app/api/word-lookup` are migrated route-by-route and then deleted. The
  `pronunciation` route is special — it proxies multipart audio for Azure speech
  *recognition*; its migration is sequenced separately from the JSON routes
  because of the audio upload path and the choice between server-side proxy vs.
  browser-side Azure SDK. `src/lib/api-client.ts` loses its fallback branch and
  the `isUsingExternalBackend()` indirection.

- **Two-end consistency testing.** With one implementation the "do both backends
  agree" problem disappears by construction. Test coverage consolidates on the
  backend (`cd backend && pytest`) for business logic; frontend tests assert the
  client targets the configured base URL and renders the friendly-error /
  unavailable states. E2E continues to run mock-first via Playwright
  `page.route()` (no real LLM/Azure/Supabase calls in CI, per existing
  convention).

- **Migration is staged and reversible per route.** Each route can be cut over
  and verified independently before its Next implementation is removed, so the
  cutover never requires a big-bang switch. See `docs/TASKS.md` →
  *Phase: 前后端彻底分离* for the step-by-step task list.

- **ECDICT stays in-container** until a concrete scaling trigger appears; this
  ADR records that it was reconsidered and intentionally left as-is.
