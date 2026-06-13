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

class PhonemeAssessment(BaseModel):
    """Phoneme-level pronunciation assessment."""
    phoneme: str
    score: int
    accuracyScore: int


class WordAssessment(BaseModel):
    """Word-level pronunciation assessment."""
    word: str
    score: int
    accuracyScore: int
    errorType: Optional[str] = None  # Azure: None, Omission, Insertion, Mispronunciation
    phonemes: Optional[List[PhonemeAssessment]] = None


class PronunciationAssessmentResult(BaseModel):
    """Pronunciation assessment result."""
    score: int
    accuracyScore: int
    fluencyScore: int
    completenessScore: int
    words: List[WordAssessment]
    summary: str


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

# Pronunciation API
# Request is FormData (audio file + reference text)
# Response is PronunciationAssessmentResult


# =============================================================================
# PTE API Models
# =============================================================================

PteTaskType = Literal[
    "read_aloud",
    "repeat_sentence",
    "answer_short_question",
    "summarize_written_text",
    "write_essay",
    "personal_intro",
    "write_from_dictation",
    "describe_image",
    "re_tell_lecture",
    "fill_in_the_blanks_reading",
    "re_order_paragraphs",
    "multiple_choice_reading",
    "summarize_spoken_text",
    "fill_in_the_blanks_listening",
    "highlight_correct_summary",
]


class PteStimulusRequest(BaseModel):
    """Request for POST /api/pte/stimulus."""
    taskType: str  # validated against PteTaskType in the router


class PteStimulusResponse(BaseModel):
    """Response from POST /api/pte/stimulus."""
    text: str


class PteFeedbackRequest(BaseModel):
    """Request for POST /api/pte/feedback."""
    taskType: str  # validated against PteTaskType in the router
    stimulus: str = ""
    response: str
    pronunciationAssessment: Optional[Dict[str, Any]] = None
