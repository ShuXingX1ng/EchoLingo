"""
PTE Feedback API Router

POST /api/pte/feedback — AI feedback for any PTE task type.
Delegates the full scoring pipeline to the LangGraph feedback graph.
"""

from fastapi import APIRouter, HTTPException
from models.schemas import PteFeedbackRequest
from services.feedback_graph import run_feedback_graph

router = APIRouter()

VALID_TASK_TYPES = {
    "read_aloud", "repeat_sentence", "answer_short_question", "summarize_written_text",
    "write_essay", "personal_intro", "write_from_dictation", "describe_image", "re_tell_lecture",
    "fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading",
    "summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary",
}


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
