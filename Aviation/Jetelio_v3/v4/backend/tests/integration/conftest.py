"""Integration tests need a real PostgreSQL + PostGIS database (Geometry
columns have no SQLite equivalent). Point TEST_DATABASE_URL at one — the
`db` service from docker-compose.yml works:

    TEST_DATABASE_URL=postgresql+asyncpg://jetelio:<password>@localhost:15432/jetelio_v4_test pytest tests/integration
"""

import itertools
import os
import random
import string
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core import storage
from app.database import Base, get_db
from app.main import app as fastapi_app
from app.models.country import Country
from app.services import aircraft_document_type_service, document_template_service, person_role_service, settings_service

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://jetelio:devpass@localhost:15432/jetelio_v4_test"
)


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(TEST_DATABASE_URL, future=True, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=eng, expire_on_commit=False)
    async with session_factory() as s:
        await settings_service.ensure_seeded(s)
        await document_template_service.ensure_seeded(s)
        await aircraft_document_type_service.ensure_seeded(s)
        await person_role_service.ensure_seeded(s)
        await s.commit()
    # The ASGITransport client fixture below never triggers app.main's
    # lifespan (no on-startup hook runs under it), so the document-storage
    # bucket needs the same manual one-time setup as settings seeding above.
    await storage.ensure_bucket_exists()

    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine):
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as s:
        yield s
        await s.rollback()


@pytest_asyncio.fixture
async def client(engine):
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as s:
            yield s
            await s.commit()

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def unique_iso3():
    return uuid.uuid4().hex[:3].upper()


@pytest_asyncio.fixture
async def draw_unique_iso3(session):
    """Returns draw(n) -> list[str] of n fresh iso3 codes guaranteed not to
    collide with anything already in the DB (committed by an earlier test
    in this session, or otherwise). Plain uuid4().hex[:3] draws from only
    4096 combinations; with a dozen-plus committing fixtures across the
    suite now sharing that pool, collisions became real and — because
    countries.iso3 is a real unique PK regardless of which transaction
    wrote it — broke unrelated tests too (see git history: a collision in
    one committing fixture's Country insert failed a completely different,
    non-committing test elsewhere that happened to draw the same code).
    """
    existing = {row[0] for row in (await session.execute(select(Country.iso3))).all()}

    def _draw(n: int = 1) -> list[str]:
        codes: list[str] = []
        while len(codes) < n:
            code = "".join(random.choices(string.ascii_uppercase, k=3))
            if code not in existing:
                existing.add(code)
                codes.append(code)
        return codes

    return _draw


_geo_region_counter = itertools.count()


@pytest.fixture
def geo_region_base_lon():
    """A fresh, non-overlapping base longitude for tests that seed
    CountryGeometry polygons and then COMMIT (rather than rely on
    session.rollback() for isolation — needed whenever the `client`
    fixture, on its own DB connection, must see the seeded data).

    Committed geometry is visible to every later ST_Contains query for the
    rest of the test session regardless of which test wrote it, so reusing
    fixed coordinates across committing fixtures silently pollutes any
    other test whose track happens to cross the same square. 8-degree
    spacing keeps each caller's few-degree-wide polygons clear of its
    neighbors' and of the -15..15 range fixed test fixtures elsewhere use.

    Cycled through two disjoint bands rather than growing unbounded —
    real bug hit building the reroute-track map preview: once enough
    committing fixtures accumulate in one test session the raw counter
    pushes past ±180°, and sample_great_circle_track's spherical bearing
    math (atan2-based, always resolves into -180..180) silently wraps a
    route's *sampled* points into that range while the committed
    polygon/airport coordinates stay exactly as given — decoupling the
    track from the geometry meant to be under it. Both bands also keep a
    5°+ margin clear of the -15..15 range fixed (non-committing) test
    fixtures use elsewhere, and of ±180 itself. 36 slots is far beyond
    this suite's actual committing-fixture count per run, so the cycle
    should never actually repeat a slot in practice — it just keeps the
    *ceiling* safe as more committing fixtures get added over time.
    """
    n = next(_geo_region_counter) % 36
    if n < 18:
        return -168.0 + n * 8.0
    return 24.0 + (n - 18) * 8.0
