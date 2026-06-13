"""
Wikipedia / Simple English Wikipedia SourceAdapter.

Uses two Wikipedia APIs (both CC BY-SA 4.0):
  - REST summary API  → lead-paragraph plain text  → read_aloud candidates
  - MediaWiki extracts API (explaintext=1) → full plain text → paragraphs
    in the 150-300-word range → summarize_written_text candidates
    in the 110-130-word range → re_tell_lecture candidates
    in the  90-110-word range → summarize_spoken_text candidates
  - Lead sentence + template rephrase → write_essay prompt candidates
    (NOT verbatim Wikipedia copy — derived topic question)

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
# Target: 60+ unique topics → each article can produce 5 task types
# → well over 200 candidates per task type before cleaning
DEFAULT_TOPICS = [
    # Science & Technology
    "Climate change",
    "Photosynthesis",
    "DNA",
    "Artificial intelligence",
    "Water cycle",
    "Evolution",
    "Renewable energy",
    "Biodiversity",
    "Internet",
    "Astronomy",
    "Agriculture",
    "Nuclear power",
    "Vaccination",
    "Marine biology",
    "Genetics",
    "Nanotechnology",
    "Space exploration",
    "Quantum mechanics",
    "Robotics",
    "Solar energy",
    "Ocean acidification",
    "Deforestation",
    "Environmental science",
    "Information technology",
    "Biotechnology",
    "Neuroscience",
    "Epidemiology",
    "Ecology",
    "Meteorology",
    "Hydrology",
    # Society & Humanities
    "Industrial Revolution",
    "Globalization",
    "Democracy",
    "Urbanization",
    "Human migration",
    "Public health",
    "Philosophy",
    "Linguistics",
    "Psychology",
    "Architecture",
    "Transportation",
    "Economics",
    "History of science",
    "Sustainable development",
    "Feminism",
    "Colonialism",
    "Capitalism",
    "Sociology",
    "Anthropology",
    "Education",
    "Media (communication)",
    "Cultural heritage",
    "Human rights",
    "Political philosophy",
    # Arts & Culture
    "Literature",
    "Music",
    "Film",
    "Renaissance",
    "Ancient Rome",
    "Ancient Greece",
    "Buddhism",
    "Islam",
    "Christianity",
]

_REST_BASE = "https://en.wikipedia.org/api/rest_v1"
_ACTION_BASE = "https://en.wikipedia.org/w/api.php"

# Essay question template frames — each is a standalone discussion prompt (40-60 words).
# These are ORIGINAL question texts derived only from the topic title; they do NOT copy
# Wikipedia prose. Designed to match the PTE Academic write_essay format.
_ESSAY_FRAMES = [
    (
        "In recent decades, {topic} has become one of the most widely debated issues in "
        "academic and public discourse. Discuss the main causes of this phenomenon, the "
        "consequences it has had on society and the environment, and suggest what measures "
        "individuals and governments should take to address these challenges effectively."
    ),
    (
        "Many researchers and policymakers argue that {topic} presents both significant "
        "opportunities and serious risks for modern society. Analyse the key benefits and "
        "drawbacks associated with {topic}, and discuss the extent to which its positive "
        "effects outweigh the negative consequences for individuals and communities."
    ),
    (
        "The study of {topic} has grown considerably in importance over the past century. "
        "Discuss how advances in our understanding of {topic} have influenced economic "
        "development, social change, and technological innovation, and evaluate whether "
        "these changes have been predominantly beneficial or detrimental to human progress."
    ),
    (
        "{topic} is widely regarded as a defining issue of the twenty-first century. "
        "Examine the historical factors that have contributed to the rise of {topic}, "
        "assess its impact on both developed and developing nations, and propose "
        "evidence-based strategies that could be adopted at an international level."
    ),
    (
        "Some experts contend that current approaches to managing {topic} are insufficient "
        "and require fundamental reform. Discuss the key challenges associated with {topic}, "
        "critically evaluate the strategies currently employed to address them, and suggest "
        "more effective alternatives that policymakers and communities could adopt."
    ),
    (
        "The relationship between {topic} and sustainable development has attracted "
        "considerable attention from academics, governments, and civil society organisations. "
        "Discuss how {topic} affects efforts to achieve long-term sustainability, and "
        "evaluate the role that education, technology, and international cooperation "
        "must play in bringing about meaningful change."
    ),
    (
        "Throughout history, {topic} has shaped the way societies organise themselves, "
        "distribute resources, and define shared values. Discuss the ways in which "
        "{topic} continues to influence contemporary life, and evaluate whether its "
        "overall effect on human wellbeing and social cohesion has been positive or negative."
    ),
    (
        "It is often argued that a deeper understanding of {topic} is essential for "
        "addressing some of the most pressing problems facing the world today. "
        "Discuss the key insights that the study of {topic} offers, and evaluate how "
        "these insights can be applied to improve decision-making in both the public "
        "and private sectors."
    ),
]


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


def _extract_lead_noun(title: str) -> str:
    """
    Return a clean topic noun from the article title for essay prompt construction.
    Strips disambiguation suffixes like '(film)', '(physics)', etc.
    """
    # Remove parenthetical disambiguation
    noun = re.sub(r"\s*\([^)]+\)", "", title).strip()
    return noun.lower()


def _build_essay_prompt(topic_title: str, frame_index: int) -> str:
    """
    Construct an original essay discussion prompt from the topic title.
    Uses a rotating frame template — NOT Wikipedia text — to ensure originality.
    """
    noun = _extract_lead_noun(topic_title)
    frame = _ESSAY_FRAMES[frame_index % len(_ESSAY_FRAMES)]
    return frame.format(topic=noun)


class WikipediaAdapter(SourceAdapter):
    """Fetch academic passages from English Wikipedia.

    Emits five task types per article (where source material exists):
      - read_aloud            : lead paragraph  (10-60 words)
      - write_essay           : original prompt derived from topic title (30-80 words)
      - summarize_written_text: body paragraphs 150-300 words
      - re_tell_lecture       : body paragraphs 100-150 words
      - summarize_spoken_text : body paragraphs  80-120 words
    """

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
            # Note: do NOT set exsectionformat=plain — that strips section headers,
            # breaking the split logic below. Default format preserves == headings ==.
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
        for topic_idx, topic in enumerate(self._topics):
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

            # ── write_essay candidate: original prompt from topic ─────
            # We generate one prompt per topic using a rotating frame template.
            # This is NOT a verbatim copy of Wikipedia text — it is an original
            # question derived from the topic title only.
            essay_prompt = _build_essay_prompt(topic, frame_index=topic_idx)
            yield RawExemplar(
                task_type="write_essay",
                text=essay_prompt,
                source_url=page_url,
                license=LICENSE,
                raw_meta={"title": topic, "section": "prompt", "frame_index": topic_idx % len(_ESSAY_FRAMES)},
            )

            # ── body-section candidates: three task types by word count ──
            for para in self._fetch_sections(topic):
                wc = _word_count(para)

                # summarize_written_text: 150-300 words
                if 120 <= wc <= 400:
                    yield RawExemplar(
                        task_type="summarize_written_text",
                        text=para,
                        source_url=page_url,
                        license=LICENSE,
                        raw_meta={"title": topic, "section": "body", "raw_word_count": wc},
                    )

                # re_tell_lecture: 100-150 words (cleaner gate: 100-150)
                if 80 <= wc <= 200:
                    yield RawExemplar(
                        task_type="re_tell_lecture",
                        text=para,
                        source_url=page_url,
                        license=LICENSE,
                        raw_meta={"title": topic, "section": "body", "raw_word_count": wc},
                    )

                # summarize_spoken_text: 80-120 words (cleaner gate: 80-120)
                if 60 <= wc <= 160:
                    yield RawExemplar(
                        task_type="summarize_spoken_text",
                        text=para,
                        source_url=page_url,
                        license=LICENSE,
                        raw_meta={"title": topic, "section": "body", "raw_word_count": wc},
                    )

            time.sleep(self._rate_limit)
