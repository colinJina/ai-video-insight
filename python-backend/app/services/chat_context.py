from app.models.chat import ChatContext, ChatMemoryItem, ChatMessage, SanitizedChatInput


class ChatContextBuilder:
    """Builds the internal context object that downstream components consume."""

    def build(
        self,
        chat_input: SanitizedChatInput,
        memory_items: list[ChatMemoryItem],
        memory_hits: list[str],
    ) -> ChatContext:
        recent_messages = chat_input.recent_messages[-6:]
        conversation_turn_count = len(recent_messages)

        conversation_summary = self._build_summary(
            latest_user_message=chat_input.message,
            conversation_turn_count=conversation_turn_count,
        )
        assembled_context = self._assemble_context(
            recent_messages=recent_messages,
            analysis_summary=chat_input.analysis_summary,
            transcript_excerpt=chat_input.transcript_excerpt,
            memory_items=memory_items,
        )

        return ChatContext(
            latest_user_message=chat_input.message,
            recent_messages=recent_messages,
            user_id=chat_input.user_id,
            analysis_id=chat_input.analysis_id,
            analysis_summary=chat_input.analysis_summary,
            transcript_excerpt=chat_input.transcript_excerpt,
            outline=chat_input.outline,
            key_points=chat_input.key_points,
            memory_items=memory_items,
            memory_hits=memory_hits,
            conversation_turn_count=conversation_turn_count,
            conversation_summary=conversation_summary,
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
        memory_items: list[ChatMemoryItem],
    ) -> str:
        sections: list[str] = []

        if recent_messages:
            rendered_messages = "\n".join(
                f"- {message.role}: {message.content}" for message in recent_messages
            )
            sections.append(f"Recent messages:\n{rendered_messages}")

        if analysis_summary:
            sections.append(f"Analysis summary:\n{analysis_summary}")

        if transcript_excerpt:
            sections.append(f"Transcript excerpt:\n{transcript_excerpt}")

        if memory_items:
            rendered_memory = "\n".join(
                f"- [{item.kind}] {item.content}" for item in memory_items
            )
            sections.append(f"Memory items:\n{rendered_memory}")

        return "\n\n".join(sections)
