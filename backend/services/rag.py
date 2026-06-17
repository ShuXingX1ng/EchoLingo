"""
RAG Service

Retrieves scoring rubric context from Supabase pgvector for a given PTE task type.
Returns a plain-text string ready to be injected into an LLM system prompt.
"""

import logging
from services.vector_store import aembed_query, get_vecs_collection

logger = logging.getLogger(__name__)

TOP_K = 5


async def retrieve_context(task_type: str) -> str:
    """
    Query the rubric_chunks collection filtered by task_type.

    Returns concatenated chunk text, or an empty string if nothing is found
    or if the vector store is unavailable.
    """
    try:
        query_vec = await aembed_query(task_type)
        collection = get_vecs_collection()

        results = collection.query(
            data=query_vec,
            limit=TOP_K,
            filters={"task_type": {"$eq": task_type}},
            include_value=False,
            include_metadata=True,
        )

        if not results:
            return ""

        chunks = [row[1].get("text", "") for row in results if row[1].get("text")]
        return "\n\n".join(chunks)

    except Exception as exc:
        logger.warning("RAG retrieval failed for task_type=%s: %s", task_type, exc)
        return ""
