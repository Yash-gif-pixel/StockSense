from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Warehouse
from app.schemas.catalog import WarehouseIn, WarehouseOut
from app.schemas.common import Page, Pagination, pagination
from app.services import catalog

router = APIRouter(
    prefix="/api/warehouses", tags=["warehouses"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=Page[WarehouseOut])
def list_warehouses(
    page: Pagination = Depends(pagination), db: Session = Depends(get_db)
) -> Page[WarehouseOut]:
    total = db.scalar(select(func.count()).select_from(Warehouse)) or 0
    warehouses = db.scalars(
        select(Warehouse).order_by(Warehouse.name, Warehouse.id)
        .limit(page.limit)
        .offset(page.offset)
    ).all()
    return Page[WarehouseOut](
        items=[WarehouseOut.model_validate(w) for w in warehouses], total=total
    )


@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse(payload: WarehouseIn, db: Session = Depends(get_db)) -> Warehouse:
    warehouse = catalog.create_warehouse(
        db, payload.name, payload.short_code, payload.address
    )
    db.commit()
    return warehouse


@router.put("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(
    warehouse_id: int, payload: WarehouseIn, db: Session = Depends(get_db)
) -> Warehouse:
    warehouse = catalog.update_warehouse(
        db, warehouse_id, payload.name, payload.short_code, payload.address
    )
    db.commit()
    return warehouse
