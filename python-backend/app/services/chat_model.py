from app.models.chat import ChatContext


class ChatModelGateway:
    """Placeholder gateway for future LangChain or custom LLM integrations."""

    def generate(self, context: ChatContext) -> str | None:
        _ = context
        return None


chat_model_gateway = ChatModelGateway()
