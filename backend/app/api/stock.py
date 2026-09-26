from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import StockStatus, User
from app.schemas.common import Page, Pagination, pagination
from app.schemas.operation import OperationDetailOut
from app.schemas.stock import (
    AdjustRequest,
    AdjustResponse,
    StockLocationRowOut,
    StockRowOut,
)
from app.services import catalog, inventory
from app.services import stock as stock_service

router = APIRouter(prefix="/api/stock", tags=["stock"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=Page[StockRowOut])
def list_stock(
    search: str | None = Query(default=None),
    warehouse_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    status: StockStatus | None = Query(default=None),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> Page[StockRowOut]:
    items, total = stock_service.stock_rows(
        db,
        page,
        search=search,
        warehouse_id=warehouse_id,
        category_id=category_id,
        status=status,
    )
    return Page[StockRowOut](items=items, total=total)


@router.get("/{product_id}/locations", response_model=Page[StockLocationRowOut])
def list_product_locations(
    product_id: int,
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> Page[StockLocationRowOut]:
    catalog.get_product(db, product_id)
    items, total = stock_service.product_location_rows(db, product_id, page)
    return Page[StockLocationRowOut](items=items, total=total)


@router.post("/adjust", response_model=AdjustResponse)
def adjust_stock(
    payload: AdjustRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdjustResponse:
    changed, operation = inventory.adjust(
        db,
        current_user,
        product_id=payload.product_id,
        location_id=payload.location_id,
        counted_qty=payload.counted_qty,
        reason=payload.reason.value,
        note=payload.note,
    )
    db.commit()
    return AdjustResponse(
        changed=changed,
        # Adjustments never carry source availability: null / false per the contract.
        operation=OperationDetailOut.from_operation(operation) if operation else None,
    )
