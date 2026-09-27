# Week 4 Close-Out Report — Operational Readiness & the Pivot to Product

**Project:** Varsity Companion API
**Date:** 12 September 2026
**Branching:** day branches pushed → PR into `develop` (no direct `main` pushes)

---

## 1. What Week 4 delivered

Week 4's theme was **operational readiness**: CI/CD, containerization, config
hardening, and staging parity. All four build days are complete, committed,
pushed, and (where possible) verified live.

| Day | Deliverable | Branch | Status |
| :--- | :--- | :--- | :--- |
| 1 | GitHub Actions CI (ruff + alembic + pytest + Postgres 15) | `week4/day1-cicd` | ✅ pushed |
| 2 | Multi-stage Dockerfile, `.dockerignore`, compose; 2 defects fixed | `week4/day2-docker` | ✅ pushed |
| 3 | `staging` env + JWT boot guard + HSTS (28 new tests) | `week4/day3-hardening` | ✅ pushed |
| 4 | Staging compose + live verify script + WAF guide | `week4/day4-staging` | ✅ pushed |

Test count grew **124 → 152** across the week, with ruff clean throughout.

---

## 2. Two real defects caught by actually running the container

The value of "boot it, don't just write it":

1. **`postgresql://` → maps to psycopg2**, which we don't ship. Staging would
   crash at migration. Fixed to `postgresql+psycopg://`.
2. **`httpx` was a runtime dependency** (email module imports it at startup)
   but lived only in `requirements-dev.txt`. Promoted to `requirements.txt`.

Both would have failed in staging/production and are now locked in by the
compose staging config + live verification.

---

## 3. Staging state — verified locally, external steps parked

The staging app runs correctly **and was verified against the real staging Neon
DB** (12/12 checks: health 200, docs 404, HSTS, Secure/HttpOnly/SameSite
cookies, migrations 0001→0002→0003).

A launch blocker was found and fixed on the host: a malformed
`STAGING_DATABASE_URL` (`postgresql+postgresql://` double-scheme) →
corrected to `postgresql+psycopg://`.

Still **deferred (not a build blocker):**
- Custom domain (`varsitycompanion.co.za`) — free options exist (DuckDNS,
  Render `.onrender.com`, nip.io) when public exposure is actually needed.
- Cloudflare DNS/WAF/TLS config.
- Production secrets / `ENVIRONMENT=production` — set at real deploy time.

These are captured in `docs/STAGING_DEPLOYMENT.md` and
`docs/PRE_LAUNCH_KEYS.md` (the living launch checklist).

---

## 4. The decision that matters: stop infra, start product

Per the updated planning docs (`Varsity_Companion_MVP.md`, `plan/month_1/
week_4/day_1/new updates.md`), the product has **pivoted**:

> Core value = **course-aware AI summaries + materials search + local
> auto-save**. Opportunity/bursary discovery is **out of scope for MVP**
> (majority of SA students are NSFAS-funded). AI summaries + materials search
> are slated for **Month 2**.

**Decision taken:** do **not** spend further time on hosting/domains/WAF,
because they do not unblock development and carry near-zero risk if deferred to
launch week. Focus shifts to the MVP core loop.

Consequence for the remaining plan: **Week 4, Day 5 (coherence review + load
testing)** is de-prioritised because its blueprint presupposes a *live public
staging URL* — which is exactly the infra we just agreed to park. Load-testing
localhost would measure the dev machine, not the real system (low value, high
distraction). It is replaced by this close-out and a direct transition to
Month 2.

---

## 5. What currently matters (the real priority list)

1. **AI course-aware summaries** — the #1 differentiator and highest daily
   value feature.
2. **Materials search** — ranked YouTube/journals filtered by the student's
   modules.
3. **Free-tier AI usage caps + cost controls** — the planning docs call this
   *critical* for unit economics (target R1–R5/active user/month).
4. **Local auto-save / offline basics** — backend already "ready" via bounded
   pagination + small JSON payloads.

Out of scope for MVP (confirmed by planning docs): forums/group chats,
bursary/opportunity matching, WhatsApp bot, social/competitive features.

---

## 6. Standing engineering principles carried into Month 2

- **Time & space complexity** — conscious Big-O on every query/algorithm.
- **Failure anticipation** — assume failures at 100k+ users; graceful
  degradation, timeouts, idempotent retries.
- **Build for scale** — no shortcuts that collapse under load.
- **Keep it light** — lean dependencies, no speculative abstraction, minimal
  bloat.
- **Ask before installing any package.**

---

## 7. Next

- **Month 2, Day 1** — draft/obtain the architecture for the AI summary
  engine + cost-control layer (per the MVP spec), or follow the `month_2`
  blueprint when available.
- Before any AI work: decide **model provider** (GPT-4o-mini / Gemini Flash /
  DeepSeek) and set up **cost monitoring + free-tier caps** first — the
  planning docs are explicit that uncontrolled LLM usage destroys unit
  economics.
