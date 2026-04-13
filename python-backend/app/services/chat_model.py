import json
from urllib import error, request

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailableError
from app.models.chat import ChatContext, ChatMemoryItem, ChatMessage


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


def _parse_json_object(raw_text: str) -> object:
    trimmed = raw_text.strip()
    if not trimmed:
        return {}

    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        first_brace = trimmed.find("{")
        last_brace = trimmed.rfind("}")

        if first_brace == -1 or last_brace <= first_brace:
            return {}

        try:
            return json.loads(trimmed[first_brace : last_brace + 1])
        except json.JSONDecodeError:
            return {}


def _normalize_memory_items(payload: object) -> list[ChatMemoryItem]:
    if not isinstance(payload, dict):
        return []

    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        return []

    normalized_items: list[ChatMemoryItem] = []
    seen_keys: set[tuple[str, str]] = set()

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        kind = item.get("kind")
        content = item.get("content")
        if not isinstance(kind, str) or not isinstance(content, str):
            continue

        normalized_kind = kind.strip()
        normalized_content = " ".join(content.split()).strip()
        if not normalized_kind or not normalized_content:
            continue

        dedupe_key = (normalized_kind.lower(), normalized_content.lower())
        if dedupe_key in seen_keys:
            continue

        source = item.get("source")
        metadata = item.get("metadata")
        normalized_items.append(
            ChatMemoryItem(
                kind=normalized_kind,
                content=normalized_content[:240],
                source=source.strip() if isinstance(source, str) and source.strip() else None,
                metadata=metadata if isinstance(metadata, dict) else {},
            )
        )
        seen_keys.add(dedupe_key)

        if len(normalized_items) >= 3:
            break

    return normalized_items


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

        answer = self._request_completion(
            [
                {
                    "role": "system",
                    "content": self._build_system_prompt(),
                },
                {
                    "role": "user",
                    "content": self._build_user_prompt(context),
                },
            ]
        )
        if not answer:
            raise ServiceUnavailableError(
                "The AI service returned an empty chat completion."
            )

        return answer

    def generate_conversation_summary(
        self,
        previous_summary: str | None,
        compressed_messages: list[ChatMessage],
    ) -> str | None:
        if not self._is_configured():
            return None

        if not previous_summary and not compressed_messages:
            return None

        rendered_messages = "\n".join(
            f"- {message.role}: {message.content}" for message in compressed_messages
        )

        answer = self._request_completion(
            [
                {
                    "role": "system",
                    "content": (
                        "You maintain a rolling summary for a multi-turn video-analysis chat. "
                        "Write a concise, durable summary that preserves user goals, confirmed "
                        "technical decisions, important conclusions, and unresolved follow-ups. "
                        "Keep it grounded in the provided conversation only."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Update the rolling conversation summary.\n\n"
                        f"Previous summary:\n{previous_summary or 'None yet.'}\n\n"
                        f"New messages to merge:\n{rendered_messages or '- None'}\n\n"
                        "Return a single paragraph between 80 and 180 words."
                    ),
                },
            ],
            temperature=0.1,
        )

        return answer.strip() if answer else None

    def extract_memory_items(
        self,
        context: ChatContext,
        answer: str,
        existing_memory_items: list[ChatMemoryItem],
    ) -> list[ChatMemoryItem]:
        if not self._is_configured():
            return []

        rendered_existing = "\n".join(
            f"- [{item.kind}] {item.content}" for item in existing_memory_items[:8]
        )

        raw = self._request_completion(
            [
                {
                    "role": "system",
                    "content": (
                        "Extract long-term memory candidates from the latest chat turn. "
                        "Only keep durable information that may help future turns, such as "
                        "user goals, stated preferences, confirmed project decisions, or key facts. "
                        "Do not store transcript quotes, temporary phrasing, or redundant summaries. "
                        'Return JSON only with the shape {"items":[{"kind":"string","content":"string","source":"string","metadata":{"importance":0.0}}]}.'
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Analysis summary:\n{context.analysis_summary or 'None'}\n\n"
                        f"Existing stored memory:\n{rendered_existing or '- None'}\n\n"
                        f"Latest user message:\n{context.latest_user_message}\n\n"
                        f"Assistant answer:\n{answer}\n\n"
                        "Return at most 3 items."
                    ),
                },
            ],
            temperature=0.1,
            json_mode=True,
        )

        return _normalize_memory_items(_parse_json_object(raw))

    def _is_configured(self) -> bool:
        return bool(self.endpoint and self.api_key and self.model)

    def _request_completion(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str:
        payload = {
            "model": self.model,
            "temperature": temperature,
            "messages": messages,
        }

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

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

        return _extract_assistant_text(parsed)

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
