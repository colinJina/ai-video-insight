from app.models.chat import ChatContext, ChatMemoryItem, ChatResponse


class ChatResponseGenerator:
    """Builds a usable fallback answer when no real model provider is configured."""

    def generate(
        self,
        context: ChatContext,
        memory_items: list[ChatMemoryItem],
        model_answer: str | None = None,
    ) -> ChatResponse:
        answer = (model_answer or "").strip() or self._build_fallback_answer(
            context,
            memory_items,
        )

        return ChatResponse(
            answer=answer,
            memory_items=memory_items,
            memory_hits=context.memory_hits,
            conversation_summary=context.conversation_summary,
        )

    def _build_fallback_answer(
        self,
        context: ChatContext,
        memory_items: list[ChatMemoryItem],
    ) -> str:
        prefers_chinese = self._prefers_chinese(context)
        question = context.latest_user_message.lower()

        if self._is_video_summary_request(question):
            return self._build_video_summary_answer(
                context, memory_items, prefers_chinese
            )

        if prefers_chinese:
            return self._build_generic_chinese_answer(context, memory_items)

        return self._build_generic_english_answer(context, memory_items)

    def _build_video_summary_answer(
        self,
        context: ChatContext,
        memory_items: list[ChatMemoryItem],
        prefers_chinese: bool,
    ) -> str:
        primary_summary = context.analysis_summary or self._pick_memory(
            memory_items, "summary"
        )
        highlights = self._collect_highlights(context, memory_items, limit=3)
        outline_points = self._collect_outline_points(context, limit=3)

        if prefers_chinese:
            parts: list[str] = []

            if primary_summary:
                parts.append(f"这个视频主要讲的是：{primary_summary}")
            elif highlights:
                parts.append(f"从当前分析结果看，这个视频重点在讲：{highlights[0]}")
            elif context.transcript_excerpt:
                parts.append(
                    f"从转录片段来看，这个视频主要围绕：{context.transcript_excerpt}"
                )
            else:
                return "我这边已经收到你的问题，但当前没有拿到足够的视频分析内容，所以还不能准确概括这段视频。你可以先完成分析，或把摘要、关键点或字幕片段传给我。"

            if len(highlights) > 1:
                parts.append("几个关键信息点是：" + "；".join(highlights[1:]))

            if outline_points:
                parts.append("从结构上看，内容大致包括：" + "；".join(outline_points))

            parts.append(
                "如果你愿意，我接下来可以继续用中文帮你提炼成一句话总结、详细摘要，或者列出视频的核心观点。"
            )
            return " ".join(parts)

        parts = []
        if primary_summary:
            parts.append(f"This video is mainly about: {primary_summary}")
        elif highlights:
            parts.append(
                f"Based on the current analysis, the main focus is: {highlights[0]}"
            )
        elif context.transcript_excerpt:
            parts.append(
                f"From the transcript excerpt, the video appears to focus on: {context.transcript_excerpt}"
            )
        else:
            return "I received your question, but I do not have enough analysis context yet to summarize the video accurately."

        if len(highlights) > 1:
            parts.append("Key points include: " + "; ".join(highlights[1:]))

        if outline_points:
            parts.append("The structure appears to cover: " + "; ".join(outline_points))

        parts.append(
            "If you want, I can also turn this into a one-sentence summary or a more detailed breakdown."
        )
        return " ".join(parts)

    def _build_generic_chinese_answer(
        self,
        context: ChatContext,
        memory_items: list[ChatMemoryItem],
    ) -> str:
        primary_summary = context.analysis_summary or self._pick_memory(
            memory_items, "summary"
        )
        highlights = self._collect_highlights(context, memory_items, limit=3)

        if primary_summary:
            answer = f"我会继续用中文和你对话。结合当前分析内容，先给你一个结论：{primary_summary}"
            if highlights:
                answer += " 另外几个相关重点是：" + "；".join(highlights)
            return answer

        if highlights:
            return (
                "我会继续用中文和你对话。结合当前上下文，我先整理到这些重点："
                + "；".join(highlights)
            )

        if context.transcript_excerpt:
            return (
                "我会继续用中文和你对话。当前我能参考的主要内容来自字幕片段："
                + context.transcript_excerpt
            )

        return "我会继续用中文和你对话。当前这条消息已经正常到达后端，但还没有足够的分析摘要、关键点或字幕内容可供回答。你可以继续提问，或者先完成视频分析。"

    def _build_generic_english_answer(
        self,
        context: ChatContext,
        memory_items: list[ChatMemoryItem],
    ) -> str:
        primary_summary = context.analysis_summary or self._pick_memory(
            memory_items, "summary"
        )
        highlights = self._collect_highlights(context, memory_items, limit=3)

        if primary_summary:
            answer = f"I can answer based on the current analysis context. Here is the main takeaway: {primary_summary}"
            if highlights:
                answer += " Related points: " + "; ".join(highlights)
            return answer

        if highlights:
            return (
                "I can answer from the current context. The most relevant points I have are: "
                + "; ".join(highlights)
            )

        if context.transcript_excerpt:
            return (
                "I can answer from the current transcript excerpt: "
                + context.transcript_excerpt
            )

        return "Your message reached the backend successfully, but there is not enough analysis context attached yet to answer it well."

    def _collect_highlights(
        self,
        context: ChatContext,
        memory_items: list[ChatMemoryItem],
        *,
        limit: int,
    ) -> list[str]:
        candidates: list[str] = []

        candidates.extend(context.key_points)

        if context.analysis_summary:
            candidates.append(context.analysis_summary)

        if context.transcript_excerpt:
            candidates.append(context.transcript_excerpt)

        for item in memory_items:
            candidates.append(item.content)

        return self._dedupe_and_trim(candidates, limit=limit)

    def _collect_outline_points(self, context: ChatContext, *, limit: int) -> list[str]:
        candidates = [
            f"{item.time} {item.text}".strip() if item.time else item.text
            for item in context.outline
        ]
        return self._dedupe_and_trim(candidates, limit=limit)

    def _pick_memory(self, memory_items: list[ChatMemoryItem], kind: str) -> str | None:
        kind_lower = kind.lower()
        for item in memory_items:
            if item.kind.lower() == kind_lower and item.content.strip():
                return item.content.strip()
        return None

    def _dedupe_and_trim(self, values: list[str], *, limit: int) -> list[str]:
        results: list[str] = []

        for value in values:
            normalized = " ".join(value.split()).strip()
            if not normalized:
                continue

            snippet = normalized[:180].rstrip(" ,;:")
            if not snippet or snippet in results:
                continue

            results.append(snippet)
            if len(results) >= limit:
                break

        return results

    def _is_video_summary_request(self, question: str) -> bool:
        keywords = [
            "讲了什么",
            "说了什么",
            "内容是什么",
            "总结",
            "概括",
            "主要讲",
            "what is this video about",
            "what the video is about",
            "summarize this video",
            "summary of the video",
        ]
        return any(keyword in question for keyword in keywords)

    def _prefers_chinese(self, context: ChatContext) -> bool:
        sources = [
            context.latest_user_message,
            context.analysis_summary or "",
            context.transcript_excerpt or "",
            *(item.content for item in context.recent_messages[-2:]),
        ]
        return any(self._contains_cjk(text) for text in sources if text)

    def _contains_cjk(self, value: str) -> bool:
        for char in value:
            if "\u4e00" <= char <= "\u9fff":
                return True
        return False
