"""One Read Aloud recording through the bundle's scorer (roadmap SS3, SS10.4).

decode -> Wav2Vec2 (hidden-state layers and the CTC head's free ASR from one
forward pass) -> forced alignment -> the same span, phone-id and acoustic
feature code training used (`training/dataset.py`, `features/acoustic.py`)
-> scorer -> scores on the label scales with an evidence status per level.

Layered degradation instead of fabricated evidence:

- alignment fails, or its word count differs from the reference: no word or
  phoneme results; sentence scores are still computed but `degraded`, since
  their pause and timing features came from (absent) word spans;
- almost none of the reference is in the free ASR output (another language,
  another passage): the same, with reason `reference_not_read`;
- an out-of-dictionary word: that word gets no score and no phonemes, and
  word/phoneme evidence is `partial`.

Recordings that cannot be scored at all raise `EvaluationError`.
"""

from __future__ import annotations

import io
import logging
import time
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from echolingo_speech.alignment.mfa import TextGridSpan, normalize_text
from echolingo_speech.bundles.bundle import LoadedBundle
from echolingo_speech.features.acoustic import compute_acoustic_features, feature_vector
from echolingo_speech.features.cache import TARGET_SAMPLE_RATE
from echolingo_speech.training.dataset import (
    PhoneExample,
    WordExample,
    phones_for_word,
    span_to_frame_range,
)
from echolingo_speech.training.labels import (
    PHONE_SCALE,
    SENTENCE_SCALE,
    SENTENCE_TARGET_KEYS,
    WORD_SCALE,
    canonical_phone_id,
)
from echolingo_speech.worker.aligner import (
    UNKNOWN_PHONE_LABEL,
    UNKNOWN_WORD_LABEL,
    Aligner,
    Alignment,
    AlignmentError,
)
from echolingo_speech.worker.schema import (
    EvaluationResult,
    EvidenceStatus,
    LevelEvidence,
    PhonemeResult,
    SentenceScores,
    Timing,
    WordResult,
)

logger = logging.getLogger(__name__)


class EvaluationError(Exception):
    """A request the Worker refuses to score, with its public error code."""

    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class Limits:
    min_duration_sec: float = 1.0
    max_duration_sec: float = 60.0
    max_upload_bytes: int = 25 * 1024 * 1024
    # Peak |amplitude| below this is digital silence (MFA aligns text even
    # to silence, so this is checked before anything else runs).
    silence_peak: float = 1e-3
    # Word and phoneme evidence is withheld (`reference_not_read`) below this
    # share of the reference's letters found, in order, in the free ASR
    # output. Chosen on validation (2026-10-25): no real reading fell below
    # 0.30, and 9% of recordings paired with another validation sentence fell
    # below 0.25. Word coverage was no use as a gate: 8% of real readings
    # had none of their words recognized.
    min_reference_character_coverage: float = 0.25

    def as_dict(self) -> dict[str, float]:
        return {name: float(value) for name, value in asdict(self).items()}


def decode_audio(data: bytes, limits: Limits) -> torch.Tensor:
    """`(1, N)` mono float32 at 16 kHz, as `features/cache.py::_load_waveform`
    produced for training (channel mean, then torchaudio resampling)."""
    import torchaudio

    if len(data) > limits.max_upload_bytes:
        raise EvaluationError(
            "audio_too_large", f"upload exceeds {limits.max_upload_bytes} bytes", 413
        )
    try:
        samples, sample_rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    except (sf.LibsndfileError, RuntimeError, TypeError) as exc:
        raise EvaluationError("invalid_audio", f"cannot decode audio: {exc}") from exc
    if samples.size == 0:
        raise EvaluationError("invalid_audio", "audio has no samples")
    waveform = torch.from_numpy(samples.mean(axis=1, dtype=np.float32)).unsqueeze(0)
    if sample_rate != TARGET_SAMPLE_RATE:
        waveform = torchaudio.functional.resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
    duration = waveform.shape[-1] / TARGET_SAMPLE_RATE
    if duration < limits.min_duration_sec:
        raise EvaluationError(
            "audio_too_short", f"{duration:.2f} s is shorter than {limits.min_duration_sec:g} s"
        )
    if duration > limits.max_duration_sec:
        raise EvaluationError(
            "audio_too_long", f"{duration:.2f} s is longer than {limits.max_duration_sec:g} s"
        )
    if waveform.abs().max().item() < limits.silence_peak:
        raise EvaluationError("no_speech", "the recording is silent")
    return waveform


@dataclass(frozen=True)
class EncodedAudio:
    # (L, T, H) float32, rounded through float16 as the training cache was.
    hidden_states: torch.Tensor
    recognized_text: str


class Wav2Vec2Encoder:
    """The pinned encoder with its own CTC head: one forward pass gives the
    scorer's layers and the free ASR transcript. The waveform goes in raw
    (no `do_normalize`), as in every training cache."""

    def __init__(
        self,
        model_id: str,
        revision: str,
        layers: tuple[int, ...],
        *,
        cache_dir: Path | None = None,
        device: str = "cpu",
    ) -> None:
        from huggingface_hub import hf_hub_download
        from transformers import Wav2Vec2ForCTC

        from echolingo_speech.encoder.loquacious import CharVocab

        self.model_id = model_id
        self.revision = revision
        self.layers = tuple(layers)
        self.device = device
        self.model = Wav2Vec2ForCTC.from_pretrained(
            model_id, revision=revision, cache_dir=cache_dir
        )
        self.model.to(device)
        self.model.eval()
        self.vocab = CharVocab.from_file(
            Path(hf_hub_download(model_id, "vocab.json", revision=revision, cache_dir=cache_dir))
        )
        if self.model.config.vocab_size != len(self.vocab.token_to_id):
            raise ValueError(
                f"vocab.json has {len(self.vocab.token_to_id)} tokens, the CTC head "
                f"{self.model.config.vocab_size}"
            )

    @torch.no_grad()
    def encode(self, waveform: torch.Tensor) -> EncodedAudio:
        output = self.model(waveform.to(self.device), output_hidden_states=True)
        stacked = torch.stack([output.hidden_states[i].squeeze(0) for i in self.layers])
        ids = output.logits.argmax(dim=-1).squeeze(0).cpu().tolist()
        return EncodedAudio(
            hidden_states=stacked.to(torch.float16).float().cpu(),
            recognized_text=self.vocab.decode_greedy(ids).lower(),
        )


def _common_subsequence_share(reference: Sequence, recognized: Sequence) -> float:
    """Longest common subsequence over the reference length."""
    if not reference:
        return 0.0
    previous = [0] * (len(recognized) + 1)
    for reference_item in reference:
        current = [0]
        for j, recognized_item in enumerate(recognized):
            current.append(
                previous[j] + 1
                if reference_item == recognized_item
                else max(previous[j + 1], current[j])
            )
        previous = current
    return previous[-1] / len(reference)


def reference_coverage(reference_words: list[str], recognized_words: list[str]) -> float:
    """Share of the reference words the free ASR heard, in order."""
    return _common_subsequence_share(reference_words, recognized_words)


def reference_character_coverage(reference_words: list[str], recognized_text: str) -> float:
    """Share of the reference's letters found, in order, in the free ASR
    output (spaces ignored). Unlike word coverage it credits near misses
    such as "borne legs" for "born likes", which greedy ASR on learner
    speech produces constantly."""
    return _common_subsequence_share("".join(reference_words), recognized_text.replace(" ", ""))


@dataclass(frozen=True)
class AlignedWord:
    text: str
    span: TextGridSpan
    phones: list[TextGridSpan]
    out_of_vocabulary: bool


def aligned_words(alignment: Alignment, reference_words: list[str]) -> list[AlignedWord] | None:
    """Pair aligned words with the reference by position, as training does
    (`training/labels.py::word_alignment_is_valid`); None when they differ.
    A word's phones are those whose midpoint lies in its span."""
    if len(alignment.words) != len(reference_words):
        return None
    words = []
    for span, reference_word in zip(alignment.words, reference_words):
        unknown = span.text == UNKNOWN_WORD_LABEL
        if not unknown and span.text != reference_word:
            return None
        phones = phones_for_word(span, alignment.phones)
        out_of_vocabulary = (
            unknown or not phones or any(p.text == UNKNOWN_PHONE_LABEL for p in phones)
        )
        words.append(AlignedWord(reference_word, span, phones, out_of_vocabulary))
    return words


class SpeechEvaluationPipeline:
    def __init__(
        self,
        bundle: LoadedBundle,
        encoder: Wav2Vec2Encoder,
        aligner: Aligner,
        limits: Limits | None = None,
    ) -> None:
        if encoder.layers != bundle.hidden_state_layers:
            raise ValueError(
                f"encoder layers {encoder.layers} differ from the bundle's "
                f"{bundle.hidden_state_layers}"
            )
        schema_encoder = bundle.feature_schema["encoder"]
        if (encoder.model_id, encoder.revision) != (
            schema_encoder["model_id"], schema_encoder["revision"]
        ):
            raise ValueError(
                f"encoder {encoder.model_id}@{encoder.revision} is not the bundle's "
                f"{schema_encoder['model_id']}@{schema_encoder['revision']}"
            )
        self.bundle = bundle
        self.encoder = encoder
        self.aligner = aligner
        self.limits = limits or Limits()
        duration_range = bundle.feature_schema["training_audio_duration_sec"]
        self._training_duration = (duration_range["min"], duration_range["max"])

    def evaluate(self, audio: bytes, reference_text: str) -> EvaluationResult:
        started = time.perf_counter()
        reference_words = normalize_text(reference_text).split()
        if not reference_words:
            raise EvaluationError("invalid_request", "the reference text has no words", 400)

        waveform = decode_audio(audio, self.limits)
        decoded = time.perf_counter()
        encoded = self.encoder.encode(waveform)
        if not encoded.recognized_text:
            raise EvaluationError("no_speech", "no speech was recognized in the recording")
        encoded_at = time.perf_counter()
        try:
            alignment = self.aligner.align(
                waveform.squeeze(0).numpy(), TARGET_SAMPLE_RATE, " ".join(reference_words)
            )
        except AlignmentError as exc:
            # Degrades the result (`alignment_failed`); the cause is only logged.
            logger.warning("alignment failed: %s", exc)
            alignment = None
        aligned_at = time.perf_counter()

        result = self.score(waveform, encoded, alignment, reference_words)
        finished = time.perf_counter()
        return result.model_copy(update={"timing": Timing(
            decode_ms=(decoded - started) * 1000,
            encoder_ms=(encoded_at - decoded) * 1000,
            alignment_ms=(aligned_at - encoded_at) * 1000,
            scoring_ms=(finished - aligned_at) * 1000,
            total_ms=(finished - started) * 1000,
        )})

    @torch.no_grad()
    def score(
        self,
        waveform: torch.Tensor,
        encoded: EncodedAudio,
        alignment: Alignment | None,
        reference_words: list[str],
    ) -> EvaluationResult:
        """Everything after alignment; `timing` is left zero."""
        duration = waveform.shape[-1] / TARGET_SAMPLE_RATE
        num_frames = encoded.hidden_states.shape[-2]
        word_coverage = reference_coverage(reference_words, encoded.recognized_text.split())
        character_coverage = reference_character_coverage(
            reference_words, encoded.recognized_text
        )

        words = aligned_words(alignment, reference_words) if alignment is not None else None
        withheld = None
        if alignment is None:
            withheld = "alignment_failed"
        elif words is None:
            withheld = "word_count_mismatch"
        elif character_coverage < self.limits.min_reference_character_coverage:
            withheld = "reference_not_read"
        scored_words = words if withheld is None else []

        word_examples: list[WordExample] = []
        phone_examples: list[PhoneExample] = []
        for word in scored_words:
            start, end = span_to_frame_range(word.span.start, word.span.end, duration, num_frames)
            phones = [] if word.out_of_vocabulary else word.phones
            word_examples.append(
                WordExample(start, end, 0.0, 0.0, [canonical_phone_id(p.text) for p in phones])
            )
            for phone in phones:
                start, end = span_to_frame_range(phone.start, phone.end, duration, num_frames)
                phone_examples.append(PhoneExample(start, end, 0.0, canonical_phone_id(phone.text)))

        acoustic = compute_acoustic_features(
            waveform,
            alignment.words if alignment is not None else [],
            duration_sec=duration,
            reference_word_count=len(reference_words),
        )
        device = next(self.bundle.model.parameters()).device
        outputs = self.bundle.model({
            "hidden_states": encoded.hidden_states.unsqueeze(0).to(device),
            "frame_mask": torch.ones(1, num_frames, dtype=torch.bool, device=device),
            "acoustic_features": torch.tensor(
                [feature_vector(acoustic)], dtype=torch.float32, device=device
            ),
            "word_examples": [word_examples],
            "phone_examples": [phone_examples],
        })

        sentence = outputs["sentence_scores"][0].cpu().tolist()
        word_accuracy = outputs["word_accuracy"][0].cpu().tolist()
        stress = torch.sigmoid(outputs["word_stress_logit"][0]).cpu().tolist()
        phone_accuracy = iter(outputs["phone_accuracy"][0].cpu().tolist())
        thresholds = self.bundle.prediction_thresholds

        results = []
        for index, word in enumerate(scored_words):
            common = {
                "index": index, "text": word.text,
                "start_sec": word.span.start, "end_sec": word.span.end,
            }
            if word.out_of_vocabulary:
                results.append(WordResult(**common, status="out_of_vocabulary"))
                continue
            phonemes = []
            for phone in word.phones:
                value = next(phone_accuracy)
                phonemes.append(PhonemeResult(
                    phone=phone.text, start_sec=phone.start, end_sec=phone.end,
                    accuracy=value * PHONE_SCALE, is_error=value < thresholds["phone"],
                ))
            results.append(WordResult(
                **common, status="scored", accuracy=word_accuracy[index] * WORD_SCALE,
                is_error=word_accuracy[index] < thresholds["word"],
                stress_correct_probability=stress[index], phonemes=phonemes,
            ))

        if withheld is not None:
            withheld_level = LevelEvidence(status="unavailable", reason=withheld)
            evidence = EvidenceStatus(
                sentence=LevelEvidence(status="degraded", reason=withheld),
                word=withheld_level, phoneme=withheld_level,
            )
        else:
            level = (
                LevelEvidence(status="partial", reason="out_of_vocabulary")
                if any(word.out_of_vocabulary for word in scored_words)
                else LevelEvidence(status="available")
            )
            evidence = EvidenceStatus(
                sentence=LevelEvidence(status="available"), word=level, phoneme=level
            )

        low, high = self._training_duration
        return EvaluationResult(
            bundle_id=self.bundle.bundle_id,
            duration_sec=duration,
            reference_text=" ".join(reference_words),
            recognized_text=encoded.recognized_text,
            reference_word_coverage=word_coverage,
            reference_character_coverage=character_coverage,
            evidence_status=evidence,
            sentence=SentenceScores(**{
                key: value * SENTENCE_SCALE for key, value in zip(SENTENCE_TARGET_KEYS, sentence)
            }),
            words=results,
            warnings=[] if low <= duration <= high else ["duration_outside_training_range"],
            timing=Timing(decode_ms=0, encoder_ms=0, alignment_ms=0, scoring_ms=0, total_ms=0),
        )
