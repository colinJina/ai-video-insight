from app.models.chat import ChatMessage, SanitizedChatInput


class ConversationSummarizer:
    """Builds a compact conversation summary and keeps an LLM swap point isolated."""

    def __init__(
        self,
        compression_threshold: int = 6,
        retained_recent_messages: int = 6,
    ) -> None:
        self.compression_threshold = compression_threshold
        self.retained_recent_messages = retained_recent_messages

    def summarize(
        self, chat_input: SanitizedChatInput
    ) -> tuple[list[ChatMessage], str | None, bool]:
        recent_messages = chat_input.recent_messages

        if len(recent_messages) <= self.compression_threshold:
            return recent_messages, None, False

        retained_messages = recent_messages[-self.retained_recent_messages :]
        compressed_messages = recent_messages[: -self.retained_recent_messages]
        conversation_summary = self._build_summary(
            compressed_messages=compressed_messages,
            retained_messages=retained_messages,
        )
        return retained_messages, conversation_summary, True

    def _build_summary(
        self,
        compressed_messages: list[ChatMessage],
        retained_messages: list[ChatMessage],
    ) -> str:
        compressed_count = len(compressed_messages)
        speaker_counts = self._count_speakers(compressed_messages)
        key_points = self._extract_key_points(compressed_messages)
        latest_retained = retained_messages[-1].content if retained_messages else ""

        sections = [
            f"Compressed {compressed_count} earlier messages.",
            f"Speaker mix: {speaker_counts}.",
        ]

        if key_points:
            sections.append(f"Earlier discussion highlights: {'; '.join(key_points)}.")

        if latest_retained:
            sections.append(f"Most recent retained turn: {latest_retained}.")

        return " ".join(sections)

    def _count_speakers(self, messages: list[ChatMessage]) -> str:
        user_count = sum(1 for message in messages if message.role == "user")
        assistant_count = sum(1 for message in messages if message.role == "assistant")
        system_count = sum(1 for message in messages if message.role == "system")
        return (
            f"user={user_count}, assistant={assistant_count}, system={system_count}"
        )

    def _extract_key_points(self, messages: list[ChatMessage]) -> list[str]:
        highlights: list[str] = []

        for message in messages:
            normalized = " ".join(message.content.split())
            if not normalized:
                continue

            snippet = normalized[:120].rstrip(" .,;:")
            if not snippet:
                continue

            if snippet not in highlights:
                highlights.append(snippet)

            if len(highlights) >= 3:
                break

        return highlights
