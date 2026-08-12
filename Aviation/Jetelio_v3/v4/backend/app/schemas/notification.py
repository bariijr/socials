from datetime import datetime
from uuid import UUID

from app.schemas.common import ORMModel


class NotificationOut(ORMModel):
    id: UUID
    entity_type: str
    entity_id: str
    kind: str
    message: str
    seen_at: datetime | None
    version: int
    created_at: datetime
