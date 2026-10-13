"""
PTE Feedback API Router

POST /api/pte/feedback         - Feedback for a typed or transcribed Response.
POST /api/pte/spoken-feedback  - Speech evaluation and Feedback for a recorded Response.

Delegates to the LangGraph feedback pipeline in services/feedback_graph.py.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from models.schemas import PteFeedbackRequest, SpokenFeedbackResponse
from services.feedback_graph import run_feedback_graph
from services.speech_evaluation import evaluate_spoken_response, provider_for
from services.task_types import VALID_TASK_TYPES

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/pte/feedback")
async def generate_pte_feedback(request: PteFeedbackRequest):
    task_type = request.taskType

    if task_type not in VALID_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid taskType: {task_type}")
    if not request.response or not request.response.strip():
        raise HTTPException(status_code=400, detail="response is required")

    try:
        result = await run_feedback_graph(request)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate feedback")

    if not result:
        raise HTTPException(status_code=502, detail="Invalid feedback format from LLM")

    return result


def _parse_weaknesses(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="historicalWeaknesses must be a JSON object")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="historicalWeaknesses must be a JSON object")
    return parsed


@router.post("/pte/spoken-feedback", response_model=SpokenFeedbackResponse)
async def generate_spoken_feedback(
    audio: UploadFile = File(...),
    taskType: str = Form(...),
    stimulus: str = Form(...),
    transcript: str = Form(""),
    historicalWeaknesses: Optional[str] = Form(None),
):
    """
    Evaluate a recorded Response and generate its Feedback in one request.

    The recording (WAV) is evaluated against the Stimulus first, so the
    Feedback is scored on the provider's recognised text and dimension
    estimates. `transcript` is the browser's own transcript, used only when
    the evaluation yields no recognised text.
    """
    if taskType not in VALID_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid taskType: {taskType}")
    if provider_for(taskType) is None:
        raise HTTPException(status_code=400, detail=f"{taskType} has no speech evaluation")
    weaknesses = _parse_weaknesses(historicalWeaknesses)

    evaluation = await evaluate_spoken_response(taskType, await audio.read(), stimulus)
    response_text = ((evaluation.recognizedText if evaluation else None) or transcript).strip()
    if not response_text:
        raise HTTPException(status_code=400, detail="response is required")

    request = PteFeedbackRequest(
        taskType=taskType,
        stimulus=stimulus,
        response=response_text,
        historicalWeaknesses=weaknesses,
    )
    feedback: Optional[dict] = None
    try:
        feedback = await run_feedback_graph(
            request, speech_evaluation=evaluation.model_dump() if evaluation else None
        ) or None
    except Exception as exc:
        # An evaluated recording is still worth returning without Feedback.
        if evaluation is None:
            if isinstance(exc, ValueError):
                raise HTTPException(status_code=502, detail=str(exc))
            raise HTTPException(status_code=500, detail="Failed to generate feedback")
        logger.warning("[spoken-feedback] feedback failed for %s: %s", taskType, exc)

    if feedback is None and evaluation is None:
        raise HTTPException(status_code=502, detail="Invalid feedback format from LLM")

    return SpokenFeedbackResponse(
        transcript=response_text,
        feedback=feedback,
        speechEvaluation=evaluation,
    )
