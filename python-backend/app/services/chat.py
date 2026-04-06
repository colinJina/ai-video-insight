from app.models.chat import ChatMemoryItem, ChatRequest, ChatResponse, SanitizedChatInput
from app.services.chat_context import ChatContextBuilder
from app.services.chat_generation import ChatResponseGenerator
from app.services.chat_memory import ChatMemoryLoader
from app.services.chat_validation import ChatInputSanitizer


class ChatService:
    """Coordinates the chat pipeline without coupling to a real model provider."""

    def __init__(
        self,
        sanitizer: ChatInputSanitizer | None = None,
        context_builder: ChatContextBuilder | None = None,
        memory_loader: ChatMemoryLoader | None = None,
        response_generator: ChatResponseGenerator | None = None,
    ) -> None:
        self.sanitizer = sanitizer or ChatInputSanitizer()
        self.context_builder = context_builder or ChatContextBuilder()
        self.memory_loader = memory_loader or ChatMemoryLoader()
        self.response_generator = response_generator or ChatResponseGenerator()

    def respond(self, request: ChatRequest) -> ChatResponse:
        chat_input = self.sanitizer.sanitize(request)
        memory_items, memory_hits = self.load_memory(chat_input)
        context = self.context_builder.build(chat_input, memory_items, memory_hits)
        return self.response_generator.generate(context, memory_items)

    def load_memory(
        self, chat_input: SanitizedChatInput
    ) -> tuple[list[ChatMemoryItem], list[str]]:
        """Central memory hook for future DB or retrieval-backed implementations."""
        return self.memory_loader.load(chat_input)


chat_service = ChatService()
