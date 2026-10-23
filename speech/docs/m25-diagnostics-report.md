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

## 6. Step 3.1 applied: validation-chosen thresholds + average precision

Measurement change only; the A0 checkpoints are unchanged. Labels still
count as errors below 0.6. Predictions are now split at a per-level cut that
maximizes macro F1 on validation (`select_prediction_threshold`), saved as
`prediction_thresholds.json` beside each checkpoint and used for any later
evaluation. Every report now also carries
`{word,phone}_error_detection_average_precision`.

| Validation | Seed 42 | Seed 1337 |
|---|---|---|
| Word cut / phone cut | 0.881 / 0.844 | 0.859 / 0.864 |
| Word macro F1 (precision / recall) | 0.632 (0.329 / 0.455) | 0.625 (0.343 / 0.366) |
| Phone macro F1 (precision / recall) | 0.626 (0.299 / 0.352) | 0.627 (0.281 / 0.413) |
| Word / phone average precision | 0.311 / 0.260 | 0.312 / 0.265 |

The macro F1 figures are chosen and measured on the same partition, so they
are optimistic. The honest number is the sealed test score of the final
candidate with its saved cut, measured once. For comparing M2.5 candidates,
use word and phone **average precision on validation**, which does not depend
on a cut; A0's reference is 0.311 / 0.312 (word) and 0.260 / 0.265 (phone).

Rerunning the diagnostics with the shared metric code reproduced SS2 exactly.

## 7. Step 3.2 applied: word loss rebalanced toward accuracy

`configs/training/a0-rebalance.yaml` = `a0.yaml` with the word loss weighted
0.9 accuracy Huber / 0.1 stress BCE instead of 0.5 / 0.5; one factor changed.
Runs `a0r-seed42` (47 epochs) and `a0r-seed1337` (40 epochs) at commit
`80020c4`. Validation only; test not scored.

| Validation (seed 42 / 1337) | A0 | A0-rebalance | Change |
|---|---|---|---|
| Word average precision | 0.311 / 0.312 | 0.328 / 0.330 | +0.017 / +0.018 |
| Phone average precision | 0.260 / 0.265 | 0.258 / 0.265 | -0.002 / 0.000 |
| Word accuracy Pearson | 0.344 / 0.347 | 0.363 / 0.363 | +0.019 / +0.016 |
| Phone accuracy Pearson | 0.364 / 0.359 | 0.361 / 0.366 | -0.003 / +0.007 |
| Sentence accuracy Pearson | 0.732 / 0.755 | 0.730 / 0.751 | -0.002 / -0.004 |
| Sentence fluency Pearson | 0.786 / 0.798 | 0.786 / 0.806 | 0.000 / +0.008 |
| Word stress BCE | 0.0758 / 0.0750 | 0.0745 / 0.0739 | unchanged |
| Stress share of validation loss | 0.48 / 0.47 | 0.13 / 0.13 | |
| Word macro F1, validation-chosen cut (optimistic) | 0.632 / 0.625 | 0.636 / 0.642 | |

Validation loss values are not comparable across the two configurations
(the weighting differs), so early stopping is compared by outcome, not loss.

Findings:

- The stress term no longer dominates model selection (share 0.48 -> 0.13),
  and the stress head is no worse; it was learning almost nothing either way.
- Word-level ranking improves on both seeds by a similar amount (AP +0.017,
  Pearson about +0.018). Phone and sentence metrics are unchanged within
  seed-to-seed spread. The gain is small, and both seeds share one 13-speaker
  validation set, so it is consistent in direction rather than established.
- No metric regressed beyond seed noise, so A0-rebalance replaces A0 as the
  reference for steps 3.3-3.5. The adult/child gap is unchanged.

## 8. Step 3.3 applied: standardized acoustic features

`configs/training/a0-rebalance-acnorm.yaml` = `a0-rebalance.yaml` with
`normalize_acoustic_features: true`: the 9 explicit acoustic features are
scaled with training-partition mean/std held in the model. One factor
changed. Runs `a0rn-seed42` (45 epochs) and `a0rn-seed1337` (41 epochs) at
commit `9c97e98`. Validation only; test not scored.

| Validation (seed 42 / 1337) | A0-rebalance | + acoustic norm | Change |
|---|---|---|---|
| Sentence accuracy Pearson | 0.730 / 0.751 | 0.760 / 0.760 | +0.030 / +0.009 |
| Sentence accuracy MAE (0-10) | 0.936 / 0.920 | 0.888 / 0.886 | -0.048 / -0.034 |
| Sentence fluency Pearson | 0.786 / 0.806 | 0.827 / 0.824 | +0.041 / +0.018 |
| Sentence fluency MAE (0-10) | 0.710 / 0.687 | 0.625 / 0.622 | -0.085 / -0.065 |
| Sentence prosodic Pearson | 0.771 / 0.791 | 0.809 / 0.805 | +0.038 / +0.014 |
| Word average precision | 0.328 / 0.330 | 0.332 / 0.337 | +0.004 / +0.007 |
| Phone average precision | 0.258 / 0.265 | 0.263 / 0.274 | +0.005 / +0.009 |
| Sentence Huber (validation) | 0.0041 / 0.0038 | 0.0034 / 0.0034 | |
| Adult sentence fluency Pearson | 0.853 / 0.872 | 0.886 / 0.885 | |
| Child sentence accuracy Pearson | 0.315 / 0.430 | 0.373 / 0.389 | |

Findings:

- Every sentence-level metric improves on both seeds, and the two seeds now
  agree closely (accuracy Pearson 0.760 / 0.760, previously 0.730 / 0.751),
  which is what better-conditioned inputs should do. This is larger than SS5
  anticipated: the sentence loss was already small, but the raw-scale
  features were still hurting the sentence trunk.
- Word and phone metrics are unchanged within seed spread, as expected: the
  acoustic features only feed the sentence heads.
- The adult/child gap remains; child sentence accuracy is still 0.37-0.39.
- A0-rebalance-acnorm replaces A0-rebalance as the reference for 3.4-3.5.

## 9. Step 3.4 applied: canonical phone identities

`configs/training/a0-rebalance-acnorm-phones.yaml` = the SS8 reference with
`use_canonical_phones: true`. Canonical phones map onto the 39 ARPAbet base
phones (stress digits stripped; id 0 for anything else). The phone head
receives the expected phone's embedding next to its pooled frames; the word
head receives the mean embedding of the word's canonical phones. A per-word
identity embedding (roadmap wording "单词身份嵌入") was deliberately not used:
2604 word types, and 750 of the 1869 test word types (40%) never occur in
train, so those embeddings would be untrained exactly where they are needed.
Runs `a0rnp-seed42` (36 epochs) and `a0rnp-seed1337` (49 epochs) at commit
`d46b5aa`. Validation only; test not scored.

| Validation (seed 42 / 1337) | SS8 reference | + canonical phones | Change |
|---|---|---|---|
| Word average precision | 0.332 / 0.337 | 0.375 / 0.441 | +0.043 / +0.104 |
| Phone average precision | 0.263 / 0.274 | 0.283 / 0.313 | +0.020 / +0.039 |
| Word accuracy Pearson | 0.361 / 0.366 | 0.399 / 0.445 | +0.038 / +0.079 |
| Phone accuracy Pearson | 0.367 / 0.375 | 0.396 / 0.421 | +0.029 / +0.046 |
| Word accuracy MAE (0-10) | 1.199 / 1.221 | 1.205 / 1.103 | +0.006 / -0.118 |
| Phone accuracy MAE (0-2) | 0.249 / 0.258 | 0.251 / 0.244 | +0.002 / -0.014 |
| Sentence accuracy Pearson | 0.760 / 0.760 | 0.767 / 0.757 | +0.007 / -0.003 |
| Sentence fluency Pearson | 0.827 / 0.824 | 0.828 / 0.820 | +0.001 / -0.004 |
| Word macro F1, validation-chosen cut (optimistic) | 0.635 / 0.640 | 0.658 / 0.691 | |
| Adult word accuracy Pearson | 0.412 / 0.416 | 0.455 / 0.495 | |
| Child word accuracy Pearson | 0.156 / 0.162 | 0.211 / 0.181 | |

Findings:

- SS18.2 #1 is confirmed: telling the heads what should have been said is
  the largest word/phone gain of M2.5 so far, on both seeds, for both adults
  and children. Sentence metrics are unchanged, as expected (the sentence
  heads never see phone identities).
- Seed-to-seed spread at word level grew (word AP 0.375 vs 0.441); both seeds
  still clearly beat the reference, but the size of the gain is uncertain.
- Error-class predictions still rarely cross 0.6 (0.2-0.5% of words), so the
  validation-chosen cut from step 3.1 remains necessary.
- A0-rebalance-acnorm-phones replaces the SS8 reference for step 3.5.

## 10. Step 3.5 applied: five encoder layers

`configs/training/a0-rebalance-acnorm-phones-layers.yaml` = the SS9 reference
reading Wav2Vec2 layers 4, 6, 8, 10 and 12 (fp16 cache from
`features.cache extract-layers`; layer 12 matches the original cache within
fp16 rounding, max difference 0.00098 on 50 sampled utterances), mixed by a
learned softmax weight per layer. Runs `a0rnpl-seed42` (36 epochs) and
`a0rnpl-seed1337` (35 epochs) at commit `a755d58`. Validation only.

| Validation (seed 42 / 1337) | SS9 reference | + five layers | Change |
|---|---|---|---|
| Sentence accuracy Pearson | 0.767 / 0.757 | 0.810 / 0.817 | +0.043 / +0.060 |
| Sentence accuracy MAE (0-10) | 0.869 / 0.881 | 0.798 / 0.789 | -0.071 / -0.092 |
| Sentence fluency Pearson | 0.828 / 0.820 | 0.860 / 0.862 | +0.032 / +0.042 |
| Sentence fluency MAE (0-10) | 0.638 / 0.627 | 0.571 / 0.570 | -0.067 / -0.057 |
| Sentence prosodic Pearson | 0.809 / 0.799 | 0.846 / 0.854 | +0.037 / +0.055 |
| Word average precision | 0.375 / 0.441 | 0.443 / 0.462 | +0.068 / +0.021 |
| Phone average precision | 0.283 / 0.313 | 0.331 / 0.333 | +0.048 / +0.020 |
| Word accuracy Pearson | 0.399 / 0.445 | 0.458 / 0.463 | +0.059 / +0.018 |
| Phone accuracy Pearson | 0.396 / 0.421 | 0.444 / 0.447 | +0.048 / +0.026 |
| Word / phone accuracy MAE | 1.205 / 1.103, 0.251 / 0.244 | 1.130 / 1.075, 0.228 / 0.230 | lower |
| Adult sentence fluency Pearson | 0.881 / 0.881 | 0.908 / 0.904 | |
| Child word accuracy Pearson | 0.211 / 0.181 | 0.257 / 0.260 | |

Learned layer weights (softmax, layers 4/6/8/10/12): seed 42
0.247/0.211/0.241/0.153/0.148, seed 1337 0.244/0.210/0.239/0.156/0.152. Both
seeds put the least weight on the final layer and the most on layers 4 and 8.

Findings:

- SS18.2 #4 is confirmed: middle layers carry pronunciation information the
  CTC-specialised final layer has lost, and the model learns that the same
  way on both seeds. Every metric at every level improves on both seeds, and
  the seeds now agree closely at word level (AP 0.443 / 0.462).
- The train/validation loss gap widens (train 0.006, validation 0.017-0.019
  near the end), so the larger input is closer to overfitting; early
  stopping handled it here.
- A0-rebalance-acnorm-phones-layers is the M2.5 candidate.

## 11. M2.5 summary (validation, seed 42 / 1337)

| | A0 | M2.5 candidate |
|---|---|---|
| Sentence accuracy Pearson | 0.732 / 0.755 | 0.810 / 0.817 |
| Sentence fluency Pearson | 0.786 / 0.798 | 0.860 / 0.862 |
| Word average precision (chance 0.134) | 0.311 / 0.312 | 0.443 / 0.462 |
| Phone average precision (chance 0.087) | 0.260 / 0.265 | 0.331 / 0.333 |
| Word accuracy Pearson | 0.344 / 0.347 | 0.458 / 0.463 |
| Phone accuracy Pearson | 0.364 / 0.359 | 0.444 / 0.447 |
| Word macro F1 (A0: fixed 0.6; candidate: validation-chosen cut, optimistic) | 0.464 / 0.464 | 0.700 / 0.701 |

All of this is validation evidence; every change was selected on it. The
SS18.3 completion check (word error-detection macro F1 above the no-learning
baseline on both seeds, sentence accuracy/fluency not below A0) is to be
confirmed by one sealed-test evaluation of this candidate with its saved
thresholds.

## 12. Sealed test: one evaluation of the M2.5 candidate (2026-10-23)

Evaluated once, after the candidate was fixed, with the prediction
thresholds saved from validation (word 0.872 / 0.910, phone 0.779 / 0.812);
nothing was re-selected on test. A0 numbers are the reproduction in
`m2-acceptance-report.md` SS6; the no-learning baseline is unchanged from
SS2 there (a constant predictor scores at most these macro F1 values at any
cut).

| Sealed test (seed 42 / 1337) | No-learning baseline | A0 | M2.5 candidate |
|---|---|---|---|
| Sentence accuracy Pearson | - | 0.626 / 0.644 | 0.712 / 0.705 |
| Sentence accuracy MAE (0-10) | 1.146 | 0.889 / 0.863 | 0.811 / 0.787 |
| Sentence fluency Pearson | - | 0.722 / 0.725 | 0.788 / 0.789 |
| Sentence prosodic Pearson | - | 0.718 / 0.725 | 0.783 / 0.784 |
| Word accuracy Pearson | - | 0.287 / 0.284 | 0.397 / 0.399 |
| Phone accuracy Pearson | - | 0.291 / 0.286 | 0.369 / 0.372 |
| Word accuracy MAE (0-10) | 1.078 | 0.981 / 1.028 | 0.912 / 0.840 |
| Word error-detection macro F1 | 0.4801 | 0.4801 / 0.4801 | **0.638 / 0.628** |
| Word error precision / recall | 0 / 0 | 0 / 0 | 0.262 / 0.628, 0.248 / 0.674 |
| Phone error-detection macro F1 | 0.4889 | 0.4943 / 0.4908 | 0.621 / 0.621 |
| Word / phone average precision | 0.076 / 0.045 (error rate) | not recorded | 0.321 / 0.201, 0.320 / 0.206 |

**SS18.3 completion check: met.** Word error-detection macro F1 beats the
no-learning baseline on both seeds (0.638 / 0.628 vs 0.4801), and sentence
accuracy and fluency Pearson are above A0 on both seeds (+0.06 to +0.09).

Caveats:

- Test scores are well below validation (sentence accuracy 0.81 -> 0.71,
  word AP 0.45 -> 0.32). Validation has 13 speakers and every M2.5 change
  was selected on it, so validation numbers were optimistic; test also has a
  lower error rate (7.6% of words vs 13.4%). Test is the number to quote.
- The "error" class is still found with low precision (about 1 in 4 flagged
  words is a real error) at the chosen cut; the cut favours recall.
- Adult and child test metrics were not broken out in this one evaluation.
- Test is now spent for M2.5: no further M2.5 change may be chosen on it.
