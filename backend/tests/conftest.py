"""
Shared pytest fixtures for MediBridge Connect backend tests.

Sets up an isolated SQLite test database and a FastAPI TestClient
with the get_db dependency overridden for every test session.
"""

import os
import sys
from pathlib import Path

# Ensure the backend package is importable regardless of cwd
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app, _rate_limit_store
from app.core.database import Base, get_db

# IMPORTANT: `app` in main.py is socketio.ASGIApp(sio, other_asgi_app=api).
# `dependency_overrides` lives on the inner FastAPI `api` instance, not on the
# socketio wrapper. We must import `api` separately for the override.
from app.main import api  # the FastAPI instance (not the socketio wrapper)

# ── Test database (SQLite file, shared across the session) ────────────
SQLALCHEMY_TEST_URL = "sqlite:///./test_medibridge.db"

test_engine = create_engine(
    SQLALCHEMY_TEST_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    """Replace the real PostgreSQL session with a SQLite test session."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Apply the dependency override on the FastAPI `api` instance (not the socketio wrapper)
api.dependency_overrides[get_db] = override_get_db


# ── Session-scoped: create tables once, drop after all tests ──────────
@pytest.fixture(scope="session", autouse=True)
def create_test_tables():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    # Dispose engine to release Windows file lock before deleting
    test_engine.dispose()
    db_path = Path("./test_medibridge.db")
    if db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            pass  # Windows may still hold the file; ignore on CI


# ── Function-scoped: provide a fresh TestClient per test ──────────────
@pytest.fixture()
def client():
    """Return a FastAPI TestClient backed by the SQLite test database."""
    with TestClient(app) as c:
        yield c


# ── Function-scoped: provide a raw DB session for direct data setup ───
@pytest.fixture()
def db():
    """Yield a SQLAlchemy session for seeding test data."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


# ── Function-scoped: wipe all user rows between tests ─────────────────
@pytest.fixture(autouse=True)
def clean_users():
    """Delete all users before each test to keep tests independent."""
    from app.models.models import User
    session = TestingSessionLocal()
    session.query(User).delete()
    session.commit()
    session.close()
    yield


# ── Autouse: reset rate-limit store before every test ─────────────────
@pytest.fixture(autouse=True)
def reset_rate_limit():
    """Clear the in-memory rate-limit store so tests don't bleed into each other."""
    _rate_limit_store.clear()
    yield
    _rate_limit_store.clear()
