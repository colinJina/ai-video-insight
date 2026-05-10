from dataclasses import dataclass
from typing import Literal

from app.core.logging import get_logger
from app.core.pipeline_debug import log_pipeline_event, preview_text
from app.models.chat import (
    ChatContext,
    ChatMemoryItem,
    ChatPhase,
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
        self.logger = get_logger("app.services.chat")

    def respond(self, request: ChatRequest) -> ChatResponse:
        prepared_turn = self._prepare_turn(request)
        model_answer = self.model_gateway.generate(prepared_turn.context)
        log_pipeline_event(
            self.logger,
            "chat_model_answer_generated",
            {
                "analysisId": prepared_turn.chat_input.analysis_id,
                "answer": preview_text(model_answer, 320),
                "memoryHitCount": len(prepared_turn.memory_hits),
            },
        )

        return self._build_final_response(
            prepared_turn,
            model_answer,
        )

    def stream_respond(self, request: ChatRequest):
        prepared_turn = yield from self._prepare_turn_stream(request)
        yield self._build_phase_event(
            id="python-generate-answer",
            label="Generating answer",
            status="active",
            detail="Drafting the reply from the assembled transcript, summary, and memory context.",
        )
        model_chunks = self.model_gateway.generate_stream(prepared_turn.context)
        log_pipeline_event(
            self.logger,
            "chat_stream_started",
            {
                "analysisId": prepared_turn.chat_input.analysis_id,
                "message": preview_text(prepared_turn.chat_input.message),
                "memoryHitCount": len(prepared_turn.memory_hits),
                "conversationSummary": preview_text(
                    prepared_turn.conversation_summary
                ),
            },
        )

        if model_chunks:
            answer_parts: list[str] = []

            for chunk in model_chunks:
                if isinstance(chunk, dict) and chunk.get("type") == "phase":
                    phase = chunk.get("phase")
                    if isinstance(phase, dict):
                        yield {
                            "event": "phase",
                            "data": phase,
                        }
                    continue

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

        yield self._build_phase_event(
            id="python-generate-answer",
            label="Generating answer",
            status="completed",
            detail="Finished drafting the streamed answer text.",
        )
        yield self._build_phase_event(
            id="python-finalize-response",
            label="Finalizing memory and summary",
            status="active",
            detail="Updating rolling conversation memory and final response metadata.",
        )
        final_response = self._build_final_response(
            prepared_turn,
            answer,
        )
        log_pipeline_event(
            self.logger,
            "chat_stream_completed",
            {
                "analysisId": prepared_turn.chat_input.analysis_id,
                "answer": preview_text(final_response.answer, 320),
                "memoryUpdateCount": len(final_response.memory_updates),
                "conversationSummary": preview_text(
                    final_response.conversation_summary
                ),
            },
        )
        yield self._build_phase_event(
            id="python-finalize-response",
            label="Finalizing memory and summary",
            status="completed",
            detail="Updated the rolling summary and packaged the final chat response.",
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
        log_pipeline_event(
            self.logger,
            "chat_input_sanitized",
            {
                "analysisId": chat_input.analysis_id,
                "userId": chat_input.user_id,
                "message": preview_text(chat_input.message),
                "recentMessageCount": len(chat_input.recent_messages),
                "storedConversationSummary": preview_text(
                    chat_input.stored_conversation_summary
                ),
            },
        )
        memory_items, memory_hits = self.load_memory(chat_input)
        log_pipeline_event(
            self.logger,
            "chat_memory_loaded",
            {
                "analysisId": chat_input.analysis_id,
                "memoryItemCount": len(memory_items),
                "memoryHits": memory_hits,
                "memoryKinds": [item.kind for item in memory_items],
            },
        )
        (
            retained_recent_messages,
            conversation_summary,
            conversation_was_compressed,
        ) = self.summarizer.summarize(chat_input, self.model_gateway)
        log_pipeline_event(
            self.logger,
            "conversation_summary_prepared",
            {
                "analysisId": chat_input.analysis_id,
                "retainedRecentMessages": len(retained_recent_messages),
                "conversationWasCompressed": conversation_was_compressed,
                "conversationSummary": preview_text(conversation_summary, 320),
            },
        )
        context = self.context_builder.build(
            chat_input,
            memory_items,
            memory_hits,
            retained_recent_messages,
            conversation_summary,
            conversation_was_compressed,
        )
        log_pipeline_event(
            self.logger,
            "chat_context_built",
            {
                "analysisId": chat_input.analysis_id,
                "assembledContext": preview_text(context.assembled_context, 480),
                "transcriptExcerpt": preview_text(context.transcript_excerpt, 320),
                "outlineCount": len(context.outline),
                "keyPointCount": len(context.key_points),
            },
        )

        return PreparedChatTurn(
            chat_input=chat_input,
            memory_items=memory_items,
            memory_hits=memory_hits,
            context=context,
            conversation_summary=conversation_summary,
        )

    def _prepare_turn_stream(self, request: ChatRequest):
        yield self._build_phase_event(
            id="python-sanitize-input",
            label="Sanitizing chat input",
            status="active",
            detail="Validating the latest user message and trimming the request payload.",
        )
        chat_input = self.sanitizer.sanitize(request)
        logPipeline = log_pipeline_event
        logPipeline(
            self.logger,
            "chat_input_sanitized",
            {
                "analysisId": chat_input.analysis_id,
                "userId": chat_input.user_id,
                "message": preview_text(chat_input.message),
                "recentMessageCount": len(chat_input.recent_messages),
                "storedConversationSummary": preview_text(
                    chat_input.stored_conversation_summary
                ),
            },
        )
        yield self._build_phase_event(
            id="python-sanitize-input",
            label="Sanitizing chat input",
            status="completed",
            detail="Validated the request payload and prepared the latest user turn.",
        )
        yield self._build_phase_event(
            id="python-load-memory",
            label="Loading memory",
            status="active",
            detail="Loading recalled memory items that may affect the answer.",
        )
        memory_items, memory_hits = self.load_memory(chat_input)
        logPipeline(
            self.logger,
            "chat_memory_loaded",
            {
                "analysisId": chat_input.analysis_id,
                "memoryItemCount": len(memory_items),
                "memoryHits": memory_hits,
                "memoryKinds": [item.kind for item in memory_items],
            },
        )
        yield self._build_phase_event(
            id="python-load-memory",
            label="Loading memory",
            status="completed",
            detail=(
                f"Loaded {len(memory_items)} memory item"
                f"{'' if len(memory_items) == 1 else 's'} and "
                f"{len(memory_hits)} memory hit"
                f"{'' if len(memory_hits) == 1 else 's'}."
            ),
        )
        yield self._build_phase_event(
            id="python-compress-summary",
            label="Compressing conversation summary",
            status="active",
            detail="Refreshing the rolling summary for recent conversation context.",
        )
        (
            retained_recent_messages,
            conversation_summary,
            conversation_was_compressed,
        ) = self.summarizer.summarize(chat_input, self.model_gateway)
        logPipeline(
            self.logger,
            "conversation_summary_prepared",
            {
                "analysisId": chat_input.analysis_id,
                "retainedRecentMessages": len(retained_recent_messages),
                "conversationWasCompressed": conversation_was_compressed,
                "conversationSummary": preview_text(conversation_summary, 320),
            },
        )
        yield self._build_phase_event(
            id="python-compress-summary",
            label="Compressing conversation summary",
            status="completed",
            detail=(
                "Prepared the rolling conversation summary."
                if conversation_summary
                else "No rolling summary changes were needed for this turn."
            ),
        )
        yield self._build_phase_event(
            id="python-build-context",
            label="Building model context",
            status="active",
            detail="Assembling transcript evidence, outline, summary, and memory for the model.",
        )
        context = self.context_builder.build(
            chat_input,
            memory_items,
            memory_hits,
            retained_recent_messages,
            conversation_summary,
            conversation_was_compressed,
        )
        logPipeline(
            self.logger,
            "chat_context_built",
            {
                "analysisId": chat_input.analysis_id,
                "assembledContext": preview_text(context.assembled_context, 480),
                "transcriptExcerpt": preview_text(context.transcript_excerpt, 320),
                "outlineCount": len(context.outline),
                "keyPointCount": len(context.key_points),
            },
        )
        yield self._build_phase_event(
            id="python-build-context",
            label="Building model context",
            status="completed",
            detail=(
                f"Built context with {len(context.memory_items)} memory item"
                f"{'' if len(context.memory_items) == 1 else 's'} and "
                f"{len(context.key_points)} key point"
                f"{'' if len(context.key_points) == 1 else 's'}."
            ),
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
        log_pipeline_event(
            self.logger,
            "chat_response_finalized",
            {
                "analysisId": prepared_turn.chat_input.analysis_id,
                "answer": preview_text(final_response.answer, 320),
                "memoryUpdateCount": len(final_response.memory_updates),
                "memoryUpdateKinds": [
                    item.kind for item in final_response.memory_updates
                ],
                "conversationSummary": preview_text(
                    final_response.conversation_summary,
                    320,
                ),
            },
        )

        return final_response

    def _build_fallback_answer(self, prepared_turn: PreparedChatTurn) -> str:
        return self.response_generator.generate(
            prepared_turn.context,
            prepared_turn.memory_items,
            None,
        ).answer

    def _build_phase_event(
        self,
        *,
        id: str,
        label: str,
        status: Literal["active", "completed", "failed"],
        detail: str | None,
        tool_name: str | None = None,
    ):
        phase = ChatPhase(
            id=id,
            label=label,
            status=status,
            detail=detail,
            source="python",
            tool_name=tool_name,
        )

        return {
            "event": "phase",
            "data": phase.model_dump(by_alias=True),
        }

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
