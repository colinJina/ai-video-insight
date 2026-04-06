from app.models.chat import ChatContext, ChatMemoryItem, ChatResponse


class ChatResponseGenerator:
    """Generates a deterministic placeholder answer from the prepared context."""

    def generate(
        self, context: ChatContext, memory_items: list[ChatMemoryItem]
    ) -> ChatResponse:
        memory_status = (
            f"Memory items attached: {len(memory_items)}."
            if memory_items
            else "Memory injection slot is ready."
        )

        analysis_status = (
            "Analysis context attached."
            if (
                context.analysis_summary
                or context.transcript_excerpt
                or context.outline
                or context.key_points
            )
            else "Analysis context not attached yet."
        )

        answer = (
            "Python backend is connected. "
            f'Received: "{context.latest_user_message}". '
            f"Recent turns available: {context.conversation_turn_count}. "
            f"{analysis_status} "
            f"{memory_status} "
            f"Unified context length: {len(context.assembled_context)} characters. "
            "This endpoint is ready for memory, retrieval, and PDF workflows."
        )

        return ChatResponse(
            answer=answer,
            memory_items=memory_items,
            memory_hits=context.memory_hits,
            conversation_summary=context.conversation_summary,
        )
