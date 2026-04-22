from __future__ import annotations

from datetime import datetime
from logging import Logger
from typing import Any

from app.core.config import get_settings

DEFAULT_TEXT_LIMIT = 240
MAX_DEPTH = 3
MAX_ARRAY_ITEMS = 8


def preview_text(value: str | None, max_length: int = DEFAULT_TEXT_LIMIT) -> str | None:
    if not value:
        return None

    normalized = " ".join(value.split()).strip()
    if len(normalized) <= max_length:
        return normalized

    return normalized[: max(0, max_length - 3)].rstrip() + "..."


def _summarize_value(value: Any, depth: int = 0) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, str):
        return preview_text(value)

    if isinstance(value, list):
        if depth >= MAX_DEPTH:
            return f"[list({len(value)})]"
        return [_summarize_value(item, depth + 1) for item in value[:MAX_ARRAY_ITEMS]]

    if isinstance(value, tuple):
        if depth >= MAX_DEPTH:
            return f"[tuple({len(value)})]"
        return [_summarize_value(item, depth + 1) for item in value[:MAX_ARRAY_ITEMS]]

    if isinstance(value, dict):
        if depth >= MAX_DEPTH:
            return "[object]"
        return {
            key: _summarize_value(item, depth + 1)
            for key, item in value.items()
        }

    if hasattr(value, "model_dump"):
        return _summarize_value(
            value.model_dump(by_alias=True),
            depth=depth + 1,
        )

    return str(value)


def log_pipeline_event(
    logger: Logger,
    event: str,
    payload: dict[str, Any] | None = None,
) -> None:
    if not get_settings().is_pipeline_debug_enabled:
        return

    if payload:
        logger.info(
            "[pipeline] %s %s",
            event,
            _summarize_value(payload),
        )
        return

    logger.info("[pipeline] %s", event)
