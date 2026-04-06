from app.models.chat import ChatContext, ChatMemoryItem, ChatResponse


class ChatResponseGenerator:
    """Generates a deterministic placeholder answer from the prepared context."""

    def generate(
        self,
        context: ChatContext,
        memory_items: list[ChatMemoryItem],
        model_answer: str | None = None,
    ) -> ChatResponse:
        memory_status = (
            f"Memory items attached: {len(memory_items)}."
            if memory_items
            else "Memory injection slot is ready."
        )
        memory_hits_status = (
            f"Memory hits available: {len(context.memory_hits)}."
            if context.memory_hits
            else "No memory hits were recorded."
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

        answer = model_answer or (
            "Python backend is connected. "
            f'Received: "{context.latest_user_message}". '
            f"Recent turns available: {context.conversation_turn_count}. "
            f"Compressed conversation history: {'yes' if context.conversation_was_compressed else 'no'}. "
            f"{analysis_status} "
            f"{memory_status} "
            f"{memory_hits_status} "
            f"Unified context length: {len(context.assembled_context)} characters. "
            "This endpoint is ready for memory, retrieval, PDF workflows, and future LangChain integration."
        )

        return ChatResponse(
            answer=answer,
            memory_items=memory_items,
            memory_hits=context.memory_hits,
            conversation_summary=context.conversation_summary,
        )
