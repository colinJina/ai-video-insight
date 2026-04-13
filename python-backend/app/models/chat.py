from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ChatModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
    )


class ChatMessage(ChatModel):
    role: Literal["system", "user", "assistant"] = Field(
        description="The role of the message within the conversation."
    )
    content: str = Field(min_length=1, description="Plain-text message content.")


class ChatOutlineItem(ChatModel):
    time: str | None = Field(
        default=None,
        description="Timestamp label from the video outline, for example MM:SS.",
    )
    text: str = Field(min_length=1, description="Outline item text.")


class ChatMemoryItem(ChatModel):
    kind: str = Field(
        min_length=1,
        description="Logical memory category such as summary, transcript, or note.",
    )
    content: str = Field(min_length=1, description="Normalized memory content.")
    source: str | None = Field(
        default=None,
        description="Optional source label to help trace where the memory came from.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Extra structured metadata for future retrieval or ranking.",
    )


class ChatRequest(ChatModel):
    user_id: str | None = Field(default=None, description="Optional user identifier.")
    analysis_id: str | None = Field(
        default=None,
        description="Identifier of the current video analysis task.",
    )
    analysis_summary: str | None = Field(
        default=None,
        description="High-level summary of the current video analysis.",
    )
    transcript_excerpt: str | None = Field(
        default=None,
        description="Relevant transcript excerpt passed from the frontend.",
    )
    stored_conversation_summary: str | None = Field(
        default=None,
        description="Persisted rolling conversation summary from earlier turns.",
    )
    outline: list[ChatOutlineItem] = Field(
        default_factory=list,
        description="Structured outline items from the current video analysis result.",
    )
    key_points: list[str] = Field(
        default_factory=list,
        description="Key takeaways from the current video analysis result.",
    )
    message: str = Field(min_length=1, description="The latest user message.")
    recent_messages: list[ChatMessage] = Field(
        default_factory=list,
        description="Recent turns from the active conversation.",
    )
    memory_items: list[ChatMemoryItem] = Field(
        default_factory=list,
        description="Preloaded memory snippets or retrieval results for this chat turn.",
    )
    stored_memory_items: list[ChatMemoryItem] = Field(
        default_factory=list,
        description="Persisted long-term memory items recalled from earlier turns.",
    )


class ChatResponse(ChatModel):
    answer: str
    memory_items: list[ChatMemoryItem] = Field(default_factory=list)
    memory_updates: list[ChatMemoryItem] = Field(default_factory=list)
    memory_hits: list[str] = Field(default_factory=list)
    conversation_summary: str | None = None


class SanitizedChatInput(ChatModel):
    user_id: str | None = Field(default=None)
    analysis_id: str | None = Field(default=None)
    analysis_summary: str | None = Field(default=None)
    transcript_excerpt: str | None = Field(default=None)
    stored_conversation_summary: str | None = Field(default=None)
    outline: list[ChatOutlineItem] = Field(default_factory=list)
    key_points: list[str] = Field(default_factory=list)
    message: str = Field(min_length=1)
    recent_messages: list[ChatMessage] = Field(default_factory=list)
    memory_items: list[ChatMemoryItem] = Field(default_factory=list)
    stored_memory_items: list[ChatMemoryItem] = Field(default_factory=list)


class ChatContext(ChatModel):
    latest_user_message: str = Field(min_length=1)
    recent_messages: list[ChatMessage] = Field(default_factory=list)
    retained_recent_messages: list[ChatMessage] = Field(default_factory=list)
    user_id: str | None = None
    analysis_id: str | None = None
    analysis_summary: str | None = None
    transcript_excerpt: str | None = None
    outline: list[ChatOutlineItem] = Field(default_factory=list)
    key_points: list[str] = Field(default_factory=list)
    memory_items: list[ChatMemoryItem] = Field(default_factory=list)
    memory_hits: list[str] = Field(default_factory=list)
    conversation_turn_count: int = Field(ge=0, default=0)
    conversation_was_compressed: bool = False
    conversation_summary: str | None = None
    assembled_context: str = Field(default="")
