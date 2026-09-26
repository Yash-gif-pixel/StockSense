from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.schemas.dashboard import DashboardOut
from app.services import dashboard as dashboard_service

router = APIRouter(
    prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=DashboardOut)
def get_dashboard(
    warehouse_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> DashboardOut:
    return dashboard_service.build_dashboard(
        db, warehouse_id=warehouse_id, category_id=category_id
    )
