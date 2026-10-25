"""The Speech Evaluation Worker's private response contract.

Scores stay on the bundle's label scales (sentence and word 0-10, phone 0-2;
`label-schema.json`): the provider-neutral public result, the 10-90
Provisional Score Normalization and the Content gate belong to FastAPI (M5),
which is the only caller. Every level carries an evidence status so a
missing or unreliable level is reported, never filled in.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

EvidenceState = Literal["available", "partial", "degraded", "unavailable"]
# Why a level is not fully available.
EvidenceReason = Literal[
    "alignment_failed",
    "word_count_mismatch",
    "reference_not_read",
    "out_of_vocabulary",
]
WordStatus = Literal["scored", "out_of_vocabulary"]
# A recording (or, for a multi-sentence reference, a sentence cut) shorter or
# longer than any training recording.
ResultWarning = Literal["duration_outside_training_range"]


class LevelEvidence(BaseModel):
    status: EvidenceState
    reason: EvidenceReason | None = None


class EvidenceStatus(BaseModel):
    sentence: LevelEvidence
    word: LevelEvidence
    phoneme: LevelEvidence


class SentenceScores(BaseModel):
    accuracy: float
    fluency: float
    prosodic: float
    # Not validated (sealed-test Pearson about 0); reported as the model
    # output only.
    completeness: float


class PhonemeResult(BaseModel):
    phone: str
    start_sec: float
    end_sec: float
    accuracy: float
    is_error: bool


class WordResult(BaseModel):
    index: int
    text: str
    start_sec: float
    end_sec: float
    status: WordStatus
    # None for an out-of-vocabulary word: the scorer never saw a word
    # without its canonical phones in training.
    accuracy: float | None = None
    is_error: bool | None = None
    stress_correct_probability: float | None = None
    phonemes: list[PhonemeResult] = []


class Timing(BaseModel):
    decode_ms: float
    encoder_ms: float
    alignment_ms: float
    scoring_ms: float
    total_ms: float


class EvaluationResult(BaseModel):
    bundle_id: str
    task_type: Literal["read_aloud"] = "read_aloud"
    duration_sec: float
    reference_text: str
    recognized_text: str
    # Share of the reference words, and of its letters, found in order in
    # the free ASR output. Learner speech often scores low on words alone.
    reference_word_coverage: float
    reference_character_coverage: float
    # Letter coverage above what an unrelated text reaches by chance (0 at
    # chance, 1 for every letter): the `reference_not_read` gate and
    # FastAPI's Read Aloud Content use it.
    reference_character_coverage_corrected: float
    # The `reference_not_read` gate this result was judged against.
    reference_not_read_below: float
    evidence_status: EvidenceStatus
    sentence: SentenceScores
    # Empty unless word evidence is available or partial.
    words: list[WordResult]
    # How many reference sentences were scored separately (1: the whole
    # recording in one pass).
    segment_count: int = 1
    warnings: list[ResultWarning] = []
    timing: Timing


ErrorCode = Literal[
    "invalid_request",
    "invalid_audio",
    "audio_too_large",
    "audio_too_short",
    "audio_too_long",
    "no_speech",
    "worker_busy",
    "timeout",
    "internal_error",
]


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class HealthResponse(BaseModel):
    status: Literal["ready"]
    bundle_id: str
    encoder_model_id: str
    encoder_revision: str
    aligner: str
    aligner_version: str
    device: str
    limits: dict[str, float]
