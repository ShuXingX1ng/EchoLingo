"""
Provisional Score Normalization and the Read Aloud reference policy

The Speech Evaluation Worker reports the bundle's label scales (sentence and
word 0–10, phoneme 0–2). This module turns them into EchoLingo's 10–90
display scale (CONTEXT.md: Provisional Score Normalization) and composes the
Read Aloud Spoken Task Score Estimate (roadmap §8). None of it is PTE
calibration.

- Each score first goes through a linear map fitted on SpeechOcean
  validation (`speech/.../evaluation/display_calibration.py`), which corrects
  the model's low-running raw scale without changing any ranking, then onto
  10 + 80 × (score / label scale), clamped to 10–90. The fitted maps live in
  `data/speech_calibration/<bundle id>.json`; a bundle without one is not
  scored.
- Content has no labelled data: it is a stated policy on the Worker's
  chance-corrected letter coverage of the reference by the free ASR, not an
  estimate. Recognition errors on accented speech lower it too.
- Task score = 40% Pronunciation + 40% Oral Fluency + 20% Content, capped
  at Content + 30 so that reading little of the passage cannot score well.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

CALIBRATION_DIR = Path(__file__).resolve().parent.parent / "data" / "speech_calibration"

DISPLAY_MIN = 10
DISPLAY_MAX = 90

# Chance-corrected letter coverage (Worker `reference_character_coverage_corrected`).
# The floor is the Worker's `reference_not_read` gate (its
# `min_reference_character_coverage_corrected` default): Content is the
# minimum below it and rises linearly to the maximum at
# `CONTENT_FULL_COVERAGE`. On SpeechOcean validation readings joined into
# passages of about 40 words (2026-10-26, roadmap §18.3 step 6): no own
# passage fell below 0.10 and 95% of wrong passages did; 28% of own passages
# fell below 0.50, as did every half-read one (85% below 0.30).
CONTENT_FLOOR_COVERAGE = 0.10
CONTENT_FULL_COVERAGE = 0.50

# Below this corrected coverage too little of the passage was heard for its
# Pronunciation and Oral Fluency to be about reading it: they and the task
# score are left out, with the word and fluency diagnostics, and only Content
# is given. Set on 2026-10-31 between the 39 SpeechOcean validation readings
# joined into passages (lowest 0.33; weak adults 0.39-0.63) and macOS
# text-to-speech translations of a passage that cross the reading gate
# through cognates (French, German, Spanish, Italian: 0.10-0.24, which were
# shown Pronunciation and Oral Fluency of 62-66). Most half-read passages
# fall below it too (`speech/docs/first-generation-model-card.md` SS6).
SCORED_READING_COVERAGE = 0.28

TASK_WEIGHTS = {"pronunciation": 0.4, "oralFluency": 0.4, "content": 0.2}
CONTENT_CAP_MARGIN = 30


class CalibrationMissing(ValueError):
    """No Provisional Score Normalization was fitted for this bundle."""


@dataclass(frozen=True)
class LinearMap:
    slope: float
    intercept: float

    def __call__(self, value: float) -> float:
        return self.slope * value + self.intercept


@dataclass(frozen=True)
class DisplayCalibration:
    bundle_id: str
    pronunciation: LinearMap
    oral_fluency: LinearMap
    word: LinearMap
    phone: LinearMap
    sentence_scale: float
    word_scale: float
    phone_scale: float

    def pronunciation_score(self, raw: float) -> int:
        return to_display(self.pronunciation(raw), self.sentence_scale)

    def oral_fluency_score(self, raw: float) -> int:
        return to_display(self.oral_fluency(raw), self.sentence_scale)

    def word_score(self, raw: float) -> int:
        return to_display(self.word(raw), self.word_scale)

    def phone_score(self, raw: float) -> int:
        return to_display(self.phone(raw), self.phone_scale)


def _linear(entry: dict) -> LinearMap:
    linear = LinearMap(float(entry["slope"]), float(entry["intercept"]))
    if linear.slope <= 0:
        raise ValueError("a Provisional Score Normalization map must be increasing")
    return linear


@lru_cache(maxsize=None)
def load_calibration(bundle_id: str) -> DisplayCalibration:
    path = CALIBRATION_DIR / f"{bundle_id}.json"
    # The id comes from the Worker; never let it name a file elsewhere.
    if path.parent != CALIBRATION_DIR or not path.is_file():
        raise CalibrationMissing(f"no Provisional Score Normalization for {bundle_id}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("bundleId") != bundle_id:
        raise CalibrationMissing(f"{path.name} is not the calibration of {bundle_id}")
    scale = raw["labelScale"]
    return DisplayCalibration(
        bundle_id=bundle_id,
        pronunciation=_linear(raw["sentence"]["pronunciation"]),
        oral_fluency=_linear(raw["sentence"]["oral_fluency"]),
        word=_linear(raw["word"]),
        phone=_linear(raw["phone"]),
        sentence_scale=float(scale["sentence"]),
        word_scale=float(scale["word"]),
        phone_scale=float(scale["phone"]),
    )


def to_display(value: float, scale: float) -> int:
    """A label-scale score on the 10–90 display scale."""
    share = min(1.0, max(0.0, value / scale))
    return round(DISPLAY_MIN + (DISPLAY_MAX - DISPLAY_MIN) * share)


def content_score(corrected_coverage: float, floor: float = CONTENT_FLOOR_COVERAGE) -> int:
    """`floor` is the gate the Worker judged the recording against
    (`reference_not_read_below`), so the two never disagree."""
    span = CONTENT_FULL_COVERAGE - floor
    if span <= 0:
        raise ValueError("the Content floor must lie below full coverage")
    share = min(1.0, max(0.0, (corrected_coverage - floor) / span))
    return round(DISPLAY_MIN + (DISPLAY_MAX - DISPLAY_MIN) * share)


def task_score(pronunciation: int, oral_fluency: int, content: int) -> int:
    weighted = (
        TASK_WEIGHTS["pronunciation"] * pronunciation
        + TASK_WEIGHTS["oralFluency"] * oral_fluency
        + TASK_WEIGHTS["content"] * content
    )
    capped = min(weighted, content + CONTENT_CAP_MARGIN)
    return round(min(DISPLAY_MAX, max(DISPLAY_MIN, capped)))


def display_share(score: Optional[int], scale: str) -> Optional[float]:
    """Where a score sits in its scale's range, 0–1, so providers on
    different scales can be compared."""
    if score is None:
        return None
    if scale == "10-90":
        return (score - DISPLAY_MIN) / (DISPLAY_MAX - DISPLAY_MIN)
    return score / 100
