# StockSense Backend

FastAPI + PostgreSQL implementation of [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).
SQLAlchemy 2 in sync mode, Alembic migrations, argon2 password hashing, JWT in an
httpOnly cookie.

## Prerequisites

- **Docker** — runs the dev and test PostgreSQL 16 containers (`docker-compose.yml` at the repo root)
- **[uv](https://docs.astral.sh/uv/)** — dependency management (`pyproject.toml` + `uv.lock`)
- Python 3.11+ (uv will fetch one if the system Python is older)

## Setup

```bash
# from the repo root
docker compose up -d --wait        # dev DB on :5432, test DB on :5433, waits for healthy
cp .env.example backend/.env       # the backend reads .env from backend/

cd backend
uv sync                            # creates .venv from uv.lock
uv run alembic upgrade head        # create the schema
uv run python -m scripts.seed      # baseline data, no stock
uv run python -m scripts.demo_data # realistic demo data for a walkthrough
```

`scripts/seed.py` is idempotent and creates no stock. `scripts/demo_data.py` refuses to
run twice (it exits 0 with "demo data already present") and builds everything through
`app/services`, never with raw inserts, so the ledger stays consistent.

## Run

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000/api
- Interactive docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health → `{"status":"ok","db":"ok"}`

The Vite frontend runs on :5173 and proxies `/api` here; `CORS_ORIGINS` also allows it
directly with credentials.

Demo login: `demo_user` / `Demo@12345`

```bash
curl -c jar -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login_id":"demo_user","password":"Demo@12345"}'
curl -b jar http://localhost:8000/api/dashboard
```

## Tests

```bash
cd backend
uv run pytest -q
```

Tests run against `TEST_DATABASE_URL` (:5433). The suite drops and recreates schema
`public`, runs every migration, then wraps each test in a transaction that is rolled
back. A few tests (reference allocation, reservation races, deadlock ordering) commit on
purpose across two connections, because row locking cannot be tested any other way; they
truncate on the way in and out.

## Ledger integrity check

```bash
cd backend
uv run python -m scripts.check_ledger     # "ledger OK" (exit 0) or every mismatch (exit 1)
```

Verifies, for every internal (product, location): moves in − moves out equals the cached
quant quantity, `reserved` equals the summed qty of ready outgoing lines from that
location, and no quant is negative. Safe to run against any environment.

## Migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "what changed"
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic check          # fails if models and migrations have drifted
```

Alembic does **not** autogenerate CHECK constraints or drop enum types on downgrade —
both are written by hand in the existing migrations. Check any new revision for the same.

## Environment variables

Copy `.env.example` to `backend/.env`. Every value has a working default for local
development except in production, where `SECRET_KEY` must be set.

| Variable | Meaning |
|---|---|
| `ENV` | `development`, `test` or `production`. Production requires a real `SECRET_KEY` and makes the auth cookie `Secure`. |
| `SECRET_KEY` | Signs JWTs (HS256) and keys the OTP HMAC. Use ≥32 bytes: PyJWT warns below that. Changing it invalidates every session and pending OTP. |
| `DATABASE_URL` | Dev database, `postgresql+psycopg://…`. |
| `TEST_DATABASE_URL` | Database pytest wipes and re-migrates. Must never point at real data. |
| `APP_TIMEZONE` | The zone "today" is evaluated in, for late/upcoming and move date filters. Default `Asia/Kolkata`. Stored timestamps are always UTC. |
| `TOKEN_TTL_HOURS` | Auth cookie and JWT lifetime. Default 8. |
| `OTP_TTL_MINUTES` | Password-reset code lifetime. Default 10 (our choice, not a standard). |
| `OTP_MAX_ATTEMPTS` | Wrong guesses allowed per code before it is dead. Default 5 (our choice). |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to send credentialed requests. Default `http://localhost:5173`. |
| `SMTP_HOST` | Leave empty in development and the reset code is logged to the console instead of emailed. |
| `SMTP_PORT` | Default 587. |
| `SMTP_USER` / `SMTP_PASSWORD` | Optional SMTP credentials. |
| `SMTP_FROM` | From address on outgoing mail. |
| `SMTP_TLS` | Issue `STARTTLS` before sending. Default true. |

## Architecture

### Stock is a ledger, not a number

`stock_moves` is an **insert-only** double-entry ledger: every row moves a quantity of one
product from one location to another. It is never UPDATEd or DELETEd — mistakes are
corrected with new documents. `stock_quants` is a *cached balance* per (product, internal
location), written in the same transaction as the moves it summarises.
`scripts/check_ledger.py` exists to prove the two still agree.

`app/services/inventory.py` is the **only** module allowed to write either table. It never
commits: the caller owns the transaction, which is how creating a product and booking its
opening stock land atomically.

### Virtual locations

Locations are either internal (real racks, belong to a warehouse) or virtual
(`warehouse_id IS NULL`): **Vendors**, **Customers** and **Inventory Adjustment**. Every
document is a move between locations, so stock entering or leaving the building is still
double-entry:

| Document | From | To |
|---|---|---|
| Receipt | Vendors | internal |
| Delivery | internal | Customers |
| Internal transfer | internal | internal |
| Adjustment (gain) | Inventory Adjustment | internal |
| Adjustment (loss) | internal | Inventory Adjustment |

The user never picks the virtual side; it is chosen from the document type. Only internal
locations appear in pickers, and only they get quant rows.

### State machine

`draft → ready → done`, with `waiting` when stock is short and `canceled` as an exit from
any pending state. Each action is one transaction that first locks the operation row
(`SELECT … FOR UPDATE`) and re-reads its status, so a double-click cannot validate twice.

- **todo** (draft): a receipt goes straight to `ready`. A delivery or transfer locks its
  source quants and reserves every line or none — all lines available → `ready`,
  otherwise `waiting` with nothing reserved.
- **check-availability** (waiting): the same attempt again; stays `waiting` on failure.
- **validate** (ready): source `quantity` and `reserved` go down, destination `quantity`
  goes up, one `stock_move` per line, status `done`.
- **cancel** (draft/waiting/ready): releases any reservation it held.

Adjustments are created already `done` by `POST /api/stock/adjust` and reject every action.

References (`WH/IN/0001`) are allocated at creation from the `sequences` row for
(warehouse, type), locked `FOR UPDATE`. A no-op adjustment consumes no reference.

### Locking

Quant rows are always locked in `(product_id, location_id)` order, so two documents
touching overlapping products cannot deadlock — the test suite proves this by removing the
sort and observing a real Postgres deadlock. `lock_quant` creates a missing row with
`INSERT … ON CONFLICT DO NOTHING` before locking it, so concurrent first-writers both win.

### Timestamps

Columns are `TIMESTAMPTZ` and always hold UTC. psycopg returns them in the *connection's*
session TimeZone, so the engine pins `-c timezone=UTC` on every connection **and** the
schemas serialize through one annotated type that converts to UTC and emits a trailing
`Z`. Naive datetimes are rejected rather than assigned a guessed zone.

### Layout

```
app/main.py         app wiring, CORS, /api/health
app/core/           config, db (engine/session), security, errors, clock
app/models/         SQLAlchemy models
app/schemas/        Pydantic request/response models
app/api/            routers: auth, warehouses, locations, categories, products,
                    stock, operations, moves, dashboard
app/services/       inventory.py (sole writer of stock), sequences, catalog,
                    stock, operations, moves, dashboard, auth, mail
alembic/            migrations
scripts/            seed.py, demo_data.py, check_ledger.py
tests/
```
