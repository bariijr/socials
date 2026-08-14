"""Trip-builder chat parsing (task #125; provider swapped Anthropic ->
DeepSeek in task #127, DeepSeek -> Ollama in task #129, then all four
wired at once with priority-ordered, workload-aware failover in task
#131) — turns a free-text or structured permit-request message into a
pre-fillable trip/leg draft.

Two-step, deliberately kept separate: app.core.chat.dispatcher extracts
verbatim *intent* (location/country names, dates), trying each configured
provider in priority order until one succeeds, and is instructed never to
invent a code; this module is the only place that
resolves those names against real DB rows (the exact same search
functions the public lookup endpoints already use), so a hallucinated or
mismatched location can never silently become a "resolved" ICAO/ISO code.
Anything that doesn't confidently resolve is reported as unmatched rather
than guessed — the operator reviews and fills in the pre-filled form
before ever submitting, same safety net as admin's existing registration
autofill.
"""

import re
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.chat import dispatcher
from app.core.chat.schema import LegExtraction, TripExtraction
from app.services import feasibility_iq_service

# Real CAA/ops permit-request messages routinely write a leg as
# "CITY / ICAO" (e.g. "BLANTYRE / FWCL") — the chat schema's own
# instructions require extracting that verbatim, so a leg's departure_query
# often arrives as the whole "City / ICAO" string, which no single
# name/city/icao field in the airports table will ever literally contain
# as a substring (search_airports requires the *entire* query to match one
# field). Before falling back to a fuzzy whole-string search, look for a
# bare 4-letter token and try resolving on that alone. This isn't a guess:
# search_airports still checks the token against real rows, so a
# non-ICAO 4-letter word (a short city name, say) simply finds nothing and
# falls through to the normal fuzzy search unaffected.
_ICAO_TOKEN_PATTERN = re.compile(r"\b([A-Za-z]{4})\b")


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
    # Free-text identifier, not a code needing DB resolution — passed
    # through verbatim exactly like aircraft_registration below.
    call_sign: str | None = None
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
    for token in _ICAO_TOKEN_PATTERN.findall(query):
        token_matches = await feasibility_iq_service.search_airports(session, token)
        exact = next((m for m in token_matches if m.icao.upper() == token.upper()), None)
        if exact is not None:
            return ResolvedAirport(query=query, icao=exact.icao, name=exact.name)

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
        call_sign=leg.call_sign,
        avoid_countries=avoid_countries,
        include_countries=include_countries,
    )


async def extract_trip_request(session: AsyncSession, message: str, *, today: date) -> TripExtraction | None:
    """Thin wrapper kept as a module-level name (rather than calling
    dispatcher.extract_trip_request directly from parse_trip_message) so
    tests can monkeypatch one stable symbol here regardless of which of
    the four underlying providers the admin currently has selected.
    """
    return await dispatcher.extract_trip_request(session, message, today=today)


async def parse_trip_message(session: AsyncSession, message: str, *, today: date) -> ChatTripDraft | None:
    """Returns None only when extraction itself failed (no provider
    configured, or the LLM call/response didn't work out) — the caller
    (router) is responsible for turning that into an honest "chat isn't
    available right now" response, never a fabricated empty draft.
    """
    extraction: TripExtraction | None = await extract_trip_request(session, message, today=today)
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
