"""Masked multi-task loss composition for A0 (ADR-0011 SS5.3):

    L_total = 0.45 * L_sentence + 0.30 * L_word + 0.25 * L_phone

Each level is normalized/averaged within its own valid examples before the
fixed top-level weights are applied, so neither utterance length (more
phones) nor a batch's mix of valid/invalid alignments can distort those
weights. Huber (Smooth L1) is used for every regression target -- more
robust than MSE to the rare severe-mispronunciation outlier scores without
losing convexity; word stress is a dedicated BCE term since the real label is
strictly binary (see `training/labels.py`), not a regression target.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F

SENTENCE_WEIGHT = 0.45
WORD_WEIGHT = 0.30
PHONE_WEIGHT = 0.25


def sentence_loss(sentence_scores: torch.Tensor, sentence_targets: torch.Tensor) -> torch.Tensor:
    """Sentence labels are always present (no masking needed); averaging over
    the whole (B, 4) tensor is equivalent to averaging the four per-dimension
    means since every column has the same batch size.
    """
    return F.huber_loss(sentence_scores, sentence_targets, reduction="mean")


def word_loss(
    word_accuracy: list[torch.Tensor],
    word_stress_logit: list[torch.Tensor],
    word_examples: list[list],
    word_alignment_valid: list[bool],
) -> torch.Tensor:
    """Records with an invalid (mismatched-count) word alignment are excluded
    entirely; within a valid record, accuracy (Huber) and stress (BCE) are
    averaged per word, then averaged across words in that record, then
    averaged across valid records in the batch.
    """
    per_record_losses = []
    for accuracy_pred, stress_logit_pred, examples, is_valid in zip(
        word_accuracy, word_stress_logit, word_examples, word_alignment_valid
    ):
        if not is_valid or not examples:
            continue
        accuracy_targets = torch.tensor(
            [example.accuracy for example in examples],
            dtype=accuracy_pred.dtype,
            device=accuracy_pred.device,
        )
        stress_targets = torch.tensor(
            [example.stress for example in examples],
            dtype=stress_logit_pred.dtype,
            device=stress_logit_pred.device,
        )

        accuracy_huber = F.huber_loss(accuracy_pred, accuracy_targets, reduction="mean")
        stress_bce = F.binary_cross_entropy_with_logits(
            stress_logit_pred, stress_targets, reduction="mean"
        )
        per_record_losses.append((accuracy_huber + stress_bce) / 2)

    if not per_record_losses:
        return torch.zeros((), device=word_accuracy[0].device if word_accuracy else None)
    return torch.stack(per_record_losses).mean()


def phone_loss(phone_accuracy: list[torch.Tensor], phone_examples: list[list]) -> torch.Tensor:
    """Mean Huber over every mask-valid phone in the batch, flattened across
    records rather than averaged per-record-then-across-records: unlike word
    loss (where every record contributes one word-level term regardless of
    word count), phones per word can be masked independently, so a flat pool
    keeps the phone-count-per-word decision from silently reweighting records.
    """
    predictions = [pred for pred, examples in zip(phone_accuracy, phone_examples) if examples]
    if not predictions:
        return torch.zeros((), device=phone_accuracy[0].device if phone_accuracy else None)

    targets = [
        torch.tensor(
            [example.accuracy for example in examples], dtype=pred.dtype, device=pred.device
        )
        for pred, examples in zip(phone_accuracy, phone_examples)
        if examples
    ]
    return F.huber_loss(torch.cat(predictions), torch.cat(targets), reduction="mean")


def compute_total_loss(predictions: dict, batch: dict) -> dict[str, torch.Tensor]:
    l_sentence = sentence_loss(predictions["sentence_scores"], batch["sentence_targets"])
    l_word = word_loss(
        predictions["word_accuracy"],
        predictions["word_stress_logit"],
        batch["word_examples"],
        batch["word_alignment_valid"],
    )
    l_phone = phone_loss(predictions["phone_accuracy"], batch["phone_examples"])

    total = SENTENCE_WEIGHT * l_sentence + WORD_WEIGHT * l_word + PHONE_WEIGHT * l_phone
    return {"total": total, "sentence": l_sentence, "word": l_word, "phone": l_phone}
