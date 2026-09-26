"""The contract's conflict rule in one place.

"fields present on validation_error, and on conflict when a specific field caused it."
Each case below is also covered in its own area's test file; this states the rule once
so a regression in any one of them is obvious.

Conflicts that are NOT caused by a specific field carry no `fields` and are excluded on
purpose: invalid_state and insufficient_stock are document-level, and the remaining
plain conflicts (a missing virtual location or reference sequence) are server-state
problems with no input to blame.
"""

import pytest

from app.core.clock import today


def _reserve_half_the_desks(api, seed_data):
    """Put 100 desks on the shelf and reserve 50 with a ready delivery."""
    stocked = api.post(
        "/api/stock/adjust",
        json={
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
            "counted_qty": 100,
            "reason": "count",
        },
    )
    assert stocked.status_code == 200, stocked.text

    delivery = api.post(
        "/api/operations",
        json={
            "type": "delivery",
            "contact": "Ashok Motors",
            "source_location_id": seed_data.stock1.id,
            "scheduled_date": today().isoformat(),
            "lines": [{"product_id": seed_data.desk.id, "qty": 50}],
        },
    )
    assert delivery.status_code == 201, delivery.text
    ready = api.post(f"/api/operations/{delivery.json()['id']}/todo")
    assert ready.json()["status"] == "ready", ready.text


def conflict_cases(seed_data):
    """case -> (method, path, body, expected field, optional setup)."""
    return {
        "login_id": (
            "POST",
            "/api/auth/signup",
            {
                "login_id": "test_user",
                "email": "someone.else@example.com",
                "password": "Valid@Pass1",
            },
            "login_id",
            None,
        ),
        "email": (
            "POST",
            "/api/auth/signup",
            {
                "login_id": "other_user",
                "email": "TEST@EXAMPLE.COM",
                "password": "Valid@Pass1",
            },
            "email",
            None,
        ),
        "sku": (
            "POST",
            "/api/products",
            {
                "name": "Another Desk",
                "sku": "desk001",
                "category_id": None,
                "uom": "Unit",
                "unit_cost": 1,
                "min_qty": None,
            },
            "sku",
            None,
        ),
        "warehouse short_code": (
            "POST",
            "/api/warehouses",
            {"name": "Clash", "short_code": "wh", "address": None},
            "short_code",
            None,
        ),
        "location short_code": (
            "POST",
            "/api/locations",
            {
                "warehouse_id": seed_data.warehouse.id,
                "name": "Second Stock1",
                "short_code": "Stock1",
            },
            "short_code",
            None,
        ),
        "category name": (
            "POST",
            "/api/categories",
            {"name": "furniture"},
            "name",
            None,
        ),
        # Counting below what a ready delivery has already reserved. The frontend maps
        # this onto the counted-quantity input, so it has to name the field.
        "counted_qty below reserved": (
            "POST",
            "/api/stock/adjust",
            {
                "product_id": None,  # filled in from seed_data below
                "location_id": None,
                "counted_qty": 40,
                "reason": "count",
            },
            "counted_qty",
            _reserve_half_the_desks,
        ),
    }


CASES = [
    "login_id",
    "email",
    "sku",
    "warehouse short_code",
    "location short_code",
    "category name",
    "counted_qty below reserved",
]


@pytest.mark.parametrize("case", CASES)
def test_conflict_names_the_offending_field(api, seed_data, case):
    method, path, body, expected_field, setup = conflict_cases(seed_data)[case]
    if body.get("product_id", "absent") is None:
        body = {
            **body,
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
        }
    if setup is not None:
        setup(api, seed_data)

    response = api.request(method, path, json=body)

    assert response.status_code == 409, response.text
    payload = response.json()
    assert payload["code"] == "conflict"
    assert set(payload) == {"code", "message", "fields"}
    assert list(payload["fields"]) == [expected_field]
    assert payload["fields"][expected_field].strip()
    assert payload["message"].strip()
