"""
Examiner API Router

POST /api/examiner - Generate next IELTS examiner question.
"""

import traceback
from fastapi import APIRouter, HTTPException
from models.schemas import ExaminerRequest, ExaminerResponse
from services.llm import llm_service

router = APIRouter()


def get_system_prompt(mode: str, topic_id: str = None) -> str:
    """
    Generate system prompt based on practice mode.

    Note: Topic integration will be added later. For now, topic_id is accepted
    but not used for topic-specific prompts.
    """
    base_prompt = """You are an IELTS Speaking examiner conducting a practice session.

Rules:
- Ask only one question at a time.
- Every examiner response must include exactly one IELTS-style question.
- Every examiner response must end with a question mark.
- You may briefly acknowledge the user's answer, but you must immediately ask one follow-up question.
- Do not respond with only a comment such as "That sounds interesting", "That sounds delicious", or "I see".
- Use natural IELTS Speaking examiner language.
- Ask follow-up questions based on the user's previous answer.
- Do not give feedback during the session.
- Do not correct the user's grammar during the session.
- Do not explain the IELTS test unless the user asks.
- Keep your questions clear, short, and suitable for spoken answers.
- Do not be overly friendly or overly casual.
- Keep the practice realistic."""

    # Map frontend mode values to internal mode names
    mode_mapping = {
        "ielts_part_1": "part1",
        "ielts_part_2": "part2",
        "ielts_part_3": "part3",
    }
    normalized_mode = mode_mapping.get(mode, mode)

    if normalized_mode == "part2":
        return f"""{base_prompt}

The current practice mode is IELTS Speaking Part 2 (Long Turn).

Part 2 Rules:
- First, give the user a cue card with a topic to speak about for 1-2 minutes.
- The cue card should include: the main topic, 3-4 bullet points to cover, and a final question.
- After giving the cue card, say "You have 1 minute to prepare. You can make notes if you wish."
- Then say "Alright, you can start speaking now. You have 1-2 minutes."
- Listen to the user's response.
- After they finish, ask 1-2 brief follow-up questions related to the topic."""

    elif normalized_mode == "part3":
        return f"""{base_prompt}

The current practice mode is IELTS Speaking Part 3 (Discussion).

Part 3 Rules:
- Ask abstract, analytical questions related to the Part 2 topic.
- Questions should require deeper thinking and analysis.
- Ask about broader issues, comparisons, predictions, or opinions.
- Follow up on the user's answers to explore their views further.
- Encourage the user to give detailed, well-structured responses."""

    else:  # part1
        return f"""{base_prompt}

The current practice mode is IELTS Speaking Part 1.

Part 1 Rules:
- Start with IELTS Speaking Part 1-style questions.
- Ask about familiar topics: hometown, work/studies, hobbies, daily routine, interests.
- Keep questions simple and direct.
- Ask 1-2 follow-up questions per topic before moving to a new topic."""


@router.post("/examiner", response_model=ExaminerResponse)
async def generate_examiner_question(request: ExaminerRequest):
    """
    Generate the next IELTS examiner question based on conversation history.
    """
    try:
        # Validate input
        if not request.messages or len(request.messages) == 0:
            raise HTTPException(
                status_code=400,
                detail="Invalid request: messages array is required"
            )

        # Generate system prompt
        system_prompt = get_system_prompt(request.mode)

        # Convert messages to OpenAI format
        openai_messages = [{"role": "system", "content": system_prompt}]
        for msg in request.messages:
            openai_messages.append({
                "role": "assistant" if msg.role == "examiner" else "user",
                "content": msg.content,
            })

        # Call LLM
        message = await llm_service.call_llm(
            messages=openai_messages,
            temperature=0.7,
            max_tokens=1000,
        )

        return ExaminerResponse(message=message)

    except ValueError as e:
        # LLM configuration or response errors
        raise HTTPException(status_code=502, detail=str(e))

    except HTTPException:
        raise

    except Exception as e:
        print(f"Examiner API error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again."
        )
