"""search_airports ranking — task #90: ICAO prefix match first, then IATA,
then city, then everything else (name/substring), not a plain alphabetical
list. A dispatcher typing a known code expects that airport first.
"""

import uuid

import pytest

from app.models.airport import Airport
from app.services import feasibility_iq_service


def _icao(tag: str = "") -> str:
    return (tag + uuid.uuid4().hex[:4].upper())[:4]


class TestSearchAirportsRanking:
    @pytest.mark.asyncio
    async def test_icao_prefix_match_ranks_first(self, session):
        query = uuid.uuid4().hex[:3].upper()
        icao_hit = Airport(icao=f"{query}9", iata=None, name="Zzz Name", city="Nowhere", lat=0, lon=0)
        name_only_hit = Airport(icao=_icao("Z"), iata=None, name=f"{query} Regional Airport", city="Elsewhere", lat=0, lon=0)
        session.add_all([name_only_hit, icao_hit])
        await session.commit()

        results = await feasibility_iq_service.search_airports(session, query)
        icaos = [r.icao for r in results]
        assert icaos.index(icao_hit.icao) < icaos.index(name_only_hit.icao)

    @pytest.mark.asyncio
    async def test_iata_prefix_ranks_before_city_and_name(self, session):
        query = uuid.uuid4().hex[:3].upper()
        iata_hit = Airport(icao=_icao("D"), iata=query, name="Zzz Name", city="Nowhere", lat=0, lon=0)
        city_hit = Airport(icao=_icao("E"), iata=None, name="Yyy Name", city=f"{query} City", lat=0, lon=0)
        name_hit = Airport(icao=_icao("F"), iata=None, name=f"Regional {query} Airport", city="Elsewhere", lat=0, lon=0)
        session.add_all([name_hit, city_hit, iata_hit])
        await session.commit()

        results = await feasibility_iq_service.search_airports(session, query)
        icaos = [r.icao for r in results]
        assert icaos.index(iata_hit.icao) < icaos.index(city_hit.icao) < icaos.index(name_hit.icao)

    @pytest.mark.asyncio
    async def test_city_still_matches_even_though_not_previously_searched(self, session):
        query = uuid.uuid4().hex[:4].upper()
        city_only_hit = Airport(icao=_icao("G"), iata=None, name="Unrelated Name", city=f"{query}ville", lat=0, lon=0)
        session.add(city_only_hit)
        await session.commit()

        results = await feasibility_iq_service.search_airports(session, query)
        assert any(r.icao == city_only_hit.icao for r in results)
