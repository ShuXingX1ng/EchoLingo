# M2.5 Diagnostics Report: A0 on Validation

Status: roadmap SS18.3 step 2 complete (2026-10-23). This is the fixed
reference that every M2.5 fix is compared against. No model was changed.

Produced by `python -m echolingo_speech.evaluation.diagnostics` on the two A0
checkpoints reproduced in `m2-acceptance-report.md` SS6 (`a0-seed42`,
`a0-seed1337` `best.pt`), on the **validation** partition only (260 records,
13 speakers; 140 adult / 120 child records). The sealed test partition was not
scored (roadmap SS18.4); the test rows in SS1 are alignment counts only. Raw
output (`diagnostics.json`, `summary.md`) is backed up with the A0 run under
`2026-10-23-m25-diagnostics`.

Validation is small, so per-group numbers below carry wide uncertainty; they
locate problems, they are not acceptance evidence.

## 1. Mask coverage (SS18.2 #6)

| Partition | Records | Valid word alignment | Supervised words | Supervised phones |
|---|---|---|---|---|
| train | 2240 | 2238 | 99.9% | 90.2% |
| validation | 260 | 260 | 100.0% | 88.8% |
| test | 2500 | 2499 | 100.0% | 90.8% |

Adult and child coverage differ by under 0.5 points in every partition.
Word supervision is essentially complete; about 10% of phones are masked
because MFA's phone count inside a word differs from the canonical count.
Coverage is not what limits A0. Whether the surviving boundaries are accurate
is still unmeasured (the quality score is always 1.0 under forced alignment).

## 2. Error detection (SS18.2 #2)

Threshold 0.6 on the [0, 1] scale. "Error" = accuracy below threshold.

| | Word, seed 42 | Word, seed 1337 | Phone, seed 42 | Phone, seed 1337 |
|---|---|---|---|---|
| Macro F1 at 0.6 | 0.4642 | 0.4642 | 0.4797 | 0.4851 |
| Predicted errors (true / false) | 0 / 0 | 0 / 0 | 1 / 2 | 3 / 2 |
| Missed errors | 224 | 224 | 377 | 375 |
| Labels below 0.6 | 13.4% | 13.4% | 8.7% | 8.7% |
| Predictions below 0.6 | 0.0% | 0.0% | 0.1% | 0.1% |
| Lowest prediction | 0.602 | 0.625 | 0.444 | 0.442 |
| Average precision, error class | 0.311 | 0.312 | 0.260 | 0.265 |
| Chance average precision | 0.134 | 0.134 | 0.087 | 0.087 |
| Best threshold on validation -> macro F1 | 0.881 -> 0.632 | 0.859 -> 0.625 | 0.844 -> 0.626 | 0.864 -> 0.627 |

Word labels are effectively discrete: of 1675 validation words, 186 sit at
0.2-0.3, 41 at 0.5, 39 near 0.8 and 1408 at 1.0. Predictions all fall between
0.6 and 1.0 (histogram bins 0.6-0.7: 2, 0.7-0.8: 51, 0.8-0.9: 363,
0.9-1.0: 1259 for seed 42).

Findings:

- The hypothesis in SS18.2 #2 is confirmed. Regression output collapses
  toward the mean, so no word prediction ever crosses 0.6 and the word
  "error" class is never predicted. The tied macro F1 is a thresholding
  artefact, not an absence of signal.
- There is real ranking signal: error-class average precision is about 2.3x
  (word) and 3x (phone) chance on both seeds.
- With the threshold chosen on validation, macro F1 rises to about 0.63 for
  both levels. That number is optimistic (chosen and measured on the same
  partition) and is only an upper bound on what step 3.1 can deliver.

## 3. Loss components (SS18.2 #3)

Each term reduced exactly as `training/losses.py` reduces it, over the full
validation partition. Shares are of the weighted total that early stopping
and the LR scheduler use.

| Term | Seed 42 | Seed 1337 | Share of total (42 / 1337) |
|---|---|---|---|
| Sentence Huber (mean of 4) | 0.0040 | 0.0044 | 0.08 / 0.08 |
| Word accuracy Huber | 0.0211 | 0.0210 | 0.13 / 0.13 |
| Word stress BCE | 0.0758 | 0.0750 | 0.48 / 0.47 |
| Phone Huber | 0.0291 | 0.0294 | 0.31 / 0.31 |

Stress is "misplaced" on only 0.95% of training words and 1.55% of
validation words. Predicting the training base rate for every word would give
a validation BCE of about 0.082, so the stress head has learned little beyond
the base rate, yet it is the largest single term in the loss.

Findings:

- The hypothesis in SS18.2 #3 is confirmed. Nearly half of the validation
  loss, and therefore of the early-stopping and LR-schedule signal, comes from
  a near-constant, almost unlearnable stress term. Sentence quality, the only
  level that meets its acceptance bar, contributes 8%.
- Word accuracy, the target behind the flagged gap, contributes 13%.

## 4. Adult vs child (SS18.2 #7)

| Validation Pearson | Adult, 42 / 1337 | Child, 42 / 1337 |
|---|---|---|
| Sentence accuracy | 0.843 / 0.857 | 0.314 / 0.463 |
| Sentence fluency | 0.855 / 0.865 | 0.456 / 0.524 |
| Word accuracy | 0.393 / 0.401 | 0.169 / 0.174 |
| Phone accuracy | 0.397 / 0.396 | 0.233 / 0.226 |

Findings:

- Adults, the primary promotion population (roadmap SS6, SS7.1), score far
  higher than children at every level on both seeds. The pooled numbers
  understate adult performance and hide a weak child population.
- Child sentence accuracy varies 0.15 between seeds, consistent with only a
  handful of child validation speakers.
- Future acceptance reports should state adult and child metrics separately,
  as SS7.1 already requires.

## 5. What this means for step 3

| Step 3 fix | Evidence from this report |
|---|---|
| 3.1 Validation-chosen threshold + threshold-free metrics | Strongly supported: the gap is mostly the fixed threshold (SS2). Report average precision alongside F1 from now on. |
| 3.2 Rebalance accuracy vs stress | Strongly supported: stress is ~48% of the selection signal (SS3). |
| 3.3 Normalize acoustic features | Not addressed here; sentence loss is already small. |
| 3.4 Canonical phone/word identity embeddings | Still the expected largest model gain; word/phone Pearson is the lowest level, especially for children. |
| 3.5 Multi-layer hidden states | Not addressed here. |

Masking (SS1) does not need a fix before step 3.
