"""Non-English recordings through the Worker (roadmap SS7.2, SS18.3 step 7).

The Speech Evaluator Acceptance requires non-English speech to be handled
safely: a learner who reads the passage in another language must get the
minimum result, not English scores. The Worker's `reference_not_read` gate
withholds word evidence below a chance-corrected letter coverage of 0.10,
and FastAPI then gives the minimum everywhere (ADR-0016). Until now the gate
was measured only with English recordings paired with the wrong text.

No labelled non-English learner recordings are available, so this uses
macOS text-to-speech (`say`). Each non-English voice reads a translation
of one English passage; each English voice reads every English passage.
Every recording is evaluated against every passage, which gives three kinds:

- `non_english`: must never get English-looking scores, i.e. Pronunciation,
  Oral Fluency and the task score must be the minimum or left out;
- `english_own`: an English reading of its own passage, must all be scored;
- `english_other`: an English reading of another passage.

Content can still give a translation some credit: below FastAPI's
`SCORED_READING_COVERAGE` only Content is shown, rising from the minimum at
the reading gate.

Synthetic speech is clean and evenly paced, so this checks the gate, not
how a real learner's mixed or accented speech fares.

CLI: `python -m echolingo_speech.evaluation.non_english synthesize|collect|report ...`
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
from datetime import UTC, datetime
from pathlib import Path

PASSAGES = {
    "exercise": (
        "Researchers have found that regular physical activity can improve memory and "
        "attention in older adults. Participants who walked for thirty minutes each day "
        "performed better on cognitive tests than those who remained inactive."
    ),
    "library": (
        "The city council has approved a plan to expand the public library. The new wing "
        "will include study rooms, a reading area for children and a small theatre for "
        "community events."
    ),
    "coffee": (
        "Coffee was first grown in the highlands of Ethiopia. Traders later carried the "
        "beans across the Red Sea, and within two centuries coffee houses had spread "
        "throughout Europe."
    ),
    "online": (
        "Many universities now offer online courses that students can take at their own "
        "pace. Critics argue, however, that learning alone at home makes it harder to "
        "stay motivated."
    ),
}

# Translations of the "exercise" passage, read by a macOS voice of that language.
NON_ENGLISH = {
    "zh_CN": ("Tingting", (
        "研究人员发现，规律的体育锻炼可以改善老年人的记忆力和注意力。每天步行三十分钟的参"
        "与者，在认知测试中的表现比不运动的人更好。"
    )),
    "ja_JP": ("Kyoko", (
        "研究者たちは、定期的な運動が高齢者の記憶力と注意力を向上させることを発見しました"
        "。毎日三十分歩いた参加者は、運動しなかった人よりも認知テストで良い成績を収めまし"
        "た。"
    )),
    "ko_KR": ("Yuna", (
        "연구자들은 규칙적인 신체 활동이 노인의 기억력과 주의력을 향상시킬 수 있다는 "
        "것을 발견했습니다. 매일 삼십 분씩 걸은 참가자들은 활동하지 않은 사람들보다 인지 "
        "검사에서 더 좋은 결과를 보였습니다."
    )),
    "fr_FR": ("Thomas", (
        "Des chercheurs ont découvert qu'une activité physique régulière peut améliorer "
        "la mémoire et l'attention chez les personnes âgées. Les participants qui "
        "marchaient trente minutes par jour ont obtenu de meilleurs résultats aux tests "
        "cognitifs que ceux qui restaient inactifs."
    )),
    "de_DE": ("Anna", (
        "Forscher haben herausgefunden, dass regelmäßige körperliche Aktivität das "
        "Gedächtnis und die Aufmerksamkeit älterer Menschen verbessern kann. Teilnehmer, "
        "die jeden Tag dreißig Minuten spazieren gingen, schnitten bei kognitiven Tests "
        "besser ab als diejenigen, die inaktiv blieben."
    )),
    "es_ES": ("Mónica", (
        "Los investigadores han descubierto que la actividad física regular puede "
        "mejorar la memoria y la atención en los adultos mayores. Los participantes que "
        "caminaron treinta minutos al día obtuvieron mejores resultados en las pruebas "
        "cognitivas que quienes permanecieron inactivos."
    )),
    "it_IT": ("Alice", (
        "I ricercatori hanno scoperto che un'attività fisica regolare può migliorare la "
        "memoria e l'attenzione negli anziani. I partecipanti che camminavano trenta "
        "minuti al giorno hanno ottenuto risultati migliori nei test cognitivi rispetto "
        "a chi rimaneva inattivo."
    )),
    "pt_BR": ("Luciana", (
        "Os pesquisadores descobriram que a atividade física regular pode melhorar a "
        "memória e a atenção em idosos. Os participantes que caminharam trinta minutos "
        "por dia tiveram um desempenho melhor nos testes cognitivos do que aqueles que "
        "permaneceram inativos."
    )),
    "ru_RU": ("Milena", (
        "Исследователи обнаружили, что регулярная физическая активность может улучшить "
        "память и внимание у пожилых людей. Участники, которые каждый день гуляли по "
        "тридцать минут, показали лучшие результаты в когнитивных тестах, чем те, кто "
        "оставался неактивным."
    )),
    "hi_IN": ("Lekha", (
        "शोधकर्ताओं ने पाया है कि नियमित शारीरिक गतिविधि बुजुर्गों की याददाश्त और ध्यान "
        "को बेहतर बना सकती है। जो प्रतिभागी हर दिन तीस मिनट पैदल चले, उन्होंने "
        "संज्ञानात्मक परीक्षणों में निष्क्रिय रहने वालों से बेहतर प्रदर्शन किया।"
    )),
    "ar_001": ("Majed", (
        "وجد الباحثون أن النشاط البدني المنتظم يمكن أن يحسن الذاكرة والانتباه لدى كبار "
        "السن. وقد حقق المشاركون الذين مشوا ثلاثين دقيقة كل يوم نتائج أفضل في الاختبارات "
        "المعرفية من أولئك الذين ظلوا غير نشطين."
    )),
}

ENGLISH_VOICES = {"en_US": "Samantha", "en_GB": "Daniel", "en_IN": "Rishi", "en_AU": "Karen"}

# FastAPI's `speech_normalization.SCORED_READING_COVERAGE`: below it only
# Content is shown.
SCORED_READING_COVERAGE = 0.28


# --- synthesis (macOS only) -------------------------------------------------------


def _say(voice: str, text: str, out: Path) -> None:
    """`text` read by macOS voice `voice`, as 16 kHz mono 16-bit WAV."""
    aiff = out.with_suffix(".aiff")
    subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1",
                    str(aiff), str(out)], check=True)
    aiff.unlink()


def synthesize(out_dir: Path) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    clips = []
    for language, (voice, text) in NON_ENGLISH.items():
        clips.append({"id": f"{language}-exercise", "language": language, "voice": voice,
                      "passage": None, "text": text})
    for language, voice in ENGLISH_VOICES.items():
        for name, text in PASSAGES.items():
            clips.append({"id": f"{language}-{name}", "language": language, "voice": voice,
                          "passage": name, "text": text})
    for clip in clips:
        clip["audio"] = f"{clip['id']}.wav"
        _say(clip["voice"], clip["text"], out_dir / clip["audio"])
    (out_dir / "clips.jsonl").write_text(
        "".join(json.dumps(c, ensure_ascii=False) + "\n" for c in clips), encoding="utf-8")
    return clips


# --- collection -------------------------------------------------------------------


def kind(clip: dict, passage: str) -> str:
    if not clip["language"].startswith("en_"):
        return "non_english"
    return "english_own" if clip["passage"] == passage else "english_other"


def collect(pipeline, clips_dir: Path, out: Path) -> None:
    """Every clip against every passage, as the Worker's request path scores it."""
    from echolingo_speech.worker.pipeline import EvaluationError

    clips = [json.loads(line) for line in
             (clips_dir / "clips.jsonl").read_text(encoding="utf-8").splitlines()]
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for clip in clips:
            audio = (clips_dir / clip["audio"]).read_bytes()
            for passage, reference in PASSAGES.items():
                row = {"clip": clip["id"], "language": clip["language"], "passage": passage,
                       "kind": kind(clip, passage)}
                try:
                    result = pipeline.evaluate(audio, reference)
                except EvaluationError as error:
                    row["error"] = error.code
                else:
                    row.update(
                        recognized=result.recognized_text,
                        coverage_corrected=round(result.reference_character_coverage_corrected, 4),
                        gate=result.reference_not_read_below,
                        word_evidence=result.evidence_status.word.status,
                        word_reason=result.evidence_status.word.reason,
                        sentence_accuracy=result.sentence.accuracy,
                        sentence_fluency=result.sentence.fluency,
                    )
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
                handle.flush()


# --- report -----------------------------------------------------------------------


def unscored(row: dict, scored_coverage: float = SCORED_READING_COVERAGE) -> bool:
    """FastAPI shows no Pronunciation, Oral Fluency or task score above the
    minimum (`speech_evaluation.from_echolingo`): the Worker refused the
    recording, withheld it as `reference_not_read` (every score the minimum)
    or could not align it, or too little of the passage was heard."""
    if "error" in row or row["word_reason"] in ("reference_not_read", "alignment_failed"):
        return True
    return row["coverage_corrected"] < scored_coverage


def report(rows: list[dict]) -> dict:
    kinds = {}
    for name in ("non_english", "english_own", "english_other"):
        group = [r for r in rows if r["kind"] == name]
        coverage = [r["coverage_corrected"] for r in group if "coverage_corrected" in r]
        kinds[name] = {
            "pairs": len(group),
            "unscored": sum(unscored(r) for r in group),
            "by_reason": {reason: sum(r.get("word_reason", r.get("error")) == reason
                                      for r in group)
                          for reason in sorted({str(r.get("word_reason", r.get("error")))
                                                for r in group})},
            "coverage_corrected": None if not coverage else {
                "min": min(coverage), "median": round(statistics.median(coverage), 4),
                "max": max(coverage)},
        }
    by_language = {}
    for row in rows:
        if row["kind"] == "non_english":
            entry = by_language.setdefault(row["language"], {"pairs": 0, "unscored": 0,
                                                             "max_coverage_corrected": 0.0})
            entry["pairs"] += 1
            entry["unscored"] += unscored(row)
            entry["max_coverage_corrected"] = max(entry["max_coverage_corrected"],
                                                  row.get("coverage_corrected", 0.0))
    passes = (kinds["non_english"]["unscored"] == kinds["non_english"]["pairs"]
              and kinds["english_own"]["unscored"] == 0)
    return {
        "created_at": datetime.now(UTC).isoformat(),
        "rule": ("no non-English pair gets Pronunciation, Oral Fluency or a task score above "
                 "the minimum; every English own-passage pair does"),
        "scored_reading_coverage": SCORED_READING_COVERAGE,
        "passes": passes,
        "kinds": kinds,
        "non_english_by_language": by_language,
        "scored_non_english": [r for r in rows if r["kind"] == "non_english" and not unscored(r)],
        "unscored_english_own": [r for r in rows if r["kind"] == "english_own" and unscored(r)],
    }


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.evaluation.non_english")
    commands = parser.add_subparsers(dest="command", required=True)
    synth = commands.add_parser("synthesize", help="macOS only: `say` and `afconvert`")
    synth.add_argument("--out-dir", type=Path, required=True)
    collect_parser = commands.add_parser("collect")
    collect_parser.add_argument("--config", type=Path, required=True, help="speech.yaml")
    collect_parser.add_argument("--clips-dir", type=Path, required=True)
    collect_parser.add_argument("--bundle-id", default=None, help="default: worker_bundle_id")
    collect_parser.add_argument(
        "--mfa-cache-dir", type=Path, default=None,
        help="default: <artifact_root>/mfa-cache-eval, apart from a running Worker's",
    )
    collect_parser.add_argument("--out", type=Path, required=True, help="rows (.jsonl)")
    report_parser = commands.add_parser("report")
    report_parser.add_argument("--rows", type=Path, required=True, help="`collect` output")
    report_parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "synthesize":
        clips = synthesize(args.out_dir)
        print(f"OK: wrote {len(clips)} clips to {args.out_dir}")
        return 0
    if args.command == "report":
        rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines()]
        result = report(rows)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")
        print(f"OK: passes={result['passes']}; wrote {args.out}")
        return 0

    from echolingo_speech.config import load_config
    from echolingo_speech.worker.app import build_pipeline, resolve_bundle_dir

    config = load_config(args.config)
    pipeline, _ = build_pipeline(
        bundle_dir=resolve_bundle_dir(config.artifact_root,
                                      args.bundle_id or config.worker_bundle_id),
        hf_cache_dir=config.artifact_root / "hf-cache",
        mfa_cache_dir=args.mfa_cache_dir or config.artifact_root / "mfa-cache-eval",
    )
    collect(pipeline, args.clips_dir, args.out)
    print(f"OK: wrote rows to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
