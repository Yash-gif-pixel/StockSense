"""Realistic demo data for judging.

Everything goes through app/services, never a raw INSERT or UPDATE against stock_moves
or stock_quants, so the ledger stays consistent and scripts/check_ledger.py passes.

    uv run python -m scripts.demo_data

Refuses to run twice: if any operation exists it prints a message and exits 0.

Documents are spread over the last 14 days and created in strict chronological order, so
row ids ascend with time and the move history looks like a fortnight of real trading. The
back-dating uses the services' occurred_at parameter, which no router and no request
schema exposes.
"""

import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import today
from app.core.config import settings
from app.core.db import SessionLocal
from app.models import (
    AdjustReason,
    Category,
    Location,
    Operation,
    OperationType,
    Product,
    User,
    Warehouse,
)
from app.services import catalog, dashboard, inventory
from scripts.seed import DEMO_USER, seed

# name, sku, category, uom, unit_cost, min_qty
PRODUCTS = [
    ("Office Chair", "CHAIR001", "Furniture", "Unit", "4500.00", "10"),
    ("Bookshelf", "SHELF001", "Furniture", "Unit", "5200.00", "5"),
    ("Steel Rod", "STEEL001", "Raw Material", "kg", "85.50", "100"),
    ("Wooden Plank", "PLANK001", "Raw Material", "Unit", "220.00", "50"),
    ("Aluminium Sheet", "ALUM001", "Raw Material", "kg", "310.75", "25"),
    ("Screws Box", "SCREW001", "Raw Material", "Box", "150.00", "20"),
]

# The seeded products have no minimum; give them one so statuses are meaningful.
SEEDED_MINIMUMS = {"DESK001": "15", "TABLE001": "20"}


@dataclass(frozen=True)
class Moment:
    """A business-hours instant, expressed as days before today in APP_TIMEZONE."""

    days_ago: int
    hour: int
    minute: int = 0

    def resolve(self, current: date) -> datetime:
        day = current - timedelta(days=self.days_ago)
        return datetime.combine(day, time(self.hour, self.minute), tzinfo=settings.timezone)


@dataclass(frozen=True)
class Opening:
    """An opening-stock count."""

    at: Moment
    sku: str
    location: str
    counted: str


@dataclass(frozen=True)
class Document:
    at: Moment
    op_type: OperationType
    scheduled_in_days: int  # relative to today; negative is in the past
    lines: list[tuple[str, str]]
    outcome: str  # draft | ready | waiting | done | canceled | canceled_from_ready
    validated_at: Moment | None = None
    contact: str | None = None
    delivery_address: str | None = None
    source: str | None = None
    dest: str | None = None


@dataclass(frozen=True)
class Correction:
    """A later adjustment with a reason other than a plain count."""

    at: Moment
    sku: str
    location: str
    counted: str
    reason: str
    note: str


# Deliberately leaves Aluminium Sheet and Screws Box at zero (out of stock), and Table
# and Wooden Plank below their minimum (low).
OPENING_STOCK = [
    Opening(Moment(14, 9, 30), "DESK001", "Stock1", "40"),
    Opening(Moment(14, 9, 45), "DESK001", "Stock2", "10"),
    Opening(Moment(14, 10, 0), "TABLE001", "Stock1", "12"),
    Opening(Moment(14, 10, 20), "CHAIR001", "Stock1", "60"),
    Opening(Moment(13, 9, 35), "SHELF001", "Stock1", "8"),
    Opening(Moment(13, 9, 50), "STEEL001", "Stock1", "500"),
    Opening(Moment(13, 10, 5), "STEEL001", "Stock2", "250"),
    Opening(Moment(13, 10, 25), "PLANK001", "Stock2", "30"),
]

# In chronological order of creation. A receipt goes straight to ready when marked to do,
# so it never sits in waiting; that status is only reachable by an outgoing document short
# of stock (the Aluminium Sheet delivery below).
TIMELINE = [
    Document(
        at=Moment(12, 10, 15),
        op_type=OperationType.receipt,
        scheduled_in_days=-12,
        lines=[("STEEL001", "200")],
        outcome="done",
        validated_at=Moment(12, 14, 30),
        contact="Tata Steel Ltd",
        dest="Stock1",
    ),
    Document(
        at=Moment(11, 11, 0),
        op_type=OperationType.delivery,
        scheduled_in_days=-10,
        lines=[("DESK001", "5")],
        outcome="done",
        validated_at=Moment(10, 15, 20),
        contact="Ashok Motors",
        delivery_address="MIDC Bhosari, Pune 411026",
        source="Stock1",
    ),
    Document(
        at=Moment(9, 9, 45),
        op_type=OperationType.internal,
        scheduled_in_days=-9,
        lines=[("STEEL001", "100")],
        outcome="done",
        validated_at=Moment(9, 16, 0),
        source="Stock1",
        dest="Stock2",
    ),
    Document(
        at=Moment(8, 11, 20),
        op_type=OperationType.delivery,
        scheduled_in_days=-8,
        lines=[("TABLE001", "2")],
        outcome="done",
        validated_at=Moment(8, 16, 40),
        contact="Pune Municipal Corporation",
        delivery_address="Shivajinagar, Pune 411005",
        source="Stock1",
    ),
    # --- the two non-count corrections land here (see CORRECTIONS) ---
    Document(
        at=Moment(5, 10, 20),
        op_type=OperationType.receipt,
        scheduled_in_days=-5,
        lines=[("SCREW001", "40")],
        outcome="draft",  # late receipt: overdue and never processed
        contact="Pune Fasteners",
        dest="Stock1",
    ),
    Document(
        at=Moment(4, 14, 0),
        op_type=OperationType.delivery,
        scheduled_in_days=-2,
        lines=[("TABLE001", "5")],
        outcome="draft",  # late delivery
        contact="Symbiosis University",
        delivery_address="Lavale, Pune 412115",
        source="Stock1",
    ),
    Document(
        at=Moment(3, 11, 30),
        op_type=OperationType.delivery,
        scheduled_in_days=0,
        lines=[("STEEL001", "100")],
        outcome="ready",
        contact="Kirloskar Brothers",
        delivery_address="Kothrud, Pune 411038",
        source="Stock1",
    ),
    Document(
        at=Moment(3, 16, 45),
        op_type=OperationType.receipt,
        scheduled_in_days=3,
        lines=[("CHAIR001", "25")],
        outcome="ready",  # upcoming
        contact="Godrej Interio",
        dest="Stock1",
    ),
    Document(
        at=Moment(2, 9, 50),
        op_type=OperationType.delivery,
        scheduled_in_days=2,
        lines=[("ALUM001", "30")],
        outcome="waiting",  # genuinely short: nothing in stock
        contact="Bajaj Auto",
        delivery_address="Akurdi, Pune 411035",
        source="Stock1",
    ),
    Document(
        at=Moment(2, 13, 15),
        op_type=OperationType.receipt,
        scheduled_in_days=1,
        lines=[("SHELF001", "10")],
        outcome="canceled",
        contact="Nilkamal",
        dest="Stock1",
    ),
    Document(
        at=Moment(1, 10, 40),
        op_type=OperationType.delivery,
        scheduled_in_days=5,
        lines=[("CHAIR001", "10")],
        outcome="canceled_from_ready",
        contact="Infosys Pune",
        delivery_address="Hinjewadi Phase 2, Pune 411057",
        source="Stock1",
    ),
    Document(
        at=Moment(1, 15, 30),
        op_type=OperationType.receipt,
        scheduled_in_days=0,
        lines=[("ALUM001", "50")],
        outcome="draft",
        contact="Hindalco",
        dest="Stock1",
    ),
    Document(
        at=Moment(1, 16, 10),
        op_type=OperationType.delivery,
        scheduled_in_days=6,
        lines=[("SHELF001", "2")],
        outcome="draft",  # upcoming
        contact="Fergusson College",
        delivery_address="FC Road, Pune 411004",
        source="Stock1",
    ),
    Document(
        at=Moment(1, 17, 0),
        op_type=OperationType.internal,
        scheduled_in_days=1,
        lines=[("DESK001", "10")],
        outcome="ready",
        source="Stock1",
        dest="Stock2",
    ),
]

CORRECTIONS = [
    Correction(
        Moment(7, 12, 30),
        "PLANK001",
        "Stock2",
        "27",
        AdjustReason.damaged.value,
        "Three planks warped in storage",
    ),
    Correction(
        Moment(6, 15, 10),
        "SHELF001",
        "Stock1",
        "7",
        AdjustReason.lost.value,
        "One unit unaccounted for",
    ),
]


def _already_populated(db: Session) -> bool:
    return (db.scalar(select(func.count()).select_from(Operation)) or 0) > 0


def build(db: Session) -> list[str]:
    """Create the demo dataset. Returns the references created, in chronological order."""
    seed(db)
    db.flush()

    current = today()
    user = db.scalar(select(User).where(User.login_id == DEMO_USER["login_id"]))
    warehouse = db.scalar(select(Warehouse).where(Warehouse.short_code == "WH"))
    categories = {
        name: db.scalar(select(Category).where(Category.name == name))
        for name in ("Furniture", "Raw Material")
    }

    def location(short_code: str) -> Location:
        return db.scalar(
            select(Location).where(
                Location.warehouse_id == warehouse.id, Location.short_code == short_code
            )
        )

    def product(sku: str) -> Product:
        return db.scalar(select(Product).where(Product.sku == sku))

    references: list[str] = []

    # --- catalogue ---------------------------------------------------------
    for name, sku, category_name, uom, unit_cost, min_qty in PRODUCTS:
        catalog.create_product(
            db,
            name=name,
            sku=sku,
            category_id=categories[category_name].id,
            uom=uom,
            unit_cost=Decimal(unit_cost),
            min_qty=Decimal(min_qty),
        )
    for sku, min_qty in SEEDED_MINIMUMS.items():
        existing = product(sku)
        catalog.update_product(
            db,
            existing.id,
            name=existing.name,
            sku=existing.sku,
            category_id=existing.category_id,
            uom=existing.uom,
            unit_cost=existing.unit_cost,
            min_qty=Decimal(min_qty),
            active=True,
        )
    db.flush()

    def record_adjustment(at: Moment, sku: str, short_code: str, counted: str, reason: str, note: str):
        changed, operation = inventory.adjust(
            db,
            user,
            product_id=product(sku).id,
            location_id=location(short_code).id,
            counted_qty=Decimal(counted),
            reason=reason,
            note=note,
            occurred_at=at.resolve(current),
        )
        if changed:
            references.append(operation.reference)

    # --- everything below runs in strict chronological order ---------------
    # Opening stock first, as counted adjustments.
    for opening in OPENING_STOCK:
        record_adjustment(
            opening.at,
            opening.sku,
            opening.location,
            opening.counted,
            AdjustReason.count.value,
            "Opening count",
        )

    # Documents and corrections, merged by the moment they happened.
    corrections = list(CORRECTIONS)
    events: list[tuple[int, int, int, object]] = [
        (-doc.at.days_ago, doc.at.hour, doc.at.minute, doc) for doc in TIMELINE
    ] + [(-c.at.days_ago, c.at.hour, c.at.minute, c) for c in corrections]
    events.sort(key=lambda item: item[:3])

    for *_ordering, event in events:
        if isinstance(event, Correction):
            record_adjustment(
                event.at, event.sku, event.location, event.counted, event.reason, event.note
            )
            continue

        doc: Document = event
        operation = inventory.create_operation(
            db,
            user,
            op_type=doc.op_type,
            scheduled_date=current + timedelta(days=doc.scheduled_in_days),
            lines=[
                inventory.LineInput(product_id=product(sku).id, qty=Decimal(qty))
                for sku, qty in doc.lines
            ],
            contact=doc.contact,
            delivery_address=doc.delivery_address,
            source_location_id=location(doc.source).id if doc.source else None,
            dest_location_id=location(doc.dest).id if doc.dest else None,
            occurred_at=doc.at.resolve(current),
        )
        references.append(operation.reference)

        if doc.outcome in ("ready", "waiting", "done", "canceled_from_ready"):
            inventory.mark_todo(db, operation.id)
        if doc.outcome == "done":
            assert doc.validated_at is not None, f"{operation.reference} needs a validation time"
            inventory.validate_operation(
                db, user, operation.id, occurred_at=doc.validated_at.resolve(current)
            )
        if doc.outcome in ("canceled", "canceled_from_ready"):
            inventory.cancel_operation(db, operation.id)

    db.flush()
    return references


def main() -> int:
    with SessionLocal() as db:
        if _already_populated(db):
            print("demo data already present")
            return 0

        references = build(db)
        db.commit()

        summary = dashboard.build_dashboard(db)
        counts = {
            "products": db.scalar(select(func.count()).select_from(Product)),
            "operations": db.scalar(select(func.count()).select_from(Operation)),
        }

    print(f"created {counts['operations']} operations over the last 14 days")
    print(f"products: {counts['products']}")
    print("references, oldest first:")
    for reference in references:
        print(f"  {reference}")
    print("dashboard:")
    print(f"  receipts   {summary.receipts.model_dump()}")
    print(f"  deliveries {summary.deliveries.model_dump()}")
    print(f"  internal   {summary.internal.model_dump()}")
    print(f"  products   {summary.products.model_dump()}")
    print(f"login: {DEMO_USER['login_id']} / {DEMO_USER['password']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
