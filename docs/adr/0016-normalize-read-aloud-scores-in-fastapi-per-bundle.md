# Normalize Read Aloud scores in FastAPI per bundle, and score passages sentence by sentence

## Context

ADR-0012 makes the EchoLingo Speech Evaluator the default Read Aloud evaluator and asks for a provider-neutral result on EchoLingo's 10–90 reference scale. ADR-0013 lists "normalization" among the contents of an Evaluator Checkpoint Bundle. The first bundle, `speech-evaluator-v0.1.0`, was exported in M4. Its `normalization.json` holds only the acoustic-feature standardization the scorer needs, and the Worker returns scores on the label scales (sentence and word 0–10, phoneme 0–2).

Three facts measured during M5 (2026-10-25/26, SpeechOcean validation only) shaped how the scores reach the learner:

- On the Worker's request path, a linear map from prediction to official label barely changes sentence scores (slope about 1.02, intercept about −0.34; MAE 0.80 → 0.79). For words and phonemes, least squares raises the MAE (1.05 → 1.19 and 0.21 → 0.26), because those labels pile up at the top of the scale.
- SpeechOcean has no Content label: every recording is a complete reading of one 3–10 word sentence. Raw letter coverage of the reference by the free ASR cannot tell a wrong Read Aloud passage from a poorly recognized one, because an unrelated passage already shares about 0.45 of its letters in order.
- Every training recording is a single sentence. Scored in one pass, a multi-sentence recording runs low. On 39 passages of six joined validation sentences (16–38 s), sentence Accuracy was 1.30 below the same sentences scored alone and Fluency 1.67 below, out of 10. The gap already appears at two sentences (6 s), inside the training duration range.

## Decision

FastAPI owns Provisional Score Normalization. It keeps one small, versioned file per bundle, `backend/data/speech_calibration/<bundle id>.json`. The file holds increasing linear maps fitted on validation, prediction to official label, and each map is adopted only where it lowers the MAE; otherwise it is the identity. Scores then become 10 + 80 × score / label scale, clamped to 10–90. A result from a bundle without such a file is refused with `calibration_missing`, never shown on a guessed scale. Bundles stay immutable: changing the display mapping needs no re-export, and the same file cannot be applied to a different bundle.

Read Aloud Content is a stated policy, not an estimate. It is derived from the Worker's chance-corrected letter coverage, where chance is the same measure against the reference's letters in reverse order. The Worker withholds word and phoneme evidence below its `reference_not_read` gate of 0.10 and reports the gate with every result. Below that gate FastAPI gives the minimum everywhere. Above it, Content rises linearly to 90 at 0.50. The task score is 40% Pronunciation + 40% Oral Fluency + 20% Content, capped at Content + 30. When the sentence evidence is degraded, Pronunciation, Oral Fluency and the task score are left out.

The Worker splits a multi-sentence reference at its sentence ends, merging sentences of fewer than three words into a neighbour. It aligns the whole recording once and cuts each sentence at its aligned span, with up to 0.5 s of padding but never past the midpoint of the gap to a neighbour. Each cut gets its own encoder and scorer pass, and sentence scores are averaged by word count. The free ASR still runs on the whole recording.

## Consequences

- Sentence-by-sentence scoring removed the passage bias on the 39 validation passages (Accuracy +0.13, Fluency +0.13 against the sentences scored alone) without losing agreement with experts (Pearson 0.87 / 0.91). A whole request on the development Mac took a median of 3.9 s and at most 4.8 s.
- Pauses between sentences no longer affect Oral Fluency. They belong to the fluency events of M6.
- Content is affected by recognition errors on accented speech, and no labelled data validates it. It is labelled as a reference policy, and on 3–10 word sentences 3.1% of real readings fall below the gate. A Content benchmark needs Read Aloud passages with labels for omissions and reading the wrong text.
- A new bundle needs its own calibration file before the backend will score it. `speech/src/echolingo_speech/evaluation/display_calibration.py` produces the file, measures the Content gate on passages, and checks passage scoring.
- The roadmap §9.3 bundle layout is unchanged; "normalization" in ADR-0013 refers to the scorer's input normalization, not the display scale.
