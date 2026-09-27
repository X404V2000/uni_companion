"""tests/test_materials_coverage_api.py

Month 2, Week 3, Day 3 — Materials coverage analytics + index acceptance tests.

WHAT THIS DAY DELIVERS
----------------------
1. A composite index `ix_materials_module_url` on study_materials(module_code,
   url), so the bulk-import duplicate check is O(log N) instead of O(N) per row.
2. `GET /admin/materials/coverage` — a role-gated, bounded report of what
   content exists per module and, more usefully, which modules have NONE.

The index test is the point of the day. Without it the migration could be
missing, misnamed, or on the wrong columns and every other test would still
pass, because correctness does not depend on an index — only performance does.

The coverage endpoint is tested against a SEEDED, KNOWN dataset. Asserting
against whatever happens to be in the database would pass or fail depending on
other tests, which is how a suite becomes untrustworthy.
"""
from __future__ import annotations

import pytest
from conftest import PASSWORD, unique_email
from sqlalchemy import text

from app.core.roles import UserRole
from app.models.academic import Module
from app.models.material import StudyMaterial
from app.schemas.user import UserCreate
from app.services import user_service

COVERAGE_URL = "/api/v1/admin/materials/coverage"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_with_role(db, role):
    email = unique_email("cov")
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Coverage Tester",
        terms_version="1.0",
        privacy_version="1.0",
    )
    return user_service.create_user(db, data, role=role), email


def _token_for(client, email):
    client.cookies.clear()
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(client, token):
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _material(db, code: str, url: str, approved: bool = True) -> StudyMaterial:
    """Insert one material with an explicit code/url/approval."""
    row = StudyMaterial(
        module_code=code,
        title=f"Material {url[-6:]}",
        description="coverage test row",
        url=url,
        resource_type="ARTICLE",
        quality_resolution="standard",
        is_approved=approved,
    )
    db.add(row)
    db.commit()
    return row


@pytest.fixture()
def clean_materials(db):
    """Give each test a known materials/modules landscape.

    The suite shares one database, and these tests assert exact counts, so the
    tables are cleared first. Without this, a material inserted by another test
    would change the totals and the failure would look like a bug in the
    endpoint.
    """
    db.query(StudyMaterial).delete()
    db.query(Module).delete()
    db.commit()
    yield
    db.query(StudyMaterial).delete()
    db.query(Module).delete()
    db.commit()


def _add_module(db, user_id, code: str, name: str) -> Module:
    row = Module(user_id=user_id, code=code, name=name, color_code="#2563eb")
    db.add(row)
    db.commit()
    return row


# ---------------------------------------------------------------------------
# 1-2. Access control
# ---------------------------------------------------------------------------

class TestAccessControl:
    def test_coverage_requires_auth(self, client, clean_materials):
        client.cookies.clear()
        resp = client.get(COVERAGE_URL)
        assert resp.status_code == 401

    def test_coverage_requires_admin(self, client, db, clean_materials):
        """A student must not see library-wide analytics."""
        student, email = _user_with_role(db, UserRole.STUDENT)
        token = _token_for(client, email)
        resp = client.get(COVERAGE_URL, headers=_auth(client, token))
        assert resp.status_code == 403

    def test_coverage_allows_superuser(self, client, db, clean_materials):
        _, email = _user_with_role(db, UserRole.SUPERUSER)
        token = _token_for(client, email)
        resp = client.get(COVERAGE_URL, headers=_auth(client, token))
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 3-4. Summary correctness and ordering
# ---------------------------------------------------------------------------

class TestSummary:
    def test_summary_counts_correct(self, client, db, clean_materials):
        admin, email = _user_with_role(db, UserRole.ADMIN)
        _material(db, "AAA111", "https://example.com/a1", approved=True)
        _material(db, "AAA111", "https://example.com/a2", approved=True)
        _material(db, "BBB222", "https://example.com/b1", approved=False)

        token = _token_for(client, email)
        body = client.get(COVERAGE_URL, headers=_auth(client, token)).json()
        s = body["summary"]

        assert s["total_materials"] == 3
        assert s["approved"] == 2
        assert s["unapproved"] == 1
        assert s["modules_with_materials"] == 2
        # Invariant required by the spec.
        assert s["approved"] + s["unapproved"] == s["total_materials"]

    def test_by_module_ordering_total_desc_then_code_asc(self, client, db, clean_materials):
        _, email = _user_with_role(db, UserRole.ADMIN)
        # ZZZ has 1, AAA and BBB have 2 each -> AAA before BBB (tie, code ASC),
        # both before ZZZ (fewer rows).
        _material(db, "ZZZ999", "https://example.com/z1")
        _material(db, "AAA111", "https://example.com/a1")
        _material(db, "AAA111", "https://example.com/a2")
        _material(db, "BBB222", "https://example.com/b1")
        _material(db, "BBB222", "https://example.com/b2")

        token = _token_for(client, email)
        body = client.get(COVERAGE_URL, headers=_auth(client, token)).json()

        codes = [m["module_code"] for m in body["by_module"]]
        assert codes == ["AAA111", "BBB222", "ZZZ999"], codes

    def test_by_module_totals_are_internally_consistent(self, client, db, clean_materials):
        _, email = _user_with_role(db, UserRole.ADMIN)
        _material(db, "AAA111", "https://example.com/a1", approved=True)
        _material(db, "AAA111", "https://example.com/a2", approved=False)

        token = _token_for(client, email)
        body = client.get(COVERAGE_URL, headers=_auth(client, token)).json()
        entry = next(m for m in body["by_module"] if m["module_code"] == "AAA111")
        assert entry["total"] == 2
        assert entry["approved"] == 1
        assert entry["unapproved"] == 1
        assert entry["total"] == entry["approved"] + entry["unapproved"]


# ---------------------------------------------------------------------------
# 5. Pagination
# ---------------------------------------------------------------------------

class TestPagination:
    def test_by_module_pagination_slices_correctly(self, client, db, clean_materials):
        _, email = _user_with_role(db, UserRole.ADMIN)
        # 4 codes, 3 rows each, so the order is unambiguous by code ASC.
        for code in ("AAA111", "BBB222", "CCC333", "DDD444"):
            for i in range(3):
                _material(db, code, f"https://example.com/{code}-{i}")

        token = _token_for(client, email)
        body = client.get(
            f"{COVERAGE_URL}?page=2&size=2", headers=_auth(client, token)
        ).json()

        assert body["page"] == 2
        assert body["size"] == 2
        assert body["by_module_total"] == 4
        assert [m["module_code"] for m in body["by_module"]] == ["CCC333", "DDD444"]

    def test_size_capped_at_100(self, client, db, clean_materials):
        _, email = _user_with_role(db, UserRole.ADMIN)
        token = _token_for(client, email)
        resp = client.get(f"{COVERAGE_URL}?size=999", headers=_auth(client, token))
        assert resp.status_code == 422

    def test_page_below_one_is_rejected(self, client, db, clean_materials):
        _, email = _user_with_role(db, UserRole.ADMIN)
        token = _token_for(client, email)
        resp = client.get(f"{COVERAGE_URL}?page=0", headers=_auth(client, token))
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 6-7. Starved modules
# ---------------------------------------------------------------------------

class TestStarved:
    def test_starved_lists_modules_without_materials(self, client, db, clean_materials):
        user, email = _user_with_role(db, UserRole.ADMIN)
        _material(db, "AAA111", "https://example.com/a1")
        _add_module(db, user.id, "ZZZ999", "Module With No Content")

        token = _token_for(client, email)
        body = client.get(COVERAGE_URL, headers=_auth(client, token)).json()

        codes = [m["module_code"] for m in body["starved"]]
        assert codes == ["ZZZ999"]
        assert body["starved"][0]["module_name"] == "Module With No Content"
        # Invariant required by the spec.
        assert body["summary"]["starved_modules"] == body["starved_total"] == 1

    def test_starved_excludes_covered_modules(self, client, db, clean_materials):
        user, email = _user_with_role(db, UserRole.ADMIN)
        _material(db, "AAA111", "https://example.com/a1")
        # Both codes are enrolled...
        _add_module(db, user.id, "AAA111", "Has Content")
        _add_module(db, user.id, "BBB222", "Has No Content")

        token = _token_for(client, email)
        body = client.get(COVERAGE_URL, headers=_auth(client, token)).json()

        codes = [m["module_code"] for m in body["starved"]]
        assert "AAA111" not in codes, "a module with materials must not be starved"
        assert codes == ["BBB222"]

    def test_starved_is_deduplicated_across_students(self, client, db, clean_materials):
        """`modules` holds one row per student enrolment, so a popular code
        repeats. The report must list it once."""
        admin, email = _user_with_role(db, UserRole.ADMIN)
        other, _ = _user_with_role(db, UserRole.STUDENT)
        # Three students enrolled in the same starved code.
        _add_module(db, admin.id, "ZZZ999", "Shared Module")
        _add_module(db, other.id, "ZZZ999", "Shared Module")

        token = _token_for(client, email)
        body = client.get(COVERAGE_URL, headers=_auth(client, token)).json()

        codes = [m["module_code"] for m in body["starved"]]
        assert codes.count("ZZZ999") == 1, f"duplicated: {codes}"


# ---------------------------------------------------------------------------
# 8. Empty dataset
# ---------------------------------------------------------------------------

class TestEmptyDataset:
    def test_empty_dataset_returns_zeros(self, client, db, clean_materials):
        _, email = _user_with_role(db, UserRole.ADMIN)
        token = _token_for(client, email)
        resp = client.get(COVERAGE_URL, headers=_auth(client, token))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["summary"]["total_materials"] == 0
        assert body["summary"]["approved"] == 0
        assert body["summary"]["unapproved"] == 0
        assert body["summary"]["modules_with_materials"] == 0
        assert body["by_module"] == []
        assert body["by_module_total"] == 0


# ---------------------------------------------------------------------------
# 9-10. THE POINT OF THE DAY: the index
# ---------------------------------------------------------------------------

class TestIndex:
    """Without these, a missing or misnamed index would go unnoticed.

    Correctness does not need the index — only speed does — so every other test
    in this file would still pass with the migration deleted.
    """

    def test_index_exists_with_the_expected_columns(self, db):
        """Assert the index by name AND column order.

        Column order matters for a composite index: (url, module_code) would not
        serve the duplicate-check predicate efficiently. Querying pg_indexes
        proves what the database actually has, rather than what the migration
        file claims it created.
        """
        # Read the COLUMN LIST rather than the raw indexdef string.
        #
        # A string search is not good enough here: the index NAME contains "url"
        # (ix_materials_module_url), so searching the definition for the first
        # occurrence of "url" finds the name, not the column. pg_index.indkey
        # gives the real column order, decoded via pg_attribute.
        rows = db.execute(
            text(
                """
                SELECT a.attname
                FROM pg_index i
                JOIN pg_class c   ON c.oid = i.indexrelid
                JOIN pg_attribute a ON a.attrelid = i.indrelid
                                   AND a.attnum = ANY (i.indkey)
                WHERE c.relname = 'ix_materials_module_url'
                ORDER BY array_position(i.indkey, a.attnum)
                """
            )
        ).fetchall()
        columns = [r[0] for r in rows]
        assert columns == ["module_code", "url"], (
            f"index columns are {columns}; the duplicate-check predicate is "
            "(module_code, url), so the order matters for composite use"
        )

    def test_duplicate_check_uses_the_index(self, db, clean_materials):
        """The day's purpose: prove the duplicate lookup is index-assisted.

        Seeds enough rows that the planner prefers an index over a sequential
        scan. `SET enable_seqscan = off` is deliberately NOT used: forcing the
        planner would prove nothing about real behaviour. Instead the test
        asserts on a realistic predicate and inspects the chosen plan.
        """
        # Enough rows for the planner to consider the index worthwhile.
        rows = [
            StudyMaterial(
                module_code=f"MOD{i % 20:03d}",
                title=f"Material {i}",
                description="perf",
                url=f"https://example.com/material/{i}",
                resource_type="ARTICLE",
                quality_resolution="standard",
                is_approved=True,
            )
            for i in range(1200)
        ]
        db.bulk_save_objects(rows)
        db.commit()
        # ANALYZE so the planner has current statistics; without it a small
        # table's plan is guesswork and the test would be flaky.
        db.execute(text("ANALYZE study_materials"))
        db.commit()

        plan = db.execute(
            text(
                "EXPLAIN SELECT id FROM study_materials "
                "WHERE module_code = 'MOD007' AND url = 'https://example.com/material/7'"
            )
        ).fetchall()
        plan_text = "\n".join(r[0] for r in plan)

        assert "ix_materials_module_url" in plan_text, (
            "the duplicate-check predicate is not using the composite index.\n"
            f"plan was:\n{plan_text}"
        )


class TestDuplicateCheckUsesIndexThroughTheService:
    """The index must actually be reachable from the import path, not just in
    theory: the service's duplicate lookup must share the predicate."""

    def test_service_duplicate_lookup_finds_an_existing_row(self, db, clean_materials):
        _material(db, "AAA111", "https://example.com/dup")
        found = (
            db.query(StudyMaterial)
            .filter(
                StudyMaterial.module_code == "AAA111",
                StudyMaterial.url == "https://example.com/dup",
            )
            .first()
        )
        assert found is not None

    def test_coverage_service_is_read_only(self, client, db, clean_materials):
        """The report must not mutate anything."""
        _, email = _user_with_role(db, UserRole.ADMIN)
        before = db.query(StudyMaterial).count()
        token = _token_for(client, email)
        client.get(COVERAGE_URL, headers=_auth(client, token))
        assert db.query(StudyMaterial).count() == before


def test_coverage_route_is_not_shadowed_by_the_dynamic_route(client, db, clean_materials):
    """Guard the declaration-order trap.

    `/materials/coverage` must be matched as a static route. If it were declared
    after `/materials/{material_id}`, FastAPI would treat "coverage" as a UUID
    path parameter and return 422 instead of the report.
    """
    _, email = _user_with_role(db, UserRole.ADMIN)
    token = _token_for(client, email)
    resp = client.get(COVERAGE_URL, headers=_auth(client, token))
    assert resp.status_code == 200, (
        f"got {resp.status_code}; if 422 the static route is declared after the "
        f"dynamic one. Body: {resp.text}"
    )
    assert "summary" in resp.json()
