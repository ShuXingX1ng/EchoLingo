"""SpeechOcean762 download, Kaldi-format parsing, speaker-stratified split, and
Speech Dataset Manifest construction.

CLI: `python -m echolingo_speech.data.speechocean
{download,build-manifest,attach-raters,audit-leakage}`

Nothing here trains or scores anything; it only produces the immutable raw copy,
the fixed speaker-independent split, and the base manifest fields (`alignment` and
`features` are filled in later by `alignment/mfa.py` and `features/cache.py`).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import subprocess
import tarfile
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import requests

from echolingo_speech.data.manifest import (
    AudioInfo,
    DerivationInfo,
    ManifestRecord,
    SourceInfo,
    audit_leakage,
    write_jsonl,
)

RESOURCE_ID = 101
TARBALL_NAME = "speechocean762.tar.gz"
MIRRORS = (
    f"https://openslr.trmal.net/resources/{RESOURCE_ID}/{TARBALL_NAME}",
    f"https://openslr.elda.org/resources/{RESOURCE_ID}/{TARBALL_NAME}",
    f"https://openslr.magicdatatech.com/resources/{RESOURCE_ID}/{TARBALL_NAME}",
)
LICENSE = "CC-BY-4.0"
CITATION = "zhang2021speechocean762"
DEFAULT_VALIDATION_RATIO = 0.10
DEFAULT_SPLIT_SEED = 20260723


def _sha256_file(path: Path, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(raw_root: Path, *, mirrors: tuple[str, ...] = MIRRORS) -> tuple[Path, str]:
    """Download + extract the corpus under `raw_root`, verifying/freezing a SHA-256.

    Returns (extracted_corpus_dir, tarball_sha256). If a hash was already recorded
    for a previous download, a mismatch raises instead of silently re-trusting a
    changed tarball.
    """
    raw_root.mkdir(parents=True, exist_ok=True)
    tarball_path = raw_root / TARBALL_NAME
    hash_record_path = raw_root / f"{TARBALL_NAME}.sha256"

    if not tarball_path.is_file():
        last_error: Exception | None = None
        for url in mirrors:
            try:
                _download_with_retry(url, tarball_path)
                last_error = None
                break
            except Exception as exc:  # noqa: BLE001 - tried mirrors are reported together
                last_error = exc
                continue
        if last_error is not None:
            raise RuntimeError(
                f"all mirrors failed for {TARBALL_NAME}: {last_error}"
            ) from last_error

    computed_sha256 = _sha256_file(tarball_path)
    if hash_record_path.is_file():
        recorded = hash_record_path.read_text(encoding="utf-8").strip()
        if recorded != computed_sha256:
            raise RuntimeError(
                f"tarball SHA-256 mismatch: recorded {recorded}, computed {computed_sha256}. "
                "Refusing to proceed with a changed/corrupted download."
            )
    else:
        hash_record_path.write_text(computed_sha256 + "\n", encoding="utf-8")

    extract_root = raw_root / computed_sha256[:12]
    marker = extract_root / ".extracted"
    if not marker.is_file():
        extract_root.mkdir(parents=True, exist_ok=True)
        with tarfile.open(tarball_path, "r:gz") as tar:
            tar.extractall(extract_root, filter="data")
        marker.write_text("ok\n", encoding="utf-8")

    corpus_dir = _find_corpus_root(extract_root)
    return corpus_dir, computed_sha256


def _download_with_retry(url: str, dest: Path, *, attempts: int = 3, timeout: int = 60) -> None:
    for attempt in range(1, attempts + 1):
        try:
            with requests.get(url, stream=True, timeout=timeout) as response:
                response.raise_for_status()
                tmp_path = dest.with_suffix(dest.suffix + ".part")
                with tmp_path.open("wb") as handle:
                    for chunk in response.iter_content(chunk_size=1 << 20):
                        handle.write(chunk)
                tmp_path.rename(dest)
            return
        except Exception:
            if attempt == attempts:
                raise
            time.sleep(2 * attempt)


def _find_corpus_root(extract_root: Path) -> Path:
    for candidate in (extract_root, *extract_root.glob("*/")):
        if (candidate / "train" / "wav.scp").is_file() and (candidate / "WAVE").is_dir():
            return candidate
    raise RuntimeError(f"could not locate speechocean762 corpus layout under {extract_root}")


def _read_two_column(path: Path) -> dict[str, str]:
    """Kaldi-format `key<whitespace>value` files. The real speechocean762 release
    uses tabs, not spaces, so split on any whitespace run rather than a literal
    space."""
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        key, _, value = line.partition("\t") if "\t" in line else line.partition(" ")
        result[key.strip()] = value.strip()
    return result


def _read_wav_scp(path: Path, corpus_dir: Path, split_dir: Path) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        utt_id, _, rel_path = line.partition("\t") if "\t" in line else line.partition(" ")
        rel_path = rel_path.strip()
        if "|" in rel_path:
            raise ValueError(f"pipe-style wav.scp entries are not supported: {line!r}")
        for base in (split_dir, corpus_dir):
            candidate = (base / rel_path).resolve()
            if candidate.is_file():
                result[utt_id.strip()] = candidate
                break
        else:
            raise FileNotFoundError(
                f"audio file for {utt_id!r} not found (tried under {split_dir}, {corpus_dir})"
            )
    return result


# The real spk2age file stores numeric ages in years, not category labels. There is
# a clear gap in the observed distribution between 15 and 19 (no 16/17/18 values),
# matching SpeechOcean762's documented ~50/50 child/adult speaker composition, so 18
# (the common legal-adulthood boundary) cleanly separates the two groups.
CHILD_MAX_AGE = 17


def _age_group_from_raw(age_raw: str) -> str:
    age_raw = age_raw.strip()
    try:
        age = int(age_raw)
    except ValueError as exc:
        raise ValueError(f"spk2age value is not a numeric age: {age_raw!r}") from exc
    return "child" if age <= CHILD_MAX_AGE else "adult"


class SpeakerMeta:
    def __init__(self, speaker_id: str, age_group: str, gender: str) -> None:
        self.speaker_id = speaker_id
        self.age_group = age_group
        self.gender = gender


def _load_split(corpus_dir: Path, split_name: str) -> dict[str, dict]:
    split_dir = corpus_dir / split_name
    wav_paths = _read_wav_scp(split_dir / "wav.scp", corpus_dir, split_dir)
    texts = _read_two_column(split_dir / "text")
    utt2spk = _read_two_column(split_dir / "utt2spk")
    spk2gender = _read_two_column(split_dir / "spk2gender")
    spk2age = _read_two_column(split_dir / "spk2age")

    utterances: dict[str, dict] = {}
    for utt_id, wav_path in wav_paths.items():
        speaker_id = utt2spk[utt_id]
        age_group = _age_group_from_raw(spk2age.get(speaker_id, ""))
        gender_raw = spk2gender.get(speaker_id, "").strip().lower()
        gender = "f" if gender_raw.startswith("f") else "m"
        utterances[utt_id] = {
            "utt_id": utt_id,
            "speaker_id": speaker_id,
            "age_group": age_group,
            "gender": gender,
            "wav_path": wav_path,
            "text_reference": texts.get(utt_id, ""),
        }
    return utterances


def _load_scores(corpus_dir: Path) -> dict[str, dict]:
    for candidate in (corpus_dir / "scores.json", corpus_dir / "resource" / "scores.json"):
        if candidate.is_file():
            return json.loads(candidate.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"scores.json not found under {corpus_dir} or {corpus_dir}/resource")


RATER_COUNT = 5
# scores-detail.json writes each expert's phone scores inline in the phone
# string: a bare phone scored 2, `{P}` 1, `(P)` 0, and `[P]` an inserted phone
# that has no canonical position (and no score).
_RATER_PHONE_SCORES = {"{": 1.0, "(": 0.0}


def _load_rater_detail(corpus_dir: Path) -> dict[str, dict]:
    for candidate in (
        corpus_dir / "scores-detail.json",
        corpus_dir / "resource" / "scores-detail.json",
    ):
        if candidate.is_file():
            return json.loads(candidate.read_text(encoding="utf-8"))
    raise FileNotFoundError(
        f"scores-detail.json not found under {corpus_dir} or {corpus_dir}/resource"
    )


def parse_rater_phones(notation: str) -> list[float]:
    """One expert's phone string for a word -> that expert's score for each
    canonical phone, in order, with inserted phones dropped."""
    scores: list[float] = []
    for token in notation.split():
        if token.startswith("["):
            continue
        scores.append(_RATER_PHONE_SCORES.get(token[0], 2.0))
    return scores


def rater_scores(utt_id: str, detail: dict, words: list[dict]) -> dict:
    """The five experts' raw scores for one utterance, checked against its
    aggregated `scores.json` words so word and phone positions line up.

    Returns `{"sentence": {key: [5 scores]}, "words": [{"accuracy": [...],
    "stress": [...], "phones-accuracy": [[5 scores] per canonical phone]}]}`.
    """

    def check_count(values: list, what: str) -> list:
        if len(values) != RATER_COUNT:
            raise ValueError(f"{utt_id}: {what} has {len(values)} rater scores, not {RATER_COUNT}")
        return values

    sentence = {
        key: check_count(detail[key], key)
        for key in ("accuracy", "fluency", "prosodic", "completeness")
    }
    if len(detail["words"]) != len(words):
        raise ValueError(
            f"{utt_id}: scores-detail.json has {len(detail['words'])} words, "
            f"scores.json has {len(words)}"
        )

    rater_words = []
    for index, (detail_word, word) in enumerate(zip(detail["words"], words)):
        if detail_word["text"] != word["text"]:
            raise ValueError(
                f"{utt_id} word {index}: {detail_word['text']!r} != {word['text']!r}"
            )
        per_rater = [
            parse_rater_phones(notation)
            for notation in check_count(detail_word["phones"], f"word {index} phones")
        ]
        phone_count = len(word["phones-accuracy"])
        if any(len(scores) != phone_count for scores in per_rater):
            raise ValueError(
                f"{utt_id} word {index}: rater phone counts {[len(s) for s in per_rater]} "
                f"!= {phone_count} canonical phones"
            )
        rater_words.append(
            {
                "accuracy": check_count(detail_word["accuracy"], f"word {index} accuracy"),
                "stress": check_count(detail_word["stress"], f"word {index} stress"),
                "phones-accuracy": [list(scores) for scores in zip(*per_rater)],
            }
        )
    return {"sentence": sentence, "words": rater_words}


def utt_id_from_sample_id(sample_id: str) -> str:
    """`SPEAKER0001_000010011` -> `000010011`."""
    return sample_id.partition("_")[2]


def attach_rater_scores(records: list[ManifestRecord], corpus_dir: Path) -> None:
    """Add `scores["raters"]` (see `rater_scores`) to every record in place."""
    detail = _load_rater_detail(corpus_dir)
    for record in records:
        utt_id = utt_id_from_sample_id(record.sample_id)
        if utt_id not in detail:
            raise ValueError(f"{record.sample_id}: no entry in scores-detail.json")
        record.scores["raters"] = rater_scores(utt_id, detail[utt_id], record.scores["words"])


def stratified_validation_speakers(
    train_utterances: dict[str, dict],
    *,
    ratio: float = DEFAULT_VALIDATION_RATIO,
    seed: int = DEFAULT_SPLIT_SEED,
) -> list[str]:
    """Deterministically select ~`ratio` of official-train speakers as validation,
    stratified by (age_group, gender) so both strata are proportionally represented.
    """
    speakers: dict[str, SpeakerMeta] = {}
    for utt in train_utterances.values():
        speakers.setdefault(
            utt["speaker_id"], SpeakerMeta(utt["speaker_id"], utt["age_group"], utt["gender"])
        )

    strata: dict[tuple[str, str], list[str]] = defaultdict(list)
    for meta in speakers.values():
        strata[(meta.age_group, meta.gender)].append(meta.speaker_id)

    validation_speakers: list[str] = []
    rng = random.Random(seed)
    for stratum_key in sorted(strata):
        speaker_ids = sorted(strata[stratum_key])
        rng.shuffle(speaker_ids)
        count = max(1, round(len(speaker_ids) * ratio)) if speaker_ids else 0
        validation_speakers.extend(speaker_ids[:count])

    return sorted(validation_speakers)


def build_manifest(
    corpus_dir: Path,
    *,
    dataset_version: str,
    source_url: str,
    validation_speakers: set[str],
    code_version: str,
) -> list[ManifestRecord]:
    train_utterances = _load_split(corpus_dir, "train")
    test_utterances = _load_split(corpus_dir, "test")
    scores = _load_scores(corpus_dir)
    generated_at = datetime.now(UTC).isoformat()

    source = SourceInfo(
        origin="openslr",
        resource_id=RESOURCE_ID,
        url=source_url,
        license=LICENSE,
        citation=CITATION,
    )

    records: list[ManifestRecord] = []
    for official_split, utterances in (("train", train_utterances), ("test", test_utterances)):
        for utt_id, utt in utterances.items():
            partition = (
                "validation"
                if official_split == "train" and utt["speaker_id"] in validation_speakers
                else official_split
            )
            score_entry = dict(scores.get(utt_id, {}))
            words = score_entry.pop("words", [])

            wav_path = utt["wav_path"]
            audio = AudioInfo(
                relative_path=str(wav_path.relative_to(corpus_dir)),
                sha256=_sha256_file(wav_path),
                duration_sec=_wav_duration_seconds(wav_path),
                sample_rate=_wav_sample_rate(wav_path),
            )

            records.append(
                ManifestRecord(
                    sample_id=f"SPEAKER{utt['speaker_id']}_{utt_id}",
                    dataset="speechocean762",
                    dataset_version=dataset_version,
                    source=source,
                    speaker_id=utt["speaker_id"],
                    speaker_age_group=utt["age_group"],
                    speaker_gender=utt["gender"],
                    official_split=official_split,
                    partition=partition,
                    consent_class="public_licensed_corpus",
                    audio=audio,
                    text_reference=utt["text_reference"],
                    scores={"sentence": score_entry, "words": words},
                    derivation=DerivationInfo(code_version=code_version, generated_at=generated_at),
                )
            )
    attach_rater_scores(records, corpus_dir)
    return records


def _wav_duration_seconds(path: Path) -> float:
    import soundfile as sf

    info = sf.info(str(path))
    return info.frames / info.samplerate


def _wav_sample_rate(path: Path) -> int:
    import soundfile as sf

    return sf.info(str(path)).samplerate


def _git_commit_sha(repo_root: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.data.speechocean")
    subparsers = parser.add_subparsers(dest="command", required=True)

    dl_parser = subparsers.add_parser("download", help="Download and extract speechocean762")
    dl_parser.add_argument("--raw-root", type=Path, required=True)

    manifest_parser = subparsers.add_parser(
        "build-manifest", help="Build the Speech Dataset Manifest"
    )
    manifest_parser.add_argument("--raw-root", type=Path, required=True)
    manifest_parser.add_argument("--out", type=Path, required=True)
    manifest_parser.add_argument("--validation-ratio", type=float, default=DEFAULT_VALIDATION_RATIO)
    manifest_parser.add_argument("--split-seed", type=int, default=DEFAULT_SPLIT_SEED)

    raters_parser = subparsers.add_parser(
        "attach-raters",
        help="Add the five experts' raw scores to an existing manifest, in place",
    )
    raters_parser.add_argument("--raw-root", type=Path, required=True)
    raters_parser.add_argument("--manifest", type=Path, required=True)

    audit_parser = subparsers.add_parser(
        "audit-leakage", help="Audit an existing manifest for leakage"
    )
    audit_parser.add_argument("--manifest", type=Path, required=True)

    args = parser.parse_args(argv)

    if args.command == "download":
        corpus_dir, sha256 = download(args.raw_root)
        print(f"OK: extracted to {corpus_dir}")
        print(f"  sha256: {sha256}")
        return 0

    if args.command == "build-manifest":
        corpus_dir, sha256 = download(args.raw_root)
        train_utterances = _load_split(corpus_dir, "train")
        validation_speakers = set(
            stratified_validation_speakers(
                train_utterances, ratio=args.validation_ratio, seed=args.split_seed
            )
        )
        repo_root = Path(__file__).resolve().parents[4]
        try:
            code_version = _git_commit_sha(repo_root)
        except Exception:  # noqa: BLE001 - reproducibility metadata, not fatal
            code_version = "unknown"

        source_url = MIRRORS[0]
        records = build_manifest(
            corpus_dir,
            dataset_version=sha256,
            source_url=source_url,
            validation_speakers=validation_speakers,
            code_version=code_version,
        )
        write_jsonl(args.out, records)
        result = audit_leakage(records)
        print(f"OK: wrote {len(records)} records to {args.out}")
        print(f"  validation speakers: {len(validation_speakers)}")
        print(f"  leakage audit: {'PASS' if result.ok else 'FAIL'}")
        for violation in result.violations:
            print(f"    - {violation}")
        return 0 if result.ok else 1

    if args.command == "attach-raters":
        from echolingo_speech.data.manifest import read_jsonl

        corpus_dir, _ = download(args.raw_root)
        records = read_jsonl(args.manifest)
        attach_rater_scores(records, corpus_dir)
        write_jsonl(args.manifest, records)
        print(f"OK: attached rater scores to {len(records)} records in {args.manifest}")
        return 0

    if args.command == "audit-leakage":
        from echolingo_speech.data.manifest import read_jsonl

        records = read_jsonl(args.manifest)
        result = audit_leakage(records)
        print(f"leakage audit: {'PASS' if result.ok else 'FAIL'} ({len(records)} records)")
        for violation in result.violations:
            print(f"  - {violation}")
        return 0 if result.ok else 1

    return 1


if __name__ == "__main__":
    raise SystemExit(_cli())
