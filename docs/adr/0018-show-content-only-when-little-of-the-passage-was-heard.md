# Show Content only when little of the passage was heard

## Context

ADR-0016 gives every score the minimum below a chance-corrected letter coverage of 0.10 (`reference_not_read`). Above that gate, Pronunciation and Oral Fluency come from the scorer, and Content caps only the task score (Content + 30).

On 2026-10-31 a non-English check used macOS text-to-speech (`speech/src/echolingo_speech/evaluation/non_english.py`). French, German, Spanish and Italian translations of a passage, scored against that same English passage, crossed the gate. Shared cognates such as "participants", "cognitive" and "minutes" raised their coverage to 0.10–0.24. The scorer measures sound, not language, so it gave them Pronunciation and Oral Fluency of 62–66 and task scores of 41–59. A learner who read a translation would have seen English-looking scores.

Raising the gate is not possible. German reached 0.24, while 3.1% of real single-sentence readings already fall below 0.10. Real passages sit higher: the 39 SpeechOcean validation readings joined into passages range from 0.33 to 0.97, and the weakest adult readers fall between 0.39 and 0.63. In the M5 check (ADR-0016), most half-read passages fell below 0.30.

## Decision

Below a corrected coverage of 0.28 (`SCORED_READING_COVERAGE` in `backend/services/speech_normalization.py`), FastAPI shows Content only:

- Pronunciation, Oral Fluency and the task score are left out.
- The word annotations, fluency events and reading errors are left out.
- The evidence status is marked `reference_barely_read`.
- The page explains that too little of the passage was recognised.

The Worker and the bundle do not change.

The threshold 0.28 lies between the highest translation (0.24) and the lowest real passage (0.33). The rule follows the failed-alignment case of ADR-0016: when the evidence does not show that the passage was read, scores are left out rather than guessed.

## Consequences

- After the change, the non-English check passes on all 44 pairs: none shows Pronunciation, Oral Fluency or a task score above the minimum. All 16 English readings of their own passage are still scored.
- A translation still gets some Content, from 11 to 38.
- Most half-read passages now show Content only. Before this change they showed Pronunciation and Oral Fluency, with the task score capped by Content.
- The margin rests on 39 passages from Mandarin-L1 readers. A learner whose speech the free ASR mostly mishears, such as a child or a heavy accent, can fall below 0.28 and be shown Content only. A better ASR or labelled passages with low coverage should prompt a re-check.
- Language identification remains the direct fix if mixed-language or other non-English cases appear.
