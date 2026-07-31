"""The A0 frozen-encoder multi-task scoring network (ADR-0011 SS5.2).

Three pooling levels over frozen Wav2Vec2 hidden states feed six heads:
sentence accuracy/fluency/prosodic/completeness (attentive statistics pooling
+ explicit acoustic features), word accuracy/stress (mean-pooled word spans),
and phoneme accuracy (mean-pooled phone spans). The encoder itself never
appears here -- `training/dataset.py` already loads its frozen hidden states
from M1's cache, so this module only ever sees `(T, 768)` tensors.
"""

from __future__ import annotations

import torch
from torch import nn

from echolingo_speech.training.labels import SENTENCE_TARGET_KEYS


class AttentiveStatisticsPooling(nn.Module):
    """x-vector-style stats pooling: a learned per-frame attention weight,
    softmaxed over the valid (non-padding) frames, used to compute both a
    weighted mean and a weighted std -- the std captures within-utterance
    variability (relevant to fluency/prosody) that a mean alone would erase.
    """

    def __init__(self, hidden_dim: int) -> None:
        super().__init__()
        self.attention = nn.Linear(hidden_dim, 1)

    def forward(self, hidden_states: torch.Tensor, frame_mask: torch.Tensor) -> torch.Tensor:
        scores = self.attention(hidden_states).squeeze(-1)  # (B, T)
        scores = scores.masked_fill(~frame_mask, float("-inf"))
        weights = torch.softmax(scores, dim=-1).unsqueeze(-1)  # (B, T, 1)

        mean = (weights * hidden_states).sum(dim=1)  # (B, H)
        variance = (weights * (hidden_states - mean.unsqueeze(1)).pow(2)).sum(dim=1)
        std = torch.sqrt(variance.clamp(min=1e-8))
        return torch.cat([mean, std], dim=-1)  # (B, 2H)


def _pool_spans(hidden_states: torch.Tensor, spans: list) -> torch.Tensor:
    """Mean-pool frames inside each span for one utterance. Returns a
    `(0, hidden_dim)` tensor when `spans` is empty (e.g. a record whose word
    alignment was masked invalid) -- every downstream Linear/head handles a
    zero-length batch dimension without special-casing.
    """
    if not spans:
        return hidden_states.new_zeros((0, hidden_states.shape[-1]))
    return torch.stack(
        [hidden_states[span.frame_start : span.frame_end].mean(dim=0) for span in spans]
    )


class SpeechEvaluatorA0(nn.Module):
    def __init__(
        self,
        hidden_dim: int = 768,
        num_acoustic_features: int = 9,
        sentence_trunk_dim: int = 256,
        word_trunk_dim: int = 128,
        phone_trunk_dim: int = 64,
        dropout: float = 0.3,
    ) -> None:
        super().__init__()
        self.sentence_pooling = AttentiveStatisticsPooling(hidden_dim)
        sentence_input_dim = hidden_dim * 2 + num_acoustic_features
        self.sentence_trunk = nn.Sequential(
            nn.Linear(sentence_input_dim, sentence_trunk_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.sentence_heads = nn.ModuleDict(
            {key: nn.Linear(sentence_trunk_dim, 1) for key in SENTENCE_TARGET_KEYS}
        )

        self.word_trunk = nn.Sequential(
            nn.Linear(hidden_dim, word_trunk_dim), nn.ReLU(), nn.Dropout(dropout)
        )
        self.word_accuracy_head = nn.Linear(word_trunk_dim, 1)
        self.word_stress_head = nn.Linear(word_trunk_dim, 1)

        self.phone_trunk = nn.Sequential(
            nn.Linear(hidden_dim, phone_trunk_dim), nn.ReLU(), nn.Dropout(dropout)
        )
        self.phone_accuracy_head = nn.Linear(phone_trunk_dim, 1)

    def forward(self, batch: dict) -> dict:
        hidden_states = batch["hidden_states"]
        frame_mask = batch["frame_mask"]

        sentence_pooled = self.sentence_pooling(hidden_states, frame_mask)
        sentence_input = torch.cat([sentence_pooled, batch["acoustic_features"]], dim=-1)
        sentence_trunk_out = self.sentence_trunk(sentence_input)
        sentence_scores = torch.cat(
            [
                torch.sigmoid(self.sentence_heads[key](sentence_trunk_out))
                for key in SENTENCE_TARGET_KEYS
            ],
            dim=-1,
        )  # (B, 4), column order == SENTENCE_TARGET_KEYS == dataset.py's target order

        word_accuracy: list[torch.Tensor] = []
        word_stress_logit: list[torch.Tensor] = []
        phone_accuracy: list[torch.Tensor] = []

        for b in range(hidden_states.shape[0]):
            word_pooled = _pool_spans(hidden_states[b], batch["word_examples"][b])
            word_trunk_out = self.word_trunk(word_pooled)
            word_accuracy.append(
                torch.sigmoid(self.word_accuracy_head(word_trunk_out)).squeeze(-1)
            )
            word_stress_logit.append(self.word_stress_head(word_trunk_out).squeeze(-1))

            phone_pooled = _pool_spans(hidden_states[b], batch["phone_examples"][b])
            phone_trunk_out = self.phone_trunk(phone_pooled)
            phone_accuracy.append(
                torch.sigmoid(self.phone_accuracy_head(phone_trunk_out)).squeeze(-1)
            )

        return {
            "sentence_scores": sentence_scores,
            "word_accuracy": word_accuracy,
            "word_stress_logit": word_stress_logit,
            "phone_accuracy": phone_accuracy,
        }
