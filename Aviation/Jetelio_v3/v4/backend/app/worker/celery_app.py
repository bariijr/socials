"""Celery worker entrypoint. No business tasks yet — deadline sweeps, OCR
jobs, expiry alerts and notification dispatch land with the phases that
need them (2, 5, 6). This wires the container up and running so later
phases only add task modules, never infrastructure.
"""

from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery("jetelio_v4", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "poll-email-inbox": {
            "task": "worker.poll_email_inbox",
            "schedule": 120.0,  # every 2 minutes; a no-op when imap_host is unset
        },
    },
)


@celery_app.task(name="worker.ping")
def ping() -> str:
    return "pong"


# Imported for its side effect (task registration) — after celery_app
# exists, so app.worker.tasks's own `from app.worker.celery_app import
# celery_app` doesn't circular-import.
from app.worker import tasks  # noqa: E402,F401
