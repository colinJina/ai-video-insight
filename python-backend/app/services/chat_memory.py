from app.models.chat import ChatMemoryItem, SanitizedChatInput


class ChatMemoryLoader:
    """Request-driven memory loader that can later be replaced by a DB-backed loader."""

    def load(self, chat_input: SanitizedChatInput) -> tuple[list[ChatMemoryItem], list[str]]:
        memory_items = chat_input.memory_items
        memory_hits = [self._build_memory_hit(item, index) for index, item in enumerate(memory_items)]
        return memory_items, memory_hits

    def _build_memory_hit(self, item: ChatMemoryItem, index: int) -> str:
        source = item.source or "request.memory_items"
        return f"{index + 1}. {item.kind} from {source}"
