"""Coach tool: expose the learner's historical dimension scores as a callable tool."""

from typing import Optional

from langchain_core.tools import StructuredTool


def make_weakness_tool(historical_weaknesses: Optional[dict]) -> StructuredTool:
    """Build a per-request tool that returns the learner's historical weakness data."""

    def get_user_weaknesses() -> str:
        """Return the learner's historical average dimension scores for this task type.
        Lower scores indicate persistent weak areas that need more coaching attention."""
        if not historical_weaknesses:
            return "No historical data available for this learner yet."
        parts = [
            f"{dim}: {int(score)}/100"
            for dim, score in sorted(historical_weaknesses.items(), key=lambda x: x[1])
        ]
        return "Historical dimension averages (lower = weaker): " + ", ".join(parts)

    return StructuredTool.from_function(
        func=get_user_weaknesses,
        name="get_user_weaknesses",
        description=(
            "Return the learner's historical average dimension scores for the current task type. "
            "Call this first to identify persistent weak areas before consulting the rubric."
        ),
    )
