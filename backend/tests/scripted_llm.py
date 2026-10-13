"""A scripted stand-in for `ChatOpenAI`.

Patch it over `services.llm_chain.ChatOpenAI` — the only place a model client
is built — to drive any caller of the LLM module without a network.
"""

from langchain_core.messages import AIMessage


def tool_call(name: str, args: dict, call_id: str = "call-1") -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])


class ScriptedChatModel:
    """Answers with the queued replies in order and records what it was asked."""

    def __init__(self, *replies):
        self.replies = [AIMessage(content=r) if isinstance(r, str) else r for r in replies]
        self.constructed: list[dict] = []
        self.conversations: list[list] = []
        self.bound_tools: list = []

    def __call__(self, **kwargs):
        self.constructed.append(kwargs)
        return self

    def bind_tools(self, tools):
        self.bound_tools = list(tools)
        return self

    async def ainvoke(self, messages):
        self.conversations.append(list(messages))
        return self.replies.pop(0)
