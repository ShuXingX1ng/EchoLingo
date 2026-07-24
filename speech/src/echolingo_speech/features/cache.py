"""Reusable, cacheable feature extraction: resampled waveform cache plus a frozen
Wav2Vec2 hidden-state cache, keyed by (sample content hash, encoder revision, code
version) so M2 training can load precomputed representations instead of re-running
audio through the encoder every epoch.

Interpretable acoustic features (pauses, pitch, energy) are out of scope here —
roadmap SS5.2 assigns those to model construction (M2), not this M1 pipeline stage.

CLI: `python -m echolingo_speech.features.cache extract`
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import numpy as np
import torch
import torchaudio

from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import FeatureInfo, ManifestRecord, read_jsonl, write_jsonl

TARGET_SAMPLE_RATE = 16000


def _git_commit_sha(repo_root: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_root, capture_output=True, text=True, check=True
    )
    return result.stdout.strip()


def _load_waveform(path: Path) -> torch.Tensor:
    waveform, sample_rate = torchaudio.load(str(path))
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sample_rate != TARGET_SAMPLE_RATE:
        waveform = torchaudio.functional.resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
    return waveform


def extract_features(
    records: list[ManifestRecord],
    *,
    corpus_root: Path,
    cache_root: Path,
    encoder_model_id: str,
    encoder_revision: str,
    code_version: str,
    hf_cache_dir: Path | None = None,
    device: str = "cpu",
) -> list[ManifestRecord]:
    from transformers import Wav2Vec2Model

    model = Wav2Vec2Model.from_pretrained(
        encoder_model_id, revision=encoder_revision, cache_dir=hf_cache_dir
    )
    model.to(device)
    model.eval()

    waveform_dir = cache_root / "waveform"
    hidden_state_dir = cache_root / f"wav2vec2-hidden-states-{encoder_revision[:12]}"
    waveform_dir.mkdir(parents=True, exist_ok=True)
    hidden_state_dir.mkdir(parents=True, exist_ok=True)

    updated: list[ManifestRecord] = []
    for record in records:
        src_wav = corpus_root / record.audio.relative_path
        waveform = _load_waveform(src_wav)

        waveform_path = waveform_dir / f"{record.sample_id}.npy"
        np.save(waveform_path, waveform.numpy())

        hidden_state_path = hidden_state_dir / f"{record.sample_id}.npy"
        with torch.no_grad():
            output = model(waveform.to(device))
            hidden_states = output.last_hidden_state.squeeze(0).cpu().numpy()
        np.save(hidden_state_path, hidden_states)

        record.features = FeatureInfo(
            waveform_cache_path=str(waveform_path.relative_to(cache_root)),
            wav2vec2_hidden_state_path=str(hidden_state_path.relative_to(cache_root)),
            encoder_revision=encoder_revision,
            code_version=code_version,
        )
        updated.append(record)
    return updated


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.features.cache")
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract_parser = subparsers.add_parser(
        "extract", help="Cache waveform + Wav2Vec2 hidden states"
    )
    extract_parser.add_argument("--manifest", type=Path, required=True)
    extract_parser.add_argument("--corpus-root", type=Path, required=True)
    extract_parser.add_argument("--speech-config", type=Path, required=True)
    default_device = "cuda" if torch.cuda.is_available() else "cpu"
    extract_parser.add_argument("--device", type=str, default=default_device)

    args = parser.parse_args(argv)

    if args.command == "extract":
        config = load_config(args.speech_config)
        records = read_jsonl(args.manifest)
        repo_root = Path(__file__).resolve().parents[4]
        try:
            code_version = _git_commit_sha(repo_root)
        except Exception:  # noqa: BLE001 - reproducibility metadata, not fatal
            code_version = "unknown"

        updated = extract_features(
            records,
            corpus_root=args.corpus_root,
            cache_root=config.data_root / "processed" / "speechocean762" / "features",
            encoder_model_id=config.encoder.model_id,
            encoder_revision=config.encoder.revision,
            code_version=code_version,
            hf_cache_dir=config.artifact_root / "hf-cache",
            device=args.device,
        )
        write_jsonl(args.manifest, updated)
        print(f"OK: extracted features for {len(updated)} utterances on {args.device}")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(_cli())
