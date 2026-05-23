"""
Pronunciation API Router

POST /api/pronunciation - Azure pronunciation assessment.
"""

import traceback
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from models.schemas import PronunciationAssessmentResult
from services.azure_speech import azure_speech_service

router = APIRouter()


@router.post("/pronunciation", response_model=PronunciationAssessmentResult)
async def assess_pronunciation(
    audio: UploadFile = File(...),
    referenceText: str = Form(...),
):
    """
    Assess pronunciation using Azure Speech SDK.

    Accepts audio file and reference text, returns detailed assessment.
    """
    try:
        # Validate input
        if not audio:
            raise HTTPException(
                status_code=400, detail="Audio file is required"
            )
        if not referenceText:
            raise HTTPException(
                status_code=400, detail="Reference text is required"
            )

        # Read audio data
        audio_data = await audio.read()
        print(f"Pronunciation assessment request: audio_size={len(audio_data)}, text={referenceText[:50]}...")

        # Perform assessment
        result = await azure_speech_service.assess_pronunciation(
            audio_data=audio_data,
            reference_text=referenceText,
        )

        return result

    except ValueError as e:
        # Azure configuration or assessment errors
        raise HTTPException(status_code=500, detail=str(e))

    except HTTPException:
        raise

    except Exception as e:
        print(f"Pronunciation assessment error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail="Failed to assess pronunciation. Please try again."
        )
