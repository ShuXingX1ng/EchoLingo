# LangGraph + RAG refactor of the Scoring Agent pipeline

## Context

The current `POST /api/pte/feedback` pipeline is implemented in `backend/routers/pte_feedback.py` using raw `asyncio.gather` for parallel LLM calls and manual conditional logic for the LLM-as-Judge retry. LangChain is already present (`backend/services/llm_chain.py`) but used only as a thin `ChatOpenAI` wrapper with no chains, memory, or graph structure.

Two problems to solve:
1. The judge → divergence check → conditional retry is implicit control flow scattered across one large async function. It is hard to test nodes in isolation and hard to extend.
2. AI feedback quality is limited by prompts alone — there is no grounding in real PTE scoring criteria. The LLM-as-Judge exists to catch calibration drift but cannot fix systematic bias.

## Decision

Refactor the entire feedback pipeline into a **LangGraph `StateGraph`** and introduce a **RAG retrieval node** that injects relevant scoring rubrics into the Scoring Agent's system prompt before the primary LLM call.

### LangGraph state

```python
class FeedbackState(TypedDict):
    task_type: str
    stimulus: str
    response: str
    pron_assessment: Optional[dict]
    retrieved_context: str          # rubrics retrieved from vector store
    primary_result: Optional[dict]
    judge_result: Optional[dict]
    diverged: list                  # dimensions with > 15-point gap
    retry_count: int
    final_result: dict
```

### Graph nodes

| Node | Responsibility |
|------|----------------|
| `retrieve_context` | Query Supabase pgvector for rubrics matching `task_type`; write to `retrieved_context` |
| `call_primary` | Build system prompt (YAML base + retrieved rubrics); call LLM; parse JSON |
| `call_judge` | Run judge LLM call in parallel with `call_primary` via `Send` |
| `check_divergence` | Compare dimension scores; populate `diverged` |
| `retry_primary` | Append retry note to user content; call primary again |
| `finalize` | Merge `pron_assessment` + `judge_log` into `final_result` |

### Edges

```
retrieve_context → [call_primary, call_judge]  (parallel via Send)
call_primary + call_judge → check_divergence
check_divergence → retry_primary  (if diverged)
check_divergence → finalize       (if not diverged)
retry_primary → finalize
```

### RAG stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Vector store | Supabase pgvector | Already in use; no new infrastructure |
| Embedding model | Alibaba DashScope `text-embedding-v4` | Existing account + free quota; OpenAI-compatible API |
| LangChain integration | `OpenAIEmbeddings` with custom `base_url` | Drop-in, no adapter needed |
| Phase 1 documents | Hand-written rubrics per task type and scoring dimension | Available immediately; no data dependency |
| Phase 2 documents | Scored example responses from curated public sources | Deferred; scraping pipeline planned separately |

## Considered Options

- **Keep asyncio.gather + manual retry (status quo)** — no test isolation, control flow is implicit, no RAG path. Rejected because it cannot accommodate RAG without becoming unmaintainable.
- **LangChain LCEL chains only (no LangGraph)** — composable but lacks the conditional branching and stateful retry that LangGraph provides natively. Rejected for the judge→retry path.
- **LangGraph + RAG (chosen)** — nodes are individually testable, the conditional retry is a first-class graph edge, and the RAG retrieval node is cleanly separable from the scoring logic.

## Consequences

- `backend/routers/pte_feedback.py` is replaced by a LangGraph graph defined in `backend/services/feedback_graph.py`.
- `backend/services/llm_chain.py` is retained as the low-level LLM call utility; graph nodes call it directly.
- A new `backend/services/rag.py` provides the `retrieve_context` function used by the graph node.
- A new `backend/services/vector_store.py` manages the Supabase pgvector connection and embedding client.
- Existing 105 backend tests remain the regression gate; all must pass after refactor.
- A one-time seeding script (`backend/scripts/seed_rubrics.py`) populates the vector store with Phase 1 rubric documents.
