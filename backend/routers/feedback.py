"""
Feedback API Router

POST /api/feedback - Generate structured IELTS speaking feedback.
"""

import json
import re
import traceback
from fastapi import APIRouter, HTTPException
from models.schemas import FeedbackRequest, SessionFeedback
from services.llm import llm_service

router = APIRouter()

EVALUATOR_SYSTEM_PROMPT = """You are an IELTS Speaking evaluator.

Your task is to evaluate the user's speaking practice transcript.

Assess the user's answers based on IELTS Speaking criteria:
1. Fluency and Coherence
2. Lexical Resource
3. Grammatical Range and Accuracy
4. Pronunciation

You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.

Return this exact JSON structure:
{
  "estimatedBand": <number between 0 and 9>,
  "fluencyAndCoherence": "<string feedback>",
  "lexicalResource": "<string feedback>",
  "grammarRangeAndAccuracy": "<string feedback>",
  "pronunciation": "<string feedback on pronunciation based on any available pronunciation data>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "improvementSuggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "improvedSampleAnswer": "<improved version of one of the user's answers>",
  "errorAnnotations": [
    {
      "original": "<exact text from the candidate's response containing the error>",
      "corrected": "<the corrected version of that text>",
      "type": "<one of: grammar, vocabulary, fluency, pronunciation>",
      "explanation": "<brief explanation of why it was wrong and how to fix it>"
    }
  ]
}

For errorAnnotations: Identify 3-8 specific errors from the candidate's responses. For each error:
- "original" must be an exact substring from the candidate's transcript
- "corrected" is the properly corrected version
- "type" classifies the error as grammar, vocabulary, fluency, or pronunciation
- "explanation" gives a concise, helpful correction note
Focus on the most impactful errors. If the candidate made few errors, include fewer annotations.

Be helpful, specific, and realistic. Do not be too harsh, but do not overestimate the user's score."""


def extract_json_from_response(content: str) -> dict:
    """
    Extract JSON from LLM response, handling various formats.

    Some LLMs wrap JSON in markdown code blocks or add extra text.
    """
    # Try direct parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from markdown code blocks
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if json_match:
        try:
            return json.loads(json_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try to find JSON object in the content
    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError("Could not extract valid JSON from response")


@router.post("/feedback", response_model=SessionFeedback)
async def generate_feedback(request: FeedbackRequest):
    """
    Generate structured IELTS speaking feedback for a completed session.
    """
    try:
        # Validate input
        if not request.messages or len(request.messages) == 0:
            raise HTTPException(
                status_code=400,
                detail="Invalid request: messages array is required"
            )

        # Format transcript for evaluation
        transcript = "\n".join(
            f"{'Examiner' if msg.role == 'examiner' else 'Candidate'}: {msg.content}"
            for msg in request.messages
        )

        openai_messages = [
            {"role": "system", "content": EVALUATOR_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Please evaluate this IELTS Speaking practice transcript:\n\n{transcript}",
            },
        ]

        # Call LLM with JSON response format
        content = await llm_service.call_llm(
            messages=openai_messages,
            temperature=0.3,
            max_tokens=3000,
            timeout=120.0,
            response_format={"type": "json_object"},
        )

        # Parse JSON response
        try:
            feedback_data = extract_json_from_response(content)
        except ValueError as e:
            print(f"Failed to parse LLM response as JSON: {content}")
            raise HTTPException(
                status_code=502,
                detail="Invalid feedback format from LLM"
            )

        # Validate and return
        return SessionFeedback(**feedback_data)

    except HTTPException:
        raise

    except ValueError as e:
        # LLM configuration or response errors
        raise HTTPException(status_code=502, detail=str(e))

    except Exception as e:
        print(f"Feedback API error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again."
        )
