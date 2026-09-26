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


CREDENTIALS = {
    "login_id": "test_user",
    "email": "test@example.com",
    "password": "Valid@Pass1",
}


@pytest.fixture
def credentials() -> dict[str, str]:
    return dict(CREDENTIALS)


@pytest.fixture
def registered_client(client, credentials):
    response = client.post("/api/auth/signup", json=credentials)
    assert response.status_code == 201, response.text
    return client


@pytest.fixture
def logged_in_client(registered_client, credentials):
    response = registered_client.post(
        "/api/auth/login",
        json={"login_id": credentials["login_id"], "password": credentials["password"]},
    )
    assert response.status_code == 200, response.text
    return registered_client


@pytest.fixture
def sent_otps(monkeypatch) -> list[tuple[str, str]]:
    """Capture what would have been emailed. The router calls mail.send_otp_email
    through the module, so patching the attribute here is what the app sees."""
    from app.services import mail

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(mail, "send_otp_email", lambda to, otp: sent.append((to, otp)))
    return sent


@pytest.fixture
def seed_data(db):
    """Run the seed and hand back the objects tests keep reaching for."""
    from types import SimpleNamespace

    from sqlalchemy import select

    from app.models import Category, Location, LocationType, Product, Warehouse
    from scripts.seed import seed

    seed(db)
    db.flush()

    def location(short_code):
        return db.scalar(select(Location).where(Location.short_code == short_code))

    return SimpleNamespace(
        warehouse=db.scalar(select(Warehouse).where(Warehouse.short_code == "WH")),
        stock1=location("Stock1"),
        stock2=location("Stock2"),
        vendors=db.scalar(select(Location).where(Location.type == LocationType.vendor)),
        customers=db.scalar(select(Location).where(Location.type == LocationType.customer)),
        adjustment=db.scalar(
            select(Location).where(Location.type == LocationType.adjustment)
        ),
        furniture=db.scalar(select(Category).where(Category.name == "Furniture")),
        desk=db.scalar(select(Product).where(Product.sku == "DESK001")),
        table=db.scalar(select(Product).where(Product.sku == "TABLE001")),
    )


@pytest.fixture
def api(logged_in_client, seed_data):
    """An authenticated client against a seeded database."""
    return logged_in_client


def truncate_all() -> None:
    """Wipe every table on the test database, for tests that must really commit."""
    from sqlalchemy import text

    from app.core.db import engine
    from app.models import Base

    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def committed_seed(migrated_database):
    """Seeded, COMMITTED data plus a session factory, for genuine concurrency tests.

    These cannot use the usual rolled-back session: a second connection would not see
    uncommitted rows. Ids are handed back rather than ORM objects, because the setup
    session is closed before the test runs.
    """
    from types import SimpleNamespace

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models import Location, LocationType, Product, User, Warehouse
    from scripts.seed import seed

    truncate_all()
    with SessionLocal() as setup:
        seed(setup)
        setup.commit()

        def location_id(short_code):
            return setup.scalar(select(Location.id).where(Location.short_code == short_code))

        data = SimpleNamespace(
            sessions=SessionLocal,
            warehouse_id=setup.scalar(
                select(Warehouse.id).where(Warehouse.short_code == "WH")
            ),
            stock1_id=location_id("Stock1"),
            stock2_id=location_id("Stock2"),
            customers_id=setup.scalar(
                select(Location.id).where(Location.type == LocationType.customer)
            ),
            vendors_id=setup.scalar(
                select(Location.id).where(Location.type == LocationType.vendor)
            ),
            desk_id=setup.scalar(select(Product.id).where(Product.sku == "DESK001")),
            table_id=setup.scalar(select(Product.id).where(Product.sku == "TABLE001")),
            user_id=setup.scalar(select(User.id).where(User.login_id == "demo_user")),
        )
    yield data
    truncate_all()
