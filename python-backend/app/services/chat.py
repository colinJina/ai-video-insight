from app.models.chat import ChatMemoryItem, ChatRequest, ChatResponse, SanitizedChatInput
from app.services.chat_context import ChatContextBuilder
from app.services.chat_generation import ChatResponseGenerator
from app.services.chat_memory import ChatMemoryLoader
from app.services.chat_memory_updates import ChatMemoryUpdater
from app.services.chat_model import ChatModelGateway, chat_model_gateway
from app.services.chat_summary import ConversationSummarizer
from app.services.chat_validation import ChatInputSanitizer


class ChatService:
    """Coordinates the chat pipeline without coupling to a real model provider."""

    def __init__(
        self,
        sanitizer: ChatInputSanitizer | None = None,
        context_builder: ChatContextBuilder | None = None,
        memory_loader: ChatMemoryLoader | None = None,
        memory_updater: ChatMemoryUpdater | None = None,
        summarizer: ConversationSummarizer | None = None,
        model_gateway: ChatModelGateway | None = None,
        response_generator: ChatResponseGenerator | None = None,
    ) -> None:
        self.sanitizer = sanitizer or ChatInputSanitizer()
        self.context_builder = context_builder or ChatContextBuilder()
        self.memory_loader = memory_loader or ChatMemoryLoader()
        self.memory_updater = memory_updater or ChatMemoryUpdater()
        self.summarizer = summarizer or ConversationSummarizer()
        self.model_gateway = model_gateway or chat_model_gateway
        self.response_generator = response_generator or ChatResponseGenerator()

    def respond(self, request: ChatRequest) -> ChatResponse:
        chat_input = self.sanitizer.sanitize(request)
        memory_items, memory_hits = self.load_memory(chat_input)
        (
            retained_recent_messages,
            conversation_summary,
            conversation_was_compressed,
        ) = self.summarizer.summarize(chat_input, self.model_gateway)
        context = self.context_builder.build(
            chat_input,
            memory_items,
            memory_hits,
            retained_recent_messages,
            conversation_summary,
            conversation_was_compressed,
        )
        model_answer = self.model_gateway.generate(context)
        draft_response = self.response_generator.generate(
            context,
            memory_items,
            model_answer,
        )
        memory_updates = self.memory_updater.extract(
            chat_input,
            context,
            draft_response.answer,
            self.model_gateway,
        )
        final_response = self.response_generator.generate(
            context,
            memory_items,
            draft_response.answer,
            memory_updates,
        )
        final_response.conversation_summary = self.summarizer.finalize_turn_summary(
            chat_input,
            draft_response.answer,
            conversation_summary,
            self.model_gateway,
        )
        return final_response

    def load_memory(
        self, chat_input: SanitizedChatInput
    ) -> tuple[list[ChatMemoryItem], list[str]]:
        """Central memory hook for future DB or retrieval-backed implementations."""
        return self.memory_loader.load(chat_input)

chat_service = ChatService()
