import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.logging import get_logger
from app.core.pipeline_debug import log_pipeline_event, preview_text
from app.models.chat import ChatRequest, ChatResponse
from app.services.chat import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])
logger = get_logger("app.api.routes.chat")


@router.post("/respond", response_model=ChatResponse)
def respond(request: ChatRequest) -> ChatResponse:
    log_pipeline_event(
        logger,
        "chat_request_received",
        {
            "analysisId": request.analysis_id,
            "userId": request.user_id,
            "message": preview_text(request.message),
            "recentMessageCount": len(request.recent_messages),
            "memoryItemCount": len(request.memory_items),
            "storedMemoryItemCount": len(request.stored_memory_items),
        },
    )
    return chat_service.respond(request)


@router.post("/respond/stream")
def respond_stream(request: ChatRequest) -> StreamingResponse:
    log_pipeline_event(
        logger,
        "chat_stream_request_received",
        {
            "analysisId": request.analysis_id,
            "userId": request.user_id,
            "message": preview_text(request.message),
            "recentMessageCount": len(request.recent_messages),
            "memoryItemCount": len(request.memory_items),
            "storedMemoryItemCount": len(request.stored_memory_items),
        },
    )

    def event_stream():
        try:
            for event in chat_service.stream_respond(request):
                yield _encode_sse_event(
                    event=event["event"],
                    data=event["data"],
                )
        except Exception as exc:
            yield _encode_sse_event(
                event="error",
                data={"message": str(exc)},
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _encode_sse_event(*, event: str, data: object) -> str:
    serialized = data if isinstance(data, str) else json.dumps(data)
    return f"event: {event}\ndata: {serialized}\n\n"
