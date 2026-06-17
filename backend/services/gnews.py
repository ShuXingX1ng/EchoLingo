"""
GNews Adapter

Fetches news article metadata (title + summary ONLY — never full text) from
GNews for use as fresh generation anchors in the Study Assistant's
"generate practice from news" path.

Per ADR-0008 and ADR-0007:
- Only title + description (summary) are fetched; full article content is
  intentionally excluded to avoid copyright and verbatim-serving issues.
- Any failure (missing key, timeout, HTTP error, empty result) silently
  returns [] — callers fall back to the Exemplar path without raising.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_GNEWS_ENDPOINT = "https://gnews.io/api/v4/search"
_TIMEOUT_SECONDS = 8.0


async def fetch_news_anchors(topic: str, n: int = 3) -> list[str]:
    """
    Fetch up to `n` recent news items about `topic` from GNews.

    Returns a list of strings in the format "TITLE — SUMMARY" (title +
    description only — never full article text). Returns [] on missing API
    key, timeout, or any error.
    """
    api_key: Optional[str] = os.getenv("GNEWS_API_KEY")
    if not api_key:
        logger.warning("[gnews] GNEWS_API_KEY is not set — skipping news fetch")
        return []

    params = {
        "q": topic,
        "max": str(n),
        "lang": "en",
        "apikey": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(_GNEWS_ENDPOINT, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.warning("[gnews] request timed out for topic=%r", topic)
        return []
    except httpx.HTTPStatusError as exc:
        logger.warning("[gnews] HTTP %d for topic=%r", exc.response.status_code, topic)
        return []
    except Exception as exc:
        logger.warning("[gnews] unexpected error for topic=%r: %s", topic, exc)
        return []

    articles = data.get("articles") or []
    if not articles:
        logger.warning("[gnews] no articles returned for topic=%r", topic)
        return []

    anchors: list[str] = []
    for article in articles[:n]:
        title = (article.get("title") or "").strip()
        summary = (article.get("description") or "").strip()
        if title:
            anchor = f"{title} — {summary}" if summary else title
            anchors.append(anchor)

    return anchors
