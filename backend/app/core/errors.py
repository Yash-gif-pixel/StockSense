"""Domain errors and the exception handlers that render the API contract's error shape.

Every non-2xx body is {"code", "message"} plus "fields" on validation errors only.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class DomainError(Exception):
    """Base for business-rule violations. Subclasses fix the contract code + status."""

    code = "conflict"
    status_code = 409
    message = "Request could not be completed"

    def __init__(
        self,
        message: str | None = None,
        *,
        fields: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.message
        self.fields = fields
        super().__init__(self.message)


class ValidationError(DomainError):
    code = "validation_error"
    status_code = 422
    message = "Validation failed"


class UnauthorizedError(DomainError):
    code = "unauthorized"
    status_code = 401
    message = "Not authenticated"


class NotFoundError(DomainError):
    code = "not_found"
    status_code = 404
    message = "Not found"


class ConflictError(DomainError):
    code = "conflict"
    status_code = 409
    message = "Conflict"


class InvalidStateError(DomainError):
    code = "invalid_state"
    status_code = 409
    message = "Operation is not in a valid state for this action"


class InsufficientStockError(DomainError):
    code = "insufficient_stock"
    status_code = 409
    message = "Not enough stock available"


class BadRequestError(DomainError):
    """422 is for request-shape problems; this is for a well-formed request the
    server rejects, e.g. a wrong current_password."""

    code = "validation_error"
    status_code = 400
    message = "Request could not be completed"


class InvalidOtpError(DomainError):
    code = "invalid_otp"
    status_code = 400
    message = "The code is invalid or has expired"


# Status codes FastAPI/Starlette may raise on their own, mapped to contract codes.
_STATUS_CODES = {
    400: "validation_error",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
}


def error_response(
    status_code: int,
    code: str,
    message: str,
    fields: dict[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, object] = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    return JSONResponse(status_code=status_code, content=body)


def _field_path(loc: tuple[object, ...]) -> str:
    """("body", "lines", 0, "qty") -> "lines.0.qty"; drops the request-part prefix."""
    parts = [str(p) for p in loc]
    if parts and parts[0] in ("body", "query", "path", "header", "cookie"):
        parts = parts[1:]
    return ".".join(parts) if parts else "__root__"


async def domain_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    return error_response(exc.status_code, exc.code, exc.message, exc.fields)


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = _STATUS_CODES.get(exc.status_code, "error")
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return error_response(exc.status_code, code, detail)


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    fields = {
        _field_path(err["loc"]): err["msg"].removeprefix("Value error, ")
        for err in exc.errors()
    }
    return error_response(422, "validation_error", "Validation failed", fields)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
