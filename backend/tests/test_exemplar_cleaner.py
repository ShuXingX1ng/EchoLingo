"""
Tests for the Stimulus Exemplar cleaning pipeline.

Covers: markup stripping, English detection, length gates, SHA-256 dedup,
and the full clean_exemplars() pipeline (LLM gate mocked throughout).
"""

from unittest.mock import patch

import pytest

from scripts.scrape_exemplars.base import RawExemplar
from scripts.scrape_exemplars.cleaner import (
    CleanExemplar,
    apply_length_gate,
    clean_exemplars,
    dedup_by_hash,
    is_english,
    sha256_hash,
    strip_markup,
    word_count,
    print_metrics,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_raw(
    text: str,
    task_type: str = "read_aloud",
    source_url: str = "https://example.com",
    license: str = "CC BY-SA 4.0",
) -> RawExemplar:
    return RawExemplar(task_type=task_type, text=text, source_url=source_url, license=license)


def _words(n: int) -> str:
    return " ".join(["Academic"] * n) + "."


# ── strip_markup ──────────────────────────────────────────────────────────────

class TestStripMarkup:
    def test_removes_citation_numbers(self):
        result = strip_markup("Climate change [1] is serious [23].")
        assert "[1]" not in result
        assert "[23]" not in result

    def test_removes_citation_needed(self):
        assert "[citation needed]" not in strip_markup("fact [citation needed] here")

    def test_removes_edit_marker(self):
        assert "[edit]" not in strip_markup("Section title [edit]")

    def test_removes_template_markers(self):
        assert "{{cite" not in strip_markup("text {{cite web|url=x}} more")

    def test_removes_html_entities(self):
        result = strip_markup("price &amp; value &lt;100&gt;")
        assert "&amp;" not in result
        assert "price & value" in result

    def test_normalises_whitespace(self):
        result = strip_markup("hello   world\t\tagain")
        assert "  " not in result
        assert result.startswith("hello world")

    def test_removes_bare_urls(self):
        result = strip_markup("see https://en.wikipedia.org/wiki/Foo for details")
        assert "https://" not in result

    def test_clean_text_preserved(self):
        text = "The process of photosynthesis converts light energy into chemical energy."
        assert strip_markup(text) == text


# ── is_english ────────────────────────────────────────────────────────────────

class TestIsEnglish:
    def test_english_text(self):
        assert is_english("The quick brown fox jumps over the lazy dog.") is True

    def test_mostly_ascii_accepted(self):
        # A word or two with accents but predominantly English
        assert is_english("Café culture in England is widespread.") is True

    def test_non_latin_script_rejected(self):
        assert is_english("气候变化是全球面临的重大挑战。") is False

    def test_arabic_rejected(self):
        assert is_english("تغير المناخ مشكلة عالمية.") is False

    def test_empty_string_rejected(self):
        assert is_english("") is False


# ── word_count ────────────────────────────────────────────────────────────────

class TestWordCount:
    def test_simple_sentence(self):
        assert word_count("one two three") == 3

    def test_single_word(self):
        assert word_count("hello") == 1

    def test_empty(self):
        assert word_count("") == 0


# ── sha256_hash ───────────────────────────────────────────────────────────────

class TestSha256Hash:
    def test_deterministic(self):
        assert sha256_hash("hello") == sha256_hash("hello")

    def test_different_texts_different_hashes(self):
        assert sha256_hash("hello") != sha256_hash("world")

    def test_returns_hex_string(self):
        h = sha256_hash("test")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# ── apply_length_gate ─────────────────────────────────────────────────────────

class TestApplyLengthGate:
    def test_read_aloud_passes_at_limit(self):
        ok, reason = apply_length_gate(_words(60), "read_aloud")
        assert ok is True
        assert reason == ""

    def test_read_aloud_rejects_too_long(self):
        ok, reason = apply_length_gate(_words(61), "read_aloud")
        assert ok is False
        assert "too_long" in reason

    def test_read_aloud_rejects_too_short(self):
        ok, reason = apply_length_gate(_words(5), "read_aloud")
        assert ok is False
        assert "too_short" in reason

    def test_swt_passes_in_range(self):
        ok, reason = apply_length_gate(_words(200), "summarize_written_text")
        assert ok is True

    def test_swt_rejects_below_150(self):
        ok, reason = apply_length_gate(_words(100), "summarize_written_text")
        assert ok is False
        assert "too_short" in reason

    def test_swt_rejects_above_300(self):
        ok, reason = apply_length_gate(_words(350), "summarize_written_text")
        assert ok is False
        assert "too_long" in reason

    def test_unknown_task_type_always_passes(self):
        ok, reason = apply_length_gate("anything", "unknown_type")
        assert ok is True


# ── dedup_by_hash ─────────────────────────────────────────────────────────────

class TestDedupByHash:
    def test_removes_exact_duplicates(self):
        items = [
            _make_raw("same text here"),
            _make_raw("same text here"),
            _make_raw("different text"),
        ]
        result = dedup_by_hash(items)
        assert len(result) == 2

    def test_keeps_first_occurrence(self):
        items = [
            _make_raw("dup", source_url="first"),
            _make_raw("dup", source_url="second"),
        ]
        result = dedup_by_hash(items)
        assert result[0].source_url == "first"

    def test_no_duplicates_unchanged(self):
        items = [_make_raw(f"text {i}") for i in range(5)]
        assert len(dedup_by_hash(items)) == 5

    def test_empty_list(self):
        assert dedup_by_hash([]) == []


# ── clean_exemplars full pipeline ─────────────────────────────────────────────

_LLM_ACCEPT = {"status": "accept", "reason": "good quality"}
_LLM_REJECT = {"status": "reject", "reason": "too informal"}


class TestCleanExemplarsPipeline:
    """All tests mock llm_gate so no real API calls are made."""

    def test_accepts_valid_read_aloud(self):
        text = _words(30)
        raw = [_make_raw(text, task_type="read_aloud")]
        with patch("scripts.scrape_exemplars.cleaner.llm_gate", return_value=_LLM_ACCEPT):
            results = clean_exemplars(raw, skip_llm=False)
        assert len(results) == 1
        assert results[0].status == "accept"

    def test_rejects_non_english(self):
        raw = [_make_raw("气候变化是全球性挑战。", task_type="read_aloud")]
        results = clean_exemplars(raw, skip_llm=True)
        assert results[0].status == "reject"
        assert results[0].reason == "non_english"

    def test_rejects_too_long_read_aloud(self):
        raw = [_make_raw(_words(100), task_type="read_aloud")]
        results = clean_exemplars(raw, skip_llm=True)
        assert results[0].status == "reject"
        assert "too_long" in results[0].reason

    def test_rejects_too_short_swt(self):
        raw = [_make_raw(_words(50), task_type="summarize_written_text")]
        results = clean_exemplars(raw, skip_llm=True)
        assert results[0].status == "reject"
        assert "too_short" in results[0].reason

    def test_dedup_second_identical_rejected(self):
        text = _words(30)
        raw = [
            _make_raw(text, task_type="read_aloud", source_url="url1"),
            _make_raw(text, task_type="read_aloud", source_url="url2"),
        ]
        with patch("scripts.scrape_exemplars.cleaner.llm_gate", return_value=_LLM_ACCEPT):
            results = clean_exemplars(raw)
        assert results[0].status == "accept"
        assert results[1].status == "reject"
        assert results[1].reason == "duplicate"

    def test_llm_reject_propagates(self):
        raw = [_make_raw(_words(30), task_type="read_aloud")]
        with patch("scripts.scrape_exemplars.cleaner.llm_gate", return_value=_LLM_REJECT):
            results = clean_exemplars(raw, skip_llm=False)
        assert results[0].status == "reject"
        assert results[0].reason == "too informal"

    def test_skip_llm_auto_accepts(self):
        raw = [_make_raw(_words(30), task_type="read_aloud")]
        results = clean_exemplars(raw, skip_llm=True)
        assert results[0].status == "accept"
        assert "llm_skipped" in results[0].reason

    def test_output_fields_present(self):
        raw = [_make_raw(_words(30), task_type="read_aloud")]
        results = clean_exemplars(raw, skip_llm=True)
        d = results[0].to_dict()
        required_fields = {
            "task_type", "normalized_text", "status", "reason",
            "word_count", "lang", "source_url", "license",
        }
        assert required_fields.issubset(d.keys())

    def test_markup_stripped_before_gate(self):
        text_with_markup = _words(30) + " [1] {{cite}}"
        raw = [_make_raw(text_with_markup, task_type="read_aloud")]
        results = clean_exemplars(raw, skip_llm=True)
        assert "[1]" not in results[0].normalized_text
        assert "{{cite}}" not in results[0].normalized_text

    def test_empty_input_returns_empty(self):
        assert clean_exemplars([], skip_llm=True) == []


# ── print_metrics (smoke test) ────────────────────────────────────────────────

class TestPrintMetrics:
    def test_runs_without_error(self, capsys):
        items = [
            CleanExemplar("read_aloud", "t", "u", "l", "accept", "ok", 30, "en"),
            CleanExemplar("read_aloud", "t2", "u", "l", "reject", "too_short (5 words < 10)", 5, "en"),
            CleanExemplar("summarize_written_text", "t3", "u", "l", "accept", "ok", 200, "en"),
        ]
        print_metrics(items)
        out = capsys.readouterr().out
        assert "read_aloud" in out
        assert "summarize_written_text" in out
        assert "accepted=1" in out
