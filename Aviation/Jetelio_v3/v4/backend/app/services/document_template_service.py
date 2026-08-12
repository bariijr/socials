from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.document_template_registry import DOCUMENT_TEMPLATES
from app.models.document import DocumentTypeTemplate


async def ensure_seeded(session: AsyncSession) -> None:
    """Idempotent seed of the structural doc-type templates — mirrors
    app.services.settings_service.ensure_seeded exactly. Required at
    startup: Document.doc_type has a real FK to
    document_type_templates.doc_type, so a Document upload would fail
    with no rows here, not just show an empty list.
    """
    existing = {row for row in (await session.execute(select(DocumentTypeTemplate.doc_type))).scalars().all()}
    for definition in DOCUMENT_TEMPLATES:
        if definition.doc_type not in existing:
            session.add(
                DocumentTypeTemplate(
                    doc_type=definition.doc_type,
                    name=definition.name,
                    applies_to_entity_type=definition.applies_to_entity_type,
                    expected_fields=definition.expected_fields,
                )
            )
    await session.flush()
