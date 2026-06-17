#!/usr/bin/env python3
"""
One-time script: read backend/data/rubrics/*.yaml, embed each dimension's
description text, and upsert into the Supabase rubric_chunks collection.

Run from the backend/ directory:
    python scripts/seed_rubrics.py

Requires env vars: DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL (optional), SUPABASE_DB_URL
"""

import sys
import pathlib
import uuid
import yaml

# Ensure backend/ is on the path when called from repo root
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from services.vector_store import embed_texts, get_vecs_collection

RUBRICS_DIR = pathlib.Path(__file__).parent.parent / "data" / "rubrics"


def load_rubrics() -> list[dict]:
    """Return a flat list of chunk dicts, one per dimension per task type."""
    chunks = []
    for yaml_file in sorted(RUBRICS_DIR.glob("*.yaml")):
        with open(yaml_file, encoding="utf-8") as f:
            doc = yaml.safe_load(f)

        task_type = doc["task_type"]

        # One top-level chunk with the overall scoring notes
        if notes := doc.get("scoring_notes"):
            chunks.append({
                "task_type": task_type,
                "dimension": "_overview",
                "text": f"[{task_type}] Overview: {notes.strip()}",
            })

        # One chunk per scoring dimension
        for dim in doc.get("dimensions", []):
            text_parts = [f"[{task_type}] {dim['name']}: {dim['description'].strip()}"]
            if criteria := dim.get("criteria"):
                lines = [f"  Score {k}: {v}" for k, v in criteria.items()]
                text_parts.append("Scoring criteria:\n" + "\n".join(lines))
            chunks.append({
                "task_type": task_type,
                "dimension": dim["name"],
                "text": "\n".join(text_parts),
            })

    return chunks


def seed():
    chunks = load_rubrics()
    if not chunks:
        print("No rubric files found in", RUBRICS_DIR)
        sys.exit(1)

    print(f"Loaded {len(chunks)} chunks from {RUBRICS_DIR}")

    texts = [c["text"] for c in chunks]
    print("Embedding texts via DashScope…")
    vectors = embed_texts(texts)

    collection = get_vecs_collection()

    records = [
        (
            str(uuid.uuid5(uuid.NAMESPACE_URL, f"{c['task_type']}:{c['dimension']}")),
            vectors[i],
            {"task_type": c["task_type"], "dimension": c["dimension"], "text": c["text"]},
        )
        for i, c in enumerate(chunks)
    ]

    print(f"Upserting {len(records)} records into '{collection.name}'…")
    collection.upsert(records=records)
    collection.create_index()
    print("Done. Vector store seeded successfully.")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(pathlib.Path(__file__).parent.parent / ".env")
    seed()
