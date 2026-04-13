from app.models.chat import ChatMemoryItem, SanitizedChatInput


class ChatMemoryLoader:
    """Coordinates memory loading while keeping storage concerns replaceable."""

    def load(self, chat_input: SanitizedChatInput) -> tuple[list[ChatMemoryItem], list[str]]:
        request_memory_items = self._load_request_memory(chat_input)
        stored_memory_items = self._load_stored_memory(chat_input)
        memory_items = [*request_memory_items, *stored_memory_items]
        memory_hits = [self._build_memory_hit(item, index) for index, item in enumerate(memory_items)]
        return memory_items, memory_hits

    def _load_request_memory(
        self, chat_input: SanitizedChatInput
    ) -> list[ChatMemoryItem]:
        return chat_input.memory_items

    def _load_stored_memory(
        self, chat_input: SanitizedChatInput
    ) -> list[ChatMemoryItem]:
        return chat_input.stored_memory_items

    def _build_memory_hit(self, item: ChatMemoryItem, index: int) -> str:
        source = item.source or "request.memory_items"
        return f"{index + 1}. {item.kind} from {source}"
