"""Coach tool: retrieve PTE scoring rubric from local YAML files."""

import pathlib

import yaml
from langchain_core.tools import tool as lc_tool

_RUBRICS_DIR = pathlib.Path(__file__).parent.parent / "data" / "rubrics"


@lc_tool
def get_rubric(task_type: str) -> str:
    """Retrieve the scoring rubric for a PTE Academic task type.
    Returns dimension descriptions and per-score criteria to inform coaching tips."""
    yaml_path = _RUBRICS_DIR / f"{task_type}.yaml"
    if not yaml_path.exists():
        return f"No rubric found for task_type: {task_type}"
    with open(yaml_path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    parts = []
    if notes := doc.get("scoring_notes"):
        parts.append(f"Overview: {notes.strip()}")
    for dim in doc.get("dimensions", []):
        text = f"\n{dim['name'].upper()}:\n{dim['description'].strip()}"
        if criteria := dim.get("criteria"):
            lines = [f"  Score {k}: {v}" for k, v in criteria.items()]
            text += "\nCriteria:\n" + "\n".join(lines)
        parts.append(text)
    return "\n".join(parts)
