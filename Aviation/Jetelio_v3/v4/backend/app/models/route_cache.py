from sqlalchemy import Float, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin


class RouteCache(Base, UUIDPKMixin, TimestampMixin):
    """Engine 1's cache on (dep_icao, arr_icao) — aircraft-independent, so
    EET (which depends on aircraft cruise speed) is computed on demand and
    never cached here. Keyed with rule_engine_version so a route resolved
    under an older engine build stays reproducible even after the engine
    changes; a version bump naturally produces a fresh row rather than
    silently overwriting history.
    """

    __tablename__ = "route_cache"
    __table_args__ = (UniqueConstraint("dep_icao", "arr_icao", "rule_engine_version", name="uq_route_cache_leg_version"),)

    dep_icao: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    arr_icao: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    rule_engine_version: Mapped[str] = mapped_column(String(20), nullable=False)

    distance_nm: Mapped[float] = mapped_column(Float, nullable=False)
    sample_point_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # [{iso3, first_entry_index}, ...] ordered by first entry along the track.
    states: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)
    # [{icao_fir_code, name, first_entry_index}, ...] ordered the same way.
    firs: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<RouteCache {self.dep_icao}-{self.arr_icao} v{self.rule_engine_version}>"
