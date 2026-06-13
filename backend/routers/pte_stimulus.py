"""
PTE Stimulus API Router

POST /api/pte/stimulus — generate stimulus for any PTE task type.
"""

from fastapi import APIRouter, HTTPException
from models.schemas import PteStimulusRequest, PteStimulusResponse
from services.prompt_loader import prompts
from services.stimulus_service import generate_stimulus

router = APIRouter()

VALID_TASK_TYPES = {
    "read_aloud", "repeat_sentence", "answer_short_question", "summarize_written_text",
    "write_essay", "personal_intro", "write_from_dictation", "describe_image", "re_tell_lecture",
    "fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading",
    "summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary",
}


@router.post("/pte/stimulus", response_model=PteStimulusResponse)
async def generate_pte_stimulus(request: PteStimulusRequest):
    task_type = request.taskType

    if task_type not in VALID_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid taskType: {task_type}")

    if task_type == "personal_intro":
        return PteStimulusResponse(text="")

    if task_type not in prompts.stimulus_tasks:
        raise HTTPException(status_code=400, detail=f"No stimulus prompt for taskType: {task_type}")

    try:
        text = await generate_stimulus(
            task_type,
            mode=request.mode,
            topic=request.topic,
            targeting=request.targeting,
            verbatim=request.verbatim,
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate stimulus")

    return PteStimulusResponse(text=text)
