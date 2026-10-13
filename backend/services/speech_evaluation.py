"""
Speech evaluation seam

The rest of the backend, and the browser, see one provider-neutral Speech
Evaluation Result (CONTEXT.md, ADR-0012). A provider is anything that turns a
recording and its reference text into that result; Azure Pronunciation
Assessment is the only adapter today, and the EchoLingo Speech Evaluator is
the second one this seam is cut for.
"""

import logging
from typing import Optional, Protocol

from models.schemas import (
    EvidenceAvailability,
    PhonemeEvidence,
    SpeechEvaluationResult,
    WordEvidence,
)
from services.azure_speech import PronunciationAssessmentResult, azure_speech_service
from services.task_types import TASK_TYPES

logger = logging.getLogger(__name__)


class SpeechEvaluationProvider(Protocol):
    name: str

    async def evaluate(self, audio: bytes, reference_text: str) -> SpeechEvaluationResult:
        """Evaluate a WAV recording against the text it should contain.

        Raises ValueError when the provider is not configured or cannot
        evaluate this recording.
        """
        ...


_AZURE_WORD_STATUS = {
    "Mispronunciation": "mispronounced",
    "Omission": "omitted",
    "Insertion": "inserted",
}


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
        overallScore=assessment.score,
        pronunciation=assessment.accuracyScore,
        oralFluency=assessment.fluencyScore,
        content=assessment.completenessScore,
        recognizedText=assessment.recognizedText,
        words=words,
        evidence=EvidenceAvailability(
            taskScoreEstimate=False,
            words=bool(words),
            phonemes=any(word.phonemes for word in words),
        ),
        summary=assessment.summary,
    )


class AzureSpeechEvaluation:
    name = "azure"

    async def evaluate(self, audio: bytes, reference_text: str) -> SpeechEvaluationResult:
        assessment = await azure_speech_service.assess_pronunciation(
            audio_data=audio,
            reference_text=reference_text,
        )
        return from_azure(assessment)


_azure = AzureSpeechEvaluation()


def provider_for(task_type: str) -> Optional[SpeechEvaluationProvider]:
    """The provider that evaluates recordings of this Task Type, if any does."""
    entry = TASK_TYPES.get(task_type)
    if entry is None or not entry.pronunciation_assessment:
        return None
    return _azure


async def evaluate_spoken_response(
    task_type: str, audio: bytes, reference_text: str
) -> Optional[SpeechEvaluationResult]:
    """Evaluate a recording, or None when no result could be produced.

    A provider failure is logged and reported as "no evaluation" rather than
    raised: the learner still gets Feedback on what was recognised.
    """
    provider = provider_for(task_type)
    if provider is None or not audio or not reference_text:
        return None
    try:
        return await provider.evaluate(audio, reference_text)
    except Exception as exc:
        logger.warning("[speech-evaluation] %s failed for %s: %s", provider.name, task_type, exc)
        return None
