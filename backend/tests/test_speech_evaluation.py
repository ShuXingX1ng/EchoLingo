"""
Tests for the speech evaluation seam and POST /api/pte/spoken-feedback.

The Speech Evaluation Worker, Azure and the feedback graph are substituted;
no network or SDK is used.
"""

import json

import httpx
import pytest
from unittest.mock import AsyncMock, patch

from models.schemas import SpeechEvaluationResult, WordEvidence
from services import speech_normalization, speech_worker
from services.azure_speech import (
    AssessedSegment,
    PhonemeAssessment,
    PronunciationAssessmentResult,
    WordAssessment,
    combine_segments,
)
from services.speech_evaluation import (
    evaluate_spoken_response,
    from_azure,
    from_echolingo,
    provider_for,
    word_disagreements,
)
from services.speech_worker import SpeechProviderError

AZURE_RESULT = PronunciationAssessmentResult(
    score=85,
    accuracyScore=82,
    fluencyScore=88,
    completenessScore=91,
    words=[
        WordAssessment(
            word="cities", score=90, accuracyScore=90, errorType="None",
            phonemes=[PhonemeAssessment(phoneme="s", score=95, accuracyScore=95)],
        ),
        WordAssessment(word="grow", score=40, accuracyScore=40, errorType="Mispronunciation"),
        WordAssessment(word="when", score=0, accuracyScore=0, errorType="Omission"),
        WordAssessment(word="um", score=0, accuracyScore=0, errorType="Insertion"),
    ],
    summary="Good pronunciation with minor areas for improvement.",
    recognizedText="Cities grow.",
)

BUNDLE_ID = "speech-evaluator-v0.1.0"


def _level(status="available", reason=None):
    return {"status": status, "reason": reason}


def _worker_result(**overrides) -> dict:
    """A Speech Evaluation Worker result (`worker/schema.py::EvaluationResult`)."""
    result = {
        "bundle_id": BUNDLE_ID,
        "task_type": "read_aloud",
        "duration_sec": 3.2,
        "reference_text": "cities grow when people move",
        "recognized_text": "cities grow when people move",
        "reference_word_coverage": 1.0,
        "reference_character_coverage": 1.0,
        "reference_character_coverage_corrected": 1.0,
        "evidence_status": {"sentence": _level(), "word": _level(), "phoneme": _level()},
        "sentence": {"accuracy": 7.5, "fluency": 8.0, "prosodic": 7.8, "completeness": 9.9},
        "words": [
            {"index": 0, "text": "cities", "start_sec": 0.1, "end_sec": 0.6, "status": "scored",
             "accuracy": 9.0, "is_error": False, "stress_correct_probability": 0.9,
             "phonemes": [{"phone": "S", "start_sec": 0.1, "end_sec": 0.2,
                           "accuracy": 1.5, "is_error": False}]},
            {"index": 1, "text": "grow", "start_sec": 0.6, "end_sec": 0.9, "status": "scored",
             "accuracy": 4.0, "is_error": True, "stress_correct_probability": 0.8,
             "phonemes": []},
            {"index": 2, "text": "when", "start_sec": 0.9, "end_sec": 1.1, "status": "scored",
             "accuracy": 8.0, "is_error": False, "stress_correct_probability": 0.8,
             "phonemes": []},
        ],
        "warnings": [],
        "timing": {"decode_ms": 1, "encoder_ms": 70, "alignment_ms": 2900,
                   "scoring_ms": 6, "total_ms": 2977},
    }
    result.update(overrides)
    return result


# Identity maps except oral fluency (+0.5): the display arithmetic stays
# checkable by hand.
CALIBRATION = {
    "bundleId": BUNDLE_ID,
    "createdAt": "2026-10-25T00:00:00+00:00",
    "fittedOn": "test",
    "labelScale": {"sentence": 10.0, "word": 10.0, "phone": 2.0},
    "sentence": {"pronunciation": {"slope": 1.0, "intercept": 0.0},
                 "oral_fluency": {"slope": 1.0, "intercept": 0.5}},
    "word": {"slope": 1.0, "intercept": 0.0},
    "phone": {"slope": 1.0, "intercept": 0.0},
}


@pytest.fixture(autouse=True)
def calibration_dir(tmp_path, monkeypatch):
    (tmp_path / f"{BUNDLE_ID}.json").write_text(json.dumps(CALIBRATION), encoding="utf-8")
    monkeypatch.setattr(speech_normalization, "CALIBRATION_DIR", tmp_path)
    speech_normalization.load_calibration.cache_clear()
    yield tmp_path
    speech_normalization.load_calibration.cache_clear()


@pytest.fixture(autouse=True)
def azure_configured():
    with patch("services.azure_speech.azure_speech_service.is_configured", return_value=True):
        yield


FEEDBACK = {
    "summary": "Clear reading.",
    "strengths": [],
    "weaknesses": [],
    "suggestions": [],
    "dimensionScores": {"section": "speaking", "fluency": 88, "pronunciation": 82, "content": 91},
}


def _assess(**kwargs):
    return patch(
        "services.azure_speech.azure_speech_service.assess_pronunciation",
        new_callable=AsyncMock,
        **kwargs,
    )


def _worker(**kwargs):
    return patch("services.speech_worker.evaluate", new_callable=AsyncMock, **kwargs)


def _form(**overrides) -> dict:
    data = {"taskType": "read_aloud", "stimulus": "Cities grow when people move."}
    data.update(overrides)
    return data


AUDIO = {"audio": ("recording.wav", b"RIFF-audio", "audio/wav")}


# ── Azure adapter ─────────────────────────────────────────────────────────────

def test_azure_scores_map_onto_the_neutral_dimensions():
    result = from_azure(AZURE_RESULT)

    assert (result.provider, result.scale) == ("azure", "0-100")
    assert (result.pronunciation, result.oralFluency, result.content) == (82, 88, 91)
    assert result.overallScore == 85
    assert result.recognizedText == "Cities grow."


def test_azure_never_supplies_a_spoken_task_score_estimate():
    assert from_azure(AZURE_RESULT).taskScoreEstimate is None


def test_azure_word_errors_become_neutral_word_statuses():
    words = from_azure(AZURE_RESULT).words

    assert [(w.word, w.status) for w in words] == [
        ("cities", "correct"),
        ("grow", "mispronounced"),
        ("when", "omitted"),
        ("um", "inserted"),
    ]
    assert words[0].phonemes[0].model_dump() == {"phoneme": "s", "score": 95}


def test_evidence_status_reflects_what_azure_returned():
    status = from_azure(AZURE_RESULT).evidenceStatus
    assert (status.sentence.status, status.word.status, status.phoneme.status) == (
        "available", "available", "available",
    )
    bare = from_azure(AZURE_RESULT.model_copy(update={"words": []})).evidenceStatus
    assert (bare.word.status, bare.phoneme.status) == ("unavailable", "unavailable")


def test_the_neutral_result_carries_no_provider_field_names():
    azure = json.dumps(from_azure(AZURE_RESULT).model_dump())
    for name in ("accuracyScore", "fluencyScore", "completenessScore", "errorType"):
        assert name not in azure
    echolingo = json.dumps(from_echolingo(_worker_result()).model_dump())
    for name in ("bundle_id", "is_error", "evidence_status", "reference_character_coverage"):
        assert name not in echolingo


def _segment(score, fluency, duration, words, text="x"):
    return AssessedSegment(score=score, accuracy=score, fluency=fluency, completeness=100,
                           duration_sec=duration, text=text, words=words)


def _azure_word(word, error="None", score=90):
    return WordAssessment(word=word, score=score, accuracyScore=score, errorType=error)


def test_one_azure_utterance_keeps_azure_scores():
    combined = combine_segments([_segment(81.6, 70, 3.0, [_azure_word("cities")], "Cities.")])

    assert (combined.score, combined.accuracyScore, combined.fluencyScore,
            combined.completenessScore) == (82, 82, 70, 100)
    assert combined.recognizedText == "Cities."


def test_several_azure_utterances_are_combined_over_the_whole_passage():
    first = _segment(90, 80, 6.0, [_azure_word("cities"), _azure_word("grow")], "Cities grow.")
    second = _segment(60, 50, 2.0, [_azure_word("when", "Omission", 0),
                                    _azure_word("um", "Insertion", 0),
                                    _azure_word("people", score=60)], "People.")
    combined = combine_segments([first, second])

    assert combined.score == 75                  # (90×2 + 60×2) / 4 assessed words
    assert combined.fluencyScore == 72           # (80×6 + 50×2) / 8 s
    assert combined.completenessScore == 75      # "when" omitted of 4 reference words
    assert [w.word for w in combined.words] == ["cities", "grow", "when", "um", "people"]
    assert combined.recognizedText == "Cities grow. People."


# ── EchoLingo adapter ─────────────────────────────────────────────────────────

def test_echolingo_scores_are_normalized_onto_10_to_90():
    result = from_echolingo(_worker_result())

    assert (result.provider, result.scale, result.modelId) == ("echolingo", "10-90", BUNDLE_ID)
    assert result.pronunciation == 70        # 10 + 80 × 7.5/10
    assert result.oralFluency == 78          # 10 + 80 × (8.0 + 0.5)/10
    assert result.content == 90              # every letter of the reference heard
    assert result.taskScoreEstimate == 77    # 0.4 × 70 + 0.4 × 78 + 0.2 × 90
    assert result.overallScore is None


def test_the_task_score_is_40_40_20_capped_by_content():
    assert speech_normalization.task_score(70, 78, 90) == 77
    assert speech_normalization.task_score(90, 90, 20) == 50   # capped at content + 30
    assert speech_normalization.task_score(10, 10, 10) == 10


def test_echolingo_words_keep_their_judgement_and_scale():
    words = from_echolingo(_worker_result()).words

    assert [(w.word, w.status, w.score) for w in words] == [
        ("cities", "correct", 82), ("grow", "mispronounced", 42), ("when", "correct", 74),
    ]
    assert words[0].phonemes[0].model_dump() == {"phoneme": "S", "score": 70}


def test_a_passage_that_was_not_read_gets_the_minimum_everywhere():
    withheld = _level("unavailable", "reference_not_read")
    result = from_echolingo(_worker_result(
        recognized_text="something else entirely",
        reference_character_coverage_corrected=0.02,
        evidence_status={"sentence": _level("degraded", "reference_not_read"),
                         "word": withheld, "phoneme": withheld},
        words=[],
    ))

    assert (result.taskScoreEstimate, result.pronunciation, result.oralFluency,
            result.content) == (10, 10, 10, 10)
    assert result.evidenceStatus.word.reason == "reference_not_read"
    assert result.words == []


def test_degraded_sentence_scores_are_not_shown():
    failed = _level("unavailable", "alignment_failed")
    result = from_echolingo(_worker_result(
        evidence_status={"sentence": _level("degraded", "alignment_failed"),
                         "word": failed, "phoneme": failed},
        words=[],
    ))

    assert (result.pronunciation, result.oralFluency, result.taskScoreEstimate) == (
        None, None, None,
    )
    assert result.content == 90
    assert result.evidenceStatus.sentence.status == "degraded"


def test_an_out_of_vocabulary_word_is_not_scored():
    oov = {"index": 3, "text": "zorblax", "start_sec": 1.1, "end_sec": 1.5,
           "status": "out_of_vocabulary", "accuracy": None, "is_error": None,
           "stress_correct_probability": None, "phonemes": []}
    partial = _level("partial", "out_of_vocabulary")
    result = from_echolingo(_worker_result(
        words=[*_worker_result()["words"], oov],
        evidence_status={"sentence": _level(), "word": partial, "phoneme": partial},
    ))

    assert result.words[-1].model_dump() == {
        "word": "zorblax", "score": None, "status": "not_scored", "phonemes": None,
        "startSec": 1.1, "endSec": 1.5,
    }
    assert result.taskScoreEstimate is not None


def test_echolingo_words_keep_where_the_worker_aligned_them():
    result = from_echolingo(_worker_result())
    assert [(w.word, w.startSec, w.endSec) for w in result.words] == [
        ("cities", 0.1, 0.6), ("grow", 0.6, 0.9), ("when", 0.9, 1.1),
    ]


def test_echolingo_fluency_events_are_carried_over():
    pause = {"kind": "pause", "start_sec": 0.6, "end_sec": 1.4, "word_index": 0,
             "at_sentence_boundary": False}
    result = from_echolingo(_worker_result(fluency_events=[pause]))
    assert [e.model_dump() for e in result.fluencyEvents] == [{
        "kind": "pause", "startSec": 0.6, "endSec": 1.4, "wordIndex": 0,
        "atSentenceBoundary": False,
    }]
    # A Worker from before M6 reports none.
    assert from_echolingo(_worker_result()).fluencyEvents == []


def test_echolingo_reading_errors_are_carried_over_and_mark_omitted_words():
    omitted = {"kind": "omitted", "word_index": 1, "start_sec": 0.6, "end_sec": 0.65}
    inserted = {"kind": "inserted", "word_index": 1, "start_sec": 0.7, "end_sec": 0.9,
                "heard": "big"}
    result = from_echolingo(_worker_result(reading_errors=[omitted, inserted]))

    assert [e.model_dump() for e in result.readingErrors] == [
        {"kind": "omitted", "wordIndex": 1, "startSec": 0.6, "endSec": 0.65, "heard": None},
        {"kind": "inserted", "wordIndex": 1, "startSec": 0.7, "endSec": 0.9, "heard": "big"},
    ]
    grow = result.words[1]
    assert (grow.status, grow.score, grow.phonemes) == ("omitted", None, None)
    assert [w.status for w in result.words] == ["correct", "omitted", "correct"]
    # A Worker from before M6 reports none.
    assert from_echolingo(_worker_result()).readingErrors == []


def test_azure_words_have_no_timing():
    assert all(w.startSec is None and w.endSec is None for w in from_azure(AZURE_RESULT).words)


def test_content_falls_with_the_corrected_coverage():
    floor = speech_normalization.CONTENT_FLOOR_COVERAGE
    full = speech_normalization.CONTENT_FULL_COVERAGE

    assert speech_normalization.content_score(floor) == 10
    assert speech_normalization.content_score(full) == 90
    assert speech_normalization.content_score((floor + full) / 2) == 50
    assert speech_normalization.content_score(0.0) == 10


@pytest.mark.anyio
async def test_a_bundle_without_normalization_is_not_scored():
    with _worker(return_value=_worker_result(bundle_id="speech-evaluator-v9.9.9")):
        with pytest.raises(SpeechProviderError) as raised:
            await provider_for("read_aloud").evaluate(b"audio", "Cities grow.")

    assert raised.value.code == "calibration_missing"


def test_a_bundle_id_cannot_name_a_file_outside_the_calibrations(calibration_dir):
    (calibration_dir.parent / "outside.json").write_text(
        json.dumps({**CALIBRATION, "bundleId": "../outside"}), encoding="utf-8"
    )
    with pytest.raises(speech_normalization.CalibrationMissing):
        speech_normalization.load_calibration("../outside")


def test_a_calibration_that_is_not_increasing_is_refused(calibration_dir):
    bad = {**CALIBRATION, "bundleId": "bad", "word": {"slope": -1.0, "intercept": 10.0}}
    (calibration_dir / "bad.json").write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(ValueError):
        speech_normalization.load_calibration("bad")


# ── Worker client ─────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_the_worker_client_posts_the_recording_and_returns_its_result():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = request.content
        return httpx.Response(200, json=_worker_result())

    result = await speech_worker.evaluate(
        b"RIFF-audio", "Cities grow.", transport=httpx.MockTransport(handler)
    )

    assert result["bundle_id"] == BUNDLE_ID
    assert seen["url"] == "http://localhost:8100/v1/evaluate"
    assert b'name="reference_text"' in seen["body"] and b"Cities grow." in seen["body"]
    assert b"RIFF-audio" in seen["body"]


def _raise(exc):
    def handler(request):
        raise exc
    return handler


@pytest.mark.anyio
@pytest.mark.parametrize("handler, code", [
    (lambda r: httpx.Response(422, json={"error": {"code": "no_speech", "message": "silent"}}),
     "no_speech"),
    (lambda r: httpx.Response(503, json={"error": {"code": "worker_busy", "message": "busy"}}),
     "worker_busy"),
    (lambda r: httpx.Response(500, text="boom"), "worker_error"),
    (_raise(httpx.ConnectError("refused")), "worker_unavailable"),
    (_raise(httpx.ReadTimeout("slow")), "timeout"),
])
async def test_every_worker_failure_has_a_code(handler, code):
    with pytest.raises(SpeechProviderError) as raised:
        await speech_worker.evaluate(b"a", "b", transport=httpx.MockTransport(handler))

    assert raised.value.code == code


# ── Provider selection ────────────────────────────────────────────────────────

def test_read_aloud_is_evaluated_by_echolingo_and_repeat_sentence_by_azure():
    assert provider_for("read_aloud").name == "echolingo"
    assert provider_for("repeat_sentence").name == "azure"
    assert provider_for("describe_image") is None
    assert provider_for("write_essay") is None
    assert provider_for("not_a_task") is None


@pytest.mark.anyio
async def test_an_echolingo_failure_is_reported_and_azure_is_not_called():
    with _worker(side_effect=SpeechProviderError("worker_unavailable", "down")), \
         _assess(return_value=AZURE_RESULT) as assess:
        spoken = await evaluate_spoken_response("read_aloud", b"audio", "Hello.")

    assert spoken.result is None
    assert (spoken.error.provider, spoken.error.code) == ("echolingo", "worker_unavailable")
    assert spoken.comparison is None
    assess.assert_not_awaited()


@pytest.mark.anyio
async def test_an_empty_recording_is_not_sent_to_the_provider():
    with _worker() as worker:
        spoken = await evaluate_spoken_response("read_aloud", b"", "Hello.")

    assert spoken.result is None and spoken.error.code == "invalid_request"
    worker.assert_not_awaited()


@pytest.mark.anyio
async def test_an_unconfigured_azure_is_a_reported_failure():
    with patch("services.azure_speech.azure_speech_service.is_configured", return_value=False):
        spoken = await evaluate_spoken_response("repeat_sentence", b"audio", "Hello.")

    assert (spoken.error.provider, spoken.error.code) == ("azure", "not_configured")


# ── Comparison ────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_compare_runs_both_providers_and_keeps_echolingo_primary():
    with _worker(return_value=_worker_result()), _assess(return_value=AZURE_RESULT):
        spoken = await evaluate_spoken_response("read_aloud", b"audio", "Hello.", "compare")

    assert spoken.result.provider == "echolingo"
    comparison = spoken.comparison
    assert comparison.baseline.provider == "azure"
    assert comparison.baselineError is None
    # pronunciation: EchoLingo 70 is 75% of the 10–90 range, Azure 82 is 82%.
    assert comparison.differences == {"pronunciation": -7.0, "oralFluency": -3.0, "content": 9.0}
    assert set(comparison.latencyMs) == {"echolingo", "azure"}
    assert len(comparison.recordingSha256) == 64
    assert [d.model_dump() for d in comparison.wordDisagreements] == [
        {"word": "when", "echolingo": "correct", "azure": "omitted"},
    ]


@pytest.mark.anyio
async def test_compare_returns_a_partial_result_when_azure_fails():
    with _worker(return_value=_worker_result()), _assess(side_effect=ValueError("no match")):
        spoken = await evaluate_spoken_response("read_aloud", b"audio", "Hello.", "compare")

    assert spoken.result.provider == "echolingo"
    assert spoken.comparison.baseline is None
    assert spoken.comparison.baselineError.code == "provider_error"
    assert spoken.comparison.differences == {
        "pronunciation": None, "oralFluency": None, "content": None,
    }


@pytest.mark.anyio
async def test_compare_never_promotes_azure_when_echolingo_fails():
    with _worker(side_effect=SpeechProviderError("timeout", "slow")), \
         _assess(return_value=AZURE_RESULT):
        spoken = await evaluate_spoken_response("read_aloud", b"audio", "Hello.", "compare")

    assert spoken.result is None
    assert spoken.error.code == "timeout"
    assert spoken.comparison.baseline.provider == "azure"


def test_word_disagreements_pair_words_by_text_in_order():
    ours = [WordEvidence(word="cities", score=80),
            WordEvidence(word="grow", score=40, status="mispronounced"),
            WordEvidence(word="when", status="not_scored")]
    theirs = [WordEvidence(word="Cities", score=40, status="mispronounced"),
              WordEvidence(word="uh", score=0, status="inserted"),
              WordEvidence(word="grow", score=90),
              WordEvidence(word="when", score=0, status="omitted")]

    assert [(d.word, d.echolingo, d.azure) for d in word_disagreements(ours, theirs)] == [
        ("cities", "correct", "mispronounced"), ("grow", "mispronounced", "correct"),
    ]


# ── POST /api/pte/spoken-feedback ─────────────────────────────────────────────

@pytest.mark.anyio
async def test_spoken_feedback_evaluates_read_aloud_with_echolingo(client):
    with _worker(return_value=_worker_result()) as worker, _assess() as assess, \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.return_value = {**FEEDBACK, "speechEvaluation": {"provider": "echolingo"}}
        response = await client.post(
            "/api/pte/spoken-feedback",
            files=AUDIO,
            data=_form(transcript="cities glow", historicalWeaknesses='{"fluency": 55}'),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == "cities grow when people move"
    assert body["speechEvaluation"]["provider"] == "echolingo"
    assert body["speechEvaluation"]["taskScoreEstimate"] == 77
    assert body["speechEvaluationError"] is None
    assert body["speechEvaluationComparison"] is None
    worker.assert_awaited_once_with(b"RIFF-audio", "Cities grow when people move.")
    assess.assert_not_awaited()

    request = graph.await_args.args[0]
    assert request.response == "cities grow when people move"
    assert request.historicalWeaknesses == {"fluency": 55}
    evaluation = graph.await_args.kwargs["speech_evaluation"]
    assert SpeechEvaluationResult(**evaluation).content == 90
    # The practice summary comes from the evaluation, not the LLM.
    assert body["speechEvaluation"]["practiceSummary"] == evaluation["practiceSummary"] == [
        {"kind": "mispronounced", "count": 1, "wordIndices": [1], "words": ["grow"]}]


@pytest.mark.anyio
async def test_repeat_sentence_keeps_azure(client):
    with _worker() as worker, _assess(return_value=AZURE_RESULT) as assess, \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.return_value = FEEDBACK
        response = await client.post(
            "/api/pte/spoken-feedback", files=AUDIO,
            data=_form(taskType="repeat_sentence", stimulus="Cities grow."),
        )

    assert response.status_code == 200
    assert response.json()["speechEvaluation"]["provider"] == "azure"
    assess.assert_awaited_once_with(audio_data=b"RIFF-audio", reference_text="Cities grow.")
    worker.assert_not_awaited()


@pytest.mark.anyio
async def test_a_failed_evaluation_is_reported_and_feedback_uses_the_browser_transcript(client):
    with _worker(side_effect=SpeechProviderError("worker_unavailable", "down")), \
         _assess() as assess, \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.return_value = FEEDBACK
        response = await client.post(
            "/api/pte/spoken-feedback", files=AUDIO, data=_form(transcript="cities glow"),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == "cities glow"
    assert body["speechEvaluation"] is None
    assert body["speechEvaluationError"]["code"] == "worker_unavailable"
    assert body["feedback"]["speechEvaluationError"]["provider"] == "echolingo"
    assert graph.await_args.kwargs["speech_evaluation"] is None
    assess.assert_not_awaited()


@pytest.mark.anyio
async def test_compare_mode_returns_the_comparison_and_saves_it_with_the_feedback(client):
    with _worker(return_value=_worker_result()), _assess(return_value=AZURE_RESULT), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.return_value = FEEDBACK
        response = await client.post(
            "/api/pte/spoken-feedback", files=AUDIO, data=_form(evaluationMode="compare"),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["speechEvaluation"]["provider"] == "echolingo"
    assert body["speechEvaluationComparison"]["baseline"]["provider"] == "azure"
    assert body["feedback"]["speechEvaluationComparison"]["recordingSha256"]
    # Feedback is written from the primary result only.
    assert graph.await_args.kwargs["speech_evaluation"]["provider"] == "echolingo"


@pytest.mark.anyio
@pytest.mark.parametrize("task_type, mode", [
    ("read_aloud", "azure"), ("read_aloud", "shadow"), ("repeat_sentence", "compare"),
])
async def test_spoken_feedback_rejects_an_invalid_evaluation_mode(client, task_type, mode):
    with _worker() as worker:
        response = await client.post(
            "/api/pte/spoken-feedback", files=AUDIO,
            data=_form(taskType=task_type, evaluationMode=mode),
        )

    assert response.status_code == 400
    assert "evaluationMode" in response.json()["detail"]
    worker.assert_not_awaited()


@pytest.mark.anyio
async def test_an_evaluated_recording_is_returned_even_when_feedback_fails(client):
    with _worker(return_value=_worker_result()), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.side_effect = RuntimeError("LLM down")
        response = await client.post("/api/pte/spoken-feedback", files=AUDIO, data=_form())

    assert response.status_code == 200
    body = response.json()
    assert body["feedback"] is None
    assert body["speechEvaluation"]["taskScoreEstimate"] == 77


@pytest.mark.anyio
async def test_a_failed_evaluation_is_still_reported_when_feedback_fails_too(client):
    with _worker(side_effect=SpeechProviderError("timeout", "slow")), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.side_effect = RuntimeError("LLM down")
        response = await client.post(
            "/api/pte/spoken-feedback", files=AUDIO, data=_form(transcript="cities glow"),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["feedback"] is None and body["speechEvaluation"] is None
    assert body["speechEvaluationError"]["code"] == "timeout"


@pytest.mark.anyio
async def test_a_broken_worker_result_is_reported_when_feedback_fails_too(client):
    with _worker(return_value=_worker_result()), \
         patch("services.speech_evaluation.from_echolingo", side_effect=KeyError("x")), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.side_effect = RuntimeError("LLM down")
        response = await client.post(
            "/api/pte/spoken-feedback", files=AUDIO, data=_form(transcript="cities glow"),
        )

    # The evaluation failed too (`worker_error`), so its reason is the answer.
    assert response.status_code == 200
    assert response.json()["speechEvaluationError"]["code"] == "worker_error"


@pytest.mark.anyio
async def test_an_empty_recording_is_reported_as_an_evaluation_failure(client):
    response = await client.post(
        "/api/pte/spoken-feedback", files={"audio": ("recording.wav", b"", "audio/wav")},
        data=_form(),
    )

    # An empty recording is an `invalid_request` evaluation failure, not a 400.
    assert response.status_code == 200
    assert response.json()["speechEvaluationError"]["code"] == "invalid_request"


@pytest.mark.anyio
async def test_spoken_feedback_reports_why_there_is_nothing_to_give_feedback_on(client):
    with _worker(side_effect=SpeechProviderError("no_speech", "silent")), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        response = await client.post("/api/pte/spoken-feedback", files=AUDIO, data=_form())

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == ""
    assert body["speechEvaluationError"]["code"] == "no_speech"
    graph.assert_not_awaited()


def test_content_follows_the_gate_the_worker_reports():
    result = from_echolingo(_worker_result(
        reference_character_coverage_corrected=0.30, reference_not_read_below=0.20,
    ))
    # 0.30 is a third of the way from the Worker's 0.20 to full coverage at 0.50.
    assert result.content == 37   # 10 + 80 / 3


@pytest.mark.anyio
@pytest.mark.parametrize("task_type, detail", [
    ("not_a_task", "Invalid taskType"),
    ("describe_image", "has no speech evaluation"),
])
async def test_spoken_feedback_rejects_task_types_without_an_evaluation_flow(client, task_type, detail):
    response = await client.post(
        "/api/pte/spoken-feedback", files=AUDIO, data=_form(taskType=task_type, transcript="hi"),
    )

    assert response.status_code == 400
    assert detail in response.json()["detail"]


@pytest.mark.anyio
async def test_spoken_feedback_rejects_malformed_weaknesses(client):
    response = await client.post(
        "/api/pte/spoken-feedback", files=AUDIO, data=_form(historicalWeaknesses="[1, 2]"),
    )

    assert response.status_code == 400
