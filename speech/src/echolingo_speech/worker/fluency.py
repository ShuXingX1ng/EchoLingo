"""M6: fluency events from the forced alignment (roadmap SS11, SS18.3 step 7).

The scorer's fluency is one score per sentence, and since M5 a passage is
scored sentence by sentence, so neither says where the reading stalled nor
sees the pauses between sentences. These events do, from the aligned word
spans alone. MFA drops silence from its word tier, so the gap between two
reference words is time spent on something other than the reference:
silence, a filler, a false start. (`features/acoustic.py` summarizes the
same gaps into counts for the scorer; it does not say where they are.)

- `pause`: a gap of at least `pause_sec` inside a sentence, or
  `boundary_pause_sec` between two reference sentences.
- `slow_word`: a word held for at least `slow_word_sec_per_phone` per aligned
  phone, and `slow_word_min_sec` in all: drawn out or sounded out.

The leading and trailing silence of a recording is never an event. The
within-sentence thresholds were chosen on validation
(`evaluation/fluency_events.py`); SpeechOcean recordings are single
sentences, so the between-sentence threshold has no benchmark (see
`FluencyThresholds`).

Where the reading departs from the reference (an extra word, a word read
as another), the aligner still fits every reference word in, stretching
some and squeezing others, and its gaps and long words there are not where
the reader paused or lingered. `confirmed` keeps only the events the free
ASR's word times bear out (`evaluation/fluency_confirmation.py`).
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import accumulate
from typing import TYPE_CHECKING

from echolingo_speech.worker.reading_errors import anchors
from echolingo_speech.worker.schema import FluencyEvent

if TYPE_CHECKING:
    from echolingo_speech.worker.pipeline import AlignedWord
    from echolingo_speech.worker.reading_errors import RecognizedWord


@dataclass(frozen=True)
class FluencyThresholds:
    # Chosen on validation on 2026-10-30 as the smallest candidate that gives
    # at most 5% of fluent readings (official fluency >= 9) an event: pauses
    # 1.7% of 58 fluent and 42% of 57 disfluent (<= 6) readings, and finds
    # 91% / 94% / 97% of inserted 0.5 / 0.8 / 1.2 s pauses; slow words 3.4%
    # and 65%. Report: `<reports>/m6/fluency-report-validation.json`.
    pause_sec: float = 0.4
    # Not measured: no SpeechOcean recording has two sentences. Readers pause
    # at a full stop, so this stays well above the within-sentence one.
    boundary_pause_sec: float = 1.5
    slow_word_sec_per_phone: float = 0.25
    slow_word_min_sec: float = 0.5


DEFAULT_THRESHOLDS = FluencyThresholds()


def fluency_events(
    words: list[AlignedWord],
    sentence_word_counts: list[int] | None = None,
    thresholds: FluencyThresholds = DEFAULT_THRESHOLDS,
) -> list[FluencyEvent]:
    """Pauses and slow words in reading order. `words` are the reference
    words as aligned (`aligned_words`); `sentence_word_counts` splits them
    into sentences (`reference_sentences`), one sentence when absent or when
    the counts do not add up to the words."""
    counts = sentence_word_counts or [len(words)]
    if sum(counts) != len(words):
        counts = [len(words)]
    # Index of the first word of every sentence but the first.
    sentence_starts = set(accumulate(counts[:-1]))

    events: list[FluencyEvent] = []
    for index, word in enumerate(words):
        length = word.span.end - word.span.start
        if (
            not word.out_of_vocabulary and word.phones
            and length >= thresholds.slow_word_min_sec
            and length / len(word.phones) >= thresholds.slow_word_sec_per_phone
        ):
            events.append(FluencyEvent(
                kind="slow_word", start_sec=word.span.start, end_sec=word.span.end,
                word_index=index,
            ))
        if index + 1 == len(words):
            continue
        gap_start, gap_end = word.span.end, words[index + 1].span.start
        boundary = index + 1 in sentence_starts
        limit = thresholds.boundary_pause_sec if boundary else thresholds.pause_sec
        if gap_end - gap_start >= limit:
            events.append(FluencyEvent(
                kind="pause", start_sec=gap_start, end_sec=gap_end, word_index=index,
                at_sentence_boundary=boundary,
            ))
    return events


@dataclass(frozen=True)
class ConfirmationThresholds:
    # Chosen on 2026-10-31 on the tuning half of validation as the candidate
    # with the fewest events invented beside a cut, repeated or inserted
    # word that keeps 90% of the planted pauses and slow words; measured once
    # on the held-out half (6 speakers): invented events 118 -> 41 in 350
    # changed copies, planted pauses of 0.5 s and longer kept 94%, slow words
    # 89% (adults: 49 -> 21, 90%, 85%); fluent readers unchanged. Report:
    # `<reports>/m6/fluency-confirmation-report-validation.json`.
    # A recognized word this similar to a reference word anchors it, as in
    # `reading_errors`.
    match_similarity: float = 0.7
    # A slow word, if heard, is heard within its aligned span, give or take this.
    anchor_tolerance_sec: float = 0.0
    # A pause may hold recognized words of at most this many letters.
    pause_max_letters: int = 0
    # A slow word may hold at most this many recognized letters beyond its own.
    slow_word_extra_letters: int = 4


DEFAULT_CONFIRMATION = ConfirmationThresholds()


def confirmed(
    events: list[FluencyEvent],
    words: list[AlignedWord],
    heard: list[RecognizedWord] | tuple[RecognizedWord, ...],
    thresholds: ConfirmationThresholds = DEFAULT_CONFIRMATION,
) -> list[FluencyEvent]:
    """The events the free ASR, which does not know the reference, bears
    out:
    - a pause, when the ASR heard nothing in it: no reference word and
      nothing longer than `pause_max_letters`. A reference word heard in
      the gap is a word the aligner placed too early or too late; an extra
      word heard there is speech the aligner did not account for.
    - a slow word, when the ASR, if it heard the word, heard it inside the
      aligned span, and heard no other reference word and at most
      `slow_word_extra_letters` letters beyond the word's own there.
    Where the alignment has drifted but the ASR heard nothing in the gap,
    the pause stays: the reader did pause after that word, only its time is
    uncertain. A word is placed by the middle of its recognized span."""
    pairs = anchors([w.text for w in words], [h.text for h in heard],
                    thresholds.match_similarity)
    heard_as = dict(pairs)
    reference_of = {j: i for i, j in pairs}
    middle = [(h.start_sec + h.end_sec) / 2 for h in heard]

    def heard_in_place(index: int) -> bool:
        if index not in heard_as:
            return True
        span = words[index].span
        return (span.start - thresholds.anchor_tolerance_sec <= middle[heard_as[index]]
                <= span.end + thresholds.anchor_tolerance_sec)

    kept = []
    for event in events:
        index = event.word_index
        within = [j for j, m in enumerate(middle) if event.start_sec < m < event.end_sec]
        if event.kind == "pause":
            bears_out = not any(j in reference_of
                                or len(heard[j].text) > thresholds.pause_max_letters
                                for j in within)
        else:
            bears_out = (
                heard_in_place(index)
                and all(reference_of.get(j, index) == index for j in within)
                and sum(len(heard[j].text) for j in within)
                <= len(words[index].text) + thresholds.slow_word_extra_letters
            )
        if bears_out:
            kept.append(event)
    return kept
