"""Pure functions that compute derived status from reference-data fields.

Per the verification contract: EVERY DERIVED STATUS IS COMPUTED, NOT TYPED.
This module imports nothing from FastAPI or SQLAlchemy — it operates on
plain scalar arguments so it can be unit-tested in isolation and diffed
against the workbook. No literals live in the service layer; every
fallback these functions apply is passed in as an argument sourced from
the named-settings registry.
"""

from dataclasses import dataclass
from datetime import date


class CountryReferenceStatus:
    VERIFIED = "VERIFIED"
    LEAD_TIME_OK_FLAGS_UNVERIFIED = "LEAD TIME OK - FLAGS UNVERIFIED"
    UNVERIFIED_NO_SOURCE = "UNVERIFIED - NO SOURCE"
    UNVERIFIED_USING_FALLBACK = "UNVERIFIED - USING FALLBACK"


class AircraftPlanningStatus:
    APPROVED_FOR_PLANNING = "APPROVED FOR PLANNING"
    ADVISORY_ONLY = "ADVISORY ONLY - NOT FOR PLANNING"


class TechStopReadiness:
    INCOMPLETE = "INCOMPLETE - NOT SELECTABLE AS TECH STOP"
    UNVERIFIED_ADVISORY = "UNVERIFIED - ADVISORY ONLY"
    VERIFIED = "VERIFIED"


class OperatorAssignableStatus:
    BLOCKED_NAME_REQUIRED = "BLOCKED - OPERATOR NAME REQUIRED"
    ASSIGNABLE = "ASSIGNABLE"


class NavFeeProviderStatus:
    VERIFIED = "VERIFIED"
    UNVERIFIED_NO_SOURCE = "UNVERIFIED - NO SOURCE"
    NO_PROVIDER_CONFIGURED = "NO PROVIDER CONFIGURED - RATE NEEDED"


@dataclass(frozen=True)
class EffectiveLeadTime:
    hours: float
    is_fallback: bool


def resolve_effective_lead_time_hours(
    standard_lead_time_hours: float | None, default_permit_lead_time_hours: float
) -> EffectiveLeadTime:
    """R5: file_by deadlines are computed off this. Falls back to the
    named-setting default only when no per-state value has been entered
    at all — a present-but-unverified value is NOT replaced by the
    fallback, it is used as-is and flagged UNVERIFIED - NO SOURCE.
    """
    if standard_lead_time_hours is None:
        return EffectiveLeadTime(hours=default_permit_lead_time_hours, is_fallback=True)
    return EffectiveLeadTime(hours=standard_lead_time_hours, is_fallback=False)


@dataclass(frozen=True)
class EffectivePermitValidity:
    amount: float
    unit: str
    is_fallback: bool


def resolve_effective_permit_validity(
    permit_validity_amount: float | None,
    permit_validity_unit: str | None,
    default_permit_validity_amount: float,
    default_permit_validity_unit: str,
) -> EffectivePermitValidity:
    """Mirrors resolve_effective_lead_time_hours exactly, for the distinct
    "how long does a granted permit stay valid" concept — falls back to the
    named-setting default only when the country has neither an amount nor a
    unit entered; a present-but-unverified value is used as-is (flagged
    UNVERIFIED - NO SOURCE by the caller, not replaced by the fallback).
    """
    if permit_validity_amount is None or permit_validity_unit is None:
        return EffectivePermitValidity(
            amount=default_permit_validity_amount, unit=default_permit_validity_unit, is_fallback=True
        )
    return EffectivePermitValidity(amount=permit_validity_amount, unit=permit_validity_unit, is_fallback=False)


def resolve_country_reference_status(
    *,
    standard_lead_time_hours: float | None,
    lead_time_source: str | None,
    lead_time_verified_by: str | None,
    lead_time_verified_on: date | None,
    permit_flags_source: str | None,
    permit_flags_verified_by: str | None,
    permit_flags_verified_on: date | None,
) -> str:
    lead_time_fully_verified = (
        standard_lead_time_hours is not None
        and bool(lead_time_source)
        and bool(lead_time_verified_by)
        and lead_time_verified_on is not None
    )
    permit_flags_fully_verified = (
        bool(permit_flags_source) and bool(permit_flags_verified_by) and permit_flags_verified_on is not None
    )

    if lead_time_fully_verified and permit_flags_fully_verified:
        return CountryReferenceStatus.VERIFIED
    if lead_time_fully_verified and not permit_flags_fully_verified:
        return CountryReferenceStatus.LEAD_TIME_OK_FLAGS_UNVERIFIED
    if standard_lead_time_hours is None:
        return CountryReferenceStatus.UNVERIFIED_USING_FALLBACK
    return CountryReferenceStatus.UNVERIFIED_NO_SOURCE


def is_ground_handling_policy_decided(policy: str) -> bool:
    """Gate 3: decided means anything other than the VERIFY placeholder."""
    return policy != "VERIFY"


def resolve_aircraft_planning_status(
    *, verified: bool, verified_by: str | None, verified_on: date | None
) -> str:
    if verified and bool(verified_by) and verified_on is not None:
        return AircraftPlanningStatus.APPROVED_FOR_PLANNING
    return AircraftPlanningStatus.ADVISORY_ONLY


def resolve_airport_tech_stop_readiness(
    *,
    operating_hours: str | None,
    is_airport_of_entry: bool | None,
    fuel_grades: list[str] | None,
    ops_data_source: str | None,
    ops_data_verified_on: date | None,
) -> str:
    populated = bool(operating_hours) and is_airport_of_entry is not None and bool(fuel_grades)
    if not populated:
        return TechStopReadiness.INCOMPLETE
    if not (bool(ops_data_source) and ops_data_verified_on is not None):
        return TechStopReadiness.UNVERIFIED_ADVISORY
    return TechStopReadiness.VERIFIED


def resolve_operator_assignable(name: str | None) -> str:
    if not name or not name.strip():
        return OperatorAssignableStatus.BLOCKED_NAME_REQUIRED
    return OperatorAssignableStatus.ASSIGNABLE


def resolve_nav_fee_provider_status(
    *, source: str | None, verified_by: str | None, verified_on: date | None
) -> str:
    if bool(source) and bool(verified_by) and verified_on is not None:
        return NavFeeProviderStatus.VERIFIED
    return NavFeeProviderStatus.UNVERIFIED_NO_SOURCE
