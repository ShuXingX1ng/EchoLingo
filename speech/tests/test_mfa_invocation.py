"""Where `alignment/mfa.py` looks for the MFA binary. Uses fake `mfa` files
under `tmp_path`; MFA and conda are never invoked."""

from __future__ import annotations

from pathlib import Path

import pytest

from echolingo_speech.alignment.mfa import MFA_BIN_ENV_VAR, _resolve_mfa_invocation


def _fake_mfa(bin_dir: Path) -> Path:
    bin_dir.mkdir(parents=True)
    binary = bin_dir / "mfa"
    binary.write_text("#!/bin/sh\n")
    return binary


@pytest.fixture(autouse=True)
def _isolated_environment(tmp_path, monkeypatch):
    monkeypatch.delenv(MFA_BIN_ENV_VAR, raising=False)
    monkeypatch.delenv("CONDA_EXE", raising=False)
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")


def test_explicit_override_wins_and_its_directory_joins_path(tmp_path, monkeypatch):
    binary = _fake_mfa(tmp_path / "custom" / "bin")
    _fake_mfa(tmp_path / "home" / "miniforge3" / "envs" / "aligner" / "bin")
    monkeypatch.setenv(MFA_BIN_ENV_VAR, str(binary))

    command, env = _resolve_mfa_invocation("aligner")

    assert command == [str(binary)]
    assert env["PATH"].split(":")[0] == str(binary.parent)


def test_finds_the_env_under_the_conda_root_that_conda_exe_points_to(tmp_path, monkeypatch):
    conda_root = tmp_path / "opt" / "conda"
    binary = _fake_mfa(conda_root / "envs" / "aligner" / "bin")
    conda_exe = conda_root / "bin" / "conda"
    conda_exe.parent.mkdir(parents=True)
    conda_exe.write_text("")
    monkeypatch.setenv("CONDA_EXE", str(conda_exe))

    command, _ = _resolve_mfa_invocation("aligner")

    assert command == [str(binary.resolve())]


def test_finds_the_env_under_a_home_miniconda_install(tmp_path):
    binary = _fake_mfa(tmp_path / "home" / "miniconda3" / "envs" / "aligner" / "bin")

    command, _ = _resolve_mfa_invocation("aligner")

    assert command == [str(binary)]


@pytest.mark.skipif(
    Path("/opt/conda/envs/aligner/bin/mfa").is_file(),
    reason="this machine has a real aligner env at /opt/conda",
)
def test_falls_back_to_conda_run_when_no_binary_is_found():
    command, _ = _resolve_mfa_invocation("aligner")

    assert command == ["conda", "run", "-n", "aligner", "mfa"]
