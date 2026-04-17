import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models.chat import ChatRequest, ChatResponse
from app.services.chat import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/respond", response_model=ChatResponse)
def respond(request: ChatRequest) -> ChatResponse:
    return chat_service.respond(request)


@router.post("/respond/stream")
def respond_stream(request: ChatRequest) -> StreamingResponse:
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
