import re
from collections.abc import Iterable, Sequence
from typing import Annotated, Any, Protocol, TypedDict, cast

from pydantic import SecretStr

from app.core.exceptions import ServiceUnavailableError
from app.models.chat import ChatContext, ChatMemoryItem


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


def _normalize_text(value: str) -> str:
    return " ".join(value.split()).strip()


def _tokenize_text(value: str) -> list[str]:
    normalized = _normalize_text(value).lower()
    if not normalized:
        return []

    latin_tokens = re.findall(r"[a-z0-9_]+", normalized)
    if latin_tokens:
        return latin_tokens

    compact = re.sub(r"\s+", "", normalized)
    if len(compact) <= 1:
        return [compact] if compact else []

    return [compact[index : index + 2] for index in range(len(compact) - 1)]


def _format_timestamp(seconds: object) -> str | None:
    if not isinstance(seconds, (int, float)) or seconds < 0:
        return None

    minutes = int(seconds // 60)
    remainder = int(seconds % 60)
    return f"{minutes:02d}:{remainder:02d}"


class ChatOpenAIConstructor(Protocol):
    def __call__(
        self,
        *,
        model: str,
        temperature: float | None = ...,
        timeout: float | None = ...,
        max_retries: int | None = ...,
        api_key: SecretStr | None = ...,
        base_url: str | None = ...,
    ) -> Any: ...


class LangGraphChatModelAdapter:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float,
    ) -> None:
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        context: ChatContext,
    ) -> str | None:
        if not self.is_configured():
            return None

        graph, initial_state = self._build_graph(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            context=context,
        )

        try:
            final_state = graph.invoke(initial_state, config={"recursion_limit": 6})
        except Exception as exc:
            raise ServiceUnavailableError(
                "The LangGraph agent request failed."
            ) from exc

        answer = self._extract_final_text(final_state.get("messages", []))
        if not answer:
            raise ServiceUnavailableError(
                "The LangGraph agent returned an empty final answer."
            )

        return answer

    def generate_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        context: ChatContext,
    ) -> Iterable[str] | None:
        answer = self.generate(system_prompt, user_prompt, context)
        if not answer:
            return None

        return self._chunk_text(answer)

    def _build_graph(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        context: ChatContext,
    ):
        (
            ChatOpenAI,
            HumanMessage,
            SystemMessage,
            ToolMessage,
            StateGraph,
            START,
            add_messages,
            tool,
        ) = self._load_langgraph_components()
        chat_openai_cls = cast(ChatOpenAIConstructor, ChatOpenAI)

        model = chat_openai_cls(
            model=self.model,
            temperature=0.2,
            timeout=self.timeout_seconds,
            max_retries=2,
            api_key=SecretStr(self.api_key),
            base_url=self.base_url,
        )
        tools = self._build_tools(context, tool)
        tools_by_name = {tool_instance.name: tool_instance for tool_instance in tools}
        llm_with_tools = model.bind_tools(tools)

        class AgentState(TypedDict):
            messages: Annotated[list[Any], add_messages]

        def assistant(state: AgentState):
            return {
                "messages": [
                    llm_with_tools.invoke(state["messages"]),
                ]
            }

        def run_tools(state: AgentState):
            last_message = state["messages"][-1]
            tool_calls = getattr(last_message, "tool_calls", []) or []
            tool_messages: list[Any] = []

            for tool_call in tool_calls:
                if not isinstance(tool_call, dict):
                    continue

                tool_name = tool_call.get("name")
                tool_instance = tools_by_name.get(tool_name)
                if not tool_instance:
                    continue

                raw_args = tool_call.get("args")
                tool_args = raw_args if isinstance(raw_args, dict) else {}
                result = tool_instance.invoke(tool_args)
                tool_messages.append(
                    ToolMessage(
                        content=result,
                        tool_call_id=str(tool_call.get("id", tool_name or "tool")),
                        name=tool_name,
                    )
                )

            return {"messages": tool_messages}

        def route_after_assistant(state: AgentState):
            last_message = state["messages"][-1]
            tool_calls = getattr(last_message, "tool_calls", []) or []
            return "tools" if tool_calls else "__end__"

        workflow = StateGraph(AgentState)
        workflow.add_node("assistant", assistant)
        workflow.add_node("tools", run_tools)
        workflow.add_edge(START, "assistant")
        workflow.add_conditional_edges("assistant", route_after_assistant)
        workflow.add_edge("tools", "assistant")

        graph = workflow.compile()
        initial_state = {
            "messages": [
                SystemMessage(
                    content=(
                        f"{system_prompt}\n\n"
                        "You are running inside a LangGraph tool-calling loop. "
                        "Use tools when the user asks for timestamps, evidence, structure, "
                        "or when the answer would benefit from inspecting the current analysis context. "
                        "Do not invent transcript evidence. If a tool returns insufficient information, "
                        "say what is missing."
                    )
                ),
                HumanMessage(content=user_prompt),
            ]
        }

        return graph, initial_state

    def _build_tools(self, context: ChatContext, tool_decorator):
        @tool_decorator
        def inspect_analysis_summary() -> str:
            """Read the current video analysis summary, key points, and rolling summary."""

            sections: list[str] = []

            if context.analysis_summary:
                sections.append(f"Analysis summary:\n{context.analysis_summary}")

            if context.key_points:
                rendered_points = "\n".join(f"- {item}" for item in context.key_points[:6])
                sections.append(f"Key points:\n{rendered_points}")

            if context.conversation_summary:
                sections.append(f"Conversation summary:\n{context.conversation_summary}")

            return "\n\n".join(sections) or "No analysis summary is available."

        @tool_decorator
        def inspect_outline() -> str:
            """Read the structured outline of the current video with timestamps when available."""

            if not context.outline:
                return "No outline is available."

            rendered_outline = "\n".join(
                f"- [{item.time}] {item.text}" if item.time else f"- {item.text}"
                for item in context.outline[:8]
            )
            return f"Outline:\n{rendered_outline}"

        @tool_decorator
        def inspect_memory() -> str:
            """Read durable memory items and recent conversation memory that may affect the answer."""

            usable_items = [
                item
                for item in context.memory_items
                if item.kind.lower() != "retrieved_chunk"
            ]

            if not usable_items:
                return "No durable memory items are available."

            rendered_items = "\n".join(
                f"- [{item.kind}] {item.content}" for item in usable_items[:8]
            )
            return f"Memory items:\n{rendered_items}"

        @tool_decorator
        def search_retrieved_chunks(query: str) -> str:
            """Search the already retrieved transcript chunks for the most relevant evidence snippets."""

            transcript_chunks = [
                item
                for item in context.memory_items
                if item.kind.lower() == "retrieved_chunk"
            ]

            if not transcript_chunks and context.transcript_excerpt:
                return f"Transcript excerpt:\n{context.transcript_excerpt}"

            if not transcript_chunks:
                return "No retrieved transcript chunks are available."

            ranked_chunks = self._rank_chunks(query, transcript_chunks)
            rendered_chunks = "\n".join(
                self._render_chunk(item)
                for item in ranked_chunks[:3]
            )
            return f"Retrieved transcript evidence:\n{rendered_chunks}"

        return [
            inspect_analysis_summary,
            inspect_outline,
            inspect_memory,
            search_retrieved_chunks,
        ]

    def _rank_chunks(
        self,
        query: str,
        chunks: list[ChatMemoryItem],
    ) -> list[ChatMemoryItem]:
        query_tokens = set(_tokenize_text(query))

        def score(item: ChatMemoryItem) -> tuple[float, int]:
            text_tokens = set(_tokenize_text(item.content))
            overlap = len(query_tokens & text_tokens)
            lexical_score = overlap / max(len(query_tokens), 1) if query_tokens else 0
            retrieval_score = item.metadata.get("score", 0)
            numeric_retrieval_score = (
                float(retrieval_score)
                if isinstance(retrieval_score, (int, float))
                else 0.0
            )
            return (lexical_score + numeric_retrieval_score, -len(item.content))

        return sorted(chunks, key=score, reverse=True)

    def _render_chunk(self, item: ChatMemoryItem) -> str:
        metadata = item.metadata if isinstance(item.metadata, dict) else {}
        chunk_index = metadata.get("chunkIndex", "?")
        start_label = _format_timestamp(metadata.get("startSeconds"))
        end_label = _format_timestamp(metadata.get("endSeconds"))

        if start_label and end_label and start_label != end_label:
            window = f"{start_label} - {end_label}"
        else:
            window = start_label or end_label or "No timestamp"

        return f"- Chunk {chunk_index} [{window}] {item.content}"

    def _extract_final_text(self, messages: Sequence[object]) -> str:
        for message in reversed(messages):
            tool_calls = getattr(message, "tool_calls", None)
            if tool_calls:
                continue

            content = getattr(message, "content", "")
            text = _read_text_content(content)
            if text:
                return text

        return ""

    def _chunk_text(self, answer: str) -> list[str]:
        normalized = answer.strip()
        if not normalized:
            return []

        chunks: list[str] = []
        cursor = 0

        while cursor < len(normalized):
            chunks.append(normalized[cursor : cursor + 24])
            cursor += 24

        return chunks

    def _load_langgraph_components(self):
        try:
            from langchain_openai import ChatOpenAI
            from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
            from langchain_core.tools import tool
            from langgraph.graph import START, StateGraph
            from langgraph.graph.message import add_messages
        except ImportError as exc:
            raise ServiceUnavailableError(
                "LangGraph support is enabled, but langgraph is not installed in the python-backend virtual environment. Activate python-backend\\.venv and run pip install -r requirements.txt."
            ) from exc

        return (
            ChatOpenAI,
            HumanMessage,
            SystemMessage,
            ToolMessage,
            StateGraph,
            START,
            add_messages,
            tool,
        )
