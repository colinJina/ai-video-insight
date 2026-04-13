from app.models.chat import ChatContext, ChatMemoryItem, SanitizedChatInput
from app.services.chat_model import ChatModelGateway


class ChatMemoryUpdater:
    """Extracts durable memory candidates from the latest turn."""

    def extract(
        self,
        chat_input: SanitizedChatInput,
        context: ChatContext,
        answer: str,
        model_gateway: ChatModelGateway | None = None,
    ) -> list[ChatMemoryItem]:
        if model_gateway:
            try:
                llm_items = model_gateway.extract_memory_items(
                    context,
                    answer,
                    chat_input.stored_memory_items,
                )
            except Exception:
                llm_items = []

            if llm_items:
                return llm_items

        return self._fallback_extract(chat_input, answer)

    def _fallback_extract(
        self,
        chat_input: SanitizedChatInput,
        answer: str,
    ) -> list[ChatMemoryItem]:
        user_message = " ".join(chat_input.message.split()).strip()
        if not user_message:
            return []

        lowered = user_message.lower()
        items: list[ChatMemoryItem] = []

        if any(
            keyword in lowered
            for keyword in ("want", "need", "plan", "resume", "interview", "portfolio")
        ):
            items.append(
                ChatMemoryItem(
                    kind="user_goal",
                    content=user_message[:200],
                    source="conversation.latest_user_message",
                    metadata={"importance": 0.8},
                )
            )

        if any(keyword in lowered for keyword in ("use", "choose", "recommend", "langchain", "agent")):
            items.append(
                ChatMemoryItem(
                    kind="project_decision",
                    content=" ".join(answer.split())[:220],
                    source="conversation.latest_assistant_answer",
                    metadata={"importance": 0.65},
                )
            )

        deduped: list[ChatMemoryItem] = []
        seen: set[tuple[str, str]] = set()

        for item in items:
            key = (item.kind.lower(), item.content.lower())
            if key in seen:
                continue

            deduped.append(item)
            seen.add(key)

        return deduped[:3]
