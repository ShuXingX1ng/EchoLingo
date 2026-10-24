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
import json
import subprocess
from pathlib import Path

import numpy as np
import torch
import torchaudio

from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import FeatureInfo, ManifestRecord, read_jsonl, write_jsonl
from echolingo_speech.encoder.lora import adapter_sha256, apply_adapter

TARGET_SAMPLE_RATE = 16000
ADAPTER_PROVENANCE_NAME = "adapter.json"


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


def variant_feature_root(feature_root: Path, variant: str) -> Path:
    """Feature cache of one augmented copy of the audio (M3 A0-Aug,
    `features/augment.py`). It mirrors the clean cache's layout (`waveform/`
    and the layer directory), so a record's `waveform_cache_path` and
    `layer_cache_dir_name` resolve under it unchanged."""
    return feature_root / "variants" / variant


# Same epsilon as transformers' `Wav2Vec2FeatureExtractor.zero_mean_unit_var_norm`.
_NORMALIZE_EPSILON = 1e-7


def normalize_encoder_input(waveform: torch.Tensor) -> torch.Tensor:
    """Zero-mean, unit-variance per utterance: what the pinned encoder's
    feature extractor does when `do_normalize` is true (it is for
    `wav2vec2-base-960h`). Applied to the encoder input only; the cached
    waveform and the explicit acoustic features stay unnormalized."""
    centered = waveform - waveform.mean()
    return centered / torch.sqrt(centered.pow(2).mean() + _NORMALIZE_EPSILON)


def layer_cache_dir_name(
    encoder_revision: str,
    layers: tuple[int, ...] | list[int],
    normalized_input: bool = False,
    adapter: str | None = None,
) -> str:
    """Directory (under the feature cache root) holding the multi-layer cache
    for one encoder revision and layer selection, with a `-norm` suffix when
    the encoder saw normalized input and an `-adapter-<name>` suffix when it
    carried a trained adapter (M3 A1). `training/dataset.py` finds the files
    through this same function, so the manifest is unchanged."""
    name = f"wav2vec2-layers-{encoder_revision[:12]}-l{'-'.join(str(i) for i in layers)}"
    if normalized_input:
        name += "-norm"
    if adapter:
        name += f"-adapter-{adapter}"
    return name


def _claim_adapter_cache(layer_dir: Path, provenance: dict) -> None:
    """One trained adapter per cache directory: layers from two adapters that
    share a name are never mixed (a retrained adapter needs a new name)."""
    path = layer_dir / ADAPTER_PROVENANCE_NAME
    if path.is_file():
        existing = json.loads(path.read_text(encoding="utf-8"))
        if existing["sha256"] != provenance["sha256"]:
            raise ValueError(
                f"{layer_dir} holds layers of another adapter named {provenance['name']!r} "
                f"(sha256 {existing['sha256'][:12]}, now {provenance['sha256'][:12]}); "
                f"give the new adapter its own name"
            )
        return
    path.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")


def adapter_cache_sha256(layer_dir: Path) -> str:
    """SHA-256 of the adapter whose layers `layer_dir` holds."""
    path = layer_dir / ADAPTER_PROVENANCE_NAME
    if not path.is_file():
        raise FileNotFoundError(f"{path} is missing; extract these layers with --adapter-dir")
    return json.loads(path.read_text(encoding="utf-8"))["sha256"]


def check_adapter_caches(
    feature_root: Path,
    encoder_revision: str,
    layers: tuple[int, ...] | list[int],
    adapter: str,
    variants: list[str],
) -> str:
    """The clean adapter cache and each variant's must hold the layers of one
    trained adapter (the shared name alone does not guarantee it, e.g. when
    `best/` moved on between extractions); returns its SHA-256."""
    name = layer_cache_dir_name(encoder_revision, layers, adapter=adapter)
    expected = adapter_cache_sha256(feature_root / name)
    for variant in variants:
        actual = adapter_cache_sha256(variant_feature_root(feature_root, variant) / name)
        if actual != expected:
            raise ValueError(
                f"{variant}'s {adapter!r} layers come from adapter {actual[:12]}, the clean "
                f"ones from {expected[:12]}; extract both with the same --adapter-dir"
            )
    return expected


def extract_layer_features(
    records: list[ManifestRecord],
    *,
    cache_root: Path,
    encoder_model_id: str,
    encoder_revision: str,
    layers: tuple[int, ...],
    hf_cache_dir: Path | None = None,
    device: str = "cpu",
    normalize_input: bool = False,
    adapter_dir: Path | None = None,
) -> Path:
    """Cache several Wav2Vec2 layers per utterance as one `(L, T, 768)` fp16
    array (roadmap SS18.3 step 3.5). Index 0 is the CNN feature projection and
    index 12 the final layer (== `last_hidden_state`). Reads the waveforms
    `extract_features` already resampled, so it must run after it.
    `normalize_input` feeds the encoder `normalize_encoder_input(waveform)`
    and writes a separate `-norm` cache (M3 input normalization candidate).
    `adapter_dir` merges a trained CTC LoRA adapter (`encoder/ctc_adapter.py`,
    M3 A1) into the encoder and writes a separate `-adapter-<name>` cache,
    recording which adapter it holds in `adapter.json`.
    """
    from transformers import Wav2Vec2Model

    if adapter_dir is not None and normalize_input:
        raise ValueError("adapters are trained on the raw waveform; drop normalize_input")
    model = Wav2Vec2Model.from_pretrained(
        encoder_model_id, revision=encoder_revision, cache_dir=hf_cache_dir
    )
    adapter = None
    if adapter_dir is not None:
        metadata = apply_adapter(model, adapter_dir, encoder_model_id=encoder_model_id,
                                 encoder_revision=encoder_revision)
        if not metadata.get("name"):
            raise ValueError(f"{adapter_dir} has no adapter name in its config")
        adapter = {
            "name": metadata["name"],
            "sha256": adapter_sha256(adapter_dir),
            "source": str(adapter_dir),
            "step": metadata.get("step"),
            "dev_wer_subset": metadata.get("dev_wer_subset"),
        }
    model.to(device)
    model.eval()

    layer_dir = cache_root / layer_cache_dir_name(
        encoder_revision, layers, normalize_input, adapter["name"] if adapter else None
    )
    layer_dir.mkdir(parents=True, exist_ok=True)
    if adapter is not None:
        _claim_adapter_cache(layer_dir, adapter)
    for record in records:
        assert record.features is not None, f"{record.sample_id} has no waveform cache yet"
        waveform = torch.from_numpy(np.load(cache_root / record.features.waveform_cache_path))
        if normalize_input:
            waveform = normalize_encoder_input(waveform.float())
        with torch.no_grad():
            output = model(waveform.float().to(device), output_hidden_states=True)
        stacked = torch.stack([output.hidden_states[i].squeeze(0) for i in layers])
        np.save(layer_dir / f"{record.sample_id}.npy", stacked.cpu().numpy().astype(np.float16))
    return layer_dir


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


    layers_parser = subparsers.add_parser(
        "extract-layers", help="Cache several Wav2Vec2 layers (after `extract`)"
    )
    layers_parser.add_argument("--manifest", type=Path, required=True)
    layers_parser.add_argument("--speech-config", type=Path, required=True)
    layers_parser.add_argument("--layers", required=True, help="comma-separated, e.g. 4,6,8,10,12")
    layers_parser.add_argument("--device", type=str, default=default_device)
    layers_parser.add_argument(
        "--normalize-input",
        action="store_true",
        help="zero-mean/unit-variance encoder input (writes a separate -norm cache)",
    )
    layers_parser.add_argument(
        "--adapter-dir",
        type=Path,
        default=None,
        help="merge this trained CTC LoRA adapter (writes a separate -adapter-<name> cache)",
    )
    args = parser.parse_args(argv)

    if args.command == "extract-layers":
        config = load_config(args.speech_config)
        layers = tuple(int(value) for value in args.layers.split(","))
        layer_dir = extract_layer_features(
            read_jsonl(args.manifest),
            cache_root=config.data_root / "processed" / "speechocean762" / "features",
            encoder_model_id=config.encoder.model_id,
            encoder_revision=config.encoder.revision,
            layers=layers,
            hf_cache_dir=config.artifact_root / "hf-cache",
            device=args.device,
            normalize_input=args.normalize_input,
            adapter_dir=args.adapter_dir,
        )
        print(f"OK: cached layers {list(layers)} at {layer_dir}")
        return 0

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
