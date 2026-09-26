from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import MoveDirection
from app.schemas.common import Page, Pagination, pagination
from app.schemas.operation import MoveOut
from app.services import moves as moves_service

router = APIRouter(prefix="/api/moves", tags=["moves"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=Page[MoveOut])
def list_moves(
    search: str | None = Query(default=None),
    product_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    direction: MoveDirection | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> Page[MoveOut]:
    items, total = moves_service.list_moves(
        db,
        page,
        search=search,
        product_id=product_id,
        location_id=location_id,
        direction=direction,
        date_from=date_from,
        date_to=date_to,
    )
    return Page[MoveOut](items=[MoveOut.from_move(move) for move in items], total=total)
