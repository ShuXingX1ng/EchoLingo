"""
Parity tests for the Task Type catalogue (src/data/task-types.json).

The catalogue is the single source of per-Task-Type facts. These checks fail
when a Task Type is added, removed, or rescored there without the matching
prompt, rubric, or schema file — pure file checks, no network or DB.
"""

import pathlib

import pytest
import yaml

from services import task_types
from services.feedback_graph import _compute_reading_feedback
from services.task_types import (
    SCORING_DIMENSIONS,
    TASK_TYPES,
    UNSCORED,
    VALID_TASK_TYPES,
    max_score,
    scoring_dimensions,
    scoring_section,
    task_types_scored_as,
    task_types_where,
)

BACKEND_DIR = pathlib.Path(__file__).parent.parent
PROMPTS_DIR = BACKEND_DIR / "prompts" / "pte"
RUBRICS_DIR = BACKEND_DIR / "data" / "rubrics"


def _yaml(name: str) -> dict:
    return yaml.safe_load((PROMPTS_DIR / name).read_text(encoding="utf-8"))


def test_catalogue_has_fifteen_unique_task_types():
    assert len(TASK_TYPES) == 15
    assert VALID_TASK_TYPES == set(TASK_TYPES)


def test_every_task_type_has_a_feedback_prompt_and_a_rubric():
    assert set(_yaml("feedback_tasks.yaml")["tasks"]) == VALID_TASK_TYPES
    assert {path.stem for path in RUBRICS_DIR.glob("*.yaml")} == VALID_TASK_TYPES


def test_every_task_type_with_a_stimulus_has_a_stimulus_prompt():
    with_stimulus = {
        entry.id for entry in TASK_TYPES.values() if entry.stimulus_format != "none"
    }
    assert set(_yaml("stimulus.yaml")["tasks"]) == with_stimulus


def test_every_scoring_dimension_appears_in_its_output_schema_and_judge_prompt():
    schemas = _yaml("feedback_schemas.yaml")
    judges = _yaml("judge.yaml")
    for section, dimensions in SCORING_DIMENSIONS.items():
        schema_text = str(schemas[section])
        judge_text = str(judges)
        for dimension in dimensions:
            assert dimension in schema_text, f"{section} schema is missing {dimension}"
            assert dimension in judge_text, f"judge prompts never mention {dimension}"


@pytest.mark.parametrize("task_type", sorted(task_types_scored_as("reading")))
def test_deterministic_reading_feedback_carries_the_catalogue_dimensions(task_type):
    scores = _compute_reading_feedback(task_type, "")["dimensionScores"]
    assert scores["section"] == "reading"
    assert set(scores) - {"section"} == set(scoring_dimensions("reading"))


def test_scoring_section_and_dimensions():
    assert scoring_section("read_aloud") == "speaking"
    assert scoring_section("write_essay") == "writing"
    assert scoring_section("re_order_paragraphs") == "reading"
    assert scoring_section("summarize_spoken_text") == "listening"
    assert scoring_dimensions("speaking") == ["fluency", "pronunciation", "content"]
    assert scoring_dimensions(UNSCORED) == []
    assert scoring_dimensions(None) == []


def test_unscored_and_unknown_task_types_have_no_section_or_maximum():
    for task_type in ("personal_intro", "write_from_dictation", "not_a_task"):
        assert scoring_section(task_type) == UNSCORED
        assert max_score(task_type) is None
    # Write from Dictation sits in Listening for the learner but is not
    # scored with the listening dimensions.
    assert TASK_TYPES["write_from_dictation"].category == "listening"
    assert "write_from_dictation" not in task_types_scored_as("listening")


def test_only_scored_task_types_carry_a_maximum_score():
    for entry in TASK_TYPES.values():
        if entry.max_score is not None:
            assert entry.scored_as is not None, entry.id
    assert max_score("read_aloud") == 15
    assert max_score("repeat_sentence") == 13
    assert max_score("fill_in_the_blanks_reading") is None


def test_task_types_where_filters_in_catalogue_order():
    assert task_types_where(stimulus_format="json") == [
        "fill_in_the_blanks_reading",
        "re_order_paragraphs",
        "multiple_choice_reading",
        "fill_in_the_blanks_listening",
        "highlight_correct_summary",
    ]
    assert task_types_where(assistant_practice=True) == [
        "read_aloud",
        "summarize_written_text",
        "write_essay",
        "fill_in_the_blanks_reading",
        "re_order_paragraphs",
        "multiple_choice_reading",
        "highlight_correct_summary",
    ]


def test_catalogue_path_points_at_the_shared_frontend_file():
    assert task_types.CATALOGUE_PATH.name == "task-types.json"
    assert task_types.CATALOGUE_PATH.is_file()
