"""Realistic demo data for judging.

Everything goes through app/services, never a raw INSERT into stock_moves or
stock_quants, so the ledger stays internally consistent and scripts/check_ledger.py
passes afterwards.

    uv run python -m scripts.demo_data

Refuses to run twice: if any operation exists it prints a message and exits 0.
"""

import sys
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import today
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

# sku, location short_code, counted quantity. Deliberately leaves Aluminium Sheet and
# Screws Box at zero (out of stock) and Table and Wooden Plank below their minimum (low).
OPENING_STOCK = [
    ("DESK001", "Stock1", "40"),
    ("DESK001", "Stock2", "10"),
    ("TABLE001", "Stock1", "12"),
    ("CHAIR001", "Stock1", "60"),
    ("SHELF001", "Stock1", "8"),
    ("STEEL001", "Stock1", "500"),
    ("STEEL001", "Stock2", "250"),
    ("PLANK001", "Stock2", "30"),
]


def _already_populated(db: Session) -> bool:
    return (db.scalar(select(func.count()).select_from(Operation)) or 0) > 0


def build(db: Session) -> list[str]:
    """Create the demo dataset. Returns the references created, in order."""
    seed(db)
    db.flush()

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

    stock1, stock2 = location("Stock1"), location("Stock2")
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

    # --- opening stock, as counted adjustments ----------------------------
    for sku, short_code, quantity in OPENING_STOCK:
        changed, operation = inventory.adjust(
            db,
            user,
            product_id=product(sku).id,
            location_id=location(short_code).id,
            counted_qty=Decimal(quantity),
            reason=AdjustReason.count.value,
            note="Opening count",
        )
        if changed:
            references.append(operation.reference)

    # --- documents ---------------------------------------------------------
    current = today()

    def make(op_type: OperationType, scheduled: date, lines, **kwargs) -> Operation:
        operation = inventory.create_operation(
            db,
            user,
            op_type=op_type,
            scheduled_date=scheduled,
            lines=[
                inventory.LineInput(product_id=product(sku).id, qty=Decimal(qty))
                for sku, qty in lines
            ],
            **kwargs,
        )
        references.append(operation.reference)
        return operation

    def advance(operation: Operation, to: str) -> None:
        if to in ("ready", "done", "canceled_from_ready"):
            inventory.mark_todo(db, operation.id)
        if to == "waiting":
            inventory.mark_todo(db, operation.id)
        if to == "done":
            inventory.validate_operation(db, user, operation.id)
        if to in ("canceled", "canceled_from_ready"):
            inventory.cancel_operation(db, operation.id)

    # Receipts. A receipt goes straight to ready when marked to do, so it never sits in
    # waiting; that status is only reachable by an outgoing document short of stock.
    advance(
        make(
            OperationType.receipt,
            current - timedelta(days=6),
            [("STEEL001", "200")],
            contact="Tata Steel Ltd",
            dest_location_id=stock1.id,
        ),
        "done",
    )
    advance(
        make(
            OperationType.receipt,
            current + timedelta(days=3),
            [("CHAIR001", "25")],
            contact="Godrej Interio",
            dest_location_id=stock1.id,
        ),
        "ready",
    )
    make(
        OperationType.receipt,
        current,
        [("ALUM001", "50")],
        contact="Hindalco",
        dest_location_id=stock1.id,
    )  # draft
    make(
        OperationType.receipt,
        current - timedelta(days=5),
        [("SCREW001", "40")],
        contact="Pune Fasteners",
        dest_location_id=stock1.id,
    )  # late draft
    advance(
        make(
            OperationType.receipt,
            current + timedelta(days=1),
            [("SHELF001", "10")],
            contact="Nilkamal",
            dest_location_id=stock1.id,
        ),
        "canceled",
    )

    # Deliveries.
    advance(
        make(
            OperationType.delivery,
            current - timedelta(days=4),
            [("DESK001", "5")],
            contact="Ashok Motors",
            delivery_address="MIDC Bhosari, Pune 411026",
            source_location_id=stock1.id,
        ),
        "done",
    )
    advance(
        make(
            OperationType.delivery,
            current,
            [("STEEL001", "100")],
            contact="Kirloskar Brothers",
            delivery_address="Kothrud, Pune 411038",
            source_location_id=stock1.id,
        ),
        "ready",
    )
    advance(
        make(
            OperationType.delivery,
            current + timedelta(days=2),
            [("ALUM001", "30")],
            contact="Bajaj Auto",
            delivery_address="Akurdi, Pune 411035",
            source_location_id=stock1.id,
        ),
        "waiting",
    )  # genuinely short: nothing in stock
    make(
        OperationType.delivery,
        current - timedelta(days=2),
        [("TABLE001", "5")],
        contact="Symbiosis University",
        delivery_address="Lavale, Pune 412115",
        source_location_id=stock1.id,
    )  # late draft
    advance(
        make(
            OperationType.delivery,
            current + timedelta(days=5),
            [("CHAIR001", "10")],
            contact="Infosys Pune",
            delivery_address="Hinjewadi Phase 2, Pune 411057",
            source_location_id=stock1.id,
        ),
        "canceled_from_ready",
    )
    make(
        OperationType.delivery,
        current + timedelta(days=6),
        [("SHELF001", "2")],
        contact="Fergusson College",
        delivery_address="FC Road, Pune 411004",
        source_location_id=stock1.id,
    )  # upcoming draft

    # Internal transfers.
    advance(
        make(
            OperationType.internal,
            current - timedelta(days=3),
            [("STEEL001", "100")],
            source_location_id=stock1.id,
            dest_location_id=stock2.id,
        ),
        "done",
    )
    advance(
        make(
            OperationType.internal,
            current + timedelta(days=1),
            [("DESK001", "10")],
            source_location_id=stock1.id,
            dest_location_id=stock2.id,
        ),
        "ready",
    )

    # Adjustments with the other reasons.
    for sku, short_code, counted, reason, note in [
        ("PLANK001", "Stock2", "27", AdjustReason.damaged.value, "Three planks warped in storage"),
        ("SHELF001", "Stock1", "7", AdjustReason.lost.value, "One unit unaccounted for"),
    ]:
        changed, operation = inventory.adjust(
            db,
            user,
            product_id=product(sku).id,
            location_id=location(short_code).id,
            counted_qty=Decimal(counted),
            reason=reason,
            note=note,
        )
        if changed:
            references.append(operation.reference)

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

    print(f"created {len(references)} documents across {counts['operations']} operations")
    print(f"products: {counts['products']}")
    print("references:")
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
