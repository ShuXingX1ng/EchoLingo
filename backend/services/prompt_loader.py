"""
Prompt Loader

Loads all prompt YAML files at startup and exposes them as typed dicts.
Import the singleton `prompts` in routers — no file I/O at request time.
"""

from pathlib import Path
import yaml

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load(path: str) -> dict:
    with open(_PROMPTS_DIR / path, encoding="utf-8") as f:
        return yaml.safe_load(f)


class Prompts:
    def __init__(self):
        _pte_stimulus       = _load("pte/stimulus.yaml")
        _pte_fb_tasks       = _load("pte/feedback_tasks.yaml")
        _pte_fb_schemas     = _load("pte/feedback_schemas.yaml")
        _pte_judge          = _load("pte/judge.yaml")
        _pte_retry          = _load("pte/retry_note.yaml")
        _read_aloud         = _load("read_aloud/prompts.yaml")
        _word_lookup        = _load("word_lookup/prompts.yaml")
        _study_assistant_knowledge = _load("study_assistant/knowledge.yaml")

        # PTE stimulus
        self.stimulus_system: str           = _pte_stimulus["system"]
        self.stimulus_tasks:  dict[str, str] = _pte_stimulus["tasks"]

        # PTE feedback — per task type
        self.feedback_tasks: dict[str, dict] = _pte_fb_tasks["tasks"]

        # PTE feedback — output schema templates (assembled by build_primary_schema)
        self.schema_base_fields: str         = _pte_fb_schemas["base_fields"]
        self.schema_speaking:    str         = _pte_fb_schemas["speaking"]
        self.schema_writing:     str         = _pte_fb_schemas["writing"]
        self.schema_reading:     str         = _pte_fb_schemas["reading"]
        self.schema_listening:   str         = _pte_fb_schemas["listening"]
        self.schema_unscored:    str         = _pte_fb_schemas["unscored"]
        self.schema_scoring_note: str        = _pte_fb_schemas["scoring_note"]

        # PTE judge prompts — per scoring section
        self.judge_speaking:  str = _pte_judge["speaking"]
        self.judge_writing:   str = _pte_judge["writing"]
        self.judge_reading:   str = _pte_judge["reading"]
        self.judge_listening: str = _pte_judge["listening"]

        # PTE retry note template
        self.retry_note_template: str = _pte_retry["template"]

        # Read Aloud
        self.read_aloud_stimulus_system: str = _read_aloud["stimulus"]["system"]
        self.read_aloud_stimulus_user:   str = _read_aloud["stimulus"]["user"]
        self.read_aloud_feedback_system: str = _read_aloud["feedback"]["system"]
        self.read_aloud_feedback_user:   str = _read_aloud["feedback"]["user"]

        # Word Lookup — DeepSeek fallback for phrases and dictionary misses
        self.word_lookup_fallback_system: str = _word_lookup["fallback"]["system"]
        self.word_lookup_fallback_user:   str = _word_lookup["fallback"]["user"]

        # Study Assistant — hand-authored navigation knowledge + PTE FAQ
        self.study_assistant_knowledge: dict = _study_assistant_knowledge

    def build_primary_schema(self, section: str, details_schema: str) -> str:
        """Assemble the full output schema string for the primary LLM call."""
        schema_map = {
            "speaking":  self.schema_speaking,
            "writing":   self.schema_writing,
            "reading":   self.schema_reading,
            "listening": self.schema_listening,
            "unscored":  self.schema_unscored,
        }
        template = schema_map[section]
        return (
            template
            .replace("FIELDS_PLACEHOLDER", self.schema_base_fields)
            .replace("DETAILS_PLACEHOLDER", details_schema)
        )

    def build_retry_note(self, diverged: list) -> str:
        """Build the retry note appended to user_content when Judge disagrees."""
        diverged_list = "\n".join(
            f"  - {d['dimension']}: your score {d['primaryScore']}, second examiner {d['judgeScore']}"
            for d in diverged
        )
        return self.retry_note_template.replace("<<DIVERGED_LIST>>", diverged_list)


# Singleton — loaded once at import time
prompts = Prompts()
