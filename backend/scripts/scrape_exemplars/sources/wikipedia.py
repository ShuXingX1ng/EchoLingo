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
  - Individual sentences (10-25 words) from lead/body → repeat_sentence
  - Individual sentences  (8-18 words) from lead/body → write_from_dictation
  - Template-derived question prompts → answer_short_question
    (NOT verbatim Wikipedia — derived from topic title using question frames)
  - Template-derived image scenario descriptions → describe_image
    (NOT verbatim Wikipedia — synthetic chart/graph scenarios from topic)

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

# Regex to split plain text into sentences at sentence-terminal punctuation
# followed by whitespace and an uppercase letter (or closing quote).
_SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?])\s+(?=[A-Z"\'])')

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


# ── Answer Short Question frames ──────────────────────────────────────────────
# Original questions derived from topic titles — NOT verbatim Wikipedia text.
# Designed to match the PTE Academic answer_short_question format (factual,
# single-word or short-phrase answers expected).
_ASQ_FRAMES = [
    "What is the primary focus of the study of {topic}?",
    "Name one example of {topic} commonly cited in academic contexts.",
    "In which academic discipline is {topic} most extensively studied?",
    "What is one major benefit associated with advances in {topic}?",
    "What is a key challenge currently facing the field of {topic}?",
    "What concept does the term {topic} most directly relate to?",
    "Identify one sector significantly affected by developments in {topic}.",
    "What is the primary goal of research conducted in the area of {topic}?",
    "What does the study of {topic} primarily seek to explain or understand?",
    "Name one practical application that has emerged from advances in {topic}.",
    "What is a common concern raised by critics of {topic}?",
    "What is one widely recognised consequence of {topic} on modern society?",
]

# ── Describe Image scenario frames ────────────────────────────────────────────
# Synthetic image-scenario descriptions derived from topic titles — NOT verbatim
# Wikipedia text. Designed to describe the kind of chart/graph a PTE candidate
# might encounter in a Describe Image task. Used as few-shot style anchors.
_IMAGE_SCENARIO_FRAMES = [
    (
        "A bar chart comparing the annual levels of {topic} across five major countries "
        "between 2000 and 2020, with notable differences between developed and developing nations."
    ),
    (
        "A line graph illustrating changes in the global impact of {topic} over a twenty-year "
        "period, showing a marked acceleration in growth after 2010."
    ),
    (
        "A pie chart displaying the proportional contribution of different sectors to the "
        "overall development of {topic} in contemporary society."
    ),
    (
        "A table summarising key statistical indicators related to {topic} across multiple "
        "geographic regions, highlighting disparities in access and outcomes."
    ),
    (
        "A flow diagram outlining the main stages of a process directly influenced by {topic}, "
        "from initial conditions through to measurable outcomes."
    ),
    (
        "A map showing the worldwide distribution of {topic}, with shaded regions indicating "
        "varying levels of intensity, adoption, or impact."
    ),
    (
        "A double bar chart comparing two different approaches to addressing {topic}, measured "
        "across three time periods over the past decade."
    ),
    (
        "A stacked bar chart illustrating how the composition of resources allocated to {topic} "
        "has shifted across four consecutive decades."
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


def _build_asq_prompt(topic_title: str, frame_index: int) -> str:
    """
    Construct an original answer-short-question prompt from the topic title.
    Uses rotating frames — NOT Wikipedia text.
    """
    noun = _extract_lead_noun(topic_title)
    frame = _ASQ_FRAMES[frame_index % len(_ASQ_FRAMES)]
    return frame.format(topic=noun)


def _build_image_scenario(topic_title: str, frame_index: int) -> str:
    """
    Construct a synthetic image-scenario description from the topic title.
    Uses rotating frames — NOT Wikipedia text.
    """
    noun = _extract_lead_noun(topic_title)
    frame = _IMAGE_SCENARIO_FRAMES[frame_index % len(_IMAGE_SCENARIO_FRAMES)]
    return frame.format(topic=noun)


def _split_sentences(text: str) -> list[str]:
    """
    Split a plain-text paragraph into individual sentences.

    Uses terminal-punctuation + whitespace + uppercase heuristic. Skips
    very short fragments and lines that look like headings (no terminal punct).
    """
    parts = _SENTENCE_SPLIT_RE.split(text)
    sentences: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Skip if it doesn't end with sentence-terminal punctuation (likely a heading)
        if not re.search(r'[.!?]$', part):
            continue
        sentences.append(part)
    return sentences


class WikipediaAdapter(SourceAdapter):
    """Fetch academic passages from English Wikipedia.

    Emits nine task types per article (where source material exists):

    Text derived from Wikipedia (CC BY-SA 4.0):
      - read_aloud            : lead paragraph             (10-60 words)
      - summarize_written_text: body paragraphs           (150-300 words)
      - re_tell_lecture       : body paragraphs           (100-150 words)
      - summarize_spoken_text : body paragraphs            (80-120 words)
      - repeat_sentence       : individual sentences       (8-28 words)
      - write_from_dictation  : individual short sentences  (6-20 words)

    Original content derived from topic title only (NOT Wikipedia text):
      - write_essay           : original discussion prompt (30-80 words)
      - answer_short_question : original factual question   (5-22 words)
      - describe_image        : synthetic chart/graph brief (15-70 words)
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
            cleaned_lead: str | None = None
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

                    # ── repeat_sentence / write_from_dictation: sentences from lead ──
                    # We extract individual sentences from the lead paragraph.
                    # Both task types come from the same sentences — the length
                    # gate in the cleaner distinguishes them.
                    for sent in _split_sentences(cleaned_lead):
                        wc = _word_count(sent)
                        if 6 <= wc <= 28:
                            yield RawExemplar(
                                task_type="repeat_sentence",
                                text=sent,
                                source_url=page_url,
                                license=LICENSE,
                                raw_meta={"title": topic, "section": "lead_sentence", "raw_word_count": wc},
                            )
                        if 6 <= wc <= 20:
                            yield RawExemplar(
                                task_type="write_from_dictation",
                                text=sent,
                                source_url=page_url,
                                license=LICENSE,
                                raw_meta={"title": topic, "section": "lead_sentence", "raw_word_count": wc},
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

            # ── answer_short_question candidate: original question from topic ──
            # One question per topic, rotating through frames.
            # NOT verbatim Wikipedia — derived from topic title only.
            asq_prompt = _build_asq_prompt(topic, frame_index=topic_idx)
            yield RawExemplar(
                task_type="answer_short_question",
                text=asq_prompt,
                source_url=page_url,
                license=LICENSE,
                raw_meta={"title": topic, "section": "question", "frame_index": topic_idx % len(_ASQ_FRAMES)},
            )

            # ── describe_image candidate: synthetic chart scenario from topic ──
            # One image brief per topic, rotating through frames.
            # NOT verbatim Wikipedia — synthetic chart/graph description.
            image_scenario = _build_image_scenario(topic, frame_index=topic_idx)
            yield RawExemplar(
                task_type="describe_image",
                text=image_scenario,
                source_url=page_url,
                license=LICENSE,
                raw_meta={"title": topic, "section": "image_brief", "frame_index": topic_idx % len(_IMAGE_SCENARIO_FRAMES)},
            )

            # ── body-section candidates: task types by word count ─────
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

                # repeat_sentence / write_from_dictation: sentences from body
                # Only process paragraphs long enough to contain useful sentences.
                if wc >= 20:
                    for sent in _split_sentences(para):
                        swc = _word_count(sent)
                        if 6 <= swc <= 28:
                            yield RawExemplar(
                                task_type="repeat_sentence",
                                text=sent,
                                source_url=page_url,
                                license=LICENSE,
                                raw_meta={"title": topic, "section": "body_sentence", "raw_word_count": swc},
                            )
                        if 6 <= swc <= 20:
                            yield RawExemplar(
                                task_type="write_from_dictation",
                                text=sent,
                                source_url=page_url,
                                license=LICENSE,
                                raw_meta={"title": topic, "section": "body_sentence", "raw_word_count": swc},
                            )

            time.sleep(self._rate_limit)
