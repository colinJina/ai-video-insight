from app.models.chat import ChatMessage, SanitizedChatInput
from app.core.logging import get_logger
from app.core.pipeline_debug import log_pipeline_event, preview_text
from app.services.chat_model import ChatModelGateway


class ConversationSummarizer:
    """Builds a compact conversation summary and keeps an LLM swap point isolated."""

    def __init__(
        self,
        compression_threshold: int = 6,
        retained_recent_messages: int = 6,
    ) -> None:
        self.compression_threshold = compression_threshold
        self.retained_recent_messages = retained_recent_messages
        self.logger = get_logger("app.services.chat_summary")

    def summarize(
        self,
        chat_input: SanitizedChatInput,
        model_gateway: ChatModelGateway | None = None,
    ) -> tuple[list[ChatMessage], str | None, bool]:
        recent_messages = chat_input.recent_messages
        stored_summary = chat_input.stored_conversation_summary

        if len(recent_messages) <= self.compression_threshold and not stored_summary:
            log_pipeline_event(
                self.logger,
                "conversation_summary_skipped",
                {
                    "analysisId": chat_input.analysis_id,
                    "recentMessageCount": len(recent_messages),
                },
            )
            return recent_messages, None, False

        if len(recent_messages) <= self.retained_recent_messages:
            log_pipeline_event(
                self.logger,
                "conversation_summary_reused",
                {
                    "analysisId": chat_input.analysis_id,
                    "recentMessageCount": len(recent_messages),
                    "storedSummary": preview_text(stored_summary, 320),
                },
            )
            return recent_messages, stored_summary, bool(stored_summary)

        retained_messages = recent_messages[-self.retained_recent_messages :]
        compressed_messages = recent_messages[: -self.retained_recent_messages]
        conversation_summary = self._build_summary(
            previous_summary=stored_summary,
            compressed_messages=compressed_messages,
            model_gateway=model_gateway,
        )
        log_pipeline_event(
            self.logger,
            "conversation_summary_compressed",
            {
                "analysisId": chat_input.analysis_id,
                "compressedMessageCount": len(compressed_messages),
                "retainedMessageCount": len(retained_messages),
                "conversationSummary": preview_text(conversation_summary, 320),
            },
        )
        return retained_messages, conversation_summary, bool(conversation_summary)

    def finalize_turn_summary(
        self,
        chat_input: SanitizedChatInput,
        assistant_answer: str,
        current_summary: str | None,
        model_gateway: ChatModelGateway | None = None,
    ) -> str | None:
        if (
            not current_summary
            and not chat_input.stored_conversation_summary
            and len(chat_input.recent_messages) < self.compression_threshold
        ):
            return None

        turn_messages = [
            ChatMessage(role="user", content=chat_input.message),
            ChatMessage(role="assistant", content=assistant_answer),
        ]

        return self._build_summary(
            previous_summary=current_summary or chat_input.stored_conversation_summary,
            compressed_messages=turn_messages,
            model_gateway=model_gateway,
        )

    def _build_summary(
        self,
        previous_summary: str | None,
        compressed_messages: list[ChatMessage],
        model_gateway: ChatModelGateway | None = None,
    ) -> str:
        if model_gateway:
            try:
                llm_summary = model_gateway.generate_conversation_summary(
                    previous_summary,
                    compressed_messages,
                )
            except Exception:
                llm_summary = None

            if llm_summary:
                return llm_summary

        compressed_count = len(compressed_messages)
        speaker_counts = self._count_speakers(compressed_messages)
        key_points = self._extract_key_points(compressed_messages)

        sections = [
            f"Rolling summary base: {previous_summary}." if previous_summary else "",
            f"Compressed {compressed_count} earlier messages." if compressed_messages else "",
            f"Speaker mix: {speaker_counts}." if compressed_messages else "",
        ]

        if key_points:
            sections.append(f"Earlier discussion highlights: {'; '.join(key_points)}.")

        return " ".join(section for section in sections if section)

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
