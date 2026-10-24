"""Train and check the A1 CTC LoRA adapter (roadmap SS6 A1-Encoder).

The pinned `wav2vec2-base-960h` is already a character CTC model with the
same alphabet as Loquacious, so the adapter trains under its own CTC head:
everything is frozen except LoRA on the transformer's attention projections
(`encoder/lora.py`). The encoder sees the raw 16 kHz waveform, as everywhere
else in this pipeline (no `do_normalize`, see the M3 input normalization
result), so the adapted layers stay drop-in for `features/cache.py`.

- `train`: CTC on prepared Loquacious train (`encoder/loquacious.py`), greedy
  dev WER every `eval_every_steps`, best adapter kept by dev WER, resumable.
- `wer`: greedy WER of the base or adapted encoder on prepared Loquacious data.
- `speechocean-wer`: the same on SpeechOcean read-aloud partitions against
  `text_reference`, clean or on an augmented copy (`--feature-variant`). Only a
  robustness signal: a mispronounced word is *meant* to look wrong to a scorer.

CLI: `python -m echolingo_speech.encoder.ctc_adapter train --speech-config ...
  --adapter-config configs/adapter/a1-loquacious-small.yaml --train-dir ...
  --dev-dir ... --out-dir $SPEECH_HOME/artifacts/adapters/<name>`
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import time
from pathlib import Path

import numpy as np
import torch
import yaml
from pydantic import BaseModel, field_validator
from torch.utils.data import DataLoader

from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import read_jsonl
from echolingo_speech.encoder.loquacious import (
    SAMPLE_RATE,
    CharVocab,
    DurationBatchSampler,
    LoquaciousDataset,
    Utterance,
    collate_ctc,
    read_index,
)
from echolingo_speech.encoder.lora import (
    LoRAConfig,
    apply_adapter,
    inject_lora,
    load_lora_state,
    lora_parameters,
    lora_state_dict,
    save_adapter,
)
from echolingo_speech.evaluation.metrics import word_error_rate
from echolingo_speech.features.cache import variant_feature_root

LAST_STATE_NAME = "last.pt"
BEST_DIR_NAME = "best"
_ADAPTER_NAME = re.compile(r"[a-z0-9][a-z0-9-]*")


class AdapterConfig(BaseModel):
    # Names the adapter's layer caches (`features.cache extract-layers
    # --adapter-dir`) and the scorer's `encoder_adapter`: one name per trained
    # adapter, so a retrained adapter needs a new name.
    name: str
    seed: int = 0
    lora_rank: int = 16
    lora_alpha: float = 32.0
    lora_dropout: float = 0.05
    lora_target_modules: list[str] = ["q_proj", "v_proj"]
    learning_rate: float = 5e-4
    weight_decay: float = 0.0
    warmup_steps: int = 500
    epochs: int = 2
    max_batch_seconds: float = 200.0
    grad_clip: float = 1.0
    eval_every_steps: int = 1000
    # Dev WER during training on a fixed subset; the full dev set with `wer`.
    dev_eval_utterances: int = 1500
    eval_batch_seconds: float = 300.0
    num_workers: int = 4
    bf16: bool = True

    @field_validator("name")
    @classmethod
    def _directory_safe(cls, value: str) -> str:
        if not _ADAPTER_NAME.fullmatch(value):
            raise ValueError(f"adapter name {value!r} must be lower-case letters, digits and '-'")
        return value

    def lora(self) -> LoRAConfig:
        return LoRAConfig(
            rank=self.lora_rank,
            alpha=self.lora_alpha,
            dropout=self.lora_dropout,
            target_modules=tuple(self.lora_target_modules),
        )


def load_adapter_config(path: Path) -> AdapterConfig:
    return AdapterConfig(**yaml.safe_load(path.read_text()))


def encoder_vocab(speech_config) -> CharVocab:
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(
        speech_config.encoder.model_id,
        "vocab.json",
        revision=speech_config.encoder.revision,
        cache_dir=speech_config.artifact_root / "hf-cache",
    )
    return CharVocab.from_file(Path(path))


def freeze_ctc_model(model):
    """Freeze every weight. `freeze_feature_encoder` also stops the CNN from
    marking its input as requiring grad in train mode, which would keep the
    CNN's (large, raw-audio-rate) activations for a backward pass that only
    the LoRA layers above it need."""
    for parameter in model.parameters():
        parameter.requires_grad = False
    model.freeze_feature_encoder()
    return model


def load_ctc_model(speech_config, device: str):
    from transformers import Wav2Vec2ForCTC

    model = Wav2Vec2ForCTC.from_pretrained(
        speech_config.encoder.model_id,
        revision=speech_config.encoder.revision,
        cache_dir=speech_config.artifact_root / "hf-cache",
    )
    return freeze_ctc_model(model).to(device)


def _check_vocab(model, vocab: CharVocab) -> None:
    if model.config.vocab_size != len(vocab.token_to_id):
        raise ValueError(f"vocab.json has {len(vocab.token_to_id)} tokens, "
                         f"the CTC head {model.config.vocab_size}")
    if model.config.pad_token_id != vocab.blank_id:
        raise ValueError(f"CTC blank is {model.config.pad_token_id}, vocab.json's "
                         f"<pad> is {vocab.blank_id}")


def _autocast(device: str, bf16: bool):
    return torch.autocast(device_type=torch.device(device).type, dtype=torch.bfloat16,
                          enabled=bf16)


def output_frames(model, lengths: torch.Tensor) -> torch.Tensor:
    """Encoder frames for waveforms of `lengths` samples."""
    return model._get_feat_extract_output_lengths(lengths).long()


def ctc_frames_needed(labels: list[int]) -> int:
    """CTC emits one frame per label plus a blank between repeated labels."""
    return len(labels) + sum(a == b for a, b in zip(labels, labels[1:]))


def feasible_utterances(
    utterances: list[Utterance], vocab: CharVocab, model
) -> tuple[list[Utterance], int]:
    """Drop utterances whose transcript needs more CTC frames than the
    encoder produces for their audio (infinite CTC loss); returns the kept
    ones and how many were dropped."""
    if not utterances:
        return [], 0
    frames = output_frames(model, torch.tensor([u.length for u in utterances])).tolist()
    kept = [
        utterance
        for utterance, count in zip(utterances, frames)
        if ctc_frames_needed(vocab.encode(utterance.text)) <= count
    ]
    return kept, len(utterances) - len(kept)


def ctc_loss(
    logits: torch.Tensor, frames: torch.Tensor, labels: torch.Tensor, blank_id: int
) -> torch.Tensor:
    """CTC over each utterance's own frames, each loss divided by its label
    count and averaged over the batch (torch's "mean"). `Wav2Vec2ForCTC`'s
    built-in loss would count the zero padding as input, since this encoder
    takes no attention mask."""
    log_probs = torch.log_softmax(logits.float(), dim=-1).transpose(0, 1)
    mask = labels >= 0
    with torch.backends.cudnn.flags(enabled=False):
        return torch.nn.functional.ctc_loss(
            log_probs, labels.masked_select(mask), frames, mask.sum(-1),
            blank=blank_id, reduction="mean",
        )


@torch.no_grad()
def greedy_transcribe(
    model, vocab: CharVocab, batches, device: str, bf16: bool
) -> tuple[list[str], list[str]]:
    """(references, hypotheses) over batches from `collate_ctc`."""
    model.eval()
    references, hypotheses = [], []
    for batch in batches:
        with _autocast(device, bf16):
            logits = model(batch["input_values"].to(device)).logits
        frames = output_frames(model, batch["lengths"]).tolist()
        ids = logits.argmax(dim=-1).cpu()
        for i, count in enumerate(frames):
            hypotheses.append(vocab.decode_greedy(ids[i, :count].tolist()))
        references.extend(batch["texts"])
    return references, hypotheses


def _loader(dataset: LoquaciousDataset, seconds: float, *, shuffle: bool, seed: int,
            workers: int) -> tuple[DataLoader, DurationBatchSampler]:
    sampler = DurationBatchSampler(
        [u.length for u in dataset.utterances], seconds, shuffle=shuffle, seed=seed
    )
    loader = DataLoader(
        dataset, batch_sampler=sampler, collate_fn=collate_ctc, num_workers=workers,
        persistent_workers=workers > 0,
    )
    return loader, sampler


def _dev_subset(utterances, count: int, seed: int):
    if count <= 0 or count >= len(utterances):
        return utterances
    rng = random.Random(seed)
    return sorted(rng.sample(utterances, count), key=lambda u: (u.shard, u.offset))


def _lr_lambda(warmup: int, total: int):
    def factor(step: int) -> float:
        if step < warmup:
            return (step + 1) / warmup
        return max(0.0, (total - step) / max(1, total - warmup))

    return factor


def train_adapter(
    speech_config,
    config: AdapterConfig,
    train_dir: Path,
    dev_dir: Path,
    out_dir: Path,
    *,
    device: str = "cuda",
    resume: bool = False,
    max_steps: int | None = None,
) -> dict:
    torch.manual_seed(config.seed)
    random.seed(config.seed)
    np.random.seed(config.seed)
    vocab = encoder_vocab(speech_config)
    model = load_ctc_model(speech_config, device)
    _check_vocab(model, vocab)
    lora = config.lora()
    wrapped = inject_lora(model.wav2vec2, lora)
    parameters = lora_parameters(model.wav2vec2)
    trainable = sum(p.numel() for p in parameters)

    train_utterances, infeasible = feasible_utterances(read_index(train_dir), vocab, model)
    train_set = LoquaciousDataset(train_dir, vocab, train_utterances)
    dev_set = LoquaciousDataset(dev_dir, vocab, _dev_subset(read_index(dev_dir),
                                                            config.dev_eval_utterances,
                                                            config.seed))
    train_loader, train_sampler = _loader(
        train_set, config.max_batch_seconds, shuffle=True, seed=config.seed,
        workers=config.num_workers,
    )
    dev_loader, _ = _loader(dev_set, config.eval_batch_seconds, shuffle=False, seed=0,
                            workers=config.num_workers)
    # Batch counts differ slightly between epochs (the buckets are reshuffled),
    # so the schedule is fixed in steps: `epochs` times the first epoch's.
    steps_per_epoch = len(train_sampler)
    total_steps = steps_per_epoch * config.epochs
    if max_steps is not None:
        total_steps = min(total_steps, max_steps)

    optimizer = torch.optim.AdamW(parameters, lr=config.learning_rate,
                                  weight_decay=config.weight_decay)
    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimizer, _lr_lambda(config.warmup_steps, total_steps)
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    last_path = out_dir / LAST_STATE_NAME
    state = {"step": 0, "epoch": 0, "epoch_step": 0, "best_wer": math.inf, "history": [],
             "total_steps": total_steps, "infeasible_train_utterances": infeasible}
    if last_path.exists():
        if not resume:
            raise FileExistsError(f"{last_path} exists; pass --resume or another --out-dir")
        saved = torch.load(last_path, map_location=device, weights_only=False)
        if saved["state"]["total_steps"] != total_steps:
            raise ValueError(f"{last_path} was scheduled for {saved['state']['total_steps']} "
                             f"steps, this run for {total_steps}")
        load_lora_state(model.wav2vec2, saved["lora"])
        optimizer.load_state_dict(saved["optimizer"])
        scheduler.load_state_dict(saved["scheduler"])
        state = saved["state"]

    metadata = {
        "name": config.name,
        "encoder_model_id": speech_config.encoder.model_id,
        "encoder_revision": speech_config.encoder.revision,
        "train_dir": str(train_dir),
        "train_utterances": len(train_set),
        "infeasible_train_utterances": infeasible,
        "train_hours": sum(u.seconds for u in train_set.utterances) / 3600,
        "adapter_config": config.model_dump(),
        "wrapped_modules": len(wrapped),
        "trainable_parameters": trainable,
        "encoder_input": "raw 16 kHz waveform, no do_normalize",
    }

    def evaluate_dev() -> float:
        refs, hyps = greedy_transcribe(model, vocab, dev_loader, device, config.bf16)
        return word_error_rate(refs, hyps)

    def checkpoint() -> None:
        torch.save(
            {"lora": lora_state_dict(model.wav2vec2), "optimizer": optimizer.state_dict(),
             "scheduler": scheduler.state_dict(), "state": state},
            out_dir / (LAST_STATE_NAME + ".tmp"),
        )
        (out_dir / (LAST_STATE_NAME + ".tmp")).replace(last_path)
        (out_dir / "history.json").write_text(json.dumps(state["history"], indent=2) + "\n")

    if "base_dev_wer" not in state:
        base_wer = evaluate_dev()
        state["history"].append({"step": 0, "dev_wer": base_wer})
        state["base_dev_wer"] = base_wer
        print(f"step 0 dev_wer={base_wer:.4f} (base encoder) trainable={trainable} "
              f"train={len(train_set)} infeasible={infeasible} total_steps={total_steps}",
              flush=True)

    started = time.time()
    audio_seconds = 0.0
    while state["step"] < total_steps:
        train_sampler.set_epoch(state["epoch"], skip_batches=state["epoch_step"])
        # Train mode keeps the base model's own regularization from its CTC
        # fine-tuning (dropout, LayerDrop 0.1, SpecAugment time masks); only the
        # LoRA updates learn under it.
        model.train()
        for batch in train_loader:
            with _autocast(device, config.bf16):
                logits = model(batch["input_values"].to(device)).logits
            loss = ctc_loss(logits, output_frames(model, batch["lengths"]),
                            batch["labels"].to(device), vocab.blank_id)
            if not torch.isfinite(loss):
                raise FloatingPointError(f"non-finite CTC loss at step {state['step']}")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(parameters, config.grad_clip)
            optimizer.step()
            scheduler.step()
            state["step"] += 1
            state["epoch_step"] += 1
            audio_seconds += batch["lengths"].sum().item() / SAMPLE_RATE
            if state["step"] % 100 == 0:
                elapsed = time.time() - started
                memory = (f" max_mem_gb={torch.cuda.max_memory_allocated() / 2**30:.1f}"
                          if torch.device(device).type == "cuda" else "")
                print(f"step {state['step']}/{total_steps} epoch {state['epoch']} "
                      f"loss={loss.item():.4f} lr={scheduler.get_last_lr()[0]:.2e} "
                      f"audio_x_realtime={audio_seconds / max(elapsed, 1e-6):.0f}{memory}",
                      flush=True)
            if state["step"] % config.eval_every_steps == 0 or state["step"] == total_steps:
                wer = evaluate_dev()
                state["history"].append({"step": state["step"], "dev_wer": wer,
                                         "loss": loss.item()})
                print(f"step {state['step']} dev_wer={wer:.4f}", flush=True)
                if wer < state["best_wer"]:
                    state["best_wer"] = wer
                    save_adapter(model.wav2vec2, lora, out_dir / BEST_DIR_NAME,
                                 {**metadata, "step": state["step"], "dev_wer_subset": wer,
                                  "base_dev_wer_subset": state["base_dev_wer"]})
                checkpoint()
                model.train()
            if state["step"] >= total_steps:
                break
        else:
            state["epoch"] += 1
            state["epoch_step"] = 0
            checkpoint()
    return state


def _wer_on(model, vocab, dataset, config: AdapterConfig, device: str) -> float:
    loader, _ = _loader(dataset, config.eval_batch_seconds, shuffle=False, seed=0,
                        workers=config.num_workers)
    return word_error_rate(*greedy_transcribe(model, vocab, loader, device, config.bf16))


def _model_for(speech_config, adapter_dir: Path | None, device: str):
    model = load_ctc_model(speech_config, device)
    if adapter_dir is not None:
        apply_adapter(model.wav2vec2, adapter_dir, merge=True,
                      encoder_model_id=speech_config.encoder.model_id,
                      encoder_revision=speech_config.encoder.revision)
    return model


_NON_VOCAB = re.compile(r"[^A-Z' ]")


def normalize_reference(text: str) -> str:
    return " ".join(_NON_VOCAB.sub(" ", text.upper()).split())


class _CachedWaveforms(torch.utils.data.Dataset):
    """SpeechOcean cached waveforms (clean or an augmented copy) for WER."""

    def __init__(self, records, root: Path, vocab: CharVocab) -> None:
        self.items = []
        for record in records:
            text = normalize_reference(record.text_reference)
            path = root / record.features.waveform_cache_path
            self.items.append((path, text))
        self.vocab = vocab
        self.lengths = [int(np.load(p, mmap_mode="r").shape[-1]) for p, _ in self.items]

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int) -> dict:
        path, text = self.items[index]
        audio = torch.from_numpy(np.load(path)).float().reshape(-1)
        return {"audio": audio, "labels": torch.tensor(self.vocab.encode(text)), "text": text}


def speechocean_wer(speech_config, manifest: Path, partition: str, adapter_dir: Path | None,
                    feature_variant: str | None, device: str, config: AdapterConfig) -> dict:
    vocab = encoder_vocab(speech_config)
    model = _model_for(speech_config, adapter_dir, device)
    feature_root = speech_config.data_root / "processed" / "speechocean762" / "features"
    root = variant_feature_root(feature_root, feature_variant) if feature_variant else feature_root
    records = [r for r in read_jsonl(manifest) if r.partition == partition]
    dataset = _CachedWaveforms(records, root, vocab)
    sampler = DurationBatchSampler(dataset.lengths, config.eval_batch_seconds, shuffle=False)
    loader = DataLoader(dataset, batch_sampler=sampler, collate_fn=collate_ctc)
    references, hypotheses = greedy_transcribe(model, vocab, loader, device, config.bf16)
    # Transcribed once, in the sampler's (length-sorted) order.
    groups = [records[i].speaker_age_group for batch in sampler for i in batch]
    return wer_by_group(references, hypotheses, groups)


def wer_by_group(references: list[str], hypotheses: list[str], groups: list[str]) -> dict:
    """WER over all utterances and per age group; None for a group without
    utterances rather than a perfect 0.0."""
    result = {}
    for group in ("all", "adult", "child"):
        chosen = [i for i, g in enumerate(groups) if group == "all" or g == group]
        result[f"{group}_wer"] = word_error_rate(
            [references[i] for i in chosen], [hypotheses[i] for i in chosen]
        ) if chosen else None
        result[f"{group}_records"] = len(chosen)
    return result


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.encoder.ctc_adapter")
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--speech-config", type=Path, required=True)
        p.add_argument("--adapter-config", type=Path, required=True)
        p.add_argument("--device", default="cuda")
        p.add_argument("--out", type=Path, default=None)

    train = sub.add_parser("train")
    common(train)
    train.add_argument("--train-dir", type=Path, required=True)
    train.add_argument("--dev-dir", type=Path, required=True)
    train.add_argument("--out-dir", type=Path, required=True)
    train.add_argument("--resume", action="store_true")
    train.add_argument("--max-steps", type=int, default=None)

    wer = sub.add_parser("wer")
    common(wer)
    wer.add_argument("--data-dir", type=Path, required=True)
    wer.add_argument("--adapter-dir", type=Path, default=None)

    so = sub.add_parser("speechocean-wer")
    common(so)
    so.add_argument("--manifest", type=Path, required=True)
    so.add_argument("--partition", choices=("train", "validation"), default="validation")
    so.add_argument("--adapter-dir", type=Path, default=None)
    so.add_argument("--feature-variant", default=None)
    args = parser.parse_args(argv)

    speech_config = load_config(args.speech_config)
    config = load_adapter_config(args.adapter_config)
    if args.command == "train":
        state = train_adapter(speech_config, config, args.train_dir, args.dev_dir, args.out_dir,
                              device=args.device, resume=args.resume, max_steps=args.max_steps)
        result = {"best_dev_wer_subset": state["best_wer"],
                  "base_dev_wer_subset": state.get("base_dev_wer"), "steps": state["step"],
                  "infeasible_train_utterances": state["infeasible_train_utterances"]}
    elif args.command == "wer":
        vocab = encoder_vocab(speech_config)
        model = _model_for(speech_config, args.adapter_dir, args.device)
        dataset = LoquaciousDataset(args.data_dir, vocab, read_index(args.data_dir))
        result = {"wer": _wer_on(model, vocab, dataset, config, args.device),
                  "utterances": len(dataset), "adapter": str(args.adapter_dir)}
    else:
        result = speechocean_wer(speech_config, args.manifest, args.partition, args.adapter_dir,
                                 args.feature_variant, args.device, config)
        result.update({"adapter": str(args.adapter_dir), "feature_variant": args.feature_variant})
    print(json.dumps(result))
    if args.out is not None:
        args.out.write_text(json.dumps(result, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
