"""The canonical list of named settings.

Every fallback number or switch an engine could need is declared here —
never as a literal inside domain/service code. The `settings` DB table is
seeded from this registry on first migration and is editable at runtime by
SUPER ADMIN; this module is only the source of defaults, types and
descriptions used to seed and validate that table.
"""

from dataclasses import dataclass
from enum import Enum


class SettingValueType(str, Enum):
    INTEGER = "INTEGER"
    FLOAT = "FLOAT"
    BOOLEAN = "BOOLEAN"
    INT_LIST = "INT_LIST"
    STRING = "STRING"


@dataclass(frozen=True)
class SettingDefinition:
    key: str
    value_type: SettingValueType
    default_value: str
    description: str


NAMED_SETTINGS: list[SettingDefinition] = [
    SettingDefinition(
        key="default_permit_lead_time_hours",
        value_type=SettingValueType.FLOAT,
        default_value="72",
        description=(
            "Fallback file_by lead time (hours) for a country with no "
            "verified standard_lead_time_hours. Any permit computed from "
            "this fallback is flagged UNVERIFIED."
        ),
    ),
    SettingDefinition(
        key="default_ground_notice_hours",
        value_type=SettingValueType.FLOAT,
        default_value="24",
        description="Fallback notice period (hours) for ground services with no per-country override.",
    ),
    SettingDefinition(
        key="default_permit_validity_amount",
        value_type=SettingValueType.FLOAT,
        default_value="30",
        description=(
            "Fallback permit validity amount for a country with no verified "
            "permit_validity_amount/unit. Paired with "
            "default_permit_validity_unit (e.g. 30 DAYS). Any valid_until "
            "computed from this fallback is flagged UNVERIFIED."
        ),
    ),
    SettingDefinition(
        key="default_permit_validity_unit",
        value_type=SettingValueType.STRING,
        default_value="DAYS",
        description="Unit for default_permit_validity_amount: HOURS, DAYS, WEEKS, or MONTHS.",
    ),
    SettingDefinition(
        key="range_reserve_margin",
        value_type=SettingValueType.FLOAT,
        default_value="0.15",
        description="Fraction subtracted from max_range to derive practical_range for capability checks.",
    ),
    SettingDefinition(
        key="passport_validity_buffer_days",
        value_type=SettingValueType.INTEGER,
        default_value="180",
        description="A passport expiring within this many days of trip end is UNDER 6 MONTHS, not VALID.",
    ),
    SettingDefinition(
        key="document_expiry_alert_days",
        value_type=SettingValueType.INT_LIST,
        default_value="180,90,30,7",
        description="Days-before-expiry thresholds at which a document expiry alert is raised.",
    ),
    SettingDefinition(
        key="visa_rule_staleness_days",
        value_type=SettingValueType.INTEGER,
        default_value="365",
        description="A visa rule older than this (verified_on) renders STALE and queues re-verification.",
    ),
    SettingDefinition(
        key="allow_unverified_for_planning",
        value_type=SettingValueType.BOOLEAN,
        default_value="NO",
        description=(
            "Master switch. When NO, UNVERIFIED reference data is refused "
            "outright for planning outputs rather than silently used."
        ),
    ),
    SettingDefinition(
        key="default_block_speed_kts",
        value_type=SettingValueType.FLOAT,
        default_value="470",
        description="Fallback cruise speed (kts) for EET when no aircraft-specific cruise_tas_kts is available.",
    ),
    SettingDefinition(
        key="taxi_allowance_hours",
        value_type=SettingValueType.FLOAT,
        default_value="0.4",
        description="Fixed allowance (hours) added to every EET calculation for taxi/startup/approach.",
    ),
    SettingDefinition(
        key="route_sample_interval_nm",
        value_type=SettingValueType.FLOAT,
        default_value="10",
        description="Engine 1: adaptive sampling interval (NM) along the great-circle track.",
    ),
    SettingDefinition(
        key="route_sample_min_points",
        value_type=SettingValueType.INTEGER,
        default_value="50",
        description="Engine 1: minimum number of sample points along any leg, regardless of distance.",
    ),
    SettingDefinition(
        key="reroute_corridor_half_width_nm",
        value_type=SettingValueType.FLOAT,
        default_value="150",
        description="Engine 2 re-routing: lateral half-width (NM) of the search corridor around the direct track.",
    ),
    SettingDefinition(
        key="reroute_lane_count",
        value_type=SettingValueType.INTEGER,
        default_value="7",
        description="Engine 2 re-routing: number of lateral lanes across the corridor (odd, includes the centerline).",
    ),
    SettingDefinition(
        key="capability_tight_margin_fraction",
        value_type=SettingValueType.FLOAT,
        default_value="0.10",
        description="Engine 3: capability verdict is TIGHT when remaining range margin falls below this fraction of practical range.",
    ),
    SettingDefinition(
        key="feasibility_iq_rate_limit_per_hour",
        value_type=SettingValueType.INTEGER,
        default_value="30",
        description="Public Feasibility IQ: max requests per (client IP, endpoint bucket) per rolling hour.",
    ),
    SettingDefinition(
        key="chat_parse_rate_limit_per_hour",
        value_type=SettingValueType.INTEGER,
        default_value="10",
        description="Trip-builder chat parsing: max requests per (client IP) per rolling hour — kept far below "
        "feasibility_iq_rate_limit_per_hour since each call is a real, paid LLM API request, not a free DB lookup.",
    ),
    SettingDefinition(
        key="feasibility_quote_ttl_seconds",
        value_type=SettingValueType.INTEGER,
        default_value="1800",
        description="How long a Feasibility IQ check_id stays redeemable via REQUEST QUOTE before expiring.",
    ),
    SettingDefinition(
        key="nav_fee_margin_percent",
        value_type=SettingValueType.FLOAT,
        default_value="15",
        description="Jetelio margin applied on top of computed nav fee cost when building a client quote/estimate.",
    ),
    SettingDefinition(
        key="jtl_service_fee_usd",
        value_type=SettingValueType.FLOAT,
        default_value="0",
        description="Flat JTL service fee added per permit line item (overflight/landing/ground handling) in the cost summary.",
    ),
    SettingDefinition(
        key="chat_provider_priority",
        value_type=SettingValueType.STRING,
        default_value="ollama,deepseek,anthropic,openai",
        description=(
            "Comma-separated try-order for trip-builder chat extraction across the four wired "
            "providers (ollama/deepseek/anthropic/openai). The dispatcher tries each in order, "
            "skipping any that are suspended (chat_provider_suspended), unconfigured (no "
            "credential set, see app/config.py), or currently at chat_provider_max_concurrent "
            "capacity, and falls through to the next on failure — first real success wins. Any "
            "provider missing from this list still gets a chance, appended at the end."
        ),
    ),
    SettingDefinition(
        key="chat_provider_suspended",
        value_type=SettingValueType.STRING,
        default_value="",
        description=(
            "Comma-separated provider names to skip entirely regardless of priority order — for "
            "taking a provider offline deliberately (maintenance, cost control) without losing "
            "its place in chat_provider_priority."
        ),
    ),
    SettingDefinition(
        key="chat_provider_max_concurrent",
        value_type=SettingValueType.INTEGER,
        default_value="2",
        description=(
            "Max concurrent in-flight trip-builder chat extraction requests allowed per provider "
            "before the dispatcher treats it as busy and fails over to the next one in "
            "chat_provider_priority — protects a resource-constrained provider (e.g. Ollama on a "
            "small VPS) from being piled onto, while letting the others keep working concurrently."
        ),
    ),
    SettingDefinition(
        key="ocr_enabled",
        value_type=SettingValueType.BOOLEAN,
        default_value="YES",
        description=(
            "Master switch for the Tesseract OCR pipeline that runs after a "
            "Person/Party document upload. NO leaves ocr_raw_output/"
            "extracted_fields null, same as if no OCR provider were configured."
        ),
    ),
]

NAMED_SETTINGS_BY_KEY: dict[str, SettingDefinition] = {s.key: s for s in NAMED_SETTINGS}
