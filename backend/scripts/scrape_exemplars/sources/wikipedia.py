"""
Wikipedia / Simple English Wikipedia SourceAdapter.

Uses two Wikipedia APIs (both CC BY-SA 4.0):
  - REST summary API  → lead-paragraph plain text  → read_aloud candidates
  - MediaWiki extracts API (explaintext=1) → full plain text → paragraphs
    in the 150-300-word range → summarize_written_text candidates

Rate limits: 1 request per second per ARTICLE (two sub-requests per article
share the same delay slot).  User-Agent identifies the bot.

robots.txt: Wikipedia grants read access to all bots; the REST and Action APIs
are explicitly documented as the machine-readable paths.
"""

from __future__ import annotations

import re
import time
from typing import Iterable

import httpx

from scripts.scrape_exemplars.base import RawExemplar, SourceAdapter

LICENSE = "CC BY-SA 4.0"
USER_AGENT = "EchoLingo/1.0 (PTE Academic practice; educational bot; contact: zzha0701@student.monash.edu)"

# Skip these section titles (references, navigation, appendices)
_SKIP_SECTIONS = frozenset(
    {
        "references", "see also", "external links", "notes", "bibliography",
        "further reading", "footnotes", "sources", "citations",
    }
)

# Academic topics spanning PTE-relevant domains
DEFAULT_TOPICS = [
    "Climate change",
    "Photosynthesis",
    "Industrial Revolution",
    "DNA",
    "Globalization",
    "Artificial intelligence",
    "Water cycle",
    "Democracy",
    "Evolution",
    "Renewable energy",
    "Urbanization",
    "Biodiversity",
    "Economics",
    "Internet",
    "Human migration",
    "Public health",
    "Astronomy",
    "Philosophy",
    "Agriculture",
    "Linguistics",
    "Psychology",
    "Architecture",
    "Nuclear power",
    "Vaccination",
    "Transportation",
    "Marine biology",
    "Genetics",
    "History of science",
    "Environmental science",
    "Information technology",
    "Deforestation",
    "Ocean acidification",
    "Sustainable development",
    "Nanotechnology",
    "Space exploration",
]

_REST_BASE = "https://en.wikipedia.org/api/rest_v1"
_ACTION_BASE = "https://en.wikipedia.org/w/api.php"


def _build_page_url(title: str) -> str:
    safe = title.replace(" ", "_")
    return f"https://en.wikipedia.org/wiki/{safe}"


def _strip_wikitext_noise(text: str) -> str:
    """Remove residual markup artifacts that slip through the plain-text API."""
    # Remove {{template}} markers
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    # Remove citation markers like [1], [note 2]
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\[note\s*\d+\]", "", text, flags=re.IGNORECASE)
    # Remove edit section markers
    text = re.sub(r"\[edit\]", "", text, flags=re.IGNORECASE)
    # Normalise whitespace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _word_count(text: str) -> int:
    return len(text.split())


class WikipediaAdapter(SourceAdapter):
    """Fetch academic passages from English Wikipedia."""

    def __init__(
        self,
        topics: list[str] | None = None,
        limit: int | None = None,
        rate_limit_secs: float = 1.0,
    ) -> None:
        self._topics = (topics or DEFAULT_TOPICS)[: limit] if limit else (topics or DEFAULT_TOPICS)
        self._rate_limit = rate_limit_secs

    @property
    def name(self) -> str:
        return "wikipedia"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_json(self, url: str, params: dict | None = None) -> dict | None:
        try:
            resp = httpx.get(
                url,
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=15.0,
                follow_redirects=True,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # network/HTTP errors → skip article
            print(f"  [wikipedia] fetch error for {url}: {exc}")
            return None

    def _fetch_lead(self, title: str) -> str | None:
        """Return the lead plain-text extract for a Wikipedia article."""
        data = self._get_json(f"{_REST_BASE}/page/summary/{title.replace(' ', '_')}")
        if data:
            return data.get("extract", "").strip() or None
        return None

    def _fetch_sections(self, title: str) -> list[str]:
        """Return a list of cleaned paragraph strings (non-lead sections)."""
        params = {
            "action": "query",
            "prop": "extracts",
            "titles": title,
            "explaintext": "1",
            "exsectionformat": "plain",
            "format": "json",
        }
        data = self._get_json(_ACTION_BASE, params)
        if not data:
            return []

        pages = data.get("query", {}).get("pages", {})
        page = next(iter(pages.values()), {})
        full_text: str = page.get("extract", "")

        if not full_text:
            return []

        # Split off lead (before first == section ==)
        parts = re.split(r"\n==+\s*(.+?)\s*==+\n", full_text)
        # parts: [lead, title1, content1, title2, content2, ...]
        paragraphs: list[str] = []
        i = 1
        while i + 1 < len(parts):
            section_title = parts[i].strip().lower()
            section_body = parts[i + 1]
            i += 2
            if section_title in _SKIP_SECTIONS:
                continue
            for para in section_body.split("\n\n"):
                cleaned = _strip_wikitext_noise(para)
                if cleaned:
                    paragraphs.append(cleaned)

        return paragraphs

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def fetch(self) -> Iterable[RawExemplar]:
        for topic in self._topics:
            print(f"  [wikipedia] fetching: {topic}")
            page_url = _build_page_url(topic)

            # ── read_aloud candidate: lead paragraph ──────────────────
            lead = self._fetch_lead(topic)
            if lead:
                cleaned_lead = _strip_wikitext_noise(lead)
                if cleaned_lead:
                    yield RawExemplar(
                        task_type="read_aloud",
                        text=cleaned_lead,
                        source_url=page_url,
                        license=LICENSE,
                        raw_meta={"title": topic, "section": "lead"},
                    )

            # ── summarize_written_text candidates: body sections ──────
            for para in self._fetch_sections(topic):
                wc = _word_count(para)
                # Pre-filter extreme outliers to reduce noise (final gate is in cleaner)
                if wc < 80 or wc > 600:
                    continue
                yield RawExemplar(
                    task_type="summarize_written_text",
                    text=para,
                    source_url=page_url,
                    license=LICENSE,
                    raw_meta={"title": topic, "section": "body", "raw_word_count": wc},
                )

            time.sleep(self._rate_limit)
