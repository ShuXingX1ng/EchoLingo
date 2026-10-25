"""One Read Aloud recording through the bundle's scorer (roadmap SS3, SS10.4).

decode -> Wav2Vec2 (hidden-state layers and the CTC head's free ASR from one
forward pass) -> forced alignment -> the same span, phone-id and acoustic
feature code training used (`training/dataset.py`, `features/acoustic.py`)
-> scorer -> scores on the label scales with an evidence status per level.

Layered degradation instead of fabricated evidence:

- alignment fails, or its word count differs from the reference: no word or
  phoneme results; sentence scores are still computed but `degraded`, since
  their pause and timing features came from (absent) word spans;
- the free ASR output shares no more of the reference's letters than an
  unrelated text would (another language, another passage): the same, with
  reason `reference_not_read`;
- an out-of-dictionary word: that word gets no score and no phonemes, and
  word/phoneme evidence is `partial`.

Recordings that cannot be scored at all raise `EvaluationError`.
"""

from __future__ import annotations

import io
import logging
import re
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
    # chance-corrected letter coverage of the reference by the free ASR
    # (`corrected_character_coverage`). Raw letter coverage cannot gate a
    # Read Aloud passage: another passage already shares about 0.45 of its
    # letters in order. Chosen on SpeechOcean validation readings joined into
    # passages of about 40 words (M5, 2026-10-26): no own passage fell below
    # 0.10 (the lowest was 0.21) and 95% of wrong passages did; on single
    # 3-10 word sentences 3.1% of real readings fall below it. Word coverage
    # was no use as a gate: 8% of real readings had none of their words
    # recognized.
    min_reference_character_coverage_corrected: float = 0.10

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


def chance_character_coverage(reference_words: list[str], recognized_text: str) -> float:
    """The letter coverage an unrelated text reaches by chance: the same
    measure against the reference's letters in reverse order, which keeps
    their counts and length but not their order. Over a Read Aloud passage
    this is about 0.45, so raw letter coverage cannot tell a wrong passage
    from a poorly recognized reading."""
    return _common_subsequence_share(
        "".join(reference_words)[::-1], recognized_text.replace(" ", "")
    )


def corrected_character_coverage(
    reference_words: list[str], recognized_text: str, observed: float | None = None
) -> float:
    """Letter coverage above chance, rescaled so 0 is chance and 1 is every
    letter heard; clamped to [0, 1]. `observed` is
    `reference_character_coverage`, when already computed."""
    if observed is None:
        observed = reference_character_coverage(reference_words, recognized_text)
    chance = chance_character_coverage(reference_words, recognized_text)
    if chance >= 1.0:
        return 0.0
    return min(1.0, max(0.0, (observed - chance) / (1.0 - chance)))


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


# Sentence ends in the reference text; a sentence of fewer words than this
# is scored together with the one before it (or after it, if it is first).
_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")
MIN_SENTENCE_WORDS = 3
# Training recordings have about 0.5 s of silence before the first word and
# after the last (SpeechOcean medians 0.54 s / 0.53 s); a sentence cut gets
# as much, but never past the midpoint of the gap to its neighbour.
SENTENCE_PADDING_SEC = 0.5


def reference_sentences(reference_text: str) -> list[int]:
    """Word counts of the reference's sentences, in reading order, after the
    same normalization as the whole text (so they sum to its word count)."""
    counts = [len(normalize_text(part).split())
              for part in _SENTENCE_END_RE.split(reference_text.strip())]
    merged: list[int] = []
    for count in (c for c in counts if c):
        if merged and (count < MIN_SENTENCE_WORDS or merged[-1] < MIN_SENTENCE_WORDS):
            merged[-1] += count
        else:
            merged.append(count)
    return merged


def sentence_segments(
    words: list[AlignedWord], counts: list[int], duration: float
) -> list[tuple[int, int, float, float]]:
    """(first word, end word, start s, end s) of each sentence's cut."""
    bounds, first = [], 0
    for number, count in enumerate(counts):
        last = first + count
        start = words[first].span.start - SENTENCE_PADDING_SEC
        end = words[last - 1].span.end + SENTENCE_PADDING_SEC
        if number > 0:
            start = max(start, (words[first - 1].span.end + words[first].span.start) / 2)
        if last < len(words):
            end = min(end, (words[last - 1].span.end + words[last].span.start) / 2)
        bounds.append((first, last, max(0.0, start), min(duration, end)))
        first = last
    return bounds


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

        result = self.score(
            waveform, encoded, alignment, reference_words, reference_sentences(reference_text)
        )
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
        sentence_word_counts: list[int] | None = None,
    ) -> EvaluationResult:
        """Everything after alignment; `timing` is left zero.

        `sentence_word_counts` splits the reference into sentences
        (`reference_sentences`). With more than one, each sentence is cut
        from the recording at its aligned span and scored on its own, as
        every training recording was a single sentence; sentence scores are
        then averaged by word count. Scoring a multi-sentence recording
        whole runs about 1.5 points (of 10) low."""
        duration = waveform.shape[-1] / TARGET_SAMPLE_RATE
        word_coverage = reference_coverage(reference_words, encoded.recognized_text.split())
        character_coverage = reference_character_coverage(
            reference_words, encoded.recognized_text
        )
        corrected_coverage = corrected_character_coverage(
            reference_words, encoded.recognized_text, character_coverage
        )

        words = aligned_words(alignment, reference_words) if alignment is not None else None
        withheld = None
        if alignment is None:
            withheld = "alignment_failed"
        elif words is None:
            withheld = "word_count_mismatch"
        elif corrected_coverage < self.limits.min_reference_character_coverage_corrected:
            withheld = "reference_not_read"

        counts = sentence_word_counts or [len(reference_words)]
        if withheld is not None or len(counts) < 2 or sum(counts) != len(reference_words):
            # One pass over the whole recording. Pause and timing features
            # come from whatever word spans the aligner produced.
            spans = alignment.words if alignment is not None else []
            scored = words if withheld is None else []
            sentence, results = self._score_segment(
                waveform, encoded, scored, spans, len(reference_words), 0, 0.0
            )
            scored_durations = [duration]
        else:
            sentence, results, scored_durations = self._score_sentences(
                waveform, words, counts, duration
            )

        if withheld is not None:
            withheld_level = LevelEvidence(status="unavailable", reason=withheld)
            evidence = EvidenceStatus(
                sentence=LevelEvidence(status="degraded", reason=withheld),
                word=withheld_level, phoneme=withheld_level,
            )
        else:
            level = (
                LevelEvidence(status="partial", reason="out_of_vocabulary")
                if any(word.out_of_vocabulary for word in words)
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
            reference_character_coverage_corrected=corrected_coverage,
            reference_not_read_below=self.limits.min_reference_character_coverage_corrected,
            evidence_status=evidence,
            sentence=SentenceScores(**{
                key: value * SENTENCE_SCALE for key, value in zip(SENTENCE_TARGET_KEYS, sentence)
            }),
            words=results,
            segment_count=len(scored_durations),
            # The scorer saw each sentence cut, not the whole passage.
            warnings=(
                [] if all(low <= d <= high for d in scored_durations)
                else ["duration_outside_training_range"]
            ),
            timing=Timing(decode_ms=0, encoder_ms=0, alignment_ms=0, scoring_ms=0, total_ms=0),
        )

    def _score_sentences(
        self,
        waveform: torch.Tensor,
        words: list[AlignedWord],
        counts: list[int],
        duration: float,
    ) -> tuple[list[float], list[WordResult], list[float]]:
        """Each reference sentence scored from its own cut of the recording;
        also the cuts' durations."""
        weighted = [0.0] * len(SENTENCE_TARGET_KEYS)
        results: list[WordResult] = []
        durations: list[float] = []
        for first, last, start_sec, end_sec in sentence_segments(words, counts, duration):
            start = int(round(start_sec * TARGET_SAMPLE_RATE))
            end = int(round(end_sec * TARGET_SAMPLE_RATE))
            segment = waveform[:, start:end]
            durations.append(segment.shape[-1] / TARGET_SAMPLE_RATE)
            offset = start / TARGET_SAMPLE_RATE
            shifted = [_shift_word(word, offset) for word in words[first:last]]
            sentence, segment_results = self._score_segment(
                segment, self.encoder.encode(segment), shifted,
                [word.span for word in shifted], len(shifted), first, offset,
            )
            for index, value in enumerate(sentence):
                weighted[index] += value * (last - first)
            results.extend(segment_results)
        return [value / len(words) for value in weighted], results, durations

    def _score_segment(
        self,
        waveform: torch.Tensor,
        encoded: EncodedAudio,
        words: list[AlignedWord],
        word_spans: list[TextGridSpan],
        reference_word_count: int,
        first_index: int,
        offset_sec: float,
    ) -> tuple[list[float], list[WordResult]]:
        """The scorer on one recording (or one cut of it): its sentence
        scores in [0, 1] and a result per word, with times moved back by
        `offset_sec` and indices starting at `first_index`."""
        duration = waveform.shape[-1] / TARGET_SAMPLE_RATE
        num_frames = encoded.hidden_states.shape[-2]
        word_examples: list[WordExample] = []
        phone_examples: list[PhoneExample] = []
        for word in words:
            start, end = span_to_frame_range(word.span.start, word.span.end, duration, num_frames)
            phones = [] if word.out_of_vocabulary else word.phones
            word_examples.append(
                WordExample(start, end, 0.0, 0.0, [canonical_phone_id(p.text) for p in phones])
            )
            for phone in phones:
                start, end = span_to_frame_range(phone.start, phone.end, duration, num_frames)
                phone_examples.append(PhoneExample(start, end, 0.0, canonical_phone_id(phone.text)))

        acoustic = compute_acoustic_features(
            waveform, word_spans, duration_sec=duration,
            reference_word_count=reference_word_count,
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
        for index, word in enumerate(words):
            common = {
                "index": first_index + index, "text": word.text,
                "start_sec": word.span.start + offset_sec, "end_sec": word.span.end + offset_sec,
            }
            if word.out_of_vocabulary:
                results.append(WordResult(**common, status="out_of_vocabulary"))
                continue
            phonemes = []
            for phone in word.phones:
                value = next(phone_accuracy)
                phonemes.append(PhonemeResult(
                    phone=phone.text, start_sec=phone.start + offset_sec,
                    end_sec=phone.end + offset_sec,
                    accuracy=value * PHONE_SCALE, is_error=value < thresholds["phone"],
                ))
            results.append(WordResult(
                **common, status="scored", accuracy=word_accuracy[index] * WORD_SCALE,
                is_error=word_accuracy[index] < thresholds["word"],
                stress_correct_probability=stress[index], phonemes=phonemes,
            ))
        return sentence, results


def _shift_span(span: TextGridSpan, offset: float) -> TextGridSpan:
    return TextGridSpan(span.start - offset, span.end - offset, span.text)


def _shift_word(word: AlignedWord, offset: float) -> AlignedWord:
    return AlignedWord(
        word.text, _shift_span(word.span, offset),
        [_shift_span(phone, offset) for phone in word.phones], word.out_of_vocabulary,
    )
