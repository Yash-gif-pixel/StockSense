from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Location, LocationType
from app.schemas.catalog import LocationIn, LocationOut, LocationUpdate
from app.schemas.common import Page, Pagination, pagination
from app.services import catalog

router = APIRouter(
    prefix="/api/locations", tags=["locations"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=Page[LocationOut])
def list_locations(
    warehouse_id: int | None = Query(default=None),
    type: LocationType = Query(default=LocationType.internal),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> Page[LocationOut]:
    query = select(Location).where(Location.type == type)
    if warehouse_id is not None:
        query = query.where(Location.warehouse_id == warehouse_id)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    locations = db.scalars(
        query.order_by(Location.warehouse_id, Location.short_code, Location.id)
        .limit(page.limit)
        .offset(page.offset)
    ).all()
    return Page[LocationOut](
        items=[LocationOut.model_validate(loc) for loc in locations], total=total
    )


@router.post("", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(payload: LocationIn, db: Session = Depends(get_db)) -> Location:
    location = catalog.create_location(
        db, payload.warehouse_id, payload.name, payload.short_code
    )
    db.commit()
    return location


@router.put("/{location_id}", response_model=LocationOut)
def update_location(
    location_id: int, payload: LocationUpdate, db: Session = Depends(get_db)
) -> Location:
    location = catalog.update_location(db, location_id, payload.name, payload.short_code)
    db.commit()
    return location
