from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.visa import (
    VisaLookupResult,
    VisaMatrixCellCreate,
    VisaMatrixCellOut,
    VisaMatrixCellUpdate,
    VisaRuleCreate,
    VisaRuleOut,
    VisaRuleUpdate,
)
from app.services import settings_service, visa_service

router = APIRouter(prefix="/visa", tags=["reference-data"])


@router.get("/matrix", response_model=Page[VisaMatrixCellOut])
async def list_matrix_cells(
    page: int = 1,
    page_size: int = Query(default=100, le=1000),
    country_iso3: str | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[VisaMatrixCellOut]:
    settings_map = await settings_service.get_typed_settings_map(session)
    items, total = await visa_service.list_matrix_cells(
        session, page=page, page_size=page_size, country_iso3=country_iso3,
        staleness_days=settings_map["visa_rule_staleness_days"],
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("/matrix", response_model=VisaMatrixCellOut, status_code=201)
async def create_matrix_cell(
    payload: VisaMatrixCellCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> VisaMatrixCellOut:
    settings_map = await settings_service.get_typed_settings_map(session)
    result = await visa_service.create_matrix_cell(
        session, payload, staleness_days=settings_map["visa_rule_staleness_days"], actor_id=user.id, actor_email=user.email
    )
    await session.commit()
    return result


@router.patch("/matrix/{cell_id}", response_model=VisaMatrixCellOut)
async def update_matrix_cell(
    cell_id: UUID,
    payload: VisaMatrixCellUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> VisaMatrixCellOut:
    settings_map = await settings_service.get_typed_settings_map(session)
    result = await visa_service.update_matrix_cell(
        session, cell_id, payload, staleness_days=settings_map["visa_rule_staleness_days"],
        actor_id=user.id, actor_email=user.email,
    )
    await session.commit()
    return result


@router.get("/rules", response_model=Page[VisaRuleOut])
async def list_rules(
    page: int = 1,
    page_size: int = Query(default=100, le=1000),
    country_iso3: str | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[VisaRuleOut]:
    settings_map = await settings_service.get_typed_settings_map(session)
    items, total = await visa_service.list_rules(
        session, page=page, page_size=page_size, country_iso3=country_iso3,
        staleness_days=settings_map["visa_rule_staleness_days"],
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("/rules", response_model=VisaRuleOut, status_code=201)
async def create_rule(
    payload: VisaRuleCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> VisaRuleOut:
    settings_map = await settings_service.get_typed_settings_map(session)
    result = await visa_service.create_rule(
        session, payload, staleness_days=settings_map["visa_rule_staleness_days"], actor_id=user.id, actor_email=user.email
    )
    await session.commit()
    return result


@router.patch("/rules/{rule_id}", response_model=VisaRuleOut)
async def update_rule(
    rule_id: UUID,
    payload: VisaRuleUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> VisaRuleOut:
    settings_map = await settings_service.get_typed_settings_map(session)
    result = await visa_service.update_rule(
        session, rule_id, payload, staleness_days=settings_map["visa_rule_staleness_days"],
        actor_id=user.id, actor_email=user.email,
    )
    await session.commit()
    return result


@router.get("/lookup", response_model=VisaLookupResult)
async def lookup(
    country_iso3: str,
    nationality_iso3: str,
    airport_icao: str | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> VisaLookupResult:
    settings_map = await settings_service.get_typed_settings_map(session)
    return await visa_service.lookup(
        session,
        country_iso3=country_iso3,
        nationality_iso3=nationality_iso3,
        airport_icao=airport_icao,
        staleness_days=settings_map["visa_rule_staleness_days"],
    )
