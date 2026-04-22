from app.models.chat import ChatContext, ChatMemoryItem, ChatMessage, SanitizedChatInput
from app.core.logging import get_logger
from app.core.pipeline_debug import log_pipeline_event, preview_text


class ChatContextBuilder:
    """Builds the internal context object that downstream components consume."""

    def __init__(self) -> None:
        self.logger = get_logger("app.services.chat_context")

    def build(
        self,
        chat_input: SanitizedChatInput,
        memory_items: list[ChatMemoryItem],
        memory_hits: list[str],
        retained_recent_messages: list[ChatMessage],
        conversation_summary: str | None,
        conversation_was_compressed: bool,
    ) -> ChatContext:
        conversation_turn_count = len(chat_input.recent_messages)
        summary_text = conversation_summary or self._build_summary(
            latest_user_message=chat_input.message,
            conversation_turn_count=conversation_turn_count,
        )
        assembled_context = self._assemble_context(
            recent_messages=retained_recent_messages,
            analysis_summary=chat_input.analysis_summary,
            transcript_excerpt=chat_input.transcript_excerpt,
            outline=chat_input.outline,
            key_points=chat_input.key_points,
            memory_items=memory_items,
            conversation_summary=summary_text,
        )

        log_pipeline_event(
            self.logger,
            "context_sections_assembled",
            {
                "analysisId": chat_input.analysis_id,
                "retainedRecentMessages": len(retained_recent_messages),
                "memoryItemCount": len(memory_items),
                "summaryPreview": preview_text(summary_text),
                "assembledContext": preview_text(assembled_context, 480),
            },
        )

        return ChatContext(
            latest_user_message=chat_input.message,
            recent_messages=chat_input.recent_messages,
            retained_recent_messages=retained_recent_messages,
            user_id=chat_input.user_id,
            analysis_id=chat_input.analysis_id,
            analysis_summary=chat_input.analysis_summary,
            transcript_excerpt=chat_input.transcript_excerpt,
            outline=chat_input.outline,
            key_points=chat_input.key_points,
            memory_items=memory_items,
            memory_hits=memory_hits,
            conversation_turn_count=conversation_turn_count,
            conversation_was_compressed=conversation_was_compressed,
            conversation_summary=summary_text,
            assembled_context=assembled_context,
        )

    def _build_summary(
        self, latest_user_message: str, conversation_turn_count: int
    ) -> str:
        return (
            f"Latest user message: {latest_user_message}. "
            f"Recent turns retained: {conversation_turn_count}."
        )

    def _assemble_context(
        self,
        recent_messages: list[ChatMessage],
        analysis_summary: str | None,
        transcript_excerpt: str | None,
        outline: list,
        key_points: list[str],
        memory_items: list[ChatMemoryItem],
        conversation_summary: str | None,
    ) -> str:
        sections: list[str] = []

        if recent_messages:
            rendered_messages = "\n".join(
                f"- {message.role}: {message.content}" for message in recent_messages
            )
            sections.append(f"Recent messages:\n{rendered_messages}")

        if conversation_summary:
            sections.append(f"Conversation summary:\n{conversation_summary}")

        if analysis_summary:
            sections.append(f"Analysis summary:\n{analysis_summary}")

        if transcript_excerpt:
            sections.append(f"Transcript excerpt:\n{transcript_excerpt}")

        if key_points:
            rendered_key_points = "\n".join(f"- {item}" for item in key_points)
            sections.append(f"Key points:\n{rendered_key_points}")

        if outline:
            rendered_outline = "\n".join(
                f"- [{item.time}] {item.text}" if item.time else f"- {item.text}"
                for item in outline
            )
            sections.append(f"Outline:\n{rendered_outline}")

        prompt_memory_items = [
            item for item in memory_items if item.kind != "retrieved_chunk"
        ]

        if prompt_memory_items:
            rendered_memory = "\n".join(
                f"- [{item.kind}] {item.content}" for item in prompt_memory_items
            )
            sections.append(f"Memory items:\n{rendered_memory}")

        return "\n\n".join(sections)
