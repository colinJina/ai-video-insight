import json
from urllib import error, request

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailableError
from app.models.chat import ChatContext


def _resolve_chat_completions_url(base_url: str) -> str:
    trimmed = base_url.rstrip("/")

    if (
        trimmed.endswith("/chat/completions")
        or trimmed.endswith("/v1/chat/completions")
    ):
        return trimmed

    if trimmed.endswith("/v1"):
        return f"{trimmed}/chat/completions"

    if trimmed.endswith("/v1/chat"):
        return f"{trimmed}/completions"

    return f"{trimmed}/chat/completions"


def _read_text_content(content: object) -> str:
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue

            if item.get("type") == "text" and isinstance(item.get("text"), str):
                parts.append(item["text"])

        return "".join(parts).strip()

    return ""


def _extract_assistant_text(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""

    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""

    message = first_choice.get("message")
    if not isinstance(message, dict):
        return ""

    return _read_text_content(message.get("content"))


class ChatModelGateway:
    """OpenAI-compatible chat gateway backed by the existing AI_* config."""

    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.ai_base_url or ""
        self.api_key = settings.ai_api_key or ""
        self.model = settings.ai_model or ""
        self.timeout_seconds = max(settings.ai_timeout_ms, 1000) / 1000
        self.endpoint = (
            _resolve_chat_completions_url(self.base_url) if self.base_url else ""
        )

    def generate(self, context: ChatContext) -> str | None:
        if not self._is_configured():
            return None

        messages = [
            {
                "role": "system",
                "content": self._build_system_prompt(),
            },
            {
                "role": "user",
                "content": self._build_user_prompt(context),
            },
        ]

        payload = {
            "model": self.model,
            "temperature": 0.2,
            "messages": messages,
        }

        raw_body = json.dumps(payload).encode("utf-8")
        http_request = request.Request(
            self.endpoint,
            data=raw_body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )

        try:
            with request.urlopen(http_request, timeout=self.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ServiceUnavailableError(
                self._build_http_error_message(exc.code, detail)
            ) from exc
        except error.URLError as exc:
            raise ServiceUnavailableError(
                "Could not reach the configured AI chat service."
            ) from exc

        try:
            parsed = json.loads(response_body) if response_body else {}
        except json.JSONDecodeError as exc:
            raise ServiceUnavailableError(
                "The AI service returned a response that could not be parsed."
            ) from exc

        answer = _extract_assistant_text(parsed)
        if not answer:
            raise ServiceUnavailableError(
                "The AI service returned an empty chat completion."
            )

        return answer

    def _is_configured(self) -> bool:
        return bool(self.endpoint and self.api_key and self.model)

    def _build_system_prompt(self) -> str:
        return (
            "You are an AI assistant for a video analysis product. "
            "Answer using the supplied analysis context, transcript evidence, "
            "recent conversation, and memory items when relevant. "
            "Do not invent details that are not supported by the provided context. "
            "If the context is insufficient, say what is missing. "
            "Reply in the same language as the user's latest message unless the "
            "context strongly suggests otherwise."
        )

    def _build_user_prompt(self, context: ChatContext) -> str:
        assembled = context.assembled_context.strip()
        if not assembled:
            assembled = "No additional analysis context was available."

        return (
            "Use the following context to answer the user's question.\n\n"
            f"Context:\n{assembled}\n\n"
            f"Latest user question:\n{context.latest_user_message}\n\n"
            "Answer helpfully and cite the provided context implicitly in your wording."
        )

    def _build_http_error_message(self, status_code: int, detail: str) -> str:
        try:
            payload = json.loads(detail) if detail else {}
        except json.JSONDecodeError:
            payload = {}

        if isinstance(payload, dict):
            error_payload = payload.get("error")
            if isinstance(error_payload, dict):
                message = error_payload.get("message")
                if isinstance(message, str) and message.strip():
                    return message.strip()

        return f"The AI service returned status {status_code}."


chat_model_gateway = ChatModelGateway()
