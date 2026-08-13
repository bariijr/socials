"""Runs the Tesseract OCR pipeline (task #109), then optionally an LLM
extraction pass on top of it (task #137), against an already-uploaded
Person/Party Document, and writes the result back.

Gracefully does nothing if OCR is disabled via the ocr_enabled setting, the
document can't be found, or the OCR provider itself can't process the file
(unsupported content type, undecodable image, missing tesseract binary) —
same NO_PROVIDER_CONFIGURED-style honesty as every other optional
integration in this system: the mechanism exists, but produces no
fabricated activity when there is no real result behind it.

The LLM pass is text-first (task #137's explicit choice): Tesseract's
already-cheap, already-running raw text goes to
app.core.ocr.llm_extractor.extract_fields_via_llm, which reuses the exact
same chat-provider dispatcher (priority/suspension/timeout/workload
failover) task #131 built for trip-chat — not a second AI-provider
pipeline. LLM-found fields override the regex guess for the same key (a
capable model reading the whole text is generally more reliable than a
blind proximity-window regex), but the regex guess survives for any key
the LLM left null — no field a working heuristic already found is ever
discarded just because the LLM pass ran. If no provider is
configured/available, extract_fields_via_llm returns None and the regex
result is used exactly as before task #137 — this stays a pure addition,
never a regression when no LLM is funded.

run_document_ocr takes an injected session, matching every other service
module's DI convention in this codebase (document_service, settings_service,
etc.) — this is what makes it directly testable against a test-scoped
session/DB, no Celery worker or real database connection required.
run_document_ocr_standalone is the thin Celery-task entry point that opens
its own session, mirroring app.services.email_poll_service.poll_inbox's
self-contained shape for the one caller (a Celery task) that has no
request-scoped session to inject.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.document_template_registry import DOCUMENT_TEMPLATES_BY_TYPE
from app.core.ocr.llm_extractor import extract_fields_via_llm
from app.core.ocr.tesseract_provider import extract_text_and_fields
from app.core import storage
from app.database import AsyncSessionLocal, engine
from app.models.document import Document
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.services import settings_service


async def run_document_ocr(session: AsyncSession, document_id: UUID) -> bool:
    """Returns True if OCR ran and the document was updated, False on any
    no-op path (disabled, document missing, provider returned nothing).
    """
    settings_map = await settings_service.get_typed_settings_map(session)
    if not settings_map.get("ocr_enabled", True):
        return False

    doc = await session.get(Document, document_id)
    if doc is None or doc.deleted_at is not None:
        return False

    content = await storage.download_file(doc.s3_key)
    result = extract_text_and_fields(content, doc.content_type, doc.doc_type)
    if result is None:
        return False

    extracted_fields = dict(result.extracted_fields)
    llm_extraction_used = False
    template = DOCUMENT_TEMPLATES_BY_TYPE.get(doc.doc_type)
    if template is not None:
        llm_fields = await extract_fields_via_llm(session, result.raw_text, template)
        if llm_fields:
            extracted_fields.update(llm_fields)
            llm_extraction_used = True

    repo = Repository(session, Document)
    await repo.update(
        doc.id,
        None,
        {
            "ocr_raw_output": {
                "engine": result.engine,
                "text": result.raw_text,
                "llm_extraction_used": llm_extraction_used,
            },
            "extracted_fields": extracted_fields,
        },
    )
    await write_audit_log(
        session,
        actor_user_id=None,
        actor_email="system:ocr",
        action="OCR_PROCESSED",
        entity_type="Document",
        entity_id=str(doc.id),
        to_value={"extracted_fields": extracted_fields, "llm_extraction_used": llm_extraction_used},
    )
    await session.commit()
    return True


async def run_document_ocr_standalone(document_id: str) -> bool:
    """Celery-task entry point (app.worker.tasks.run_document_ocr) — opens
    its own session since there's no request/caller context to inject one
    from. document_id is a str, not UUID: Celery task args must be
    JSON-serializable (celery_app.py's task_serializer="json").

    **Real bug found and fixed while building this (task #109)**:
    app.database's module-level `engine` (`pool_pre_ping=True`, a normal
    pooled AsyncAdaptedQueuePool) is shared for the lifetime of whichever
    process imports it. Every Celery task wraps its async body in a bare
    `asyncio.run(...)` per invocation (app/worker/tasks.py) — each call
    gets a brand-new event loop, but a pooled asyncpg connection checked
    out under a previous call's now-closed loop is not just stale, it's
    actively broken: `pool_pre_ping`'s own validation ping raises a raw
    asyncio `RuntimeError: ... attached to a different loop` instead of
    the clean DBAPI-level error SQLAlchemy expects and would otherwise
    transparently discard-and-retry. This was never caught before because
    email_poll_service.poll_inbox() (task #103) short-circuits before ever
    touching AsyncSessionLocal when imap_host is unset — the only path
    that would have exercised this is exactly the one that's always been a
    no-op in every environment so far. Fixed by disposing the engine's
    pool at the end of every call, so no connection survives past the
    event loop that created it — any future Celery task that opens its own
    AsyncSessionLocal session more than once per worker process needs the
    same guard until this is addressed at the engine/worker-bootstrap
    level instead of per-task.
    """
    try:
        async with AsyncSessionLocal() as session:
            return await run_document_ocr(session, UUID(document_id))
    finally:
        await engine.dispose()
