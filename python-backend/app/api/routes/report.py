from fastapi import APIRouter
from fastapi.responses import Response

from app.core.exceptions import ServiceUnavailableError
from app.models.report import PdfReportRequest
from app.services.report_pdf import pdf_report_service

router = APIRouter(prefix="/report", tags=["report"])


@router.post("/pdf")
def generate_pdf_report(request: PdfReportRequest) -> Response:
    try:
        pdf_bytes, filename = pdf_report_service.generate(request)
    except RuntimeError as exc:
        raise ServiceUnavailableError(str(exc)) from exc

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
