from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.aircraft import AircraftStatus
from app.schemas.common import ORMModel


class AircraftBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    registration: str
    icao_type: str
    manufacturer: str | None = None
    model_series: str | None = None
    serial_number: str | None = None
    colors: str | None = None
    nationality_iso3: str | None = None
    default_callsign: str | None = None
    home_base_icao: str | None = None
    mtow_kg: float | None = None
    max_pax: int | None = None
    classification: str | None = None
    operator_id: UUID
    cofa_expiry: date | None = None
    insurance_expiry: date | None = None
    total_hours: float | None = None
    total_landings: int | None = None
    status: AircraftStatus = AircraftStatus.ACTIVE


class AircraftCreate(AircraftBase):
    pass


class AircraftUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())
    version: int
    registration: str | None = None
    icao_type: str | None = None
    manufacturer: str | None = None
    model_series: str | None = None
    serial_number: str | None = None
    colors: str | None = None
    nationality_iso3: str | None = None
    default_callsign: str | None = None
    home_base_icao: str | None = None
    mtow_kg: float | None = None
    max_pax: int | None = None
    classification: str | None = None
    operator_id: UUID | None = None
    cofa_expiry: date | None = None
    insurance_expiry: date | None = None
    total_hours: float | None = None
    total_landings: int | None = None
    status: AircraftStatus | None = None


class AircraftOut(ORMModel, AircraftBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    quarantined: bool
    quarantine_reason: str | None = None


class AircraftPerformanceBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    manufacturer: str | None = None
    model_series: str | None = None
    max_range_nm: float | None = None
    cruise_tas_kts: float | None = None
    fuel_burn_kg_per_hr: float | None = None
    max_pax: int | None = None
    mtow_kg: float | None = None
    service_ceiling_ft: float | None = None
    reserve_safety_margin: float | None = None
    source: str | None = None
    verified: bool = False
    verified_by: str | None = None
    verified_on: date | None = None


class AircraftPerformanceCreate(AircraftPerformanceBase):
    icao_type: str


class AircraftPerformanceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())
    version: int
    manufacturer: str | None = None
    model_series: str | None = None
    max_range_nm: float | None = None
    cruise_tas_kts: float | None = None
    fuel_burn_kg_per_hr: float | None = None
    max_pax: int | None = None
    mtow_kg: float | None = None
    service_ceiling_ft: float | None = None
    reserve_safety_margin: float | None = None
    source: str | None = None
    verified: bool | None = None
    verified_by: str | None = None
    verified_on: date | None = None


class AircraftPerformanceOut(ORMModel, AircraftPerformanceBase):
    icao_type: str
    version: int
    created_at: datetime
    updated_at: datetime
    planning_status: str
    practical_range_nm: float | None = None
