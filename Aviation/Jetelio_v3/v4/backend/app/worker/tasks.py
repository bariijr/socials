"""Celery task definitions (task #103 is the first real business task —
see celery_app.py's original "no business tasks yet" docstring). Imported
by celery_app.py at the bottom of that module so `celery -A
app.worker.celery_app worker` actually registers them.
"""

import asyncio

from app.worker.celery_app import celery_app


@celery_app.task(name="worker.poll_email_inbox")
def poll_email_inbox() -> int:
    from app.services.email_poll_service import poll_inbox

    return asyncio.run(poll_inbox())


@celery_app.task(name="worker.run_document_ocr")
def run_document_ocr(document_id: str) -> bool:
    from app.services.ocr_service import run_document_ocr_standalone

    return asyncio.run(run_document_ocr_standalone(document_id))
