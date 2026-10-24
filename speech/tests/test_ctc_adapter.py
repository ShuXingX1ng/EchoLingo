"""M3 A1 CTC adapter training: the approved adapter config, a CTC loss over
each utterance's own frames, and a resumable loop that trains only LoRA."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch
from pydantic import ValidationError

from echolingo_speech.encoder import ctc_adapter
from echolingo_speech.encoder.ctc_adapter import (
    AdapterConfig,
    ctc_frames_needed,
    ctc_loss,
    feasible_utterances,
    freeze_ctc_model,
    load_adapter_config,
    output_frames,
    train_adapter,
    wer_by_group,
)
from echolingo_speech.encoder.loquacious import Utterance, prepare
from echolingo_speech.encoder.lora import (
    LoRAConfig,
    inject_lora,
    lora_parameters,
    read_adapter_config,
)

CONFIG_DIR = Path(__file__).resolve().parents[1] / "configs" / "adapter"


def test_the_a1_config_is_the_approved_adapter():
    config = load_adapter_config(CONFIG_DIR / "a1-loquacious-small.yaml")
    assert config.name == "a1-loquacious-small"
    assert config.lora() == LoRAConfig(
        rank=16, alpha=32.0, dropout=0.05, target_modules=("q_proj", "v_proj")
    )


@pytest.mark.parametrize("name", ["A1", "a1_small", "-a1", "a1/small", ""])
def test_adapter_names_must_be_safe_cache_suffixes(name: str):
    with pytest.raises(ValidationError, match="adapter name"):
        AdapterConfig(name=name)


def test_ctc_needs_a_blank_between_repeated_labels():
    assert ctc_frames_needed([5, 6, 7]) == 3
    assert ctc_frames_needed([15, 15, 4, 15]) == 5
    assert ctc_frames_needed([]) == 0


def test_ctc_loss_ignores_the_padded_frames():
    torch.manual_seed(0)
    logits = torch.randn(2, 20, 6)
    frames = torch.tensor([20, 12])
    labels = torch.tensor([[1, 2, 3, 2], [4, 5, -100, -100]])
    loss = ctc_loss(logits, frames, labels, blank_id=0)
    padded = logits.clone()
    padded[1, 12:] = 100.0
    assert torch.allclose(ctc_loss(padded, frames, labels, blank_id=0), loss)
    # torch's "mean": each loss over its label count, then the batch mean.
    log_probs = torch.log_softmax(logits, dim=-1)
    single = [
        torch.nn.functional.ctc_loss(
            log_probs[i, : frames[i]].unsqueeze(1), labels[i : i + 1, :n], frames[i : i + 1],
            torch.tensor([n]), reduction="sum",
        ) / n
        for i, n in enumerate((4, 2))
    ]
    assert torch.allclose(loss, torch.stack(single).mean())


def test_ctc_loss_matches_wav2vec2_for_ctc_without_padding(tiny_wav2vec2_config):
    from transformers import Wav2Vec2ForCTC

    torch.manual_seed(0)
    tiny_wav2vec2_config.ctc_loss_reduction = "mean"
    model = Wav2Vec2ForCTC(tiny_wav2vec2_config).eval()
    audio = torch.randn(2, 4000)
    labels = torch.tensor([[5, 6, 7, 4, 8], [9, 10, -100, -100, -100]])
    output = model(audio, labels=labels)
    frames = output_frames(model, torch.tensor([4000, 4000]))
    assert torch.allclose(ctc_loss(output.logits, frames, labels, blank_id=0), output.loss)


def test_infeasible_transcripts_are_dropped(tiny_wav2vec2_config, char_vocab):
    from transformers import Wav2Vec2ForCTC

    model = Wav2Vec2ForCTC(tiny_wav2vec2_config)
    # 4000 samples -> 199 frames with the tiny encoder's 20x downsampling.
    assert output_frames(model, torch.tensor([4000])).item() == 199
    fits = Utterance("s", 0, 4000, "A" * 100, "fits")  # 100 + 99 blanks = 199
    too_long = Utterance("s", 0, 4000, "A" * 101, "too-long")
    kept, dropped = feasible_utterances([fits, too_long], char_vocab, model)
    assert kept == [fits] and dropped == 1


def test_a_frozen_ctc_model_builds_no_graph_through_the_cnn(tiny_wav2vec2_config):
    from transformers import Wav2Vec2ForCTC

    model = freeze_ctc_model(Wav2Vec2ForCTC(tiny_wav2vec2_config)).train()
    assert not any(p.requires_grad for p in model.parameters())
    assert not model.wav2vec2.feature_extractor(torch.randn(1, 4000)).requires_grad
    inject_lora(model.wav2vec2, LoRAConfig(rank=4))
    model(torch.randn(1, 4000)).logits.sum().backward()
    trainable = {id(p) for p in lora_parameters(model.wav2vec2)}
    assert all((p.grad is not None) == (id(p) in trainable) for p in model.parameters())


def _prepared(tmp_path: Path, char_vocab, write_loquacious_shard, name: str, count: int) -> Path:
    texts = ["WE CALL IT BEAR", "IT'S A DOG", "GOOD MORNING", "THANK YOU"]
    rows = [(f"{name}-{i}", 1.5, 16000, texts[i % len(texts)]) for i in range(count)]
    shard = write_loquacious_shard(tmp_path / "parquet" / name / f"{name}-0.parquet", rows)
    out = tmp_path / name
    prepare([shard], out, char_vocab, workers=1)
    return out


def test_training_learns_lora_and_resumes_where_it_stopped(
    tmp_path: Path, monkeypatch, tiny_wav2vec2_config, char_vocab, write_loquacious_shard
):
    from transformers import Wav2Vec2ForCTC

    train_dir = _prepared(tmp_path, char_vocab, write_loquacious_shard, "train", 8)
    dev_dir = _prepared(tmp_path, char_vocab, write_loquacious_shard, "dev", 3)

    def tiny_model(speech_config, device):
        torch.manual_seed(0)
        return freeze_ctc_model(Wav2Vec2ForCTC(tiny_wav2vec2_config)).to(device)

    monkeypatch.setattr(ctc_adapter, "encoder_vocab", lambda speech_config: char_vocab)
    monkeypatch.setattr(ctc_adapter, "load_ctc_model", tiny_model)
    speech_config = SimpleNamespace(
        encoder=SimpleNamespace(model_id="tiny", revision="abc"), artifact_root=tmp_path
    )
    # 8 x 1.5 s at 3.5 s per batch: 4 batches per epoch, 8 steps in all, cut to 5.
    config = AdapterConfig(
        name="tiny-adapter", epochs=2, max_batch_seconds=3.5, eval_every_steps=2,
        warmup_steps=1, learning_rate=1e-2, dev_eval_utterances=0, num_workers=0, bf16=False,
    )
    out_dir = tmp_path / "adapter"

    def run(resume: bool = False):
        return train_adapter(speech_config, config, train_dir, dev_dir, out_dir,
                             device="cpu", resume=resume, max_steps=5)

    seen: list[list[int]] = []
    real_loss = ctc_adapter.ctc_loss

    def crash_on_step_four(logits, frames, labels, blank_id):
        seen.append(labels.tolist())
        if len(seen) == 4:
            raise RuntimeError("simulated crash")
        return real_loss(logits, frames, labels, blank_id)

    monkeypatch.setattr(ctc_adapter, "ctc_loss", crash_on_step_four)
    with pytest.raises(RuntimeError, match="simulated crash"):
        run()
    saved = torch.load(out_dir / "last.pt", weights_only=False)["state"]
    assert (saved["step"], saved["epoch"], saved["epoch_step"]) == (2, 0, 2)
    with pytest.raises(FileExistsError):
        run()

    resumed: list[list[int]] = []

    def record(logits, frames, labels, blank_id):
        resumed.append(labels.tolist())
        return real_loss(logits, frames, labels, blank_id)

    monkeypatch.setattr(ctc_adapter, "ctc_loss", record)
    state = run(resume=True)
    # The resumed run starts at the batch the crashed run trained as step 3.
    assert resumed[0] == seen[2]
    assert state["step"] == 5 and state["total_steps"] == 5
    assert [entry["step"] for entry in state["history"]] == [0, 2, 4, 5]
    assert state["infeasible_train_utterances"] == 0

    lora, metadata = read_adapter_config(out_dir / "best")
    assert lora == LoRAConfig(rank=16, alpha=32.0, dropout=0.05)
    assert metadata["name"] == "tiny-adapter" and metadata["encoder_revision"] == "abc"
    assert metadata["train_utterances"] == 8
    from safetensors.torch import load_file

    weights = load_file(str(out_dir / "best" / "adapter.safetensors"))
    assert any(v.abs().sum() > 0 for k, v in weights.items() if k.endswith("lora_B"))
    history = json.loads((out_dir / "history.json").read_text())
    assert history == state["history"]


def test_wer_by_group_reports_no_wer_for_an_empty_group():
    result = wer_by_group(["WE CALL IT", "A B"], ["WE CALL IT", "A C"], ["adult", "adult"])
    assert result == {"all_wer": 0.2, "all_records": 2, "adult_wer": 0.2, "adult_records": 2,
                      "child_wer": None, "child_records": 0}


def test_speechocean_wer_keeps_each_transcript_with_its_speakers_group(
    tmp_path: Path, monkeypatch, tiny_wav2vec2_config, char_vocab
):
    import numpy as np
    from transformers import Wav2Vec2ForCTC

    root = tmp_path / "data" / "processed" / "speechocean762" / "features"
    (root / "waveform").mkdir(parents=True)
    records = []
    # Length sorting turns the groups' order from adult, adult, child, child
    # into child, child, adult, adult.
    for i, (group, seconds) in enumerate(
        [("adult", 2.0), ("adult", 1.0), ("child", 0.5), ("child", 0.25)]
    ):
        np.save(root / "waveform" / f"S{i}.npy", np.zeros((1, int(seconds * 16000)), np.float32))
        records.append(SimpleNamespace(
            partition="validation", speaker_age_group=group, text_reference=group,
            features=SimpleNamespace(waveform_cache_path=f"waveform/S{i}.npy"),
        ))
    monkeypatch.setattr(ctc_adapter, "read_jsonl", lambda path: records)
    monkeypatch.setattr(ctc_adapter, "encoder_vocab", lambda speech_config: char_vocab)
    monkeypatch.setattr(ctc_adapter, "_model_for",
                        lambda c, a, d: Wav2Vec2ForCTC(tiny_wav2vec2_config).eval())
    captured = {}

    def capture(references, hypotheses, groups):
        captured.update(references=references, groups=groups)
        return {}

    monkeypatch.setattr(ctc_adapter, "wer_by_group", capture)
    ctc_adapter.speechocean_wer(
        SimpleNamespace(data_root=tmp_path / "data"), tmp_path / "manifest.jsonl", "validation",
        None, None, "cpu", AdapterConfig(name="t", bf16=False),
    )
    assert captured["references"] == ["CHILD", "CHILD", "ADULT", "ADULT"]
    assert captured["groups"] == ["child", "child", "adult", "adult"]
