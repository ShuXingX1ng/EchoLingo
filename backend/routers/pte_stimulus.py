"""
PTE Stimulus API Router

POST /api/pte/stimulus — generate stimulus for any PTE task type.
"""

from fastapi import APIRouter, HTTPException
from models.schemas import PteStimulusRequest, PteStimulusResponse
from services.llm_chain import llm_chain
from services.prompt_loader import prompts

router = APIRouter()

VALID_TASK_TYPES = {
    "read_aloud", "repeat_sentence", "answer_short_question", "summarize_written_text",
    "write_essay", "personal_intro", "write_from_dictation", "describe_image", "re_tell_lecture",
    "fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading",
    "summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary",
}

JSON_TASK_TYPES = {
    "fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading",
    "fill_in_the_blanks_listening", "highlight_correct_summary",
}


@router.post("/pte/stimulus", response_model=PteStimulusResponse)
async def generate_pte_stimulus(request: PteStimulusRequest):
    task_type = request.taskType

    if task_type not in VALID_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid taskType: {task_type}")

    if task_type == "personal_intro":
        return PteStimulusResponse(text="")

    user = prompts.stimulus_tasks.get(task_type)
    if not user:
        raise HTTPException(status_code=400, detail=f"No stimulus prompt for taskType: {task_type}")

    is_json = task_type in JSON_TASK_TYPES

    try:
        text = await llm_chain.ainvoke(
            system=prompts.stimulus_system,
            user=user,
            temperature=0.85,
            max_tokens=800 if is_json else 300,
            json_mode=is_json,
            timeout=30.0,
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate stimulus")

    return PteStimulusResponse(text=text)
