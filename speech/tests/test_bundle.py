"""Evaluator Checkpoint Bundle export, verification and loading (M4,
`bundles/bundle.py`), on a small random scorer from the `bundle_inputs`
fixture."""

from __future__ import annotations

import json
import os
import stat

import pytest
import torch

from echolingo_speech.bundles.bundle import (
    BENCHMARK_RESULTS_NAME,
    BUNDLE_FILES,
    DATASET_MANIFEST_NAME,
    FEATURE_SCHEMA_NAME,
    INDEX_NAME,
    LABEL_SCHEMA_NAME,
    TRAINING_MANIFEST_NAME,
    BundleError,
    _cli,
    export_bundle,
    load_bundle,
    verify_bundle,
)
from echolingo_speech.training.checkpoint import load_model


def _read(bundle_dir, name):
    return json.loads((bundle_dir / name).read_text(encoding="utf-8"))


def _make_writable(path):
    os.chmod(path, stat.S_IRWXU)


def test_export_writes_every_listed_file_read_only_and_verifies(bundle_dir):
    index = verify_bundle(bundle_dir)

    assert bundle_dir.name == "speech-evaluator-v0.1.0" == index["bundle_id"]
    assert set(index["files"]) == set(BUNDLE_FILES)
    assert {path.name for path in bundle_dir.iterdir()} == {*BUNDLE_FILES, INDEX_NAME}
    for path in bundle_dir.iterdir():
        assert not path.stat().st_mode & (stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH)


def test_bundle_pins_raw_input_layers_thresholds_and_provenance(bundle_dir):
    feature_schema = _read(bundle_dir, FEATURE_SCHEMA_NAME)
    assert feature_schema["input"] == {
        "sample_rate": 16000,
        "channels": "mono; multi-channel audio is averaged",
        "resampling": "torchaudio.functional.resample",
        "waveform_normalization": "none",
    }
    assert feature_schema["hidden_state_layers"] == [4, 12]
    assert feature_schema["encoder"]["revision"] == "a" * 40
    # Training-partition durations only (the test record is 4.0 s).
    assert feature_schema["training_audio_duration_sec"] == {"min": 1.5, "max": 12.0}

    training = _read(bundle_dir, TRAINING_MANIFEST_NAME)
    assert training["code_revision"] == "b" * 40
    assert training["mlflow_run_id"] == "run123"
    assert training["run_name"] == "tiny-seed7"
    assert training["seed"] == 7

    dataset = _read(bundle_dir, DATASET_MANIFEST_NAME)["datasets"][0]
    assert dataset["training_manifest_sha256"] == "c" * 64
    assert dataset["partitions"]["validation"]["speaker_ids"] == ["0003"]

    assert _read(bundle_dir, LABEL_SCHEMA_NAME)["training_targets"] == "the five experts' mean"
    benchmarks = _read(bundle_dir, BENCHMARK_RESULTS_NAME)
    assert benchmarks["acceptance"]["metrics"]["sentence_accuracy_pearson"] == 0.7
    assert set(benchmarks["results"]) == {"validation", "test"}


def test_loaded_scorer_matches_the_training_checkpoint(bundle_dir, bundle_inputs):
    bundle = load_bundle(bundle_dir)
    original = load_model(bundle_inputs["checkpoint_path"], "cpu")

    assert not bundle.model.training
    assert bundle.prediction_thresholds == {"word": 0.8, "phone": 0.85}
    assert bundle.hidden_state_layers == (4, 12)
    for key, value in original.state_dict().items():
        assert torch.equal(bundle.model.state_dict()[key], value), key


def test_partition_hash_ignores_manifest_order(bundle_inputs, tmp_path):
    from echolingo_speech.data.manifest import read_jsonl, write_jsonl

    first = export_bundle(**bundle_inputs, version="0.1.0", out_root=tmp_path / "a")
    path = bundle_inputs["manifest_path"]
    write_jsonl(path, list(reversed(read_jsonl(path))))
    second = export_bundle(**bundle_inputs, version="0.1.0", out_root=tmp_path / "b")

    def assignment(bundle):
        return _read(bundle, DATASET_MANIFEST_NAME)["datasets"][0]["partition_assignment_sha256"]

    assert assignment(first) == assignment(second)


def test_an_existing_bundle_is_never_replaced(bundle_dir, bundle_inputs):
    with pytest.raises(BundleError, match="immutable"):
        export_bundle(**bundle_inputs, version="0.1.0", out_root=bundle_dir.parent)


def test_a_changed_file_is_refused(bundle_dir):
    path = bundle_dir / LABEL_SCHEMA_NAME
    _make_writable(path)
    path.write_text(path.read_text().replace("five", "six"))

    with pytest.raises(BundleError, match="SHA-256"):
        load_bundle(bundle_dir)


def test_an_extra_or_missing_file_is_refused(bundle_dir):
    extra = bundle_dir / "newer-weights.safetensors"
    extra.write_bytes(b"")
    with pytest.raises(BundleError, match="unexpected or missing"):
        verify_bundle(bundle_dir)
    extra.unlink()

    (bundle_dir / BENCHMARK_RESULTS_NAME).unlink()
    with pytest.raises(BundleError, match="unexpected or missing"):
        verify_bundle(bundle_dir)


def test_a_renamed_bundle_directory_is_refused(bundle_dir):
    renamed = bundle_dir.with_name("speech-evaluator-v0.2.0")
    bundle_dir.rename(renamed)

    with pytest.raises(BundleError, match="holds bundle"):
        verify_bundle(renamed)


@pytest.mark.parametrize(
    "benchmark",
    [
        {"sentence_accuracy_pearson": 0.59, "sentence_fluency_pearson": 0.7},
        {"sentence_accuracy_pearson": 0.7},
    ],
)
def test_export_refuses_a_run_below_the_acceptance_gate(bundle_inputs, tmp_path, benchmark):
    bundle_inputs["benchmarks"]["test"].write_text(json.dumps(benchmark))

    with pytest.raises(BundleError, match="SS7.2 gate"):
        export_bundle(**bundle_inputs, version="0.1.0", out_root=tmp_path / "out")
    assert not (tmp_path / "out" / "speech-evaluator-v0.1.0").exists()


def test_export_needs_the_sealed_test_benchmark(bundle_inputs, tmp_path):
    del bundle_inputs["benchmarks"]["test"]

    with pytest.raises(BundleError, match="sealed-test"):
        export_bundle(**bundle_inputs, version="0.1.0", out_root=tmp_path / "out")


def test_export_refuses_a_training_config_the_run_did_not_use(bundle_inputs, tmp_path):
    path = bundle_inputs["training_config_path"]
    path.write_text(path.read_text() + "learning_rate: 0.5\n")

    with pytest.raises(BundleError, match="not the configuration"):
        export_bundle(**bundle_inputs, version="0.1.0", out_root=tmp_path / "out")


def test_export_refuses_an_mlflow_run_with_another_seed(bundle_inputs, tmp_path):
    (bundle_inputs["mlflow_run_dir"] / "params" / "seed").write_text("8")

    with pytest.raises(BundleError, match="seed"):
        export_bundle(**bundle_inputs, version="0.1.0", out_root=tmp_path / "out")


def test_export_refuses_another_encoder_revision(bundle_inputs, tmp_path):
    bundle_inputs["encoder"] = bundle_inputs["encoder"].model_copy(update={"revision": "d" * 40})

    with pytest.raises(BundleError, match="encoder revision"):
        export_bundle(**bundle_inputs, version="0.1.0", out_root=tmp_path / "out")


def test_export_refuses_a_bad_version(bundle_inputs, tmp_path):
    with pytest.raises(BundleError, match="1.2.3"):
        export_bundle(**bundle_inputs, version="latest", out_root=tmp_path / "out")


def test_verify_cli_reports_a_tampered_bundle(bundle_dir, capsys):
    assert _cli(["verify", "--bundle", str(bundle_dir)]) == 0
    path = bundle_dir / FEATURE_SCHEMA_NAME
    _make_writable(path)
    path.write_text("{}")

    assert _cli(["verify", "--bundle", str(bundle_dir)]) == 1
    assert "REFUSED" in capsys.readouterr().out
