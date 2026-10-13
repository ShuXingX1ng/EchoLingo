"""The Task Type catalogue, as seen by the backend.

`src/data/task-types.json` is the single source of per-Task-Type facts shared
with the frontend (`src/lib/task-type-registry.ts`): which Task Types exist,
their Section, practice route, Stimulus format, how they are scored and out
of how many points. Backend code asks this module rather than restating
those facts; `tests/test_task_types.py` checks that the prompt and rubric
files still cover every Task Type the catalogue lists.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

CATALOGUE_PATH = Path(__file__).resolve().parents[2] / "src" / "data" / "task-types.json"

UNSCORED = "unscored"


@dataclass(frozen=True)
class TaskType:
    id: str
    display_name: str
    route: str
    category: str
    section: str
    stimulus_format: str
    spoken_stimulus: bool
    scored_as: Optional[str]
    max_score: Optional[int]
    pronunciation_assessment: bool
    assistant_practice: bool


def _load() -> tuple[dict[str, TaskType], dict[str, list[str]]]:
    raw = json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))
    task_types = {
        entry["id"]: TaskType(
            id=entry["id"],
            display_name=entry["displayName"],
            route=entry["route"],
            category=entry["category"],
            section=entry["section"],
            stimulus_format=entry["stimulusFormat"],
            spoken_stimulus=entry["spokenStimulus"],
            scored_as=entry["scoredAs"],
            max_score=entry["maxScore"],
            pronunciation_assessment=entry["pronunciationAssessment"],
            assistant_practice=entry["assistantPractice"],
        )
        for entry in raw["taskTypes"]
    }
    return task_types, raw["scoringDimensions"]


TASK_TYPES, SCORING_DIMENSIONS = _load()

VALID_TASK_TYPES: set[str] = set(TASK_TYPES)


def scoring_section(task_type: str) -> str:
    """The dimension set a Task Type's Feedback is scored with, or "unscored"."""
    entry = TASK_TYPES.get(task_type)
    if entry is None or entry.scored_as is None:
        return UNSCORED
    return entry.scored_as


def scoring_dimensions(section: Optional[str]) -> list[str]:
    return SCORING_DIMENSIONS.get(section or "", [])


def max_score(task_type: str) -> Optional[int]:
    entry = TASK_TYPES.get(task_type)
    return entry.max_score if entry else None


def task_types_scored_as(section: str) -> set[str]:
    return {entry.id for entry in TASK_TYPES.values() if entry.scored_as == section}


def task_types_where(**facts) -> list[str]:
    """Task Type ids, in catalogue order, whose fields equal every given fact
    (e.g. `task_types_where(stimulus_format="json")`).
    """
    return [
        entry.id
        for entry in TASK_TYPES.values()
        if all(getattr(entry, name) == value for name, value in facts.items())
    ]
