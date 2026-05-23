"""
TTS API Router

POST /api/tts - Azure Neural TTS speech synthesis.
"""

import traceback
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from models.schemas import TTSRequest
from services.azure_speech import azure_speech_service

router = APIRouter()


@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    """
    Convert text to speech using Azure Neural TTS.

    Returns WAV audio stream.
    """
    try:
        # Validate input
        if not request.text:
            raise HTTPException(status_code=400, detail="Text is required")

        # Synthesize speech
        audio_data = await azure_speech_service.synthesize_speech(
            text=request.text,
            voice=request.voice,
            rate=request.rate,
        )

        # Return WAV audio stream
        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={
                "Cache-Control": "public, max-age=86400",
            },
        )

    except ValueError as e:
        # Azure configuration or synthesis errors
        raise HTTPException(status_code=500, detail=str(e))

    except HTTPException:
        raise

    except Exception as e:
        print(f"TTS error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail="Failed to synthesize speech. Please try again."
        )
