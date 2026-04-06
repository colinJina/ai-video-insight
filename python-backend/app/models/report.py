from pydantic import Field

from app.models.chat import ChatMessage, ChatModel, ChatOutlineItem


class PdfReportRequest(ChatModel):
    title: str = Field(min_length=1, description="Video analysis title.")
    summary: str = Field(min_length=1, description="High-level analysis summary.")
    key_points: list[str] = Field(
        default_factory=list,
        description="Key takeaways to include in the PDF report.",
    )
    outline: list[ChatOutlineItem] = Field(
        default_factory=list,
        description="Structured outline items from the video analysis.",
    )
    chat_history: list[ChatMessage] = Field(
        default_factory=list,
        description="Recent chat history to append to the PDF report.",
    )
