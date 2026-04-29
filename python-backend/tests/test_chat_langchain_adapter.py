from dataclasses import dataclass
from typing import ClassVar

import pytest

from app.core.exceptions import ServiceUnavailableError
from app.models.chat import ChatContext
from app.services.chat_langchain_adapter import LangChainChatModelAdapter


def make_adapter(**overrides):
    defaults = {
        "base_url": "https://api.example.com/v1/chat/completions",
        "api_key": "secret-key",
        "model": "moonshot-v1-32k",
        "timeout_seconds": 5,
    }
    defaults.update(overrides)
    return LangChainChatModelAdapter(**defaults)


def make_context():
    return ChatContext(
        latest_user_message="Summarize the retrieval section.",
        analysis_summary="This video explains retrieval augmented generation.",
        assembled_context="Context block",
    )


def test_generate_returns_none_when_adapter_not_configured():
    adapter = make_adapter(base_url="", api_key="", model="")

    assert adapter.generate("system", "user") is None


def test_generate_raises_when_model_returns_empty_text(monkeypatch):
    adapter = make_adapter()
    monkeypatch.setattr(adapter, "_invoke_text", lambda messages, **kwargs: "")

    with pytest.raises(ServiceUnavailableError, match="empty chat completion"):
        adapter.generate("system prompt", "user prompt")


def test_extract_memory_items_normalizes_json_payload(monkeypatch):
    adapter = make_adapter()
    context = make_context()
    raw_payload = """
    {
      "items": [
        {"kind": "user_goal", "content": "  Wants concise Chinese answers  ", "source": "conversation", "metadata": {"importance": 0.8}},
        {"kind": "user_goal", "content": "Wants concise Chinese answers", "source": "conversation", "metadata": {"importance": 0.6}},
        {"kind": "project_decision", "content": "Use transcript-grounded answers", "source": "assistant", "metadata": {}}
      ]
    }
    """
    monkeypatch.setattr(adapter, "_invoke_text", lambda messages, **kwargs: raw_payload)

    items = adapter.extract_memory_items(context, "answer", [])

    assert len(items) == 2
    assert items[0].kind == "user_goal"
    assert items[0].content == "Wants concise Chinese answers"
    assert items[1].kind == "project_decision"


def test_invoke_text_builds_langchain_messages_and_json_mode(monkeypatch):
    adapter = make_adapter()

    @dataclass
    class FakeSystemMessage:
        content: str

    @dataclass
    class FakeHumanMessage:
        content: str

    class FakeResponse:
        content = "test-ok"

    class FakeChatOpenAI:
        last_instance: ClassVar["FakeChatOpenAI | None"] = None

        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.bound_kwargs = None
            self.invoked_messages = None
            FakeChatOpenAI.last_instance = self

        def bind(self, **kwargs):
            self.bound_kwargs = kwargs
            return self

        def invoke(self, messages):
            self.invoked_messages = messages
            return FakeResponse()

    monkeypatch.setattr(
        adapter,
        "_load_langchain_components",
        lambda: (FakeChatOpenAI, FakeHumanMessage, FakeSystemMessage),
    )

    result = adapter._invoke_text(
        [("system", "system rules"), ("user", "user question")],
        json_mode=True,
    )
    instance = FakeChatOpenAI.last_instance

    assert instance is not None
    assert result == "test-ok"
    assert instance.bound_kwargs == {"response_format": {"type": "json_object"}}
    assert instance.invoked_messages == [
        FakeSystemMessage(content="system rules"),
        FakeHumanMessage(content="user question"),
    ]
    assert instance.kwargs["api_key"].get_secret_value() == "secret-key"
