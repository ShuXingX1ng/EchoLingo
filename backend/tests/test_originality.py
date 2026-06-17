"""
Unit tests for services/originality.py — the word-shingle Jaccard guard.
Purely local; no mocks needed.
"""

from services.originality import (
    OVERLAP_THRESHOLD,
    SHINGLE_N,
    is_too_similar,
    jaccard,
    max_overlap,
    shingles,
)


class TestShingles:
    def test_basic_4grams(self):
        text = "the quick brown fox jumps"
        # 5 tokens, 4-gram → 2 shingles
        assert shingles(text) == {
            ("the", "quick", "brown", "fox"),
            ("quick", "brown", "fox", "jumps"),
        }

    def test_lowercased_and_punctuation_stripped(self):
        assert shingles("The Quick, BROWN fox!") == shingles("the quick brown fox")

    def test_short_text_collapses_to_single_shingle(self):
        # Fewer than SHINGLE_N tokens → one shingle of all tokens.
        assert shingles("one two") == {("one", "two")}

    def test_empty_text(self):
        assert shingles("") == set()


class TestJaccard:
    def test_identical_text_is_one(self):
        text = "scientists study the effects of climate change on coral reefs"
        assert jaccard(text, text) == 1.0

    def test_disjoint_text_is_zero(self):
        a = "the quick brown fox jumps over"
        b = "completely different unrelated words appear here now"
        assert jaccard(a, b) == 0.0

    def test_partial_overlap_between_0_and_1(self):
        a = "the economy grew rapidly last year despite headwinds"
        b = "the economy grew rapidly this decade despite challenges"
        score = jaccard(a, b)
        assert 0.0 < score < 1.0

    def test_empty_inputs_are_zero(self):
        assert jaccard("", "anything at all here") == 0.0


class TestMaxOverlapAndGuard:
    def test_max_overlap_picks_highest(self):
        gen = "the economy grew rapidly last year despite headwinds today"
        exemplars = [
            "completely unrelated text about marine biology and reefs",
            "the economy grew rapidly last year despite headwinds today",  # identical
        ]
        assert max_overlap(gen, exemplars) == 1.0

    def test_max_overlap_no_exemplars_is_zero(self):
        assert max_overlap("anything here", []) == 0.0

    def test_guard_trips_on_near_verbatim(self):
        exemplar = "renewable energy adoption has accelerated across developed nations in recent years"
        # Near-verbatim copy → overlap above threshold.
        gen = "renewable energy adoption has accelerated across developed nations in recent years"
        assert is_too_similar(gen, [exemplar]) is True

    def test_guard_passes_original_text(self):
        exemplar = "renewable energy adoption has accelerated across developed nations in recent years"
        gen = "solar panels now power millions of homes thanks to falling manufacturing costs"
        assert is_too_similar(gen, [exemplar]) is False

    def test_threshold_is_exclusive(self):
        # Exactly at threshold should NOT trip (guard uses strict >).
        assert is_too_similar("x", ["y"], threshold=OVERLAP_THRESHOLD) is False

    def test_defaults_exist(self):
        assert SHINGLE_N == 4
        assert OVERLAP_THRESHOLD == 0.5
