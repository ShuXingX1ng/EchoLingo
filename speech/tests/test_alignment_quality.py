"""MFA text normalization and alignment-quality parsing, against hand-written
TextGrid fixtures (no MFA subprocess/conda env involved — that's exercised for real
in the WSL2 execution step, not in unit tests)."""

from __future__ import annotations

from pathlib import Path

from echolingo_speech.alignment.mfa import (
    normalize_text,
    parse_alignment_output,
    parse_textgrid_spans,
    quality_report,
)
from echolingo_speech.data.manifest import AudioInfo, DerivationInfo, ManifestRecord, SourceInfo

_TEXTGRID_TEMPLATE = """File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 2
item []:
    item [1]:
        class = "IntervalTier"
        name = "words"
        xmin = 0
        xmax = 1
        intervals: size = {word_interval_count}
{word_intervals}
    item [2]:
        class = "IntervalTier"
        name = "phones"
        xmin = 0
        xmax = 1
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 1
            text = "DH"
"""


def _word_interval(index: int, start: float, end: float, text: str) -> str:
    return (
        f"        intervals [{index}]:\n"
        f"            xmin = {start}\n"
        f"            xmax = {end}\n"
        f'            text = "{text}"\n'
    )


def _write_textgrid(path: Path, words: list[str]) -> None:
    step = 1.0 / max(1, len(words))
    intervals = "".join(
        _word_interval(i + 1, i * step, (i + 1) * step, word) for i, word in enumerate(words)
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        _TEXTGRID_TEMPLATE.format(word_interval_count=len(words), word_intervals=intervals),
        encoding="utf-8",
    )


def _record(sample_id: str, speaker_id: str, text_reference: str) -> ManifestRecord:
    return ManifestRecord(
        sample_id=sample_id,
        dataset="speechocean762",
        dataset_version="deadbeef",
        source=SourceInfo(
            origin="openslr",
            resource_id=101,
            url="https://example.invalid/speechocean762.tar.gz",
            license="CC-BY-4.0",
            citation="zhang2021speechocean762",
        ),
        speaker_id=speaker_id,
        speaker_age_group="adult",
        speaker_gender="m",
        official_split="train",
        partition="train",
        consent_class="public_licensed_corpus",
        audio=AudioInfo(
            relative_path="WAVE/x.WAV", sha256="abc", duration_sec=1.0, sample_rate=16000
        ),
        text_reference=text_reference,
        scores={},
        derivation=DerivationInfo(
            code_version="deadbeef", generated_at="2026-07-23T00:00:00+00:00"
        ),
    )


def test_normalize_text_lowercases_and_strips_punctuation():
    assert normalize_text("The Quick, Brown Fox!") == "the quick brown fox"


def test_normalize_text_keeps_apostrophes():
    assert normalize_text("Don't stop") == "don't stop"


def test_fully_aligned_utterance_is_marked_aligned(tmp_path: Path):
    output_dir = tmp_path / "aligned"
    record = _record("SPEAKER0001_a", "0001", "the quick")
    _write_textgrid(output_dir / "SPEAKER0001" / "SPEAKER0001_a.TextGrid", ["the", "quick"])

    updated = parse_alignment_output([record], output_dir)

    assert updated[0].alignment.status == "aligned"
    assert updated[0].alignment.quality_score == 1.0
    assert updated[0].alignment.unaligned_word_count == 0


def test_partially_aligned_utterance_is_marked_degraded(tmp_path: Path):
    output_dir = tmp_path / "aligned"
    record = _record("SPEAKER0001_b", "0001", "the quick brown fox")
    _write_textgrid(output_dir / "SPEAKER0001" / "SPEAKER0001_b.TextGrid", ["the"])

    updated = parse_alignment_output([record], output_dir)

    assert updated[0].alignment.status == "degraded"
    assert updated[0].alignment.quality_score == 0.25
    assert updated[0].alignment.unaligned_word_count == 3


def test_missing_textgrid_is_marked_failed(tmp_path: Path):
    output_dir = tmp_path / "aligned"
    record = _record("SPEAKER0001_c", "0001", "the quick")

    updated = parse_alignment_output([record], output_dir)

    assert updated[0].alignment.status == "failed"
    assert updated[0].alignment.quality_score == 0.0


def test_quality_report_aggregates_by_status_and_age_group(tmp_path: Path):
    output_dir = tmp_path / "aligned"
    aligned = _record("SPEAKER0001_a", "0001", "the quick")
    _write_textgrid(output_dir / "SPEAKER0001" / "SPEAKER0001_a.TextGrid", ["the", "quick"])
    failed = _record("SPEAKER0001_c", "0001", "the quick")

    updated = parse_alignment_output([aligned, failed], output_dir)
    report = quality_report(updated)

    assert report["total"] == 2
    assert report["by_status"]["aligned"] == 1
    assert report["by_status"]["failed"] == 1
    assert report["by_age_group"]["adult"]["aligned"] == 1
    assert report["by_age_group"]["adult"]["failed"] == 1


_TWO_TIER_TEXTGRID = """File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1.2
tiers? <exists>
size = 2
item []:
    item [1]:
        class = "IntervalTier"
        name = "words"
        xmin = 0
        xmax = 1.2
        intervals: size = 3
        intervals [1]:
            xmin = 0.0
            xmax = 0.1
            text = ""
        intervals [2]:
            xmin = 0.1
            xmax = 0.6
            text = "we"
        intervals [3]:
            xmin = 0.6
            xmax = 1.2
            text = "call"
    item [2]:
        class = "IntervalTier"
        name = "phones"
        xmin = 0
        xmax = 1.2
        intervals: size = 4
        intervals [1]:
            xmin = 0.0
            xmax = 0.1
            text = ""
        intervals [2]:
            xmin = 0.1
            xmax = 0.35
            text = "W"
        intervals [3]:
            xmin = 0.35
            xmax = 0.6
            text = "IY1"
        intervals [4]:
            xmin = 0.6
            xmax = 1.2
            text = "K"
"""


def test_parse_textgrid_spans_filters_blanks_and_preserves_time_order(tmp_path: Path):
    path = tmp_path / "sample.TextGrid"
    path.write_text(_TWO_TIER_TEXTGRID, encoding="utf-8")

    word_spans, phone_spans = parse_textgrid_spans(path)

    assert [span.text for span in word_spans] == ["we", "call"]
    assert word_spans[0].start == 0.1
    assert word_spans[0].end == 0.6
    assert word_spans[1].start == 0.6
    assert word_spans[1].end == 1.2

    assert [span.text for span in phone_spans] == ["W", "IY1", "K"]
    assert phone_spans[0].start == 0.1
    assert phone_spans[-1].end == 1.2
