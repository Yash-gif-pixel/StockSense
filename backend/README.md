# StockSense Backend

FastAPI + PostgreSQL implementation of `docs/API_CONTRACT.md`. SQLAlchemy 2 in sync mode,
Alembic migrations, argon2 password hashing, JWT in an httpOnly cookie.

Stock is a double-entry ledger: `stock_moves` is insert-only and `stock_quants` is a cached
balance for internal locations, written in the same transaction. `app/services/inventory.py`
is the only module allowed to write either table.

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) for dependency management (`pyproject.toml` + `uv.lock`)
- Docker (for the dev and test Postgres containers)

## Setup

```bash
# from the repo root
docker compose up -d                 # dev DB on :5432, test DB on :5433
cp .env.example backend/.env         # the backend reads .env from backend/

cd backend
uv sync                              # creates .venv from uv.lock
uv run alembic upgrade head          # create the schema
uv run python -m scripts.seed        # idempotent demo data (no stock)
```

## Run

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000/api
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health -> `{"status":"ok","db":"ok"}`

The Vite frontend runs on :5173 and proxies `/api` here; `CORS_ORIGINS` also allows it
directly with credentials.

Demo login after seeding: `demo_user` / `Demo@12345`

## Tests

```bash
cd backend
uv run pytest -q
```

Tests run against `TEST_DATABASE_URL` (:5433). The suite drops and recreates schema
`public`, runs every migration, then wraps each test in a transaction that is rolled back,
so real row locking is exercised.

## Migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "what changed"
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic check          # fails if models and migrations have drifted
```

## Layout

```
app/main.py         app wiring, CORS, /api/health
app/core/           config (pydantic-settings), db (engine/session), security, errors
app/models/         SQLAlchemy models
app/schemas/        Pydantic request/response models
app/api/            routers
app/services/       inventory.py (sole writer of stock), sequences, auth, mail
alembic/            migrations
scripts/seed.py     idempotent demo data
tests/
```
