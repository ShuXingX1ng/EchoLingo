# Report reading diagnostics only where forced alignment and free ASR agree

## Context

M6 gives the learner more than scores: words left out, added or said again, pauses inside a sentence, and words drawn out. These diagnostics go to the page and, as facts, to the Feedback LLM, which may not add any (roadmap §12). A false diagnostic therefore becomes a wrong exercise for the learner.

ADR-0011 expected reference-conditioned alignment to locate omissions, insertions and repetitions. M6 measured that it cannot do this alone. The Worker has two independent views of a recording:

- Forced alignment (MFA), which places every reference word somewhere in the audio. It never shows a word left out or one added. Where the reading departs from the reference, it stretches some words and squeezes others.
- The free ASR, from the encoder's own CTC head, which does not know the reference. On learner speech it often mishears words. In a 2026-10-29 run it heard "heart" as "hard".

Neither view is reliable alone. Diffing the ASR text against the reference reports errors that were never made. Fluency events taken from the alignment alone invent pauses and long words next to any departure. In the 2026-10-31 browser run, one inserted word produced a false pause and a false drawn-out word on its neighbours, and a click at the start of the recording produced a false pause after the first word. The LLM turned all three into exercises.

## Decision

The Worker reports a reading diagnostic only where the two views agree. Each kind is gated on a synthetic validation benchmark with a fixed selection rule, using a tuning half and a held-out half split by speaker.

- Reading errors (`worker/reading_errors.py`) are judged only between ASR words that confidently match the reference ("anchors"). A kind ships only if its held-out precision is at least 0.9. As of 2026-10-30, only inserted words ship. Omitted words (0.75) and repeated words (0.81) do not.
- Fluency events (`worker/fluency.py`) come from the alignment and are kept only when the free ASR bears them out (`confirmed`).
  - A pause is kept only if the ASR heard nothing inside it.
  - A drawn-out word is kept only if three things hold. If the ASR heard that word, it heard it inside the word's aligned span. It heard no other reference word there. And it heard at most a few extra letters there.
  - The thresholds must keep at least 90% of the planted pauses and drawn-out words that the alignment alone finds, on the tuning half.

This refines the alignment path of ADR-0011 without replacing it: the alignment still supplies word timing, and the ASR decides whether a departure is reported.

FastAPI's practice summary and the LLM context use only these reported facts. They also say that the evaluator does not find every error, so the absence of a report does not mean the reading had no errors.

## Consequences

- On the held-out half, confirmation cut the fluency events invented next to a cut, repeated or inserted word from 118 to 41, over 350 changed copies. It kept 94% of the planted pauses and 89% of the planted drawn-out words. The event rate for fluent readers did not change.
- Recall is deliberately low where the ASR mishears. An inserted word next to a misheard neighbour is not reported, and some real pauses and drawn-out words are dropped on badly recognised recordings.
- Both diagnostics depend on the free ASR. A better ASR, for example from a future encoder, changes what is reported, not only its accuracy, so it must be re-benchmarked.
- A word read as a different word is neither detected nor benchmarked. The scorer can still give it a high score, and the alignment around it can still produce an event.
- Benchmarks: `speech/src/echolingo_speech/evaluation/reading_errors.py`, `fluency_events.py` and `fluency_confirmation.py`. Reports: `<reports>/m6/`.
