from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Operation, OperationType, User
from app.schemas.common import Page, Pagination, pagination
from app.schemas.operation import (
    OperationDetailOut,
    OperationIn,
    OperationSummaryOut,
)
from app.services import inventory
from app.services import operations as operations_service

router = APIRouter(
    prefix="/api/operations", tags=["operations"], dependencies=[Depends(get_current_user)]
)


def _detail(db: Session, operation: Operation) -> OperationDetailOut:
    return OperationDetailOut.from_operation(
        operation, operations_service.line_availability(db, operation)
    )


def _line_inputs(payload: OperationIn) -> list[inventory.LineInput]:
    return [
        inventory.LineInput(product_id=line.product_id, qty=line.qty)
        for line in payload.lines
    ]


@router.get("", response_model=Page[OperationSummaryOut])
def list_operations(
    type: OperationType | None = Query(default=None),
    status: str | None = Query(default=None, description="comma-separated statuses"),
    warehouse_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    late: bool | None = Query(default=None),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> Page[OperationSummaryOut]:
    operations, total = operations_service.list_operations(
        db,
        page,
        op_type=type,
        statuses=operations_service.parse_statuses(status),
        warehouse_id=warehouse_id,
        category_id=category_id,
        search=search,
        late=late,
    )
    return Page[OperationSummaryOut](
        items=[OperationSummaryOut.model_validate(op) for op in operations], total=total
    )


@router.get("/{operation_id}", response_model=OperationDetailOut)
def get_operation(operation_id: int, db: Session = Depends(get_db)) -> OperationDetailOut:
    operation = operations_service.get_operation(db, operation_id)
    return _detail(db, operation)


@router.post("", response_model=OperationDetailOut, status_code=status.HTTP_201_CREATED)
def create_operation(
    payload: OperationIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OperationDetailOut:
    operation = inventory.create_operation(
        db,
        current_user,
        op_type=payload.type,
        scheduled_date=payload.scheduled_date,
        lines=_line_inputs(payload),
        contact=payload.contact,
        delivery_address=payload.delivery_address,
        source_location_id=payload.source_location_id,
        dest_location_id=payload.dest_location_id,
    )
    db.commit()
    return _detail(db, operation)


@router.put("/{operation_id}", response_model=OperationDetailOut)
def update_operation(
    operation_id: int, payload: OperationIn, db: Session = Depends(get_db)
) -> OperationDetailOut:
    operation = inventory.update_operation(
        db,
        operation_id,
        op_type=payload.type,
        scheduled_date=payload.scheduled_date,
        lines=_line_inputs(payload),
        contact=payload.contact,
        delivery_address=payload.delivery_address,
        source_location_id=payload.source_location_id,
        dest_location_id=payload.dest_location_id,
    )
    db.commit()
    return _detail(db, operation)


@router.post("/{operation_id}/todo", response_model=OperationDetailOut)
def mark_todo(operation_id: int, db: Session = Depends(get_db)) -> OperationDetailOut:
    operation = inventory.mark_todo(db, operation_id)
    db.commit()
    return _detail(db, operation)


@router.post("/{operation_id}/check-availability", response_model=OperationDetailOut)
def check_availability(
    operation_id: int, db: Session = Depends(get_db)
) -> OperationDetailOut:
    operation = inventory.check_availability(db, operation_id)
    db.commit()
    return _detail(db, operation)


@router.post("/{operation_id}/validate", response_model=OperationDetailOut)
def validate_operation(
    operation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OperationDetailOut:
    operation = inventory.validate_operation(db, current_user, operation_id)
    db.commit()
    return _detail(db, operation)


@router.post("/{operation_id}/cancel", response_model=OperationDetailOut)
def cancel_operation(operation_id: int, db: Session = Depends(get_db)) -> OperationDetailOut:
    operation = inventory.cancel_operation(db, operation_id)
    db.commit()
    return _detail(db, operation)
