"""Task #108: resolves which of a country's required documents (free text,
CountryRequirement.required_documents, unioned across every requirement row
on file for that country — request_type doesn't map cleanly onto a single
service/permit code, so nothing is silently filtered by it) the trip can
actually satisfy from real records on file, and fetches the bytes for the
ones that can be auto-attached to an outbound service/permit request (task
#104). Two real sources, both reachable via an actual FK chain:

- Party documents: TripLeg.client_id -> Client -> PartyRole.client_id ->
  Party -> Document(entity_type=PARTY). Today the only seeded PARTY
  template is OPERATOR_CERTIFICATE (the AOC) — see
  app.core.document_template_registry.
- Aircraft documents: Trip.aircraft_registration / TripLeg.registration,
  matched case-insensitively against Aircraft.registration -> its
  AircraftDocument rows (REGISTRATION/COFA/INSURANCE/AIRWORTHINESS/
  NOISE_CERTIFICATE).

See app.domain.document_requirements for why person/crew documents are
deliberately out of scope, and for the actual matching logic.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import download_file
from app.domain.document_requirements import (
    AvailableDocument,
    RequiredDocumentResult,
    resolve_required_documents,
)
from app.models.aircraft import Aircraft
from app.models.aircraft_document import AircraftDocument
from app.models.airport import Airport
from app.models.country_requirements import CountryRequirement
from app.models.document import Document, DocumentEntityType, DocumentStatus
from app.models.party import PartyRole
from app.models.trip import Trip, TripLeg


async def _party_documents(session: AsyncSession, client_id) -> list[AvailableDocument]:
    if client_id is None:
        return []
    party_role = (
        await session.execute(select(PartyRole).where(PartyRole.client_id == client_id, PartyRole.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if party_role is None:
        return []
    rows = (
        await session.execute(
            select(Document).where(
                Document.entity_type == DocumentEntityType.PARTY,
                Document.entity_id == party_role.party_id,
                Document.status == DocumentStatus.VERIFIED,
                Document.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    return [
        AvailableDocument(
            doc_type=d.doc_type, document_id=str(d.id), filename=d.filename, content_type=d.content_type,
            expiry_date=None, source="PARTY",
        )
        for d in rows
    ]


async def _aircraft_documents(session: AsyncSession, registration: str | None) -> list[AvailableDocument]:
    if not registration:
        return []
    aircraft = (
        await session.execute(
            select(Aircraft).where(func.upper(Aircraft.registration) == registration.upper(), Aircraft.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if aircraft is None:
        return []
    rows = (
        await session.execute(
            select(AircraftDocument).where(AircraftDocument.aircraft_id == aircraft.id, AircraftDocument.deleted_at.is_(None))
        )
    ).scalars().all()
    return [
        AvailableDocument(
            doc_type=d.doc_type.value, document_id=str(d.id), filename=d.filename, content_type=d.content_type,
            expiry_date=d.expiry_date, source="AIRCRAFT",
        )
        for d in rows
    ]


async def resolve_document_requirements(
    session: AsyncSession, trip: Trip, leg: TripLeg, icao: str
) -> list[RequiredDocumentResult]:
    airport = await session.get(Airport, icao)
    if airport is None or airport.country_iso3 is None:
        return []

    requirement_rows = (
        await session.execute(
            select(CountryRequirement).where(
                CountryRequirement.country_iso3 == airport.country_iso3,
                CountryRequirement.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    required_documents: list[str] = []
    for row in requirement_rows:
        for doc in row.required_documents or []:
            if doc not in required_documents:
                required_documents.append(doc)
    if not required_documents:
        return []

    registration = leg.registration or trip.aircraft_registration
    available = await _party_documents(session, leg.client_id) + await _aircraft_documents(session, registration)

    return resolve_required_documents(required_documents, available, leg.reference_datetime.date())


async def fetch_attachable_documents(
    session: AsyncSession, results: list[RequiredDocumentResult]
) -> list[tuple[str, bytes, str]]:
    """Downloads bytes for every ATTACHED result. Filename/mime come from
    whichever row (Document or AircraftDocument) actually matched."""
    attachments: list[tuple[str, bytes, str]] = []
    for result in results:
        if result.status != "ATTACHED" or result.document_id is None:
            continue
        model = Document if result.source == "PARTY" else AircraftDocument
        doc = await session.get(model, UUID(result.document_id))
        if doc is None:
            continue
        content = await download_file(doc.s3_key)
        attachments.append((doc.filename, content, doc.content_type or "application/octet-stream"))
    return attachments
