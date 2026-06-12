"""
Feedback API Router

POST /api/feedback — generate structured IELTS speaking feedback.
"""

import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError
from models.schemas import FeedbackRequest, SessionFeedback
from services.llm_chain import llm_chain
from services.prompt_loader import prompts

router = APIRouter()


def _extract_json(content: str) -> dict:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    match = re.search(r'\{[\s\S]*\}', content)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError("Could not extract valid JSON from LLM response")


@router.post("/feedback", response_model=SessionFeedback)
async def generate_feedback(request: FeedbackRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages array is required")

    transcript = "\n".join(
        f"{'Examiner' if msg.role == 'examiner' else 'Candidate'}: {msg.content}"
        for msg in request.messages
    )
    user = prompts.evaluator_user.format(transcript=transcript)

    try:
        content = await llm_chain.ainvoke(
            system=prompts.evaluator_system,
            user=user,
            temperature=0.3,
            max_tokens=3000,
            json_mode=True,
            timeout=120.0,
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="An unexpected error occurred. Please try again.")

    try:
        data = _extract_json(content)
        return SessionFeedback(**data)
    except (ValueError, ValidationError):
        raise HTTPException(status_code=502, detail="Invalid feedback format from LLM")
