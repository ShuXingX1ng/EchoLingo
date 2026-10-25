"""Shared pytest fixtures for the M1 SpeechOcean762 pipeline tests.

`speechocean_mini_corpus` builds a tiny synthetic (sine-tone) Kaldi-format corpus at
test time under `tmp_path` — never real corpus audio — so unit tests exercise the
real parsing/split/manifest code paths without downloading or committing any real
SpeechOcean762 data.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

SAMPLE_RATE = 16000

# (speaker_id, age_in_years, gender) x 2 utterances each = 8 train speakers / 16
# utterances. Ages match the real spk2age format (numeric years, not "adult"/"child"
# labels) so tests exercise the real age-group threshold logic in speechocean.py.
_TRAIN_SPEAKERS = [
    ("0001", 25, "m"),
    ("0002", 30, "m"),
    ("0003", 22, "f"),
    ("0004", 28, "f"),
    ("0005", 9, "m"),
    ("0006", 12, "m"),
    ("0007", 7, "f"),
    ("0008", 11, "f"),
]
_TEST_SPEAKERS = [
    ("0101", 24, "m"),
    ("0102", 10, "f"),
]


def _write_sine_wav(path: Path, *, duration_sec: float = 0.5, freq: float = 220.0) -> None:
    t = np.linspace(0, duration_sec, int(SAMPLE_RATE * duration_sec), endpoint=False)
    tone = 0.1 * np.sin(2 * np.pi * freq * t)
    sf.write(str(path), tone.astype(np.float32), SAMPLE_RATE)


def _build_split(corpus_dir: Path, split_name: str, speakers: list[tuple[str, int, str]]) -> None:
    split_dir = corpus_dir / split_name
    split_dir.mkdir(parents=True, exist_ok=True)
    wave_dir = corpus_dir / "WAVE"

    wav_scp_lines = []
    text_lines = []
    utt2spk_lines = []
    spk2gender_lines = []
    spk2age_lines = []

    for speaker_id, age_years, gender in speakers:
        speaker_wave_dir = wave_dir / f"SPEAKER{speaker_id}"
        speaker_wave_dir.mkdir(parents=True, exist_ok=True)
        spk2gender_lines.append(f"{speaker_id}\t{gender}")
        spk2age_lines.append(f"{speaker_id}\t{age_years}")

        for i in range(2):
            utt_id = f"{speaker_id}00{i}"
            wav_path = speaker_wave_dir / f"{utt_id}.WAV"
            _write_sine_wav(wav_path)
            rel_path = f"WAVE/SPEAKER{speaker_id}/{utt_id}.WAV"
            # Tab-delimited, matching the real speechocean762 release (not space).
            wav_scp_lines.append(f"{utt_id}\t{rel_path}")
            text_lines.append(f"{utt_id}\tTHE QUICK BROWN FOX")
            utt2spk_lines.append(f"{utt_id}\t{speaker_id}")

    (split_dir / "wav.scp").write_text("\n".join(wav_scp_lines) + "\n", encoding="utf-8")
    (split_dir / "text").write_text("\n".join(text_lines) + "\n", encoding="utf-8")
    (split_dir / "utt2spk").write_text("\n".join(utt2spk_lines) + "\n", encoding="utf-8")
    (split_dir / "spk2gender").write_text("\n".join(spk2gender_lines) + "\n", encoding="utf-8")
    (split_dir / "spk2age").write_text("\n".join(spk2age_lines) + "\n", encoding="utf-8")


@pytest.fixture
def speechocean_mini_corpus(tmp_path: Path) -> Path:
    corpus_dir = tmp_path / "speechocean762"
    corpus_dir.mkdir(parents=True, exist_ok=True)

    _build_split(corpus_dir, "train", _TRAIN_SPEAKERS)
    _build_split(corpus_dir, "test", _TEST_SPEAKERS)

    scores = {}
    scores_detail = {}
    for speakers in (_TRAIN_SPEAKERS, _TEST_SPEAKERS):
        for speaker_id, _age_group, _gender in speakers:
            for i in range(2):
                utt_id = f"{speaker_id}00{i}"
                scores[utt_id] = {
                    "accuracy": 8,
                    "completeness": 1.0,
                    "fluency": 7,
                    "prosodic": 7,
                    "total": 7,
                    "words": [
                        {
                            "text": "THE",
                            "accuracy": 8,
                            "stress": 10,
                            "total": 8,
                            "phones": ["DH", "AH0"],
                            "phones-accuracy": [2.0, 1.4],
                        },
                    ],
                }
                scores_detail[utt_id] = {
                    "text": "THE QUICK BROWN FOX",
                    "accuracy": [8.0, 8.0, 7.0, 9.0, 8.0],
                    "completeness": [1.0, 1.0, 1.0, 1.0, 1.0],
                    "fluency": [7.0, 6.0, 7.0, 8.0, 7.0],
                    "prosodic": [7.0, 7.0, 7.0, 7.0, 7.0],
                    "total": [7.6, 7.2, 7.0, 8.2, 7.6],
                    "words": [
                        {
                            "text": "THE",
                            "accuracy": [8.0, 10.0, 6.0, 8.0, 8.0],
                            "stress": [10.0, 10.0, 10.0, 10.0, 10.0],
                            "total": [8.0, 10.0, 6.0, 8.0, 8.0],
                            "ref-phones": "DH AH0",
                            "phones": ["DH AH0", "DH {AH0}", "DH (AH0)", "DH [L] AH0", "DH {AH0}"],
                        },
                    ],
                }
    (corpus_dir / "scores.json").write_text(json.dumps(scores), encoding="utf-8")
    (corpus_dir / "scores-detail.json").write_text(json.dumps(scores_detail), encoding="utf-8")
    return corpus_dir


@pytest.fixture
def tiny_wav2vec2_config():
    """A random Wav2Vec2 small enough for CPU tests, laid out like the pinned
    `wav2vec2-base-960h` (group-norm CNN, post-norm encoder, 32-token CTC
    vocabulary with blank = 0) but with 20x instead of 320x downsampling."""
    transformers = pytest.importorskip("transformers")
    return transformers.Wav2Vec2Config(
        vocab_size=32,
        pad_token_id=0,
        hidden_size=32,
        num_hidden_layers=2,
        num_attention_heads=2,
        intermediate_size=64,
        conv_dim=(16, 16, 16),
        conv_stride=(5, 2, 2),
        conv_kernel=(10, 3, 3),
        num_conv_pos_embeddings=16,
        num_conv_pos_embedding_groups=2,
        feat_extract_norm="group",
        do_stable_layer_norm=False,
        layerdrop=0.0,
        mask_time_length=2,
    )


# The pinned wav2vec2-base-960h `vocab.json` (revision 22aad52d435e).
WAV2VEC2_VOCAB = {
    "<pad>": 0, "<s>": 1, "</s>": 2, "<unk>": 3, "|": 4, "E": 5, "T": 6, "A": 7, "O": 8,
    "N": 9, "I": 10, "H": 11, "S": 12, "R": 13, "D": 14, "L": 15, "U": 16, "M": 17, "W": 18,
    "C": 19, "F": 20, "G": 21, "Y": 22, "P": 23, "B": 24, "V": 25, "K": 26, "'": 27, "X": 28,
    "J": 29, "Q": 30, "Z": 31,
}


@pytest.fixture
def write_loquacious_shard():
    """Writes a synthetic Loquacious parquet shard (the real columns: `ID`,
    `duration`, `wav` = {bytes, path}, `spk_id`, `sex`, `text`) from
    (id, seconds, sample_rate, text) rows of sine tones."""
    import io

    import pyarrow as pa
    import pyarrow.parquet as pq

    def write(path: Path, rows: list[tuple[str, float, int, str]]) -> Path:
        table = {"ID": [], "duration": [], "wav": [], "spk_id": [], "sex": [], "text": []}
        for utt_id, seconds, sample_rate, text in rows:
            t = np.arange(int(seconds * sample_rate)) / sample_rate
            buffer = io.BytesIO()
            sf.write(buffer, (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32),
                     sample_rate, format="WAV")
            table["ID"].append(utt_id)
            table["duration"].append(seconds)
            table["wav"].append({"bytes": buffer.getvalue(), "path": f"{utt_id}.wav"})
            table["spk_id"].append("spk")
            table["sex"].append("F")
            table["text"].append(text)
        path.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(pa.table(table), path)
        return path

    return write


@pytest.fixture
def char_vocab():
    from echolingo_speech.encoder.loquacious import CharVocab

    return CharVocab(WAV2VEC2_VOCAB)


# --- M4 Evaluator Checkpoint Bundle inputs --------------------------------------------

BUNDLE_LAYERS = [4, 12]
TINY_ENCODER_REVISION = "a" * 40


def _bundle_manifest_record(index: int, partition: str, duration: float):
    from echolingo_speech.data.manifest import (
        AudioInfo,
        DerivationInfo,
        ManifestRecord,
        SourceInfo,
    )

    return ManifestRecord(
        sample_id=f"SPEAKER{index:04d}_0001",
        dataset="speechocean762",
        dataset_version="876c34b828c2ebcc35ba2ff1ba5947d50e6b0162fc4a4af91db0942422b3bdd5",
        source=SourceInfo(origin="openslr", resource_id=101, url="https://example.invalid",
                          license="CC-BY-4.0", citation="zhang2021speechocean762"),
        speaker_id=f"{index:04d}",
        speaker_age_group="adult" if index % 2 else "child",
        speaker_gender="m",
        official_split="test" if partition == "test" else "train",
        partition=partition,
        consent_class="public_licensed_corpus",
        audio=AudioInfo(relative_path=f"WAVE/{index}.WAV", sha256="0", duration_sec=duration,
                        sample_rate=16000),
        text_reference="we call it bear",
        scores={},
        derivation=DerivationInfo(code_version="test", generated_at="2026-10-25T00:00:00+00:00"),
    )


@pytest.fixture
def bundle_inputs(tmp_path):
    """Everything `bundles.bundle.export_bundle` reads, for a small scorer
    over layers 4 and 12; returns the keyword arguments (minus `version` and
    `out_root`). Tests may edit the files before exporting."""
    import torch

    from echolingo_speech.config import EncoderConfig
    from echolingo_speech.data.manifest import write_jsonl
    from echolingo_speech.models.scorer import SpeechEvaluatorA0
    from echolingo_speech.training.checkpoint import TrainingState, save_training_checkpoint
    from echolingo_speech.training.config import TrainingConfig
    from echolingo_speech.training.loop import write_prediction_thresholds

    root = tmp_path / "bundle-inputs"
    training_yaml = {
        "seed": 7,
        "normalize_acoustic_features": True,
        "use_canonical_phones": True,
        "hidden_state_layers": BUNDLE_LAYERS,
        "rater_mean_targets": True,
    }
    training_config_path = root / "training.yaml"
    root.mkdir()
    import yaml

    training_config_path.write_text(yaml.safe_dump(training_yaml), encoding="utf-8")

    torch.manual_seed(0)
    model = SpeechEvaluatorA0(
        normalize_acoustic_features=True, use_canonical_phones=True,
        num_hidden_layers=len(BUNDLE_LAYERS),
    )
    model.set_acoustic_normalization(torch.arange(9.0), torch.full((9,), 2.0))
    optimizer = torch.optim.AdamW(model.parameters())
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer)
    checkpoint_path = root / "run" / "best.pt"
    save_training_checkpoint(
        checkpoint_path, model=model, optimizer=optimizer, scheduler=scheduler,
        state=TrainingState(epoch=3, best_val_loss=0.02), seed=7,
        training_config=TrainingConfig(**training_yaml).model_dump(),
    )
    write_prediction_thresholds(checkpoint_path.parent, {"word": 0.8, "phone": 0.85})

    run_dir = root / "mlruns" / "1" / "run123"
    (run_dir / "params").mkdir(parents=True)
    (run_dir / "tags").mkdir()
    for name, value in {
        "git_commit": "b" * 40, "seed": "7", "encoder_revision": TINY_ENCODER_REVISION,
        "manifest_sha256": "c" * 64, "gpu_name": "test GPU",
        "dataset_version": "876c34b828c2ebcc35ba2ff1ba5947d50e6b0162fc4a4af91db0942422b3bdd5",
    }.items():
        (run_dir / "params" / name).write_text(value)
    (run_dir / "tags" / "mlflow.runName").write_text("tiny-seed7")

    manifest_path = root / "manifest.jsonl"
    write_jsonl(manifest_path, [
        _bundle_manifest_record(1, "train", 1.5),
        _bundle_manifest_record(2, "train", 12.0),
        _bundle_manifest_record(3, "validation", 3.0),
        _bundle_manifest_record(4, "test", 4.0),
    ])
    benchmarks = {}
    for name, accuracy in (("validation", 0.8), ("test", 0.7)):
        path = root / f"{name}.json"
        path.write_text(json.dumps({
            "sentence_accuracy_pearson": accuracy, "sentence_fluency_pearson": accuracy,
        }))
        benchmarks[name] = path

    return {
        "checkpoint_path": checkpoint_path,
        "training_config_path": training_config_path,
        "mlflow_run_dir": run_dir,
        "manifest_path": manifest_path,
        "benchmarks": benchmarks,
        "encoder": EncoderConfig(model_id="test/tiny-wav2vec2", revision=TINY_ENCODER_REVISION,
                                 license="apache-2.0"),
    }


@pytest.fixture
def bundle_dir(bundle_inputs, tmp_path):
    from echolingo_speech.bundles.bundle import export_bundle

    return export_bundle(**bundle_inputs, version="0.1.0", out_root=tmp_path / "bundles")
