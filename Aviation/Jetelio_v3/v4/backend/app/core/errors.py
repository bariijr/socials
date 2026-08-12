"""Domain-level errors. Raised by services/domain, translated to HTTP status
codes only at the API layer (app.api.deps / exception handlers) so the
service and domain layers stay framework-free.
"""


class DomainError(Exception):
    """Base class for all errors raised below the API layer."""


class NotFoundError(DomainError):
    def __init__(self, entity: str, identifier: object):
        self.entity = entity
        self.identifier = identifier
        super().__init__(f"{entity} not found: {identifier}")


class ConflictError(DomainError):
    """Uniqueness violation, duplicate registration, etc."""


class ValidationFailedError(DomainError):
    """Field-level business validation failure (never a generic 'invalid input')."""

    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class VersionConflictError(DomainError):
    """Optimistic-locking failure: the row's version no longer matches."""

    def __init__(self, entity: str, identifier: object, expected_version: int, actual_version: int):
        self.entity = entity
        self.identifier = identifier
        self.expected_version = expected_version
        self.actual_version = actual_version
        super().__init__(
            f"{entity} {identifier} version conflict: expected {expected_version}, actual {actual_version}"
        )


class AuthenticationError(DomainError):
    pass


class AuthorizationError(DomainError):
    def __init__(self, required_role: str | None = None):
        self.required_role = required_role
        super().__init__(f"Not authorized{f' (requires {required_role})' if required_role else ''}")


class IdempotencyConflictError(DomainError):
    """Same Idempotency-Key reused with a different request body."""
