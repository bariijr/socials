"""The canonical list of document type templates — structural form-schema
definitions (what fields a license/medical/cert is expected to carry), not
operational fact, so seeding this directly doesn't violate the
never-fabricate-data rule the same way a guessed fee or lead time would.
Mirrors app.core.settings_registry's shape and seeding pattern exactly.
"""

from dataclasses import dataclass, field

from app.models.document import DocumentEntityType


@dataclass(frozen=True)
class DocumentTemplateDefinition:
    doc_type: str
    name: str
    applies_to_entity_type: DocumentEntityType
    expected_fields: list[dict] = field(default_factory=list)


DOCUMENT_TEMPLATES: list[DocumentTemplateDefinition] = [
    DocumentTemplateDefinition(
        doc_type="PILOT_LICENSE",
        name="Pilot license",
        applies_to_entity_type=DocumentEntityType.PERSON,
        expected_fields=[
            {"key": "license_number", "label": "License number", "type": "string"},
            {"key": "issuing_authority", "label": "Issuing authority", "type": "string"},
            {"key": "issuing_country_iso3", "label": "Issuing country", "type": "string"},
            {"key": "ratings", "label": "Type ratings", "type": "list"},
            {"key": "issued_on", "label": "Issue date", "type": "date"},
            {"key": "expires_on", "label": "Expiry date", "type": "date"},
        ],
    ),
    DocumentTemplateDefinition(
        doc_type="MEDICAL_CERTIFICATE",
        name="Medical certificate",
        applies_to_entity_type=DocumentEntityType.PERSON,
        expected_fields=[
            {"key": "medical_class", "label": "Class", "type": "string"},
            {"key": "limitations", "label": "Limitations", "type": "string"},
            {"key": "expires_on", "label": "Expiry date", "type": "date"},
        ],
    ),
    DocumentTemplateDefinition(
        doc_type="PASSPORT",
        name="Passport",
        applies_to_entity_type=DocumentEntityType.PERSON,
        expected_fields=[
            {"key": "passport_number", "label": "Passport number", "type": "string"},
            {"key": "issuing_country_iso3", "label": "Issuing country", "type": "string"},
            {"key": "issued_on", "label": "Issue date", "type": "date"},
            {"key": "expires_on", "label": "Expiry date", "type": "date"},
        ],
    ),
    DocumentTemplateDefinition(
        doc_type="OPERATOR_CERTIFICATE",
        name="Operator certificate / AOC",
        applies_to_entity_type=DocumentEntityType.PARTY,
        expected_fields=[
            {"key": "company_name", "label": "Company name", "type": "string"},
            {"key": "certificate_number", "label": "Certificate number", "type": "string"},
            {"key": "issued_on", "label": "Issue date", "type": "date"},
            {"key": "expires_on", "label": "Expiry date", "type": "date"},
        ],
    ),
]

DOCUMENT_TEMPLATES_BY_TYPE: dict[str, DocumentTemplateDefinition] = {t.doc_type: t for t in DOCUMENT_TEMPLATES}
