from sqlalchemy import func, select

from app.models import (
    Category,
    Location,
    Product,
    ReferenceSequence,
    StockMove,
    StockQuant,
    User,
    Warehouse,
)
from scripts.seed import seed


def _counts(db) -> dict[str, int]:
    return {
        model.__name__: db.scalar(select(func.count()).select_from(model))
        for model in (
            Warehouse,
            Location,
            Category,
            Product,
            ReferenceSequence,
            User,
            StockQuant,
            StockMove,
        )
    }


def test_seed_is_idempotent(db) -> None:
    first = seed(db)
    after_first = _counts(db)

    second = seed(db)
    after_second = _counts(db)

    assert after_first == after_second
    assert second == {}, f"second run created rows: {second}"
    assert first == {
        "virtual_locations": 3,
        "warehouses": 1,
        "internal_locations": 2,
        "sequences": 4,
        "categories": 2,
        "products": 2,
        "users": 1,
    }
    # 3 virtual + Stock1 + Stock2, and no stock whatsoever.
    assert after_first["Location"] == 5
    assert after_first["StockQuant"] == 0
    assert after_first["StockMove"] == 0


def test_seeded_location_full_names(db) -> None:
    seed(db)
    stock1 = db.scalar(select(Location).where(Location.short_code == "Stock1"))
    vendors = db.scalar(select(Location).where(Location.short_code == "VEND"))
    assert stock1.full_name == "WH/Stock1"
    assert vendors.full_name == "Vendors"
