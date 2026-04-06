from io import BytesIO
from itertools import count
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
        except ImportError:
            return self._generate_without_reportlab(request)

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

    def _generate_without_reportlab(self, request: PdfReportRequest) -> tuple[bytes, str]:
        pages = self._build_fallback_pages(request)
        pdf_bytes = self._build_basic_pdf(pages)
        return pdf_bytes, self._build_filename(request.title)

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

    def _build_fallback_pages(self, request: PdfReportRequest) -> list[list[str]]:
        max_chars_per_line = 88
        max_lines_per_page = 44
        pages: list[list[str]] = [[]]

        def add_line(line: str = "") -> None:
            current_page = pages[-1]
            if len(current_page) >= max_lines_per_page:
                pages.append([])
                current_page = pages[-1]
            current_page.append(line)

        def add_wrapped(text: str, prefix: str = "") -> None:
            normalized = self._normalize_text(text)
            if not normalized:
                return

            words = normalized.split(" ")
            first_line_prefix = prefix
            continuation_prefix = " " * len(prefix)
            current = first_line_prefix

            for word in words:
                separator = "" if current.endswith((" ", "-", "•")) or current == first_line_prefix else " "
                candidate = f"{current}{separator}{word}"
                if len(candidate) <= max_chars_per_line:
                    current = candidate
                    continue

                add_line(current.rstrip())
                current = f"{continuation_prefix}{word}"

            add_line(current.rstrip())

        add_wrapped(request.title)
        add_line()

        sections = [
            ("Summary", [request.summary]),
            ("Key Points", request.key_points),
            (
                "Outline",
                [f"[{item.time}] {item.text}" if item.time else item.text for item in request.outline],
            ),
            (
                "Chat History",
                [f"{message.role.capitalize()}: {message.content}" for message in request.chat_history],
            ),
        ]

        for title, entries in sections:
            filtered_entries = [entry for entry in entries if self._normalize_text(entry)]
            if not filtered_entries:
                continue

            add_line(title)
            for index, entry in enumerate(filtered_entries):
                prefix = "- " if title == "Key Points" else ""
                add_wrapped(entry, prefix=prefix)
                if title != "Summary" and index < len(filtered_entries) - 1:
                    add_line()
            add_line()

        return [page for page in pages if page]

    def _build_basic_pdf(self, pages: list[list[str]]) -> bytes:
        page_width = 612
        page_height = 792
        text_start_x = 50
        text_start_y = 742
        font_size = 11
        leading = 16

        objects: list[bytes] = []
        object_numbers = count(1)

        def add_object(content: bytes) -> int:
            object_number = next(object_numbers)
            objects.append(
                f"{object_number} 0 obj\n".encode("ascii") + content + b"\nendobj\n"
            )
            return object_number

        font_object = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

        page_ids: list[int] = []
        content_ids: list[int] = []
        parent_placeholder = b"__PAGES_OBJECT__"

        for page_lines in pages:
            content_stream = self._build_page_stream(
                page_lines=page_lines,
                text_start_x=text_start_x,
                text_start_y=text_start_y,
                font_size=font_size,
                leading=leading,
            )
            content_id = add_object(
                b"<< /Length "
                + str(len(content_stream)).encode("ascii")
                + b" >>\nstream\n"
                + content_stream
                + b"\nendstream"
            )
            content_ids.append(content_id)

            page_id = add_object(
                b"<< /Type /Page /Parent "
                + parent_placeholder
                + b" 0 R /MediaBox [0 0 "
                + str(page_width).encode("ascii")
                + b" "
                + str(page_height).encode("ascii")
                + b"] /Contents "
                + str(content_id).encode("ascii")
                + b" 0 R /Resources << /Font << /F1 "
                + str(font_object).encode("ascii")
                + b" 0 R >> >> >>"
            )
            page_ids.append(page_id)

        kids = b" ".join(f"{page_id} 0 R".encode("ascii") for page_id in page_ids)
        pages_object_id = add_object(
            b"<< /Type /Pages /Count "
            + str(len(page_ids)).encode("ascii")
            + b" /Kids [ "
            + kids
            + b" ] >>"
        )

        catalog_id = add_object(
            b"<< /Type /Catalog /Pages " + str(pages_object_id).encode("ascii") + b" 0 R >>"
        )

        fixed_objects = [
            obj.replace(parent_placeholder + b" 0 R", f"{pages_object_id} 0 R".encode("ascii"))
            for obj in objects
        ]

        pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for obj in fixed_objects:
            offsets.append(len(pdf))
            pdf.extend(obj)

        xref_start = len(pdf)
        pdf.extend(f"xref\n0 {len(fixed_objects) + 1}\n".encode("ascii"))
        pdf.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

        pdf.extend(
            (
                f"trailer\n<< /Size {len(fixed_objects) + 1} /Root {catalog_id} 0 R >>\n"
                f"startxref\n{xref_start}\n%%EOF"
            ).encode("ascii")
        )
        return bytes(pdf)

    def _build_page_stream(
        self,
        *,
        page_lines: list[str],
        text_start_x: int,
        text_start_y: int,
        font_size: int,
        leading: int,
    ) -> bytes:
        operations = [
            "BT",
            f"/F1 {font_size} Tf",
            f"{leading} TL",
            f"1 0 0 1 {text_start_x} {text_start_y} Tm",
        ]

        for index, line in enumerate(page_lines):
            escaped = self._escape_pdf_text(self._normalize_text(line))
            operations.append(f"({escaped}) Tj")
            if index < len(page_lines) - 1:
                operations.append("T*")

        operations.append("ET")
        return "\n".join(operations).encode("latin-1", errors="replace")

    def _escape_pdf_text(self, value: str) -> str:
        sanitized = value.encode("latin-1", errors="replace").decode("latin-1")
        return (
            sanitized.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        )


pdf_report_service = PdfReportService()
