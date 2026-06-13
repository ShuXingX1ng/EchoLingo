"""
Vector Store Service

Manages the Supabase pgvector connection and DashScope embedding client.
Uses LangChain's OpenAIEmbeddings with a custom base_url to call
Alibaba DashScope text-embedding-v4 (OpenAI-compatible API).
"""

import os
from functools import lru_cache
from langchain_openai import OpenAIEmbeddings

try:
    import vecs as _vecs_module
except ImportError:
    _vecs_module = None  # type: ignore[assignment]  # vecs not installed in test env


COLLECTION_NAME = "rubric_chunks"


@lru_cache(maxsize=1)
def get_embeddings() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        model="text-embedding-v4",
        api_key=os.environ["DASHSCOPE_API_KEY"],
        base_url=os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        check_embedding_ctx_length=False,
        chunk_size=10,
    )


@lru_cache(maxsize=1)
def get_vecs_collection():
    if _vecs_module is None:
        raise RuntimeError("vecs package is not installed")
    db_url = os.environ["SUPABASE_DB_URL"]
    client = _vecs_module.create_client(db_url)
    return client.get_or_create_collection(name=COLLECTION_NAME, dimension=1024)


def embed_texts(texts: list[str]) -> list[list[float]]:
    return get_embeddings().embed_documents(texts)


async def aembed_query(text: str) -> list[float]:
    return await get_embeddings().aembed_query(text)
