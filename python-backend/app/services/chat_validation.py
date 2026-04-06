from app.models.chat import (
    ChatMemoryItem,
    ChatMessage,
    ChatOutlineItem,
    ChatRequest,
    SanitizedChatInput,
)


class ChatInputSanitizer:
    """Validates and normalizes chat input before the rest of the pipeline runs."""

    def sanitize(self, request: ChatRequest) -> SanitizedChatInput:
        message = request.message.strip()
        if not message:
            raise ValueError("message cannot be blank after trimming whitespace")

        recent_messages = self._sanitize_recent_messages(request.recent_messages)

        return SanitizedChatInput(
            user_id=self._clean_optional_text(request.user_id),
            analysis_id=self._clean_optional_text(request.analysis_id),
            analysis_summary=self._clean_optional_text(request.analysis_summary),
            transcript_excerpt=self._clean_optional_text(request.transcript_excerpt),
            outline=self._sanitize_outline(request.outline),
            key_points=self._sanitize_key_points(request.key_points),
            message=message,
            recent_messages=recent_messages,
            memory_items=self._sanitize_memory_items(request.memory_items),
        )

    def _sanitize_recent_messages(
        self, recent_messages: list[ChatMessage]
    ) -> list[ChatMessage]:
        cleaned_messages: list[ChatMessage] = []

        for message in recent_messages:
            content = message.content.strip()
            if not content:
                continue

            cleaned_messages.append(
                ChatMessage(
                    role=message.role,
                    content=content,
                )
            )

        return cleaned_messages

    def _sanitize_outline(self, outline: list[ChatOutlineItem]) -> list[ChatOutlineItem]:
        cleaned_outline: list[ChatOutlineItem] = []

        for item in outline:
            text = item.text.strip()
            if not text:
                continue

            time = self._clean_optional_text(item.time)
            cleaned_outline.append(ChatOutlineItem(time=time, text=text))

        return cleaned_outline

    def _sanitize_key_points(self, key_points: list[str]) -> list[str]:
        cleaned_points: list[str] = []

        for item in key_points:
            cleaned = item.strip()
            if cleaned:
                cleaned_points.append(cleaned)

        return cleaned_points

    def _sanitize_memory_items(
        self, memory_items: list[ChatMemoryItem]
    ) -> list[ChatMemoryItem]:
        cleaned_items: list[ChatMemoryItem] = []

        for item in memory_items:
            kind = item.kind.strip()
            content = item.content.strip()
            if not kind or not content:
                continue

            cleaned_items.append(
                ChatMemoryItem(
                    kind=kind,
                    content=content,
                    source=self._clean_optional_text(item.source),
                    metadata=item.metadata,
                )
            )

        return cleaned_items

    def _clean_optional_text(self, value: str | None) -> str | None:
        if value is None:
            return None

        cleaned = value.strip()
        return cleaned or None
