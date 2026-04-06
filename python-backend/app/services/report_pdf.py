from io import BytesIO
from re import sub

from app.models.report import PdfReportRequest


class PdfReportService:
    """Generates a minimal PDF report from structured video analysis content."""

    page_margin = 50
    line_height = 16
    section_gap = 12

    def generate(self, request: PdfReportRequest) -> tuple[bytes, str]:
        try:
            from reportlab.lib.pagesizes import LETTER
            from reportlab.lib.utils import simpleSplit
            from reportlab.pdfgen import canvas
        except ImportError as exc:
            raise RuntimeError(
                "PDF generation is unavailable because reportlab is not installed."
            ) from exc

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=LETTER)
        page_width, page_height = LETTER
        text_width = page_width - (self.page_margin * 2)
        y_position = page_height - self.page_margin

        def ensure_space(required_lines: int = 1) -> None:
            nonlocal y_position
            minimum_y = self.page_margin + (required_lines * self.line_height)
            if y_position < minimum_y:
                pdf.showPage()
                y_position = page_height - self.page_margin

        def draw_lines(lines: list[str], font_name: str = "Helvetica", font_size: int = 11):
            nonlocal y_position
            pdf.setFont(font_name, font_size)
            for line in lines:
                ensure_space()
                pdf.drawString(self.page_margin, y_position, line)
                y_position -= self.line_height

        def wrap_text(text: str, font_name: str = "Helvetica", font_size: int = 11) -> list[str]:
            normalized = self._normalize_text(text)
            if not normalized:
                return []

            return simpleSplit(normalized, font_name, font_size, text_width)

        def draw_section(title: str, body_lines: list[str]) -> None:
            nonlocal y_position
            if not body_lines:
                return

            ensure_space(2)
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(self.page_margin, y_position, title)
            y_position -= self.line_height
            draw_lines(body_lines)
            y_position -= self.section_gap

        draw_lines(
            wrap_text(request.title, font_name="Helvetica-Bold", font_size=16),
            font_name="Helvetica-Bold",
            font_size=16,
        )
        y_position -= self.section_gap

        draw_section("Summary", wrap_text(request.summary))
        draw_section("Key Points", self._build_bullet_lines(request.key_points, wrap_text))
        draw_section("Outline", self._build_outline_lines(request, wrap_text))
        draw_section("Chat History", self._build_chat_lines(request, wrap_text))

        pdf.save()
        buffer.seek(0)
        return buffer.read(), self._build_filename(request.title)

    def _build_bullet_lines(self, key_points: list[str], wrap_text) -> list[str]:
        lines: list[str] = []

        for point in key_points:
            wrapped = wrap_text(point)
            if not wrapped:
                continue

            lines.append(f"- {wrapped[0]}")
            lines.extend(f"  {line}" for line in wrapped[1:])

        return lines

    def _build_outline_lines(self, request: PdfReportRequest, wrap_text) -> list[str]:
        lines: list[str] = []

        for item in request.outline:
            prefix = f"[{item.time}] " if item.time else ""
            wrapped = wrap_text(f"{prefix}{item.text}")
            if not wrapped:
                continue

            lines.extend(wrapped)

        return lines

    def _build_chat_lines(self, request: PdfReportRequest, wrap_text) -> list[str]:
        lines: list[str] = []

        for message in request.chat_history:
            role = message.role.capitalize()
            wrapped = wrap_text(f"{role}: {message.content}")
            if not wrapped:
                continue

            lines.extend(wrapped)

        return lines

    def _build_filename(self, title: str) -> str:
        slug = sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        safe_slug = slug or "video-analysis-report"
        return f"{safe_slug}.pdf"

    def _normalize_text(self, value: str) -> str:
        return " ".join(value.split())


pdf_report_service = PdfReportService()
