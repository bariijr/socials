from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.service_message import DocumentRequirementCheckOut, SendServiceRequestBatchIn, SendServiceRequestOut
from app.services import service_message_service

router = APIRouter(prefix="/trips/{trip_id}/legs/{leg_id}/services", tags=["trips"])


@router.get("/document-check", response_model=list[DocumentRequirementCheckOut])
async def check_documents(
    trip_id: UUID,
    leg_id: UUID,
    icao: str,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[DocumentRequirementCheckOut]:
    """Task #108: read-only preview of which of this stop's required
    documents the trip's Party/Aircraft already have on file, before
    committing to a send. Informational — any authenticated user can view,
    matching the notifications router's access level."""
    results = await service_message_service.check_documents(session, trip_id, leg_id, icao)
    return [
        DocumentRequirementCheckOut(
            requirement=r.requirement, status=r.status, doc_type=r.doc_type, document_id=r.document_id, source=r.source
        )
        for r in results
    ]


@router.post("/send", response_model=list[SendServiceRequestOut])
async def send_service_requests(
    trip_id: UUID,
    leg_id: UUID,
    payload: SendServiceRequestBatchIn,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> list[SendServiceRequestOut]:
    """Format & send (task #104) — one or many service line items at once
    ("select all permit services on a leg and send them all out
    together"). Never all-or-nothing: each item resolves/sends
    independently and reports its own sent/error, so one missing vendor
    contact doesn't block the rest of the batch."""
    results = await service_message_service.send_service_requests_batch(
        session, trip_id, leg_id, [(i.service_code, i.icao) for i in payload.items], actor_id=user.id, actor_email=user.email
    )
    await session.commit()
    return [
        SendServiceRequestOut(
            service_code=r.service_code, icao=r.icao, sent=r.sent, error=r.error, message=r.message,
            document_warnings=r.document_warnings,
        )
        for r in results
    ]
