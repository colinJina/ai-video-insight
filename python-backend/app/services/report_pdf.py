from io import BytesIO
from itertools import count
from re import sub
from unicodedata import east_asian_width

from app.models.report import PdfReportRequest


class PdfReportService:
    """Generates a PDF report from structured video analysis content."""

    page_margin = 50
    line_height = 16
    section_gap = 12
    fallback_page_width = 612
    fallback_page_height = 792
    fallback_font_size = 11
    fallback_title_font_size = 16
    fallback_section_font_size = 12
    fallback_leading = 16

    def generate(self, request: PdfReportRequest) -> tuple[bytes, str]:
        try:
            return self._generate_with_reportlab(request)
        except ImportError:
            return self._generate_without_reportlab(request)

    def _generate_with_reportlab(self, request: PdfReportRequest) -> tuple[bytes, str]:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.pdfgen import canvas

        font_name = "STSong-Light"
        try:
            pdfmetrics.getFont(font_name)
        except KeyError:
            pdfmetrics.registerFont(UnicodeCIDFont(font_name))

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

        def draw_lines(lines: list[str], font_size: int = 11) -> None:
            nonlocal y_position
            pdf.setFont(font_name, font_size)
            for line in lines:
                ensure_space()
                pdf.drawString(self.page_margin, y_position, line)
                y_position -= self.line_height

        def wrap_text(
            text: str,
            *,
            font_size: int = 11,
            first_prefix: str = "",
            continuation_prefix: str = "",
        ) -> list[str]:
            normalized = self._normalize_text(text)
            if not normalized:
                return []

            return self._wrap_text(
                normalized,
                max_width=text_width,
                width_fn=lambda value: pdfmetrics.stringWidth(value, font_name, font_size),
                first_prefix=first_prefix,
                continuation_prefix=continuation_prefix,
            )

        def draw_section(title: str, body_lines: list[str]) -> None:
            nonlocal y_position
            if not body_lines:
                return

            ensure_space(2)
            pdf.setFont(font_name, 12)
            pdf.drawString(self.page_margin, y_position, title)
            y_position -= self.line_height
            draw_lines(body_lines)
            y_position -= self.section_gap

        draw_lines(wrap_text(request.title, font_size=16), font_size=16)
        y_position -= self.section_gap

        draw_section("Summary", wrap_text(request.summary))
        draw_section(
            "Key Points",
            self._build_bullet_lines(
                request.key_points,
                lambda value, prefix="", continuation_prefix="": wrap_text(
                    value,
                    first_prefix=prefix,
                    continuation_prefix=continuation_prefix,
                ),
            ),
        )
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
            wrapped = wrap_text(point, prefix="- ", continuation_prefix="  ")
            if not wrapped:
                continue
            lines.extend(wrapped)

        return lines

    def _build_outline_lines(self, request: PdfReportRequest, wrap_text) -> list[str]:
        lines: list[str] = []

        for item in request.outline:
            prefix = f"[{item.time}] " if item.time else ""
            wrapped = wrap_text(
                f"{prefix}{item.text}",
                continuation_prefix=" " * len(prefix),
            )
            if not wrapped:
                continue
            lines.extend(wrapped)

        return lines

    def _build_chat_lines(self, request: PdfReportRequest, wrap_text) -> list[str]:
        lines: list[str] = []

        for message in request.chat_history:
            role = f"{message.role.capitalize()}: "
            wrapped = wrap_text(
                f"{role}{message.content}",
                continuation_prefix=" " * len(role),
            )
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
        max_units_per_line = 64
        max_lines_per_page = 44
        pages: list[list[str]] = [[]]

        def add_line(line: str = "") -> None:
            current_page = pages[-1]
            if len(current_page) >= max_lines_per_page:
                pages.append([])
                current_page = pages[-1]
            current_page.append(line)

        def add_wrapped(
            text: str,
            *,
            prefix: str = "",
            continuation_prefix: str = "",
        ) -> None:
            normalized = self._normalize_text(text)
            if not normalized:
                return

            for line in self._wrap_text(
                normalized,
                max_width=max_units_per_line,
                width_fn=self._display_width,
                first_prefix=prefix,
                continuation_prefix=continuation_prefix,
            ):
                add_line(line)

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
            for entry in filtered_entries:
                if title == "Key Points":
                    add_wrapped(entry, prefix="- ", continuation_prefix="  ")
                else:
                    add_wrapped(entry)
            add_line()

        return [page for page in pages if page]

    def _wrap_text(
        self,
        text: str,
        *,
        max_width: float,
        width_fn,
        first_prefix: str = "",
        continuation_prefix: str = "",
    ) -> list[str]:
        tokens = self._tokenize_text(text)
        if not tokens:
            return []

        lines: list[str] = []
        current = first_prefix
        current_prefix = first_prefix
        next_prefix = continuation_prefix

        for token in tokens:
            candidate = f"{current}{token}"
            if current == current_prefix and token == " ":
                continue

            if width_fn(candidate) <= max_width or current == current_prefix:
                current = candidate
                if width_fn(current) <= max_width:
                    continue

            if current.strip():
                lines.append(current.rstrip())

            stripped_token = token.lstrip()
            current = f"{next_prefix}{stripped_token}"
            current_prefix = next_prefix

        if current.strip():
            lines.append(current.rstrip())

        return lines

    def _tokenize_text(self, text: str) -> list[str]:
        tokens: list[str] = []
        current_ascii = ""

        def flush_ascii() -> None:
            nonlocal current_ascii
            if current_ascii:
                tokens.append(current_ascii)
                current_ascii = ""

        for char in text:
            if char == " ":
                flush_ascii()
                if not tokens or tokens[-1] != " ":
                    tokens.append(" ")
                continue

            if char.isascii() and not self._is_cjk(char):
                current_ascii += char
                continue

            flush_ascii()
            tokens.append(char)

        flush_ascii()
        return tokens

    def _display_width(self, value: str) -> int:
        width = 0
        for char in value:
            if char == "\n":
                continue
            width += 2 if self._is_wide(char) else 1
        return width

    def _is_wide(self, char: str) -> bool:
        return east_asian_width(char) in {"F", "W"}

    def _is_cjk(self, char: str) -> bool:
        return self._is_wide(char) or east_asian_width(char) == "A"

    def _build_basic_pdf(self, pages: list[list[str]]) -> bytes:
        objects: list[bytes] = []
        object_numbers = count(1)

        def add_object(content: bytes) -> int:
            object_number = next(object_numbers)
            objects.append(
                f"{object_number} 0 obj\n".encode("ascii") + content + b"\nendobj\n"
            )
            return object_number

        font_descriptor_id = add_object(
            (
                b"<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 "
                b"/FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 "
                b"/Descent -120 /CapHeight 880 /StemV 80 /MissingWidth 500 >>"
            )
        )
        descendant_font_id = add_object(
            (
                b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light "
                b"/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> "
                b"/FontDescriptor "
                + str(font_descriptor_id).encode("ascii")
                + b" 0 R /DW 1000 >>"
            )
        )
        font_object_id = add_object(
            (
                b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light "
                b"/Encoding /UniGB-UCS2-H /DescendantFonts [ "
                + str(descendant_font_id).encode("ascii")
                + b" 0 R ] >>"
            )
        )

        page_ids: list[int] = []
        parent_placeholder = b"__PAGES_OBJECT__"

        for page_index, page_lines in enumerate(pages):
            content_stream = self._build_page_stream(page_index=page_index, page_lines=page_lines)
            content_id = add_object(
                b"<< /Length "
                + str(len(content_stream)).encode("ascii")
                + b" >>\nstream\n"
                + content_stream
                + b"\nendstream"
            )

            page_id = add_object(
                b"<< /Type /Page /Parent "
                + parent_placeholder
                + b" 0 R /MediaBox [0 0 "
                + str(self.fallback_page_width).encode("ascii")
                + b" "
                + str(self.fallback_page_height).encode("ascii")
                + b"] /Contents "
                + str(content_id).encode("ascii")
                + b" 0 R /Resources << /Font << /F1 "
                + str(font_object_id).encode("ascii")
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

    def _build_page_stream(self, *, page_index: int, page_lines: list[str]) -> bytes:
        start_x = self.page_margin
        start_y = self.fallback_page_height - self.page_margin
        text_sections = []

        if page_index == 0 and page_lines:
            title = page_lines[0]
            text_sections.extend(
                [
                    "BT",
                    f"/F1 {self.fallback_title_font_size} Tf",
                    f"{self.line_height} TL",
                    f"1 0 0 1 {start_x} {start_y} Tm",
                    self._pdf_text_operator(title),
                    "ET",
                ]
            )
            remaining_lines = page_lines[1:]
            if remaining_lines:
                body_start_y = start_y - (self.line_height * 2)
                text_sections.extend(
                    [
                        "BT",
                        f"/F1 {self.fallback_font_size} Tf",
                        f"{self.fallback_leading} TL",
                        f"1 0 0 1 {start_x} {body_start_y} Tm",
                    ]
                )
                for index, line in enumerate(remaining_lines):
                    text_sections.append(self._pdf_text_operator(line))
                    if index < len(remaining_lines) - 1:
                        text_sections.append("T*")
                text_sections.append("ET")
        else:
            text_sections.extend(
                [
                    "BT",
                    f"/F1 {self.fallback_font_size} Tf",
                    f"{self.fallback_leading} TL",
                    f"1 0 0 1 {start_x} {start_y} Tm",
                ]
            )
            for index, line in enumerate(page_lines):
                text_sections.append(self._pdf_text_operator(line))
                if index < len(page_lines) - 1:
                    text_sections.append("T*")
            text_sections.append("ET")

        return "\n".join(text_sections).encode("ascii")

    def _pdf_text_operator(self, value: str) -> str:
        if not value:
            return "<FEFF> Tj"

        encoded = value.encode("utf-16-be").hex().upper()
        return f"<FEFF{encoded}> Tj"


pdf_report_service = PdfReportService()
