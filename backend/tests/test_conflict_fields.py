"""The contract's conflict rule in one place.

"fields present on validation_error, and on conflict when a specific field caused it."
Each case below is also covered in its own area's test file; this states the rule once
so a regression in any one of them is obvious.
"""

import pytest


def duplicate_requests(seed_data):
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
        ),
        "warehouse short_code": (
            "POST",
            "/api/warehouses",
            {"name": "Clash", "short_code": "wh", "address": None},
            "short_code",
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
        ),
        "category name": (
            "POST",
            "/api/categories",
            {"name": "furniture"},
            "name",
        ),
    }


CASES = [
    "login_id",
    "email",
    "sku",
    "warehouse short_code",
    "location short_code",
    "category name",
]


@pytest.mark.parametrize("case", CASES)
def test_conflict_names_the_offending_field(api, seed_data, case):
    method, path, body, expected_field = duplicate_requests(seed_data)[case]

    response = api.request(method, path, json=body)

    assert response.status_code == 409, response.text
    payload = response.json()
    assert payload["code"] == "conflict"
    assert set(payload) == {"code", "message", "fields"}
    assert list(payload["fields"]) == [expected_field]
    assert payload["fields"][expected_field]
    assert payload["message"]
