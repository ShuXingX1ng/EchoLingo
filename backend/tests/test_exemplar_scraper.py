"""
Tests for the Stimulus Exemplar scraping package.

Covers: RawExemplar dataclass, SourceAdapter interface, WikipediaAdapter parsing,
JijingAdapter file reading (all HTTP calls are mocked — no real network requests).
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from scripts.scrape_exemplars.base import RawExemplar, SourceAdapter
from scripts.scrape_exemplars.sources.jijing import JijingAdapter
from scripts.scrape_exemplars.sources.wikipedia import (
    WikipediaAdapter,
    _build_asq_prompt,
    _build_image_scenario,
    _split_sentences,
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

    def test_yields_repeat_sentence_from_lead(self):
        # Lead with two clear sentences of ~12 words each.
        lead = (
            "Photosynthesis is the process by which plants convert sunlight into energy. "
            "It occurs primarily in the chloroplasts of plant cells."
        )
        effects = [
            _make_summary_response(lead),
            _make_sections_response("Photosynthesis", "Lead.\n\n== Irrelevant ==\nshort"),
        ]
        results = self._run_adapter(["Photosynthesis"], effects)
        rs = [r for r in results if r.task_type == "repeat_sentence"]
        assert len(rs) >= 1
        assert all(6 <= _word_count(r.text) <= 28 for r in rs)

    def test_yields_write_from_dictation_from_lead(self):
        lead = (
            "DNA carries genetic information in all living organisms. "
            "It is found in the nucleus of every cell."
        )
        effects = [
            _make_summary_response(lead),
            _make_sections_response("DNA", "Lead."),
        ]
        results = self._run_adapter(["DNA"], effects)
        wfd = [r for r in results if r.task_type == "write_from_dictation"]
        assert len(wfd) >= 1
        assert all(6 <= _word_count(r.text) <= 20 for r in wfd)

    def test_yields_answer_short_question(self):
        effects = [
            _make_summary_response("Short lead."),
            _make_sections_response("Evolution", "Lead."),
        ]
        results = self._run_adapter(["Evolution"], effects)
        asq = [r for r in results if r.task_type == "answer_short_question"]
        assert len(asq) == 1
        assert "?" in asq[0].text
        assert asq[0].raw_meta.get("section") == "question"

    def test_yields_describe_image(self):
        effects = [
            _make_summary_response("Short lead."),
            _make_sections_response("Climate change", "Lead."),
        ]
        results = self._run_adapter(["Climate change"], effects)
        di = [r for r in results if r.task_type == "describe_image"]
        assert len(di) == 1
        # Should contain chart/graph/map language
        assert any(
            word in di[0].text.lower()
            for word in ("chart", "graph", "map", "table", "diagram")
        )

    def test_repeat_sentence_not_emitted_from_very_short_lead(self):
        # A lead that is itself under 6 words yields no repeat_sentence.
        effects = [
            _make_summary_response("Short."),
            _make_sections_response("Topic", "Lead."),
        ]
        results = self._run_adapter(["Topic"], effects)
        rs = [r for r in results if r.task_type == "repeat_sentence"]
        assert len(rs) == 0

    def test_repeat_sentence_from_body_paragraphs(self):
        # A body paragraph long enough for sentence extraction.
        body_sentences = (
            "Renewable energy sources include solar, wind, and hydroelectric power. "
            "These sources produce little to no greenhouse gas emissions during operation. "
            "Their adoption has accelerated significantly over the past two decades."
        )
        full_text = f"Lead.\n\n== Overview ==\n{body_sentences}"
        effects = [
            _make_summary_response("Short lead."),
            _make_sections_response("Renewable energy", full_text),
        ]
        results = self._run_adapter(["Renewable energy"], effects)
        rs = [r for r in results if r.task_type == "repeat_sentence"]
        assert len(rs) >= 1

    def test_nine_task_types_emitted_per_article(self):
        """With a body paragraph at the right length, all nine task types can appear."""
        body = " ".join(["word"] * 130)  # triggers swt / re_tell_lecture / sst
        full_text = f"Lead.\n\n== Section ==\n{body}"
        # Lead with a clear sentence for repeat/wfd
        lead = (
            "The Internet connects billions of people worldwide. "
            "It has transformed communication and commerce fundamentally."
        )
        effects = [
            _make_summary_response(lead),
            _make_sections_response("Internet", full_text),
        ]
        results = self._run_adapter(["Internet"], effects)
        task_types_seen = {r.task_type for r in results}
        expected = {
            "read_aloud", "write_essay", "answer_short_question", "describe_image",
            "summarize_written_text", "re_tell_lecture", "summarize_spoken_text",
            "repeat_sentence", "write_from_dictation",
        }
        assert expected.issubset(task_types_seen)


# ── _split_sentences ──────────────────────────────────────────────────────────

class TestSplitSentences:
    def test_splits_two_sentences(self):
        text = "The sky is blue. The grass is green."
        parts = _split_sentences(text)
        assert len(parts) == 2

    def test_single_sentence_returns_one(self):
        text = "Biodiversity refers to the variety of life on Earth."
        parts = _split_sentences(text)
        assert len(parts) == 1

    def test_ignores_headings_without_terminal_punct(self):
        # A heading-like string with no terminal punctuation is skipped.
        text = "Overview of the Topic"
        assert _split_sentences(text) == []

    def test_exclamation_and_question_marks(self):
        text = "Is this a sentence? Yes, it is!"
        parts = _split_sentences(text)
        assert len(parts) == 2


# ── _build_asq_prompt ─────────────────────────────────────────────────────────

class TestBuildAsqPrompt:
    def test_contains_question_mark(self):
        prompt = _build_asq_prompt("Climate change", 0)
        assert "?" in prompt

    def test_topic_in_prompt(self):
        prompt = _build_asq_prompt("Biotechnology", 3)
        assert "biotechnology" in prompt.lower()

    def test_rotates_frames(self):
        prompts = {_build_asq_prompt("Topic", i) for i in range(12)}
        assert len(prompts) > 1


# ── _build_image_scenario ─────────────────────────────────────────────────────

class TestBuildImageScenario:
    def test_contains_chart_or_graph_keyword(self):
        scenario = _build_image_scenario("Urbanization", 0)
        assert any(k in scenario.lower() for k in ("chart", "graph", "map", "table", "diagram"))

    def test_topic_in_scenario(self):
        scenario = _build_image_scenario("Urbanization", 1)
        assert "urbanization" in scenario.lower()

    def test_rotates_frames(self):
        scenarios = {_build_image_scenario("Topic", i) for i in range(8)}
        assert len(scenarios) > 1


# ── JijingAdapter ──────────────────────────────────────────────────────────────

class TestJijingAdapter:
    def _write_jsonl(self, tmp_dir: Path, records: list[dict]) -> Path:
        p = tmp_dir / "jijing.jsonl"
        with p.open("w", encoding="utf-8") as fh:
            for rec in records:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return p

    def test_yields_exemplars_from_valid_file(self, tmp_path):
        p = self._write_jsonl(tmp_path, [
            {"task_type": "repeat_sentence", "text": "The ocean covers most of the Earth."},
            {"task_type": "read_aloud", "text": "Climate change affects global weather patterns."},
        ])
        adapter = JijingAdapter(data_path=p)
        results = list(adapter.fetch())
        assert len(results) == 2
        assert results[0].task_type == "repeat_sentence"
        assert results[1].task_type == "read_aloud"

    def test_skips_records_with_skip_flag(self, tmp_path):
        p = self._write_jsonl(tmp_path, [
            {"task_type": "read_aloud", "text": "Valid sentence here.", "skip": False},
            {"task_type": "read_aloud", "text": "This one is flagged.", "skip": True},
        ])
        results = list(JijingAdapter(data_path=p).fetch())
        assert len(results) == 1
        assert "Valid" in results[0].text

    def test_skips_missing_task_type_or_text(self, tmp_path):
        p = self._write_jsonl(tmp_path, [
            {"task_type": "read_aloud"},          # missing text
            {"text": "No task type here."},        # missing task_type
            {"task_type": "repeat_sentence", "text": "Good sentence."},
        ])
        results = list(JijingAdapter(data_path=p).fetch())
        assert len(results) == 1

    def test_skips_malformed_json_lines(self, tmp_path):
        p = tmp_path / "jijing.jsonl"
        with p.open("w") as fh:
            fh.write('{"task_type": "read_aloud", "text": "Good."}\n')
            fh.write("NOT JSON\n")
            fh.write('{"task_type": "read_aloud", "text": "Also good."}\n')
        results = list(JijingAdapter(data_path=p).fetch())
        assert len(results) == 2

    def test_returns_empty_when_file_missing(self, tmp_path):
        missing = tmp_path / "does_not_exist.jsonl"
        results = list(JijingAdapter(data_path=missing).fetch())
        assert results == []

    def test_limit_caps_items(self, tmp_path):
        p = self._write_jsonl(tmp_path, [
            {"task_type": "read_aloud", "text": f"Sentence number {i}."}
            for i in range(10)
        ])
        results = list(JijingAdapter(data_path=p, limit=3).fetch())
        assert len(results) == 3

    def test_adapter_name(self, tmp_path):
        p = self._write_jsonl(tmp_path, [])
        assert JijingAdapter(data_path=p).name == "jijing"

    def test_license_defaults_and_custom(self, tmp_path):
        p = self._write_jsonl(tmp_path, [
            {"task_type": "read_aloud", "text": "Default license."},
            {"task_type": "read_aloud", "text": "Custom license.", "license": "CC0"},
        ])
        results = list(JijingAdapter(data_path=p).fetch())
        assert results[0].license == "community-recall"
        assert results[1].license == "CC0"

    def test_source_recorded_in_raw_meta(self, tmp_path):
        p = self._write_jsonl(tmp_path, [
            {"task_type": "read_aloud", "text": "A sentence.", "source": "pte_forum_2024"},
        ])
        results = list(JijingAdapter(data_path=p).fetch())
        assert results[0].raw_meta["source"] == "pte_forum_2024"
