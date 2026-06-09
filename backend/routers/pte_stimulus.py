"""
PTE Stimulus API Router

POST /api/pte/stimulus — Generate stimulus for any PTE task type.
"""

import traceback
from fastapi import APIRouter, HTTPException
from models.schemas import PteStimulusRequest, PteStimulusResponse
from services.llm import llm_service

router = APIRouter()

# These task types require JSON-structured output from the LLM
JSON_TASK_TYPES = {
    "fill_in_the_blanks_reading",
    "re_order_paragraphs",
    "multiple_choice_reading",
    "fill_in_the_blanks_listening",
    "highlight_correct_summary",
}

VALID_TASK_TYPES = {
    "read_aloud", "repeat_sentence", "answer_short_question", "summarize_written_text",
    "write_essay", "personal_intro", "write_from_dictation", "describe_image", "re_tell_lecture",
    "fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading",
    "summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary",
}

PROMPTS: dict[str, str] = {
    "repeat_sentence": (
        "Generate one clear, natural-sounding sentence (12–16 words) from an academic or professional context. "
        "Respond with ONLY the sentence. No labels or punctuation other than the sentence itself."
    ),
    "answer_short_question": (
        "Generate one PTE Academic Answer Short Question — a factual question with a single clear answer (1–4 words). "
        "Format: Question on first line, Answer on second line, no other text. Example:\n"
        "What is the chemical symbol for water?\nH2O"
    ),
    "summarize_written_text": (
        "Generate a 100–150 word academic passage on a topic from science, technology, environment, or society. "
        "The passage should be self-contained and suitable for summarization. "
        "Respond with ONLY the passage. No title, no labels."
    ),
    "write_essay": (
        "Generate a PTE Academic Write Essay prompt (40–60 words). "
        "Include the essay question and 2–3 discussion points or angles. "
        "Topics: technology, environment, education, society, or globalisation. "
        "Respond with ONLY the prompt text, no labels."
    ),
    "write_from_dictation": (
        "Generate one academic sentence (10–14 words) suitable for dictation. "
        "Clear vocabulary, no contractions, no ambiguous words. "
        "Respond with ONLY the sentence."
    ),
    "read_aloud": (
        "Generate one academic passage of 50–70 words suitable for reading aloud. "
        "Clear sentence structure, no contractions. "
        "Respond with ONLY the passage text."
    ),
    "describe_image": (
        "Generate a brief description of an academic chart or graph (50–80 words) that a student could use to practice describing. "
        "Include chart type, main trend, and one key data point. "
        "Respond with ONLY the description text."
    ),
    "re_tell_lecture": (
        "Generate a short academic lecture excerpt (110–130 words) on a topic from science, technology, environment, health, or society. "
        "It should sound like natural spoken academic English — use discourse markers (Firstly, However, In conclusion, etc.) and a clear main point with two or three supporting details. "
        "Respond with ONLY the lecture text. No title, no labels, no speaker attribution."
    ),
    "summarize_spoken_text": (
        "Generate a 90–110 word academic passage on a topic from science, technology, environment, health, or society. "
        "Use clear, spoken-style English with discourse markers (Firstly, Furthermore, In conclusion, etc.) and a single main idea with two or three supporting points. "
        "The passage will be converted to audio for a listening task. "
        "Respond with ONLY the passage text. No title, no labels."
    ),
    "fill_in_the_blanks_reading": (
        "Generate a PTE Academic Fill in the Blanks (Reading) task. "
        "Create an academic passage of 80–100 words with exactly 5 blanks marked as [BLANK_0], [BLANK_1], [BLANK_2], [BLANK_3], [BLANK_4]. "
        "For each blank provide 4 options where exactly one is correct. "
        "Return ONLY valid JSON, no other text:\n"
        '{"passage":"...text with [BLANK_0] markers...","blanks":[{"options":["opt1","opt2","opt3","opt4"],"correct":0}]}\n'
        "The passage must read naturally with the correct options filled in. Topic: science, technology, environment, or society."
    ),
    "re_order_paragraphs": (
        "Generate a PTE Academic Re-order Paragraphs task. "
        "Create 4 short paragraphs (2–3 sentences each) on an academic topic that form a coherent argument or explanation when read in order. "
        "Use discourse markers (Firstly, However, Therefore, etc.) to make ordering cues realistic but not trivial. "
        "Return ONLY valid JSON, no other text:\n"
        '{"paragraphs":[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}]}\n'
        "The array is in CORRECT reading order. Topics: science, technology, environment, society, or history."
    ),
    "multiple_choice_reading": (
        "Generate a PTE Academic Multiple Choice (Reading) task. "
        "Create a reading passage of 80–100 words followed by one comprehension question with exactly 5 options (A–E), one correct. "
        "Return ONLY valid JSON, no other text:\n"
        '{"passage":"...","question":"...","options":["A. ...","B. ...","C. ...","D. ...","E. ..."],"correct":2}\n'
        'The "correct" field is the 0-based index of the correct option. Test main idea, specific detail, or inference.'
    ),
    "fill_in_the_blanks_listening": (
        "Generate a PTE Academic Fill in the Blanks (Listening) task. "
        "Create an academic passage of 80–100 words with exactly 5 blanks marked as [BLANK_0], [BLANK_1], [BLANK_2], [BLANK_3], [BLANK_4]. "
        "For each blank provide 4 options where exactly one is correct. "
        "The passage will be read aloud as audio — blanks are content words that listeners must identify from context and audio. "
        "Return ONLY valid JSON, no other text:\n"
        '{"passage":"...text with [BLANK_0] markers...","blanks":[{"options":["opt1","opt2","opt3","opt4"],"correct":0}]}\n'
        "The passage must read naturally with the correct options filled in. Topic: science, technology, environment, or society."
    ),
    "highlight_correct_summary": (
        "Generate a PTE Academic Highlight Correct Summary task. "
        "Create an academic passage of 100–120 words on a topic from science, technology, environment, health, or society. "
        "Provide 5 summary options: one that accurately captures the main idea and key points, and four plausible but subtly wrong alternatives. "
        "Return ONLY valid JSON, no other text:\n"
        '{"passage":"...","summaries":["S1","S2","S3","S4","S5"],"correct":0}\n'
        'The "correct" field is the 0-based index of the accurate summary. Summaries should be 1–2 sentences each.'
    ),
}


@router.post("/pte/stimulus", response_model=PteStimulusResponse)
async def generate_pte_stimulus(request: PteStimulusRequest):
    """Generate stimulus content for a PTE task type."""
    task_type = request.taskType

    if task_type not in VALID_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid taskType: {task_type}")

    # Personal Introduction has a fixed prompt — no LLM call needed
    if task_type == "personal_intro":
        return PteStimulusResponse(text="")

    user_prompt = PROMPTS.get(task_type)
    if not user_prompt:
        raise HTTPException(status_code=400, detail=f"No stimulus prompt for taskType: {task_type}")

    is_json_task = task_type in JSON_TASK_TYPES
    max_tokens = 800 if is_json_task else 300
    response_format = {"type": "json_object"} if is_json_task else None

    try:
        text = await llm_service.call_llm(
            messages=[
                {
                    "role": "system",
                    "content": "You are a PTE Academic test content creator. Follow instructions exactly.",
                },
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.85,
            max_tokens=max_tokens,
            timeout=30.0,
            response_format=response_format,
        )

        if not text:
            raise HTTPException(status_code=502, detail="Empty response from LLM")

        return PteStimulusResponse(text=text)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        print(f"PTE stimulus error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to generate stimulus")
