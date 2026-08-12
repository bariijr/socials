"""Task #108 — pure functions, no FastAPI/SQLAlchemy imports. Matches a
country's free-text CountryRequirement.required_documents entries against
whatever real, verified documents the trip's Party (operator/client) and
Aircraft actually have on file, so a permit/service send can honestly
report what's covered and what still needs manual handling — never
silently proceeds as if a document were attached when it isn't.

Deliberately does NOT attempt to match crew/pax documents (PILOT_LICENSE,
MEDICAL_CERTIFICATE, PASSPORT): TripLeg.persons is a point-in-time
role+nationality snapshot with no FK back to a real Person row (see
app.models.person.Person's docstring), so there is no reliable way to know
which uploaded Document belongs to which person on a given trip. Matching
by name would be a guess, not a fact, so it isn't attempted.
"""

from dataclasses import dataclass
from datetime import date


class DocumentRequirementStatus:
    ATTACHED = "ATTACHED"
    EXPIRED = "EXPIRED"
    MISSING = "MISSING"
    UNMATCHED = "UNMATCHED"


@dataclass(frozen=True)
class AvailableDocument:
    doc_type: str
    document_id: str
    filename: str
    content_type: str | None
    expiry_date: date | None
    source: str  # "PARTY" | "AIRCRAFT"


@dataclass(frozen=True)
class RequiredDocumentResult:
    requirement: str
    status: str
    doc_type: str | None
    document_id: str | None
    source: str | None


# Longest keyword first so e.g. "certificate of airworthiness" resolves to
# COFA rather than the shorter "airworthiness" substring winning by
# accident and landing on AIRWORTHINESS instead.
_KEYWORD_TO_TYPE: dict[str, str] = {
    "AIR OPERATOR CERTIFICATE": "OPERATOR_CERTIFICATE",
    "CERTIFICATE OF AIRWORTHINESS": "COFA",
    "NOISE CERTIFICATE": "NOISE_CERTIFICATE",
    "OPERATOR CERTIFICATE": "OPERATOR_CERTIFICATE",
    "AIRWORTHINESS": "AIRWORTHINESS",
    "REGISTRATION": "REGISTRATION",
    "INSURANCE": "INSURANCE",
    "NOISE": "NOISE_CERTIFICATE",
    "COFA": "COFA",
    "AOC": "OPERATOR_CERTIFICATE",
}


def match_document_type(requirement: str) -> str | None:
    normalized = requirement.strip().upper()
    for keyword in sorted(_KEYWORD_TO_TYPE, key=len, reverse=True):
        if keyword in normalized:
            return _KEYWORD_TO_TYPE[keyword]
    return None


def resolve_required_documents(
    required_documents: list[str], available: list[AvailableDocument], as_of: date
) -> list[RequiredDocumentResult]:
    results: list[RequiredDocumentResult] = []
    for requirement in required_documents:
        doc_type = match_document_type(requirement)
        if doc_type is None:
            results.append(RequiredDocumentResult(requirement, DocumentRequirementStatus.UNMATCHED, None, None, None))
            continue

        candidates = [d for d in available if d.doc_type == doc_type]
        if not candidates:
            results.append(RequiredDocumentResult(requirement, DocumentRequirementStatus.MISSING, doc_type, None, None))
            continue

        valid = [d for d in candidates if d.expiry_date is None or d.expiry_date >= as_of]
        if valid:
            chosen = max(valid, key=lambda d: d.expiry_date or date.max)
            results.append(
                RequiredDocumentResult(requirement, DocumentRequirementStatus.ATTACHED, doc_type, chosen.document_id, chosen.source)
            )
        else:
            chosen = max(candidates, key=lambda d: d.expiry_date or date.min)
            results.append(
                RequiredDocumentResult(requirement, DocumentRequirementStatus.EXPIRED, doc_type, chosen.document_id, chosen.source)
            )
    return results
