"""
PTE Feedback API Router

POST /api/pte/feedback — AI feedback for any PTE task type.
Delegates the full scoring pipeline to the LangGraph feedback graph.
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from models.schemas import PteFeedbackRequest
from services.feedback_graph import run_feedback_graph

router = APIRouter()

_registry_path = Path(__file__).parent.parent.parent / "src" / "data" / "task-types.json"
VALID_TASK_TYPES: set[str] = set(json.loads(_registry_path.read_text())["taskTypes"])


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
