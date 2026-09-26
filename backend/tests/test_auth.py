import pytest

from app.core.security import COOKIE_NAME
from app.services.auth import INVALID_CREDENTIALS_MESSAGE


def signup(client, credentials, **overrides):
    return client.post("/api/auth/signup", json={**credentials, **overrides})


def test_signup_returns_the_user_and_lowercases_email(client, credentials):
    response = signup(client, credentials, email="Demo@Example.COM")

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "login_id", "email", "created_at"}
    assert body["login_id"] == credentials["login_id"]
    assert body["email"] == "demo@example.com"
    # Signup does not log you in; the contract only sets the cookie on login.
    assert COOKIE_NAME not in response.cookies


def test_signup_duplicate_login_id_conflicts(client, credentials):
    signup(client, credentials)

    response = signup(client, credentials, email="someone.else@example.com")

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "conflict"
    assert body["fields"] == {"login_id": "Already registered"}


def test_signup_duplicate_email_is_case_insensitive(client, credentials):
    signup(client, credentials)

    response = signup(client, credentials, login_id="other_user", email="TEST@EXAMPLE.COM")

    assert response.status_code == 409
    assert response.json()["fields"] == {"email": "Already registered"}


@pytest.mark.parametrize(
    "password, expected",
    [
        ("Short@1a", "at least 9 characters"),
        ("ALLUPPER@123", "lowercase"),
        ("alllower@123", "uppercase"),
        ("NoSpecial123", "special character"),
        ("No Special 123", "special character"),
    ],
)
def test_signup_rejects_weak_passwords(client, credentials, password, expected):
    response = signup(client, credentials, password=password)

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert expected in body["fields"]["password"]


@pytest.mark.parametrize("login_id", ["short", "thirteen_chr1", "has space", "bad-dash", "d.u_1"])
def test_signup_rejects_bad_login_id(client, credentials, login_id):
    response = signup(client, credentials, login_id=login_id)

    assert response.status_code == 422
    assert "login_id" in response.json()["fields"]


def test_signup_rejects_bad_email(client, credentials):
    response = signup(client, credentials, email="not-an-email")

    assert response.status_code == 422
    assert "email" in response.json()["fields"]


def test_login_sets_the_auth_cookie(registered_client, credentials):
    response = registered_client.post(
        "/api/auth/login",
        json={"login_id": credentials["login_id"], "password": credentials["password"]},
    )

    assert response.status_code == 200
    assert response.json()["login_id"] == credentials["login_id"]

    set_cookie = response.headers["set-cookie"]
    assert f"{COOKIE_NAME}=" in set_cookie
    assert "HttpOnly" in set_cookie
    # Starlette emits the attribute value verbatim; SameSite values are
    # case-insensitive per RFC 6265bis, so compare case-insensitively.
    assert "samesite=lax" in set_cookie.lower()
    assert "Path=/" in set_cookie
    assert "Max-Age=28800" in set_cookie
    assert "Secure" not in set_cookie  # ENV is not production in tests


@pytest.mark.parametrize(
    "login_id, password",
    [
        ("test_user", "Wrong@Pass1"),
        ("no_such_user", "Valid@Pass1"),
    ],
    ids=["wrong password", "unknown login_id"],
)
def test_login_failures_are_indistinguishable(registered_client, login_id, password):
    response = registered_client.post(
        "/api/auth/login", json={"login_id": login_id, "password": password}
    )

    assert response.status_code == 401
    assert response.json() == {
        "code": "unauthorized",
        "message": INVALID_CREDENTIALS_MESSAGE,
    }
    assert "set-cookie" not in response.headers


def test_me_requires_the_cookie(registered_client):
    response = registered_client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_me_returns_the_current_user(logged_in_client, credentials):
    response = logged_in_client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["login_id"] == credentials["login_id"]
    assert response.json()["email"] == credentials["email"]


def test_me_rejects_a_tampered_cookie(registered_client):
    registered_client.cookies.set(COOKIE_NAME, "not.a.jwt")

    assert registered_client.get("/api/auth/me").status_code == 401


def test_logout_clears_the_cookie(logged_in_client):
    response = logged_in_client.post("/api/auth/logout")

    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"]
    assert f'{COOKIE_NAME}=""' in set_cookie
    assert "Max-Age=0" in set_cookie
    assert "Path=/" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "samesite=lax" in set_cookie.lower()

    assert logged_in_client.get("/api/auth/me").status_code == 401


def test_logout_requires_auth(registered_client):
    assert registered_client.post("/api/auth/logout").status_code == 401


def test_change_password_rejects_a_wrong_current_password(logged_in_client):
    response = logged_in_client.post(
        "/api/auth/change-password",
        json={"current_password": "Nope@Pass1", "new_password": "Brand@New9"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["fields"] == {"current_password": "Current password is incorrect"}


def test_change_password_applies_the_same_strength_rules(logged_in_client, credentials):
    response = logged_in_client.post(
        "/api/auth/change-password",
        json={"current_password": credentials["password"], "new_password": "weak"},
    )

    assert response.status_code == 422
    assert "new_password" in response.json()["fields"]


def test_change_password_succeeds_and_swaps_the_password(logged_in_client, credentials):
    response = logged_in_client.post(
        "/api/auth/change-password",
        json={"current_password": credentials["password"], "new_password": "Brand@New9"},
    )
    assert response.status_code == 204
    assert response.content == b""

    old = logged_in_client.post(
        "/api/auth/login",
        json={"login_id": credentials["login_id"], "password": credentials["password"]},
    )
    assert old.status_code == 401

    new = logged_in_client.post(
        "/api/auth/login",
        json={"login_id": credentials["login_id"], "password": "Brand@New9"},
    )
    assert new.status_code == 200


def test_change_password_requires_auth(registered_client, credentials):
    response = registered_client.post(
        "/api/auth/change-password",
        json={"current_password": credentials["password"], "new_password": "Brand@New9"},
    )

    assert response.status_code == 401


def test_cookie_is_secure_only_in_production(registered_client, credentials, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ENV", "production")
    response = registered_client.post(
        "/api/auth/login",
        json={"login_id": credentials["login_id"], "password": credentials["password"]},
    )

    assert response.status_code == 200
    assert "Secure" in response.headers["set-cookie"]
