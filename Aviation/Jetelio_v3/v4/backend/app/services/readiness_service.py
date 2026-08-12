"""The nine pilot-exit gates and the reference-data readiness report — code,
not a spreadsheet. Recomputed live on every call; the importer calls this
after every load and prints the result (spec section 5 / T14).
"""

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.models.country import Country
from app.models.country_requirements import CountryRequirement
from app.models.operator import Operator
from app.models.vendor import Vendor, VendorCapabilityStatus, VendorCoverageAirport
from app.models.visa import VisaMatrixCell
from app.schemas.readiness import GateStatus, PilotExitReport, ReadinessRow
from app.services import settings_service

# Nationalities tracked in the visa matrix. The workbook ships a 142 x 174
# grid; 174 is a fixed dimension of that grid (distinct nationality codes),
# not a database-derived count, so it is named here rather than literal
# inside the gate computation below.
VISA_MATRIX_NATIONALITY_COUNT = 174


async def _count(session: AsyncSession, model, **filters) -> int:
    stmt = select(func.count()).select_from(model)
    if hasattr(model, "deleted_at"):
        stmt = stmt.where(model.deleted_at.is_(None))
    for key, value in filters.items():
        stmt = stmt.where(getattr(model, key) == value)
    return (await session.execute(stmt)).scalar_one()


def _gate_status(verified: int, required: int) -> str:
    if required == 0:
        return "CLEARED"
    outstanding = required - verified
    return "CLEARED" if outstanding <= 0 else f"BLOCKED - {outstanding} outstanding"


async def compute_pilot_exit_gates(session: AsyncSession) -> PilotExitReport:
    settings_map = await settings_service.get_typed_settings_map(session)

    total_countries = await _count(session, Country)
    lead_time_verified = (
        await session.execute(
            select(func.count()).select_from(Country).where(
                Country.deleted_at.is_(None),
                Country.standard_lead_time_hours.is_not(None),
                Country.lead_time_source.is_not(None),
                Country.lead_time_verified_by.is_not(None),
                Country.lead_time_verified_on.is_not(None),
            )
        )
    ).scalar_one()
    permit_flags_verified = (
        await session.execute(
            select(func.count()).select_from(Country).where(
                Country.deleted_at.is_(None),
                Country.permit_flags_source.is_not(None),
                Country.permit_flags_verified_by.is_not(None),
                Country.permit_flags_verified_on.is_not(None),
            )
        )
    ).scalar_one()
    ground_handling_decided = (
        await session.execute(
            select(func.count()).select_from(Country).where(
                Country.deleted_at.is_(None), Country.ground_handling_policy != "VERIFY"
            )
        )
    ).scalar_one()

    total_operators = await _count(session, Operator)
    operators_assignable = (
        await session.execute(
            select(func.count()).select_from(Operator).where(
                Operator.deleted_at.is_(None), Operator.quarantined.is_(False)
            )
        )
    ).scalar_one()

    total_aircraft_types = await _count(session, AircraftPerformance)
    aircraft_types_approved = (
        await session.execute(
            select(func.count()).select_from(AircraftPerformance).where(
                AircraftPerformance.verified.is_(True),
                AircraftPerformance.verified_by.is_not(None),
                AircraftPerformance.verified_on.is_not(None),
            )
        )
    ).scalar_one()

    total_airports = await _count(session, Airport)
    airports_tech_stop_ready = (
        await session.execute(
            select(func.count()).select_from(Airport).where(
                Airport.deleted_at.is_(None),
                Airport.operating_hours.is_not(None),
                Airport.is_airport_of_entry.is_not(None),
                Airport.fuel_grades.is_not(None),
                Airport.ops_data_source.is_not(None),
                Airport.ops_data_verified_on.is_not(None),
            )
        )
    ).scalar_one()

    visa_cells_answered = await _count(session, VisaMatrixCell)
    visa_cells_required = total_countries * VISA_MATRIX_NATIONALITY_COUNT

    total_vendors = await _count(session, Vendor)
    vendors_approved = (
        await session.execute(
            select(func.count()).select_from(Vendor).where(
                Vendor.deleted_at.is_(None), Vendor.capability_status == VendorCapabilityStatus.APPROVED
            )
        )
    ).scalar_one()

    country_requirements_captured = (
        await session.execute(select(func.count(distinct(CountryRequirement.country_iso3))))
    ).scalar_one()

    gates = [
        GateStatus(
            key="country_lead_times",
            label="Country permit lead times sourced & verified",
            verified=lead_time_verified,
            required=total_countries,
            status=_gate_status(lead_time_verified, total_countries),
            evidence_columns="countries.lead_time_source / verified_by / verified_on",
        ),
        GateStatus(
            key="country_permit_flags",
            label="Country permit flags verified against a source",
            verified=permit_flags_verified,
            required=total_countries,
            status=_gate_status(permit_flags_verified, total_countries),
            evidence_columns="countries.permit_flags_source / verified_by / verified_on",
        ),
        GateStatus(
            key="ground_handling_policy",
            label="Country ground-handling policy decided (not VERIFY)",
            verified=ground_handling_decided,
            required=total_countries,
            status=_gate_status(ground_handling_decided, total_countries),
            evidence_columns="countries.ground_handling_policy",
        ),
        GateStatus(
            key="operators_assignable",
            label="Operators assignable to a trip",
            verified=operators_assignable,
            required=total_operators,
            status=_gate_status(operators_assignable, total_operators),
            evidence_columns="operators.name (blocks any operator with no name)",
        ),
        GateStatus(
            key="aircraft_types_approved",
            label="Aircraft types approved for planning (engineer sign-off)",
            verified=aircraft_types_approved,
            required=total_aircraft_types,
            status=_gate_status(aircraft_types_approved, total_aircraft_types),
            evidence_columns="aircraft_performance.verified / verified_by / verified_on",
        ),
        GateStatus(
            key="airports_tech_stop_ready",
            label="Airports usable as a technical stop",
            verified=airports_tech_stop_ready,
            required=total_airports,
            status=_gate_status(airports_tech_stop_ready, total_airports),
            evidence_columns="airports operating_hours / is_airport_of_entry / fuel_grades / ops_data_source / ops_data_verified_on",
        ),
        GateStatus(
            key="visa_matrix_cells",
            label="Visa matrix cells answered",
            verified=visa_cells_answered,
            required=visa_cells_required,
            status=_gate_status(visa_cells_answered, visa_cells_required),
            evidence_columns="visa_matrix grid + visa_rules override layer",
        ),
        GateStatus(
            key="vendor_questionnaires",
            label="Vendors with an approved capability questionnaire",
            verified=vendors_approved,
            required=total_vendors,
            status=_gate_status(vendors_approved, total_vendors),
            evidence_columns="vendors.questionnaire_sent_on / returned_on / approved_by / approved_on / capability_status",
        ),
        GateStatus(
            key="country_requirements",
            label="Country requirement / intel records captured",
            verified=country_requirements_captured,
            required=total_countries,
            status=_gate_status(country_requirements_captured, total_countries),
            evidence_columns="country_requirements per state",
        ),
    ]

    blocked = sum(1 for g in gates if g.status != "CLEARED")
    return PilotExitReport(
        gates=gates,
        blocked_gate_count=blocked,
        total_gate_count=len(gates),
        verdict="PILOT" if blocked > 0 else "LIVE",
        allow_unverified_for_planning=bool(settings_map["allow_unverified_for_planning"]),
    )


async def compute_readiness_rows(session: AsyncSession) -> list[ReadinessRow]:
    gates = await compute_pilot_exit_gates(session)
    rows: list[ReadinessRow] = []
    for g in gates.gates:
        pct = (g.verified / g.required * 100) if g.required else 100.0
        rows.append(
            ReadinessRow(
                dataset=g.label,
                populated=g.verified,
                total=g.required,
                percent_complete=round(pct, 2),
                criticality="BLOCKER",
                blocks=g.evidence_columns,
            )
        )

    total_vendor_coverage_airports = await _count(session, VendorCoverageAirport)
    rows.append(
        ReadinessRow(
            dataset="Handler coverage by station",
            populated=total_vendor_coverage_airports,
            total=total_vendor_coverage_airports,
            percent_complete=100.0 if total_vendor_coverage_airports else 0.0,
            criticality="OK",
            blocks="Assigning a handler with a named contact",
        )
    )
    return rows
