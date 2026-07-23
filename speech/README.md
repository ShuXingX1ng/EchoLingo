# EchoLingo Speech Evaluator (`speech/`)

M0 environment and package skeleton for the Read Aloud Speech Evaluator.
See `docs/SPEECH_EVALUATOR_ROADMAP.md` and ADR 0011-0013 for the full
plan; this package is scoped to M0 only (environment, skeleton, config
validation, smoke tests) — no dataset download, no training, no worker
HTTP service yet.

## Runtime environment

Training and inference run inside **WSL2 Ubuntu**, using the RTX 4070
through the Windows host NVIDIA driver (ADR-0013). Do not install a Linux
display driver inside WSL. The Windows-hosted FastAPI backend reaches the
worker over a configured localhost address; it never installs PyTorch,
CUDA, or MLflow itself.

| Component | Pinned to |
|---|---|
| Python | 3.11.x (`pyproject.toml` `requires-python`) |
| Package/env manager | [uv](https://docs.astral.sh/uv/) |
| PyTorch / torchaudio | latest 2.x cu121 wheel; exact version locked in `uv.lock` |
| Encoder checkpoint | `facebook/wav2vec2-base-960h` @ commit `22aad52d435eb6dbaf354bdad9b0da84ce7d6156` (`configs/model/wav2vec2-base-960h.yaml`) |

## Setup (inside WSL2 Ubuntu)

The repo lives on a Windows-mounted drive (`/mnt/e/...`, DrvFs), which
rejects some file operations `uv` performs for editable installs. The
virtualenv must live on the WSL-native filesystem instead — export
`UV_PROJECT_ENVIRONMENT` before running `uv`:

```bash
cd "/mnt/e/pycharm new/EchoLingo/speech"
cp configs/speech.example.yaml configs/speech.yaml   # edit paths if needed
export UV_PROJECT_ENVIRONMENT=/home/$USER/echolingo-speech/venv
uv sync
```

Add the `export` line to your shell profile (`~/.bashrc`) so every `uv run`
/ `uv sync` in this project picks it up automatically.

`configs/speech.yaml` is gitignored; it points at your local data/artifact
roots (default example: `~/echolingo-speech/{data,artifacts}`, created
during M0 with the subdirectories described in
`docs/SPEECH_EVALUATOR_ROADMAP.md` SS4.3/SS9.3).

## Verification commands

```bash
export HF_HOME=/home/$USER/echolingo-speech/artifacts/hf-cache   # keep model downloads off DrvFs
uv run python -m echolingo_speech.config validate --config configs/speech.yaml
uv run python -m echolingo_speech.env_check
uv run pytest tests/ -v          # gpu/network-marked tests skip cleanly if unavailable
uv run ruff check src/ tests/
```

MLflow >=3 disables its plain filesystem tracking backend by default; any
code (including tests) using the local `file://.../mlruns` store from
`docs/SPEECH_EVALUATOR_ROADMAP.md` SS9.4 must set `MLFLOW_ALLOW_FILE_STORE=true`
first — this is an explicit opt-in for the intentional local-file design,
not a workaround.

Note: the pinned-encoder network smoke test
(`test_pinned_encoder_forward_pass`) downloads ~360 MB from the Hugging
Face Hub on first run; over a slow WSL2 network path this can take several
minutes. It is marked `@pytest.mark.network` so it can be skipped with
`-m "not network"` when only a fast local check is needed.

## Boundaries

- No dataset is downloaded or committed by this package at M0.
- `backend/` (the public FastAPI service) does not depend on this package
  and must not gain PyTorch/CUDA/MLflow dependencies.
- Large weights, features, and MLflow run data live outside Git, under the
  configured `data_root` / `artifact_root`.
