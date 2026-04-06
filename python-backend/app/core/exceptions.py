from collections.abc import Callable
from logging import Logger

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        code: str = "APP_ERROR",
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class ServiceUnavailableError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message,
            status_code=503,
            code="SERVICE_UNAVAILABLE",
        )


def install_exception_handlers(app: FastAPI, logger: Logger) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "REQUEST_VALIDATION_ERROR",
                    "message": "Request validation failed.",
                    "details": exc.errors(),
                }
            },
        )

    @app.exception_handler(ValueError)
    async def handle_value_error(_: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "INVALID_INPUT",
                    "message": str(exc),
                }
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception(
            "Unhandled exception while serving %s %s",
            request.method,
            request.url.path,
            exc_info=exc,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "The server could not complete the request.",
                }
            },
        )


def create_request_logging_middleware(
    logger: Logger,
) -> Callable[[Request, Callable], JSONResponse]:
    async def log_requests(request: Request, call_next: Callable) -> JSONResponse:
        logger.info("Incoming request %s %s", request.method, request.url.path)
        response = await call_next(request)
        logger.info(
            "Completed request %s %s with status %s",
            request.method,
            request.url.path,
            response.status_code,
        )
        return response

    return log_requests
