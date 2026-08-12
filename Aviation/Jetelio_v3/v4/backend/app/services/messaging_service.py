from uuid import UUID

from sqlalchemy import asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.messaging import MessageTemplate
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.messaging import MessageTemplateCreate, MessageTemplateOut, MessageTemplateUpdate


def _to_out(template: MessageTemplate) -> MessageTemplateOut:
    return MessageTemplateOut(
        **{n: getattr(template, n) for n in MessageTemplateOut.model_fields if hasattr(template, n)}
    )


async def list_templates(
    session: AsyncSession, *, page: int, page_size: int, active_only: bool = False
) -> tuple[list[MessageTemplateOut], int]:
    repo = Repository(session, MessageTemplate)
    filters = {"active": True} if active_only else {}
    items, total = await repo.list(page=page, page_size=page_size, filters=filters, order_by=asc(MessageTemplate.name))
    return [_to_out(t) for t in items], total


async def get_template(session: AsyncSession, template_id: UUID) -> MessageTemplateOut:
    repo = Repository(session, MessageTemplate)
    return _to_out(await repo.get(template_id))


async def create_template(
    session: AsyncSession, payload: MessageTemplateCreate, *, actor_id: UUID, actor_email: str
) -> MessageTemplateOut:
    repo = Repository(session, MessageTemplate)
    created = await repo.create(MessageTemplate(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="MessageTemplate", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_template(
    session: AsyncSession, template_id: UUID, payload: MessageTemplateUpdate, *, actor_id: UUID, actor_email: str
) -> MessageTemplateOut:
    repo = Repository(session, MessageTemplate)
    values = payload.model_dump(exclude={"version", "bump_template_version"}, exclude_unset=True)
    if payload.bump_template_version:
        existing = await repo.get(template_id)
        values["template_version"] = existing.template_version + 1
    updated = await repo.update(template_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="MessageTemplate", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)
