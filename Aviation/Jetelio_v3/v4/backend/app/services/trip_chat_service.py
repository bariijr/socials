"""Trip-builder chat parsing (task #125, provider swapped to DeepSeek in
task #127) — turns a free-text or structured permit-request message into
a pre-fillable trip/leg draft.

Two-step, deliberately kept separate: app.core.chat.deepseek_provider
extracts verbatim *intent* (location/country names, dates) and is
instructed never to invent a code; this module is the only place that
resolves those names against real DB rows (the exact same search
functions the public lookup endpoints already use), so a hallucinated or
mismatched location can never silently become a "resolved" ICAO/ISO code.
Anything that doesn't confidently resolve is reported as unmatched rather
than guessed — the operator reviews and fills in the pre-filled form
before ever submitting, same safety net as admin's existing registration
autofill.
"""

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.chat.deepseek_provider import extract_trip_request
from app.core.chat.schema import LegExtraction, TripExtraction
from app.services import feasibility_iq_service


@dataclass(frozen=True)
class ResolvedAirport:
    query: str
    icao: str | None
    name: str | None


@dataclass(frozen=True)
class ResolvedCountry:
    query: str
    iso3: str | None
    name: str | None


@dataclass(frozen=True)
class ResolvedAircraftType:
    query: str
    icao_type: str | None
    name: str | None


@dataclass(frozen=True)
class ChatLegDraft:
    departure: ResolvedAirport
    arrival: ResolvedAirport
    departure_date: str | None
    departure_time_utc: str | None
    avoid_countries: list[ResolvedCountry] = field(default_factory=list)
    include_countries: list[ResolvedCountry] = field(default_factory=list)


@dataclass(frozen=True)
class ChatTripDraft:
    aircraft_registration: str | None
    aircraft_type: ResolvedAircraftType | None
    operator_name: str | None
    crew_count: int | None
    pax_count: int | None
    legs: list[ChatLegDraft]
    # Human-readable notes about anything that didn't confidently resolve —
    # surfaced to the user so they know exactly what to double-check before
    # submitting, never silently dropped.
    warnings: list[str]


async def _resolve_airport(session: AsyncSession, query: str, *, role: str, warnings: list[str]) -> ResolvedAirport:
    matches = await feasibility_iq_service.search_airports(session, query)
    if not matches:
        warnings.append(f"Could not match {role} \"{query}\" to a known airport — please select it manually.")
        return ResolvedAirport(query=query, icao=None, name=None)
    top = matches[0]
    return ResolvedAirport(query=query, icao=top.icao, name=top.name)


async def _resolve_country(session: AsyncSession, query: str, *, warnings: list[str]) -> ResolvedCountry:
    matches = await feasibility_iq_service.search_countries(session, query)
    if not matches:
        warnings.append(f"Could not match country \"{query}\" — please add it manually if it's still needed.")
        return ResolvedCountry(query=query, iso3=None, name=None)
    top = matches[0]
    return ResolvedCountry(query=query, iso3=top.iso3, name=top.name)


async def _resolve_aircraft_type(session: AsyncSession, query: str, *, warnings: list[str]) -> ResolvedAircraftType:
    matches = await feasibility_iq_service.search_aircraft_types(session, query)
    if not matches:
        warnings.append(f"Could not match aircraft type \"{query}\" — please pick it manually.")
        return ResolvedAircraftType(query=query, icao_type=None, name=None)
    top = matches[0]
    name = f"{top.manufacturer or ''} {top.model_series or ''}".strip() or top.icao_type
    return ResolvedAircraftType(query=query, icao_type=top.icao_type, name=name)


async def _resolve_leg(session: AsyncSession, leg: LegExtraction, *, index: int, warnings: list[str]) -> ChatLegDraft:
    departure = await _resolve_airport(session, leg.departure_query, role=f"leg {index + 1} departure", warnings=warnings)
    arrival = await _resolve_airport(session, leg.arrival_query, role=f"leg {index + 1} arrival", warnings=warnings)
    avoid_countries = [await _resolve_country(session, q, warnings=warnings) for q in leg.avoid_country_queries]
    include_countries = [await _resolve_country(session, q, warnings=warnings) for q in leg.include_country_queries]
    return ChatLegDraft(
        departure=departure,
        arrival=arrival,
        departure_date=leg.departure_date,
        departure_time_utc=leg.departure_time_utc,
        avoid_countries=avoid_countries,
        include_countries=include_countries,
    )


async def parse_trip_message(session: AsyncSession, message: str, *, today: date) -> ChatTripDraft | None:
    """Returns None only when extraction itself failed (no API key
    configured, or the LLM call/response didn't work out) — the caller
    (router) is responsible for turning that into an honest "chat isn't
    available right now" response, never a fabricated empty draft.
    """
    extraction: TripExtraction | None = await extract_trip_request(message, today=today)
    if extraction is None:
        return None

    warnings: list[str] = []
    legs = [await _resolve_leg(session, leg, index=i, warnings=warnings) for i, leg in enumerate(extraction.legs)]
    aircraft_type = (
        await _resolve_aircraft_type(session, extraction.aircraft_type_query, warnings=warnings)
        if extraction.aircraft_type_query
        else None
    )

    return ChatTripDraft(
        aircraft_registration=extraction.aircraft_registration,
        aircraft_type=aircraft_type,
        operator_name=extraction.operator_name,
        crew_count=extraction.crew_count,
        pax_count=extraction.pax_count,
        legs=legs,
        warnings=warnings,
    )
