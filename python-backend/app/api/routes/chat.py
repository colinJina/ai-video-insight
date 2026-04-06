from fastapi import APIRouter, HTTPException

from app.models.chat import ChatRequest, ChatResponse
from app.services.chat import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/respond", response_model=ChatResponse)
def respond(request: ChatRequest) -> ChatResponse:
    try:
        return chat_service.respond(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
