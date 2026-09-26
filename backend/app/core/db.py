from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

#: Pin every session to UTC regardless of the server's or the client host's timezone.
#: psycopg returns TIMESTAMPTZ values in the session TimeZone, so without this the same
#: instant is handed back with different offsets on different deployments. The schemas
#: normalise on the way out as well (app.schemas.common.Timestamp); this keeps raw SQL,
#: psql sessions and anything bypassing the schemas consistent too.
CONNECT_ARGS = {"options": "-c timezone=UTC"}

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
    connect_args=CONNECT_ARGS,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
