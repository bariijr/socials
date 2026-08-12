from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ORMModel


class AirportBase(BaseModel):
    iata: str | None = None
    name: str
    city: str | None = None
    country_iso3: str | None = None
    lat: float
    lon: float
    elevation_ft: float | None = None
    timezone: str | None = None
    airport_type: str | None = None
    is_airport_of_entry: bool | None = None
    ppr_required: bool | None = None
    curfew: str | None = None
    longest_runway_ft: float | None = None
    runway_surface: str | None = None
    fuel_grades: list[str] | None = None
    operating_hours: str | None = None
    handler_notes: str | None = None
    ops_data_source: str | None = None
    ops_data_verified_by: str | None = None
    ops_data_verified_on: date | None = None


class AirportCreate(AirportBase):
    icao: str


class AirportUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    iata: str | None = None
    name: str | None = None
    city: str | None = None
    country_iso3: str | None = None
    lat: float | None = None
    lon: float | None = None
    elevation_ft: float | None = None
    timezone: str | None = None
    airport_type: str | None = None
    is_airport_of_entry: bool | None = None
    ppr_required: bool | None = None
    curfew: str | None = None
    longest_runway_ft: float | None = None
    runway_surface: str | None = None
    fuel_grades: list[str] | None = None
    operating_hours: str | None = None
    handler_notes: str | None = None
    ops_data_source: str | None = None
    ops_data_verified_by: str | None = None
    ops_data_verified_on: date | None = None


class AirportOut(ORMModel, AirportBase):
    icao: str
    version: int
    created_at: datetime
    updated_at: datetime

    tech_stop_readiness: str
