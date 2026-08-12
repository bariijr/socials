from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.service_delivery import VendorContactCreate, VendorContactOut, VendorContactUpdate
from app.services import vendor_contact_service

router = APIRouter(tags=["reference-data"])


@router.get("/vendor-contacts", response_model=Page[VendorContactOut])
async def list_vendor_contacts(
    vendor_id: UUID | None = None,
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[VendorContactOut]:
    items, total = await vendor_contact_service.list_contacts(session, vendor_id=vendor_id, page=page, page_size=page_size)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("/vendor-contacts", response_model=VendorContactOut, status_code=201)
async def create_vendor_contact(
    payload: VendorContactCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> VendorContactOut:
    result = await vendor_contact_service.create_contact(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/vendor-contacts/{contact_id}", response_model=VendorContactOut)
async def update_vendor_contact(
    contact_id: UUID,
    payload: VendorContactUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> VendorContactOut:
    result = await vendor_contact_service.update_contact(session, contact_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/vendor-contacts/{contact_id}", status_code=204)
async def delete_vendor_contact(
    contact_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await vendor_contact_service.delete_contact(session, contact_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
