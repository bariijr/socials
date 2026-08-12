"""Nav fee (ANS overflight fee) computation — service layer. Assembles
per-FIR provider data and calls the pure formulas in app.domain.nav_fees,
matching the assembly-only pattern of app.services.permit_engine_service.

Per-FIR distance segmentation reuses Engine 1's route resolution
(app.services.routing_engine_service.RoutePlan): cumulative_nm is exactly
linear in sample index (see app.domain.great_circle.sample_great_circle_track),
so a FIR's chargeable distance is derived from its first_entry_index without
a second geometry pass.

A crossed FIR with no configured NavFeeProvider gets NO computed fee — not
a guessed one. An earlier version of this service filled the gap with a
fixed per-unit fallback rate; that produced plausible-looking but wrong
numbers (confirmed against a real Tanzania overflight: ~10x too high), which
is worse than showing nothing, since a wrong number can be mistaken for a
real quote. Every dollar figure here traces to an admin-entered
NavFeeProvider row; nothing is synthesized.

Fees sum across providers assuming a single reporting currency (USD) even
when a provider's own currency differs — the same "simplified USD equiv"
approximation the original _navfees prototype documented; there is no FX
conversion source wired into this system.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.nav_fees import FeeFormula, calculate_provider_fee
from app.domain.reference_status import NavFeeProviderStatus, resolve_nav_fee_provider_status
from app.models.nav_fee_provider import NavFeeProvider
from app.services.routing_engine_service import RoutePlan


@dataclass(frozen=True)
class NavFeeLineItem:
    fir_code: str
    fir_name: str | None
    provider_name: str | None
    formula: str | None
    distance_nm: float
    chargeable_distance_nm: float | None
    fee_usd: float | None
    status: str
    currency: str | None


@dataclass(frozen=True)
class NavFeesResult:
    mtow_known: bool
    # True only when every crossed FIR has a real configured provider —
    # subtotal/margin/total are None (not a partial guess) until then.
    fully_priced: bool
    items: list[NavFeeLineItem]
    subtotal_usd: float | None
    margin_percent: float
    margin_usd: float | None
    total_usd: float | None


def _nm_at_index(index: int, sample_point_count: int, distance_nm: float) -> float:
    if sample_point_count <= 1:
        return 0.0
    return (index / (sample_point_count - 1)) * distance_nm


async def _fetch_providers(session: AsyncSession, fir_codes: set[str]) -> dict[str, NavFeeProvider]:
    if not fir_codes:
        return {}
    rows = (
        await session.execute(select(NavFeeProvider).where(NavFeeProvider.fir_code.in_(fir_codes), NavFeeProvider.deleted_at.is_(None)))
    ).scalars().all()
    return {p.fir_code: p for p in rows}


async def compute_leg_nav_fees(
    session: AsyncSession,
    *,
    route: RoutePlan,
    aircraft_mtow_kg: float | None,
    margin_percent: float,
) -> NavFeesResult:
    if aircraft_mtow_kg is None:
        return NavFeesResult(
            mtow_known=False, fully_priced=False, items=[], subtotal_usd=None, margin_percent=margin_percent,
            margin_usd=None, total_usd=None,
        )

    providers = await _fetch_providers(session, {f.icao_fir_code for f in route.firs})

    items: list[NavFeeLineItem] = []
    for i, fir in enumerate(route.firs):
        start_nm = _nm_at_index(fir.first_entry_index, route.sample_point_count, route.distance_nm)
        end_nm = (
            _nm_at_index(route.firs[i + 1].first_entry_index, route.sample_point_count, route.distance_nm)
            if i + 1 < len(route.firs)
            else route.distance_nm
        )
        segment_distance_nm = max(end_nm - start_nm, 0.0)

        provider = providers.get(fir.icao_fir_code)
        if provider is not None:
            result = calculate_provider_fee(
                formula=FeeFormula(provider.formula),
                base_rate=provider.base_rate,
                mtow_kg=aircraft_mtow_kg,
                distance_nm=segment_distance_nm,
                minimum_fee=provider.minimum_fee,
                maximum_fee=provider.maximum_fee,
                vat_rate=provider.vat_rate,
                applies_50km_deduction=provider.applies_50km_deduction,
            )
            status = resolve_nav_fee_provider_status(
                source=provider.source, verified_by=provider.verified_by, verified_on=provider.verified_on
            )
            items.append(
                NavFeeLineItem(
                    fir_code=fir.icao_fir_code,
                    fir_name=fir.name,
                    provider_name=provider.provider_name,
                    formula=provider.formula,
                    distance_nm=segment_distance_nm,
                    chargeable_distance_nm=result.chargeable_distance_nm,
                    fee_usd=result.total_fee,
                    status=status,
                    currency=provider.currency,
                )
            )
        else:
            items.append(
                NavFeeLineItem(
                    fir_code=fir.icao_fir_code,
                    fir_name=fir.name,
                    provider_name=None,
                    formula=None,
                    distance_nm=segment_distance_nm,
                    chargeable_distance_nm=None,
                    fee_usd=None,
                    status=NavFeeProviderStatus.NO_PROVIDER_CONFIGURED,
                    currency=None,
                )
            )

    fully_priced = all(item.fee_usd is not None for item in items)
    if fully_priced:
        subtotal = round(sum(item.fee_usd for item in items), 2)
        margin = round(subtotal * (margin_percent / 100), 2)
        total = round(subtotal + margin, 2)
    else:
        subtotal = margin = total = None

    return NavFeesResult(
        mtow_known=True, fully_priced=fully_priced, items=items, subtotal_usd=subtotal,
        margin_percent=margin_percent, margin_usd=margin, total_usd=total,
    )
