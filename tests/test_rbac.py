"""
tests/test_rbac.py

Role-based access control tests (Week 2, Day 3):

- Signup defaults to STUDENT; role is exposed on /me via UserResponse.
- require_role() dependency factory allows matching roles, blocks others
  with a uniform 403 {"detail": "Operation not permitted"} (no role leak).
- DELETE /account is restricted to STUDENT + ADMIN (SUPERUSER -> 403).
"""
from conftest import PASSWORD, unique_email, valid_signup_payload

from app.core.roles import UserRole
from app.schemas.user import UserCreate
from app.services import user_service


def _signup(client, email=None):
    email = email or unique_email()
    resp = client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
    assert resp.status_code == 201, resp.text
    return email, resp.json()


def _login(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _create_with_role(db, role: UserRole, email=None):
    """Directly persist a user with an explicit role via the service layer."""
    email = email or unique_email("role")
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Role Tester",
        terms_version="1.0",
        privacy_version="1.0",
    )
    return user_service.create_user(db, data, role=role)


class TestRoleDefaults:
    def test_signup_defaults_to_student_and_me_exposes_role(self, client):
        email, _ = _signup(client)
        assert _login(client, email).status_code == 200
        me = client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json().get("role") == UserRole.STUDENT.value


class TestRequireRoleDependency:
    def test_admin_role_passes_admin_gate(self, client, db):
        email = _create_with_role(db, UserRole.ADMIN).email
        assert _login(client, email).status_code == 200
        # /me is not role-gated, but role surface must reflect ADMIN.
        me = client.get("/api/v1/auth/me")
        assert me.json().get("role") == UserRole.ADMIN.value

    def test_require_role_factory_blocks_and_allows_by_role(self):
        """Unit-level: the dependency factory verifies role membership."""
        from fastapi import HTTPException

        from app.api.deps import require_role
        from app.models.user import User

        def make_user(role: str) -> User:
            u = User()
            u.role = role
            u.is_active = True
            return u

        verifier = require_role([UserRole.ADMIN, UserRole.SUPERUSER])

        # Allowed roles pass through.
        assert verifier(make_user(UserRole.ADMIN.value)).role == UserRole.ADMIN.value

        # Disallowed role raises a uniform 403 (no role detail).
        try:
            verifier(make_user(UserRole.STUDENT.value))
            raise AssertionError("expected HTTPException 403")
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == "Operation not permitted"


class TestDeleteAccountRoleGate:
    def test_superuser_cannot_self_delete(self, client, db):
        email = _create_with_role(db, UserRole.SUPERUSER).email
        assert _login(client, email).status_code == 200

        resp = client.request(
            "DELETE", "/api/v1/auth/account", json={"password": PASSWORD}
        )
        assert resp.status_code == 403
        assert resp.json().get("detail") == "Operation not permitted"

    def test_student_can_self_delete(self, client):
        email, _ = _signup(client)
        assert _login(client, email).status_code == 200
        resp = client.request(
            "DELETE", "/api/v1/auth/account", json={"password": PASSWORD}
        )
        assert resp.status_code == 200
        assert resp.json().get("status") == "deactivated"

    def test_admin_can_self_delete(self, client, db):
        email = _create_with_role(db, UserRole.ADMIN).email
        assert _login(client, email).status_code == 200
        resp = client.request(
            "DELETE", "/api/v1/auth/account", json={"password": PASSWORD}
        )
        assert resp.status_code == 200
        assert resp.json().get("status") == "deactivated"
