from typing import Any, cast

from app.models.chat import ChatContext, ChatMemoryItem, ChatRequest, ChatResponse
from app.services.chat import ChatService


class FakeSanitizer:
    def sanitize(self, request: ChatRequest):
        return request


class FakeMemoryLoader:
    def load(self, _chat_input):
        return [ChatMemoryItem(kind="memory", content="Persisted preference")], ["memory"]


class FakeSummarizer:
    def summarize(self, chat_input, _model_gateway):
        return chat_input.recent_messages, "Conversation summary", False

    def finalize_turn_summary(
        self,
        _chat_input,
        _answer,
        conversation_summary,
        _model_gateway,
    ):
        return conversation_summary


class FakeContextBuilder:
    def build(
        self,
        chat_input,
        memory_items,
        memory_hits,
        retained_recent_messages,
        conversation_summary,
        conversation_was_compressed,
    ):
        return ChatContext(
            latest_user_message=chat_input.message,
            recent_messages=chat_input.recent_messages,
            retained_recent_messages=retained_recent_messages,
            analysis_id=chat_input.analysis_id,
            analysis_summary=chat_input.analysis_summary,
            transcript_excerpt=chat_input.transcript_excerpt,
            memory_items=memory_items,
            memory_hits=memory_hits,
            conversation_summary=conversation_summary,
            conversation_was_compressed=conversation_was_compressed,
            assembled_context="Assembled context",
        )


class FakeResponseGenerator:
    def generate(
        self,
        _context,
        memory_items,
        model_answer,
        memory_updates=None,
    ):
        return ChatResponse(
            answer=model_answer or "Fallback answer",
            memory_items=memory_items,
            memory_updates=memory_updates or [],
            memory_hits=["memory"],
            conversation_summary=None,
        )


class FakeMemoryUpdater:
    def extract(self, *_args, **_kwargs):
        return []


class FakeModelGateway:
    def generate(self, _context):
        return "Hello world"

    def generate_stream(self, _context):
        return [
            {
                "type": "phase",
                "phase": {
                    "id": "python-tool-search-retrieved-chunks",
                    "label": "Inspecting transcript evidence",
                    "status": "completed",
                    "detail": "Checked the retrieved transcript chunks for grounded evidence.",
                    "source": "python",
                    "toolName": "Retrieved chunk search",
                },
            },
            "Hello",
            " world",
        ]


def make_request():
    return ChatRequest(
        analysis_id="analysis-1",
        user_id="user-1",
        message="What changed?",
        recent_messages=[],
        memory_items=[],
        stored_memory_items=[],
    )


def test_stream_respond_emits_phase_events_before_tokens_and_final():
    service = ChatService(
        sanitizer=cast(Any, FakeSanitizer()),
        context_builder=cast(Any, FakeContextBuilder()),
        memory_loader=cast(Any, FakeMemoryLoader()),
        memory_updater=cast(Any, FakeMemoryUpdater()),
        summarizer=cast(Any, FakeSummarizer()),
        model_gateway=cast(Any, FakeModelGateway()),
        response_generator=cast(Any, FakeResponseGenerator()),
    )

    events = cast(list[dict[str, Any]], list(service.stream_respond(make_request())))

    assert [event["event"] for event in events] == [
        "phase",
        "phase",
        "phase",
        "phase",
        "phase",
        "phase",
        "phase",
        "phase",
        "phase",
        "phase",
        "token",
        "token",
        "phase",
        "phase",
        "phase",
        "final",
    ]
    assert events[0]["data"]["id"] == "python-sanitize-input"
    assert events[8]["data"]["id"] == "python-generate-answer"
    assert events[9]["data"]["id"] == "python-tool-search-retrieved-chunks"
    assert events[10]["data"] == "Hello"
    assert events[-1]["data"]["answer"] == "Hello world"
