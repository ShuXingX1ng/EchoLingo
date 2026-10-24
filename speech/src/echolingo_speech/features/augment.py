"""Light, length-preserving audio augmentation for the M3 A0-Aug candidate.

Roadmap SS6 allows light noise, volume, room response and codec effects, and
forbids anything that changes timing or pitch. Every effect here keeps the
waveform's exact length, so the clean MFA TextGrids, frame spans and labels
still apply to the augmented copy. Noise and room responses are synthetic
(coloured Gaussian noise, exponentially decaying impulse responses), so no
external corpus is downloaded.

Each copy is written as its own feature cache under
`features/variants/<name>-<k>/` (`features/cache.py::variant_feature_root`),
laid out like the clean cache, and its layers are extracted with the same
`extract_layer_features` the clean cache used. Every utterance's effects are
drawn from a generator seeded by (seed, copy, sample_id), so a copy is
reproducible regardless of record order.

CLI: `python -m echolingo_speech.features.augment --manifest ... --speech-config ...
  --partition train --profile train --copies 4 --seed 0 --name train-aug --layers 4,6,8,10,12`
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import torch
import torchaudio

from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.features.cache import (
    TARGET_SAMPLE_RATE,
    extract_layer_features,
    variant_feature_root,
)

TELEPHONE_SAMPLE_RATE = 8000
MU_LAW_CHANNELS = 256
PEAK_LIMIT = 0.99


@dataclass(frozen=True)
class AugmentationProfile:
    reverb_prob: float
    noise_prob: float
    codec_prob: float
    snr_db: tuple[float, float]
    gain_db: tuple[float, float] = (-6.0, 6.0)
    rt60_sec: tuple[float, float] = (0.15, 0.5)
    # Direct-to-reverberant energy ratio; higher is drier.
    drr_db: tuple[float, float] = (3.0, 12.0)
    # Noise spectrum ~ 1/f^alpha: 0 white, 1 pink, 2 brown.
    noise_alpha: tuple[float, float] = (0.0, 2.0)


PROFILES = {
    # Training copies: each effect only sometimes, mild noise.
    "train": AugmentationProfile(reverb_prob=0.3, noise_prob=0.5, codec_prob=0.2, snr_db=(15, 30)),
    # A noisy evaluation copy for robustness: noise on every utterance and at
    # lower SNRs than training ever sees.
    "robustness": AugmentationProfile(
        reverb_prob=0.5, noise_prob=1.0, codec_prob=0.2, snr_db=(10, 20)
    ),
}


def _uniform(generator: torch.Generator, bounds: tuple[float, float]) -> float:
    low, high = bounds
    return low + (high - low) * torch.rand((), generator=generator).item()


def _chance(generator: torch.Generator, prob: float) -> bool:
    return torch.rand((), generator=generator).item() < prob


def _rms(waveform: torch.Tensor) -> float:
    return waveform.pow(2).mean().sqrt().item()


def coloured_noise(num_samples: int, alpha: float, generator: torch.Generator) -> torch.Tensor:
    """Unit-power Gaussian noise with a 1/f^alpha power spectrum, `(1, N)`."""
    white = torch.randn(num_samples, generator=generator)
    spectrum = torch.fft.rfft(white)
    freqs = torch.arange(spectrum.shape[0], dtype=torch.float32)
    freqs[0] = 1.0
    noise = torch.fft.irfft(spectrum / freqs.pow(alpha / 2), n=num_samples)
    return (noise / noise.pow(2).mean().sqrt().clamp(min=1e-12)).unsqueeze(0)


def add_noise(
    waveform: torch.Tensor, snr_db: float, alpha: float, generator: torch.Generator
) -> torch.Tensor:
    signal_rms = _rms(waveform)
    if signal_rms == 0.0:
        return waveform
    noise = coloured_noise(waveform.shape[-1], alpha, generator)
    return waveform + noise * signal_rms / (10 ** (snr_db / 20))


def synthetic_room_response(
    rt60_sec: float, drr_db: float, generator: torch.Generator, sample_rate: int
) -> torch.Tensor:
    """A unit direct path at t=0 followed by exponentially decaying noise that
    falls 60 dB over `rt60_sec`, scaled to `drr_db` below the direct path."""
    length = max(2, int(rt60_sec * sample_rate))
    t = torch.arange(length, dtype=torch.float32) / sample_rate
    tail = torch.randn(length, generator=generator) * torch.exp(-math.log(1000.0) * t / rt60_sec)
    tail[0] = 0.0
    tail = tail * math.sqrt(10 ** (-drr_db / 10) / tail.pow(2).sum().clamp(min=1e-12).item())
    tail[0] = 1.0
    return tail


def add_reverb(
    waveform: torch.Tensor, rt60_sec: float, drr_db: float, generator: torch.Generator
) -> torch.Tensor:
    """Convolve with a synthetic room response, keep the first N samples (the
    direct path is at t=0, so nothing shifts) and restore the input level."""
    response = synthetic_room_response(rt60_sec, drr_db, generator, TARGET_SAMPLE_RATE)
    wet = torchaudio.functional.fftconvolve(waveform, response.unsqueeze(0))
    wet = wet[..., : waveform.shape[-1]]
    wet_rms = _rms(wet)
    return wet * (_rms(waveform) / wet_rms) if wet_rms > 0 else wet


def telephone_codec(waveform: torch.Tensor) -> torch.Tensor:
    """Narrowband telephone channel: 8 kHz band limit and 8-bit mu-law."""
    num_samples = waveform.shape[-1]
    narrow = torchaudio.functional.resample(waveform, TARGET_SAMPLE_RATE, TELEPHONE_SAMPLE_RATE)
    peak = narrow.abs().max().clamp(min=1e-12)
    encoded = torchaudio.functional.mu_law_encoding(narrow / peak, MU_LAW_CHANNELS)
    narrow = torchaudio.functional.mu_law_decoding(encoded, MU_LAW_CHANNELS) * peak
    wide = torchaudio.functional.resample(narrow, TELEPHONE_SAMPLE_RATE, TARGET_SAMPLE_RATE)
    if wide.shape[-1] >= num_samples:
        return wide[..., :num_samples]
    return torch.nn.functional.pad(wide, (0, num_samples - wide.shape[-1]))


def augment_waveform(
    waveform: torch.Tensor, profile: AugmentationProfile, generator: torch.Generator
) -> tuple[torch.Tensor, dict]:
    """One augmented copy of a `(1, N)` waveform, the same length, and the
    effects applied. Order: room, noise, channel, then gain."""
    applied: dict = {}
    out = waveform.float()
    if _chance(generator, profile.reverb_prob):
        rt60, drr = _uniform(generator, profile.rt60_sec), _uniform(generator, profile.drr_db)
        out = add_reverb(out, rt60, drr, generator)
        applied["reverb"] = {"rt60_sec": rt60, "drr_db": drr}
    if _chance(generator, profile.noise_prob):
        snr, alpha = _uniform(generator, profile.snr_db), _uniform(generator, profile.noise_alpha)
        out = add_noise(out, snr, alpha, generator)
        applied["noise"] = {"snr_db": snr, "alpha": alpha}
    if _chance(generator, profile.codec_prob):
        out = telephone_codec(out)
        applied["codec"] = "telephone"
    gain = _uniform(generator, profile.gain_db)
    out = out * 10 ** (gain / 20)
    applied["gain_db"] = gain
    peak = out.abs().max().item()
    if peak > PEAK_LIMIT:
        out = out * (PEAK_LIMIT / peak)
    assert out.shape == waveform.shape
    return out, applied


def utterance_generator(seed: int, copy: int, sample_id: str) -> torch.Generator:
    digest = hashlib.sha256(f"{seed}:{copy}:{sample_id}".encode()).hexdigest()
    return torch.Generator().manual_seed(int(digest[:15], 16))


def variant_name(name: str, copy: int) -> str:
    return f"{name}-{copy}"


def write_augmented_waveforms(
    records: list[ManifestRecord],
    *,
    feature_root: Path,
    variant: str,
    profile: AugmentationProfile,
    seed: int,
    copy: int,
) -> Path:
    """Augment each record's clean cached waveform into the variant's
    `waveform/` (same relative path as the clean cache) and return the
    variant root."""
    root = variant_feature_root(feature_root, variant)
    effects: dict[str, dict] = {}
    for record in records:
        assert record.features is not None, f"{record.sample_id} has no waveform cache yet"
        relative = record.features.waveform_cache_path
        clean = torch.from_numpy(np.load(feature_root / relative))
        augmented, applied = augment_waveform(
            clean, profile, utterance_generator(seed, copy, record.sample_id)
        )
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        np.save(target, augmented.numpy().astype(np.float32))
        effects[record.sample_id] = applied
    (root / "effects.json").write_text(json.dumps(effects) + "\n", encoding="utf-8")
    return root


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.features.augment")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--speech-config", type=Path, required=True)
    parser.add_argument("--partition", choices=("train", "validation", "test"), required=True)
    parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    parser.add_argument("--copies", type=int, default=1)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--name", required=True, help="variants are written as <name>-<k>")
    parser.add_argument("--layers", required=True, help="comma-separated, e.g. 4,6,8,10,12")
    default_device = "cuda" if torch.cuda.is_available() else "cpu"
    parser.add_argument("--device", type=str, default=default_device)
    parser.add_argument(
        "--normalize-input",
        action="store_true",
        help="cache the layers from normalized encoder input (a separate -norm cache)",
    )
    parser.add_argument(
        "--layers-only",
        action="store_true",
        help="reuse the copies' existing waveforms and only (re)extract their layers",
    )
    parser.add_argument(
        "--adapter-dir",
        type=Path,
        default=None,
        help="cache the layers of the encoder with this CTC LoRA adapter merged in "
        "(a separate -adapter-<name> cache)",
    )
    args = parser.parse_args(argv)

    config = load_config(args.speech_config)
    feature_root = config.data_root / "processed" / "speechocean762" / "features"
    records = [record for record in read_jsonl(args.manifest) if record.partition == args.partition]
    layers = tuple(int(value) for value in args.layers.split(","))
    profile = PROFILES[args.profile]
    for copy in range(1, args.copies + 1):
        variant = variant_name(args.name, copy)
        if args.layers_only:
            root = variant_feature_root(feature_root, variant)
            if not (root / "effects.json").is_file():
                raise FileNotFoundError(f"{root} has no augmented waveforms to reuse")
        else:
            root = write_augmented_waveforms(
                records,
                feature_root=feature_root,
                variant=variant,
                profile=profile,
                seed=args.seed,
                copy=copy,
            )
        extract_layer_features(
            records,
            cache_root=root,
            encoder_model_id=config.encoder.model_id,
            encoder_revision=config.encoder.revision,
            layers=layers,
            hf_cache_dir=config.artifact_root / "hf-cache",
            device=args.device,
            normalize_input=args.normalize_input,
            adapter_dir=args.adapter_dir,
        )
        if args.layers_only:
            print(f"OK: {variant}: layers re-extracted at {root}")
            continue
        metadata = {
            "partition": args.partition,
            "records": len(records),
            "profile": args.profile,
            "profile_settings": asdict(profile),
            "seed": args.seed,
            "copy": copy,
            "layers": list(layers),
            "encoder_revision": config.encoder.revision,
        }
        (root / "variant.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        print(f"OK: {variant}: {len(records)} {args.partition} records at {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
