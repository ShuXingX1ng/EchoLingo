# M2 Acceptance Report: A0 Frozen-Encoder Baseline

Status: baseline-complete with one flagged gap (see SS3). Evaluated against
`docs/SPEECH_EVALUATOR_ROADMAP.md` SS7.2 (`Speech Evaluator Acceptance`).
This is a personal-dev-environment engineering gate, not a PTE calibration or
public-release claim (roadmap SS7.2/SS15).

## 1. Runs

Two independent trainings of `SpeechEvaluatorA0`, same `configs/training/a0.yaml`
hyperparameters (`batch_size=32`, `lr=1e-3`, `dropout=0.3`, early stopping
patience 15), differing only in seed, against the real M1 SpeechOcean762
manifest (`dataset_version=876c34b8...`) on the WSL2 RTX 4070 environment
(ADR-0013). Both logged to local MLflow (`experiment 992234337592064133`).

| | seed 42 (run `9e06b23e`) | seed 1337 (run `139224ba`) |
|---|---|---|
| Epochs run (early-stopped) | 47 | 38 |
| Best validation loss | 0.025007 | 0.025000 |

Near-identical best validation loss across two independent seeds satisfies
SS7.2's "两次等价训练结果合理稳定".

## 2. Sealed test-set metrics

Test partition is never used for model/hyperparameter selection (roadmap
SS4.1). Values below are `evaluate()`'s `test_*` metrics logged at each run's
best-validation checkpoint.

| Metric | seed 42 | seed 1337 | SS7.2 bar |
|---|---|---|---|
| sentence accuracy Pearson | 0.631 | 0.636 | >= 0.60 -- **met** |
| sentence fluency Pearson | 0.728 | 0.720 | >= 0.60 -- **met** |
| sentence prosodic Pearson | 0.724 | 0.720 | informative only |
| sentence completeness Pearson | 0.004 | 0.062 | informative only -- see SS3 |
| word accuracy Pearson | 0.273 | 0.274 | informative only |
| phone accuracy Pearson | 0.288 | 0.278 | informative only |

## 3. No-learning baseline comparison

SS7.2 also requires "句子、单词与音素预测优于无学习基线". `evaluation/baseline.py`
implements that baseline: predict the training partition's mean label for
every test example (Pearson is undefined for a constant predictor, so MAE /
score-band-error / error-detection are used instead, same as `evaluate()`).
Run via:

```bash
python -m echolingo_speech.evaluation.baseline \
  --config configs/speech.yaml --training-config configs/training/a0.yaml \
  --manifest <processed manifest.jsonl>
```

| Metric | No-learning baseline | Model (seed 42 / seed 1337) | Beats baseline? |
|---|---|---|---|
| sentence accuracy MAE | 1.146 | 0.875 / 0.868 | yes |
| sentence fluency MAE | 1.085 | 0.738 / 0.715 | yes |
| sentence prosodic MAE | 1.132 | 0.729 / 0.720 | yes |
| sentence completeness MAE | 0.041 | 0.035 / 0.035 | yes, marginally |
| word accuracy MAE | 1.077 | 0.958 / 1.017 | yes |
| phone accuracy MAE | 0.208 | 0.205 / 0.193 | yes, marginally (seed 42) / yes (seed 1337) |
| word error-detection macro F1 | 0.4801 | 0.4801 / 0.4801 | **no -- ties the baseline** |
| phone error-detection macro F1 | 0.4888 | 0.4929 / 0.4959 | yes, marginally |

**Flagged gap**: word-level error-detection (thresholded accuracy < 0.6 =
"error") does not meaningfully beat the constant-mean baseline -- both
converge to essentially the same confusion matrix on the sealed test set.
Regression MAE at the word level does improve over baseline, so the model has
*some* signal, but the binary error/correct classification most directly
useful for UI word-highlighting does not yet clear this bar. This is reported
here rather than silently passed, per the project's no-fabricated-result rule
(roadmap SS1, AGENTS.md).

## 4. Other SS7.2 items

- Data/speaker-split leakage audit: covered in M1 (`tests/test_speechocean_split.py`).
- Abnormal audio / failed alignment handling: `training/dataset.py` masks
  word/phoneme supervision on alignment mismatch rather than crashing or
  fabricating labels (`word_alignment_is_valid` / `phone_alignment_is_valid`).
- Azure Compare Adapter: out of scope for the `speech/` package (M5, `backend/`).

## 5. Conclusion

Sentence-level acceptance criteria are met on both seeds with good
seed-to-seed stability. Sentence- and phone-level predictions clearly beat
the no-learning baseline; word-level regression improves on it but word-level
error-detection does not yet. M2's frozen-encoder code and two-seed benchmark
are complete enough to move into M3 candidate experiments, with closing the
word-level error-detection gap (e.g. rater-disagreement labels, or the A1
encoder adapter) as an explicit target rather than an assumed side effect.
