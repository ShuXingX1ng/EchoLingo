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

class ChatMessage(BaseModel):
    """Chat message in a speaking session."""
    id: str
    role: Literal["examiner", "user"]
    content: str
    createdAt: str


class ErrorAnnotation(BaseModel):
    """Error annotation in feedback."""
    original: str
    corrected: str
    type: Literal["grammar", "vocabulary", "fluency", "pronunciation"]
    explanation: str


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


class SessionFeedback(BaseModel):
    """Structured IELTS speaking feedback."""
    estimatedBand: float
    fluencyAndCoherence: str
    lexicalResource: str
    grammarRangeAndAccuracy: str
    pronunciation: str
    pronunciationAssessment: Optional[PronunciationAssessmentResult] = None
    strengths: List[str]
    weaknesses: List[str]
    improvementSuggestions: List[str]
    improvedSampleAnswer: str
    errorAnnotations: Optional[List[ErrorAnnotation]] = None


# =============================================================================
# API Request/Response Models
# =============================================================================

# Examiner API
class ExaminerRequest(BaseModel):
    """Request for POST /api/examiner."""
    mode: Literal["ielts_part_1", "ielts_part_2", "ielts_part_3"]
    messages: List[ChatMessage]


class ExaminerResponse(BaseModel):
    """Response from POST /api/examiner."""
    message: str


# Feedback API
class FeedbackRequest(BaseModel):
    """Request for POST /api/feedback."""
    mode: Literal["ielts_part_1", "ielts_part_2", "ielts_part_3"]
    messages: List[ChatMessage]


# FeedbackResponse is SessionFeedback

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
