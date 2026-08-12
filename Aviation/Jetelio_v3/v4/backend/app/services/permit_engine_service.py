"""Engine 2 (permits) — service layer. Assembles country lead times and the
service catalogue, calls app.domain.permits, and calls the routing service
for a re-route when an avoid/include violation is flagged. No business
logic beyond that assembly — see app.services.readiness_service for the
established pattern.
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.permits import (
    AvoidIncludeViolation,
    GROUND_HANDLING_CODE,
    ServiceScope,
    StateCrossing,
    StopEvent,
    check_avoid_include_violation,
    classify_deadline,
    classify_service_scope,
    compute_file_by,
    determine_ground_handling_orders,
    determine_landing_permits,
    determine_overflight_permits,
    normalize_request_type,
)
from app.domain.reference_status import resolve_effective_lead_time_hours
from app.models.country import Country
from app.models.country_requirements import CountryRequirement
from app.models.service_catalogue import ServiceCatalogueEntry, ServiceCategory, ServiceLevel
from app.services import settings_service

GROUND_HANDLING_REQUEST_TYPE = "GROUND_HANDLING"


@dataclass(frozen=True)
class PermitDeadline:
    file_by: datetime
    deadline_status: str
    lead_time_hours: float
    lead_time_is_fallback: bool


@dataclass(frozen=True)
class OverflightPermit:
    country_iso3: str
    country_name: str
    entry_datetime: datetime
    exit_datetime: datetime
    deadline: PermitDeadline


@dataclass(frozen=True)
class LandingPermit:
    country_iso3: str
    country_name: str
    entry_datetime: datetime
    exit_datetime: datetime
    deadline: PermitDeadline


@dataclass(frozen=True)
class GroundHandlingOrderResult:
    country_iso3: str
    country_name: str
    earliest_icao: str
    earliest_event_at: datetime
    deadline: PermitDeadline


@dataclass(frozen=True)
class ServiceRequirement:
    service_code: str
    service_name: str
    scope: str
    icao: str
    country_iso3: str


@dataclass(frozen=True)
class PermitPlan:
    overflight_permits: list[OverflightPermit]
    landing_permits: list[LandingPermit]
    ground_handling_orders: list[GroundHandlingOrderResult]
    service_requirements: list[ServiceRequirement]
    state_avoid_include: AvoidIncludeViolation
    fir_avoid_include: AvoidIncludeViolation

    @property
    def avoid_include_violated(self) -> bool:
        return self.state_avoid_include.violated or self.fir_avoid_include.violated


async def _fetch_countries(session: AsyncSession, iso3_codes: set[str]) -> dict[str, Country]:
    if not iso3_codes:
        return {}
    rows = (await session.execute(select(Country).where(Country.iso3.in_(iso3_codes)))).scalars().all()
    return {c.iso3: c for c in rows}


def _country_deadline(country: Country | None, reference_datetime: datetime, default_hours: float, now: datetime) -> PermitDeadline:
    lead_time = resolve_effective_lead_time_hours(
        country.standard_lead_time_hours if country else None, default_hours
    )
    file_by = compute_file_by(reference_datetime, lead_time.hours)
    return PermitDeadline(
        file_by=file_by,
        deadline_status=classify_deadline(file_by, now),
        lead_time_hours=lead_time.hours,
        lead_time_is_fallback=lead_time.is_fallback,
    )


async def _ground_handling_lead_time_hours(
    session: AsyncSession, country_iso3: str, default_ground_notice_hours: float
) -> float:
    # request_type is free text from the source workbook ("GROUND HANDLING",
    # not "GROUND_HANDLING") — an exact `==` against the constant would
    # silently never match a real row. Fetch the (few) rows for this
    # country and compare normalized.
    rows = (
        await session.execute(
            select(CountryRequirement.request_type, CountryRequirement.lead_time_hours).where(
                CountryRequirement.country_iso3 == country_iso3,
                CountryRequirement.deleted_at.is_(None),
            )
        )
    ).all()
    target = normalize_request_type(GROUND_HANDLING_REQUEST_TYPE)
    for request_type, lead_time_hours in rows:
        if lead_time_hours is not None and normalize_request_type(request_type) == target:
            return lead_time_hours
    return default_ground_notice_hours


async def compute_leg_permits(
    session: AsyncSession,
    *,
    leg_index: int,
    route_states: list[str],
    route_firs: list[str],
    departure_iso3: str,
    arrival_iso3: str,
    reference_datetime: datetime,
    stops: list[StopEvent],
    state_crossings: dict[str, StateCrossing],
    avoid_states: set[str] | None = None,
    include_states: set[str] | None = None,
    avoid_firs: set[str] | None = None,
    include_firs: set[str] | None = None,
) -> PermitPlan:
    now = datetime.now(timezone.utc)
    settings_map = await settings_service.get_typed_settings_map(session)
    default_permit_lead_time = settings_map["default_permit_lead_time_hours"]
    default_ground_notice = settings_map["default_ground_notice_hours"]

    countries = await _fetch_countries(session, set(route_states) | {departure_iso3, arrival_iso3})
    trip_end = stops[-1].event_datetime if stops else reference_datetime

    overflight = [
        OverflightPermit(
            country_iso3=req.country_iso3,
            country_name=countries[req.country_iso3].name if req.country_iso3 in countries else req.country_iso3,
            entry_datetime=state_crossings[req.country_iso3].entry_datetime,
            exit_datetime=state_crossings[req.country_iso3].exit_datetime,
            deadline=_country_deadline(countries.get(req.country_iso3), reference_datetime, default_permit_lead_time, now),
        )
        for req in determine_overflight_permits(leg_index, route_states, departure_iso3, arrival_iso3)
    ]

    landing = [
        LandingPermit(
            country_iso3=req.country_iso3,
            country_name=countries[req.country_iso3].name if req.country_iso3 in countries else req.country_iso3,
            entry_datetime=trip_end,
            exit_datetime=trip_end,
            deadline=_country_deadline(countries.get(req.country_iso3), reference_datetime, default_permit_lead_time, now),
        )
        for req in determine_landing_permits([(leg_index, arrival_iso3)])
    ]

    ground_orders: list[GroundHandlingOrderResult] = []
    for order in determine_ground_handling_orders(stops):
        ground_lead_hours = await _ground_handling_lead_time_hours(session, order.country_iso3, default_ground_notice)
        file_by = compute_file_by(order.due_at, ground_lead_hours)
        ground_orders.append(
            GroundHandlingOrderResult(
                country_iso3=order.country_iso3,
                country_name=countries[order.country_iso3].name if order.country_iso3 in countries else order.country_iso3,
                earliest_icao=order.earliest_icao,
                earliest_event_at=order.due_at,
                deadline=PermitDeadline(
                    file_by=file_by,
                    deadline_status=classify_deadline(file_by, now),
                    lead_time_hours=ground_lead_hours,
                    lead_time_is_fallback=False,
                ),
            )
        )

    top_level_ground_services = (
        await session.execute(
            select(ServiceCatalogueEntry).where(
                ServiceCatalogueEntry.category == ServiceCategory.GROUND,
                ServiceCatalogueEntry.level == ServiceLevel.SERVICE,
                ServiceCatalogueEntry.code != GROUND_HANDLING_CODE,
            )
        )
    ).scalars().all()

    stop_by_icao = {stop.icao: stop for stop in stops}
    service_requirements = [
        ServiceRequirement(
            service_code=service.code,
            service_name=service.name,
            scope=classify_service_scope(service.code),
            icao=stop.icao,
            country_iso3=stop.country_iso3,
        )
        for stop in stop_by_icao.values()
        for service in top_level_ground_services
        if classify_service_scope(service.code) == ServiceScope.PER_STOP
    ]

    state_avoid_include = check_avoid_include_violation(route_states, avoid_states or set(), include_states or set())
    fir_avoid_include = check_avoid_include_violation(route_firs, avoid_firs or set(), include_firs or set())

    return PermitPlan(
        overflight_permits=overflight,
        landing_permits=landing,
        ground_handling_orders=ground_orders,
        service_requirements=service_requirements,
        state_avoid_include=state_avoid_include,
        fir_avoid_include=fir_avoid_include,
    )
