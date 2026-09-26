"""Timestamps must always leave as UTC with a trailing Z.

The hazard: psycopg returns TIMESTAMPTZ columns as aware datetimes carrying the
connection's session TimeZone, and Pydantic serializes whatever offset it is handed.
"""

import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.core.clock import today
from app.schemas.common import to_utc_z

Z_FORMAT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$")


def test_to_utc_z_converts_any_offset_to_the_same_instant():
    utc = datetime(2026, 9, 26, 6, 25, 47, 304422, tzinfo=timezone.utc)
    ist = utc.astimezone(timezone(timedelta(hours=5, minutes=30)))

    assert to_utc_z(utc) == "2026-09-26T06:25:47.304422Z"
    assert to_utc_z(ist) == "2026-09-26T06:25:47.304422Z"


def test_to_utc_z_refuses_a_naive_datetime():
    with pytest.raises(ValueError, match="timezone-aware"):
        to_utc_z(datetime(2026, 9, 26, 6, 25, 47))


def test_me_returns_a_z_timestamp(logged_in_client):
    created_at = logged_in_client.get("/api/auth/me").json()["created_at"]

    assert Z_FORMAT.match(created_at), created_at


def test_timestamps_stay_utc_when_the_db_session_is_not_utc(api, db, seed_data):
    """The real regression: a session TimeZone of Asia/Kolkata must change nothing."""
    db.execute(text("SET TimeZone = 'Asia/Kolkata'"))
    assert db.scalar(text("SHOW TimeZone")) == "Asia/Kolkata"

    receipt = api.post(
        "/api/operations",
        json={
            "type": "receipt",
            "contact": "Tata Steel",
            "dest_location_id": seed_data.stock1.id,
            "scheduled_date": today().isoformat(),
            "lines": [{"product_id": seed_data.desk.id, "qty": 5}],
        },
    ).json()
    api.post(f"/api/operations/{receipt['id']}/todo")
    detail = api.post(f"/api/operations/{receipt['id']}/validate").json()

    # created_at comes from a server default, so it is read back through psycopg in the
    # session TimeZone; validated_at is set in Python as UTC. Both must look identical.
    assert Z_FORMAT.match(detail["created_at"]), detail["created_at"]
    assert Z_FORMAT.match(detail["validated_at"]), detail["validated_at"]
    assert "+05:30" not in detail["created_at"]

    me = api.get("/api/auth/me").json()
    assert Z_FORMAT.match(me["created_at"]), me["created_at"]


def test_adjustment_detail_timestamps_are_z(api, seed_data):
    operation = api.post(
        "/api/stock/adjust",
        json={
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
            "counted_qty": 10,
            "reason": "count",
        },
    ).json()["operation"]

    assert Z_FORMAT.match(operation["created_at"])
    assert Z_FORMAT.match(operation["validated_at"])


def test_a_draft_has_a_null_validated_at_not_a_string(api, seed_data):
    draft = api.post(
        "/api/operations",
        json={
            "type": "receipt",
            "dest_location_id": seed_data.stock1.id,
            "scheduled_date": today().isoformat(),
            "lines": [{"product_id": seed_data.desk.id, "qty": 1}],
        },
    ).json()

    assert draft["validated_at"] is None
