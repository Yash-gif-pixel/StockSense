"""Document reference allocation.

References look like WH/IN/0001 and are handed out by locking the sequences row for
(warehouse, op_type), so two concurrent transactions can never take the same number.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError
from app.models import OperationType, ReferenceSequence, Warehouse

# The sequences table keys on the operation type; the reference uses these short codes.
REFERENCE_CODES = {
    OperationType.receipt: "IN",
    OperationType.delivery: "OUT",
    OperationType.internal: "INT",
    OperationType.adjustment: "ADJ",
}


def next_reference(db: Session, warehouse_id: int, op_type: OperationType) -> str:
    """Allocate the next reference for this warehouse and type.

    Locks the sequences row for the rest of the caller's transaction. A missing row is
    an error: sequences are created with the warehouse, never lazily here.
    """
    row = db.scalar(
        select(ReferenceSequence)
        .where(
            ReferenceSequence.warehouse_id == warehouse_id,
            ReferenceSequence.op_type == op_type.value,
        )
        .with_for_update()
    )
    if row is None:
        raise ConflictError(
            f"No reference sequence for warehouse {warehouse_id} and type {op_type.value}"
        )

    short_code = db.scalar(select(Warehouse.short_code).where(Warehouse.id == warehouse_id))
    if short_code is None:
        raise ConflictError(f"Warehouse {warehouse_id} does not exist")

    number = row.next_value
    row.next_value = number + 1
    db.flush()
    return f"{short_code}/{REFERENCE_CODES[op_type]}/{number:04d}"
