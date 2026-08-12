from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.core.errors import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    IdempotencyConflictError,
    NotFoundError,
    ValidationFailedError,
    VersionConflictError,
)

_STATUS_MAP = {
    NotFoundError: status.HTTP_404_NOT_FOUND,
    ConflictError: status.HTTP_409_CONFLICT,
    VersionConflictError: status.HTTP_409_CONFLICT,
    IdempotencyConflictError: status.HTTP_409_CONFLICT,
    ValidationFailedError: status.HTTP_422_UNPROCESSABLE_ENTITY,
    AuthenticationError: status.HTTP_401_UNAUTHORIZED,
    AuthorizationError: status.HTTP_403_FORBIDDEN,
}


def register_exception_handlers(app) -> None:
    for exc_class, http_status in _STATUS_MAP.items():

        def _make_handler(code: int):
            async def _handler(request: Request, exc: Exception) -> JSONResponse:
                detail: dict = {"error": exc.__class__.__name__, "message": str(exc)}
                if isinstance(exc, ValidationFailedError):
                    detail["field"] = exc.field
                if isinstance(exc, VersionConflictError):
                    detail.update(
                        entity=exc.entity,
                        identifier=str(exc.identifier),
                        expected_version=exc.expected_version,
                        actual_version=exc.actual_version,
                    )
                return JSONResponse(status_code=code, content=detail)

            return _handler

        app.add_exception_handler(exc_class, _make_handler(http_status))
