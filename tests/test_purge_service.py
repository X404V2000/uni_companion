"""
tests/test_purge_service.py

POPIA hard-purge tests (Week 2, Day 5):

- Retention safety: soft-deleted users INSIDE the window are not purged.
- Hard erasure: expired soft-deleted users are physically removed.
- Active (non-deleted) users are never purged.
- RBAC: STUDENT -> 403; ADMIN/SUPERUSER -> 200 on the admin endpoint.
"""
from datetime import UTC, datetime, timedelta

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.core.roles import UserRole
from app.models.user import User
from app.schemas.user import UserCreate
from app.services import user_service
from app.services.purge_service import purge_expired_users


def _build_user_in(email: str) -> UserCreate:
    p = valid_signup_payload(email)
    return UserCreate(
        email=p["email"],
        password=p["password"],
        full_name=p["full_name"],
        university=p.get("university"),
        field_of_study=p.get("field_of_study"),
        year_of_study=p.get("year_of_study"),
        terms_version=p["terms_version"],
        privacy_version=p["privacy_version"],
    )


class TestPurgeServiceLogic:
    def test_recent_soft_delete_is_not_purged(self, db):
        user = user_service.create_user(db, _build_user_in(unique_email()))
        user.is_active = False
        user.deleted_at = datetime.now(UTC) - timedelta(days=5)
        db.commit()

        purge_expired_users(db, retention_days=30)
        # THIS user (inside window) must still exist.
        assert db.query(User).filter(User.id == user.id).count() == 1

    def test_expired_soft_delete_is_hard_erased(self, db):
        user = user_service.create_user(db, _build_user_in(unique_email()))
        user.is_active = False
        user.deleted_at = datetime.now(UTC) - timedelta(days=40)
        db.commit()

        purge_expired_users(db, retention_days=30)
        # THIS user (past window) must be gone.
        assert db.query(User).filter(User.id == user.id).count() == 0

    def test_active_user_never_purged(self, db):
        user = user_service.create_user(db, _build_user_in(unique_email()))
        # Active user with no deleted_at.
        db.commit()

        purge_expired_users(db, retention_days=1)
        # THIS active user must still exist.
        assert db.query(User).filter(User.id == user.id).count() == 1


class TestPurgeEndpointRBAC:
    def _login(self, client, email):
        return client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})

    def test_student_gets_403(self, client):
        email = unique_email()
        client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
        assert self._login(client, email).status_code == 200

        resp = client.post("/api/v1/admin/purge-deleted-users")
        assert resp.status_code == 403
        assert resp.json().get("detail") == "Operation not permitted"

    def test_admin_gets_200(self, client, db):
        admin = user_service.create_user(
            db, _build_user_in(unique_email()), role=UserRole.ADMIN
        )
        assert self._login(client, admin.email).status_code == 200

        resp = client.post("/api/v1/admin/purge-deleted-users")
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("purged_count") == 0  # nothing expired in this test DB

    def test_superuser_gets_200(self, client, db):
        su = user_service.create_user(
            db, _build_user_in(unique_email()), role=UserRole.SUPERUSER
        )
        assert self._login(client, su.email).status_code == 200

        resp = client.post("/api/v1/admin/purge-deleted-users")
        assert resp.status_code == 200
        assert "purged_count" in resp.json()
