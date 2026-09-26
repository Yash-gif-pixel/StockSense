"""Warehouse, location, category and product rules.

Uniqueness is checked here so the caller gets a 409 naming the offending field, with
the database constraint as the backstop for a lost race.
"""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models import (
    Category,
    Location,
    LocationType,
    OperationType,
    Product,
    ReferenceSequence,
    Warehouse,
)

STOCK_LOCATION_NAME = "Stock"


def _flush(db: Session, message: str) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(message) from exc


def get_warehouse(db: Session, warehouse_id: int) -> Warehouse:
    warehouse = db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise NotFoundError("Warehouse not found")
    return warehouse


def create_warehouse(db: Session, name: str, short_code: str, address: str | None) -> Warehouse:
    """Creates the warehouse, its default Stock location and all four sequences."""
    short_code = short_code.upper()
    if db.scalar(select(Warehouse.id).where(Warehouse.short_code == short_code)) is not None:
        raise ConflictError(
            "That short code is already used by another warehouse",
            fields={"short_code": "Already in use"},
        )

    warehouse = Warehouse(name=name, short_code=short_code, address=address)
    db.add(warehouse)
    _flush(db, "That short code is already used by another warehouse")

    db.add(
        Location(
            warehouse_id=warehouse.id,
            name=STOCK_LOCATION_NAME,
            short_code=STOCK_LOCATION_NAME,
            type=LocationType.internal,
        )
    )
    for op_type in OperationType:
        db.add(
            ReferenceSequence(
                warehouse_id=warehouse.id, op_type=op_type.value, next_value=1
            )
        )
    db.flush()
    return warehouse


def update_warehouse(
    db: Session, warehouse_id: int, name: str, short_code: str, address: str | None
) -> Warehouse:
    """A short_code change does not rewrite existing references: they are stored strings."""
    warehouse = get_warehouse(db, warehouse_id)
    short_code = short_code.upper()

    clash = db.scalar(
        select(Warehouse.id).where(
            Warehouse.short_code == short_code, Warehouse.id != warehouse_id
        )
    )
    if clash is not None:
        raise ConflictError(
            "That short code is already used by another warehouse",
            fields={"short_code": "Already in use"},
        )

    warehouse.name = name
    warehouse.short_code = short_code
    warehouse.address = address
    _flush(db, "That short code is already used by another warehouse")
    return warehouse


def get_location(db: Session, location_id: int) -> Location:
    location = db.get(Location, location_id)
    if location is None:
        raise NotFoundError("Location not found")
    return location


def _assert_location_code_free(
    db: Session, warehouse_id: int, short_code: str, exclude_id: int | None = None
) -> None:
    query = select(Location.id).where(
        Location.warehouse_id == warehouse_id, Location.short_code == short_code
    )
    if exclude_id is not None:
        query = query.where(Location.id != exclude_id)
    if db.scalar(query) is not None:
        raise ConflictError(
            "That short code is already used in this warehouse",
            fields={"short_code": "Already in use in this warehouse"},
        )


def create_location(db: Session, warehouse_id: int, name: str, short_code: str) -> Location:
    get_warehouse(db, warehouse_id)
    _assert_location_code_free(db, warehouse_id, short_code)

    location = Location(
        warehouse_id=warehouse_id,
        name=name,
        short_code=short_code,
        type=LocationType.internal,
    )
    db.add(location)
    _flush(db, "That short code is already used in this warehouse")
    return location


def update_location(db: Session, location_id: int, name: str, short_code: str) -> Location:
    location = get_location(db, location_id)
    if not location.is_internal:
        raise ValidationError("Only internal locations can be edited")

    _assert_location_code_free(db, location.warehouse_id, short_code, exclude_id=location.id)
    location.name = name
    location.short_code = short_code
    _flush(db, "That short code is already used in this warehouse")
    return location


def create_category(db: Session, name: str) -> Category:
    """Names are unique case-insensitively, checked here rather than in the database."""
    existing = db.scalar(
        select(Category.id).where(func.lower(Category.name) == name.lower())
    )
    if existing is not None:
        raise ConflictError(
            "A category with that name already exists",
            fields={"name": "Already in use"},
        )
    category = Category(name=name)
    db.add(category)
    _flush(db, "A category with that name already exists")
    return category


def get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    return product


def normalise_sku(sku: str) -> str:
    return sku.strip().upper()


def _assert_sku_free(db: Session, sku: str, exclude_id: int | None = None) -> None:
    query = select(Product.id).where(Product.sku == sku)
    if exclude_id is not None:
        query = query.where(Product.id != exclude_id)
    if db.scalar(query) is not None:
        raise ConflictError(
            "That SKU is already used by another product",
            fields={"sku": "Already in use"},
        )


def _check_category(db: Session, category_id: int | None) -> None:
    if category_id is not None and db.get(Category, category_id) is None:
        raise NotFoundError("Category not found")


def create_product(
    db: Session,
    name: str,
    sku: str,
    category_id: int | None,
    uom: str,
    unit_cost: Decimal,
    min_qty: Decimal | None,
) -> Product:
    sku = normalise_sku(sku)
    _assert_sku_free(db, sku)
    _check_category(db, category_id)

    product = Product(
        name=name,
        sku=sku,
        category_id=category_id,
        uom=uom,
        unit_cost=unit_cost,
        min_qty=min_qty,
    )
    db.add(product)
    _flush(db, "That SKU is already used by another product")
    return product


def update_product(
    db: Session,
    product_id: int,
    name: str,
    sku: str,
    category_id: int | None,
    uom: str,
    unit_cost: Decimal,
    min_qty: Decimal | None,
    active: bool,
) -> Product:
    product = get_product(db, product_id)
    sku = normalise_sku(sku)
    _assert_sku_free(db, sku, exclude_id=product.id)
    _check_category(db, category_id)

    product.name = name
    product.sku = sku
    product.category_id = category_id
    product.uom = uom
    product.unit_cost = unit_cost
    product.min_qty = min_qty
    product.active = active
    _flush(db, "That SKU is already used by another product")
    return product
