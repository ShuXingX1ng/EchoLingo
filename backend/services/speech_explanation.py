"""
Deterministic explanation layer (Speech Evaluator roadmap §12)

Between the speech evaluator and the Feedback LLM. A Speech Evaluation
Result becomes checkable facts — each a word the evaluator flagged, a
reading error or a fluency event, at a position in `words` — and a few
practice items chosen from them by fixed rules (`practice_summary`). The
Feedback LLM is given the same facts (`feedback_context`) and only words
them; it may not change a score, add an error that was not detected, or
present missing evidence as a finding.

Indices are into the result's `words`. For the EchoLingo Speech Evaluator
these are the reference words in order; Azure also lists the words it heard
inserted.
"""

from dataclasses import dataclass
from typing import Optional

from models.schemas import PracticeItem, PracticeItemKind, SpeechEvaluationResult
from services.speech_normalization import display_share

# At most this many practice items, each naming at most this many words.
MAX_PRACTICE_ITEMS = 3
MAX_PRACTICE_WORDS = 5

# A reading error changes what was read, so these come first.
_READING_KINDS: tuple[PracticeItemKind, ...] = ("omitted", "inserted", "repeated")
_PRONUNCIATION_KINDS: tuple[PracticeItemKind, ...] = ("mispronounced",)
_FLUENCY_KINDS: tuple[PracticeItemKind, ...] = ("pause", "slow_word")


@dataclass(frozen=True)
class SpeechFact:
    """One thing the evaluator found. `index` is the word mispronounced,
    left out, said again or drawn out; the word a pause or an inserted word
    follows; or, where the provider lists it among the words, the inserted
    word itself."""
    kind: PracticeItemKind
    index: int
    word: str
    # inserted / repeated: what was heard.
    heard: Optional[str] = None
    score: Optional[int] = None
    seconds: Optional[float] = None
    at_sentence_boundary: bool = False

    @property
    def shown(self) -> str:
        """The word a practice item names: an inserted word as heard."""
        return (self.heard or self.word) if self.kind == "inserted" else self.word


def word_evidence_available(result: SpeechEvaluationResult) -> bool:
    return bool(result.words) and result.evidenceStatus.word.status in ("available", "partial")


def facts(result: SpeechEvaluationResult) -> list[SpeechFact]:
    """Every flagged word, reading error and fluency event, in reading order."""
    if not word_evidence_available(result):
        return []
    words = result.words
    found: list[SpeechFact] = []
    for index, word in enumerate(words):
        if word.status in ("mispronounced", "omitted", "inserted"):
            found.append(SpeechFact(word.status, index, word.word, score=word.score))
    for error in result.readingErrors:
        # An omitted word already has that status in `words`.
        if error.kind != "omitted" and 0 <= error.wordIndex < len(words):
            found.append(SpeechFact(error.kind, error.wordIndex, words[error.wordIndex].word,
                                    heard=error.heard))
    for event in result.fluencyEvents:
        if 0 <= event.wordIndex < len(words):
            found.append(SpeechFact(
                event.kind, event.wordIndex, words[event.wordIndex].word,
                seconds=round(event.endSec - event.startSec, 1),
                at_sentence_boundary=event.atSentenceBoundary,
            ))
    return sorted(found, key=lambda fact: fact.index)


def _kind_order(result: SpeechEvaluationResult) -> tuple[PracticeItemKind, ...]:
    """Reading errors first, then whichever of pronunciation and fluency
    scored lower (pronunciation on a tie or without both scores)."""
    pronunciation = display_share(result.pronunciation, result.scale)
    fluency = display_share(result.oralFluency, result.scale)
    if pronunciation is not None and fluency is not None and fluency < pronunciation:
        return _READING_KINDS + _FLUENCY_KINDS + _PRONUNCIATION_KINDS
    return _READING_KINDS + _PRONUNCIATION_KINDS + _FLUENCY_KINDS


def _worst_first(fact: SpeechFact) -> tuple:
    """The lowest-scored mispronounced words and the longest pauses and
    drawn-out words first; reading errors in reading order."""
    if fact.kind == "mispronounced":
        return (fact.score if fact.score is not None else 0, fact.index)
    if fact.kind in _FLUENCY_KINDS:
        return (-(fact.seconds or 0), fact.index)
    return (fact.index,)


def practice_summary(result: SpeechEvaluationResult) -> list[PracticeItem]:
    """At most `MAX_PRACTICE_ITEMS` kinds of problem, in `_kind_order`,
    each naming its worst `MAX_PRACTICE_WORDS` words in reading order."""
    by_kind: dict[PracticeItemKind, list[SpeechFact]] = {}
    for fact in facts(result):
        by_kind.setdefault(fact.kind, []).append(fact)
    items = []
    for kind in _kind_order(result):
        if kind not in by_kind:
            continue
        chosen = sorted(sorted(by_kind[kind], key=_worst_first)[:MAX_PRACTICE_WORDS],
                        key=lambda fact: fact.index)
        items.append(PracticeItem(
            kind=kind, count=len(by_kind[kind]),
            wordIndices=[fact.index for fact in chosen], words=[fact.shown for fact in chosen],
        ))
        if len(items) == MAX_PRACTICE_ITEMS:
            break
    return items


def with_practice_summary(
    result: Optional[SpeechEvaluationResult],
) -> Optional[SpeechEvaluationResult]:
    if result is None:
        return None
    return result.model_copy(update={"practiceSummary": practice_summary(result)})


# ── Feedback LLM context ──────────────────────────────────────────────────────

def _quoted(word: str) -> str:
    return f'"{word}"'


def _describe(result: SpeechEvaluationResult, fact: SpeechFact) -> str:
    word = _quoted(fact.word)
    if fact.kind == "mispronounced":
        return word + " mispronounced" + ("" if fact.score is None else f" (word score {fact.score})")
    if fact.kind == "omitted":
        return f"{word} left out"
    if fact.kind == "repeated":
        return f"{word} said again" + ("" if fact.heard is None else f" (heard {_quoted(fact.heard)})")
    if fact.kind == "inserted":
        if result.words[fact.index].status == "inserted":
            return f"{word} added"
        return f"{_quoted(fact.shown)} added after {word}"
    if fact.kind == "pause":
        where = "between sentences" if fact.at_sentence_boundary else "within a sentence"
        return f"pause of {fact.seconds} s {where}, after {word}"
    return f"{word} drawn out ({fact.seconds} s)"


def _score_line(result: SpeechEvaluationResult) -> str:
    def score(value: Optional[int]) -> str:
        return "not available" if value is None else str(value)
    return (
        f"Speech evaluation scores ({result.scale} scale, a learning reference, not an "
        f"official PTE score) — Pronunciation: {score(result.pronunciation)}, Oral fluency: "
        f"{score(result.oralFluency)}, Content: {score(result.content)}"
    )


_ITEM_LABELS: dict[PracticeItemKind, str] = {
    "omitted": "words left out:",
    "inserted": "words added:",
    "repeated": "words said again:",
    "mispronounced": "mispronounced words:",
    "pause": "pauses after",
    "slow_word": "drawn-out words:",
}

RULES = (
    "Rules for using this evidence:\n"
    "- The scores above are fixed by the speech evaluator. Do not change them or describe "
    "the recording with other scores, and do not call them official PTE scores.\n"
    "- Name a word as mispronounced, left out, added or said again, or a pause or drawn-out "
    "word, only if it is listed above. Do not name any other word or any sound as an error.\n"
    "- Where evidence is not available or a word was not judged, say so; do not present it "
    "as a finding either way.\n"
    "- The evaluator does not detect every word left out, added or said again: do not say "
    "the reading had none."
)

NO_WORD_EVIDENCE = (
    "No word-level judgments are available for this recording. Do not name specific words "
    "as mispronounced, left out, added or said again, or point to pauses at specific words."
)


def feedback_context(result: Optional[SpeechEvaluationResult]) -> str:
    """The scores, facts and practice items as the Feedback LLM is given them."""
    parts = [] if result is None else [_score_line(result)]
    if result is None or not word_evidence_available(result):
        return "\n\n".join([*parts, NO_WORD_EVIDENCE, RULES])

    found = facts(result)
    # Only the EchoLingo Worker reads fluency events from its alignment.
    reports_fluency = result.provider == "echolingo"
    lines = ["Found by the speech evaluator, in reading order:"]
    if found:
        lines += [f"- {_describe(result, fact)}" for fact in found]
    else:
        lines.append("- nothing: every scored word was judged correct" + (
            " and no pause or drawn-out word was flagged" if reports_fluency else ""))
    not_judged = [w.word for w in result.words if w.status == "not_scored"]
    if not_judged:
        lines.append("Words not judged: " + ", ".join(_quoted(w) for w in not_judged))
    if not reports_fluency:
        lines.append("Pauses and drawn-out words are not reported by this evaluator.")
    parts.append("\n".join(lines))

    summary = result.practiceSummary or practice_summary(result)
    if summary:
        parts.append("Practise first, in this order: " + "; ".join(
            f"{_ITEM_LABELS[item.kind]} {', '.join(_quoted(w) for w in item.words)}"
            for item in summary))
    parts.append(RULES)
    return "\n\n".join(parts)
