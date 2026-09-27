"""tests/test_week3_isolation_audit.py

Week 3 isolation audit — an executable statement of two design decisions.

1. EVERY admin route requires ADMIN or SUPERUSER.
2. Study materials are GLOBAL content, not user-scoped.

WHY THESE ARE TESTS AND NOT A DOCUMENT
--------------------------------------
`require_role` is a single decorator argument. Deleting it is a one-line
accident that removes authorisation from an endpoint, and nothing else in the
suite would notice: the route still works for admins, so every admin test still
passes. The only symptom is that a student can now edit the shared library.

Similarly, materials are deliberately global: they are curated content keyed by
module code, shared by every student taking that module. Adding a `user_id`
filter "for safety" would be a well-intentioned change that silently hides the
whole library from everyone. The global-content test fails loudly if that
happens, so the decision has to be made deliberately rather than by accident.

The route list below is the full admin surface, not just the Week 3 additions,
so a gate removed anywhere in the module is caught.
"""
from __future__ import annotations

import pytest
from conftest import PASSWORD, unique_email

from app.core.roles import UserRole
from app.models.material import StudyMaterial
from app.schemas.user import UserCreate
from app.services import user_service

# The complete admin surface, as declared in app/api/v1/admin.py.
# Each entry is (method, path). Path params use a fixed UUID so a missing role
# gate is what fails the test - not a routing 404.
_PROBE_UUID = "00000000-0000-0000-0000-000000000000"
ADMIN_ROUTES: list[tuple[str, str]] = [
    ("GET", "/api/v1/admin/metrics"),
    ("POST", "/api/v1/admin/materials"),
    ("GET", "/api/v1/admin/materials"),
    ("GET", "/api/v1/admin/materials/coverage"),
    ("POST", "/api/v1/admin/materials/import"),
    ("PATCH", f"/api/v1/admin/materials/{_PROBE_UUID}"),
    ("DELETE", f"/api/v1/admin/materials/{_PROBE_UUID}"),
    ("POST", "/api/v1/admin/purge-deleted-users"),
]


def _make_user(db, role):
    """Create a user with a specific role, returning (user, email)."""
    email = unique_email(f"iso{role.value}")
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Isolation Audit",
        terms_version="1.0",
        privacy_version="1.0",
    )
    return user_service.create_user(db, data, role=role), email


def _token_for(client, email) -> str:
    client.cookies.clear()
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _headers(client, token):
    # Clear cookies so the httpOnly session cookie cannot satisfy auth on its
    # own - the test must prove the TOKEN's role is what is being checked.
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _call(client, method: str, path: str, headers=None):
    return client.request(
        method,
        path,
        headers=headers,
        json={} if method in ("POST", "PATCH") else None,
    )


class TestAdminRoleGates:
    @pytest.mark.parametrize("method,path", ADMIN_ROUTES)
    def test_admin_route_requires_authentication(self, client, method, path):
        """No credentials => 401, never 200."""
        client.cookies.clear()
        resp = _call(client, method, path)
        assert resp.status_code == 401, (
            f"{method} {path} returned {resp.status_code} without credentials. "
            "Expected 401 - if this is 403 the route is missing its auth "
            "dependency entirely."
        )

    @pytest.mark.parametrize("method,path", ADMIN_ROUTES)
    def test_admin_route_rejects_student(self, client, db, method, path):
        """A valid STUDENT token => 403 on every admin route.

        This is the assertion that catches a deleted `require_role`.
        """
        _, email = _make_user(db, UserRole.STUDENT)
        token = _token_for(client, email)
        resp = _call(client, method, path, headers=_headers(client, token))
        assert resp.status_code == 403, (
            f"{method} {path} allowed a STUDENT (status {resp.status_code}). "
            "The require_role([ADMIN, SUPERUSER]) dependency is missing or wrong."
        )

    def test_admin_can_reach_the_coverage_endpoint(self, client, db):
        """Positive control: an ADMIN token is not blocked.

        Without this, all the 403 assertions above would still pass if the route
        were broken for everyone.
        """
        _, email = _make_user(db, UserRole.ADMIN)
        token = _token_for(client, email)
        resp = _call(
            client, "GET", "/api/v1/admin/materials/coverage", _headers(client, token)
        )
        assert resp.status_code == 200, resp.text

    def test_superuser_is_not_blocked(self, client, db):
        _, email = _make_user(db, UserRole.SUPERUSER)
        token = _token_for(client, email)
        resp = _call(
            client, "GET", "/api/v1/admin/materials/coverage", _headers(client, token)
        )
        assert resp.status_code == 200, resp.text


class TestMaterialsAreGlobalContent:
    """Materials are curated library content shared by module, not per-student."""

    @pytest.fixture()
    def module_materials(self, db):
        db.query(StudyMaterial).filter(StudyMaterial.module_code == "GLB101").delete()
        db.commit()
        for i in range(3):
            db.add(
                StudyMaterial(
                    module_code="GLB101",
                    title=f"Shared Resource {i}",
                    description="global content",
                    url=f"https://example.com/global/{i}",
                    resource_type="ARTICLE",
                    quality_resolution="standard",
                    is_approved=True,
                )
            )
        db.commit()
        yield
        db.query(StudyMaterial).filter(StudyMaterial.module_code == "GLB101").delete()
        db.commit()

    def test_two_students_see_identical_materials(self, client, db, module_materials):
        """User A and user B get the same rows for the same module.

        If a user_id filter were added to materials, these sets would differ or
        one would be empty.
        """
        _, email_a = _make_user(db, UserRole.STUDENT)
        _, email_b = _make_user(db, UserRole.STUDENT)
        token_a = _token_for(client, email_a)
        token_b = _token_for(client, email_b)

        def ids_for(token):
            resp = client.get(
                "/api/v1/materials/search",
                params={"module_code": "GLB101"},
                headers=_headers(client, token),
            )
            assert resp.status_code == 200, resp.text
            return {item["id"] for item in resp.json()["items"]}

        ids_a = ids_for(token_a)
        ids_b = ids_for(token_b)

        assert ids_a, "expected the seeded module to return materials"
        assert ids_a == ids_b, (
            "materials are global content, but two students saw different rows. "
            "A per-user filter has probably been added to materials search."
        )

    def test_new_student_immediately_sees_existing_content(self, client, db, module_materials):
        """A brand-new account sees library content it did not create."""
        _, email = _make_user(db, UserRole.STUDENT)
        token = _token_for(client, email)
        resp = client.get(
            "/api/v1/materials/search",
            params={"module_code": "GLB101"},
            headers=_headers(client, token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 3, (
            "a fresh student should see all shared content for the module"
        )


class TestRouteOrderingGuard:
    """The static coverage route must not be captured by /materials/{id}."""

    def test_coverage_is_not_treated_as_a_uuid(self, client, db):
        _, email = _make_user(db, UserRole.ADMIN)
        token = _token_for(client, email)
        resp = client.get(
            "/api/v1/admin/materials/coverage", headers=_headers(client, token)
        )
        # A misordered route would yield 422 (invalid UUID), not 200.
        assert resp.status_code == 200, (
            f"got {resp.status_code}; 422 means the static route is declared "
            "after the dynamic /materials/{material_id} route"
        )
        assert "summary" in resp.json()
