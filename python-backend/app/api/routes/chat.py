from fastapi import APIRouter

from app.models.chat import ChatRequest, ChatResponse
from app.services.chat import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/respond", response_model=ChatResponse)
def respond(request: ChatRequest) -> ChatResponse:
    return chat_service.respond(request)
