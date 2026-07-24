"""MFA (Montreal Forced Aligner) corpus prep, invocation, TextGrid parsing, and
alignment-quality reporting.

MFA itself runs in a separate WSL2 conda environment (`aligner`, conda-forge
`montreal-forced-aligner` + `english_us_arpa` acoustic model/dictionary) because its
Kaldi/OpenFst binaries are not pip-installable; this module only prepares the corpus
directory MFA expects, invokes it via `conda run`, and parses its TextGrid output.
Alignment output locates word/phone spans; it never judges pronunciation quality
(ADR-0011) — quality filtering here only decides whether a span is trustworthy enough
to use as evidence, and a low-quality/failed alignment degrades to sentence/word-only
evaluation rather than being silently dropped.

CLI: `python -m echolingo_speech.alignment.mfa {prepare,align,report}`
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
from pathlib import Path

from echolingo_speech.data.manifest import AlignmentInfo, ManifestRecord, read_jsonl, write_jsonl

ACOUSTIC_MODEL = "english_us_arpa"
DICTIONARY = "english_us_arpa"
CONDA_ENV = "aligner"
QUALITY_THRESHOLD = 0.95

_PUNCTUATION_RE = re.compile(r"[^\w\s']", flags=re.UNICODE)
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(text: str) -> str:
    lowered = text.lower()
    stripped = _PUNCTUATION_RE.sub(" ", lowered)
    return _WHITESPACE_RE.sub(" ", stripped).strip()


def prepare_corpus(records: list[ManifestRecord], corpus_root: Path, mfa_input_dir: Path) -> None:
    """Lay out an MFA-style corpus: `<speaker>/<sample_id>.wav` + `.lab` reference text."""
    mfa_input_dir.mkdir(parents=True, exist_ok=True)
    for record in records:
        speaker_dir = mfa_input_dir / f"SPEAKER{record.speaker_id}"
        speaker_dir.mkdir(parents=True, exist_ok=True)
        src_wav = corpus_root / record.audio.relative_path
        dst_wav = speaker_dir / f"{record.sample_id}.wav"
        if not dst_wav.exists():
            shutil.copy2(src_wav, dst_wav)
        lab_path = speaker_dir / f"{record.sample_id}.lab"
        lab_path.write_text(normalize_text(record.text_reference) + "\n", encoding="utf-8")


def _resolve_mfa_invocation(conda_env: str) -> tuple[list[str], dict[str, str]]:
    """Prefer invoking the conda env's `mfa` binary directly by absolute path.

    `conda run -n <env> mfa ...` requires `conda`/`conda-hook` to be on PATH and
    shell-initialized, which is not guaranteed for a plain subprocess. A direct
    binary path avoids that dependency, but MFA itself shells out to sibling
    OpenFst/Kaldi binaries (e.g. `fstcompile`) assuming they are on PATH — normally
    provided by conda's shell activation — so the env's `bin/` dir must still be
    prepended to PATH explicitly. Falls back to `conda run` (and an unmodified
    PATH) if the conda env isn't found at the conventional Miniforge/Miniconda
    location (e.g. a differently-configured machine).
    """
    for conda_root in (Path.home() / "miniforge3", Path.home() / "miniconda3"):
        env_bin = conda_root / "envs" / conda_env / "bin"
        candidate = env_bin / "mfa"
        if candidate.is_file():
            env = os.environ.copy()
            env["PATH"] = f"{env_bin}{os.pathsep}{env.get('PATH', '')}"
            return [str(candidate)], env
    return ["conda", "run", "-n", conda_env, "mfa"], os.environ.copy()


def run_align(
    mfa_input_dir: Path,
    output_dir: Path,
    *,
    conda_env: str = CONDA_ENV,
    acoustic_model: str = ACOUSTIC_MODEL,
    dictionary: str = DICTIONARY,
) -> subprocess.CompletedProcess:
    output_dir.mkdir(parents=True, exist_ok=True)
    binary, env = _resolve_mfa_invocation(conda_env)
    cmd = [
        *binary,
        "align",
        str(mfa_input_dir),
        dictionary,
        acoustic_model,
        str(output_dir),
        "--clean",
        "--overwrite",
    ]
    return subprocess.run(cmd, capture_output=True, text=True, check=False, env=env)


def _parse_textgrid(path: Path) -> tuple[int, int]:
    """Return (word_interval_count, phone_interval_count) for non-empty intervals."""
    from praatio import textgrid as tg

    grid = tg.openTextgrid(str(path), includeEmptyIntervals=False)
    word_tier_names = [name for name in grid.tierNames if "word" in name.lower()]
    phone_tier_names = [name for name in grid.tierNames if "phone" in name.lower()]

    word_count = sum(len(grid.getTier(name).entries) for name in word_tier_names)
    phone_count = sum(len(grid.getTier(name).entries) for name in phone_tier_names)
    return word_count, phone_count


def parse_alignment_output(records: list[ManifestRecord], output_dir: Path) -> list[ManifestRecord]:
    updated: list[ManifestRecord] = []
    for record in records:
        textgrid_path = output_dir / f"SPEAKER{record.speaker_id}" / f"{record.sample_id}.TextGrid"
        reference_word_count = max(1, len(normalize_text(record.text_reference).split()))

        if not textgrid_path.is_file():
            record.alignment = AlignmentInfo(
                status="failed",
                textgrid_relative_path=None,
                oov_word_count=reference_word_count,
                unaligned_word_count=reference_word_count,
                quality_score=0.0,
            )
            updated.append(record)
            continue

        aligned_word_count, _phone_count = _parse_textgrid(textgrid_path)
        quality_score = min(1.0, aligned_word_count / reference_word_count)
        unaligned_word_count = max(0, reference_word_count - aligned_word_count)
        status = "aligned" if quality_score >= QUALITY_THRESHOLD else "degraded"

        record.alignment = AlignmentInfo(
            status=status,
            textgrid_relative_path=str(textgrid_path.relative_to(output_dir.parent)),
            oov_word_count=unaligned_word_count,
            unaligned_word_count=unaligned_word_count,
            quality_score=quality_score,
        )
        updated.append(record)
    return updated


def quality_report(records: list[ManifestRecord]) -> dict:
    total = len(records)
    by_status = {"aligned": 0, "degraded": 0, "failed": 0}
    by_age_group: dict[str, dict[str, int]] = {}
    quality_scores: list[float] = []

    for record in records:
        status = record.alignment.status if record.alignment else "failed"
        by_status[status] = by_status.get(status, 0) + 1
        age_bucket = by_age_group.setdefault(
            record.speaker_age_group, {"aligned": 0, "degraded": 0, "failed": 0}
        )
        age_bucket[status] = age_bucket.get(status, 0) + 1
        if record.alignment and record.alignment.quality_score is not None:
            quality_scores.append(record.alignment.quality_score)

    return {
        "total": total,
        "by_status": by_status,
        "by_status_pct": {k: (v / total if total else 0.0) for k, v in by_status.items()},
        "by_age_group": by_age_group,
        "mean_quality_score": sum(quality_scores) / len(quality_scores) if quality_scores else 0.0,
    }


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.alignment.mfa")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare_parser = subparsers.add_parser("prepare", help="Lay out the MFA corpus directory")
    prepare_parser.add_argument("--manifest", type=Path, required=True)
    prepare_parser.add_argument("--corpus-root", type=Path, required=True)
    prepare_parser.add_argument("--mfa-input-dir", type=Path, required=True)

    align_parser = subparsers.add_parser(
        "align", help="Run MFA and write alignment fields back to the manifest"
    )
    align_parser.add_argument("--manifest", type=Path, required=True)
    align_parser.add_argument("--mfa-input-dir", type=Path, required=True)
    align_parser.add_argument("--output-dir", type=Path, required=True)

    report_parser = subparsers.add_parser(
        "report", help="Print an aggregate alignment quality report"
    )
    report_parser.add_argument("--manifest", type=Path, required=True)

    args = parser.parse_args(argv)

    if args.command == "prepare":
        records = read_jsonl(args.manifest)
        prepare_corpus(records, args.corpus_root, args.mfa_input_dir)
        print(f"OK: prepared MFA corpus for {len(records)} utterances at {args.mfa_input_dir}")
        return 0

    if args.command == "align":
        records = read_jsonl(args.manifest)
        result = run_align(args.mfa_input_dir, args.output_dir)
        if result.returncode != 0:
            print("mfa align FAILED")
            print(result.stdout)
            print(result.stderr)
            return result.returncode
        updated = parse_alignment_output(records, args.output_dir)
        write_jsonl(args.manifest, updated)
        print(f"OK: aligned {len(updated)} utterances, manifest updated")
        return 0

    if args.command == "report":
        records = read_jsonl(args.manifest)
        report = quality_report(records)
        print(report)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(_cli())
