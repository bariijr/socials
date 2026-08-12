from geoalchemy2 import Geometry
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin


class CountryGeometry(Base, UUIDPKMixin, TimestampMixin):
    """Natural Earth 10m admin-0 country polygons. One row per iso3 — NOT
    the workbook's 0.5-degree raster (accurate to ~30 NM); this is real
    polygon geometry resolved with ST_Contains by Engine 1.
    """

    __tablename__ = "country_geometry"

    iso3: Mapped[str] = mapped_column(String(3), ForeignKey("countries.iso3", ondelete="CASCADE"), unique=True)
    geom: Mapped[str] = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=False)
    source: Mapped[str] = mapped_column(String(300), nullable=False, default="Natural Earth 10m admin-0 countries")


class FirBoundary(Base, UUIDPKMixin, TimestampMixin):
    """Flight Information Region polygons. Falls back to state airspace
    (i.e. no FIR match) where a region is unmapped — never fabricated.
    """

    __tablename__ = "fir_boundaries"

    icao_fir_code: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    geom: Mapped[str] = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=False)
    source: Mapped[str] = mapped_column(String(300), nullable=False)
