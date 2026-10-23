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

from echolingo_speech.training.labels import NUM_PHONE_IDS, SENTENCE_TARGET_KEYS


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
        normalize_acoustic_features: bool = False,
        use_canonical_phones: bool = False,
        phone_embedding_dim: int = 32,
    ) -> None:
        super().__init__()
        # Constructor arguments, recorded so a checkpoint can rebuild this
        # exact shape (`training/checkpoint.py`) and a run can log it.
        self.config = {
            "hidden_dim": hidden_dim,
            "num_acoustic_features": num_acoustic_features,
            "sentence_trunk_dim": sentence_trunk_dim,
            "word_trunk_dim": word_trunk_dim,
            "phone_trunk_dim": phone_trunk_dim,
            "dropout": dropout,
            "normalize_acoustic_features": normalize_acoustic_features,
            "use_canonical_phones": use_canonical_phones,
            "phone_embedding_dim": phone_embedding_dim,
        }
        # Training-partition mean/std of the explicit acoustic features (Hz,
        # seconds, counts on very different scales), stored as buffers so a
        # checkpoint carries them; set by `set_acoustic_normalization`.
        if normalize_acoustic_features:
            self.register_buffer("acoustic_mean", torch.zeros(num_acoustic_features))
            self.register_buffer("acoustic_std", torch.ones(num_acoustic_features))
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

        # With canonical phones, word and phone spans are paired with what
        # *should* have been said: the phone's own identity embedding, or the
        # mean of a word's phone embeddings (which also covers words never seen
        # in training, unlike a per-word embedding).
        span_input_dim = hidden_dim
        if use_canonical_phones:
            self.phone_embedding = nn.Embedding(NUM_PHONE_IDS, phone_embedding_dim)
            span_input_dim += phone_embedding_dim
        self.word_trunk = nn.Sequential(
            nn.Linear(span_input_dim, word_trunk_dim), nn.ReLU(), nn.Dropout(dropout)
        )
        self.word_accuracy_head = nn.Linear(word_trunk_dim, 1)
        self.word_stress_head = nn.Linear(word_trunk_dim, 1)

        self.phone_trunk = nn.Sequential(
            nn.Linear(span_input_dim, phone_trunk_dim), nn.ReLU(), nn.Dropout(dropout)
        )
        self.phone_accuracy_head = nn.Linear(phone_trunk_dim, 1)

    def set_acoustic_normalization(self, mean: torch.Tensor, std: torch.Tensor) -> None:
        if not self.config["normalize_acoustic_features"]:
            raise ValueError("model was built with normalize_acoustic_features=False")
        self.acoustic_mean.copy_(mean)
        # A feature constant over the training set would divide by zero.
        self.acoustic_std.copy_(std.clamp(min=1e-6))

    def _word_phone_context(self, words: list) -> torch.Tensor:
        """Mean canonical-phone embedding per word, `(len(words), dim)`; a
        word with no canonical phones gets the zero vector."""
        weight = self.phone_embedding.weight
        rows = []
        for word in words:
            if word.phone_ids:
                ids = torch.tensor(word.phone_ids, dtype=torch.long, device=weight.device)
                rows.append(self.phone_embedding(ids).mean(dim=0))
            else:
                rows.append(weight.new_zeros(weight.shape[1]))
        if not rows:
            return weight.new_zeros((0, weight.shape[1]))
        return torch.stack(rows)

    def forward(self, batch: dict) -> dict:
        hidden_states = batch["hidden_states"]
        frame_mask = batch["frame_mask"]

        acoustic = batch["acoustic_features"]
        if self.config["normalize_acoustic_features"]:
            acoustic = (acoustic - self.acoustic_mean) / self.acoustic_std
        sentence_pooled = self.sentence_pooling(hidden_states, frame_mask)
        sentence_input = torch.cat([sentence_pooled, acoustic], dim=-1)
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
            if self.config["use_canonical_phones"]:
                word_pooled = torch.cat(
                    [word_pooled, self._word_phone_context(batch["word_examples"][b])], dim=-1
                )
            word_trunk_out = self.word_trunk(word_pooled)
            word_accuracy.append(
                torch.sigmoid(self.word_accuracy_head(word_trunk_out)).squeeze(-1)
            )
            word_stress_logit.append(self.word_stress_head(word_trunk_out).squeeze(-1))

            phone_pooled = _pool_spans(hidden_states[b], batch["phone_examples"][b])
            if self.config["use_canonical_phones"]:
                phone_ids = torch.tensor(
                    [phone.phone_id for phone in batch["phone_examples"][b]],
                    dtype=torch.long,
                    device=phone_pooled.device,
                )
                phone_pooled = torch.cat([phone_pooled, self.phone_embedding(phone_ids)], dim=-1)
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
