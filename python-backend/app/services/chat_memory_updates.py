from app.models.chat import ChatContext, ChatMemoryItem, SanitizedChatInput
from app.core.logging import get_logger
from app.core.pipeline_debug import log_pipeline_event, preview_text
from app.services.chat_model import ChatModelGateway


class ChatMemoryUpdater:
    """Extracts durable memory candidates from the latest turn."""

    def __init__(self) -> None:
        self.logger = get_logger("app.services.chat_memory_updates")

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
                log_pipeline_event(
                    self.logger,
                    "memory_updates_extracted_with_model",
                    {
                        "analysisId": chat_input.analysis_id,
                        "updateCount": len(llm_items),
                        "updateKinds": [item.kind for item in llm_items],
                    },
                )
                return llm_items

        fallback_items = self._fallback_extract(chat_input, answer)
        log_pipeline_event(
            self.logger,
            "memory_updates_extracted_with_fallback",
            {
                "analysisId": chat_input.analysis_id,
                "userMessage": preview_text(chat_input.message),
                "answer": preview_text(answer, 320),
                "updateCount": len(fallback_items),
                "updateKinds": [item.kind for item in fallback_items],
            },
        )
        return fallback_items

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
