"""
tests/test_academic_timetable_api.py

Timetable endpoint tests (Week 3 Day 3):

- time-range validation (end <= start -> 422)
- module ownership (user B using user A's module -> 404)
- overlap conflict (same day overlapping slot -> 400)
- sorted output (day_of_week asc, then start_time asc)
- authentication required (401)
"""
from conftest import PASSWORD, unique_email, valid_signup_payload


def _signup(client, email=None):
    email = email or unique_email("slot")
    r = client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
    assert r.status_code == 201, r.text
    return email


def _login(client, email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text


def _make_module(client, email, code="INF315"):
    _login(client, email)
    r = client.post("/api/v1/academic/modules", json={"code": code, "name": "Mod"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestTimetableValidation:
    def test_end_time_must_be_after_start_time(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email)
        r = client.post(
            "/api/v1/academic/timetable",
            json={
                "module_id": mid,
                "day_of_week": 1,
                "start_time": "10:00",
                "end_time": "09:00",
            },
        )
        assert r.status_code == 422

    def test_unauthenticated_401(self, client):
        assert client.get("/api/v1/academic/timetable").status_code == 401


class TestTimetableTenantAndConflict:
    def test_foreign_module_404(self, client):
        a = _signup(client)
        b = _signup(client)
        mid_a = _make_module(client, a, code="INF315")
        # login as B
        _login(client, b)
        r = client.post(
            "/api/v1/academic/timetable",
            json={
                "module_id": mid_a,  # belongs to A
                "day_of_week": 1,
                "start_time": "09:00",
                "end_time": "10:00",
            },
        )
        assert r.status_code == 404

    def test_overlapping_slot_400(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email)
        # First slot 09:00-10:30
        r1 = client.post(
            "/api/v1/academic/timetable",
            json={"module_id": mid, "day_of_week": 1,
                  "start_time": "09:00", "end_time": "10:30"},
        )
        assert r1.status_code == 201, r1.text
        # Overlapping 10:00-11:00
        r2 = client.post(
            "/api/v1/academic/timetable",
            json={"module_id": mid, "day_of_week": 1,
                  "start_time": "10:00", "end_time": "11:00"},
        )
        assert r2.status_code == 400
        assert "overlaps" in r2.json().get("detail", "")

    def test_sorted_timetable_output(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email)
        # Insert out of order: day 5 first, then day 1 two slots.
        for day, start, end in [(5, "14:00", "15:00"), (1, "11:00", "12:00"), (1, "09:00", "10:00")]:
            r = client.post(
                "/api/v1/academic/timetable",
                json={"module_id": mid, "day_of_week": day,
                      "start_time": start, "end_time": end},
            )
            assert r.status_code == 201, r.text

        resp = client.get("/api/v1/academic/timetable")
        assert resp.status_code == 200
        slots = resp.json()
        days = [s["day_of_week"] for s in slots]
        starts = [s["start_time"] for s in slots]
        assert days == sorted(days)
        # Within day 1, starts ascending.
        assert starts[0] < starts[1]
        assert days == [1, 1, 5]
