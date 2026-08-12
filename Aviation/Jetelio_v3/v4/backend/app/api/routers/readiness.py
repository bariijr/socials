from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.readiness import PilotExitReport, ReadinessRow
from app.services import readiness_service

router = APIRouter(prefix="/readiness", tags=["readiness"])


@router.get("/pilot-exit-gates", response_model=PilotExitReport)
async def pilot_exit_gates(session: AsyncSession = Depends(get_db)) -> PilotExitReport:
    """No cost or vendor data here — safe to expose without auth so the
    PILOT banner can render on public surfaces too (T14).
    """
    return await readiness_service.compute_pilot_exit_gates(session)


@router.get("/data-readiness", response_model=list[ReadinessRow])
async def data_readiness(session: AsyncSession = Depends(get_db)) -> list[ReadinessRow]:
    return await readiness_service.compute_readiness_rows(session)
