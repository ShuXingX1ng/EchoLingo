"""
Unit tests for the Study Assistant backend.

Covers:
  - Recency gate: "news" vs "exemplars" source selection from user message
  - Route allow-list filtering drops invalid routes
  - Text-only guard rejects audio Task Types in generate_practice tool
  - GNews failure → silent fallback to exemplars in stimulus_service
  - navigate_app and pte_knowledge happy paths (tool output structure)

All external calls (LLM, GNews httpx) are mocked — no network or API keys needed.
Mocking style mirrors test_onboarding_graph.py and test_feedback_graph.py.
"""

import json
import sys
import types
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Stub heavy optional dependencies before any project imports ───────────────

def _stub_vecs():
    vecs_mod = types.ModuleType("vecs")
    vecs_mod.create_client = MagicMock()
    sys.modules.setdefault("vecs", vecs_mod)


_stub_vecs()


# ── Module imports (after stubs) ──────────────────────────────────────────────

import services.study_assistant_graph as sag  # noqa: E402
import tools.study_assistant_tools as sat      # noqa: E402
import services.stimulus_service as ss         # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_msg(content: str) -> dict:
    return {"role": "user", "content": content}


def _assistant_msg(content: str) -> dict:
    return {"role": "assistant", "content": content}


# Minimal LangChain AIMessage-like object with no tool calls
class _FakeAIMessage:
    def __init__(self, content: str):
        self.content = content
        self.tool_calls = []


# ── 1. Recency gate tests ─────────────────────────────────────────────────────

class TestRecencyGate:
    """_detect_source() should return 'news' on recency cues, 'exemplars' otherwise."""

    def test_default_no_cue(self):
        msgs = [_user_msg("Write an essay about climate change")]
        assert sag._detect_source(msgs) == "exemplars"

    def test_recent_cue(self):
        msgs = [_user_msg("Give me the most recent news about AI")]
        assert sag._detect_source(msgs) == "news"

    def test_latest_cue(self):
        msgs = [_user_msg("latest developments in technology")]
        assert sag._detect_source(msgs) == "news"

    def test_current_cue(self):
        msgs = [_user_msg("current events in economics")]
        assert sag._detect_source(msgs) == "news"

    def test_news_cue(self):
        msgs = [_user_msg("I want to practise with news topics")]
        assert sag._detect_source(msgs) == "news"

    def test_real_time_cue(self):
        msgs = [_user_msg("real-time updates on environment")]
        assert sag._detect_source(msgs) == "news"

    def test_chinese_news_cue(self):
        msgs = [_user_msg("给我最近新闻的话题来练习")]
        assert sag._detect_source(msgs) == "news"

    def test_chinese_realtime_cue(self):
        msgs = [_user_msg("实时新闻练习")]
        assert sag._detect_source(msgs) == "news"

    def test_chinese_latest_event_cue(self):
        msgs = [_user_msg("基于最新事件出题")]
        assert sag._detect_source(msgs) == "news"

    def test_case_insensitive(self):
        msgs = [_user_msg("LATEST news on space exploration")]
        assert sag._detect_source(msgs) == "news"

    def test_only_last_user_message_checked(self):
        """Earlier user messages with cues should not override a clean final message."""
        msgs = [
            _user_msg("latest news please"),
            _assistant_msg("Here are some links."),
            _user_msg("Now write an essay about climate"),
        ]
        assert sag._detect_source(msgs) == "exemplars"

    def test_only_user_role_checked(self):
        """Recency cues in assistant messages should not trigger news source."""
        msgs = [
            _assistant_msg("latest news is very interesting"),
            _user_msg("write essay about health"),
        ]
        assert sag._detect_source(msgs) == "exemplars"


# ── 2. Route allow-list filtering ─────────────────────────────────────────────

class TestRouteAllowlist:
    """filter_links() must drop any route not in the allow-list."""

    def test_valid_routes_pass_through(self):
        links = [
            {"label": "Practice", "route": "/practice"},
            {"label": "Write Essay", "route": "/practice/write-essay"},
        ]
        result = sat.filter_links(links)
        assert len(result) == 2

    def test_invalid_route_dropped(self):
        links = [
            {"label": "Home", "route": "/"},
            {"label": "Invented", "route": "/admin/secret"},
        ]
        result = sat.filter_links(links)
        assert len(result) == 1
        assert result[0]["route"] == "/"

    def test_all_invalid_returns_empty(self):
        links = [
            {"label": "Bad", "route": "/nonexistent"},
            {"label": "Also bad", "route": "/api/internal"},
        ]
        result = sat.filter_links(links)
        assert result == []

    def test_empty_input_returns_empty(self):
        assert sat.filter_links([]) == []

    def test_all_top_level_routes_allowed(self):
        top_level = ["/", "/practice", "/mock", "/history", "/stats", "/vocabulary", "/settings"]
        for route in top_level:
            links = [{"label": "x", "route": route}]
            assert sat.filter_links(links) == links, f"Expected {route} to be allowed"

    def test_task_deep_routes_allowed(self):
        deep = [
            "/practice/read-aloud",
            "/practice/summarize-written-text",
            "/practice/write-essay",
            "/practice/fill-in-the-blanks",
            "/practice/re-order-paragraphs",
            "/practice/multiple-choice",
            "/practice/highlight-correct-summary",
        ]
        for route in deep:
            links = [{"label": "x", "route": route}]
            assert sat.filter_links(links) == links, f"Expected {route} to be allowed"


# ── 3. Text-only guard in generate_practice ───────────────────────────────────

class TestTextOnlyGuard:
    """generate_practice tool must reject audio-only Task Types."""

    def test_audio_type_repeat_sentence_rejected(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "nature", "task_type": "repeat_sentence"}))
        assert "error" in result
        assert "audio" in result["error"].lower()

    def test_audio_type_write_from_dictation_rejected(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "science", "task_type": "write_from_dictation"}))
        assert "error" in result

    def test_audio_type_describe_image_rejected(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "charts", "task_type": "describe_image"}))
        assert "error" in result

    def test_audio_type_personal_intro_rejected(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "intro", "task_type": "personal_intro"}))
        assert "error" in result

    def test_text_type_write_essay_accepted(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "environment", "task_type": "write_essay"}))
        assert "error" not in result
        assert result["taskType"] == "write_essay"
        assert result["taskSlug"] == "write-essay"
        assert "environment" in result["route"]
        assert "mode=theme" in result["route"]

    def test_text_type_swt_accepted(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "technology", "task_type": "summarize_written_text"}))
        assert "error" not in result
        assert result["taskSlug"] == "summarize-written-text"

    def test_text_type_multiple_choice_accepted(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "health", "task_type": "multiple_choice_reading"}))
        assert "error" not in result
        assert result["taskSlug"] == "multiple-choice"

    def test_unknown_type_rejected(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "art", "task_type": "unknown_task"}))
        assert "error" in result

    def test_topic_url_encoded_in_route(self):
        result = json.loads(sat.generate_practice.invoke({"topic": "climate change", "task_type": "write_essay"}))
        assert "error" not in result
        # Spaces should be encoded
        assert " " not in result["route"]
        assert "climate" in result["route"]


# ── 4. GNews failure → fallback to exemplars in stimulus_service ─────────────

class TestGNewsFailureFallback:
    """
    When GNews returns [] (any failure), stimulus_service must silently fall
    back to the Exemplar path — never raise, never propagate an error.
    """

    @pytest.mark.asyncio
    async def test_gnews_returns_empty_falls_back_to_exemplars(self):
        """Empty GNews result → fallback to retrieve() Exemplar path."""
        with (
            patch("services.stimulus_service.fetch_news_anchors", new_callable=AsyncMock) as mock_news,
            patch("services.stimulus_service.retrieve", new_callable=AsyncMock) as mock_retrieve,
            patch("services.stimulus_service._generate", new_callable=AsyncMock) as mock_gen,
        ):
            mock_news.return_value = []  # GNews empty
            mock_retrieve.return_value = []  # no Exemplars either
            mock_gen.return_value = "Generated stimulus text."

            result = await ss.generate_stimulus(
                "write_essay", mode="theme", topic="climate", source="news"
            )

        assert result == "Generated stimulus text."
        mock_news.assert_awaited_once_with("climate", n=ss.FEWSHOT_N)
        # Must still attempt exemplar retrieval after GNews empty
        mock_retrieve.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_gnews_returns_anchors_uses_them_for_generation(self):
        """When GNews returns anchors, they are used as few-shot seeds."""
        news_anchors = [
            "Climate crisis deepens — Record temperatures recorded globally.",
            "Renewable energy — Solar capacity doubles in 2024.",
        ]
        with (
            patch("services.stimulus_service.fetch_news_anchors", new_callable=AsyncMock) as mock_news,
            patch("services.stimulus_service._generate", new_callable=AsyncMock) as mock_gen,
            patch("services.stimulus_service.is_too_similar", return_value=False),
        ):
            mock_news.return_value = news_anchors
            mock_gen.return_value = "Original news-seeded stimulus."

            result = await ss.generate_stimulus(
                "write_essay", mode="theme", topic="climate", source="news"
            )

        assert result == "Original news-seeded stimulus."
        mock_news.assert_awaited_once_with("climate", n=ss.FEWSHOT_N)
        # _generate should be called once with news anchors as few-shot context
        mock_gen.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_gnews_originality_guard_triggers_regeneration(self):
        """If generated text is too similar to news anchors, regenerate once."""
        news_anchors = ["Climate crisis — Record temperatures."]
        with (
            patch("services.stimulus_service.fetch_news_anchors", new_callable=AsyncMock) as mock_news,
            patch("services.stimulus_service._generate", new_callable=AsyncMock) as mock_gen,
            patch("services.stimulus_service.is_too_similar", return_value=True),
        ):
            mock_news.return_value = news_anchors
            mock_gen.return_value = "Regenerated stimulus."

            result = await ss.generate_stimulus(
                "write_essay", mode="theme", topic="climate", source="news"
            )

        assert result == "Regenerated stimulus."
        assert mock_gen.await_count == 2  # original + one retry

    @pytest.mark.asyncio
    async def test_source_exemplars_does_not_call_gnews(self):
        """Default source='exemplars' must never call GNews."""
        with (
            patch("services.stimulus_service.fetch_news_anchors", new_callable=AsyncMock) as mock_news,
            patch("services.stimulus_service.retrieve", new_callable=AsyncMock) as mock_retrieve,
            patch("services.stimulus_service._generate", new_callable=AsyncMock) as mock_gen,
        ):
            mock_retrieve.return_value = []
            mock_gen.return_value = "Exemplar-path stimulus."

            result = await ss.generate_stimulus(
                "write_essay", mode="theme", topic="environment", source="exemplars"
            )

        assert result == "Exemplar-path stimulus."
        mock_news.assert_not_awaited()


# ── 5. navigate_app and pte_knowledge happy paths ─────────────────────────────

class TestToolHappyPaths:
    """Basic structural tests for the two knowledge tools."""

    def test_navigate_app_returns_json_with_feature_summary(self):
        raw = sat.navigate_app.invoke({"query": "Where can I see my progress?"})
        parsed = json.loads(raw)
        assert "feature_summary" in parsed
        assert "routes" in parsed
        assert "query" in parsed
        assert parsed["query"] == "Where can I see my progress?"

    def test_navigate_app_routes_contains_slash_practice(self):
        raw = sat.navigate_app.invoke({"query": "how to practise?"})
        parsed = json.loads(raw)
        assert "/practice" in parsed["routes"]

    def test_pte_knowledge_returns_json_with_faq_context(self):
        raw = sat.pte_knowledge.invoke({"query": "How is Write Essay scored?"})
        parsed = json.loads(raw)
        assert "faq_context" in parsed
        assert "query" in parsed
        assert len(parsed["faq_context"]) > 50  # non-trivial content

    def test_pte_knowledge_contains_write_essay_info(self):
        raw = sat.pte_knowledge.invoke({"query": "Write Essay scoring"})
        parsed = json.loads(raw)
        # The FAQ should mention Write Essay scoring dimensions
        assert "Write Essay" in parsed["faq_context"] or "essay" in parsed["faq_context"].lower()

    def test_generate_practice_route_has_correct_slug(self):
        result = json.loads(sat.generate_practice.invoke({
            "topic": "artificial intelligence",
            "task_type": "write_essay",
        }))
        assert result["taskSlug"] == "write-essay"
        assert result["route"].startswith("/practice/write-essay")

    def test_generate_practice_source_default_is_exemplars(self):
        """Tool always returns source='exemplars'; graph node injects 'news' if needed."""
        result = json.loads(sat.generate_practice.invoke({
            "topic": "technology",
            "task_type": "read_aloud",
        }))
        assert result["source"] == "exemplars"


# ── 6. GNews adapter unit tests ───────────────────────────────────────────────

class TestGNewsAdapter:
    """Test gnews.fetch_news_anchors directly."""

    @pytest.mark.asyncio
    async def test_missing_api_key_returns_empty(self):
        """No GNEWS_API_KEY → return [] without raising."""
        with patch.dict("os.environ", {}, clear=False):
            import os
            old_val = os.environ.pop("GNEWS_API_KEY", None)
            try:
                from services.gnews import fetch_news_anchors
                result = await fetch_news_anchors("climate")
                assert result == []
            finally:
                if old_val is not None:
                    os.environ["GNEWS_API_KEY"] = old_val

    @pytest.mark.asyncio
    async def test_successful_fetch_returns_anchor_strings(self):
        """A successful GNews response returns 'title — summary' strings."""
        fake_response = {
            "articles": [
                {"title": "Climate crisis deepens", "description": "Record temperatures worldwide."},
                {"title": "Renewable energy surge", "description": "Solar capacity doubles."},
            ]
        }

        mock_resp = MagicMock()
        mock_resp.json.return_value = fake_response
        mock_resp.raise_for_status = MagicMock()

        with (
            patch.dict("os.environ", {"GNEWS_API_KEY": "test-key"}),
            patch("httpx.AsyncClient") as mock_client_cls,
        ):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from services.gnews import fetch_news_anchors
            result = await fetch_news_anchors("climate", n=2)

        assert len(result) == 2
        assert "Climate crisis deepens" in result[0]
        assert "Record temperatures worldwide." in result[0]

    @pytest.mark.asyncio
    async def test_timeout_returns_empty(self):
        """A timeout error returns [] without raising."""
        with (
            patch.dict("os.environ", {"GNEWS_API_KEY": "test-key"}),
            patch("httpx.AsyncClient") as mock_client_cls,
        ):
            mock_client = AsyncMock()
            import httpx as _httpx
            mock_client.get = AsyncMock(side_effect=_httpx.TimeoutException("timeout"))
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from services.gnews import fetch_news_anchors
            result = await fetch_news_anchors("climate")

        assert result == []

    @pytest.mark.asyncio
    async def test_empty_articles_returns_empty(self):
        """GNews response with no articles returns []."""
        fake_response = {"articles": []}

        mock_resp = MagicMock()
        mock_resp.json.return_value = fake_response
        mock_resp.raise_for_status = MagicMock()

        with (
            patch.dict("os.environ", {"GNEWS_API_KEY": "test-key"}),
            patch("httpx.AsyncClient") as mock_client_cls,
        ):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from services.gnews import fetch_news_anchors
            result = await fetch_news_anchors("unknown_topic")

        assert result == []
