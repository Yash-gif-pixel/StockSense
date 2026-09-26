from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.errors import ValidationError
from app.models import AdjustReason, Location, Product, User
from app.schemas.catalog import ProductIn, ProductOut, ProductUpdate
from app.schemas.common import Page, Pagination, pagination
from app.services import catalog, inventory

router = APIRouter(
    prefix="/api/products", tags=["products"], dependencies=[Depends(get_current_user)]
)

INITIAL_STOCK_NOTE = "Initial stock"


@router.get("", response_model=Page[ProductOut])
def list_products(
    search: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    active: bool | None = Query(default=None),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> Page[ProductOut]:
    query = select(Product)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Product.name.ilike(pattern), Product.sku.ilike(pattern)))
    if category_id is not None:
        query = query.where(Product.category_id == category_id)
    # Omitting active means "only the ones still in use".
    query = query.where(Product.active.is_(True if active is None else active))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    products = db.scalars(
        query.order_by(Product.name, Product.id).limit(page.limit).offset(page.offset)
    ).all()
    return Page[ProductOut](
        items=[ProductOut.model_validate(p) for p in products], total=total
    )


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Product:
    """Initial stock is booked as a done adjustment in the same transaction."""
    wants_stock = payload.initial_qty is not None and payload.initial_qty > 0
    if wants_stock:
        if payload.initial_location_id is None:
            raise ValidationError(
                "An initial location is required to record initial stock",
                fields={"initial_location_id": "Required when initial_qty is given"},
            )
        location = db.get(Location, payload.initial_location_id)
        if location is None or not location.is_internal:
            raise ValidationError(
                "Initial stock must go into an internal location",
                fields={"initial_location_id": "Must be an internal location"},
            )

    product = catalog.create_product(
        db,
        payload.name,
        payload.sku,
        payload.category_id,
        payload.uom,
        payload.unit_cost,
        payload.min_qty,
    )

    if wants_stock:
        inventory.adjust(
            db,
            current_user,
            product_id=product.id,
            location_id=payload.initial_location_id,
            counted_qty=payload.initial_qty,
            reason=AdjustReason.count.value,
            note=INITIAL_STOCK_NOTE,
        )

    db.commit()
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)
) -> Product:
    product = catalog.update_product(
        db,
        product_id,
        payload.name,
        payload.sku,
        payload.category_id,
        payload.uom,
        payload.unit_cost,
        payload.min_qty,
        payload.active,
    )
    db.commit()
    return product
