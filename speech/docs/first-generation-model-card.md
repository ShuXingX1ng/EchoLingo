# Speech Evaluator v0.1.0: First-Generation Model Card

Status: written 2026-10-31 to close the first generation (roadmap SS15). It
collects in one place the results and limits that are otherwise spread over
the roadmap, the reports in this folder, and ADRs 0011–0017. Numbers come
from the runs cited; nothing here was re-run for this card, apart from the
gender breakdown (SS4) and the non-English check (SS6).

## 1. What it is

| Part | Value |
|---|---|
| Bundle | `speech-evaluator-v0.1.0`, immutable, with SHA-256 for every file |
| Scorer | M3 candidate 3.2c, seed 42: a multi-task head on layers 4/6/8/10/12 of the frozen encoder, with canonical phone embeddings, expert-mean targets, feature masking and offline audio augmentation |
| Encoder | `facebook/wav2vec2-base-960h` @ `22aad52d`, frozen; its CTC head is also the free ASR |
| Aligner | Montreal Forced Aligner, `english_us_arpa`, one `align_one` per request |
| Runtime | Private Worker on the development Mac's CPU (ADR-0015); median request 3.0 s |
| Display | FastAPI maps labels to 10–90 per bundle; Read Aloud Content and the task score follow a stated policy (ADR-0016) |
| Diagnostics | Fluency events and inserted words, reported only where alignment and the free ASR agree (ADR-0017) |

Intended use: a learning-phase reference for EchoLingo's Read Aloud practice.
It is **not** an official or PTE-equivalent score, and it is not calibrated
to PTE.

## 2. Data

- SpeechOcean762 (OpenSLR 101, CC-BY-4.0): 5000 single-sentence recordings of
  Mandarin-L1 learners of English, each scored by 5 experts.
- Partitions are fixed by speaker: 2240 train (1200 adult / 1040 child), 260
  validation (13 speakers: 140 adult / 120 child recordings), and 2500 sealed
  test.
- The leakage audit passes.
- The test partition was scored once, for the final M3 candidate, on
  2026-10-25. Every model and threshold choice used validation only.

## 3. Sealed-test results

These are the results for bundle seed 42 (`benchmark-results.json`), with
thresholds chosen on validation. The no-learning baselines are the ones in
`m2-acceptance-report.md` SS3.

| Metric | All | Adult | Child |
|---|---|---|---|
| Sentence Accuracy Pearson / MAE (0–10) | 0.706 / 0.80 | 0.813 / 0.79 | 0.378 / 0.80 |
| Sentence Fluency Pearson / MAE | 0.786 / 0.61 | 0.884 / 0.60 | 0.540 / 0.62 |
| Sentence Prosodic Pearson | 0.780 | 0.872 | 0.545 |
| Word Accuracy Pearson | 0.437 | 0.499 | 0.264 |
| Word error detection Macro F1 (baseline 0.480) | 0.680 | 0.711 | 0.590 |
| Phone Accuracy Pearson | 0.415 | 0.450 | 0.320 |
| Phone error detection Macro F1 (baseline 0.489) | 0.628 | 0.644 | 0.588 |

- **Completeness.** Its Pearson is about 0, so it is reported as model output
  only. Read Aloud Content does not use it.
- **Acceptance (roadmap SS7.2).** Sentence Accuracy and Fluency Pearson must be
  at least 0.60 on the sealed test. Both pass. The second seed (1337) gave
  0.704 and 0.787.
- **Validation through the Worker's request path.** Sentence metrics match
  training. Word error average precision is about 0.03 lower and phone about
  0.01 lower (ADR-0015).
- **Noisy validation copy (SNR 10–20 dB).** Sentence Accuracy Pearson 0.743,
  Fluency 0.831, word error average precision 0.525.

## 4. Groups

**Age.** This is the largest gap. Experts give children higher scores and
agree on them less, and almost all the word-error signal comes from adults.
Results for children are much weaker and should not be presented as reliable.

**Gender.** There was no gender breakdown before this card. The figures below
come from the validation request path: the M5 rows
`calibration-rows-validation.jsonl` (bundle v0.1.0), grouped by the
manifest's `speaker_gender`.

| Group | Recordings / speakers | Sentence Accuracy r | Sentence Fluency r | Word Accuracy r |
|---|---|---|---|---|
| Female | 140 / 7 | 0.86 (95% 0.40–0.91) | 0.87 | 0.50 |
| Male | 120 / 6 | 0.75 (95% 0.23–0.84) | 0.86 | 0.52 |
| Adult female | 80 / 4 | 0.88 | 0.89 | 0.47 |
| Adult male | 60 / 3 | 0.86 | 0.92 | 0.54 |
| Child female | 60 / 3 | 0.48 | 0.67 | 0.17 |
| Child male | 60 / 3 | 0.43 | 0.45 | 0.41 |

- The intervals come from 1000 resamples by speaker.
- The female–male gap comes mostly from age. Within each age group, the
  genders are close.
- With 3–7 speakers per group, these figures can neither show nor rule out a
  gender difference.
- No other speaker metadata is available.

**Accent and first language.** Every speaker's first language is Mandarin.
There is no evidence for other first languages or accents (roadmap SS7.3).
Regional accent is not treated as an error.

## 5. Diagnostics shown to the learner

Every diagnostic is reported only where forced alignment and the free ASR
agree (ADR-0017). Each kind was gated on a synthetic validation benchmark:
thresholds were chosen on half the validation speakers and measured once on
the other half (6 speakers).

| Diagnostic | Status | Held-out evidence |
|---|---|---|
| Mispronounced word | Shown (scorer + threshold) | Word error detection, SS3 |
| Pause inside a sentence (≥ 0.4 s) | Shown, ASR-confirmed | Planted pauses: 91–97% found before confirmation, 94% of those kept after it. Fluent readers with an event: 5.9% |
| Pause between sentences (≥ 1.5 s) | Shown | No benchmark (SpeechOcean recordings are single sentences) |
| Drawn-out word | Shown, ASR-confirmed | 89% of planted words kept. Events invented beside reading errors: 118 → 41 |
| Inserted word | Shown | Precision 0.94 (15 of 16), recall 0.13. Short words and anything under 0.3 s not measured |
| Omitted word | Not shown | Precision 0.75 |
| Repeated word | Not shown | Precision 0.81 |
| Word read as another word | Not detected | No benchmark. The scorer gave one substituted word 9.75 of 10 |

The practice summary and the Feedback LLM's context are built only from these
facts, and both say that the evaluator does not find every error.

## 6. Safety handling

- **Undecodable or silent audio.** The Worker refuses it with `invalid_audio`
  or `no_speech`.
- **Audio that is too long.** The Worker refuses it.
- **Audio outside the training duration.** The Worker adds the warning
  `duration_outside_training_range`.
- **Failed alignment.** Word and phone evidence is withheld. Pronunciation,
  Oral Fluency and the task score are not shown. Content is still scored from
  coverage.
- **Wrong passage.** Below a chance-corrected letter coverage of 0.10, the
  passage counts as not read and every score is the minimum (ADR-0016). On
  3–10 word sentences, 3.1% of real readings fall below this gate.

**Non-English speech.** This was checked on 2026-10-31 with
`evaluation/non_english.py`. No labelled non-English learner speech exists,
so macOS text-to-speech stood in for it:

- 11 voices each read a translation of one English passage;
- 4 English voices (US, GB, IN, AU) read each of the four passages;
- every clip was scored against every passage.

The rule was fixed before the run: every non-English pair must produce
nothing above the minimum, and every English reading of its own passage must
pass the gate. **The first run failed on 4 of 44 non-English pairs.**

- **Below the gate (40 pairs).** 31 were withheld as `reference_not_read`. 9
  failed alignment, with Content at the minimum.
- **Every language against unrelated passages.** Mandarin, Japanese, Korean,
  Portuguese, Russian, Hindi and Arabic always fall below the gate (corrected
  coverage at most 0.09). The same holds for every language when scored
  against a passage it does not translate.
- **English controls.** All 16 English own-passage readings pass (coverage
  0.95–1.0). All 48 English readings of another passage fall below the gate.
- **The 4 failing pairs.** French, German, Spanish and Italian translations,
  scored against the English passage they translate, cross the gate (coverage
  0.10–0.24). Shared cognates such as "participants", "cognitive" and
  "minutes" supply the letters. The page showed English-looking scores:
  - Pronunciation and Oral Fluency 62–66;
  - Content 11–38;
  - task score 41–59, compared with 84 for the US English reading and 10 for
    Mandarin.

  Raising the gate would not fix this: German reaches 0.24, and 3.1% of real
  readings already fall below 0.10.

**Fix (ADR-0018).** Below a corrected coverage of 0.28, FastAPI shows Content
only. Pronunciation, Oral Fluency, the task score, and the word and fluency
diagnostics are left out, with a notice.

- **Where 0.28 comes from.** It lies between the highest translation (0.24)
  and the lowest of the 39 real validation passages (0.33; weak adults score
  0.39–0.63).
- **Rerun with the rule restated.** The rule is now "no Pronunciation, Oral
  Fluency or task score above the minimum". All 44 non-English pairs pass it,
  and all 16 English own-passage readings are still scored.
- **What remains.**
  - Content still gives the four translations 11–38.
  - Most half-read passages fall below 0.28 and lose their Pronunciation and
    Oral Fluency too.
  - The margin rests on 39 passages from Mandarin-L1 readers.

Synthetic speech is clean and evenly paced. This check covers the gate, not
mixed-language or heavily accented learner speech.

## 7. Known limitations

- **Validity.** It is validated for Mandarin-L1 learners only: adequate for
  adults, weak for children. It is not calibrated to PTE, and the 10–90 scale
  is a provisional mapping.
- **Single sentences.** All training recordings are single sentences.
  Passages are scored sentence by sentence, which removed the measured
  passage bias (ADR-0016). Pauses between sentences have no benchmark.
- **Content.** It is a coverage policy, not a learned score. It is affected by
  ASR errors on accented speech, and no labelled data validates it.
- **Robustness.** Noise was benchmarked. Reverberation and telephone channels
  were only used as training augmentation and were not benchmarked
  separately. Truncated audio was not benchmarked.
- **Diagnostics.** These are the gaps in SS5:
  - omitted and repeated words are not shown;
  - substitutions are not detected;
  - inserted-word recall is low;
  - real pauses and drawn-out words are lost on badly recognised recordings.
- **Free ASR.** Both kinds of diagnostic depend on it. A different encoder
  must be re-benchmarked (ADR-0017).
- **Non-English speech and partial readings.** A translation of the passage
  into a language close to English still gets some Content (11–38). Below a
  corrected coverage of 0.28, Pronunciation and Oral Fluency are left out,
  which also hides them for most half-read passages (SS6, ADR-0018).
- **Product.** The stats page and historical weaknesses still use the Feedback
  LLM's dimension scores. Saved records from before M6 keep the full Azure
  baseline.

## 8. Reproduction

- The commands are in `speech/README.md`.
- Reports are in `$SPEECH_HOME/reports/`.
- Backups are in `~/echolingo-backup/<date>-<stage>/`, as listed in roadmap
  SS18.1.
- The earlier reports in this folder are `m2-acceptance-report.md` and
  `m25-diagnostics-report.md`.
