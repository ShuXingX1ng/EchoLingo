"""M3 A0-Rater: the five experts' raw scores from `scores-detail.json`, the
rater-mean targets and spread heads built on them, and the single-expert
agreement reference -- against synthetic scores (no real data, no GPU)."""

from __future__ import annotations

from pathlib import Path

import pytest
import torch
from torch.utils.data import DataLoader

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.data.manifest import ManifestRecord
from echolingo_speech.data.speechocean import (
    _load_split,
    build_manifest,
    parse_rater_phones,
    rater_scores,
    stratified_validation_speakers,
)
from echolingo_speech.evaluation.rater_agreement import rater_agreement
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.checkpoint import load_model
from echolingo_speech.training.config import TrainingConfig
from echolingo_speech.training.dataset import (
    PhoneExample,
    ScoringExample,
    WordExample,
    _match_words_and_phones,
    collate_fn,
)
from echolingo_speech.training.labels import (
    rater_phone_targets,
    rater_sentence_targets,
    rater_word_targets,
)
from echolingo_speech.training.loop import evaluate, fit
from echolingo_speech.training.losses import compute_total_loss, rater_spread_loss


def _detail_word(text: str, accuracy: list[float], phones: list[str]) -> dict:
    return {
        "text": text,
        "accuracy": accuracy,
        "stress": [10.0] * 5,
        "total": accuracy,
        "ref-phones": "",
        "phones": phones,
    }


def _detail(words: list[dict]) -> dict:
    return {
        "accuracy": [8.0, 8.0, 7.0, 9.0, 8.0],
        "completeness": [1.0] * 5,
        "fluency": [7.0] * 5,
        "prosodic": [7.0] * 5,
        "total": [7.0] * 5,
        "words": words,
    }


# --- labels ---------------------------------------------------------------


def test_rater_sentence_targets_mean_and_spread_on_unit_scale():
    centers, spreads = rater_sentence_targets(
        {
            "accuracy": [6.0, 8.0, 8.0, 8.0, 10.0],
            "fluency": [7.0] * 5,
            "prosodic": [7.0] * 5,
            # completeness is a 0-1 ratio in scores-detail.json
            "completeness": [1.0, 1.0, 1.0, 1.0, 0.5],
        }
    )
    assert centers["accuracy"] == pytest.approx(0.8)
    assert spreads["accuracy"] == pytest.approx(0.016**0.5)
    assert spreads["fluency"] == 0.0
    assert centers["completeness"] == pytest.approx(0.9)


def test_rater_word_targets_soft_stress_and_rejects_unknown_stress():
    targets = rater_word_targets(
        {"accuracy": [10.0, 10.0, 10.0, 10.0, 0.0], "stress": [10.0, 10.0, 5.0, 10.0, 5.0]}
    )
    assert targets["accuracy"] == pytest.approx(0.8)
    assert targets["accuracy_spread"] == pytest.approx(0.4)
    assert targets["stress"] == pytest.approx(0.6)

    with pytest.raises(ValueError, match="stress"):
        rater_word_targets({"accuracy": [10.0] * 5, "stress": [10.0, 10.0, 10.0, 10.0, 7.0]})


def test_rater_phone_targets_uses_zero_to_two_scale():
    mean, spread = rater_phone_targets([2.0, 2.0, 0.0, 2.0, 2.0])
    assert mean == pytest.approx(0.8)
    assert spread == pytest.approx(0.4)


# --- scores-detail.json parsing --------------------------------------------


def test_parse_rater_phones_reads_notation_and_drops_insertions():
    assert parse_rater_phones("B EH0 R") == [2.0, 2.0, 2.0]
    assert parse_rater_phones("B {EH0} (R)") == [2.0, 1.0, 0.0]
    assert parse_rater_phones("B EH0 [L] R") == [2.0, 2.0, 2.0]


def test_rater_scores_transposes_phones_per_canonical_position():
    words = [{"text": "BEAR", "phones-accuracy": [2.0, 1.2, 1.2]}]
    detail = _detail(
        [
            _detail_word(
                "BEAR",
                [3.0, 7.0, 10.0, 2.0, 6.0],
                ["B (EH0) (R)", "B {EH0} {R}", "B EH0 R", "B (EH0) (R)", "B EH0 [L] R"],
            )
        ]
    )

    raters = rater_scores("u1", detail, words)

    assert raters["sentence"]["accuracy"] == [8.0, 8.0, 7.0, 9.0, 8.0]
    assert raters["words"][0]["accuracy"] == [3.0, 7.0, 10.0, 2.0, 6.0]
    assert raters["words"][0]["phones-accuracy"] == [
        [2.0, 2.0, 2.0, 2.0, 2.0],
        [0.0, 1.0, 2.0, 0.0, 2.0],
        [0.0, 1.0, 2.0, 0.0, 2.0],
    ]


@pytest.mark.parametrize(
    ("words", "detail_words", "message"),
    [
        (
            [{"text": "WE", "phones-accuracy": [2.0, 2.0]}],
            [],
            "words",
        ),
        (
            [{"text": "WE", "phones-accuracy": [2.0, 2.0]}],
            [_detail_word("WHO", [10.0] * 5, ["W IY0"] * 5)],
            "WHO",
        ),
        (
            [{"text": "WE", "phones-accuracy": [2.0, 2.0]}],
            [_detail_word("WE", [10.0] * 5, ["W IY0"] * 4 + ["W"])],
            "phone counts",
        ),
        (
            [{"text": "WE", "phones-accuracy": [2.0, 2.0]}],
            [_detail_word("WE", [10.0] * 4, ["W IY0"] * 5)],
            "rater scores",
        ),
    ],
)
def test_rater_scores_refuses_entries_that_do_not_line_up(words, detail_words, message):
    with pytest.raises(ValueError, match=message):
        rater_scores("u1", _detail(detail_words), words)


def test_build_manifest_attaches_rater_scores(speechocean_mini_corpus: Path):
    train_utterances = _load_split(speechocean_mini_corpus, "train")
    records = build_manifest(
        speechocean_mini_corpus,
        dataset_version="test-version",
        source_url="https://example.invalid/speechocean762.tar.gz",
        validation_speakers=set(stratified_validation_speakers(train_utterances, ratio=0.5)),
        code_version="test-code-version",
    )

    raters = records[0].scores["raters"]
    assert raters["sentence"]["fluency"] == [7.0, 6.0, 7.0, 8.0, 7.0]
    assert raters["words"][0]["phones-accuracy"] == [[2.0] * 5, [2.0, 1.0, 0.0, 2.0, 1.0]]


# --- dataset ----------------------------------------------------------------


def _one_word_inputs() -> tuple[list, list, list, list]:
    word_spans = [TextGridSpan(0.0, 1.0, "we")]
    phone_spans = [TextGridSpan(0.0, 0.5, "W"), TextGridSpan(0.5, 1.0, "IY1")]
    canonical = [
        {
            "text": "WE",
            "accuracy": 10,
            "stress": 10,
            "total": 10,
            "phones": ["W", "IY0"],
            "phones-accuracy": [2.0, 1.6],
        }
    ]
    rater_words = [
        {
            "accuracy": [10.0, 10.0, 10.0, 10.0, 0.0],
            "stress": [10.0, 10.0, 5.0, 10.0, 5.0],
            "phones-accuracy": [[2.0] * 5, [2.0, 2.0, 0.0, 2.0, 2.0]],
        }
    ]
    return word_spans, phone_spans, canonical, rater_words


def test_rater_words_add_spread_but_keep_official_targets_by_default():
    word_spans, phone_spans, canonical, rater_words = _one_word_inputs()

    words, phones, _ = _match_words_and_phones(
        word_spans, phone_spans, canonical, 1.0, 100, rater_words=rater_words
    )

    assert words[0].accuracy == pytest.approx(1.0)  # official median
    assert words[0].stress == 1.0
    assert words[0].accuracy_spread == pytest.approx(0.4)
    assert phones[1].accuracy == pytest.approx(0.8)  # official 1.6 / 2
    assert [phone.accuracy_spread for phone in phones] == pytest.approx([0.0, 0.4])


def test_rater_targets_replace_official_targets_with_expert_mean():
    word_spans, phone_spans, canonical, rater_words = _one_word_inputs()

    words, phones, _ = _match_words_and_phones(
        word_spans, phone_spans, canonical, 1.0, 100, rater_words=rater_words, rater_targets=True
    )

    assert words[0].accuracy == pytest.approx(0.8)
    assert words[0].stress == pytest.approx(0.6)
    assert phones[1].accuracy == pytest.approx(0.8)


def test_rater_targets_without_rater_scores_fail_loudly():
    word_spans, phone_spans, canonical, _ = _one_word_inputs()
    with pytest.raises(ValueError, match="rater"):
        _match_words_and_phones(word_spans, phone_spans, canonical, 1.0, 100, rater_targets=True)


# --- model, loss and loop ----------------------------------------------------


def _spread_example(sample_id: str, accuracy: float, *, with_spread: bool = True) -> ScoringExample:
    spread = 0.1 * accuracy if with_spread else None
    return ScoringExample(
        sample_id=sample_id,
        hidden_states=torch.randn(10, 768),
        sentence_targets=torch.tensor([accuracy, 1.0 - accuracy, accuracy, 1.0]),
        acoustic_features=torch.randn(9),
        word_examples=[
            WordExample(0, 3, accuracy, 1.0, accuracy_spread=spread),
            WordExample(3, 6, 1.0 - accuracy, 0.0, accuracy_spread=spread),
        ],
        phone_examples=[PhoneExample(0, 1, accuracy, accuracy_spread=spread)],
        word_alignment_valid=True,
        sentence_spread=torch.full((4,), spread) if with_spread else None,
    )


def _spread_loader(**kwargs) -> DataLoader:
    examples = [_spread_example(f"S{i}", a, **kwargs) for i, a in enumerate([0.2, 0.5, 0.8, 1.0])]
    return DataLoader(examples, batch_size=2, collate_fn=collate_fn)


def test_scorer_spread_heads_only_when_enabled():
    batch = next(iter(_spread_loader()))
    model = SpeechEvaluatorA0(predict_rater_spread=True).eval()
    with torch.no_grad():
        output = model(batch)
        plain = SpeechEvaluatorA0().eval()(batch)

    assert output["sentence_spread"].shape == (2, 4)
    assert [tensor.shape for tensor in output["word_spread"]] == [(2,), (2,)]
    assert [tensor.shape for tensor in output["phone_spread"]] == [(1,), (1,)]
    assert torch.all((output["sentence_spread"] >= 0) & (output["sentence_spread"] <= 1))
    assert "sentence_spread" not in plain


def test_spread_term_is_added_with_its_own_weight():
    batch = next(iter(_spread_loader()))
    torch.manual_seed(0)
    model = SpeechEvaluatorA0(predict_rater_spread=True).eval()
    with torch.no_grad():
        predictions = model(batch)
    without = compute_total_loss(predictions, batch)
    with_spread = compute_total_loss(predictions, batch, rater_spread_weight=2.0)

    assert "spread" not in without
    assert with_spread["scoring"] == pytest.approx(without["total"].item())
    assert with_spread["total"] == pytest.approx(
        (without["total"] + 2.0 * with_spread["spread"]).item()
    )


def test_spread_loss_needs_rater_scores_on_every_record():
    batch = next(iter(_spread_loader(with_spread=False)))
    model = SpeechEvaluatorA0(predict_rater_spread=True).eval()
    with torch.no_grad():
        predictions = model(batch)
    with pytest.raises(ValueError, match="rater"):
        rater_spread_loss(predictions, batch)


def test_fit_with_spread_reports_spread_metrics_and_reloads(tmp_path: Path):
    config = TrainingConfig(predict_rater_spread=True, max_epochs=2)
    loader = _spread_loader()

    model, result = fit(loader, loader, config, seed=0, device="cpu", checkpoint_dir=tmp_path)
    metrics = evaluate(model, loader, "cpu", config)

    for key in ("sentence_accuracy", "sentence_fluency", "word", "phone"):
        assert f"rater_spread_{key}_pearson" in metrics
        assert f"rater_spread_{key}_mae" in metrics
    assert metrics["rater_spread_loss"] > 0
    # Validation loss (early stopping, LR schedule) leaves the spread term out.
    plain_config = TrainingConfig(predict_rater_spread=False)
    assert metrics["loss"] == pytest.approx(evaluate(model, loader, "cpu", plain_config)["loss"])
    reloaded = load_model(result["best_checkpoint"], "cpu")
    assert reloaded.config["predict_rater_spread"] is True


# --- agreement reference ------------------------------------------------------


def _agreement_record(sample_id: str, sentence: list[float], word: list[float]) -> ManifestRecord:
    return ManifestRecord.model_validate(
        {
            "sample_id": sample_id,
            "dataset": "speechocean762",
            "dataset_version": "v",
            "source": {
                "origin": "o",
                "resource_id": 1,
                "url": "u",
                "license": "l",
                "citation": "c",
            },
            "speaker_id": "s",
            "speaker_age_group": "adult",
            "speaker_gender": "m",
            "official_split": "train",
            "partition": "validation",
            "consent_class": "c",
            "audio": {"relative_path": "a", "sha256": "h", "duration_sec": 1.0, "sample_rate": 1},
            "text_reference": "WE",
            "scores": {
                "sentence": {},
                "words": [],
                "raters": {
                    "sentence": {key: sentence for key in ("accuracy", "fluency", "prosodic")},
                    "words": [
                        {
                            "accuracy": word,
                            "stress": [10.0] * 5,
                            "phones-accuracy": [[score / 5 for score in word]],
                        }
                    ],
                },
            },
            "derivation": {"code_version": "c", "generated_at": "t"},
        }
    )


def test_unanimous_experts_agree_perfectly():
    records = [
        _agreement_record("SPEAKER1_a", [3.0] * 5, [2.0] * 5),
        _agreement_record("SPEAKER1_b", [6.0] * 5, [6.0] * 5),
        _agreement_record("SPEAKER1_c", [9.0] * 5, [10.0] * 5),
    ]

    result = rater_agreement(records)

    assert result["sentence_accuracy_pearson"] == pytest.approx(1.0)
    assert result["word_accuracy_pearson"] == pytest.approx(1.0)
    assert result["word_error_detection_macro_f1"] == pytest.approx(1.0)
    assert result["phone_accuracy_pearson"] == pytest.approx(1.0)
    assert result["words"] == 3
