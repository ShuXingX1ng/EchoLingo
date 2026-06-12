"""
Read Aloud API Router

POST /api/read-aloud/stimulus — generate a Read Aloud passage
POST /api/read-aloud/feedback — evaluate a Read Aloud response
"""

import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.llm_chain import llm_chain
from services.prompt_loader import prompts

router = APIRouter()


class ReadAloudFeedbackRequest(BaseModel):
    stimulus: str
    transcript: str
    pronunciationAssessment: Optional[dict] = None


@router.post("/read-aloud/stimulus")
async def generate_read_aloud_stimulus():
    try:
        text = await llm_chain.ainvoke(
            system=prompts.read_aloud_stimulus_system,
            user=prompts.read_aloud_stimulus_user,
            temperature=0.85,
            max_tokens=4000,
            timeout=60.0,
        )
        return {"text": text}
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate stimulus")


@router.post("/read-aloud/feedback")
async def generate_read_aloud_feedback(request: ReadAloudFeedbackRequest):
    if not request.stimulus.strip() or not request.transcript.strip():
        raise HTTPException(status_code=400, detail="stimulus and transcript are required")

    pron = request.pronunciationAssessment
    pron_ctx = ""
    if pron:
        pron_ctx = (
            f"\n\nAzure Pronunciation Assessment (use these scores to calibrate your feedback):\n"
            f"  Overall: {pron.get('score')}/100\n"
            f"  Accuracy: {pron.get('accuracyScore')}/100\n"
            f"  Fluency: {pron.get('fluencyScore')}/100\n"
            f"  Completeness: {pron.get('completenessScore')}/100"
        )

    user = prompts.read_aloud_feedback_user.format(
        stimulus=request.stimulus,
        transcript=request.transcript,
        pronunciation_ctx=pron_ctx,
    )

    try:
        content = await llm_chain.ainvoke(
            system=prompts.read_aloud_feedback_system,
            user=user,
            temperature=0.3,
            max_tokens=800,
            json_mode=True,
            timeout=60.0,
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate feedback")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r'\{[\s\S]*\}', content)
        if match:
            try:
                parsed = json.loads(match.group(0))
            except json.JSONDecodeError:
                raise HTTPException(status_code=502, detail="Invalid feedback format from LLM")
        else:
            raise HTTPException(status_code=502, detail="Invalid feedback format from LLM")

    if pron:
        parsed["pronunciationAssessment"] = pron

    return parsed
