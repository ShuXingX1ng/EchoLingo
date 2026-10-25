# EchoLingo Speech Evaluator (`speech/`)

Read Aloud Speech Evaluator package. See `docs/SPEECH_EVALUATOR_ROADMAP.md`
and ADR 0011-0013 for the full plan. Current status: M0 (environment
skeleton), M1 (SpeechOcean762 data pipeline), and M2 (A0 frozen-encoder
baseline -- see `docs/m2-acceptance-report.md`) are complete, A0 was
reproduced on a rented GPU on 2026-10-23, and M2.5 baseline repair is
complete (`docs/m25-diagnostics-report.md`; the M2.5 candidate is
`configs/training/a0-rebalance-acnorm-phones-layers.yaml`). No Bundle
export, Worker, or FastAPI integration (M4/M5) yet.

## Runtime environment

Training runs on a **Linux GPU machine** (ADR-0014). The current target is a
rented cloud instance (Ubuntu, one 24 GB card). The original WSL2 Ubuntu +
RTX 4070 machine from M0-M2 is no longer available; see "WSL2 notes" below if
you ever return to that kind of setup. `backend/` never installs PyTorch,
CUDA, MFA, or MLflow.

| Component | Pinned to |
|---|---|
| Python | 3.11.x (`pyproject.toml` `requires-python`) |
| Package/env manager | [uv](https://docs.astral.sh/uv/) |
| PyTorch / torchaudio | 2.x cu121 wheel; exact version locked in `uv.lock` |
| Encoder checkpoint | `facebook/wav2vec2-base-960h` @ commit `22aad52d435eb6dbaf354bdad9b0da84ce7d6156` (`configs/model/wav2vec2-base-960h.yaml`) |
| Forced aligner | Montreal Forced Aligner in a separate conda env named `aligner`, `english_us_arpa` acoustic model + dictionary |

Nothing under `data_root` / `artifact_root` is in Git. A new machine starts
empty and must rebuild M1 and re-run A0 before any new experiment.

## Setup on a fresh Linux GPU instance

Executed end to end on 2026-10-23 on a Featurize RTX 3090 instance (see
"Featurize notes" below for that platform's specifics).

```bash
# 1. Roots on a fast local disk, not a network/sync mount
export SPEECH_HOME=/path/to/data-disk/echolingo-speech
mkdir -p $SPEECH_HOME/data/{raw,processed,benchmarks,consented}
mkdir -p $SPEECH_HOME/artifacts/{hf-cache,bundles,checkpoints} $SPEECH_HOME/mlruns
export HF_HOME=$SPEECH_HOME/artifacts/hf-cache
# Keep the venv and uv cache off a slow repo mount
export UV_PROJECT_ENVIRONMENT=$SPEECH_HOME/venv UV_CACHE_DIR=$SPEECH_HOME/uv-cache

# 2. Python environment
cd speech
cp configs/speech.example.yaml configs/speech.yaml   # set data_root, artifact_root, mlflow_tracking_uri
# mlflow_tracking_uri must NOT be under a directory named "artifacts": MLflow's
# file store rejects such runs ("Run ... not found" on the first start_run).
# Use file://$SPEECH_HOME/mlruns; `config validate` refuses the bad layout.
uv sync

# 3. MFA (conda env must be named `aligner`)
conda create -n aligner -c conda-forge montreal-forced-aligner
conda run -n aligner mfa model download acoustic english_us_arpa
conda run -n aligner mfa model download dictionary english_us_arpa
# The aligner env is found under $CONDA_EXE's root, ~/miniforge3, ~/miniconda3,
# or /opt/conda. If conda lives elsewhere, point at the binary directly:
# export ECHOLINGO_MFA_BIN=/path/to/envs/aligner/bin/mfa

# 4. Verify
uv run python -m echolingo_speech.config validate --config configs/speech.yaml
uv run python -m echolingo_speech.env_check
uv run pytest tests/ -v          # gpu/network-marked tests skip cleanly if unavailable
uv run ruff check src/ tests/
```

If Hugging Face is slow or unreachable from the instance (it returned HTTP 429
from Featurize), set `HF_ENDPOINT=https://hf-mirror.com` before step 4; the
encoder revision is pinned by commit, so a mirror must serve that same commit.

The RTX 5090 (Blackwell) is not supported by the locked torch 2.5.1+cu121
wheel; use an Ampere/Ada 24 GB card (3090, 4090, A5000). The host driver must
be >= 530. The image's own PyTorch is irrelevant: `uv sync` installs the
locked one into its own venv.

## Rebuilding M1 data and the A0 baseline

```bash
RAW=$SPEECH_HOME/data/raw/speechocean762
PROC=$SPEECH_HOME/data/processed/speechocean762
MANIFEST=$PROC/manifest.jsonl

# Download + verify; prints the extracted corpus directory -> use it as CORPUS.
# Mirrors are tried in order and the first (trmal) can be ~40 KB/s. A tarball
# already at $RAW/speechocean762.tar.gz is not re-downloaded, so fetching it
# from a fast mirror first is fine -- the SHA-256 is still checked:
#   curl -L -o $RAW/speechocean762.tar.gz https://openslr.elda.org/resources/101/speechocean762.tar.gz
uv run python -m echolingo_speech.data.speechocean download --raw-root $RAW
CORPUS=<directory printed above>

# Manifest, speaker-independent split, leakage audit
uv run python -m echolingo_speech.data.speechocean build-manifest --raw-root $RAW --out $MANIFEST

# MFA alignment. --output-dir must be a direct child of $PROC: the manifest
# stores TextGrid paths relative to its parent, and training resolves them
# against $PROC.
uv run python -m echolingo_speech.alignment.mfa prepare --manifest $MANIFEST --corpus-root $CORPUS --mfa-input-dir $PROC/mfa-input
uv run python -m echolingo_speech.alignment.mfa align --manifest $MANIFEST --mfa-input-dir $PROC/mfa-input --output-dir $PROC/mfa-output
uv run python -m echolingo_speech.alignment.mfa report --manifest $MANIFEST

# Frozen Wav2Vec2 feature cache (writes under $PROC/features)
uv run python -m echolingo_speech.features.cache extract --manifest $MANIFEST --corpus-root $CORPUS --speech-config configs/speech.yaml

# Five-layer fp16 cache for the M2.5 candidate config (~7 GB; reads the
# waveform cache above, leaves the manifest unchanged)
uv run python -m echolingo_speech.features.cache extract-layers --manifest $MANIFEST --speech-config configs/speech.yaml --layers 4,6,8,10,12

# A0, two seeds, plus the no-learning baseline. For the M2.5 candidate use
# --training-config configs/training/a0-rebalance-acnorm-phones-layers.yaml
# and drop --evaluate-test (the sealed test is scored once per final candidate).
uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/a0.yaml --manifest $MANIFEST --seed 42 --evaluate-test
uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/a0.yaml --manifest $MANIFEST --seed 1337 --evaluate-test
uv run python -m echolingo_speech.evaluation.baseline --config configs/speech.yaml --training-config configs/training/a0.yaml --manifest $MANIFEST
```

Each training run writes `last.pt` and `best.pt` to
`<artifact_root>/checkpoints/<run-name>/` after every epoch (run name defaults
to `a0-seed<seed>`; override with `--run-name`). If a run is interrupted,
repeat the same command with `--resume` to continue from `last.pt`. Starting
a run whose directory already holds a checkpoint without `--resume` is
refused rather than overwritten. Resuming is also refused when the seed, the
model configuration, or any training hyperparameter other than `max_epochs`
differs from what the run started with. A resumed run is logged as a new
MLflow run (its `resumed_from_epoch` param says where it picked up), so the
metric history of an interrupted run spans two MLflow runs.

M2.5 diagnostics (validation only; see `docs/m25-diagnostics-report.md`):

```bash
uv run python -m echolingo_speech.evaluation.diagnostics --config configs/speech.yaml --training-config configs/training/a0.yaml --manifest $MANIFEST \
  --checkpoint a0-seed42=$SPEECH_HOME/artifacts/checkpoints/a0-seed42/best.pt \
  --checkpoint a0-seed1337=$SPEECH_HOME/artifacts/checkpoints/a0-seed1337/best.pt \
  --partition validation --out-dir $SPEECH_HOME/reports/m25-diagnostics-validation
```

Training also chooses word/phone prediction thresholds on validation and saves
them as `prediction_thresholds.json` beside the checkpoints; `evaluate` uses
that file. For a checkpoint trained before this existed, pass
`--select-thresholds` (chooses on validation, writes the file).

To score a saved checkpoint without retraining (for example the sealed test
partition once a candidate is final):

```bash
uv run python -m echolingo_speech.training.loop evaluate --config configs/speech.yaml --training-config configs/training/a0.yaml --manifest $MANIFEST \
  --checkpoint $SPEECH_HOME/artifacts/checkpoints/a0-seed42/best.pt --partition test --out a0-seed42-test.json
```

M3 A0-Rater (validation only until a candidate is final). `build-manifest`
stores the five experts' raw scores from `scores-detail.json` under
`scores["raters"]`; a manifest built before that (for example a backup) gets
them with `attach-raters`, which rewrites it in place:

```bash
uv run python -m echolingo_speech.data.speechocean attach-raters --raw-root $RAW --manifest $MANIFEST

# Single-expert agreement: a human reference for the scorer's metrics
uv run python -m echolingo_speech.evaluation.rater_agreement --manifest $MANIFEST --partition validation --out rater-agreement-validation.json

# 3.1a expert-mean targets, then 3.1b spread heads, two seeds each
for seed in 42 1337; do
  uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/m3-rater-mean.yaml --manifest $MANIFEST --seed $seed --run-name a0rm-seed$seed
done
for seed in 42 1337; do
  uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/m3-rater-mean-spread.yaml --manifest $MANIFEST --seed $seed --run-name a0rms-seed$seed
done
```

M3 A0-Aug, both compared against 3.1a. 3.2a masks the cached hidden states
during training only and needs nothing new. 3.2b trains on augmented copies
of the training audio; `features.augment` writes each copy as its own
feature cache under `$PROC/features/variants/<name>-<k>/` (augmented
waveforms plus the five-layer cache, ~4 GB per training copy; needs the
clean waveform cache). Every effect keeps the waveform's length, so the
clean TextGrids and labels still apply and MFA is not rerun. A noisy
validation copy is scored separately for robustness; model selection and
thresholds stay on the clean validation partition.

```bash
# 3.2a feature masks
for seed in 42 1337; do
  uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/m3-aug-mask.yaml --manifest $MANIFEST --seed $seed --run-name a0am-seed$seed
done

# 3.2b augmented audio: four training copies, one noisy validation copy
uv run python -m echolingo_speech.features.augment --manifest $MANIFEST --speech-config configs/speech.yaml --partition train --profile train --copies 4 --seed 0 --name train-aug --layers 4,6,8,10,12
uv run python -m echolingo_speech.features.augment --manifest $MANIFEST --speech-config configs/speech.yaml --partition validation --profile robustness --copies 1 --seed 1 --name validation-noisy --layers 4,6,8,10,12
for seed in 42 1337; do
  uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/m3-aug-audio.yaml --manifest $MANIFEST --seed $seed --run-name a0aa-seed$seed
done

# 3.2c both together (same train-aug copies)
for seed in 42 1337; do
  uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/m3-aug-mask-audio.yaml --manifest $MANIFEST --seed $seed --run-name a0ama-seed$seed
done

# 3.2c both together (see below), then the adult target domain:
# 4.0 per-age metrics and a speaker-level paired bootstrap (validation has 7
# adult and 6 child speakers, so differences need an interval), and 4.2 a
# light adult-only fine-tune of each 3.2c seed. Age only selects data.
uv run python -m echolingo_speech.training.loop evaluate --config configs/speech.yaml --training-config configs/training/m3-aug-mask-audio.yaml --manifest $MANIFEST \
  --checkpoint $SPEECH_HOME/artifacts/checkpoints/a0ama-seed42/best.pt --partition validation --age-group adult --out a0ama-seed42-validation-adult.json
for seed in 42 1337; do
  uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/m3-adult-finetune.yaml --manifest $MANIFEST --seed $seed --run-name a0amaft-seed$seed \
    --init-checkpoint $SPEECH_HOME/artifacts/checkpoints/a0ama-seed$seed/best.pt
done
uv run python -m echolingo_speech.evaluation.paired_bootstrap --config configs/speech.yaml --training-config configs/training/m3-adult-finetune.yaml --manifest $MANIFEST \
  --reference a0ama-seed42=$SPEECH_HOME/artifacts/checkpoints/a0ama-seed42/best.pt \
  --candidate a0amaft-seed42=$SPEECH_HOME/artifacts/checkpoints/a0amaft-seed42/best.pt \
  --age-group adult --out bootstrap-adult-seed42.json

# Input normalization: the pinned encoder's feature extractor has
# do_normalize: true, the caches above were extracted from the raw waveform.
# Normalized-input layers go to separate "-norm" caches (augmented copies keep
# their waveforms, --layers-only); checkpoints record which cache they used.
uv run python -m echolingo_speech.features.cache extract-layers --manifest $MANIFEST --speech-config configs/speech.yaml --layers 4,6,8,10,12 --normalize-input
uv run python -m echolingo_speech.features.augment --manifest $MANIFEST --speech-config configs/speech.yaml --partition train --profile train --copies 4 --seed 0 --name train-aug --layers 4,6,8,10,12 --layers-only --normalize-input
uv run python -m echolingo_speech.features.augment --manifest $MANIFEST --speech-config configs/speech.yaml --partition validation --profile robustness --copies 1 --seed 1 --name validation-noisy --layers 4,6,8,10,12 --layers-only --normalize-input
for seed in 42 1337; do
  uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/m3-input-norm.yaml --manifest $MANIFEST --seed $seed --run-name a0aman-seed$seed
done

# Robustness: any checkpoint on the noisy validation copy (clean-validation thresholds)
uv run python -m echolingo_speech.training.loop evaluate --config configs/speech.yaml --training-config configs/training/m3-aug-audio.yaml --manifest $MANIFEST \
  --checkpoint $SPEECH_HOME/artifacts/checkpoints/a0aa-seed42/best.pt --partition validation --feature-variant validation-noisy-1 --out a0aa-seed42-validation-noisy.json
```

M3 A1 (validation only until a candidate is final). The A1-Encoder is a CTC
LoRA adapter on the pinned encoder (rank 16 on every layer's attention
`q_proj`/`v_proj`, everything else frozen), trained on Loquacious `small`
from the Hugging Face dataset `speechbrain/LoquaciousSet` (72 train parquet
shards, 22.9 GB; dev 6 shards, 1.7 GB; the test split is never downloaded).
Its transcripts only supervise recognition, never scoring. `encoder.loquacious`
decodes each shard once into 16 kHz int16 audio plus a JSONL index (~30 GB for
`small`, resumable per shard). `encoder.ctc_adapter train` computes CTC over
each utterance's own frames, keeps the adapter with the best greedy WER on a
fixed 1500-utterance dev subset, and continues from `last.pt` with `--resume`.
Layers extracted with the adapter merged into the encoder go to separate
`-adapter-<name>` caches whose `adapter.json` records the adapter's SHA-256.
Checkpoints record `encoder_adapter`, evaluation refuses the other cache, and
loading refuses clean and augmented caches from two different adapters. An
adapter name stands for one trained adapter, so retrain under a new name.

```bash
LQ=$SPEECH_HOME/data/raw/loquacious; LQP=$SPEECH_HOME/data/processed/loquacious
A=$SPEECH_HOME/artifacts/adapters/a1-loquacious-small
ADAPTER_CONFIG=configs/adapter/a1-loquacious-small.yaml
uv run python -c "from huggingface_hub import snapshot_download; snapshot_download('speechbrain/LoquaciousSet', repo_type='dataset', revision='0e84cdb9e4b826afaabca5d33ec9453b11aacef3', allow_patterns=['small/*.parquet', 'dev/*.parquet'], local_dir='$LQ')"
VOCAB=$(uv run python -c "from huggingface_hub import hf_hub_download; print(hf_hub_download('facebook/wav2vec2-base-960h', 'vocab.json', revision='22aad52d435eb6dbaf354bdad9b0da84ce7d6156', cache_dir='$SPEECH_HOME/artifacts/hf-cache'))")
for split in small dev; do
  uv run python -m echolingo_speech.encoder.loquacious --parquet-dir $LQ/$split --out-dir $LQP/$split --vocab $VOCAB --workers 6
done
uv run python -m echolingo_speech.encoder.ctc_adapter train --speech-config configs/speech.yaml --adapter-config $ADAPTER_CONFIG \
  --train-dir $LQP/small --dev-dir $LQP/dev --out-dir $A

# Greedy WER of the adapted encoder (drop --adapter-dir for the base one):
# full Loquacious dev, then SpeechOcean validation, clean and noisy
uv run python -m echolingo_speech.encoder.ctc_adapter wer --speech-config configs/speech.yaml --adapter-config $ADAPTER_CONFIG --data-dir $LQP/dev --adapter-dir $A/best
uv run python -m echolingo_speech.encoder.ctc_adapter speechocean-wer --speech-config configs/speech.yaml --adapter-config $ADAPTER_CONFIG --manifest $MANIFEST --adapter-dir $A/best
uv run python -m echolingo_speech.encoder.ctc_adapter speechocean-wer --speech-config configs/speech.yaml --adapter-config $ADAPTER_CONFIG --manifest $MANIFEST --adapter-dir $A/best --feature-variant validation-noisy-1

# A1-Scorer: 3.2c on the adapter's layers. Without --layers-only the train-aug
# copies are written again from the same seeds (same effects.json as 3.2c).
uv run python -m echolingo_speech.features.cache extract-layers --manifest $MANIFEST --speech-config configs/speech.yaml --layers 4,6,8,10,12 --adapter-dir $A/best
uv run python -m echolingo_speech.features.augment --manifest $MANIFEST --speech-config configs/speech.yaml --partition train --profile train --copies 4 --seed 0 --name train-aug --layers 4,6,8,10,12 --adapter-dir $A/best
uv run python -m echolingo_speech.features.augment --manifest $MANIFEST --speech-config configs/speech.yaml --partition validation --profile robustness --copies 1 --seed 1 --name validation-noisy --layers 4,6,8,10,12 --layers-only --adapter-dir $A/best
for seed in 42 1337; do
  uv run python -m echolingo_speech.training.loop train --config configs/speech.yaml --training-config configs/training/m3-a1-scorer.yaml --manifest $MANIFEST --seed $seed --run-name a1s-seed$seed
done
# Each checkpoint is scored on its own cache (3.2c raw, A1-Scorer adapted)
uv run python -m echolingo_speech.evaluation.paired_bootstrap --config configs/speech.yaml --training-config configs/training/m3-a1-scorer.yaml --manifest $MANIFEST \
  --reference a0ama-seed42=$SPEECH_HOME/artifacts/checkpoints/a0ama-seed42/best.pt \
  --candidate a1s-seed42=$SPEECH_HOME/artifacts/checkpoints/a1s-seed42/best.pt \
  --age-group adult --out bootstrap-a1-adult-seed42.json
```

Reproducibility checks before trusting the rebuild:

- the tarball SHA-256 equals `tarball_sha256` in `configs/datasets/speechocean762.yaml`;
- the validation speakers equal `validation_speaker_ids` in that file;
- the leakage audit prints `PASS`;
- sentence accuracy/fluency Pearson land close to `docs/m2-acceptance-report.md`.

Compare runs with `uv run mlflow ui --backend-store-uri <mlflow_tracking_uri>`
(forward the port over SSH to view it from another machine).

**Back up after every stage.** A rented instance can be released. Copy
`$MANIFEST`, `$SPEECH_HOME/mlruns` (which holds each run's best
checkpoint), `$SPEECH_HOME/artifacts/checkpoints` (needed to resume), and any
reports off the instance. Raw audio and the feature cache can be rebuilt
with the commands above. Also keep the MFA output (5000 TextGrids, ~2 MB as
a tarball) with the manifest it was aligned into:
`tar czf mfa-output.tar.gz -C $PROC mfa-output`. On a new instance, after
`download` and `uv sync`, restoring both skips the `aligner` env and
alignment (~20 min): copy that manifest to `$MANIFEST`, run
`tar xzf mfa-output.tar.gz -C $PROC`, then continue at the feature cache.
The whole A0 backup (manifest, both runs, checkpoints, logs) is under 60 MB.

Observed on the 2026-10-23 rebuild (RTX 3090, 6 vCPU): download ~1 min from
the elda mirror, MFA alignment of 5000 utterances ~5 min, feature
extraction ~2 min, each A0 seed ~10 min including dataset assembly, baseline
~2 min.

### Featurize notes

- Only `~/work` survives returning an instance (cloud-synced, quota-limited,
  slow I/O). Put the repo, an env file you `source`, and backups there; put
  `$SPEECH_HOME` (data, venv, caches) on the local disk, e.g.
  `/home/featurize/echolingo-speech`, and rebuild it on a new instance.
- sshd reads public keys from `~/work/.ssh/authorized_keys`, not
  `~/.ssh/authorized_keys`; a key placed there also persists across instances.
- The base image's Miniconda is found automatically for the `aligner` env.
- Instances may set `http_proxy`/`https_proxy` to an academic proxy. On
  2026-10-24 it dropped TLS to `pypi.org` and `files.pythonhosted.org`
  (`tls handshake eof`), and direct downloads from `files.pythonhosted.org`
  ran at ~50 KB/s. What worked: unset the proxy (pypi, the PyTorch index,
  hf-mirror and openslr are all reachable directly), point the locked wheel
  URLs at the Tsinghua mirror for the sync only (same `/packages/` paths; uv
  still checks every wheel against the hashes in `uv.lock`), then restore the
  lock and keep it frozen:

  ```bash
  unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
  export UV_FROZEN=1
  sed -i 's#https://files.pythonhosted.org/packages/#https://pypi.tuna.tsinghua.edu.cn/packages/#g' uv.lock
  uv sync; git checkout -- uv.lock
  ```

  The full sync then took under 30 s instead of over 40 min.
- Hugging Face downloads were faster through that proxy (~34 MB/s on
  2026-10-24), so keep it for those only, e.g. by saving `http_proxy` and
  `https_proxy` before unsetting them and passing them to the download.

## M4: Checkpoint Bundle and Speech Evaluation Worker

The Worker runs on the development Mac (Apple Silicon, CPU), not on the GPU
instance: training stays on Linux (ADR-0014), inference needs only the
exported bundle. `pyproject.toml` pins torch/torchaudio 2.5.1 on both
platforms (CUDA wheels on Linux, PyPI wheels elsewhere), so the Worker runs
the release the evaluator was trained with.

```bash
# Environment (Python 3.11 venv outside the repo) and the aligner env
export SPEECH_HOME=$HOME/echolingo-speech
UV_PROJECT_ENVIRONMENT=$SPEECH_HOME/venv uv sync --frozen --python 3.11
conda create -n aligner -c conda-forge montreal-forced-aligner
conda run -n aligner mfa model download acoustic english_us_arpa
conda run -n aligner mfa model download dictionary english_us_arpa

# Export one accepted run as an immutable bundle under <artifact_root>/bundles/
# (from the backed-up run: best.pt + prediction_thresholds.json, the MLflow
# run directory, the manifest, and the evaluate --out JSONs; `test` is required
# and must pass the SS7.2 sentence gate)
uv run python -m echolingo_speech.bundles.bundle export --config configs/speech.yaml \
  --checkpoint $B/checkpoints/a0ama-seed42/best.pt --training-config configs/training/m3-aug-mask-audio.yaml \
  --mlflow-run-dir $MLRUNS/<experiment>/<run_id> --manifest $MANIFEST \
  --benchmark validation=... --benchmark validation-noisy=... \
  --benchmark test=... --benchmark test-adult=... --benchmark test-child=... --version 0.1.0
uv run python -m echolingo_speech.bundles.bundle verify --bundle $SPEECH_HOME/artifacts/bundles/speech-evaluator-v0.1.0

# Serve the bundle named by worker_bundle_id in speech.yaml on worker_host:worker_port
uv run python -m echolingo_speech.worker.app serve --config configs/speech.yaml
curl -s localhost:8100/health
curl -s -F audio=@answer.wav -F reference_text="Born likes green." localhost:8100/v1/evaluate
```

A bundle is a directory whose `bundle.json` lists every other file with its
SHA-256. Export refuses to overwrite a bundle (a new model is a new version),
and loading refuses any bundle whose files differ from that list. The Worker
serves exactly the bundle named in `worker_bundle_id` (or `--bundle-id`); it
never looks for the newest one. Startup verifies the bundle, downloads the
pinned encoder revision into `<artifact_root>/hf-cache` on first use, and
runs every stage once, or exits.

`POST /v1/evaluate` takes a WAV or FLAC `audio` file (the frontend sends 16
kHz mono PCM) and `reference_text`. It returns scores on the bundle's label
scales (sentence and word 0-10, phone 0-2), the free ASR transcript, the
share of the reference the ASR heard, and an evidence status for each of
sentence, word and phoneme. These scores are not the 10-90 reference score;
that mapping is M5's. Each level degrades instead of being guessed:

- the alignment fails, or its word count differs from the reference: no
  words or phonemes, and the sentence scores are `degraded`;
- almost none of the reference was heard (a wrong passage, another
  language): the same, with reason `reference_not_read`;
- an out-of-dictionary word gets no score, and word/phoneme evidence is
  `partial`.

Refusals carry an error code: `invalid_audio`, `audio_too_short` (< 1 s),
`audio_too_long` (> 60 s), `audio_too_large`, `no_speech` (digital silence
or nothing recognized), `invalid_request`, `worker_busy`, `timeout` (25 s
request budget, 20 s for the aligner), `internal_error`. One evaluation runs
at a time. Each request's audio and transcript go to a temporary directory
that is always removed. Only the models MFA extracts stay in
`<artifact_root>/mfa-cache` between requests: re-extracting them took a
call from about 3 s to 7.5 s.

`evaluation.worker_parity` is the M4 acceptance check. It scores every
validation recording through the Worker's decoding and encoder twice: once
with training's corpus TextGrids and SpeechOcean phones, which should
reproduce the bundle's recorded validation metrics, and once along the full
request path.

```bash
uv run python -m echolingo_speech.evaluation.worker_parity --config configs/speech.yaml --manifest $MANIFEST \
  --corpus-root $CORPUS --textgrid-root $PROC/mfa-output --out $SPEECH_HOME/reports/m4/parity-validation.json
```

## Notes

MLflow >=3 disables its plain filesystem tracking backend by default; any
code (including tests) using the local `file://.../mlruns` store from
`docs/SPEECH_EVALUATOR_ROADMAP.md` SS9.4 must set `MLFLOW_ALLOW_FILE_STORE=true`
first — this is an explicit opt-in for the intentional local-file design,
not a workaround. `training/tracking.py` sets it itself.

The pinned-encoder network smoke test (`test_pinned_encoder_forward_pass`)
downloads ~360 MB from the Hugging Face Hub on first run. It is marked
`@pytest.mark.network` so it can be skipped with `-m "not network"`.

### WSL2 notes (historical)

On WSL2 with the repo on a Windows-mounted drive (`/mnt/<drive>/...`, DrvFs),
`uv` cannot create its virtualenv on that mount: export
`UV_PROJECT_ENVIRONMENT=/home/$USER/echolingo-speech/venv` before `uv sync`,
and keep `HF_HOME`, data, and caches on the WSL-native filesystem. Do not
install a Linux display driver inside WSL. `pyproject.toml` disables the
pytest cache provider for the same DrvFs reason; this is harmless on native
Linux.

## Boundaries

- No dataset, feature cache, checkpoint, or MLflow run is committed to Git.
- `backend/` (the public FastAPI service) does not depend on this package
  and must not gain PyTorch/CUDA/MLflow dependencies.
- Large weights, features, and MLflow run data live outside Git, under the
  configured `data_root` / `artifact_root`.
