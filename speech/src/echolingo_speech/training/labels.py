"""Label scale normalization and alignment-validity rules for the A0 scorer.

ADR-0011 SS5.3: normalize each SpeechOcean762 target to a common scale before
averaging within a supervision hierarchy (sentence/word/phoneme), and mask out
low-quality alignment rather than letting it silently corrupt word/phoneme
supervision. The raw scales below were read directly off the real M1 manifest
(2026-07-24), not assumed from the SpeechOcean762 paper: sentence accuracy/
fluency/prosodic/total and completeness are all integers or floats on a 0-10
scale (completeness is a 0-10 ratio*10 in this release, not the paper's 0-1),
word accuracy/total are 0-10, phone accuracy is continuous on 0-2, and word
stress is strictly binary -- only {5, 10} appear across all 5000 records
(misplaced/correct), never a continuous value.
"""

from __future__ import annotations

SENTENCE_TARGET_KEYS = ("accuracy", "fluency", "prosodic", "completeness")

SENTENCE_SCALE = 10.0
WORD_SCALE = 10.0
PHONE_SCALE = 2.0

STRESS_MISPLACED_RAW = 5
STRESS_CORRECT_RAW = 10

# The 39 ARPAbet base phones. SpeechOcean762's canonical phones carry stress
# digits (AH0/AH1/AH2) and a few bare vowels (IH, UH); identity embeddings key
# on the base phone so rare stress variants share one well-trained vector.
# Index 0 is reserved for anything outside this fixed, split-independent set.
ARPABET_BASE_PHONES = (
    "AA", "AE", "AH", "AO", "AW", "AY", "B", "CH", "D", "DH", "EH", "ER", "EY",
    "F", "G", "HH", "IH", "IY", "JH", "K", "L", "M", "N", "NG", "OW", "OY", "P",
    "R", "S", "SH", "T", "TH", "UH", "UW", "V", "W", "Y", "Z", "ZH",
)
UNKNOWN_PHONE_ID = 0
NUM_PHONE_IDS = len(ARPABET_BASE_PHONES) + 1
_PHONE_TO_ID = {phone: index + 1 for index, phone in enumerate(ARPABET_BASE_PHONES)}


def normalize_sentence_scores(sentence: dict) -> dict[str, float]:
    """Map the four sentence-level regression targets to [0, 1]."""
    return {key: sentence[key] / SENTENCE_SCALE for key in SENTENCE_TARGET_KEYS}


def normalize_word_score(word: dict) -> dict[str, float]:
    """Map word accuracy to [0, 1] and word stress to a {0, 1} binary label.

    Stress is modeled as binary classification (not regression) because the
    real label only ever takes two values; anything else means the release's
    scoring convention changed and callers should fail loudly rather than
    silently train against a wrong scale.
    """
    stress_raw = word["stress"]
    if stress_raw not in (STRESS_MISPLACED_RAW, STRESS_CORRECT_RAW):
        raise ValueError(f"unexpected word stress value: {stress_raw!r}")
    return {
        "accuracy": word["accuracy"] / WORD_SCALE,
        "stress": 1.0 if stress_raw == STRESS_CORRECT_RAW else 0.0,
    }


def normalize_phone_accuracy(raw: float) -> float:
    """Map a single phone's continuous 0-2 accuracy score to [0, 1]."""
    return raw / PHONE_SCALE


def canonical_phone_id(phone: str) -> int:
    """Map a canonical phone label (e.g. `AH0`, `IH`) to its base-phone id."""
    return _PHONE_TO_ID.get(phone.rstrip("012"), UNKNOWN_PHONE_ID)


def word_alignment_is_valid(mfa_word_count: int, reference_word_count: int) -> bool:
    """Word-level (and by extension phoneme-level) supervision for a record is
    only used when the MFA word tier has exactly as many non-blank intervals
    as the reference has words, so a position-order zip between the two is a
    safe correspondence (sentence-level supervision is unaffected either way).
    """
    return mfa_word_count == reference_word_count


def phone_alignment_is_valid(mfa_phone_count: int, canonical_phone_count: int) -> bool:
    """Phoneme supervision for one word is only used when MFA's predicted
    phone count for that word's time span matches the canonical phone count,
    so a time-order zip between the two is a safe correspondence. A mismatch
    (e.g. a learner's severe mispronunciation split/merged phones under MFA)
    masks only that word's phones, not its neighbors.
    """
    return mfa_phone_count == canonical_phone_count
