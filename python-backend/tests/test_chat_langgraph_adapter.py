from types import SimpleNamespace

import pytest

from app.core.exceptions import ServiceUnavailableError
from app.models.chat import ChatContext, ChatMemoryItem, ChatOutlineItem
from app.services.chat_langgraph_adapter import LangGraphChatModelAdapter


def make_adapter(**overrides):
    defaults = {
        "base_url": "https://api.example.com/v1",
        "api_key": "secret-key",
        "model": "moonshot-v1-32k",
        "timeout_seconds": 5,
    }
    defaults.update(overrides)
    return LangGraphChatModelAdapter(**defaults)


def make_context():
    return ChatContext(
        latest_user_message="Which retrieved chunks mention chunking quality?",
        analysis_summary="This video explains why chunking changes retrieval quality.",
        transcript_excerpt="[00:18] Chunking affects recall. [00:42] Better chunking improves retrieval precision.",
        outline=[
            ChatOutlineItem(time="00:18", text="Chunking and recall"),
            ChatOutlineItem(time="00:42", text="Precision trade-offs"),
        ],
        key_points=[
            "Chunk size changes semantic recall.",
            "Chunk overlap improves follow-up grounding.",
        ],
        memory_items=[
            ChatMemoryItem(
                kind="retrieved_chunk",
                content="Chunking affects recall and precision in retrieval systems.",
                metadata={
                    "chunkIndex": 3,
                    "startSeconds": 18,
                    "endSeconds": 26,
                    "score": 0.82,
                },
            ),
            ChatMemoryItem(
                kind="retrieved_chunk",
                content="Overlap can improve retrieval quality for follow-up questions.",
                metadata={
                    "chunkIndex": 4,
                    "startSeconds": 42,
                    "endSeconds": 49,
                    "score": 0.74,
                },
            ),
            ChatMemoryItem(
                kind="project_decision",
                content="Use transcript-grounded answers.",
                metadata={"importance": 0.8},
            ),
        ],
        conversation_summary="The user is focusing on retrieval quality.",
        assembled_context="Context block",
    )


def test_generate_returns_none_when_adapter_not_configured():
    adapter = make_adapter(base_url="", api_key="", model="")
    context = make_context()

    assert adapter.generate("system", "user", context) is None


def test_generate_raises_when_graph_returns_empty_answer(monkeypatch):
    adapter = make_adapter()
    context = make_context()

    class FakeGraph:
        def invoke(self, _state, config=None):
            return {"messages": [SimpleNamespace(content="", tool_calls=[])]}

    monkeypatch.setattr(
        adapter,
        "_build_graph",
        lambda **kwargs: (FakeGraph(), {"messages": []}),
    )

    with pytest.raises(ServiceUnavailableError, match="empty final answer"):
        adapter.generate("system prompt", "user prompt", context)


def test_search_retrieved_chunks_tool_prefers_relevant_chunk():
    adapter = make_adapter()
    context = make_context()

    def tool_decorator(fn):
        class FakeTool:
            def __init__(self, callable_):
                self.func = callable_
                self.name = callable_.__name__

            def invoke(self, args):
                return self.func(**args)

        return FakeTool(fn)

    tools = adapter._build_tools(context, tool_decorator)
    search_tool = next(tool for tool in tools if tool.name == "search_retrieved_chunks")

    result = search_tool.invoke({"query": "chunking recall precision"})

    assert "Chunk 3" in result
    assert "00:18 - 00:26" in result
    assert "Chunking affects recall and precision" in result


def test_extract_final_text_skips_tool_call_messages():
    adapter = make_adapter()
    messages = [
        SimpleNamespace(content="Need to inspect evidence", tool_calls=[{"name": "search_retrieved_chunks"}]),
        SimpleNamespace(content="Final grounded answer", tool_calls=[]),
    ]

    assert adapter._extract_final_text(messages) == "Final grounded answer"
