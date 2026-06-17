"""
Validation tests for backend/data/rubrics/*.yaml.

Pure file/structure checks — no network, DB, or vecs install required.
Guards the Phase RAG-3 requirement that every PTE task type has a rubric
whose task_type matches a prompt key in prompts/pte/feedback_tasks.yaml.
"""

import pathlib
import sys
import types
from unittest.mock import MagicMock

import pytest
import yaml

BACKEND_DIR = pathlib.Path(__file__).parent.parent
RUBRICS_DIR = BACKEND_DIR / "data" / "rubrics"
FEEDBACK_TASKS_YAML = BACKEND_DIR / "prompts" / "pte" / "feedback_tasks.yaml"


def _feedback_task_types() -> set[str]:
    with open(FEEDBACK_TASKS_YAML, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    return set(doc["tasks"].keys())


def _rubric_docs() -> dict[str, dict]:
    docs = {}
    for path in sorted(RUBRICS_DIR.glob("*.yaml")):
        with open(path, encoding="utf-8") as f:
            docs[path.stem] = yaml.safe_load(f)
    return docs


def test_every_task_type_has_a_rubric_file():
    missing = _feedback_task_types() - set(_rubric_docs().keys())
    assert not missing, f"Task types without a rubric YAML: {sorted(missing)}"


def test_no_orphan_rubric_files():
    orphans = set(_rubric_docs().keys()) - _feedback_task_types()
    assert not orphans, f"Rubric files without a matching task type: {sorted(orphans)}"


@pytest.mark.parametrize("stem,doc", _rubric_docs().items())
def test_rubric_structure(stem, doc):
    assert doc["task_type"] == stem, "task_type field must match the filename"
    assert doc.get("description"), "description is required"
    assert doc.get("scoring_notes", "").strip(), "scoring_notes is required"
    dimensions = doc.get("dimensions")
    assert isinstance(dimensions, list) and dimensions, "at least one dimension required"
    for dim in dimensions:
        assert dim.get("name"), f"dimension in {stem} missing name"
        assert dim.get("description", "").strip(), f"dimension {dim.get('name')} in {stem} missing description"
        criteria = dim.get("criteria")
        assert isinstance(criteria, dict) and criteria, f"dimension {dim.get('name')} in {stem} missing criteria"


def test_seed_script_loads_chunks_for_all_task_types():
    # seed_rubrics imports vector_store, which needs a vecs stub in test envs
    vecs_mod = types.ModuleType("vecs")
    vecs_mod.create_client = MagicMock()
    sys.modules.setdefault("vecs", vecs_mod)
    sys.path.insert(0, str(BACKEND_DIR / "scripts"))
    try:
        from seed_rubrics import load_rubrics
    finally:
        sys.path.pop(0)

    chunks = load_rubrics()
    chunk_task_types = {c["task_type"] for c in chunks}
    assert chunk_task_types == _feedback_task_types()

    # Every chunk must carry non-empty embeddable text and a dimension label
    for chunk in chunks:
        assert chunk["text"].strip()
        assert chunk["dimension"]

    # Each task type contributes its overview chunk plus one per dimension
    overview_types = {c["task_type"] for c in chunks if c["dimension"] == "_overview"}
    assert overview_types == _feedback_task_types()
