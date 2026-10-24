"""The A0 frozen-encoder multi-task scoring network (ADR-0011 SS5.2).

Three pooling levels over frozen Wav2Vec2 hidden states feed six heads:
sentence accuracy/fluency/prosodic/completeness (attentive statistics pooling
+ explicit acoustic features), word accuracy/stress (mean-pooled word spans),
and phoneme accuracy (mean-pooled phone spans), plus optional heads for the
experts' score spread at each level (M3 A0-Rater) and optional training-only
masks on the hidden states (M3 A0-Aug). The encoder itself never
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


def _pool_spans(
    hidden_states: torch.Tensor, spans: list, keep: torch.Tensor | None = None
) -> torch.Tensor:
    """Mean-pool frames inside each span for one utterance. Returns a
    `(0, hidden_dim)` tensor when `spans` is empty (e.g. a record whose word
    alignment was masked invalid) -- every downstream Linear/head handles a
    zero-length batch dimension without special-casing. `keep` (`(T,)` bool)
    leaves time-masked frames out, but never all of a span's frames: a span
    the mask covers entirely is pooled over all of them, so every label keeps
    the evidence it was given for.
    """
    if not spans:
        return hidden_states.new_zeros((0, hidden_states.shape[-1]))
    pooled = []
    for span in spans:
        frames = hidden_states[span.frame_start : span.frame_end]
        if keep is not None:
            span_keep = keep[span.frame_start : span.frame_end]
            if span_keep.any():
                frames = frames[span_keep]
        pooled.append(frames.mean(dim=0))
    return torch.stack(pooled)


def _time_mask(frame_mask: torch.Tensor, start_prob: float, max_width: int) -> torch.Tensor:
    """Frames to keep, `(B, T)` bool: each frame starts a mask with
    probability `start_prob`, of a width drawn from 1..`max_width` frames."""
    batch_size, num_frames = frame_mask.shape
    starts = torch.rand(batch_size, num_frames, device=frame_mask.device) < start_prob
    widths = torch.randint(1, max_width + 1, (batch_size, num_frames), device=frame_mask.device)
    masked = torch.zeros_like(frame_mask)
    for offset in range(min(max_width, num_frames)):
        covers = starts & (widths > offset)
        masked[:, offset:] |= covers[:, : num_frames - offset]
    return ~masked


def _channel_mask(batch_size: int, hidden_dim: int, ratio: float, device) -> torch.Tensor:
    """Channels to keep, `(B, H)` bool, with exactly `round(ratio * H)`
    channels dropped per utterance."""
    dropped = round(ratio * hidden_dim)
    ranks = torch.rand(batch_size, hidden_dim, device=device).argsort(dim=1).argsort(dim=1)
    return ranks >= dropped


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
        num_hidden_layers: int = 1,
        predict_rater_spread: bool = False,
        time_mask_prob: float = 0.0,
        time_mask_max_width: int = 2,
        channel_mask_ratio: float = 0.0,
        encoder_input_normalized: bool = False,
        encoder_adapter: str | None = None,
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
            "num_hidden_layers": num_hidden_layers,
            "predict_rater_spread": predict_rater_spread,
            "time_mask_prob": time_mask_prob,
            "time_mask_max_width": time_mask_max_width,
            "channel_mask_ratio": channel_mask_ratio,
            # Which feature cache the model was trained on (no effect on the
            # forward pass): `training/loop.py` refuses to score it on the other.
            "encoder_input_normalized": encoder_input_normalized,
            # Likewise the CTC LoRA adapter merged into the encoder (M3 A1).
            "encoder_adapter": encoder_adapter,
        }
        # Several cached encoder layers are mixed by a learned softmax weight
        # per layer (initially uniform) before any pooling.
        if num_hidden_layers > 1:
            self.layer_weights = nn.Parameter(torch.zeros(num_hidden_layers))
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

        # Expert spread (std on [0, 1]) read off the same trunks: one output
        # per sentence target, one per word, one per phone.
        if predict_rater_spread:
            self.sentence_spread_head = nn.Linear(sentence_trunk_dim, len(SENTENCE_TARGET_KEYS))
            self.word_spread_head = nn.Linear(word_trunk_dim, 1)
            self.phone_spread_head = nn.Linear(phone_trunk_dim, 1)

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
        if self.config["num_hidden_layers"] > 1:
            # (B, L, T, H) -> (B, T, H)
            weights = torch.softmax(self.layer_weights, dim=0)
            hidden_states = torch.einsum("l,bltd->btd", weights, hidden_states)

        # M3 A0-Aug feature masks, training only: time-masked frames are left
        # out of every pooling, masked channels are zeroed for the whole
        # utterance.
        keep = None
        pool_mask = frame_mask
        if self.training and self.config["time_mask_prob"] > 0:
            keep = _time_mask(
                frame_mask, self.config["time_mask_prob"], self.config["time_mask_max_width"]
            )
            pool_mask = frame_mask & keep
            emptied = ~pool_mask.any(dim=1)
            pool_mask = torch.where(emptied.unsqueeze(1), frame_mask, pool_mask)
        if self.training and self.config["channel_mask_ratio"] > 0:
            channel_keep = _channel_mask(
                hidden_states.shape[0],
                hidden_states.shape[-1],
                self.config["channel_mask_ratio"],
                hidden_states.device,
            )
            hidden_states = hidden_states * channel_keep.unsqueeze(1).to(hidden_states.dtype)

        acoustic = batch["acoustic_features"]
        if self.config["normalize_acoustic_features"]:
            acoustic = (acoustic - self.acoustic_mean) / self.acoustic_std
        sentence_pooled = self.sentence_pooling(hidden_states, pool_mask)
        sentence_input = torch.cat([sentence_pooled, acoustic], dim=-1)
        sentence_trunk_out = self.sentence_trunk(sentence_input)
        sentence_scores = torch.cat(
            [
                torch.sigmoid(self.sentence_heads[key](sentence_trunk_out))
                for key in SENTENCE_TARGET_KEYS
            ],
            dim=-1,
        )  # (B, 4), column order == SENTENCE_TARGET_KEYS == dataset.py's target order

        predict_spread = self.config["predict_rater_spread"]
        word_accuracy: list[torch.Tensor] = []
        word_stress_logit: list[torch.Tensor] = []
        phone_accuracy: list[torch.Tensor] = []
        word_spread: list[torch.Tensor] = []
        phone_spread: list[torch.Tensor] = []

        for b in range(hidden_states.shape[0]):
            sample_keep = keep[b] if keep is not None else None
            word_pooled = _pool_spans(hidden_states[b], batch["word_examples"][b], sample_keep)
            if self.config["use_canonical_phones"]:
                word_pooled = torch.cat(
                    [word_pooled, self._word_phone_context(batch["word_examples"][b])], dim=-1
                )
            word_trunk_out = self.word_trunk(word_pooled)
            word_accuracy.append(
                torch.sigmoid(self.word_accuracy_head(word_trunk_out)).squeeze(-1)
            )
            word_stress_logit.append(self.word_stress_head(word_trunk_out).squeeze(-1))
            if predict_spread:
                word_spread.append(
                    torch.sigmoid(self.word_spread_head(word_trunk_out)).squeeze(-1)
                )

            phone_pooled = _pool_spans(hidden_states[b], batch["phone_examples"][b], sample_keep)
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
            if predict_spread:
                phone_spread.append(
                    torch.sigmoid(self.phone_spread_head(phone_trunk_out)).squeeze(-1)
                )

        outputs = {
            "sentence_scores": sentence_scores,
            "word_accuracy": word_accuracy,
            "word_stress_logit": word_stress_logit,
            "phone_accuracy": phone_accuracy,
        }
        if predict_spread:
            outputs["sentence_spread"] = torch.sigmoid(
                self.sentence_spread_head(sentence_trunk_out)
            )  # (B, 4), column order == SENTENCE_TARGET_KEYS
            outputs["word_spread"] = word_spread
            outputs["phone_spread"] = phone_spread
        return outputs
