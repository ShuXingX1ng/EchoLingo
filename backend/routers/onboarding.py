"""
Onboarding API Router

GET  /api/onboarding/stimuli   – return 2 quick-assessment stimuli
POST /api/onboarding/evaluate  – run the onboarding orchestrator graph
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.onboarding_graph import run_onboarding_graph
from services.stimulus_service import generate_stimulus

logger = logging.getLogger(__name__)
router = APIRouter()

# Four assessment tasks covering all PTE sections.
# read_aloud                  → Speaking
# fill_in_the_blanks_listening → Listening  (JSON stimulus)
# summarize_written_text      → Writing
# multiple_choice_reading     → Reading     (JSON stimulus)
_ASSESSMENT_TASKS = [
    {
        "task_type": "read_aloud",
        "label": "Read Aloud",
        "section": "Speaking",
        "instruction": "Read the passage aloud. You have 30 seconds to record.",
        "time_limit": 30,
    },
    {
        "task_type": "fill_in_the_blanks_listening",
        "label": "Fill in the Blanks",
        "section": "Listening",
        "instruction": (
            "Listen to the audio, then select the missing word for each blank."
        ),
        "time_limit": 180,
    },
    {
        "task_type": "summarize_written_text",
        "label": "Summarise Written Text",
        "section": "Writing",
        "instruction": (
            "Read the passage and write ONE sentence (5–75 words) "
            "that summarises the key points."
        ),
        "time_limit": 60,
    },
    {
        "task_type": "multiple_choice_reading",
        "label": "Multiple Choice",
        "section": "Reading",
        "instruction": "Read the passage and choose the best answer.",
        "time_limit": 120,
    },
]


# ─── GET /api/onboarding/stimuli ─────────────────────────────────────────────

async def _fetch_stimulus(task_type: str) -> str:
    """Generate a stimulus; return a safe fallback on failure."""
    _FALLBACKS: dict[str, str] = {
        "read_aloud": (
            "Renewable energy sources such as solar and wind power are becoming "
            "increasingly important as the world seeks to reduce its reliance on "
            "fossil fuels and address the challenges of climate change."
        ),
        "fill_in_the_blanks_listening": (
            '{"passage":"Scientists have [BLANK_0] that regular exercise can '
            'significantly [BLANK_1] mental health by reducing stress hormones '
            'and releasing endorphins.",'
            '"blanks":[{"options":["discovered","invented","imagined","ignored"],"correct":0},'
            '{"options":["improve","worsen","ignore","delay"],"correct":0}]}'
        ),
        "summarize_written_text": (
            "Urban green spaces such as parks and community gardens play a vital "
            "role in city life. They provide residents with areas for recreation "
            "and relaxation, improve air quality by absorbing pollutants, and help "
            "reduce the urban heat island effect. Research also shows that access "
            "to nature in cities is linked to improved mental health outcomes."
        ),
        "multiple_choice_reading": (
            '{"passage":"The invention of the printing press in the fifteenth century '
            "revolutionised the spread of information across Europe. Before this "
            "technology, books were copied by hand, making them rare and expensive. "
            "The printing press made books more affordable and widely available, "
            'contributing to the Renaissance and the Reformation.",'
            '"question":"What was the main impact of the printing press?",'
            '"options":["It made books more expensive.","It slowed the spread of '
            'information.","It made books more affordable and widely available.",'
            '"It ended the practice of hand-copying.","It was invented in the '
            'sixteenth century."],"correct":2}'
        ),
    }
    try:
        return await generate_stimulus(task_type, mode="random")
    except Exception as exc:
        logger.warning("[onboarding] stimulus failed for %s: %s", task_type, exc)
        return _FALLBACKS.get(task_type, "")


@router.get("/onboarding/stimuli")
async def get_onboarding_stimuli():
    """
    Return 4 quick-assessment stimuli, one per PTE section:
    Speaking (read_aloud), Listening (fill_in_the_blanks_listening),
    Writing (summarize_written_text), Reading (multiple_choice_reading).
    All four stimulus calls run in parallel.
    """
    import asyncio
    texts = await asyncio.gather(*[_fetch_stimulus(t["task_type"]) for t in _ASSESSMENT_TASKS])

    stimuli = [
        {**task, "stimulus": text}
        for task, text in zip(_ASSESSMENT_TASKS, texts)
    ]
    return {"stimuli": stimuli}


# ─── POST /api/onboarding/evaluate ───────────────────────────────────────────

class OnboardingTaskInput(BaseModel):
    task_type: str
    stimulus: Optional[str] = ""
    response: str


class OnboardingEvaluateRequest(BaseModel):
    tasks: list[OnboardingTaskInput]


@router.post("/onboarding/evaluate")
async def evaluate_onboarding(request: OnboardingEvaluateRequest):
    """
    Run the LangGraph onboarding orchestrator:
      score_all_tasks → diagnose → plan → finalize

    Returns:
      scoredTasks, weaknessProfile, learningPlan
    """
    if not request.tasks:
        raise HTTPException(status_code=400, detail="tasks must not be empty")

    for t in request.tasks:
        if not t.response or not t.response.strip():
            raise HTTPException(
                status_code=400,
                detail=f"response for {t.task_type} must not be empty",
            )

    tasks = [t.model_dump() for t in request.tasks]
    try:
        result = await run_onboarding_graph(tasks)
    except Exception as exc:
        logger.exception("[onboarding] graph failed")
        raise HTTPException(status_code=500, detail=f"Onboarding evaluation failed: {exc}")

    return result
