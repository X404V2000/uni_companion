# Client Dev Harness — 5-Minute Onboarding (Offshore Team)

> **Goal:** go from `git clone` to your first authenticated API request in under
> 5 minutes, fully offline (no production Neon, no mocking framework).
> **Companion docs:** `docs/openapi.json` (machine contract) +
> `docs/API_CONTRACT_V1.md` (semantics).

---

## 1. Prerequisites

- Docker + Docker Compose (for the local API + Postgres)
- Python 3.13
- git

---

## 2. Bring-up

```bash
git clone <repo-url> && cd university_helper

# 1. Start local API + local Postgres (detached)
docker compose up -d

# 2. Wait for health
curl -s http://127.0.0.1:8000/health
#    -> {"status":"healthy","database_connected":true}

# 3. Seed the deterministic fixture
python scripts/seed_client_fixture.py
```

The seed script is **idempotent** and **local-only** (refuses a remote DB).
Re-run it anytime to reset to the exact same known state.

---

## 3. Get tokens (cookie + bearer)

```bash
python scripts/print_client_tokens.py
```

This prints:
- **API-mode** `Authorization: Bearer <jwt>` (use in Flutter/Dio), and
- **Browser-mode** `Cookie: access_token=<jwt>` (use in web preview).

---

## 4. Smoke test

Run the two `curl` commands the token script prints, e.g.:

```bash
curl -s http://127.0.0.1:8000/api/v1/auth/me \
     -H "Authorization: Bearer <token>" | jq
```

Expect `200 OK` with the fixture user's profile.

---

## 5. Flutter base config

| Target | Base URL |
| :--- | :--- |
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |

Always log in with the **exact lowercase** header:

```dart
// Dio interceptor
headers: {'x-auth-mode': 'api'}  // case-sensitive, lowercase "api"
```

Then send `Authorization: Bearer <token>` on every subsequent call.

---

## 6. The frozen contract

- **Machine contract:** `docs/openapi.json` (OpenAPI 3.1.0 — feed to Dart
  codegen; 21 routes, 26 schemas).
- **Semantics guide:** `docs/API_CONTRACT_V1.md` (auth casing, 429/413/422
  shapes, input bounds, sync LWW rules).
- **Regenerate after any backend change:** `python scripts/export_openapi.py`.

---

## 7. Known fixture state (write assertions against these)

**User:** `client.dev@varsitycompanion.test` / `ClientDev!Fixture2026`

| Modules (3) | Tasks (5) | Slots (4) |
| :--- | :--- | :--- |
| INF154 — Imperative Programming | INF154: Loops & Arrays (ASSIGNMENT, HIGH) | Mon 08:00 Centenary 2 |
| COS132 — Intro to Programming | INF154: Practical Test 1 (TEST, CRITICAL) | Mon 10:00 Ingenuity Lab |
| COS212 — Data Structures & Algorithms | COS132: Recursion (ASSIGNMENT, MEDIUM) | Tue 09:00 Centenary 1 |
| | COS212: Linked Lists Quiz (QUIZ, LOW) | Wed 14:00 Lab 3 |
| | COS212: Semester Test (TEST, HIGH, completed) | |

- 30 study materials (10 per module) across YOUTUBE/JOURNAL/PDF/ARTICLE.
- AI quota reset to 10/10 available credits.

All rows have **deterministic UUIDs** (UUIDv5 namespace), so client tests can
reference fixed IDs — ask the backend team for the ID table if needed.

---

## 8. Reset

```bash
python scripts/seed_client_fixture.py   # back to the exact known state
```

---

## 9. CI contract guarantee

Every push/PR runs a **drift gate**: if `docs/openapi.json` no longer matches
the running app, the build fails. So the contract you code against is always
the real one.
