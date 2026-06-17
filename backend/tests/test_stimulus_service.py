"""
Unit tests for services/stimulus_service.py — the three-tier fallback chain and
the originality guard. retrieve / get_verbatim / the LLM are all mocked.
"""

import pytest
from unittest.mock import AsyncMock, patch

import services.stimulus_service as svc
from services.exemplar_store import Exemplar
from services.stimulus_service import generate_stimulus


def _ex(text: str, task_type: str = "read_aloud") -> Exemplar:
    return Exemplar(id="x", task_type=task_type, text=text)


# ── Tier 0: verbatim ────────────────────────────────────────────────────────────

class TestVerbatim:
    @pytest.mark.anyio
    async def test_verbatim_returns_exemplar_without_generation(self):
        with (
            patch.object(svc, "get_verbatim", AsyncMock(return_value=_ex("Real question text."))),
            patch.object(svc.llm_chain, "ainvoke", new_callable=AsyncMock) as mock_llm,
            patch.object(svc, "retrieve", AsyncMock(return_value=[])),
        ):
            result = await generate_stimulus("read_aloud", verbatim=True)

        assert result == "Real question text."
        mock_llm.assert_not_called()

    @pytest.mark.anyio
    async def test_verbatim_miss_falls_through_to_generation(self):
        with (
            patch.object(svc, "get_verbatim", AsyncMock(return_value=None)),
            patch.object(svc, "retrieve", AsyncMock(return_value=[])),
            patch.object(svc.llm_chain, "ainvoke", AsyncMock(return_value="Generated.")) as mock_llm,
        ):
            result = await generate_stimulus("read_aloud", verbatim=True)

        assert result == "Generated."
        mock_llm.assert_called_once()


# ── Tier 2/3: pure-AI fallback (empty bank) ─────────────────────────────────────

class TestPureAiFallback:
    @pytest.mark.anyio
    async def test_empty_bank_uses_base_prompt(self):
        with (
            patch.object(svc, "retrieve", AsyncMock(return_value=[])),
            patch.object(svc.llm_chain, "ainvoke", AsyncMock(return_value="AI text.")) as mock_llm,
        ):
            result = await generate_stimulus("read_aloud", mode="random")

        assert result == "AI text."
        # User prompt is exactly the base task prompt — no few-shot anchors injected.
        assert mock_llm.call_args.kwargs["user"] == svc.prompts.stimulus_tasks["read_aloud"]
        assert mock_llm.call_args.kwargs["json_mode"] is False

    @pytest.mark.anyio
    async def test_json_task_empty_bank_uses_json_mode(self):
        with (
            patch.object(svc, "retrieve", AsyncMock(return_value=[])),
            patch.object(svc.llm_chain, "ainvoke", AsyncMock(return_value='{"passage":"x"}')) as mock_llm,
        ):
            await generate_stimulus("fill_in_the_blanks_reading")
        assert mock_llm.call_args.kwargs["json_mode"] is True
        assert mock_llm.call_args.kwargs["max_tokens"] == 800


# ── Tier 1: Exemplar-grounded generation ────────────────────────────────────────

class TestGroundedGeneration:
    @pytest.mark.anyio
    async def test_exemplars_injected_as_fewshot(self):
        exemplars = [_ex("Anchor one passage."), _ex("Anchor two passage.")]
        with (
            patch.object(svc, "retrieve", AsyncMock(return_value=exemplars)),
            patch.object(svc.llm_chain, "ainvoke", AsyncMock(return_value="Fresh original.")) as mock_llm,
        ):
            result = await generate_stimulus("read_aloud", mode="random")

        assert result == "Fresh original."
        user = mock_llm.call_args.kwargs["user"]
        assert "Anchor one passage." in user
        assert "Anchor two passage." in user
        assert svc.prompts.stimulus_tasks["read_aloud"] in user

    @pytest.mark.anyio
    async def test_theme_mode_injects_topic_directive(self):
        with (
            patch.object(svc, "retrieve", AsyncMock(return_value=[_ex("Anchor.")])),
            patch.object(svc.llm_chain, "ainvoke", AsyncMock(return_value="Themed original.")) as mock_llm,
        ):
            await generate_stimulus("read_aloud", mode="theme", topic="environment")
        user = mock_llm.call_args.kwargs["user"]
        assert "environment" in user


# ── Originality guard ───────────────────────────────────────────────────────────

class TestOriginalityGuard:
    @pytest.mark.anyio
    async def test_too_similar_triggers_one_regeneration(self):
        anchor = "renewable energy adoption has accelerated across developed nations recently here"
        # First generation copies the anchor verbatim (trips guard); second is original.
        gens = AsyncMock(side_effect=[anchor, "An entirely different fresh passage about marine life."])
        with (
            patch.object(svc, "retrieve", AsyncMock(return_value=[_ex(anchor)])),
            patch.object(svc.llm_chain, "ainvoke", gens),
        ):
            result = await generate_stimulus("read_aloud")

        assert result == "An entirely different fresh passage about marine life."
        assert gens.call_count == 2

    @pytest.mark.anyio
    async def test_original_first_try_no_regeneration(self):
        anchor = "renewable energy adoption has accelerated across developed nations recently here"
        gens = AsyncMock(return_value="A completely unrelated passage about coral reef ecosystems today.")
        with (
            patch.object(svc, "retrieve", AsyncMock(return_value=[_ex(anchor)])),
            patch.object(svc.llm_chain, "ainvoke", gens),
        ):
            result = await generate_stimulus("read_aloud")

        assert result == "A completely unrelated passage about coral reef ecosystems today."
        assert gens.call_count == 1

    @pytest.mark.anyio
    async def test_regenerates_only_once_even_if_still_similar(self):
        anchor = "renewable energy adoption has accelerated across developed nations recently here"
        gens = AsyncMock(side_effect=[anchor, anchor])  # both copies — guard fires once, keeps 2nd
        with (
            patch.object(svc, "retrieve", AsyncMock(return_value=[_ex(anchor)])),
            patch.object(svc.llm_chain, "ainvoke", gens),
        ):
            result = await generate_stimulus("read_aloud")

        assert result == anchor
        assert gens.call_count == 2
