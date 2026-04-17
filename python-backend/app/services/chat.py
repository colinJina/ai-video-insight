from dataclasses import dataclass

from app.models.chat import (
    ChatContext,
    ChatMemoryItem,
    ChatRequest,
    ChatResponse,
    SanitizedChatInput,
)
from app.services.chat_context import ChatContextBuilder
from app.services.chat_generation import ChatResponseGenerator
from app.services.chat_memory import ChatMemoryLoader
from app.services.chat_memory_updates import ChatMemoryUpdater
from app.services.chat_model import ChatModelGateway, chat_model_gateway
from app.services.chat_summary import ConversationSummarizer
from app.services.chat_validation import ChatInputSanitizer


@dataclass
class PreparedChatTurn:
    chat_input: SanitizedChatInput
    memory_items: list[ChatMemoryItem]
    memory_hits: list[str]
    context: ChatContext
    conversation_summary: str | None


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
        prepared_turn = self._prepare_turn(request)
        model_answer = self.model_gateway.generate(prepared_turn.context)

        return self._build_final_response(
            prepared_turn,
            model_answer,
        )

    def stream_respond(self, request: ChatRequest):
        prepared_turn = self._prepare_turn(request)
        model_chunks = self.model_gateway.generate_stream(prepared_turn.context)

        if model_chunks:
            answer_parts: list[str] = []

            for chunk in model_chunks:
                normalized_chunk = chunk if isinstance(chunk, str) else str(chunk)
                if not normalized_chunk:
                    continue

                answer_parts.append(normalized_chunk)
                yield {
                    "event": "token",
                    "data": normalized_chunk,
                }

            answer = "".join(answer_parts).strip()
            if not answer:
                answer = self._build_fallback_answer(prepared_turn)
        else:
            answer = self._build_fallback_answer(prepared_turn)
            for chunk in self._chunk_answer(answer):
                yield {
                    "event": "token",
                    "data": chunk,
                }

        final_response = self._build_final_response(
            prepared_turn,
            answer,
        )
        yield {
            "event": "final",
            "data": final_response.model_dump(by_alias=True),
        }

    def load_memory(
        self, chat_input: SanitizedChatInput
    ) -> tuple[list[ChatMemoryItem], list[str]]:
        """Central memory hook for future DB or retrieval-backed implementations."""
        return self.memory_loader.load(chat_input)

    def _prepare_turn(self, request: ChatRequest) -> PreparedChatTurn:
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

        return PreparedChatTurn(
            chat_input=chat_input,
            memory_items=memory_items,
            memory_hits=memory_hits,
            context=context,
            conversation_summary=conversation_summary,
        )

    def _build_final_response(
        self,
        prepared_turn: PreparedChatTurn,
        model_answer: str | None,
    ) -> ChatResponse:
        draft_response = self.response_generator.generate(
            prepared_turn.context,
            prepared_turn.memory_items,
            model_answer,
        )
        memory_updates = self.memory_updater.extract(
            prepared_turn.chat_input,
            prepared_turn.context,
            draft_response.answer,
            self.model_gateway,
        )
        final_response = self.response_generator.generate(
            prepared_turn.context,
            prepared_turn.memory_items,
            draft_response.answer,
            memory_updates,
        )
        final_response.conversation_summary = self.summarizer.finalize_turn_summary(
            prepared_turn.chat_input,
            draft_response.answer,
            prepared_turn.conversation_summary,
            self.model_gateway,
        )

        return final_response

    def _build_fallback_answer(self, prepared_turn: PreparedChatTurn) -> str:
        return self.response_generator.generate(
            prepared_turn.context,
            prepared_turn.memory_items,
            None,
        ).answer

    def _chunk_answer(self, answer: str) -> list[str]:
        normalized = answer.strip()
        if not normalized:
            return []

        chunks: list[str] = []
        cursor = 0

        while cursor < len(normalized):
            chunks.append(normalized[cursor : cursor + 24])
            cursor += 24

        return chunks

chat_service = ChatService()
