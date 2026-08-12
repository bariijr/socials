"""Projects a LegFeasibilityResult (the internal engine output) down to the
LegResultOut API shape. Shared by the public Feasibility IQ path
(app.services.feasibility_iq_service) and the authenticated Trip Manager
path (app.services.trip_service) — both call the same four engines via
app.services.leg_feasibility_service.compute_leg_feasibility, so the
result they need to display is identical in shape; only what's collected
up front (passport data) differs between the two callers.
"""

import json
from dataclasses import asdict
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.permits import DeadlineStatus
from app.models.airport import Airport
from app.models.country import Country
from app.models.geometry import FirBoundary
from app.schemas.feasibility import (
    AvoidIncludeOut,
    CapabilityOut,
    CredentialsOut,
    FirOut,
    GroundHandlingOrderOut,
    LandingPermitOut,
    LegResultOut,
    NavFeesSummaryOut,
    OverflightPermitOut,
    PermitDeadlineOut,
    PermitFeesSummaryOut,
    PermitsOut,
    PersonVisaOut,
    RerouteOut,
    RouteOut,
    ServiceRequirementOut,
    StateOut,
    TechStopSuggestionOut,
)
from app.services.leg_feasibility_service import LegFeasibilityResult
from app.services.permit_engine_service import PermitDeadline


def json_safe(obj) -> dict:
    return json.loads(json.dumps(asdict(obj), default=str))


async def _country_names(session: AsyncSession, iso3_codes: set[str]) -> dict[str, str]:
    if not iso3_codes:
        return {}
    rows = (await session.execute(select(Country).where(Country.iso3.in_(iso3_codes)))).scalars().all()
    return {c.iso3: c.name for c in rows}


async def _airport_names(session: AsyncSession, icao_codes: set[str]) -> dict[str, str]:
    if not icao_codes:
        return {}
    rows = (await session.execute(select(Airport).where(Airport.icao.in_(icao_codes)))).scalars().all()
    return {a.icao: a.name for a in rows}


async def _fir_names(session: AsyncSession, fir_codes: set[str]) -> dict[str, str]:
    if not fir_codes:
        return {}
    rows = (await session.execute(select(FirBoundary).where(FirBoundary.icao_fir_code.in_(fir_codes)))).scalars().all()
    return {f.icao_fir_code: f.name for f in rows}


def _build_verdict_reasons(
    result: LegFeasibilityResult, country_names: dict[str, str], fir_names: dict[str, str]
) -> list[str]:
    """Plain-English explanation of `result.verdict` — mirrors the exact
    signals app.domain.permits.determine_feasibility_verdict weighs
    (capability, avoid/include conflicts, reroute availability, deadline
    urgency) so the reasons never drift out of sync with the verdict they
    explain. Order follows that function's own precedence (most severe
    first): capability, then avoid/include, then urgent deadlines.
    """
    reasons: list[str] = []

    cap = result.capability.capability
    if cap and cap.exceeds:
        distance = result.route.distance_nm
        practical = result.capability.practical_range_nm
        range_desc = f"{practical:.0f} NM" if practical is not None else "the aircraft's practical range"
        if result.capability.tech_stop_suggestions:
            stops = ", ".join(t.icao for t in result.capability.tech_stop_suggestions)
            reasons.append(
                f"Aircraft range ({range_desc}) is short of this route ({distance:.0f} NM) — "
                f"a tech stop closes the gap ({stops})."
            )
        else:
            reasons.append(
                f"Aircraft range ({range_desc}) is short of this route ({distance:.0f} NM) and no tech stop closes the gap."
            )
    elif result.capability.margin_tight:
        if cap and cap.margin_nm is not None:
            reasons.append(f"Range margin is thin — only {cap.margin_nm:.0f} NM of buffer over the route distance.")
        else:
            reasons.append("Range margin is thin.")

    state_v = result.permits.state_avoid_include
    for iso3 in state_v.avoided_states_transited:
        reasons.append(f"Route crosses {country_names.get(iso3, iso3)}, which is marked to avoid.")
    for iso3 in state_v.required_states_missed:
        reasons.append(f"Route does not cross {country_names.get(iso3, iso3)}, which is required.")

    fir_v = result.permits.fir_avoid_include
    for code in fir_v.avoided_states_transited:
        reasons.append(f"Route crosses {fir_names.get(code, code)} FIR, which is marked to avoid.")
    for code in fir_v.required_states_missed:
        reasons.append(f"Route does not cross {fir_names.get(code, code)} FIR, which is required.")

    if state_v.violated or fir_v.violated:
        if result.reroute and result.reroute.found:
            extra_nm = result.reroute.extra_distance_nm or 0
            extra_h = result.reroute.extra_time_hours or 0
            reasons.append(
                f"An alternate routing that avoids the conflict was found (+{extra_nm:.0f} NM, +{extra_h:.1f} h) — "
                "the plan as filed is not feasible, but an alternative is."
            )
        else:
            reasons.append("No alternate routing was found that avoids the conflict.")

    for p in result.permits.overflight_permits:
        if p.deadline.deadline_status == DeadlineStatus.URGENT:
            reasons.append(f"Overflight permit for {p.country_name} is urgent — file by {p.deadline.file_by:%d-%b-%Y %H:%MZ}.")
    for p in result.permits.landing_permits:
        if p.deadline.deadline_status == DeadlineStatus.URGENT:
            reasons.append(f"Landing permit for {p.country_name} is urgent — file by {p.deadline.file_by:%d-%b-%Y %H:%MZ}.")
    for g in result.permits.ground_handling_orders:
        if g.deadline.deadline_status == DeadlineStatus.URGENT:
            reasons.append(f"Ground handling order for {g.country_name} is urgent — file by {g.deadline.file_by:%d-%b-%Y %H:%MZ}.")

    if not reasons:
        reasons.append("No feasibility issues identified — route, aircraft range, and permit deadlines are all within normal margins.")

    return reasons


def _deadline_out(d: PermitDeadline) -> PermitDeadlineOut:
    return PermitDeadlineOut(
        file_by=d.file_by,
        deadline_status=d.deadline_status,
        lead_time_hours=d.lead_time_hours,
        lead_time_is_fallback=d.lead_time_is_fallback,
    )


def _avoid_include_out(v) -> AvoidIncludeOut:
    return AvoidIncludeOut(
        violated=v.violated, avoided_transited=v.avoided_states_transited, required_missed=v.required_states_missed
    )


async def project_leg_result(
    session: AsyncSession, dep_icao: str, arr_icao: str, persons: list, result: LegFeasibilityResult, *, call_sign: str | None = None
) -> LegResultOut:
    """`persons` is any sequence of objects with `.nationality_iso3` in the
    same order as the `PersonInput` list passed to `compute_leg_feasibility`
    (`app.schemas.feasibility.PersonPublicIn` for the public path,
    `app.schemas.trip.PersonIn` for the internal one — same shape).
    """
    country_codes = {s.iso3 for s in result.route.states}
    country_codes |= {p.country_iso3 for p in result.permits.overflight_permits}
    country_codes |= {p.country_iso3 for p in result.permits.landing_permits}
    country_codes |= {g.country_iso3 for g in result.permits.ground_handling_orders}
    country_codes |= set(result.permits.state_avoid_include.avoided_states_transited)
    country_codes |= set(result.permits.state_avoid_include.required_states_missed)
    names = await _country_names(session, country_codes)

    tech_stop_icaos = {t.icao for t in result.capability.tech_stop_suggestions}
    airport_names = await _airport_names(session, tech_stop_icaos)

    fir_codes = set(result.permits.fir_avoid_include.avoided_states_transited)
    fir_codes |= set(result.permits.fir_avoid_include.required_states_missed)
    fir_name_map = await _fir_names(session, fir_codes)
    fir_name_map.update({f.icao_fir_code: f.name for f in result.route.firs if f.name})

    route_out = RouteOut(
        distance_nm=result.route.distance_nm,
        eet_hours=result.eet_hours,
        states=[StateOut(iso3=s.iso3, name=names.get(s.iso3, s.iso3)) for s in result.route.states],
        firs=[FirOut(icao_fir_code=f.icao_fir_code, name=f.name) for f in result.route.firs],
    )

    permits_out = PermitsOut(
        overflight_permits=[
            OverflightPermitOut(
                country_iso3=p.country_iso3,
                country_name=p.country_name,
                entry_datetime=p.entry_datetime,
                exit_datetime=p.exit_datetime,
                deadline=_deadline_out(p.deadline),
            )
            for p in result.permits.overflight_permits
        ],
        landing_permits=[
            LandingPermitOut(
                country_iso3=p.country_iso3,
                country_name=p.country_name,
                entry_datetime=p.entry_datetime,
                exit_datetime=p.exit_datetime,
                deadline=_deadline_out(p.deadline),
            )
            for p in result.permits.landing_permits
        ],
        ground_handling_orders=[
            GroundHandlingOrderOut(
                country_iso3=g.country_iso3,
                country_name=g.country_name,
                earliest_icao=g.earliest_icao,
                earliest_event_at=g.earliest_event_at,
                deadline=_deadline_out(g.deadline),
            )
            for g in result.permits.ground_handling_orders
        ],
        service_requirements=[
            ServiceRequirementOut(
                service_code=s.service_code, service_name=s.service_name, scope=s.scope, icao=s.icao, country_iso3=s.country_iso3
            )
            for s in result.permits.service_requirements
        ],
        state_avoid_include=_avoid_include_out(result.permits.state_avoid_include),
        fir_avoid_include=_avoid_include_out(result.permits.fir_avoid_include),
    )

    capability_out = CapabilityOut(
        planning_status=result.capability.planning_status,
        max_range_nm=result.capability.max_range_nm,
        practical_range_nm=result.capability.practical_range_nm,
        exceeds=result.capability.capability.exceeds if result.capability.capability else None,
        margin_nm=result.capability.capability.margin_nm if result.capability.capability else None,
        margin_tight=result.capability.margin_tight,
        tech_stop_suggestions=[
            TechStopSuggestionOut(
                icao=t.icao,
                name=airport_names.get(t.icao),
                leg1_distance_nm=t.leg1_distance_nm,
                leg2_distance_nm=t.leg2_distance_nm,
                added_distance_nm=t.added_distance_nm,
            )
            for t in result.capability.tech_stop_suggestions
        ],
    )

    credentials_out = CredentialsOut(
        persons=[
            PersonVisaOut(
                person_id=p_out.person_id,
                role=p_out.role,
                nationality_iso3=p_in.nationality_iso3,
                visa_requirement=p_out.visa_answer.requirement,
                visa_answered_by_layer=p_out.visa_answer.answered_by_layer,
            )
            for p_in, p_out in zip(persons, result.credentials.persons)
        ],
        souls_on_board_total=result.credentials.souls_on_board.total,
        souls_on_board_exceeds_max_pax=result.credentials.souls_on_board.exceeds,
    )

    reroute_out = (
        RerouteOut(
            found=result.reroute.found,
            extra_distance_nm=result.reroute.extra_distance_nm,
            extra_time_hours=result.reroute.extra_time_hours,
            extra_fuel_kg=result.reroute.extra_fuel_kg,
        )
        if result.reroute
        else None
    )

    nav_fees_out = (
        NavFeesSummaryOut(
            fully_priced=result.nav_fees.fully_priced,
            subtotal_usd=result.nav_fees.subtotal_usd,
            margin_percent=result.nav_fees.margin_percent,
            margin_usd=result.nav_fees.margin_usd,
            total_usd=result.nav_fees.total_usd,
        )
        if result.nav_fees.mtow_known
        else None
    )

    permit_fees_out = (
        PermitFeesSummaryOut(
            fully_priced=result.permit_fees.fully_priced,
            caa_subtotal_usd=result.permit_fees.caa_subtotal_usd,
            nafisat_subtotal_usd=result.permit_fees.nafisat_subtotal_usd,
            jtl_subtotal_usd=result.permit_fees.jtl_subtotal_usd,
            total_usd=result.permit_fees.total_usd,
        )
        if result.permit_fees.mtow_known
        else None
    )

    return LegResultOut(
        dep_icao=dep_icao,
        arr_icao=arr_icao,
        call_sign=call_sign,
        reference_datetime=result.reference_datetime,
        arrival_datetime=result.reference_datetime + timedelta(hours=result.eet_hours),
        filed_route=result.filed_route,
        route=route_out,
        permits=permits_out,
        capability=capability_out,
        credentials=credentials_out,
        reroute=reroute_out,
        nav_fees=nav_fees_out,
        permit_fees=permit_fees_out,
        verdict=result.verdict,
        reasons=_build_verdict_reasons(result, names, fir_name_map),
    )
