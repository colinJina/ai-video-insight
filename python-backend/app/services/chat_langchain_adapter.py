import json

from pydantic import SecretStr

from app.core.exceptions import ServiceUnavailableError
from app.models.chat import ChatContext, ChatMemoryItem, ChatMessage


def _resolve_langchain_base_url(base_url: str) -> str:
    trimmed = base_url.rstrip("/")

    for suffix in ("/v1/chat/completions", "/chat/completions", "/v1/chat"):
        if trimmed.endswith(suffix):
            return trimmed[: -len(suffix)] or base_url

    return trimmed


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


class LangChainChatModelAdapter:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float,
    ) -> None:
        self.base_url = _resolve_langchain_base_url(base_url) if base_url else ""
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def generate(self, system_prompt: str, user_prompt: str) -> str | None:
        if not self.is_configured():
            return None

        answer = self._invoke_text(
            [("system", system_prompt), ("user", user_prompt)]
        )
        if not answer:
            raise ServiceUnavailableError(
                "The LangChain chat model returned an empty chat completion."
            )

        return answer

    def generate_stream(
        self, system_prompt: str, user_prompt: str
    ) -> list[str] | None:
        if not self.is_configured():
            return None

        return self._invoke_text_stream(
            [("system", system_prompt), ("user", user_prompt)]
        )

    def generate_conversation_summary(
        self,
        previous_summary: str | None,
        compressed_messages: list[ChatMessage],
    ) -> str | None:
        if not self.is_configured():
            return None

        if not previous_summary and not compressed_messages:
            return None

        rendered_messages = "\n".join(
            f"- {message.role}: {message.content}" for message in compressed_messages
        )
        answer = self._invoke_text(
            [
                (
                    "system",
                    (
                        "You maintain a rolling summary for a multi-turn video-analysis chat. "
                        "Write a concise, durable summary that preserves user goals, confirmed "
                        "technical decisions, important conclusions, and unresolved follow-ups. "
                        "Keep it grounded in the provided conversation only."
                    ),
                ),
                (
                    "user",
                    (
                        "Update the rolling conversation summary.\n\n"
                        f"Previous summary:\n{previous_summary or 'None yet.'}\n\n"
                        f"New messages to merge:\n{rendered_messages or '- None'}\n\n"
                        "Return a single paragraph between 80 and 180 words."
                    ),
                ),
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
        if not self.is_configured():
            return []

        rendered_existing = "\n".join(
            f"- [{item.kind}] {item.content}" for item in existing_memory_items[:8]
        )
        raw = self._invoke_text(
            [
                (
                    "system",
                    (
                        "Extract long-term memory candidates from the latest chat turn. "
                        "Only keep durable information that may help future turns, such as "
                        "user goals, stated preferences, confirmed project decisions, or key facts. "
                        "Do not store transcript quotes, temporary phrasing, or redundant summaries. "
                        'Return JSON only with the shape {"items":[{"kind":"string","content":"string","source":"string","metadata":{"importance":0.0}}]}.'
                    ),
                ),
                (
                    "user",
                    (
                        f"Analysis summary:\n{context.analysis_summary or 'None'}\n\n"
                        f"Existing stored memory:\n{rendered_existing or '- None'}\n\n"
                        f"Latest user message:\n{context.latest_user_message}\n\n"
                        f"Assistant answer:\n{answer}\n\n"
                        "Return at most 3 items."
                    ),
                ),
            ],
            temperature=0.1,
            json_mode=True,
        )

        return _normalize_memory_items(_parse_json_object(raw))

    def _invoke_text(
        self,
        messages: list[tuple[str, str]],
        *,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str:
        ChatOpenAI, HumanMessage, SystemMessage = self._load_langchain_components()
        model = ChatOpenAI(
            model=self.model,
            temperature=temperature,
            timeout=self.timeout_seconds,
            max_retries=2,
            api_key=SecretStr(self.api_key),
            base_url=self.base_url,
        )

        if json_mode:
            model = model.bind(response_format={"type": "json_object"})

        langchain_messages = [
            SystemMessage(content=content) if role == "system" else HumanMessage(content=content)
            for role, content in messages
        ]

        try:
            response = model.invoke(langchain_messages)
        except Exception as exc:
            raise ServiceUnavailableError(
                "The LangChain chat model request failed."
            ) from exc

        return _read_text_content(getattr(response, "content", ""))

    def _invoke_text_stream(
        self,
        messages: list[tuple[str, str]],
        *,
        temperature: float = 0.2,
    ) -> list[str]:
        ChatOpenAI, HumanMessage, SystemMessage = self._load_langchain_components()
        model = ChatOpenAI(
            model=self.model,
            temperature=temperature,
            timeout=self.timeout_seconds,
            max_retries=2,
            api_key=SecretStr(self.api_key),
            base_url=self.base_url,
        )
        langchain_messages = [
            SystemMessage(content=content) if role == "system" else HumanMessage(content=content)
            for role, content in messages
        ]

        chunks: list[str] = []

        try:
            for chunk in model.stream(langchain_messages):
                text = _read_text_content(getattr(chunk, "content", ""))
                if text:
                    chunks.append(text)
        except Exception as exc:
            raise ServiceUnavailableError(
                "The LangChain chat model request failed."
            ) from exc

        return chunks

    def _load_langchain_components(self):
        try:
            from langchain_openai import ChatOpenAI
            from langchain_core.messages import HumanMessage, SystemMessage
        except ImportError as exc:
            raise ServiceUnavailableError(
                "LangChain support is enabled, but langchain-openai is not installed in the python-backend virtual environment. Activate python-backend\\.venv and run pip install -r requirements.txt."
            ) from exc

        return ChatOpenAI, HumanMessage, SystemMessage
