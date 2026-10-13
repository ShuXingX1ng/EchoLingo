"""
Tests for the speech evaluation seam and POST /api/pte/spoken-feedback.

Azure and the feedback graph are substituted; no network or SDK is used.
"""

import json

import pytest
from unittest.mock import AsyncMock, patch

from models.schemas import SpeechEvaluationResult
from services import speech_evaluation
from services.azure_speech import (
    PhonemeAssessment,
    PronunciationAssessmentResult,
    WordAssessment,
)
from services.speech_evaluation import evaluate_spoken_response, from_azure, provider_for

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

FEEDBACK = {
    "summary": "Clear reading.",
    "strengths": [],
    "weaknesses": [],
    "suggestions": [],
    "dimensionScores": {"section": "speaking", "fluency": 88, "pronunciation": 82, "content": 91},
}


def _assess(**kwargs) -> AsyncMock:
    return patch(
        "services.azure_speech.azure_speech_service.assess_pronunciation",
        new_callable=AsyncMock,
        **kwargs,
    )


def _form(**overrides) -> dict:
    data = {"taskType": "read_aloud", "stimulus": "Cities grow when people move."}
    data.update(overrides)
    return data


AUDIO = {"audio": ("recording.wav", b"RIFF-audio", "audio/wav")}


# ── Azure adapter ─────────────────────────────────────────────────────────────

def test_azure_scores_map_onto_the_neutral_dimensions():
    result = from_azure(AZURE_RESULT)

    assert result.provider == "azure"
    assert (result.pronunciation, result.oralFluency, result.content) == (82, 88, 91)
    assert result.overallScore == 85
    assert result.recognizedText == "Cities grow."


def test_azure_never_supplies_a_spoken_task_score_estimate():
    result = from_azure(AZURE_RESULT)

    assert result.taskScoreEstimate is None
    assert result.evidence.taskScoreEstimate is False


def test_azure_word_errors_become_neutral_word_statuses():
    words = from_azure(AZURE_RESULT).words

    assert [(w.word, w.status) for w in words] == [
        ("cities", "correct"),
        ("grow", "mispronounced"),
        ("when", "omitted"),
        ("um", "inserted"),
    ]
    assert words[0].phonemes[0].model_dump() == {"phoneme": "s", "score": 95}


def test_evidence_availability_reflects_what_azure_returned():
    assert from_azure(AZURE_RESULT).evidence.model_dump() == {
        "taskScoreEstimate": False, "words": True, "phonemes": True,
    }
    bare = AZURE_RESULT.model_copy(update={"words": []})
    assert from_azure(bare).evidence.model_dump() == {
        "taskScoreEstimate": False, "words": False, "phonemes": False,
    }


def test_the_neutral_result_carries_no_azure_field_names():
    dumped = json.dumps(from_azure(AZURE_RESULT).model_dump())
    for azure_name in ("accuracyScore", "fluencyScore", "completenessScore", "errorType"):
        assert azure_name not in dumped


# ── Provider selection ────────────────────────────────────────────────────────

def test_only_task_types_with_an_evaluation_flow_have_a_provider():
    assert provider_for("read_aloud").name == "azure"
    assert provider_for("repeat_sentence").name == "azure"
    assert provider_for("describe_image") is None
    assert provider_for("write_essay") is None
    assert provider_for("not_a_task") is None


@pytest.mark.anyio
async def test_a_provider_failure_is_reported_as_no_evaluation():
    with _assess(side_effect=ValueError("Azure is not configured")):
        assert await evaluate_spoken_response("read_aloud", b"audio", "Hello.") is None


@pytest.mark.anyio
async def test_an_empty_recording_is_not_sent_to_the_provider():
    with _assess() as assess:
        assert await evaluate_spoken_response("read_aloud", b"", "Hello.") is None
    assess.assert_not_awaited()


def test_any_object_with_evaluate_can_stand_in_for_the_provider(monkeypatch):
    class Scripted:
        name = "scripted"

        async def evaluate(self, audio, reference_text):
            raise AssertionError("not called here")

    monkeypatch.setattr(speech_evaluation, "_azure", Scripted())
    assert provider_for("read_aloud").name == "scripted"


# ── POST /api/pte/spoken-feedback ─────────────────────────────────────────────

@pytest.mark.anyio
async def test_spoken_feedback_evaluates_first_and_scores_the_recognised_text(client):
    with _assess(return_value=AZURE_RESULT) as assess, \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.return_value = {**FEEDBACK, "speechEvaluation": from_azure(AZURE_RESULT).model_dump()}
        response = await client.post(
            "/api/pte/spoken-feedback",
            files=AUDIO,
            data=_form(transcript="cities glow", historicalWeaknesses='{"fluency": 55}'),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == "Cities grow."
    assert body["speechEvaluation"]["pronunciation"] == 82
    assert body["feedback"]["speechEvaluation"]["oralFluency"] == 88

    assess.assert_awaited_once_with(audio_data=b"RIFF-audio", reference_text="Cities grow when people move.")
    request = graph.await_args.args[0]
    assert request.response == "Cities grow."
    assert request.historicalWeaknesses == {"fluency": 55}
    evaluation = graph.await_args.kwargs["speech_evaluation"]
    assert SpeechEvaluationResult(**evaluation).content == 91


@pytest.mark.anyio
async def test_spoken_feedback_falls_back_to_the_browser_transcript(client):
    with _assess(side_effect=ValueError("Recognition failed")), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.return_value = FEEDBACK
        response = await client.post(
            "/api/pte/spoken-feedback", files=AUDIO, data=_form(transcript="cities glow"),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == "cities glow"
    assert body["speechEvaluation"] is None
    assert body["feedback"]["summary"] == "Clear reading."
    assert graph.await_args.kwargs["speech_evaluation"] is None


@pytest.mark.anyio
async def test_an_evaluated_recording_is_returned_even_when_feedback_fails(client):
    with _assess(return_value=AZURE_RESULT), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.side_effect = RuntimeError("LLM down")
        response = await client.post("/api/pte/spoken-feedback", files=AUDIO, data=_form())

    assert response.status_code == 200
    body = response.json()
    assert body["feedback"] is None
    assert body["speechEvaluation"]["overallScore"] == 85


@pytest.mark.anyio
async def test_spoken_feedback_fails_when_neither_part_succeeds(client):
    with _assess(side_effect=ValueError("Recognition failed")), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        graph.side_effect = RuntimeError("LLM down")
        response = await client.post(
            "/api/pte/spoken-feedback", files=AUDIO, data=_form(transcript="cities glow"),
        )

    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to generate feedback"


@pytest.mark.anyio
async def test_spoken_feedback_needs_some_response_text(client):
    with _assess(side_effect=ValueError("Recognition failed")), \
         patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as graph:
        response = await client.post("/api/pte/spoken-feedback", files=AUDIO, data=_form())

    assert response.status_code == 400
    graph.assert_not_awaited()


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
