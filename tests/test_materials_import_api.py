"""tests/test_materials_import_api.py

Month 2, Week 3, Day 2 — Bulk Materials Import (CSV/JSON) acceptance tests.

Covers (per SETUP_DAY2.md §8):
- Role gating (STUDENT -> 403, no auth -> 401)
- Content-Type routing (CSV/JSON accepted; others -> 422)
- Format errors (malformed JSON, missing CSV columns)
- Bounds (501 rows -> 422, >1 MB -> 413)
- Dry-run writes nothing; reports "would create"
- Per-row errors reported; valid rows still planned
- Commit creates rows; re-import updates duplicates (no new rows)
- on_duplicate=skip / fail semantics
- Atomicity (mid-batch failure -> full rollback)
- Rejected rows are not written
"""

import pytest
from conftest import PASSWORD, unique_email

from app.core.roles import UserRole
from app.models.material import StudyMaterial
from app.schemas.user import UserCreate
from app.services import user_service

# Path to the shared sample CSV used for the happy-path dry-run/commit tests.
_SAMPLE_CSV = "tests/fixtures/materials_import_sample.csv"


@pytest.fixture(autouse=True)
def _clean_materials(db):
    """Purge study_materials before every test in this module.

    WHY: the shared session-scoped test DB accumulates materials across tests
    and across pytest invocations. The import tests assert exact "created" vs
    "updated" counts, which are only meaningful against a clean table. Without
    this, a prior run (or another test file) leaves rows that make a fresh
    import report `updated` instead of `created` — a test-isolation failure,
    not a service bug.

    WHAT / Safety: `study_materials` is a leaf table (nothing FK-references
    it), so `DELETE FROM study_materials` is side-effect free. Users untouched.
    """
    db.query(StudyMaterial).delete(synchronize_session=False)
    db.commit()
    yield


def _create_with_role(db, role):
    email = unique_email("matimp")
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Import Admin",
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


def _admin(client, db):
    """Create an ADMIN user and return (client_auth_headers, db).

    Convenience for the many tests that just need an authenticated admin.
    """
    admin, email = _create_with_role(db, UserRole.ADMIN)
    token = _token_for(db, client, email)
    return _auth(client, token)


def _csv_payload(columns="module_code,title,url,resource_type", rows=("INF154,Tutorial,https://example.org/a,YOUTUBE",)):
    """Build a CSV body from a header line + data rows."""
    return "\n".join([columns] + list(rows))


def _json_payload(rows):
    """Build a JSON array body from a list of row dicts."""
    import json

    return json.dumps(rows)


class TestImportParsingAndBounds:
    def test_import_requires_admin(self, client, db):
        student, email = _create_with_role(db, UserRole.STUDENT)
        token = _token_for(db, client, email)
        resp = client.post(
            "/api/v1/admin/materials/import",
            headers={**_auth(client, token), "Content-Type": "text/csv"},
            content="module_code,title,url,resource_type\nINF154,T,https://e.org/a,YOUTUBE",
        )
        assert resp.status_code == 403

    def test_import_requires_auth(self, client):
        resp = client.post(
            "/api/v1/admin/materials/import",
            headers={"Content-Type": "text/csv"},
            content="module_code,title,url,resource_type\nINF154,T,https://e.org/a,YOUTUBE",
        )
        assert resp.status_code == 401

    def test_import_rejects_unsupported_content_type(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/plain"
        resp = client.post(
            "/api/v1/admin/materials/import", headers=headers, content="hello"
        )
        assert resp.status_code == 422

    def test_import_rejects_malformed_json(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "application/json"
        resp = client.post(
            "/api/v1/admin/materials/import", headers=headers, content="{not json"
        )
        assert resp.status_code == 422

    def test_import_rejects_csv_missing_columns(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        resp = client.post(
            "/api/v1/admin/materials/import",
            headers=headers,
            content="module_code,title\nINF154,Tutorial",
        )
        assert resp.status_code == 422
        assert "url" in resp.json()["detail"]

    def test_import_rejects_too_many_rows(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        # 501 data rows + header -> exceeds MAX_ROWS (500).
        rows = [
            f"INF{i},T,https://example.org/{i},YOUTUBE" for i in range(501)
        ]
        body = _csv_payload(rows=rows)
        resp = client.post(
            "/api/v1/admin/materials/import", headers=headers, content=body
        )
        assert resp.status_code == 422
        assert "Too many rows" in resp.json()["detail"]

    def test_import_rejects_oversized_body(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        # ~1 MB + of padding via a pathological description field on one row.
        big = "x" * (1_100_000)
        body = f"module_code,title,url,resource_type,description\nINF154,T,https://example.org/a,YOUTUBE,{big}"
        resp = client.post(
            "/api/v1/admin/materials/import", headers=headers, content=body
        )
        assert resp.status_code == 413


class TestDryRun:
    def test_dry_run_creates_nothing(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        with open(_SAMPLE_CSV, "rb") as f:
            content = f.read()
        before = db.query(StudyMaterial).count()
        resp = client.post(
            "/api/v1/admin/materials/import?dry_run=true",
            headers=headers,
            content=content,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["dry_run"] is True
        assert data["created"] == 5  # all rows planned as creates
        after = db.query(StudyMaterial).count()
        assert after == before  # nothing written

    def test_dry_run_reports_per_row_errors(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        # One valid row + one invalid (missing URL -> HttpUrl fails) + one bad
        # resource_type.
        body = _csv_payload(
            rows=(
                "INF154,Good,https://example.org/good,YOUTUBE",
                "INF154,Bad,not-a-url,YOUTUBE",
                "INF154,BadType,https://example.org/bt,WIKI",
            )
        )
        resp = client.post(
            "/api/v1/admin/materials/import?dry_run=true",
            headers=headers,
            content=body,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rejected_invalid"] == 2
        assert data["created"] == 1
        actions = {r["row_number"]: r["action"] for r in data["results"]}
        assert actions[1] == "created"
        assert actions[2] == "rejected_invalid"
        assert actions[3] == "rejected_invalid"


class TestCommit:
    def test_commit_creates_rows(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        before = db.query(StudyMaterial).count()
        with open(_SAMPLE_CSV, "rb") as f:
            content = f.read()
        resp = client.post(
            "/api/v1/admin/materials/import", headers=headers, content=content
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["dry_run"] is False
        assert data["created"] == 5
        after = db.query(StudyMaterial).count()
        assert after == before + 5

    def test_commit_updates_duplicates(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        with open(_SAMPLE_CSV, "rb") as f:
            content = f.read()
        # First import creates all 5.
        client.post("/api/v1/admin/materials/import", headers=headers, content=content)
        before = db.query(StudyMaterial).count()
        # Second import (default on_duplicate=update) -> no new rows.
        resp = client.post(
            "/api/v1/admin/materials/import", headers=headers, content=content
        )
        data = resp.json()
        assert data["updated"] == 5
        assert data["created"] == 0
        after = db.query(StudyMaterial).count()
        assert after == before  # no new rows created

    def test_commit_is_atomic(self, client, db, monkeypatch):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        with open(_SAMPLE_CSV, "rb") as f:
            content = f.read()
        before = db.query(StudyMaterial).count()

        # Simulate a mid-batch failure: apply the real plan's first TWO writes,
        # flush them into the transaction, then raise part-way through — exactly
        # what a genuine DB/constraint failure would look like mid-transaction.
        from app.services import material_import_service

        orig = material_import_service.apply_plan

        def _boom(plan_db, plan, admin_user_id):
            for d in plan.decisions[:2]:
                if d.action == "created":
                    plan_db.add(
                        StudyMaterial(
                            module_code=d.payload.module_code,
                            title=d.payload.title,
                            description=d.payload.description,
                            url=str(d.payload.url),
                            resource_type=d.payload.resource_type,
                            quality_resolution=d.payload.quality_resolution,
                            is_approved=d.payload.is_approved,
                            created_by_user_id=admin_user_id,
                        )
                    )
            plan_db.flush()  # force the partial writes into the transaction
            raise RuntimeError("mid-batch failure")

        monkeypatch.setattr(material_import_service, "apply_plan", _boom)

        # The endpoint catches the exception, calls db.rollback(), and re-raises.
        # With TestClient's default raise_server_exceptions=True the re-raise
        # surfaces as an exception (not a clean HTTP response), so we catch it
        # and then verify the rollback actually undid the partial writes.
        raised = False
        try:
            client.post(
                "/api/v1/admin/materials/import", headers=headers, content=content
            )
        except Exception:
            raised = True
        finally:
            monkeypatch.setattr(material_import_service, "apply_plan", orig)

        assert raised is True
        # Rollback must have undone the partial writes -> DB unchanged.
        db.expire_all()
        after = db.query(StudyMaterial).count()
        assert after == before  # atomicity holds

    def test_on_duplicate_skip(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        with open(_SAMPLE_CSV, "rb") as f:
            content = f.read()
        client.post("/api/v1/admin/materials/import", headers=headers, content=content)
        resp = client.post(
            "/api/v1/admin/materials/import?on_duplicate=skip",
            headers=headers,
            content=content,
        )
        data = resp.json()
        assert data["skipped_duplicate"] == 5
        assert data["updated"] == 0
        assert data["created"] == 0

    def test_on_duplicate_fail(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        with open(_SAMPLE_CSV, "rb") as f:
            content = f.read()
        client.post("/api/v1/admin/materials/import", headers=headers, content=content)
        before = db.query(StudyMaterial).count()
        resp = client.post(
            "/api/v1/admin/materials/import?on_duplicate=fail",
            headers=headers,
            content=content,
        )
        assert resp.status_code == 409
        after = db.query(StudyMaterial).count()
        assert after == before  # DB unchanged

    def test_rejected_rows_are_not_written(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "text/csv"
        body = _csv_payload(
            rows=(
                "INF154,Good,https://example.org/good,YOUTUBE",
                "INF154,Bad,not-a-url,YOUTUBE",
            )
        )
        before = db.query(StudyMaterial).count()
        resp = client.post(
            "/api/v1/admin/materials/import", headers=headers, content=body
        )
        data = resp.json()
        assert data["created"] == 1
        assert data["rejected_invalid"] == 1
        after = db.query(StudyMaterial).count()
        # Only the valid row landed.
        assert after == before + 1
        # And it is the valid one, not the invalid one.
        good = db.query(StudyMaterial).filter(StudyMaterial.url == "https://example.org/good").first()
        assert good is not None
        bad = db.query(StudyMaterial).filter(StudyMaterial.url == "not-a-url").first()
        assert bad is None


class TestJsonImport:
    def test_json_import_creates_rows(self, client, db):
        headers = _admin(client, db)
        headers["Content-Type"] = "application/json"
        rows = [
            {
                "module_code": "COS132",
                "title": "JSON Import One",
                "url": "https://example.org/json-one",
                "resource_type": "PDF",
            },
            {
                "module_code": "COS132",
                "title": "JSON Import Two",
                "url": "https://example.org/json-two",
                "resource_type": "ARTICLE",
            },
        ]
        before = db.query(StudyMaterial).count()
        resp = client.post(
            "/api/v1/admin/materials/import",
            headers=headers,
            content=_json_payload(rows),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 2
        assert db.query(StudyMaterial).count() == before + 2
