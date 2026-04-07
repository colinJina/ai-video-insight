import re

from app.models.chat import ChatContext


class TopicGuardResult:
    def __init__(self, allowed: bool, message: str | None = None) -> None:
        self.allowed = allowed
        self.message = message


class ChatTopicGuard:
    """Keeps the chat focused on the current video while allowing related extensions."""

    _generic_video_phrases = (
        "this video",
        "the video",
        "current video",
        "视频",
        "本视频",
        "这段视频",
        "这个视频",
        "当前视频",
    )

    _allowed_intent_keywords = (
        "summary",
        "summarize",
        "topic",
        "main point",
        "takeaway",
        "outline",
        "timestamp",
        "explain",
        "why",
        "how",
        "example",
        "compare",
        "apply",
        "use in",
        "what does",
        "总结",
        "概括",
        "讲了什么",
        "主要讲",
        "重点",
        "要点",
        "时间点",
        "解释",
        "为什么",
        "怎么",
        "举例",
        "应用",
        "类比",
        "面试",
    )

    _stop_words = {
        "the",
        "and",
        "with",
        "from",
        "that",
        "this",
        "what",
        "when",
        "where",
        "which",
        "about",
        "into",
        "your",
        "have",
        "will",
        "would",
        "could",
        "should",
        "请问",
        "这个",
        "那个",
        "视频",
        "内容",
        "什么",
        "怎么",
        "为什么",
        "一下",
        "一下子",
        "我们",
        "你们",
        "他们",
    }

    def check(self, context: ChatContext) -> TopicGuardResult:
        question = context.latest_user_message.strip()
        if not question:
            return TopicGuardResult(True)

        normalized_question = question.lower()

        if self._contains_any(normalized_question, self._generic_video_phrases):
            return TopicGuardResult(True)

        if self._contains_any(normalized_question, self._allowed_intent_keywords):
            context_terms = self._extract_context_terms(context)
            if not context_terms:
                return TopicGuardResult(True)

            if self._question_overlaps_context(normalized_question, context_terms):
                return TopicGuardResult(True)

            if self._looks_like_related_extension(normalized_question):
                return TopicGuardResult(True)

        context_terms = self._extract_context_terms(context)
        if context_terms and self._question_overlaps_context(normalized_question, context_terms):
            return TopicGuardResult(True)

        if not context_terms:
            return TopicGuardResult(True)

        return TopicGuardResult(
            False,
            (
                "This question does not appear to be closely related to the current video. "
                "Please ask about the video's summary, key ideas, timestamps, explanations, "
                "or practical extensions of the video's content."
            ),
        )

    def _extract_context_terms(self, context: ChatContext) -> set[str]:
        candidates: list[str] = []

        if context.analysis_summary:
            candidates.append(context.analysis_summary)

        if context.transcript_excerpt:
            candidates.append(context.transcript_excerpt)

        candidates.extend(context.key_points)
        candidates.extend(item.text for item in context.outline)
        candidates.extend(item.content for item in context.memory_items)

        tokens: set[str] = set()
        for candidate in candidates:
            for token in self._tokenize(candidate):
                if len(token) >= 3 and token not in self._stop_words:
                    tokens.add(token)

        return tokens

    def _question_overlaps_context(
        self, normalized_question: str, context_terms: set[str]
    ) -> bool:
        question_tokens = {
            token
            for token in self._tokenize(normalized_question)
            if len(token) >= 3 and token not in self._stop_words
        }
        if not question_tokens:
            return False

        overlap = question_tokens & context_terms
        return len(overlap) >= 1

    def _looks_like_related_extension(self, normalized_question: str) -> bool:
        extension_markers = (
            "apply",
            "use in",
            "compare",
            "relate",
            "面试",
            "应用",
            "类比",
            "项目里",
            "怎么落地",
        )
        return self._contains_any(normalized_question, extension_markers)

    def _contains_any(self, text: str, keywords: tuple[str, ...]) -> bool:
        return any(keyword in text for keyword in keywords)

    def _tokenize(self, text: str) -> list[str]:
        ascii_tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9_+-]*", text.lower())
        cjk_tokens = re.findall(r"[\u4e00-\u9fff]{2,}", text)
        return [*ascii_tokens, *cjk_tokens]
