from types import SimpleNamespace

import pytest

from app.core.config import get_settings
from app.models.chat import ChatContext
from app.services.chat_model import ChatModelGateway


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def make_settings(**overrides):
    defaults = {
        "ai_base_url": "https://api.example.com/v1",
        "ai_api_key": "test-key",
        "ai_model": "test-model",
        "ai_timeout_ms": 5000,
        "chat_model_adapter": None,
        "langchain_enabled": False,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def make_context():
    return ChatContext(
        latest_user_message="Explain chunking.",
        assembled_context="Analysis summary:\nChunking affects retrieval quality.",
    )


def test_gateway_defaults_to_http_adapter(monkeypatch):
    monkeypatch.setattr(
        "app.services.chat_model.get_settings",
        lambda: make_settings(),
    )

    gateway = ChatModelGateway()

    assert gateway.adapter_name == "http"


def test_gateway_uses_langchain_when_enabled(monkeypatch):
    monkeypatch.setattr(
        "app.services.chat_model.get_settings",
        lambda: make_settings(langchain_enabled=True),
    )

    gateway = ChatModelGateway()

    assert gateway.adapter_name == "langchain"


def test_gateway_generate_delegates_to_langchain_adapter(monkeypatch):
    monkeypatch.setattr(
        "app.services.chat_model.get_settings",
        lambda: make_settings(chat_model_adapter="langchain"),
    )
    gateway = ChatModelGateway()
    context = make_context()
    captured = {}

    def fake_generate(system_prompt: str, user_prompt: str):
        captured["system_prompt"] = system_prompt
        captured["user_prompt"] = user_prompt
        return "langchain-answer"

    monkeypatch.setattr(gateway.langchain_adapter, "generate", fake_generate)

    answer = gateway.generate(context)

    assert answer == "langchain-answer"
    assert "video analysis product" in captured["system_prompt"]
    assert "Latest user question" in captured["user_prompt"]
    assert context.latest_user_message in captured["user_prompt"]


def test_gateway_generate_uses_http_path_when_selected(monkeypatch):
    monkeypatch.setattr(
        "app.services.chat_model.get_settings",
        lambda: make_settings(chat_model_adapter="http"),
    )
    gateway = ChatModelGateway()
    context = make_context()
    captured = {}

    def fake_request_completion(messages, *, temperature=0.2, json_mode=False):
        captured["messages"] = messages
        captured["temperature"] = temperature
        captured["json_mode"] = json_mode
        return "http-answer"

    monkeypatch.setattr(gateway, "_request_completion", fake_request_completion)

    answer = gateway.generate(context)

    assert answer == "http-answer"
    assert captured["messages"][0]["role"] == "system"
    assert captured["messages"][1]["role"] == "user"
    assert captured["json_mode"] is False
