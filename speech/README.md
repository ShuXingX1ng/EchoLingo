# EchoLingo Speech Evaluator (`speech/`)

Read Aloud Speech Evaluator package. See `docs/SPEECH_EVALUATOR_ROADMAP.md`
and ADR 0011-0013 for the full plan. Current status: M0 (environment
skeleton), M1 (SpeechOcean762 data pipeline), and M2 (A0 frozen-encoder
baseline -- see `docs/m2-acceptance-report.md`) are complete. No Bundle
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

Not yet executed on a rented instance (written 2026-10-11 from the CLI
definitions in this package); correct this section after the first real run.

```bash
# 1. Roots on the persistent data disk, not the system disk
export SPEECH_HOME=/path/to/data-disk/echolingo-speech
mkdir -p $SPEECH_HOME/data/{raw,processed,benchmarks,consented}
mkdir -p $SPEECH_HOME/artifacts/{hf-cache,mlruns,bundles}
export HF_HOME=$SPEECH_HOME/artifacts/hf-cache

# 2. Python environment
cd speech
cp configs/speech.example.yaml configs/speech.yaml   # set data_root, artifact_root, mlflow_tracking_uri
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

If Hugging Face is slow or unreachable from the instance, point `HF_ENDPOINT`
at a mirror before step 4; the encoder revision is pinned by commit, so a
mirror must serve that same commit.

## Rebuilding M1 data and the A0 baseline

```bash
RAW=$SPEECH_HOME/data/raw/speechocean762
PROC=$SPEECH_HOME/data/processed/speechocean762
MANIFEST=$PROC/manifest.jsonl

# Download + verify; prints the extracted corpus directory -> use it as CORPUS
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

# A0, two seeds, plus the no-learning baseline
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

To score a saved checkpoint without retraining (for example the sealed test
partition once a candidate is final):

```bash
uv run python -m echolingo_speech.training.loop evaluate --config configs/speech.yaml --training-config configs/training/a0.yaml --manifest $MANIFEST \
  --checkpoint $SPEECH_HOME/artifacts/checkpoints/a0-seed42/best.pt --partition test --out a0-seed42-test.json
```

Reproducibility checks before trusting the rebuild:

- the tarball SHA-256 equals `tarball_sha256` in `configs/datasets/speechocean762.yaml`;
- the validation speakers equal `validation_speaker_ids` in that file;
- the leakage audit prints `PASS`;
- sentence accuracy/fluency Pearson land close to `docs/m2-acceptance-report.md`.

Compare runs with `uv run mlflow ui --backend-store-uri <mlflow_tracking_uri>`
(forward the port over SSH to view it from another machine).

**Back up after every stage.** A rented instance can be released. Copy
`$MANIFEST`, `$SPEECH_HOME/artifacts/mlruns` (which holds each run's best
checkpoint), `$SPEECH_HOME/artifacts/checkpoints` (needed to resume), and any
reports off the instance. Raw audio, MFA output, and the feature
cache can be rebuilt with the commands above.

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
