"""M6: omitted, inserted and repeated words (roadmap SS11, SS18.3 step 7).

Forced alignment places every reference word somewhere, so the alignment
alone never shows a word left out or one added. The free ASR does, but on
learner speech it mishears constantly, so diffing its text against the
reference would report errors that were never made. A word is reported
only when independent signals agree.

The free ASR's words are matched to the reference in order, and only
confident matches (letter similarity at least `match_similarity`) are kept
as anchors. Only what lies between two neighbouring anchors is judged:

- `omitted`: reference words between them that the ASR did not hear at
  all, and that the aligner squeezed into almost no time, as it does to a
  word that is not in the audio. (The scorer's word score is no signal:
  it scores a squeezed span as well as any other.)
- `inserted`: words the ASR heard between two consecutive reference words
  that were both heard; `repeated` when the extra word resembles one of
  those two. A first or last word repeated counts too; an extra word
  before the first or after the last reference word is not reported. An
  extra word that, joined to the heard word beside it, comes closer to
  that reference word is one word heard in two ("how ever" for
  "however"), not an extra word.

Where the ASR heard something else in place of reference words, it is a
misrecognition as often as a misreading, and nothing is reported. Each
kind has its own thresholds, chosen on a synthetic validation benchmark
(`evaluation/reading_errors.py`); a kind whose precision there is below
0.9 is not reported at all (`ReadingErrorThresholds`).
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from functools import lru_cache
from typing import TYPE_CHECKING

from echolingo_speech.worker.schema import ReadingError, ReadingErrorKind

if TYPE_CHECKING:
    from echolingo_speech.encoder.loquacious import CharVocab
    from echolingo_speech.worker.pipeline import AlignedWord


@dataclass(frozen=True)
class RecognizedWord:
    text: str
    start_sec: float
    end_sec: float


def recognized_words(
    frame_token_ids: Sequence[int], vocab: CharVocab, frame_sec: float
) -> list[RecognizedWord]:
    """The words greedy CTC decoding gives (`CharVocab.decode_greedy`, so
    the same text), each from its first character frame to the end of its
    last one."""
    words: list[RecognizedWord] = []
    chars: list[str] = []
    start = end = 0
    previous = None

    def flush() -> None:
        if chars:
            words.append(RecognizedWord("".join(chars).lower(), start * frame_sec,
                                        end * frame_sec))
            chars.clear()

    for frame, token_id in enumerate(frame_token_ids):
        token = vocab.id_to_token.get(token_id, "")
        if token_id == vocab.delimiter_id:
            flush()
        elif token in vocab.characters:
            if token_id != previous:
                if not chars:
                    start = frame
                chars.append(token)
            end = frame + 1
        previous = token_id
    flush()
    return words


@lru_cache(maxsize=65536)
def similarity(a: str, b: str) -> float:
    """Letter similarity in [0, 1] (difflib's ratio)."""
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


def anchors(reference: Sequence[str], heard: Sequence[str], min_similarity: float
            ) -> list[tuple[int, int]]:
    """(reference index, recognized index) pairs, in order on both sides,
    of letter similarity at least `min_similarity`, with the largest total
    similarity."""
    rows, cols = len(reference), len(heard)
    score = [[0.0] * (cols + 1) for _ in range(rows + 1)]
    for i in range(1, rows + 1):
        for j in range(1, cols + 1):
            best = max(score[i - 1][j], score[i][j - 1])
            pair = similarity(reference[i - 1], heard[j - 1])
            if pair >= min_similarity:
                best = max(best, score[i - 1][j - 1] + pair)
            score[i][j] = best
    pairs, i, j = [], rows, cols
    while i and j:
        pair = similarity(reference[i - 1], heard[j - 1])
        if pair >= min_similarity and score[i][j] == score[i - 1][j - 1] + pair:
            pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif score[i][j] == score[i - 1][j]:
            i -= 1
        else:
            j -= 1
    return pairs[::-1]


@dataclass(frozen=True)
class KindThresholds:
    # An anchor: a recognized word this similar to a reference word.
    match_similarity: float
    # omitted: the aligned word lasts at most this per phone, and has at
    # least this many (a one-phone "a" is short and often unheard anyway).
    max_sec_per_phone: float = 0.0
    min_phones: int = 1
    # inserted / repeated: the extra recognized word is at least this long
    # and this many letters (the CTC head emits stray one-frame letters).
    min_extra_sec: float = 0.0
    min_extra_letters: int = 1
    # repeated: the extra word is at least this similar to a neighbour.
    repeat_similarity: float = 1.0


@dataclass(frozen=True)
class ReadingErrorThresholds:
    # None: the kind missed precision 0.9 on the benchmark and is not reported.
    by_kind: dict[ReadingErrorKind, KindThresholds | None] = field(default_factory=dict)


# Chosen on 2026-10-30 (report: `<reports>/m6/reading-error-report-validation.json`)
# on the tuning half of 260 validation recordings and their changed copies,
# then measured once on the held-out half (6 other speakers):
# - inserted: precision 0.94 (15 of 16 reports), recall 0.13 of 117 planted
#   words; none in any of 252 unchanged recordings. The planted words have
#   at least three phones, so a short inserted word ("the") goes unmeasured
#   and, under 0.3 s, unreported.
# - omitted: precision 0.75 (recall 0.31), below 0.9: not reported. Most
#   false reports are a word beside the planted one, or a word squeezed
#   by an inserted or repeated one.
# - repeated: precision 0.81 (recall 0.19), below 0.9: not reported.
DEFAULT_THRESHOLDS = ReadingErrorThresholds(by_kind={
    "inserted": KindThresholds(match_similarity=0.7, min_extra_sec=0.3, repeat_similarity=0.5),
    "omitted": None,
    "repeated": None,
})


def _segments(anchor_pairs: list[tuple[int, int]], reference_count: int, heard_count: int):
    """(left anchor, right anchor) reference and recognized indices around
    each stretch between neighbouring anchors; -1 and the counts stand for
    the start and end of the recording."""
    bounded = [(-1, -1), *anchor_pairs, (reference_count, heard_count)]
    return zip(bounded, bounded[1:])


def _unsplit(reference: list[str], heard: Sequence[RecognizedWord], left: int,
             left_heard: int, right: int, right_heard: int) -> list[RecognizedWord]:
    """The recognized words between two anchors, less those that belong to
    the anchor beside them (a word heard in two)."""
    first, last = left_heard + 1, right_heard - 1
    if left >= 0:
        joined = heard[left_heard].text
        while first <= last and similarity(reference[left], joined + heard[first].text) > (
                similarity(reference[left], joined)):
            joined += heard[first].text
            first += 1
    if right < len(reference):
        joined = heard[right_heard].text
        while first <= last and similarity(reference[right], heard[last].text + joined) > (
                similarity(reference[right], joined)):
            joined = heard[last].text + joined
            last -= 1
    return list(heard[first:last + 1])


def detect(
    kind: ReadingErrorKind,
    words: list[AlignedWord],
    heard: Sequence[RecognizedWord],
    thresholds: KindThresholds,
) -> list[ReadingError]:
    """The errors of one kind in reading order; `words` are the reference
    words as aligned (`aligned_words`)."""
    reference = [word.text for word in words]
    pairs = anchors(reference, [w.text for w in heard], thresholds.match_similarity)
    errors: list[ReadingError] = []
    for (left, left_heard), (right, right_heard) in _segments(pairs, len(words), len(heard)):
        missing = range(left + 1, right)
        extra = _unsplit(reference, heard, left, left_heard, right, right_heard)
        if kind == "omitted" and missing and not extra:
            for index in missing:
                word = words[index]
                length = word.span.end - word.span.start
                if (not word.out_of_vocabulary and len(word.phones) >= thresholds.min_phones
                        and length <= thresholds.max_sec_per_phone * len(word.phones)):
                    errors.append(ReadingError(
                        kind="omitted", word_index=index,
                        start_sec=word.span.start, end_sec=word.span.end,
                    ))
        elif kind != "omitted" and extra and not missing:
            extra = [w for w in extra if w.end_sec - w.start_sec >= thresholds.min_extra_sec
                     and len(w.text) >= thresholds.min_extra_letters]
            if not extra:
                continue
            neighbours = [i for i in (left, right) if 0 <= i < len(words)]
            repeated = [i for i in neighbours if any(
                similarity(reference[i], w.text) >= thresholds.repeat_similarity
                for w in extra)]
            common = {"start_sec": extra[0].start_sec, "end_sec": extra[-1].end_sec,
                      "heard": " ".join(w.text for w in extra)}
            if kind == "repeated" and repeated:
                errors.append(ReadingError(kind="repeated", word_index=repeated[0], **common))
            elif kind == "inserted" and not repeated and len(neighbours) == 2:
                errors.append(ReadingError(kind="inserted", word_index=left, **common))
    return errors


def reading_errors(
    words: list[AlignedWord],
    heard: Sequence[RecognizedWord],
    thresholds: ReadingErrorThresholds = DEFAULT_THRESHOLDS,
) -> list[ReadingError]:
    """Every reported kind's errors, in reading order."""
    errors = [error for kind, kind_thresholds in thresholds.by_kind.items()
              if kind_thresholds is not None
              for error in detect(kind, words, heard, kind_thresholds)]
    return sorted(errors, key=lambda e: (e.start_sec, e.word_index))
