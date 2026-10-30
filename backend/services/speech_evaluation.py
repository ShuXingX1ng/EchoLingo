"""
Speech evaluation seam

The rest of the backend, and the browser, see one provider-neutral Speech
Evaluation Result (CONTEXT.md, ADR-0012). A provider turns a recording and
its reference text into that result or raises `SpeechProviderError`.

- Read Aloud is evaluated by the EchoLingo Speech Evaluator (the private
  Worker plus Provisional Score Normalization). Its Speech Evaluation Mode is
  `echolingo` by default; `compare` also runs Azure Pronunciation Assessment
  on the same recording as a baseline. A failed EchoLingo evaluation is
  reported as such and never replaced by Azure.
- Repeat Sentence keeps Azure Pronunciation Assessment.
"""

import asyncio
import difflib
import hashlib
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Protocol

from models.schemas import (
    EvidenceLevel,
    EvidenceStatus,
    FluencyEvent,
    PhonemeEvidence,
    ReadingError,
    SpeechEvaluationComparison,
    SpeechEvaluationFailure,
    SpeechEvaluationResult,
    WordDisagreement,
    WordEvidence,
)
from services import speech_worker
from services.azure_speech import PronunciationAssessmentResult, azure_speech_service
from services.speech_normalization import (
    CONTENT_FLOOR_COVERAGE,
    DISPLAY_MIN,
    CalibrationMissing,
    content_score,
    display_share,
    load_calibration,
    task_score,
)
from services.speech_worker import SpeechProviderError
from services.task_types import TASK_TYPES

logger = logging.getLogger(__name__)

READ_ALOUD = "read_aloud"
SPEECH_EVALUATION_MODES = ("echolingo", "compare")
DEFAULT_SPEECH_EVALUATION_MODE = "echolingo"
COMPARED_DIMENSIONS = ("pronunciation", "oralFluency", "content")


class SpeechEvaluationProvider(Protocol):
    name: str

    async def evaluate(self, audio: bytes, reference_text: str) -> SpeechEvaluationResult:
        """Evaluate a WAV recording against the text it should contain.

        Raises SpeechProviderError when the provider is not configured or
        cannot evaluate this recording.
        """
        ...


# ── Azure adapter ─────────────────────────────────────────────────────────────

_AZURE_WORD_STATUS = {
    "Mispronunciation": "mispronounced",
    "Omission": "omitted",
    "Insertion": "inserted",
}


def _available(present: bool, reason: str) -> EvidenceLevel:
    return EvidenceLevel(status="available") if present else EvidenceLevel(
        status="unavailable", reason=reason
    )


def from_azure(assessment: PronunciationAssessmentResult) -> SpeechEvaluationResult:
    """Map an Azure Pronunciation Assessment onto the provider-neutral result.

    Azure's accuracy is a pronunciation estimate and its completeness is how
    much of the reference was spoken, i.e. content for a read-verbatim task.
    Azure has no Spoken Task Score Estimate.
    """
    words = [
        WordEvidence(
            word=word.word,
            score=word.score,
            status=_AZURE_WORD_STATUS.get(word.errorType or "", "correct"),
            phonemes=(
                [PhonemeEvidence(phoneme=p.phoneme, score=p.score) for p in word.phonemes]
                if word.phonemes
                else None
            ),
        )
        for word in assessment.words
    ]
    return SpeechEvaluationResult(
        provider="azure",
        scale="0-100",
        overallScore=assessment.score,
        pronunciation=assessment.accuracyScore,
        oralFluency=assessment.fluencyScore,
        content=assessment.completenessScore,
        recognizedText=assessment.recognizedText,
        words=words,
        evidenceStatus=EvidenceStatus(
            sentence=EvidenceLevel(status="available"),
            word=_available(bool(words), "not_returned"),
            phoneme=_available(any(word.phonemes for word in words), "not_returned"),
        ),
        summary=assessment.summary,
    )


class AzureSpeechEvaluation:
    name = "azure"

    async def evaluate(self, audio: bytes, reference_text: str) -> SpeechEvaluationResult:
        if not azure_speech_service.is_configured():
            raise SpeechProviderError("not_configured", "Azure Speech is not configured")
        try:
            assessment = await azure_speech_service.assess_pronunciation(
                audio_data=audio,
                reference_text=reference_text,
            )
        except ValueError as exc:
            raise SpeechProviderError("provider_error", str(exc)) from exc
        return from_azure(assessment)


# ── EchoLingo adapter ─────────────────────────────────────────────────────────

def from_echolingo(result: dict) -> SpeechEvaluationResult:
    """Map a Speech Evaluation Worker result onto the provider-neutral result.

    Scores go through the bundle's Provisional Score Normalization; Read
    Aloud Content and the task score follow the reference policy in
    `speech_normalization`. A level the Worker could not support stays
    unscored: a passage that was not read gets the minimum everywhere, and
    sentence scores degraded by a failed alignment are not shown.

    Raises CalibrationMissing when the bundle has no normalization.
    """
    calibration = load_calibration(result["bundle_id"])
    evidence = EvidenceStatus.model_validate(result["evidence_status"])
    sentence = result["sentence"]

    reading_errors = [
        ReadingError(
            kind=error["kind"], wordIndex=error["word_index"], startSec=error["start_sec"],
            endSec=error["end_sec"], heard=error.get("heard"),
        )
        for error in result.get("reading_errors", [])
    ]
    omitted = {error.wordIndex for error in reading_errors if error.kind == "omitted"}

    words = []
    for index, word in enumerate(result["words"]):
        timing = {"startSec": word.get("start_sec"), "endSec": word.get("end_sec")}
        if index in omitted:
            # The scorer scored the sliver the aligner squeezed it into.
            words.append(WordEvidence(word=word["text"], status="omitted", **timing))
            continue
        if word["status"] != "scored":
            words.append(WordEvidence(word=word["text"], status="not_scored", **timing))
            continue
        words.append(WordEvidence(
            word=word["text"],
            **timing,
            score=calibration.word_score(word["accuracy"]),
            status="mispronounced" if word["is_error"] else "correct",
            phonemes=[
                PhonemeEvidence(phoneme=p["phone"], score=calibration.phone_score(p["accuracy"]))
                for p in word["phonemes"]
            ],
        ))

    pronunciation = oral_fluency = task = None
    if evidence.sentence.reason == "reference_not_read":
        pronunciation = oral_fluency = content = task = DISPLAY_MIN
    else:
        content = content_score(
            result["reference_character_coverage_corrected"],
            result.get("reference_not_read_below", CONTENT_FLOOR_COVERAGE),
        )
        if evidence.sentence.status == "available":
            pronunciation = calibration.pronunciation_score(sentence["accuracy"])
            oral_fluency = calibration.oral_fluency_score(sentence["fluency"])
            task = task_score(pronunciation, oral_fluency, content)

    return SpeechEvaluationResult(
        provider="echolingo",
        scale="10-90",
        taskScoreEstimate=task,
        pronunciation=pronunciation,
        oralFluency=oral_fluency,
        content=content,
        recognizedText=result["recognized_text"],
        words=words,
        fluencyEvents=[
            FluencyEvent(
                kind=event["kind"], startSec=event["start_sec"], endSec=event["end_sec"],
                wordIndex=event["word_index"],
                atSentenceBoundary=event.get("at_sentence_boundary", False),
            )
            for event in result.get("fluency_events", [])
        ],
        readingErrors=reading_errors,
        evidenceStatus=evidence,
        modelId=result["bundle_id"],
        warnings=list(result.get("warnings", [])),
    )


class EchoLingoSpeechEvaluation:
    name = "echolingo"

    async def evaluate(self, audio: bytes, reference_text: str) -> SpeechEvaluationResult:
        result = await speech_worker.evaluate(audio, reference_text)
        try:
            return from_echolingo(result)
        except CalibrationMissing as exc:
            raise SpeechProviderError("calibration_missing", str(exc)) from exc
        except (KeyError, TypeError, ValueError) as exc:
            raise SpeechProviderError(
                "worker_error", f"unexpected Worker result: {exc!r}"
            ) from exc


_azure = AzureSpeechEvaluation()
_echolingo = EchoLingoSpeechEvaluation()


def provider_for(task_type: str) -> Optional[SpeechEvaluationProvider]:
    """The primary provider for recordings of this Task Type, if any."""
    entry = TASK_TYPES.get(task_type)
    if entry is None or not entry.pronunciation_assessment:
        return None
    return _echolingo if task_type == READ_ALOUD else _azure


def modes_for(task_type: str) -> tuple[str, ...]:
    """The Speech Evaluation Modes a Task Type accepts (only Read Aloud has any)."""
    return SPEECH_EVALUATION_MODES if task_type == READ_ALOUD else ()


# ── Comparison ────────────────────────────────────────────────────────────────

def _normalized_word(word: str) -> str:
    return re.sub(r"[^a-z']", "", word.lower())


def word_disagreements(
    echolingo: list[WordEvidence], azure: list[WordEvidence]
) -> list[WordDisagreement]:
    """Reference words one provider judged an error and the other did not.
    Words are paired by text in reading order; Azure insertions and words
    EchoLingo could not score are left out."""
    baseline = [word for word in azure if word.status != "inserted"]
    matcher = difflib.SequenceMatcher(
        a=[_normalized_word(w.word) for w in echolingo],
        b=[_normalized_word(w.word) for w in baseline],
        autojunk=False,
    )
    disagreements = []
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            ours, theirs = echolingo[block.a + offset], baseline[block.b + offset]
            if ours.status == "not_scored":
                continue
            if (ours.status != "correct") != (theirs.status != "correct"):
                disagreements.append(
                    WordDisagreement(word=ours.word, echolingo=ours.status, azure=theirs.status)
                )
    return disagreements


def compare(
    primary: Optional[SpeechEvaluationResult],
    baseline: Optional[SpeechEvaluationResult],
    baseline_error: Optional[SpeechEvaluationFailure],
    audio: bytes,
    latency_ms: dict[str, float],
) -> SpeechEvaluationComparison:
    differences: dict[str, Optional[float]] = {}
    for dimension in COMPARED_DIMENSIONS:
        ours = display_share(getattr(primary, dimension), primary.scale) if primary else None
        theirs = display_share(getattr(baseline, dimension), baseline.scale) if baseline else None
        differences[dimension] = (
            None if ours is None or theirs is None else round((ours - theirs) * 100, 1)
        )
    return SpeechEvaluationComparison(
        recordingSha256=hashlib.sha256(audio).hexdigest(),
        createdAt=datetime.now(timezone.utc).isoformat(),
        baseline=baseline,
        baselineError=baseline_error,
        latencyMs=latency_ms,
        differences=differences,
        wordDisagreements=(
            word_disagreements(primary.words, baseline.words) if primary and baseline else []
        ),
    )


# ── Orchestration ─────────────────────────────────────────────────────────────

@dataclass
class SpokenEvaluation:
    """The primary result or why there is none, and the comparison in
    compare mode. Never both `result` and `error`."""
    result: Optional[SpeechEvaluationResult] = None
    error: Optional[SpeechEvaluationFailure] = None
    comparison: Optional[SpeechEvaluationComparison] = None


async def _timed(provider: SpeechEvaluationProvider, audio: bytes, reference_text: str):
    started = time.perf_counter()
    try:
        result, error = await provider.evaluate(audio, reference_text), None
    except SpeechProviderError as exc:
        result, error = None, SpeechEvaluationFailure(
            provider=provider.name, code=exc.code, message=exc.message
        )
    except Exception as exc:  # a bug in an adapter is still that provider's failure
        logger.exception("[speech-evaluation] %s raised", provider.name)
        result, error = None, SpeechEvaluationFailure(
            provider=provider.name, code="internal_error", message=type(exc).__name__
        )
    if error is not None:
        logger.warning("[speech-evaluation] %s failed: %s %s",
                       provider.name, error.code, error.message)
    return result, error, (time.perf_counter() - started) * 1000


async def evaluate_spoken_response(
    task_type: str, audio: bytes, reference_text: str, mode: Optional[str] = None
) -> SpokenEvaluation:
    """Evaluate a recording with the Task Type's provider.

    A failure is returned, not raised: the learner still gets Feedback on
    what was recognised, and the failure is shown for what it is.
    """
    provider = provider_for(task_type)
    if provider is None:
        return SpokenEvaluation()
    if not audio or not reference_text:
        return SpokenEvaluation(error=SpeechEvaluationFailure(
            provider=provider.name, code="invalid_request",
            message="a recording and its reference text are required",
        ))

    if (mode or DEFAULT_SPEECH_EVALUATION_MODE) != "compare":
        result, error, _ = await _timed(provider, audio, reference_text)
        return SpokenEvaluation(result=result, error=error)

    (result, error, ours_ms), (baseline, baseline_error, theirs_ms) = await asyncio.gather(
        _timed(provider, audio, reference_text), _timed(_azure, audio, reference_text)
    )
    return SpokenEvaluation(
        result=result,
        error=error,
        comparison=compare(
            result, baseline, baseline_error, audio,
            {provider.name: round(ours_ms, 1), _azure.name: round(theirs_ms, 1)},
        ),
    )
