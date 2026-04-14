from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import (
    create_request_logging_middleware,
    install_exception_handlers,
)
from app.core.logging import configure_logging, get_logger

settings = get_settings()
configure_logging(settings)
logger = get_logger("app.main")

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(create_request_logging_middleware(logger))
install_exception_handlers(app, logger)

app.include_router(api_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "AI Video Insight Python backend is running.",
        "docs": "/docs",
        "version": settings.app_version,
        "chat_provider": settings.chat_provider,
        "chat_model_adapter": settings.chat_model_adapter
        or ("langchain" if settings.langchain_enabled else "http"),
    }
