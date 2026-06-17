"""
ECDICT Importer

Downloads the open-source ECDICT English→Chinese dictionary from GitHub and
places its SQLite database at backend/data/ecdict.sqlite for the Word Lookup
feature. The data file is gitignored and fetched on first deploy (see ADR 0006).

ECDICT ships a ready-to-use SQLite database inside `ecdict-sqlite-NN.zip`
(table `stardict`, ~770k entries with phonetics, translations and exam tags),
so we simply download, unzip and move it — no CSV parsing required.

Usage:
    python scripts/import_ecdict.py            # download + install if missing
    python scripts/import_ecdict.py --force    # re-download even if present
"""

import argparse
import io
import shutil
import sqlite3
import sys
import urllib.request
import zipfile
from pathlib import Path

ECDICT_TAG = "1.0.28"
ECDICT_ZIP_URL = (
    f"https://github.com/skywind3000/ECDICT/releases/download/"
    f"{ECDICT_TAG}/ecdict-sqlite-{ECDICT_TAG.split('.')[-1]}.zip"
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "ecdict.sqlite"


def _download(url: str) -> bytes:
    print(f"Downloading ECDICT from {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "EchoLingo/1.0"})
    with urllib.request.urlopen(req) as resp:  # noqa: S310 (trusted GitHub URL)
        total = resp.length or 0
        chunks, read = [], 0
        while True:
            chunk = resp.read(1 << 20)  # 1 MiB
            if not chunk:
                break
            chunks.append(chunk)
            read += len(chunk)
            if total:
                pct = read * 100 // total
                print(f"\r  {read >> 20} / {total >> 20} MiB ({pct}%)", end="", flush=True)
        print()
    return b"".join(chunks)


def _extract_db(zip_bytes: bytes, dest: Path) -> None:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        db_name = next((n for n in zf.namelist() if n.endswith(".db")), None)
        if not db_name:
            raise RuntimeError("No .db file found inside the ECDICT zip.")
        print(f"Extracting {db_name} -> {dest}")
        with zf.open(db_name) as src, open(dest, "wb") as out:
            shutil.copyfileobj(src, out)


def _verify(dest: Path) -> None:
    conn = sqlite3.connect(dest)
    try:
        row = conn.execute("SELECT COUNT(*) FROM stardict").fetchone()
        sample = conn.execute(
            "SELECT word, phonetic FROM stardict WHERE word = 'bank'"
        ).fetchone()
    finally:
        conn.close()
    print(f"Imported {row[0]:,} entries. Sample: bank /{sample[1] if sample else '?'}/")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import the ECDICT dictionary.")
    parser.add_argument("--force", action="store_true", help="Re-download even if the DB exists.")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if DB_PATH.exists() and not args.force:
        print(f"ECDICT already present at {DB_PATH}. Use --force to re-download.")
        _verify(DB_PATH)
        return 0

    try:
        zip_bytes = _download(ECDICT_ZIP_URL)
        _extract_db(zip_bytes, DB_PATH)
        _verify(DB_PATH)
    except Exception as exc:  # noqa: BLE001 — surface a clean message to the operator
        print(f"ERROR: ECDICT import failed: {exc}", file=sys.stderr)
        if DB_PATH.exists() and DB_PATH.stat().st_size == 0:
            DB_PATH.unlink()
        return 1

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
