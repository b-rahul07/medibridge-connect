"""
Database engine, session factory, and Base model.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# Render provides postgres:// but SQLAlchemy 2.x requires postgresql://
_db_url = settings.DATABASE_URL
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    _db_url,
    # ── Connection Pooling (Phase 3 — Deployment Robustness) ──────────
    pool_pre_ping=True,   # Recycle stale connections before use
    pool_size=5,          # Persistent connections kept in the pool
    max_overflow=10,      # Extra connections allowed under burst load
    pool_timeout=30,      # Seconds to wait for a connection before raising
    pool_recycle=1800,    # Recycle connections every 30 min (avoids DB idle-timeout drops)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
