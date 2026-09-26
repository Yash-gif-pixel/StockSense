from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Category
from app.schemas.catalog import CategoryIn, CategoryOut
from app.schemas.common import Page, Pagination, pagination
from app.services import catalog

router = APIRouter(
    prefix="/api/categories", tags=["categories"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=Page[CategoryOut])
def list_categories(
    page: Pagination = Depends(pagination), db: Session = Depends(get_db)
) -> Page[CategoryOut]:
    total = db.scalar(select(func.count()).select_from(Category)) or 0
    categories = db.scalars(
        select(Category).order_by(Category.name, Category.id)
        .limit(page.limit)
        .offset(page.offset)
    ).all()
    return Page[CategoryOut](
        items=[CategoryOut.model_validate(c) for c in categories], total=total
    )


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryIn, db: Session = Depends(get_db)) -> Category:
    category = catalog.create_category(db, payload.name)
    db.commit()
    return category
