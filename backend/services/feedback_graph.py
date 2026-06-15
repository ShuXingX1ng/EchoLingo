"""
LangGraph-based PTE Feedback Pipeline

Replaces the asyncio.gather + manual retry logic in routers/pte_feedback.py.
Nodes: retrieve_context → (call_primary ‖ call_judge) → check_divergence
       → retry_primary (if diverged) → finalize
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional, TypedDict

from langgraph.graph import StateGraph, END

from services.llm_chain import llm_chain
from services.prompt_loader import prompts
from services.rag import retrieve_context as rag_retrieve

logger = logging.getLogger(__name__)

SCORED_SPEAKING  = {"read_aloud", "repeat_sentence", "answer_short_question", "describe_image", "re_tell_lecture"}
SCORED_WRITING   = {"summarize_written_text", "write_essay"}
SCORED_READING   = {"fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading"}
SCORED_LISTENING = {"summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary"}

# Official PTE point maximums for each task type (fixed-max tasks only)
_TASK_SCORE_MAX: dict[str, int] = {
    "read_aloud": 15,
    "repeat_sentence": 13,
    "answer_short_question": 1,
    "describe_image": 15,
    "re_tell_lecture": 15,
    "summarize_written_text": 14,
    "write_essay": 15,
    "summarize_spoken_text": 14,
    "highlight_correct_summary": 1,
}


class FeedbackState(TypedDict):
    task_type: str
    stimulus: str
    response: str
    pron_assessment: Optional[dict]
    pron_context: str
    retrieved_context: str
    primary_result: Optional[dict]
    judge_result: Optional[dict]
    diverged: list
    retry_count: int
    final_result: dict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _section(task_type: str) -> str:
    if task_type in SCORED_SPEAKING:  return "speaking"
    if task_type in SCORED_WRITING:   return "writing"
    if task_type in SCORED_READING:   return "reading"
    if task_type in SCORED_LISTENING: return "listening"
    return "unscored"


_LANGUAGE_INSTRUCTION = (
    "IMPORTANT: All feedback text values must be written in Simplified Chinese (简体中文). "
    "JSON keys remain in English. Only string values — summary, strengths, weaknesses, "
    "suggestions, coachSuggestions, and all fields inside details — must be in Chinese."
)


def _build_primary_system(task_type: str, retrieved_context: str) -> str:
    task = prompts.feedback_tasks[task_type]
    section = _section(task_type)
    schema = prompts.build_primary_schema(section, task["details_schema"])
    parts = [task["system_prompt"].strip(), _LANGUAGE_INSTRUCTION, schema]
    if section != "unscored":
        parts.append(prompts.schema_scoring_note)
    if retrieved_context:
        parts.append(f"\n\n## Scoring Rubrics (retrieved)\n\n{retrieved_context}")
    return "\n\n".join(parts)


def _judge_system(task_type: str) -> Optional[str]:
    if task_type in SCORED_SPEAKING:  return prompts.judge_speaking
    if task_type in SCORED_WRITING:   return prompts.judge_writing
    if task_type in SCORED_READING:   return prompts.judge_reading
    if task_type in SCORED_LISTENING: return prompts.judge_listening
    return None


def _try_parse(raw: str) -> Optional[dict]:
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


def _extract_scores(parsed: dict) -> Optional[dict]:
    ds = parsed.get("dimensionScores")
    if not isinstance(ds, dict):
        return None
    s = ds.get("section")
    if s == "speaking"  and all(isinstance(ds.get(k), (int, float)) for k in ["fluency", "pronunciation", "content"]):
        return ds
    if s == "writing"   and all(isinstance(ds.get(k), (int, float)) for k in ["grammar", "vocabulary", "form", "content"]):
        return ds
    if s == "reading"   and all(isinstance(ds.get(k), (int, float)) for k in ["vocabulary", "comprehension"]):
        return ds
    if s == "listening" and all(isinstance(ds.get(k), (int, float)) for k in ["comprehension", "accuracy"]):
        return ds
    return None


def _find_divergences(primary: dict, judge: dict) -> list:
    if primary.get("section") != judge.get("section"):
        return []
    dims_map = {
        "speaking":  ["fluency", "pronunciation", "content"],
        "writing":   ["grammar", "vocabulary", "form", "content"],
        "reading":   ["vocabulary", "comprehension"],
        "listening": ["comprehension", "accuracy"],
    }
    dims = dims_map.get(primary["section"], [])
    return [
        {"dimension": d, "primaryScore": primary.get(d, 0), "judgeScore": judge.get(d, 0)}
        for d in dims
        if abs(primary.get(d, 0) - judge.get(d, 0)) > 15
    ]


def _format_pron_context(pron: Optional[dict]) -> str:
    if not pron:
        return ""
    return (
        f"\n\nAzure Pronunciation scores — Overall: {pron.get('score')}, "
        f"Accuracy: {pron.get('accuracyScore')}, Fluency: {pron.get('fluencyScore')}, "
        f"Completeness: {pron.get('completenessScore')}"
    )


def _build_user_content(state: FeedbackState) -> str:
    pron_ctx = state.get("pron_context", "")
    if state.get("stimulus"):
        return f"Stimulus:\n{state['stimulus']}\n\nCandidate response:\n{state['response'].strip()}{pron_ctx}"
    return f"Candidate response:\n{state['response'].strip()}{pron_ctx}"


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

async def retrieve_context_node(state: FeedbackState) -> dict:
    ctx = await rag_retrieve(state["task_type"])
    return {"retrieved_context": ctx}


async def process_pronunciation_node(state: FeedbackState) -> dict:
    """Format the pronunciation assessment dict into a context string for the LLM nodes."""
    return {"pron_context": _format_pron_context(state.get("pron_assessment"))}


async def call_primary_node(state: FeedbackState) -> dict:
    system = _build_primary_system(state["task_type"], state.get("retrieved_context", ""))
    user = _build_user_content(state)
    raw = await llm_chain.ainvoke(
        system=system,
        user=user,
        temperature=0.3,
        max_tokens=1200,
        json_mode=True,
        timeout=60.0,
    )
    return {"primary_result": _try_parse(raw or "")}


async def call_judge_node(state: FeedbackState) -> dict:
    judge_sys = _judge_system(state["task_type"])
    if not judge_sys:
        return {"judge_result": None}
    try:
        user = _build_user_content(state)
        raw = await llm_chain.ainvoke(
            system=judge_sys,
            user=user,
            temperature=0.3,
            max_tokens=200,
            json_mode=True,
            timeout=30.0,
        )
        return {"judge_result": _try_parse(raw or "")}
    except Exception:
        return {"judge_result": None}


async def check_divergence_node(state: FeedbackState) -> dict:
    primary = state.get("primary_result")
    judge = state.get("judge_result")
    if not primary or not judge:
        return {"diverged": []}
    p_scores = _extract_scores(primary)
    j_scores = _extract_scores(judge)
    if not p_scores or not j_scores:
        return {"diverged": []}
    return {"diverged": _find_divergences(p_scores, j_scores)}


def _route_after_divergence(state: FeedbackState) -> str:
    return "retry_primary" if state.get("diverged") else "finalize"


async def retry_primary_node(state: FeedbackState) -> dict:
    diverged = state["diverged"]
    user = _build_user_content(state) + "\n\n" + prompts.build_retry_note(diverged)
    system = _build_primary_system(state["task_type"], state.get("retrieved_context", ""))
    try:
        raw = await llm_chain.ainvoke(
            system=system,
            user=user,
            temperature=0.3,
            max_tokens=1200,
            json_mode=True,
            timeout=60.0,
        )
        parsed = _try_parse(raw or "")
        if parsed:
            return {"primary_result": parsed, "retry_count": state.get("retry_count", 0) + 1}
    except Exception:
        pass
    return {"retry_count": state.get("retry_count", 0) + 1}


_COVERAGE_TASKS = {"read_aloud", "repeat_sentence"}


def _word_coverage_ratio(stimulus: str, response: str) -> float:
    """Fraction of unique stimulus words found in the response (case-insensitive)."""
    import re as _re
    def _tokens(text: str) -> set:
        return set(_re.sub(r"[^\w\s]", "", text.lower()).split())
    s_words = _tokens(stimulus)
    r_words = _tokens(response)
    if not s_words:
        return 1.0
    return len(s_words & r_words) / len(s_words)


def _apply_content_coverage(task_type: str, state: FeedbackState, result: dict) -> dict:
    """Cap content score by actual word coverage for read-verbatim speaking tasks."""
    if task_type not in _COVERAGE_TASKS:
        return result
    stimulus = state.get("stimulus", "")
    response = state.get("response", "")
    if not stimulus or not response:
        return result

    # Azure completenessScore is most accurate (word-level alignment)
    pron = state.get("pron_assessment")
    if pron and isinstance(pron.get("completenessScore"), (int, float)):
        coverage = pron["completenessScore"] / 100
    else:
        coverage = _word_coverage_ratio(stimulus, response)

    ds = result.get("dimensionScores")
    if not isinstance(ds, dict) or ds.get("section") != "speaking":
        return result

    original_content = ds.get("content", 100)
    capped_content = min(original_content, round(coverage * 100))
    if capped_content >= original_content:
        return result

    result = dict(result)
    result["dimensionScores"] = {**ds, "content": capped_content}
    logger.info(
        "[coverage-correction] task=%s coverage=%.2f content %d→%d",
        task_type, coverage, original_content, capped_content,
    )

    # Recompute scoreCard with corrected content
    max_score = _TASK_SCORE_MAX.get(task_type)
    if max_score:
        avg = (ds.get("fluency", 0) + ds.get("pronunciation", 0) + capped_content) / 3
        result["scoreCard"] = {"earned": round(avg / 100 * max_score), "max": max_score}

    return result


def _compute_score_card_from_dims(task_type: str, result: dict) -> Optional[dict]:
    max_score = _TASK_SCORE_MAX.get(task_type)
    if max_score is None:
        return None
    ds = result.get("dimensionScores")
    if not isinstance(ds, dict):
        return None
    section = ds.get("section")
    dim_keys = {
        "speaking":  ["fluency", "pronunciation", "content"],
        "writing":   ["grammar", "vocabulary", "form", "content"],
        "listening": ["comprehension", "accuracy"],
    }.get(section, [])
    values = [ds[k] for k in dim_keys if isinstance(ds.get(k), (int, float))]
    if not values:
        return None
    avg = sum(values) / len(values)
    return {"earned": round(avg / 100 * max_score), "max": max_score}


async def finalize_node(state: FeedbackState) -> dict:
    result = dict(state.get("primary_result") or {})
    pron = state.get("pron_assessment")
    if pron:
        result["pronunciationAssessment"] = pron
    score_card = _compute_score_card_from_dims(state["task_type"], result)
    if score_card:
        result["scoreCard"] = score_card
    # Must run after initial scoreCard so coverage correction can overwrite it
    result = _apply_content_coverage(state["task_type"], state, result)
    diverged = state.get("diverged", [])
    if diverged:
        judge_log = {
            "taskType": state["task_type"],
            "divergedDimensions": diverged,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        result["judgeLog"] = judge_log
        logger.warning("[LLM-as-Judge] Divergence logged: %s", judge_log)
    # Per-request quality metric: divergence rate vs. RAG grounding can be
    # compared by aggregating these lines before/after seeding the vector store.
    logger.info(
        "[feedback-graph] task_type=%s rag_chars=%d diverged=%d retried=%d",
        state["task_type"],
        len(state.get("retrieved_context", "")),
        len(diverged),
        state.get("retry_count", 0),
    )
    return {"final_result": result}


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def _build_graph():
    builder = StateGraph(FeedbackState)

    builder.add_node("retrieve_context", retrieve_context_node)
    builder.add_node("process_pronunciation", process_pronunciation_node)
    builder.add_node("call_primary", call_primary_node)
    builder.add_node("call_judge", call_judge_node)
    builder.add_node("check_divergence", check_divergence_node)
    builder.add_node("retry_primary", retry_primary_node)
    builder.add_node("finalize", finalize_node)

    builder.set_entry_point("retrieve_context")
    # retrieve_context → process_pronunciation (format pron data before LLM calls)
    builder.add_edge("retrieve_context", "process_pronunciation")
    # Fan-out: process_pronunciation → call_primary ‖ call_judge (parallel)
    builder.add_edge("process_pronunciation", "call_primary")
    builder.add_edge("process_pronunciation", "call_judge")
    # Fan-in: both complete → check_divergence
    builder.add_edge("call_primary", "check_divergence")
    builder.add_edge("call_judge", "check_divergence")
    # Conditional edge: diverged → retry, else → finalize
    builder.add_conditional_edges(
        "check_divergence",
        _route_after_divergence,
        {"retry_primary": "retry_primary", "finalize": "finalize"},
    )
    builder.add_edge("retry_primary", "finalize")
    builder.add_edge("finalize", END)

    return builder.compile()


_graph = _build_graph()


def _compute_reading_feedback(task_type: str, response: str) -> dict:
    """Deterministic feedback for reading tasks — no LLM call needed."""
    import re as _re

    if task_type == "fill_in_the_blanks_reading":
        lines = [l.strip() for l in response.strip().splitlines() if l.strip()]
        correct = sum(1 for l in lines if "✓" in l)
        total = len(lines)
        score = round(correct / total * 100) if total > 0 else 0

        wrong_blanks = [_re.search(r"(Blank \d+)", l).group(1) for l in lines if "✗" in l and _re.search(r"Blank \d+", l)]
        accuracy_text = f"共 {total} 个空白，答对 {correct} 个。"
        if wrong_blanks:
            accuracy_text += f"错误项：{', '.join(wrong_blanks)}。"

        return {
            "summary": f"本次作答答对 {correct}/{total} 个空白，得分约 {score} 分。",
            "strengths": [f"正确填入 {correct} 个词汇"] if correct > 0 else [],
            "weaknesses": [f"有 {total - correct} 个空白填写有误"] if correct < total else [],
            "suggestions": ["复习题目中出错的词汇，注意结合上下文语义选词。"] if correct < total else ["词汇运用准确，继续保持关注上下文语境的好习惯。"],
            "details": {
                "taskType": "fill_in_the_blanks_reading",
                "accuracy": accuracy_text,
                "vocabulary": "请回顾错误选项，分析在上下文中哪个词语更符合句意。" if correct < total else "词汇运用准确，语境理解良好。",
            },
            "dimensionScores": {"section": "reading", "vocabulary": score, "comprehension": score},
            "scoreCard": {"earned": correct, "max": total},
        }

    if task_type == "re_order_paragraphs":
        m = _re.search(r"(\d+) of (\d+) paragraphs in the correct position", response)
        correct, total = (int(m.group(1)), int(m.group(2))) if m else (0, 1)
        score = round(correct / total * 100) if total > 0 else 0

        return {
            "summary": f"共 {total} 个段落，{correct} 个位置正确，得分约 {score} 分。",
            "strengths": [f"正确排列了 {correct} 个段落"] if correct > 0 else [],
            "weaknesses": [f"{total - correct} 个段落顺序有误"] if correct < total else [],
            "suggestions": ["注意段落首句的衔接词和指代关系，判断段落之间的逻辑顺序。"] if correct < total else ["段落排列顺序正确，语篇结构理解良好。"],
            "details": {
                "taskType": "re_order_paragraphs",
                "orderAccuracy": f"提交顺序中 {correct}/{total} 个段落位置正确。",
                "logicFeedback": "建议重点关注衔接词（首先、其次、因此等）和指代词，帮助判断段落逻辑顺序。" if correct < total else "段落排列正确，说明对语篇逻辑结构理解良好。",
            },
            "dimensionScores": {"section": "reading", "vocabulary": min(score + 10, 100), "comprehension": score},
            "scoreCard": {"earned": correct, "max": total},
        }

    if task_type == "multiple_choice_reading":
        is_correct = "✓" in response
        score = 100 if is_correct else 0

        return {
            "summary": "回答正确！阅读理解准确。" if is_correct else "回答有误，请仔细阅读原文后重试。",
            "strengths": ["准确理解了文章主旨，选择了正确答案"] if is_correct else [],
            "weaknesses": [] if is_correct else ["对文章主旨或细节理解存在偏差"],
            "suggestions": ["继续保持，注意区分主旨与支撑细节。"] if is_correct else ["重新阅读原文，注意区分各选项与原文的对应关系，避免被干扰项误导。"],
            "details": {
                "taskType": "multiple_choice_reading",
                "answerAccuracy": "答案正确。" if is_correct else "答案有误，请参考正确选项重新理解文章。",
                "readingComprehension": "理解准确，抓住了文章的关键信息。" if is_correct else "建议仔细对比各选项与原文的对应关系，排除干扰项。",
            },
            "dimensionScores": {"section": "reading", "vocabulary": 75 if is_correct else 40, "comprehension": score},
            "scoreCard": {"earned": 1 if is_correct else 0, "max": 1},
        }

    return {}


async def run_feedback_graph(request) -> dict:
    """Run the feedback pipeline and return the merged final result dict."""
    if request.taskType in SCORED_READING:
        return _compute_reading_feedback(request.taskType, request.response.strip())

    initial_state: FeedbackState = {
        "task_type": request.taskType,
        "stimulus": request.stimulus or "",
        "response": request.response.strip(),
        "pron_assessment": request.pronunciationAssessment,
        "pron_context": "",
        "retrieved_context": "",
        "primary_result": None,
        "judge_result": None,
        "diverged": [],
        "retry_count": 0,
        "final_result": {},
    }
    result = await _graph.ainvoke(initial_state)
    return result.get("final_result") or {}
