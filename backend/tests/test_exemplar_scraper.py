"""
Tests for the Stimulus Exemplar scraping package.

Covers: RawExemplar dataclass, SourceAdapter interface, WikipediaAdapter parsing
(all HTTP calls are mocked — no real network requests).
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from scripts.scrape_exemplars.base import RawExemplar, SourceAdapter
from scripts.scrape_exemplars.sources.wikipedia import (
    WikipediaAdapter,
    _strip_wikitext_noise,
    _word_count,
)


# ── RawExemplar ───────────────────────────────────────────────────────────────

class TestRawExemplar:
    def test_roundtrip(self):
        ex = RawExemplar(
            task_type="read_aloud",
            text="The quick brown fox.",
            source_url="https://en.wikipedia.org/wiki/Fox",
            license="CC BY-SA 4.0",
            raw_meta={"title": "Fox"},
        )
        assert RawExemplar.from_dict(ex.to_dict()) == ex

    def test_from_dict_defaults_raw_meta(self):
        d = {
            "task_type": "summarize_written_text",
            "text": "Some passage.",
            "source_url": "https://example.com",
            "license": "CC BY-SA 4.0",
        }
        ex = RawExemplar.from_dict(d)
        assert ex.raw_meta == {}

    def test_to_dict_keys(self):
        ex = RawExemplar("read_aloud", "text", "url", "CC BY-SA 4.0")
        keys = set(ex.to_dict().keys())
        assert keys == {"task_type", "text", "source_url", "license", "raw_meta"}


# ── SourceAdapter ─────────────────────────────────────────────────────────────

class TestSourceAdapterInterface:
    def test_cannot_instantiate_abstract(self):
        with pytest.raises(TypeError):
            SourceAdapter()

    def test_concrete_subclass_must_implement_fetch(self):
        class Incomplete(SourceAdapter):
            pass

        with pytest.raises(TypeError):
            Incomplete()

    def test_name_derived_from_class(self):
        class FooAdapter(SourceAdapter):
            def fetch(self):
                return iter([])

        assert FooAdapter().name == "foo"


# ── _strip_wikitext_noise ─────────────────────────────────────────────────────

class TestStripWikitextNoise:
    def test_removes_citation_markers(self):
        assert "[1]" not in _strip_wikitext_noise("text [1] more")
        assert "[2]" not in _strip_wikitext_noise("text [2] more")

    def test_removes_templates(self):
        assert "{{cite}}" not in _strip_wikitext_noise("text {{cite}} end")

    def test_normalises_multiple_spaces(self):
        result = _strip_wikitext_noise("hello   world")
        assert "  " not in result

    def test_clean_text_unchanged_structurally(self):
        text = "The water cycle is a natural process."
        result = _strip_wikitext_noise(text)
        assert "water cycle" in result


# ── WikipediaAdapter ──────────────────────────────────────────────────────────

def _make_summary_response(extract: str) -> MagicMock:
    resp = MagicMock()
    resp.json.return_value = {"extract": extract}
    resp.raise_for_status.return_value = None
    return resp


def _make_sections_response(title: str, sections_text: str) -> MagicMock:
    resp = MagicMock()
    resp.json.return_value = {
        "query": {
            "pages": {
                "1": {
                    "title": title,
                    "extract": sections_text,
                }
            }
        }
    }
    resp.raise_for_status.return_value = None
    return resp


_SHORT_LEAD = "The water cycle describes the continuous movement of water."

# A body section with ~180 words for summarize_written_text
_LONG_SECTION = " ".join(["word"] * 180)
_FULL_TEXT_WITH_SECTION = f"Lead paragraph here.\n\n== Process ==\n{_LONG_SECTION}\n\n== References ==\nRef1\nRef2"


class TestWikipediaAdapter:
    def _run_adapter(self, topics, side_effects):
        adapter = WikipediaAdapter(topics=topics, rate_limit_secs=0)
        with patch("httpx.get", side_effect=side_effects):
            return list(adapter.fetch())

    def test_yields_read_aloud_from_lead(self):
        effects = [
            _make_summary_response(_SHORT_LEAD),
            _make_sections_response("Water cycle", "Lead.\n\n== Irrelevant ==\nshort"),
        ]
        results = self._run_adapter(["Water cycle"], effects)
        ra = [r for r in results if r.task_type == "read_aloud"]
        assert len(ra) == 1
        assert "water cycle" in ra[0].text.lower()

    def test_yields_summarize_written_text_from_section(self):
        effects = [
            _make_summary_response("Short lead."),
            _make_sections_response("Climate", _FULL_TEXT_WITH_SECTION),
        ]
        results = self._run_adapter(["Climate"], effects)
        swt = [r for r in results if r.task_type == "summarize_written_text"]
        assert len(swt) == 1

    def test_skips_references_section(self):
        full_text = "Lead.\n\n== References ==\n" + " ".join(["ref"] * 200)
        effects = [
            _make_summary_response("Short lead."),
            _make_sections_response("Topic", full_text),
        ]
        results = self._run_adapter(["Topic"], effects)
        swt = [r for r in results if r.task_type == "summarize_written_text"]
        assert len(swt) == 0

    def test_license_is_cc(self):
        effects = [
            _make_summary_response("Lead text here."),
            _make_sections_response("Topic", "Lead."),
        ]
        results = self._run_adapter(["Topic"], effects)
        for r in results:
            assert "CC" in r.license

    def test_source_url_contains_title(self):
        effects = [
            _make_summary_response("Climate change is real."),
            _make_sections_response("Climate change", "Lead."),
        ]
        results = self._run_adapter(["Climate change"], effects)
        for r in results:
            assert "Climate_change" in r.source_url

    def test_http_error_skips_article(self):
        bad_resp = MagicMock()
        bad_resp.raise_for_status.side_effect = Exception("404")
        good_sections = _make_sections_response("Topic", "Lead only.")
        effects = [bad_resp, good_sections]
        results = self._run_adapter(["Topic"], effects)
        ra = [r for r in results if r.task_type == "read_aloud"]
        assert len(ra) == 0

    def test_limit_caps_articles(self):
        topics = ["A", "B", "C"]
        summary = _make_summary_response("Short")
        sections = _make_sections_response("X", "Lead.")
        effects = [summary, sections] * 2  # only 2 articles worth
        adapter = WikipediaAdapter(topics=topics, limit=2, rate_limit_secs=0)
        with patch("httpx.get", side_effect=effects):
            results = list(adapter.fetch())
        # Only 2 articles should have been attempted (A, B)
        titles_seen = {r.raw_meta.get("title") for r in results}
        assert "C" not in titles_seen

    def test_pre_filters_very_short_sections(self):
        short_section_text = "Lead.\n\n== Section ==\n" + " ".join(["w"] * 50)
        effects = [
            _make_summary_response("Lead."),
            _make_sections_response("Topic", short_section_text),
        ]
        results = self._run_adapter(["Topic"], effects)
        swt = [r for r in results if r.task_type == "summarize_written_text"]
        assert len(swt) == 0

    def test_adapter_name(self):
        assert WikipediaAdapter().name == "wikipedia"
