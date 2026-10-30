"""
Pydantic models for EchoLingo API.

These models correspond to the TypeScript types in src/types/index.ts
and the API request/response formats.
"""

from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field


# =============================================================================
# Core Types
# =============================================================================

class PhonemeEvidence(BaseModel):
    """Phoneme-level evidence inside a word."""
    phoneme: str
    score: int


WordStatus = Literal["correct", "mispronounced", "omitted", "inserted", "not_scored"]


class WordEvidence(BaseModel):
    """Word-level evidence of a Speech Evaluation Result.

    `not_scored` is a reference word the provider could not judge (the
    EchoLingo aligner has no pronunciation for it); it has no score.
    """
    word: str
    score: Optional[int] = None
    status: WordStatus = "correct"
    phonemes: Optional[List[PhonemeEvidence]] = None
    # Seconds from the start of the recording, where the provider aligned the
    # word; None when it gives no timing (Azure's SDK result does not).
    startSec: Optional[float] = None
    endSec: Optional[float] = None


EvidenceState = Literal["available", "partial", "degraded", "unavailable"]


class EvidenceLevel(BaseModel):
    """How far one level of evidence could be supplied, and why not fully."""
    status: EvidenceState
    reason: Optional[str] = None


FluencyEventKind = Literal["pause", "slow_word"]


class FluencyEvent(BaseModel):
    """Where the reading stalled, from the EchoLingo Worker's alignment.

    A `pause` follows word `wordIndex` (between two reference sentences
    when `atSentenceBoundary`); a `slow_word` is that word, held too long.
    """
    kind: FluencyEventKind
    startSec: float
    endSec: float
    wordIndex: int
    atSentenceBoundary: bool = False


ReadingErrorKind = Literal["omitted", "inserted", "repeated"]


class ReadingError(BaseModel):
    """A word left out, added or said again, from the EchoLingo Worker.

    `omitted` and `repeated` name reference word `wordIndex` (an omitted
    word also has the `omitted` status in `words`); an `inserted` word
    follows it. `heard` is what the free ASR heard, for the last two. The
    Worker reports only the kinds that met its benchmark's precision.
    """
    kind: ReadingErrorKind
    wordIndex: int
    startSec: float
    endSec: float
    heard: Optional[str] = None


PracticeItemKind = Literal[
    "omitted", "inserted", "repeated", "mispronounced", "pause", "slow_word"
]


class PracticeItem(BaseModel):
    """One of the few things to practise first, chosen from a Speech
    Evaluation Result by fixed rules (`services/speech_explanation.py`).

    `wordIndices` are into the result's `words`, in reading order: the
    words mispronounced, left out, said again or drawn out; the word a
    pause or an inserted word follows (or the inserted word itself, where
    the provider lists it among the words). `words` names them, an inserted
    word as heard. `count` is how many the result has in all, of which at
    most five are named.
    """
    kind: PracticeItemKind
    count: int
    wordIndices: List[int]
    words: List[str]


class EvidenceStatus(BaseModel):
    sentence: EvidenceLevel
    word: EvidenceLevel
    phoneme: EvidenceLevel


class SpeechEvaluationResult(BaseModel):
    """Provider-neutral result of evaluating one spoken Response (CONTEXT.md).

    Scores use the provider's `scale`: the EchoLingo Speech Evaluator reports
    on the 10–90 display scale (Provisional Score Normalization, not PTE
    calibration); Azure on its own 0–100. `taskScoreEstimate` is the 10–90
    Spoken Task Score Estimate, which only the EchoLingo Speech Evaluator
    produces; `overallScore` is a provider's own aggregate and is not a
    substitute for it. A dimension is None when its evidence could not
    support a score, and `evidenceStatus` says why.
    """
    provider: str
    scale: Literal["10-90", "0-100"]
    taskScoreEstimate: Optional[int] = None
    overallScore: Optional[int] = None
    pronunciation: Optional[int] = None
    oralFluency: Optional[int] = None
    content: Optional[int] = None
    recognizedText: Optional[str] = None
    words: List[WordEvidence] = []
    # Empty when the provider reports none or has no word evidence.
    fluencyEvents: List[FluencyEvent] = []
    readingErrors: List[ReadingError] = []
    # At most three, most important first; empty without word evidence.
    practiceSummary: List[PracticeItem] = []
    evidenceStatus: EvidenceStatus
    # The Evaluator Checkpoint Bundle that produced the result, if any.
    modelId: Optional[str] = None
    warnings: List[str] = []
    summary: str = ""


class SpeechEvaluationFailure(BaseModel):
    """Why a provider produced no Speech Evaluation Result."""
    provider: str
    code: str
    message: str


class WordDisagreement(BaseModel):
    """A reference word one provider judged an error and the other did not."""
    word: str
    echolingo: WordStatus
    azure: WordStatus


class SpeechEvaluationComparison(BaseModel):
    """An explicit EchoLingo-versus-Azure comparison of one recording.

    The primary EchoLingo result stays in `speechEvaluation`; Azure is the
    baseline only. Differences are EchoLingo minus Azure in points of each
    provider's own scale range (0–100), since the scales differ. No audio is
    kept: the recording is identified by its SHA-256. The browser shows the
    whole comparison but saves the baseline with its scores, evidence status
    and checkpoint only, without its words or recognised text (roadmap §13,
    `src/lib/speech-comparison.ts`).
    """
    recordingSha256: str
    createdAt: str
    baseline: Optional[SpeechEvaluationResult] = None
    baselineError: Optional[SpeechEvaluationFailure] = None
    latencyMs: Dict[str, float] = {}
    differences: Dict[str, Optional[float]] = {}
    wordDisagreements: List[WordDisagreement] = []


# =============================================================================
# API Request/Response Models
# =============================================================================

# TTS API
class TTSRequest(BaseModel):
    """Request for POST /api/tts."""
    text: str
    voice: str = "en-US-AriaNeural"
    rate: float = Field(default=0.95, ge=0.5, le=2.0)


# TTS Response is WAV audio stream (binary)

# =============================================================================
# PTE API Models
# =============================================================================

class PteStimulusRequest(BaseModel):
    """Request for POST /api/pte/stimulus."""
    taskType: str  # validated against the Task Type catalogue in the router
    # Retrieval strategy (ADR 0009). Mock and plain Task Practice both send "random".
    mode: Literal["random", "targeted", "theme"] = "random"
    topic: Optional[str] = None              # theme query (theme mode only)
    targeting: Optional[Dict[str, Any]] = None  # {difficulty?, features?} for targeted mode
    verbatim: bool = False                   # private path: serve an Exemplar verbatim
    source: Literal["exemplars", "news"] = "exemplars"  # generation anchor source


class PteStimulusResponse(BaseModel):
    """Response from POST /api/pte/stimulus."""
    text: str


class PteFeedbackRequest(BaseModel):
    """Request for POST /api/pte/feedback."""
    taskType: str  # validated against the Task Type catalogue in the router
    stimulus: str = ""
    response: str
    historicalWeaknesses: Optional[Dict[str, float]] = None


class SpokenFeedbackResponse(BaseModel):
    """Response from POST /api/pte/spoken-feedback.

    `feedback` already carries the speech evaluation fields when both
    succeeded. Either part may be missing: the evaluation when the provider
    failed (`speechEvaluationError` says why; nothing replaces it), the
    Feedback when it could not be generated for an evaluated Response.
    `speechEvaluationComparison` is present only in compare mode.
    """
    transcript: str
    feedback: Optional[Dict[str, Any]] = None
    speechEvaluation: Optional[SpeechEvaluationResult] = None
    speechEvaluationError: Optional[SpeechEvaluationFailure] = None
    speechEvaluationComparison: Optional[SpeechEvaluationComparison] = None
