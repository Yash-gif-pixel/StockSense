"""Test fixtures.

The engine in app.core.db is built at import time from settings.DATABASE_URL, so the
settings object is pointed at the test database BEFORE app.core.db is imported. Import
order in this file is therefore significant.
"""

import os
from collections.abc import Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[1]

settings.ENV = "test"
settings.DATABASE_URL = settings.TEST_DATABASE_URL

from app.core.db import engine, get_db  # noqa: E402  (must follow the override above)


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Wipe the test database and run every migration once per session."""
    assert settings.DATABASE_URL == settings.TEST_DATABASE_URL, "refusing to wipe a non-test DB"

    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))

    os.environ["ALEMBIC_DATABASE_URL"] = settings.TEST_DATABASE_URL
    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")


@pytest.fixture
def db(migrated_database: None) -> Generator[Session, None, None]:
    """A session inside a transaction that is always rolled back.

    join_transaction_mode="create_savepoint" means code under test can call
    session.commit() without escaping this rollback.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        autoflush=False,
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Generator["TestClient", None, None]:  # noqa: F821
    from fastapi.testclient import TestClient

    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
