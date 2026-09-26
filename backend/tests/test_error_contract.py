"""Guards on the error envelope itself.

Every response in the whole suite is additionally checked by assert_error_contract,
wired into the client fixture, so a blank field message fails wherever it appears.
"""

import pytest

from app.core.errors import ValidationError, _field_message


def test_our_own_code_cannot_build_a_blank_field_message():
    with pytest.raises(ValueError, match="blank messages for: current_password"):
        ValidationError("Current password is incorrect", fields={"current_password": ""})

    with pytest.raises(ValueError, match="blank messages for: a, b"):
        ValidationError("x", fields={"a": "", "b": "   "})


def test_a_real_field_message_is_accepted():
    error = ValidationError("x", fields={"current_password": "Current password is incorrect"})
    assert error.fields == {"current_password": "Current password is incorrect"}


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Value error, Password must be longer", "Password must be longer"),
        ("Field required", "Field required"),
        # Pydantic renders ValueError("") as exactly this; stripping must not empty it.
        ("Value error, ", "Value error,"),
        ("   ", "Invalid value"),
    ],
)
def test_pydantic_messages_are_never_emptied(raw, expected):
    assert _field_message(raw) == expected


def test_change_password_field_message_is_non_empty(logged_in_client):
    response = logged_in_client.post(
        "/api/auth/change-password",
        json={"current_password": "Nope@Pass1", "new_password": "Brand@New9"},
    )

    assert response.status_code == 422
    assert response.json()["fields"] == {
        "current_password": "Current password is incorrect"
    }


ERROR_REQUESTS = [
    ("POST", "/api/auth/signup", {"login_id": "x", "email": "bad", "password": "weak"}),
    ("POST", "/api/auth/login", {"login_id": "nobody", "password": "x"}),
    ("POST", "/api/auth/reset-password", {"email": "a@b.com", "otp": "1", "new_password": "weak"}),
    ("POST", "/api/warehouses", {"name": "", "short_code": "!!", "address": None}),
    ("PUT", "/api/warehouses/9999", {"name": "X", "short_code": "X", "address": None}),
    ("POST", "/api/locations", {"warehouse_id": 9999, "name": "X", "short_code": "has space"}),
    ("POST", "/api/categories", {"name": ""}),
    ("POST", "/api/products", {"name": "", "sku": "", "uom": "", "unit_cost": -1}),
    ("GET", "/api/products?limit=500", None),
    ("POST", "/api/stock/adjust", {"product_id": 1, "location_id": 1, "counted_qty": -5, "reason": "nope"}),
    ("GET", "/api/stock/9999/locations", None),
    ("POST", "/api/operations", {"type": "adjustment", "scheduled_date": "2026-01-01", "lines": []}),
    ("POST", "/api/operations", {"type": "receipt", "scheduled_date": "2026-01-01", "lines": [{"product_id": 1, "qty": 0}]}),
    ("GET", "/api/operations?status=bogus", None),
    ("POST", "/api/operations/9999/todo", None),
]


@pytest.mark.parametrize(
    "method, path, body",
    ERROR_REQUESTS,
    ids=[f"{m} {p}" for m, p, _ in ERROR_REQUESTS],
)
def test_every_error_response_has_the_contract_shape(api, method, path, body):
    response = api.request(method, path, json=body)

    assert response.status_code >= 400, response.text
    payload = response.json()
    assert set(payload) <= {"code", "message", "fields"}
    assert payload["code"]
    assert payload["message"].strip()
    # The client fixture already asserts no field message is blank; this pins the
    # remaining shape rules for the same requests.
    for name, message in (payload.get("fields") or {}).items():
        assert isinstance(name, str) and name
        assert isinstance(message, str) and message.strip()
