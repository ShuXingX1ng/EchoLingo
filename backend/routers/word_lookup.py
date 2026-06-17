"""
Word Lookup API Router

POST /api/word-lookup — translate a selected word or short phrase (see ADR 0006).

Routing after cleaning the input:
    single English word  -> ECDICT (hit returns; miss falls through to DeepSeek)
    phrase / short sentence -> DeepSeek
"""

import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ecdict import lookup as ecdict_lookup
from services.llm_chain import llm_chain
from services.prompt_loader import prompts

router = APIRouter()

MAX_QUERY_LEN = 200

# A single English word: one token of letters, optionally with internal
# hyphens/apostrophes (e.g. "well-being", "don't"). No spaces.
_SINGLE_WORD_RE = re.compile(r"^[A-Za-z]+(?:[-'][A-Za-z]+)*$")


class WordLookupRequest(BaseModel):
    query: str


def _clean(raw: str) -> str:
    """Strip surrounding punctuation/whitespace and collapse inner whitespace."""
    text = re.sub(r"\s+", " ", raw or "").strip()
    return text.strip(" \t\r\n\"'“”‘’.,;:!?()[]{}<>—–-")


async def _deepseek_fallback(query: str) -> dict:
    user = prompts.word_lookup_fallback_user.format(query=query)
    try:
        content = await llm_chain.ainvoke(
            system=prompts.word_lookup_fallback_system,
            user=user,
            temperature=0.2,
            max_tokens=500,
            json_mode=True,
            timeout=30.0,
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to look up word")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", content)
        if not match:
            raise HTTPException(status_code=502, detail="Invalid lookup format from LLM")
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Invalid lookup format from LLM")

    # Normalise to the unified schema regardless of what the model returned.
    entries = parsed.get("entries")
    if not isinstance(entries, list) or not entries:
        entries = [{"pos": "", "meaning": str(parsed.get("meaning", "")).strip()}]
    return {
        "source": "ai",
        "text": parsed.get("text") or query,
        "phonetic": parsed.get("phonetic") or "",
        "entries": [
            {"pos": str(e.get("pos", "")).strip(), "meaning": str(e.get("meaning", "")).strip()}
            for e in entries
            if isinstance(e, dict)
        ],
        "tags": parsed.get("tags") if isinstance(parsed.get("tags"), list) else [],
    }


@router.post("/word-lookup")
async def word_lookup(request: WordLookupRequest):
    query = _clean(request.query)
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    if len(query) > MAX_QUERY_LEN:
        raise HTTPException(status_code=400, detail="query is too long")

    if _SINGLE_WORD_RE.match(query):
        hit = ecdict_lookup(query)
        if hit is not None:
            return hit

    return await _deepseek_fallback(query)
