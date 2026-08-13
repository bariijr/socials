"""Anthropic-backed trip-request extraction (task #125) — turns a free-text
or structured (CAA-style) permit/trip request message into structured
*intent*: verbatim location/country names, dates, avoid/include phrases.

This module never resolves a name into a real ICAO/ISO code itself, and
the model is explicitly instructed not to guess one either — on an
aviation platform, an LLM inventing a plausible-looking airport or country
code would be exactly the kind of fabricated operational data this
codebase's own convention (see Prompt.md §3/§11) exists to prevent.
Resolution against real DB rows happens one layer up, in
app.services.trip_chat_service, the same "never trust free text as ground
truth" discipline app.services.route_preview_service already applies to a
dispatcher's own filed_route string.

Never raises — every failure mode (no API key configured, network/API
error, a malformed or missing tool_use block) returns None, the same
NO_PROVIDER_CONFIGURED-style honesty as app.core.ocr.tesseract_provider
and app.core.email_client.
"""

import logging
from dataclasses import dataclass, field
from datetime import date

import anthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-5"

_TOOL_NAME = "extract_trip_request"

_TRIP_EXTRACTION_TOOL = {
    "name": _TOOL_NAME,
    "description": (
        "Extract structured trip/leg details from a flight-support request message. "
        "Only extract what the message actually says — never infer or invent a value "
        "that isn't genuinely present or clearly implied."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "aircraft_registration": {
                "type": ["string", "null"],
                "description": "Tail number exactly as written (e.g. 'N123AB', 'G-ATWA'), if mentioned.",
            },
            "aircraft_type_query": {
                "type": ["string", "null"],
                "description": "Aircraft type/model as mentioned (e.g. 'Gulfstream G650', 'A321neo'), if given.",
            },
            "operator_name": {
                "type": ["string", "null"],
                "description": "Operator/airline name as mentioned, if given.",
            },
            "crew_count": {"type": ["integer", "null"], "description": "Total crew count, if stated."},
            "pax_count": {"type": ["integer", "null"], "description": "Total passenger count, if stated."},
            "legs": {
                "type": "array",
                "description": "One entry per flight leg described in the message, in order.",
                "items": {
                    "type": "object",
                    "properties": {
                        "departure_query": {
                            "type": "string",
                            "description": "Departure airport/city verbatim as mentioned (e.g. 'Houston', 'FAOR', 'Johannesburg').",
                        },
                        "arrival_query": {
                            "type": "string",
                            "description": "Arrival airport/city verbatim as mentioned.",
                        },
                        "departure_date": {
                            "type": ["string", "null"],
                            "description": (
                                "The leg's departure date, resolved to a full ISO 8601 date (YYYY-MM-DD) using "
                                "the supplied 'today' date to fill in any missing year — e.g. '16Aug' relative to "
                                "today becomes the nearest such date on or after today. Null if no date is given "
                                "for this leg."
                            ),
                        },
                        "departure_time_utc": {
                            "type": ["string", "null"],
                            "description": "24h HH:MM UTC departure time if explicitly given (e.g. an ETD like '0815 UTC'), else null.",
                        },
                        "avoid_country_queries": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Country names this leg must NOT overfly, verbatim as mentioned.",
                        },
                        "include_country_queries": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Country names this leg MUST be routed through, verbatim as mentioned.",
                        },
                    },
                    "required": ["departure_query", "arrival_query"],
                },
            },
        },
        "required": ["legs"],
    },
}

_SYSTEM_PROMPT = """You extract structured trip/permit-request details from a message a flight-support \
operations team received — either a short casual request ("Request a Ghana permit for N123AB flying \
from Houston to Kilimanjaro on 16Aug, do not overfly Uganda") or a fully structured CAA-style overflight \
permit request block (ATTN/FROM/DATE/ACFT OPERATOR/ITINERARY/ROUTE etc).

Today's date is {today}. Use it only to resolve a partial or relative date into a full ISO date.

Rules:
- Extract airport/city and country names EXACTLY as written in the message — never convert them to an \
ICAO or ISO code yourself, never guess a code, and never "correct" a name you don't recognize. A separate \
system resolves verbatim names against real airport/country data.
- Extract only what the message actually states. Leave a field null or an empty list rather than inferring \
a plausible-sounding value that isn't really there.
- A structured CAA-style block's ROUTE line (airway/waypoint string) is not itself a location — do not treat \
it as a leg's departure/arrival; use the ITINERARY block's actual station identifiers instead.
"""


@dataclass(frozen=True)
class LegExtraction:
    departure_query: str
    arrival_query: str
    departure_date: str | None
    departure_time_utc: str | None
    avoid_country_queries: list[str] = field(default_factory=list)
    include_country_queries: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class TripExtraction:
    aircraft_registration: str | None
    aircraft_type_query: str | None
    operator_name: str | None
    crew_count: int | None
    pax_count: int | None
    legs: list[LegExtraction]


def _parse_leg(raw: dict) -> LegExtraction:
    return LegExtraction(
        departure_query=str(raw["departure_query"]),
        arrival_query=str(raw["arrival_query"]),
        departure_date=raw.get("departure_date") or None,
        departure_time_utc=raw.get("departure_time_utc") or None,
        avoid_country_queries=[str(c) for c in (raw.get("avoid_country_queries") or [])],
        include_country_queries=[str(c) for c in (raw.get("include_country_queries") or [])],
    )


def _parse_extraction(raw: dict) -> TripExtraction:
    return TripExtraction(
        aircraft_registration=raw.get("aircraft_registration") or None,
        aircraft_type_query=raw.get("aircraft_type_query") or None,
        operator_name=raw.get("operator_name") or None,
        crew_count=raw.get("crew_count"),
        pax_count=raw.get("pax_count"),
        legs=[_parse_leg(leg) for leg in raw.get("legs") or []],
    )


async def extract_trip_request(message: str, *, today: date) -> TripExtraction | None:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=_SYSTEM_PROMPT.format(today=today.isoformat()),
            tools=[_TRIP_EXTRACTION_TOOL],
            tool_choice={"type": "tool", "name": _TOOL_NAME},
            messages=[{"role": "user", "content": message}],
        )
    except Exception:
        logger.warning("Anthropic trip extraction request failed", exc_info=True)
        return None

    tool_use = next((block for block in response.content if block.type == "tool_use"), None)
    if tool_use is None:
        logger.warning("Anthropic trip extraction response had no tool_use block")
        return None

    try:
        return _parse_extraction(tool_use.input)
    except Exception:
        logger.warning("Anthropic trip extraction tool_use input did not match the expected shape", exc_info=True)
        return None
