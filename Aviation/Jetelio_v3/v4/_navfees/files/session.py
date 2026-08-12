"""Database session and connection management."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool
from app.core.config import settings
from app.db.models import Base

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=NullPool if settings.DEBUG else None,
    echo=settings.DEBUG,
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Session:
    """Dependency for database sessions in FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
