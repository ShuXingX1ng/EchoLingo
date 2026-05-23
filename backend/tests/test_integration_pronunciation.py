"""
Integration tests for Pronunciation API - assessment flow, word details, scores.
"""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app
from models.schemas import PronunciationAssessmentResult, WordAssessment


MOCK_RESULT = PronunciationAssessmentResult(
    score=85,
    accuracyScore=82,
    fluencyScore=88,
    completenessScore=91,
    words=[
        WordAssessment(word="hello", score=90, accuracyScore=88, errorType="None"),
        WordAssessment(word="world", score=85, accuracyScore=82, errorType="None"),
    ],
    summary="Good pronunciation with minor areas for improvement.",
)


@pytest.mark.anyio
async def test_pronunciation_full_assessment_flow():
    with patch("services.azure_speech.azure_speech_service.assess_pronunciation", new_callable=AsyncMock) as mock_assess:
        mock_assess.return_value = MOCK_RESULT
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pronunciation",
                files={"audio": ("test.wav", b"fake audio data", "audio/wav")},
                data={"referenceText": "hello world"},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["score"] == 85
    assert data["accuracyScore"] == 82
    assert data["fluencyScore"] == 88
    assert data["completenessScore"] == 91
    assert len(data["words"]) == 2
    assert "summary" in data


@pytest.mark.anyio
async def test_pronunciation_word_level_details():
    with patch("services.azure_speech.azure_speech_service.assess_pronunciation", new_callable=AsyncMock) as mock_assess:
        mock_assess.return_value = MOCK_RESULT
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pronunciation",
                files={"audio": ("test.wav", b"audio", "audio/wav")},
                data={"referenceText": "hello world"},
            )

    data = response.json()
    assert data["words"][0]["word"] == "hello"
    assert data["words"][0]["score"] == 90
    assert data["words"][0]["errorType"] == "None"
    assert data["words"][1]["word"] == "world"
    assert data["words"][1]["score"] == 85


@pytest.mark.anyio
async def test_pronunciation_with_mispronounced_words():
    result_with_errors = PronunciationAssessmentResult(
        score=55,
        accuracyScore=50,
        fluencyScore=60,
        completenessScore=58,
        words=[
            WordAssessment(word="pronunciation", score=40, accuracyScore=35, errorType="Mispronunciation"),
            WordAssessment(word="is", score=90, accuracyScore=88, errorType="None"),
            WordAssessment(word="difficult", score=45, accuracyScore=40, errorType="Mispronunciation"),
        ],
        summary="Significant pronunciation challenges detected. Words to practice: pronunciation, difficult",
    )

    with patch("services.azure_speech.azure_speech_service.assess_pronunciation", new_callable=AsyncMock) as mock_assess:
        mock_assess.return_value = result_with_errors
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pronunciation",
                files={"audio": ("test.wav", b"audio", "audio/wav")},
                data={"referenceText": "pronunciation is difficult"},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["score"] == 55
    assert len(data["words"]) == 3
    mispronounced = [w for w in data["words"] if w["errorType"] == "Mispronunciation"]
    assert len(mispronounced) == 2


@pytest.mark.anyio
async def test_pronunciation_assessment_called_with_correct_params():
    with patch("services.azure_speech.azure_speech_service.assess_pronunciation", new_callable=AsyncMock) as mock_assess:
        mock_assess.return_value = MOCK_RESULT
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/pronunciation",
                files={"audio": ("recording.wav", b"audio bytes here", "audio/wav")},
                data={"referenceText": "the quick brown fox"},
            )

    mock_assess.assert_called_once()
    call_kwargs = mock_assess.call_args.kwargs
    assert call_kwargs["reference_text"] == "the quick brown fox"
    assert call_kwargs["audio_data"] == b"audio bytes here"


@pytest.mark.anyio
async def test_pronunciation_empty_reference_text():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/pronunciation",
            files={"audio": ("test.wav", b"audio", "audio/wav")},
            data={"referenceText": ""},
        )
    # Empty referenceText still gets passed; validation is in the router
    # The endpoint may accept or reject depending on implementation
    assert response.status_code in [400, 422, 500]


@pytest.mark.anyio
async def test_pronunciation_different_audio_formats():
    with patch("services.azure_speech.azure_speech_service.assess_pronunciation", new_callable=AsyncMock) as mock_assess:
        mock_assess.return_value = MOCK_RESULT
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # WAV file
            resp_wav = await client.post("/api/pronunciation",
                files={"audio": ("test.wav", b"wav audio", "audio/wav")},
                data={"referenceText": "hello"},
            )
            # WebM file
            resp_webm = await client.post("/api/pronunciation",
                files={"audio": ("test.webm", b"webm audio", "audio/webm")},
                data={"referenceText": "hello"},
            )

    assert resp_wav.status_code == 200
    assert resp_webm.status_code == 200


@pytest.mark.anyio
async def test_pronunciation_response_schema():
    with patch("services.azure_speech.azure_speech_service.assess_pronunciation", new_callable=AsyncMock) as mock_assess:
        mock_assess.return_value = MOCK_RESULT
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pronunciation",
                files={"audio": ("test.wav", b"audio", "audio/wav")},
                data={"referenceText": "hello world"},
            )

    assert response.status_code == 200
    data = response.json()
    required_fields = ["score", "accuracyScore", "fluencyScore", "completenessScore", "words", "summary"]
    for field in required_fields:
        assert field in data, f"Missing field: {field}"
    assert isinstance(data["words"], list)
    assert isinstance(data["score"], int)
