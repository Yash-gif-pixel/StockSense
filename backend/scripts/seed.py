"""Idempotent development seed: run it as often as you like.

Deliberately creates NO stock. Quantities only ever enter through
app/services/inventory.py, so the seeded warehouse starts empty.

    uv run python -m scripts.seed
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import (
    Category,
    Location,
    LocationType,
    OperationType,
    Product,
    ReferenceSequence,
    User,
    Warehouse,
)

DEMO_USER = {
    "login_id": "demo_user",
    "email": "demo@stocksense.local",
    "password": "Demo@12345",
}

VIRTUAL_LOCATIONS = [
    ("Vendors", "VEND", LocationType.vendor),
    ("Customers", "CUST", LocationType.customer),
    ("Inventory Adjustment", "ADJ", LocationType.adjustment),
]


def seed(db: Session) -> dict[str, int]:
    """Create the baseline dataset if missing. Returns what was created this run."""
    created: dict[str, int] = {}

    def mark(key: str) -> None:
        created[key] = created.get(key, 0) + 1

    # Virtual locations: one per non-internal type, no warehouse.
    for name, short_code, loc_type in VIRTUAL_LOCATIONS:
        if db.scalar(select(Location).where(Location.type == loc_type)) is None:
            db.add(
                Location(warehouse_id=None, name=name, short_code=short_code, type=loc_type)
            )
            mark("virtual_locations")

    warehouse = db.scalar(select(Warehouse).where(Warehouse.short_code == "WH"))
    if warehouse is None:
        warehouse = Warehouse(
            name="Main Warehouse", short_code="WH", address="Industrial Area, Pune"
        )
        db.add(warehouse)
        db.flush()
        mark("warehouses")

    for loc_name in ("Stock1", "Stock2"):
        exists = db.scalar(
            select(Location).where(
                Location.warehouse_id == warehouse.id, Location.short_code == loc_name
            )
        )
        if exists is None:
            db.add(
                Location(
                    warehouse_id=warehouse.id,
                    name=loc_name,
                    short_code=loc_name,
                    type=LocationType.internal,
                )
            )
            mark("internal_locations")

    for op_type in OperationType:
        exists = db.get(ReferenceSequence, (warehouse.id, op_type.value))
        if exists is None:
            db.add(
                ReferenceSequence(
                    warehouse_id=warehouse.id, op_type=op_type.value, next_value=1
                )
            )
            mark("sequences")

    categories: dict[str, Category] = {}
    for cat_name in ("Furniture", "Raw Material"):
        category = db.scalar(select(Category).where(Category.name == cat_name))
        if category is None:
            category = Category(name=cat_name)
            db.add(category)
            db.flush()
            mark("categories")
        categories[cat_name] = category

    for name, sku in (("Desk", "DESK001"), ("Table", "TABLE001")):
        if db.scalar(select(Product).where(Product.sku == sku)) is None:
            db.add(
                Product(
                    name=name,
                    sku=sku,
                    category_id=categories["Furniture"].id,
                    uom="Unit",
                    unit_cost=Decimal("3000.00"),
                    min_qty=None,
                    active=True,
                )
            )
            mark("products")

    if db.scalar(select(User).where(User.login_id == DEMO_USER["login_id"])) is None:
        db.add(
            User(
                login_id=DEMO_USER["login_id"],
                email=DEMO_USER["email"].lower(),
                password_hash=hash_password(DEMO_USER["password"]),
            )
        )
        mark("users")

    db.flush()
    return created


def main() -> None:
    with SessionLocal() as db:
        created = seed(db)
        db.commit()
    if created:
        print("seeded:", ", ".join(f"{k}={v}" for k, v in sorted(created.items())))
    else:
        print("seeded: nothing to do, database already up to date")


if __name__ == "__main__":
    main()
