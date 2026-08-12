"""CAA permit fees + nafisat cost categories — service layer. Same
assembly-only pattern as app.services.nav_fee_service, reusing the exact
formula machinery from app.domain.nav_fees, but keyed by (country, permit
type) rather than FIR — CAA/nafisat fees are billed per permit line item
(one overflight/landing/ground-handling permit per country), not per FIR
crossing distance.

Nav fees (app.services.nav_fee_service) stay a separate, FIR-keyed
computation — this system has no FIR-to-country mapping in its data model
(a FirBoundary row carries no country_iso3), so nav fees are deliberately
NOT merged into this per-country table rather than fabricating that join.
A leg's total operational cost is nav_fees.total_usd + permit_fees.total_usd
(both null-gated independently) — see LegFeasibilityResult.

A permit line item with no configured CAA_FEE or NAFISAT provider for its
country/permit-type gets that component as None, never a guessed number —
identical discipline to nav_fee_service (see that module's docstring for
the concrete Tanzania-overflight incident this pattern exists to prevent).
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.nav_fees import FeeFormula, calculate_provider_fee
from app.domain.reference_status import NavFeeProviderStatus, resolve_nav_fee_provider_status
from app.models.permit_fee_provider import PermitFeeCategory, PermitFeeProvider, PermitFeeType
from app.services.permit_engine_service import GroundHandlingOrderResult, LandingPermit, OverflightPermit, PermitPlan
from app.services.routing_engine_service import RoutePlan


@dataclass(frozen=True)
class PermitFeeLineItem:
    country_iso3: str
    country_name: str
    permit_type: str  # OVERFLIGHT / LANDING / GROUND_HANDLING
    caa_fee_usd: float | None
    caa_status: str
    nafisat_fee_usd: float | None
    nafisat_status: str
    jtl_fee_usd: float
    # None until both caa_fee_usd and nafisat_fee_usd are resolved — never a
    # partial sum presented as if it were the real total.
    line_total_usd: float | None


@dataclass(frozen=True)
class PermitFeesResult:
    mtow_known: bool
    fully_priced: bool
    items: list[PermitFeeLineItem]
    caa_subtotal_usd: float | None
    nafisat_subtotal_usd: float | None
    jtl_subtotal_usd: float
    total_usd: float | None


def _nm_at_index(index: int, sample_point_count: int, distance_nm: float) -> float:
    if sample_point_count <= 1:
        return 0.0
    return (index / (sample_point_count - 1)) * distance_nm


def _state_distances(route: RoutePlan) -> dict[str, float]:
    """Per-country overflight-crossing distance, computed the same way
    nav_fee_service derives per-FIR distance — needed only for OVERFLIGHT
    line items that use a distance-based formula; LANDING/GROUND_HANDLING
    fees are never distance-based, so those line items pass 0.
    """
    distances: dict[str, float] = {}
    for i, state in enumerate(route.states):
        start_nm = _nm_at_index(state.first_entry_index, route.sample_point_count, route.distance_nm)
        end_nm = (
            _nm_at_index(route.states[i + 1].first_entry_index, route.sample_point_count, route.distance_nm)
            if i + 1 < len(route.states)
            else route.distance_nm
        )
        distances[state.iso3] = max(end_nm - start_nm, 0.0)
    return distances


async def _fetch_providers(
    session: AsyncSession, keys: set[tuple[str, str]]
) -> dict[tuple[str, str, str], PermitFeeProvider]:
    if not keys:
        return {}
    countries = {k[0] for k in keys}
    rows = (
        await session.execute(
            select(PermitFeeProvider).where(PermitFeeProvider.country_iso3.in_(countries), PermitFeeProvider.deleted_at.is_(None))
        )
    ).scalars().all()
    return {(p.country_iso3, p.permit_type, p.fee_category): p for p in rows}


def _price_component(
    provider: PermitFeeProvider | None, *, mtow_kg: float, distance_nm: float
) -> tuple[float | None, str]:
    if provider is None:
        return None, NavFeeProviderStatus.NO_PROVIDER_CONFIGURED
    result = calculate_provider_fee(
        formula=FeeFormula(provider.formula),
        base_rate=provider.base_rate,
        mtow_kg=mtow_kg,
        distance_nm=distance_nm,
        minimum_fee=provider.minimum_fee,
        maximum_fee=provider.maximum_fee,
        vat_rate=provider.vat_rate,
        applies_50km_deduction=False,
    )
    status = resolve_nav_fee_provider_status(
        source=provider.source, verified_by=provider.verified_by, verified_on=provider.verified_on
    )
    return result.total_fee, status


async def compute_leg_permit_fees(
    session: AsyncSession,
    *,
    route: RoutePlan,
    permits: PermitPlan,
    aircraft_mtow_kg: float | None,
    jtl_service_fee_usd: float,
) -> PermitFeesResult:
    if aircraft_mtow_kg is None:
        return PermitFeesResult(
            mtow_known=False, fully_priced=False, items=[], caa_subtotal_usd=None, nafisat_subtotal_usd=None,
            jtl_subtotal_usd=0.0, total_usd=None,
        )

    state_distances = _state_distances(route)

    entries: list[tuple[OverflightPermit | LandingPermit | GroundHandlingOrderResult, str, float]] = [
        (p, PermitFeeType.OVERFLIGHT.value, state_distances.get(p.country_iso3, 0.0)) for p in permits.overflight_permits
    ] + [
        (p, PermitFeeType.LANDING.value, 0.0) for p in permits.landing_permits
    ] + [
        (g, PermitFeeType.GROUND_HANDLING.value, 0.0) for g in permits.ground_handling_orders
    ]

    keys = {(e.country_iso3, permit_type) for e, permit_type, _ in entries}
    providers = await _fetch_providers(session, keys)

    items: list[PermitFeeLineItem] = []
    for entry, permit_type, distance_nm in entries:
        caa = providers.get((entry.country_iso3, permit_type, PermitFeeCategory.CAA_FEE.value))
        nafisat = providers.get((entry.country_iso3, permit_type, PermitFeeCategory.NAFISAT.value))

        caa_fee, caa_status = _price_component(caa, mtow_kg=aircraft_mtow_kg, distance_nm=distance_nm)
        nafisat_fee, nafisat_status = _price_component(nafisat, mtow_kg=aircraft_mtow_kg, distance_nm=distance_nm)

        line_total = (
            round(caa_fee + nafisat_fee + jtl_service_fee_usd, 2) if caa_fee is not None and nafisat_fee is not None else None
        )

        items.append(
            PermitFeeLineItem(
                country_iso3=entry.country_iso3,
                country_name=entry.country_name,
                permit_type=permit_type,
                caa_fee_usd=caa_fee,
                caa_status=caa_status,
                nafisat_fee_usd=nafisat_fee,
                nafisat_status=nafisat_status,
                jtl_fee_usd=jtl_service_fee_usd,
                line_total_usd=line_total,
            )
        )

    # Vacuously true for an empty items list — matches nav_fee_service's
    # convention: no line items means nothing unpriced, not "unknown".
    fully_priced = all(item.line_total_usd is not None for item in items)
    jtl_subtotal = round(jtl_service_fee_usd * len(items), 2)
    if fully_priced:
        caa_subtotal = round(sum(item.caa_fee_usd for item in items), 2)
        nafisat_subtotal = round(sum(item.nafisat_fee_usd for item in items), 2)
        total = round(caa_subtotal + nafisat_subtotal + jtl_subtotal, 2)
    else:
        caa_subtotal = nafisat_subtotal = total = None

    return PermitFeesResult(
        mtow_known=True, fully_priced=fully_priced, items=items, caa_subtotal_usd=caa_subtotal,
        nafisat_subtotal_usd=nafisat_subtotal, jtl_subtotal_usd=jtl_subtotal, total_usd=total,
    )
