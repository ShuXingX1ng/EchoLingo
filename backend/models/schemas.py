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


class WordEvidence(BaseModel):
    """Word-level evidence of a Speech Evaluation Result."""
    word: str
    score: int
    status: Literal["correct", "mispronounced", "omitted", "inserted"] = "correct"
    phonemes: Optional[List[PhonemeEvidence]] = None


class EvidenceAvailability(BaseModel):
    """Which parts of a Speech Evaluation Result the provider could supply."""
    taskScoreEstimate: bool = False
    words: bool = False
    phonemes: bool = False


class SpeechEvaluationResult(BaseModel):
    """Provider-neutral result of evaluating one spoken Response (CONTEXT.md).

    Dimension estimates are on a 0–100 scale. `taskScoreEstimate` is the
    10–90 Spoken Task Score Estimate, which only the EchoLingo Speech
    Evaluator produces; `overallScore` is a provider's own 0–100 aggregate
    and is not a substitute for it.
    """
    provider: str
    taskScoreEstimate: Optional[int] = None
    overallScore: Optional[int] = None
    pronunciation: int
    oralFluency: int
    content: int
    recognizedText: Optional[str] = None
    words: List[WordEvidence] = []
    evidence: EvidenceAvailability = EvidenceAvailability()
    summary: str = ""


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

    `feedback` already carries `speechEvaluation` when both succeeded. Either
    part may be missing: the evaluation when the provider failed, the Feedback
    when it could not be generated for an evaluated Response.
    """
    transcript: str
    feedback: Optional[Dict[str, Any]] = None
    speechEvaluation: Optional[SpeechEvaluationResult] = None
