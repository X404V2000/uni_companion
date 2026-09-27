"""tests/test_admin_materials_api.py

Month 2, Week 3, Day 1 — Admin Materials Curation acceptance tests.

Covers (per SETUP_DAY1.md §7 + bundled §11.2):
- Role gating (STUDENT → 403, no auth → 401)
- Create (201, module normalization, URL scheme, sanitization)
- PATCH (only sent fields, unapprove hides from student, 404)
- DELETE (204, subsequent 404)
- List (filters, pagination bound 422)
- Guard: student search always filters is_approved=True
"""
import uuid

from conftest import PASSWORD, unique_email

from app.core.roles import UserRole
from app.models.material import StudyMaterial
from app.schemas.user import UserCreate
from app.services import user_service


def _create_with_role(db, role):
    email = unique_email("matadm")
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Materials Admin",
        terms_version="1.0",
        privacy_version="1.0",
    )
    return user_service.create_user(db, data, role=role), email


def _token_for(db, client, email):
    client.cookies.clear()
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _auth(client, token):
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _valid_material(**overrides):
    payload = {
        "module_code": "INF154",
        "title": "Python Loops Tutorial",
        "url": "https://www.youtube.com/watch?v=example",
        "resource_type": "YOUTUBE",
        "quality_resolution": "360p",
    }
    payload.update(overrides)
    return payload


class TestAuthGating:
    def test_create_requires_admin(self, client, db):
        student, email = _create_with_role(db, UserRole.STUDENT)
        token = _token_for(db, client, email)
        resp = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(),
            headers=_auth(client, token),
        )
        assert resp.status_code == 403

    def test_create_requires_auth(self, client):
        assert client.post("/api/v1/admin/materials", json=_valid_material()).status_code == 401


class TestCreate:
    def test_create_succeeds_201(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        resp = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(),
            headers=_auth(client, token),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["module_code"] == "INF154"

    def test_create_normalizes_module_code(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        resp = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(module_code="inf154"),
            headers=_auth(client, token),
        )
        assert resp.status_code == 201
        assert resp.json()["module_code"] == "INF154"

    def test_create_rejects_invalid_url_scheme(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        resp = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(url="javascript:alert(1)"),
            headers=_auth(client, token),
        )
        assert resp.status_code == 422

    def test_create_sanitizes_title(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        resp = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(title="<script>alert(1)</script>Loops"),
            headers=_auth(client, token),
        )
        assert resp.status_code == 201
        assert "<script>" not in resp.json()["title"]


class TestUpdate:
    def test_patch_updates_only_sent_fields(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        created = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(title="Original Title"),
            headers=_auth(client, token),
        ).json()
        mid = created["id"]

        resp = client.patch(
            f"/api/v1/admin/materials/{mid}",
            json={"is_approved": False},
            headers=_auth(client, token),
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Original Title"
        assert resp.json()["is_approved"] is False

    def test_patch_unapprove_hides_from_student_search(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        created = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(module_code="INF315"),
            headers=_auth(client, token),
        ).json()
        mid = created["id"]

        # Unapprove.
        assert client.patch(
            f"/api/v1/admin/materials/{mid}",
            json={"is_approved": False},
            headers=_auth(client, token),
        ).status_code == 200

        # Student search should NOT return it.
        student, semail = _create_with_role(db, UserRole.STUDENT)
        stoken = _token_for(db, client, semail)
        r = client.get(
            "/api/v1/materials/search",
            params={"module_code": "INF315"},
            headers=_auth(client, stoken),
        )
        assert r.status_code == 200
        assert all(m["id"] != mid for m in r.json()["items"])

    def test_patch_rejects_unknown_material(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        resp = client.patch(
            f"/api/v1/admin/materials/{uuid.uuid4()}",
            json={"is_approved": True},
            headers=_auth(client, token),
        )
        assert resp.status_code == 404


class TestDelete:
    def test_delete_removes_material(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        created = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(),
            headers=_auth(client, token),
        ).json()
        mid = created["id"]

        resp = client.delete(f"/api/v1/admin/materials/{mid}", headers=_auth(client, token))
        assert resp.status_code == 204
        # Subsequent delete on same id → 404.
        assert client.delete(
            f"/api/v1/admin/materials/{mid}", headers=_auth(client, token)
        ).status_code == 404


class TestList:
    def test_list_shows_unapproved_to_admin(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        created = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(module_code="INF999", is_approved=False),
            headers=_auth(client, token),
        ).json()

        r = client.get(
            "/api/v1/admin/materials",
            params={"module_code": "INF999", "is_approved": False},
            headers=_auth(client, token),
        )
        assert r.status_code == 200
        assert any(m["id"] == created["id"] for m in r.json()["items"])

    def test_list_pagination_bounded(self, client, db):
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        r = client.get(
            "/api/v1/admin/materials",
            params={"size": 999},
            headers=_auth(client, token),
        )
        assert r.status_code == 422


class TestGuard:
    def test_student_search_always_filters_approved(self, client, db):
        """Guard (§11.2): even when an unapproved row exists, student search
        must never surface it."""
        admin, email = _create_with_role(db, UserRole.ADMIN)
        token = _token_for(db, client, email)
        created = client.post(
            "/api/v1/admin/materials",
            json=_valid_material(module_code="INF777", is_approved=False),
            headers=_auth(client, token),
        ).json()

        student, semail = _create_with_role(db, UserRole.STUDENT)
        stoken = _token_for(db, client, semail)
        r = client.get(
            "/api/v1/materials/search",
            params={"module_code": "INF777"},
            headers=_auth(client, stoken),
        )
        assert r.status_code == 200
        # The unapproved row exists in DB but is NOT surfaced to the student.
        unapproved_ids = {
            str(m.id)
            for m in db.query(StudyMaterial)
            .filter(
                StudyMaterial.module_code == "INF777",
                StudyMaterial.is_approved.is_(False),
            )
            .all()
        }
        assert str(created["id"]) in unapproved_ids
        assert unapproved_ids.isdisjoint({m["id"] for m in r.json()["items"]})
