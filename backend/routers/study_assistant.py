"""
Study Assistant API Router

POST /api/study-assistant/chat — multi-turn conversational endpoint.

Thin router: validates the request, calls the graph entry point, maps
errors to HTTP responses. Mirrors routers/onboarding.py style.
"""

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.study_assistant_graph import run_study_assistant_graph

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Request / Response models ────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class StudyAssistantChatRequest(BaseModel):
    messages: list[ChatMessage]
    locale: Literal["en", "zh"] = "en"


class StudyAssistantLink(BaseModel):
    label: str
    route: str


class StudyAssistantPractice(BaseModel):
    taskType: str
    taskSlug: str
    topic: str
    source: Literal["exemplars", "news"]
    route: str


class StudyAssistantChatResponse(BaseModel):
    reply: str
    links: list[StudyAssistantLink]
    practice: Optional[StudyAssistantPractice] = None


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/study-assistant/chat", response_model=StudyAssistantChatResponse)
async def study_assistant_chat(request: StudyAssistantChatRequest):
    """
    Multi-turn Study Assistant chat.

    Accepts a conversation history and returns a reply (in the request locale),
    optional navigation links (from the fixed route allow-list), and an optional
    practice deep-link for topic-based practice generation.
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    # Ensure the last message is from the user
    last_msg = request.messages[-1]
    if last_msg.role != "user":
        raise HTTPException(
            status_code=400,
            detail="The last message in the conversation must have role='user'",
        )

    messages = [msg.model_dump() for msg in request.messages]

    try:
        result = await run_study_assistant_graph(
            messages=messages,
            locale=request.locale,
        )
    except Exception as exc:
        logger.exception("[study-assistant] graph failed")
        raise HTTPException(
            status_code=500,
            detail=f"Study Assistant encountered an error: {exc}",
        )

    return StudyAssistantChatResponse(
        reply=result.get("reply") or "",
        links=[
            StudyAssistantLink(label=link["label"], route=link["route"])
            for link in (result.get("links") or [])
        ],
        practice=(
            StudyAssistantPractice(**result["practice"])
            if result.get("practice")
            else None
        ),
    )
