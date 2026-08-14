"""Shared trip-request extraction schema/dataclasses (task #125/#127) —
provider-agnostic so swapping the LLM backend (Anthropic -> DeepSeek, task
#127) never touches app.services.trip_chat_service or the JSON-schema
contract itself, only which HTTP API actually gets called.

The schema instructs whichever model is used to extract verbatim
*intent* — location/country names, dates, avoid/include phrases — never a
resolved ICAO/ISO code. See app.services.trip_chat_service for why: an LLM
inventing a plausible-looking airport/country code would be exactly the
kind of fabricated operational data this codebase's own convention (see
Prompt.md §3/§11) exists to prevent; resolution against real DB rows
happens one layer up, never here.
"""

from dataclasses import dataclass, field

TOOL_NAME = "extract_trip_request"
TOOL_DESCRIPTION = (
    "Extract structured trip/leg details from a flight-support request message. "
    "Only extract what the message actually says — never infer or invent a value "
    "that isn't genuinely present or clearly implied."
)

# A plain JSON Schema object — Anthropic wraps this as a tool's
# `input_schema`, OpenAI-compatible APIs (DeepSeek) wrap the identical
# object as a function's `parameters`. Keeping it as one shared dict is
# what makes the contract itself provider-agnostic.
INPUT_SCHEMA = {
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
                    "call_sign": {
                        "type": ["string", "null"],
                        "description": (
                            "The flight callsign for this leg, verbatim, if one is explicitly stated (e.g. "
                            "'callsign TWY201', 'FLIGHT NBR WY1026'). Not the aircraft's tail number/registration "
                            "and not the aircraft type/model — those are separate fields. Null if no callsign is given."
                        ),
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
}

SYSTEM_PROMPT = """You extract structured trip/permit-request details from a message a flight-support \
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
- aircraft_registration, call_sign, and aircraft_type_query are three DIFFERENT things — never put one's value \
in another field:
  * aircraft_registration is the tail number (e.g. "N123AB", "N80TE", "G-ATWA") — usually near "REGISTRY", \
"REG", or written directly after the operator name.
  * call_sign is a flight identifier like "TWY201" or "WY1026" — usually near the word "callsign", "FLIGHT NBR", \
or similar, and is per-leg if the message gives one per leg.
  * aircraft_type_query is the aircraft's make/model (e.g. "Gulfstream G650", "GLEX", "A321neo") — leave it \
null if the message never actually names a type/model, even if a registration or callsign is given. Do not \
guess a type from a registration or callsign.
"""


@dataclass(frozen=True)
class LegExtraction:
    departure_query: str
    arrival_query: str
    departure_date: str | None
    departure_time_utc: str | None
    call_sign: str | None = None
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


def parse_leg(raw: dict) -> LegExtraction:
    return LegExtraction(
        departure_query=str(raw["departure_query"]),
        arrival_query=str(raw["arrival_query"]),
        departure_date=raw.get("departure_date") or None,
        departure_time_utc=raw.get("departure_time_utc") or None,
        call_sign=raw.get("call_sign") or None,
        avoid_country_queries=[str(c) for c in (raw.get("avoid_country_queries") or [])],
        include_country_queries=[str(c) for c in (raw.get("include_country_queries") or [])],
    )


def parse_extraction(raw: dict) -> TripExtraction:
    return TripExtraction(
        aircraft_registration=raw.get("aircraft_registration") or None,
        aircraft_type_query=raw.get("aircraft_type_query") or None,
        operator_name=raw.get("operator_name") or None,
        crew_count=raw.get("crew_count"),
        pax_count=raw.get("pax_count"),
        legs=[parse_leg(leg) for leg in raw.get("legs") or []],
    )
