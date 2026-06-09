"""
PTE Feedback API Router

POST /api/pte/feedback — AI feedback for any PTE task type.
Implements the Scoring Agent + LLM-as-Judge pipeline.
"""

import asyncio
import json
import re
import traceback
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from models.schemas import PteFeedbackRequest
from services.llm import llm_service

router = APIRouter()

VALID_TASK_TYPES = {
    "read_aloud", "repeat_sentence", "answer_short_question", "summarize_written_text",
    "write_essay", "personal_intro", "write_from_dictation", "describe_image", "re_tell_lecture",
    "fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading",
    "summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary",
}

SCORED_SPEAKING = {"read_aloud", "repeat_sentence", "answer_short_question", "describe_image", "re_tell_lecture"}
SCORED_WRITING = {"summarize_written_text", "write_essay"}
SCORED_READING = {"fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading"}
SCORED_LISTENING = {"summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary"}

SYSTEM_PROMPTS: dict[str, str] = {
    "repeat_sentence": (
        "You are a PTE Academic examiner evaluating a Repeat Sentence response.\n"
        "The candidate listened to a sentence once and attempted to repeat it verbatim.\n"
        "Criteria: Content accuracy (did they repeat all words correctly?), Oral Fluency, Pronunciation.\n"
        "Rate harshly on content — omissions or substitutions significantly reduce the score."
    ),
    "answer_short_question": (
        "You are a PTE Academic examiner evaluating an Answer Short Question response.\n"
        "The candidate heard a factual question and gave a spoken answer.\n"
        "Focus entirely on Content Accuracy: was the answer correct or close to correct?\n"
        "The correct answer is shown in the stimulus. Do not penalize grammar or pronunciation heavily."
    ),
    "summarize_written_text": (
        "You are a PTE Academic examiner evaluating a Summarize Written Text response.\n"
        "The candidate read a passage and wrote a one-sentence summary.\n"
        "Criteria: Content (does it capture the main idea?), Form (is it one sentence?), Grammar, Vocabulary."
    ),
    "write_essay": (
        "You are a PTE Academic examiner evaluating a Write Essay response.\n"
        "Criteria: Content (task response, development of ideas), Form (word count, structure), "
        "Grammar Range and Accuracy, Vocabulary Range.\n"
        "A good essay is 200–300 words, well-structured, with varied vocabulary and grammar."
    ),
    "personal_intro": (
        "You are a PTE Academic evaluator reviewing a Personal Introduction.\n"
        "This is unscored in the real exam, but give helpful feedback on fluency, coherence, and self-expression.\n"
        "Be encouraging. Focus on what they communicated well and how to make it more natural."
    ),
    "write_from_dictation": (
        "You are a PTE Academic examiner evaluating a Write from Dictation response.\n"
        "The candidate listened to a sentence and typed what they heard.\n"
        "Focus on: word accuracy (every word counts), spelling, completeness.\n"
        "Note every word that was omitted, misspelled, or substituted."
    ),
    "read_aloud": (
        "You are a PTE Academic examiner evaluating a Read Aloud response.\n"
        "Criteria: Content, Oral Fluency, Pronunciation."
    ),
    "describe_image": (
        "You are a PTE Academic examiner evaluating a Describe Image response.\n"
        "The candidate was shown an image (chart, graph, map, or photograph) for 25 seconds, then had 40 seconds to describe it aloud.\n"
        "Criteria: Content Coverage (did they identify the image type and describe the key features, trends, or comparisons?), Oral Fluency, Pronunciation.\n"
        "A strong response names the image type, identifies the main subject, highlights key data points or comparisons, and draws a brief conclusion."
    ),
    "re_tell_lecture": (
        "You are a PTE Academic examiner evaluating a Re-tell Lecture response.\n"
        "The candidate listened to a short lecture (~60 seconds), had 10 seconds to prepare, then had 40 seconds to re-tell it aloud.\n"
        "Criteria: Content Accuracy (did they capture the main points and key details from the lecture?), Oral Fluency, Pronunciation.\n"
        "A strong response identifies the topic, covers the main argument and supporting points in sequence, and uses appropriate academic language."
    ),
    "fill_in_the_blanks_reading": (
        "You are a PTE Academic examiner evaluating a Fill in the Blanks (Reading) response.\n"
        "The stimulus shows the passage with the correct answers marked. The response shows which options the learner selected and whether each was correct.\n"
        "Focus on: accuracy (which blanks were correct and which were wrong), vocabulary understanding in context, and patterns in errors."
    ),
    "re_order_paragraphs": (
        "You are a PTE Academic examiner evaluating a Re-order Paragraphs response.\n"
        "The stimulus shows the paragraphs in correct order. The response shows the learner's submitted order.\n"
        "Focus on: how many paragraphs were in the correct position, understanding of discourse markers and paragraph cohesion, and logical flow comprehension."
    ),
    "multiple_choice_reading": (
        "You are a PTE Academic examiner evaluating a Multiple Choice (Reading) response.\n"
        "The stimulus shows the passage, question, and all options. The response shows the learner's selection and whether it was correct.\n"
        "Focus on: reading comprehension accuracy, understanding of main idea vs supporting details, and any misconceptions revealed by the wrong choice if applicable."
    ),
    "summarize_spoken_text": (
        "You are a PTE Academic examiner evaluating a Summarize Spoken Text response.\n"
        "The candidate listened to a short audio passage and then wrote a 50–70 word summary.\n"
        "The original passage text is shown in the stimulus.\n"
        "Criteria: Content accuracy (did they capture the main idea and key points?), Writing quality (grammar, vocabulary, summary length 50–70 words).\n"
        "A strong response identifies the topic, covers the main point and key supporting details in coherent written prose."
    ),
    "fill_in_the_blanks_listening": (
        "You are a PTE Academic examiner evaluating a Fill in the Blanks (Listening) response.\n"
        "The candidate listened to a passage read aloud and selected words to fill in blanks in the transcript.\n"
        "The stimulus shows the passage with correct answers marked. The response shows which options the learner selected and whether each was correct.\n"
        "Focus on: accuracy (which blanks were correct), listening comprehension, and ability to identify content words from audio context."
    ),
    "highlight_correct_summary": (
        "You are a PTE Academic examiner evaluating a Highlight Correct Summary response.\n"
        "The candidate listened to an audio passage and selected the summary that best matches what was said.\n"
        "The stimulus shows the passage and all summary options. The response shows the learner's selection and whether it was correct.\n"
        "Focus on: whether the selected summary accurately captures the main idea and key points, and what was right or wrong about the choice."
    ),
}

DETAILS_SCHEMA: dict[str, str] = {
    "repeat_sentence": '"details": { "taskType": "repeat_sentence", "oralFluency": "<feedback>", "pronunciation": "<feedback>" }',
    "answer_short_question": '"details": { "taskType": "answer_short_question", "contentAccuracy": "<was the answer correct? what was right/wrong?>" }',
    "summarize_written_text": '"details": { "taskType": "summarize_written_text", "content": "<did it capture main idea?>", "grammar": "<grammar feedback>", "vocabulary": "<vocabulary feedback>", "structure": "<one sentence? word count?>" }',
    "write_essay": '"details": { "taskType": "write_essay", "content": "<task response quality>", "grammar": "<grammar feedback>", "vocabulary": "<vocabulary feedback>", "structure": "<structure and coherence>" }',
    "personal_intro": '"details": { "taskType": "personal_intro", "content": "<what they communicated>", "grammar": "<grammar notes>", "vocabulary": "<vocabulary notes>" }',
    "write_from_dictation": '"details": { "taskType": "write_from_dictation", "wordAccuracy": "<which words were correct, omitted, misspelled, or substituted>" }',
    "read_aloud": '"details": { "taskType": "read_aloud", "oralFluency": "<feedback>", "pronunciation": "<feedback>" }',
    "describe_image": '"details": { "taskType": "describe_image", "contentCoverage": "<did they identify image type and key features/trends/comparisons?>", "fluency": "<oral fluency and delivery feedback>" }',
    "re_tell_lecture": '"details": { "taskType": "re_tell_lecture", "contentAccuracy": "<which key points did they capture or miss from the lecture?>", "fluency": "<oral fluency and delivery feedback>" }',
    "fill_in_the_blanks_reading": '"details": { "taskType": "fill_in_the_blanks_reading", "accuracy": "<which blanks were correct and which were wrong, with explanations>", "vocabulary": "<vocabulary-in-context understanding feedback>" }',
    "re_order_paragraphs": '"details": { "taskType": "re_order_paragraphs", "orderAccuracy": "<how many paragraphs were in the correct position and which were misplaced>", "logicFeedback": "<feedback on their understanding of text cohesion and discourse structure>" }',
    "multiple_choice_reading": '"details": { "taskType": "multiple_choice_reading", "answerAccuracy": "<was the answer correct and why the correct option is right>", "readingComprehension": "<feedback on their reading comprehension approach and any misconceptions>" }',
    "summarize_spoken_text": '"details": { "taskType": "summarize_spoken_text", "contentAccuracy": "<did the summary capture the main idea and key points from the audio?>", "writingQuality": "<grammar, vocabulary, and whether summary length is 50–70 words>" }',
    "fill_in_the_blanks_listening": '"details": { "taskType": "fill_in_the_blanks_listening", "accuracy": "<which blanks were correct and which were wrong, with explanations>", "listeningComprehension": "<feedback on their ability to identify content words from audio context>" }',
    "highlight_correct_summary": '"details": { "taskType": "highlight_correct_summary", "answerAccuracy": "<was the selection correct and why the correct summary best matches the passage>", "listeningComprehension": "<feedback on their listening comprehension and understanding of the main idea>" }',
}


def _build_primary_schema(task_type: str) -> str:
    details = DETAILS_SCHEMA[task_type]
    base = (
        '"summary": "<2-3 sentence overall assessment>", '
        '"strengths": ["<strength1>", "<strength2>"], '
        '"weaknesses": ["<weakness1>", "<weakness2>"], '
        '"suggestions": ["<tip1>", "<tip2>"]'
    )

    if task_type in SCORED_SPEAKING:
        return (
            "You MUST respond with valid JSON only. No markdown, no code blocks.\nReturn exactly:\n{\n"
            f'  {base},\n  {details},\n'
            '  "dimensionScores": { "section": "speaking", "fluency": <0-100>, "pronunciation": <0-100>, "content": <0-100> },\n'
            '  "coachSuggestions": ["<targeted coaching tip for the weakest dimension>", "<targeted tip for 2nd weakest dimension>"]\n}'
        )
    if task_type in SCORED_WRITING:
        return (
            "You MUST respond with valid JSON only. No markdown, no code blocks.\nReturn exactly:\n{\n"
            f'  {base},\n  {details},\n'
            '  "dimensionScores": { "section": "writing", "grammar": <0-100>, "vocabulary": <0-100>, "form": <0-100>, "content": <0-100> },\n'
            '  "coachSuggestions": ["<targeted coaching tip for the weakest dimension>", "<targeted tip for 2nd weakest dimension>"]\n}'
        )
    if task_type in SCORED_READING:
        return (
            "You MUST respond with valid JSON only. No markdown, no code blocks.\nReturn exactly:\n{\n"
            f'  {base},\n  {details},\n'
            '  "dimensionScores": { "section": "reading", "vocabulary": <0-100>, "comprehension": <0-100> },\n'
            '  "coachSuggestions": ["<targeted coaching tip for the weakest dimension>", "<targeted tip for 2nd weakest dimension>"]\n}'
        )
    if task_type in SCORED_LISTENING:
        return (
            "You MUST respond with valid JSON only. No markdown, no code blocks.\nReturn exactly:\n{\n"
            f'  {base},\n  {details},\n'
            '  "dimensionScores": { "section": "listening", "comprehension": <0-100>, "accuracy": <0-100> },\n'
            '  "coachSuggestions": ["<targeted coaching tip for the weakest dimension>", "<targeted tip for 2nd weakest dimension>"]\n}'
        )
    return (
        "You MUST respond with valid JSON only. No markdown, no code blocks.\nReturn exactly:\n{\n"
        f'  {base},\n  {details}\n}}'
    )


def _build_judge_prompt(task_type: str) -> Optional[str]:
    if task_type in SCORED_SPEAKING:
        return (
            'You are an independent PTE Academic examiner. Score the fluency, pronunciation, and content of the spoken response on a 0–100 scale. '
            'Return ONLY valid JSON, no other text:\n'
            '{"dimensionScores": {"section": "speaking", "fluency": <0-100>, "pronunciation": <0-100>, "content": <0-100>}}'
        )
    if task_type in SCORED_WRITING:
        return (
            'You are an independent PTE Academic examiner. Score the grammar, vocabulary, form, and content of the written response on a 0–100 scale. '
            'Return ONLY valid JSON, no other text:\n'
            '{"dimensionScores": {"section": "writing", "grammar": <0-100>, "vocabulary": <0-100>, "form": <0-100>, "content": <0-100>}}'
        )
    if task_type in SCORED_READING:
        return (
            'You are an independent PTE Academic examiner. Score the vocabulary and comprehension aspects of the reading response on a 0–100 scale. '
            'Return ONLY valid JSON, no other text:\n'
            '{"dimensionScores": {"section": "reading", "vocabulary": <0-100>, "comprehension": <0-100>}}'
        )
    if task_type in SCORED_LISTENING:
        return (
            'You are an independent PTE Academic examiner. Score the comprehension and accuracy of the listening response on a 0–100 scale. '
            'Return ONLY valid JSON, no other text:\n'
            '{"dimensionScores": {"section": "listening", "comprehension": <0-100>, "accuracy": <0-100>}}'
        )
    return None


def _try_parse_json(raw: str) -> Optional[dict]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[\s\S]*\}', raw)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _extract_dimension_scores(parsed: dict) -> Optional[dict]:
    ds = parsed.get("dimensionScores")
    if not isinstance(ds, dict):
        return None
    section = ds.get("section")
    if section == "speaking" and all(isinstance(ds.get(k), (int, float)) for k in ["fluency", "pronunciation", "content"]):
        return ds
    if section == "writing" and all(isinstance(ds.get(k), (int, float)) for k in ["grammar", "vocabulary", "form", "content"]):
        return ds
    if section == "reading" and all(isinstance(ds.get(k), (int, float)) for k in ["vocabulary", "comprehension"]):
        return ds
    if section == "listening" and all(isinstance(ds.get(k), (int, float)) for k in ["comprehension", "accuracy"]):
        return ds
    return None


def _find_divergences(primary: dict, judge: dict) -> list:
    if primary.get("section") != judge.get("section"):
        return []
    dims_map = {
        "speaking": ["fluency", "pronunciation", "content"],
        "writing": ["grammar", "vocabulary", "form", "content"],
        "reading": ["vocabulary", "comprehension"],
        "listening": ["comprehension", "accuracy"],
    }
    dims = dims_map.get(primary["section"], [])
    return [
        {"dimension": dim, "primaryScore": primary.get(dim, 0), "judgeScore": judge.get(dim, 0)}
        for dim in dims
        if abs(primary.get(dim, 0) - judge.get(dim, 0)) > 15
    ]


@router.post("/pte/feedback")
async def generate_pte_feedback(request: PteFeedbackRequest):
    """Generate AI feedback for any PTE task type (Scoring Agent + LLM-as-Judge pipeline)."""
    task_type = request.taskType

    if task_type not in VALID_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid taskType: {task_type}")

    if not request.response or not request.response.strip():
        raise HTTPException(status_code=400, detail="response is required")

    is_scored = task_type in (SCORED_SPEAKING | SCORED_WRITING | SCORED_READING | SCORED_LISTENING)

    primary_schema = _build_primary_schema(task_type)
    primary_system = "\n\n".join(filter(None, [
        SYSTEM_PROMPTS[task_type],
        primary_schema,
        "Dimension scores are 0–100 internal reference values only — they do not represent official PTE Academic scores." if is_scored else "",
    ]))

    pron = request.pronunciationAssessment
    pron_ctx = ""
    if pron:
        pron_ctx = (
            f"\n\nAzure Pronunciation scores — Overall: {pron.get('score')}, "
            f"Accuracy: {pron.get('accuracyScore')}, Fluency: {pron.get('fluencyScore')}, "
            f"Completeness: {pron.get('completenessScore')}"
        )

    user_content = (
        f"Stimulus:\n{request.stimulus}\n\nCandidate response:\n{request.response.strip()}{pron_ctx}"
        if request.stimulus
        else f"Candidate response:\n{request.response.strip()}{pron_ctx}"
    )

    judge_prompt = _build_judge_prompt(task_type)

    async def _call_primary() -> str:
        return await llm_service.call_llm(
            messages=[
                {"role": "system", "content": primary_system},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=1200,
            timeout=60.0,
            response_format={"type": "json_object"},
        )

    async def _call_judge() -> Optional[str]:
        if not judge_prompt:
            return None
        try:
            return await llm_service.call_llm(
                messages=[
                    {"role": "system", "content": judge_prompt},
                    {"role": "user", "content": user_content},
                ],
                temperature=0.3,
                max_tokens=200,
                timeout=30.0,
                response_format={"type": "json_object"},
            )
        except Exception:
            return None

    try:
        primary_content, judge_content = await asyncio.gather(_call_primary(), _call_judge())
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        print(f"PTE feedback error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to generate feedback")

    if not primary_content:
        raise HTTPException(status_code=502, detail="Empty response from LLM")

    primary_parsed = _try_parse_json(primary_content)
    if primary_parsed is None:
        raise HTTPException(status_code=502, detail="Invalid feedback format from LLM")

    # LLM-as-Judge: retry primary if any dimension diverges > 15 points
    judge_log = None
    if judge_content:
        judge_parsed = _try_parse_json(judge_content)
        if judge_parsed:
            primary_scores = _extract_dimension_scores(primary_parsed)
            judge_scores = _extract_dimension_scores(judge_parsed)
            if primary_scores and judge_scores:
                diverged = _find_divergences(primary_scores, judge_scores)
                if diverged:
                    judge_log = {
                        "taskType": task_type,
                        "divergedDimensions": diverged,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    print(f"[LLM-as-Judge] Dimension disagreement — retrying primary: {judge_log}")
                    try:
                        retry_content = await llm_service.call_llm(
                            messages=[
                                {"role": "system", "content": primary_system},
                                {"role": "user", "content": user_content},
                            ],
                            temperature=0.3,
                            max_tokens=1200,
                            timeout=60.0,
                            response_format={"type": "json_object"},
                        )
                        retry_parsed = _try_parse_json(retry_content)
                        if retry_parsed:
                            primary_parsed = retry_parsed
                    except Exception:
                        pass  # Keep original primary result; judgeLog still attached

    if pron:
        primary_parsed["pronunciationAssessment"] = pron
    if judge_log:
        primary_parsed["judgeLog"] = judge_log

    return primary_parsed
