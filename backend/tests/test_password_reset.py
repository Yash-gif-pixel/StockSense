from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.models import PasswordReset, User

NEW_PASSWORD = "Brand@New9"


def forgot(client, email):
    return client.post("/api/auth/forgot-password", json={"email": email})


def reset(client, email, otp, new_password=NEW_PASSWORD):
    return client.post(
        "/api/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": new_password},
    )


def latest_reset_row(db, email):
    user = db.scalar(select(User).where(User.email == email))
    return db.scalar(
        select(PasswordReset)
        .where(PasswordReset.user_id == user.id)
        .order_by(PasswordReset.id.desc())
        .limit(1)
    )


def wrong_otp(otp):
    return "000000" if otp != "000000" else "111111"


def test_forgot_password_is_identical_for_known_and_unknown_emails(
    registered_client, credentials, sent_otps
):
    known = forgot(registered_client, credentials["email"])
    unknown = forgot(registered_client, "nobody@example.com")

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert "reset code" in known.json()["message"]
    # Only the real account produces an email.
    assert len(sent_otps) == 1
    assert sent_otps[0][0] == credentials["email"]


def test_forgot_password_stores_only_the_otp_hash(
    registered_client, credentials, sent_otps, db
):
    forgot(registered_client, credentials["email"])
    otp = sent_otps[-1][1]

    row = latest_reset_row(db, credentials["email"])
    assert len(otp) == 6 and otp.isdigit()
    assert otp not in row.otp_hash
    assert len(row.otp_hash) == 64
    assert row.attempts == 0
    assert row.used_at is None
    assert row.expires_at.tzinfo is not None
    assert row.expires_at > datetime.now(timezone.utc)


def test_reset_password_succeeds_and_replaces_the_password(
    registered_client, credentials, sent_otps
):
    forgot(registered_client, credentials["email"])
    otp = sent_otps[-1][1]

    response = reset(registered_client, credentials["email"], otp)
    assert response.status_code == 204

    old = registered_client.post(
        "/api/auth/login",
        json={"login_id": credentials["login_id"], "password": credentials["password"]},
    )
    assert old.status_code == 401

    new = registered_client.post(
        "/api/auth/login",
        json={"login_id": credentials["login_id"], "password": NEW_PASSWORD},
    )
    assert new.status_code == 200


def test_reset_password_rejects_a_reused_otp(registered_client, credentials, sent_otps):
    forgot(registered_client, credentials["email"])
    otp = sent_otps[-1][1]

    assert reset(registered_client, credentials["email"], otp).status_code == 204

    again = reset(registered_client, credentials["email"], otp, "Second@Try9")
    assert again.status_code == 400
    assert again.json()["code"] == "invalid_otp"


def test_wrong_otp_increments_attempts(registered_client, credentials, sent_otps, db):
    forgot(registered_client, credentials["email"])
    otp = sent_otps[-1][1]

    response = reset(registered_client, credentials["email"], wrong_otp(otp))

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_otp"
    assert latest_reset_row(db, credentials["email"]).attempts == 1


def test_otp_locks_after_max_attempts(registered_client, credentials, sent_otps, db):
    forgot(registered_client, credentials["email"])
    otp = sent_otps[-1][1]

    for _ in range(settings.OTP_MAX_ATTEMPTS):
        assert reset(registered_client, credentials["email"], wrong_otp(otp)).status_code == 400

    assert latest_reset_row(db, credentials["email"]).attempts == settings.OTP_MAX_ATTEMPTS

    # Even the correct code is refused once the attempt budget is spent.
    locked = reset(registered_client, credentials["email"], otp)
    assert locked.status_code == 400
    assert locked.json()["code"] == "invalid_otp"


def test_expired_otp_is_rejected(registered_client, credentials, sent_otps, db):
    forgot(registered_client, credentials["email"])
    otp = sent_otps[-1][1]

    row = latest_reset_row(db, credentials["email"])
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.flush()

    response = reset(registered_client, credentials["email"], otp)
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_otp"


def test_a_new_request_invalidates_the_previous_otp(
    registered_client, credentials, sent_otps
):
    forgot(registered_client, credentials["email"])
    first_otp = sent_otps[-1][1]

    forgot(registered_client, credentials["email"])
    second_otp = sent_otps[-1][1]

    assert reset(registered_client, credentials["email"], first_otp).status_code == 400
    assert reset(registered_client, credentials["email"], second_otp).status_code == 204


def test_reset_password_with_an_unknown_email_is_invalid_otp(client):
    response = reset(client, "nobody@example.com", "123456")

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_otp"


def test_reset_password_applies_the_strength_rules(registered_client, credentials, sent_otps):
    forgot(registered_client, credentials["email"])
    otp = sent_otps[-1][1]

    response = reset(registered_client, credentials["email"], otp, "weak")

    assert response.status_code == 422
    assert "new_password" in response.json()["fields"]
