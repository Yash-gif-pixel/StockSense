import enum


class LocationType(str, enum.Enum):
    internal = "internal"
    vendor = "vendor"
    customer = "customer"
    adjustment = "adjustment"


class OperationType(str, enum.Enum):
    receipt = "receipt"
    delivery = "delivery"
    internal = "internal"
    adjustment = "adjustment"


class OperationStatus(str, enum.Enum):
    draft = "draft"
    waiting = "waiting"
    ready = "ready"
    done = "done"
    canceled = "canceled"


class MoveDirection(str, enum.Enum):
    """Derived from the move's locations; never stored."""

    in_ = "in"
    out = "out"
    internal = "internal"


class AdjustReason(str, enum.Enum):
    count = "count"
    damaged = "damaged"
    lost = "lost"
    other = "other"


class StockStatus(str, enum.Enum):
    ok = "ok"
    low = "low"
    out = "out"
