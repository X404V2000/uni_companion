# Hackathon Day 1 Report — Architect Review

**Reviewer:** Senior Systems Design & Architecture Engineer
**Date:** 25 September 2026
**Status:** Day 1 **APPROVED** — demo loop is live. Two required actions before Sunday.

---

## §1. Sign-Off

The Day 1 scope is delivered, and the report itself is one of the strongest you've submitted — it does what a hackathon-day report should do: it says *what works*, *what broke*, and *what to fix before the demo*. Nothing is hidden. Nothing is inflated.

**What landed well:**

| Deliverable | Assessment |
|---|---|
| End-to-end demo loop (login → dashboard → AI summary) | ✅ Verified against live HTTP calls |
| Five defects caught by running, not reading | ✅ Exactly the discipline we've kept for 32 day-slots |
| Model fallback across `gemini-flash-latest` → `flash-lite-latest` → `2.5-flash` | ✅ Correct shape for transient 503s |
| No new packages | ✅ |
| Demo credentials documented | ✅ |
| 2-minute demo loop | ✅ |

The demo exists. That's the singular fact that matters tonight.

---

## §2. The Five Defects — Assessed

Each one is real, each one would have broken the demo, and each was found by running. Comments:

**D1 — root-owned log file.** A known hazard from our Month 1 Docker work. The fix (move aside, regenerate) is correct for a demo. **Long-term:** the app should never own a log file it can't open; the fix belongs in the container entrypoint. Post-hackathon item.

**D2 — CORS missing `x-auth-mode` header.** This is a *real* oversight in the backend, not just a demo issue. `x-auth-mode` is the documented mobile-auth path from Week 2 of Month 1. It should have been in `allow_headers` since then. It wasn't caught because no test exercised a cross-origin preflight with that header. **Required follow-up:** add a test to the backend suite that asserts the CORS preflight allows `x-auth-mode`. Otherwise this will regress the moment someone touches CORS again.

**D3 — `.test` TLD rejected by `email-validator`.** This is the day's best catch. `scripts/seed_client_fixture.py` uses `client.dev@varsitycompanion.test`. `email-validator` (a Pydantic dependency) rejects `.test` as a reserved TLD. **The fixture has been broken since the day it was written.** No one noticed because no one ever tried to log in as the fixture user — they just used it for DB-side tests. **Required follow-up:** change the fixture email to `@example.com` (also reserved, but *not* rejected by the validator) or add a validator exception for non-production environments. My recommendation: use `client.dev@example.com`. It's cleaner and doesn't require validator changes.

**D4 — Gemini transient 503.** Google's hosted models intermittently return `503 UNAVAILABLE` under load. The retry + model fallback pattern is correct. Two notes:
- **Retry once per model** is fine, but **make sure the backoff is jittered**. If you retry at a fixed 100ms and Google is having a bad minute, all your retries hit the same window. The report doesn't specify; flag it for verification.
- **Pre-warmed cache** is the right next step (see §3).

**D5 — Two incompatible stacks in one repo.** This is the structural hazard. The report handled it correctly (kept `demo` independent, closed PR #27). But it's a real problem for post-hackathon. See §5.

---

## §3. What Must Happen Before Sunday

Two things. Both are non-negotiable.

### 3.1 Rotate both tokens — today, not tomorrow

The report correctly flags this. The leaked token `ghp_***REDACTED***` is still readable in `origin/main` history. The token you pasted during the session is visible in chat. GitHub does not purge old objects quickly after a force-push — rotation is the definitive mitigation.

**Action:** go to GitHub → Settings → Developer settings → Personal access tokens → Revoke the leaked token. Then generate a new one. **Do this before anything else.** Not because the hackathon depends on it, but because the repo is public-facing and a live token in history is a live vulnerability.

### 3.2 Pre-warm the summary cache — 20 minutes of work that saves the demo

The report flags the risk ("Consider a pre-warmed summary cache so the demo is instant/offline-safe"). This is not optional. Here's why:

- You will demo `POST /ai/summarize` to judges. If Google returns 503 at that exact moment — even with retries and fallback — the demo stalls for 3–10 seconds while the code tries every model.
- Judges' attention is finite. A 10-second freeze on the pitch's most important feature is the difference between "impressive" and "wait, is it broken?"

**Fix:** add a pre-warm step to the demo setup. Before the demo:
1. Run one `POST /ai/summarize` with the exact text you'll paste during the demo.
2. The result is stored in `ai_summary_caches` (per-user SHA-256 hash).
3. When the demo actually runs, the same text → cache hit → instant response → `cached: true` label shows.
4. Even if Google is having a bad minute, the demo doesn't care.

**Implementation:** you already built this. The `/ai/summarize` endpoint is cache-backed. You just need to run the pre-warm script once before the demo and reuse the exact same input text during the demo. **Write down the exact text** so it doesn't drift.

Add this to the demo runbook.

---

## §4. Acceptance Criteria vs. Reality

The only deviation is #3 (fixture credentials changed) — which is *correct*, because the fixture was broken and would never have worked.

**All 10 criteria are satisfied, with #3 correctly adapted.** The demo is viable.

---

## §5. On the Two-Stack Problem (D5)

The report says: *"`origin/main` is additionally in a half-recovered state (82 empty files) and needs a deliberate cleanup decision."*

This is a real architectural problem, and it needs a decision, not a patch. Three options:

**Option A — Declare the Python/FastAPI stack canonical.** Archive the TS/Express branches. Rewrite `main` to point at the reconciled Python line. Cost: 1–2 hours, one-time. Benefit: one repo, one stack, one truth.

**Option B — Split into two repositories.** Python backend stays; TS/Prisma frontend becomes a separate repo. Cost: 1 hour. Benefit: clean separation. Downside: coordination overhead grows over time.

**Option C — Defer.** Leave the mess, focus on the hackathon, decide after 4 October.

**My recommendation: Option C for now, Option A before any real funding pitch.** The hackathon judges will not look at your git history. Investors will. Clean this up in October.

Add it to the post-hackathon backlog.

---

## §6. What Comes Next — Hackathon Day 2 (Saturday 26 September)

You have **one full day** before the hackathon. Today was integration. Tomorrow is **polish + deploy + rehearse**.

### The blueprint for Day 2

**Objective:** Turn a working demo into a *presentable* demo, deployed to a public URL, with a rehearsed pitch.

**Time budget:** 8–10 hours (do not exceed; you need to sleep).

### Scope — in priority order

#### P0 (must do — 3 hours)
1. **Rotate the leaked tokens** (see §3.1). Owner: you.
2. **Pre-warm the summary cache** with the exact demo text. Write down the text.
3. **Rehearse the demo loop 5 times in a row.** Same laptop, same browser. Note every friction point.

#### P1 (should do — 4 hours)
4. **Deploy the frontend** to Cloudflare Pages (free, 5 minutes). URL like `varsity-companion.pages.dev`.
5. **Tunnel the backend** with `cloudflared` or `ngrok`. This gives the deployed frontend a public backend URL. Without it, the deployed frontend can't reach `localhost:8000`.
6. **Update the frontend's `apiBase`** to point at the tunnel URL.
7. **Re-test the demo loop** against the deployed frontend + tunneled backend. If the demo breaks on the public URL, that's what you fix.

#### P2 (nice to have — 2 hours)
8. **Write the pitch script.** 2 minutes, spoken. Structure:
   - 20s: The problem ("SA students juggle lectures, LMS, WhatsApp groups, deadlines").
   - 30s: The product ("Varsity Companion — course-aware AI summaries + materials + offline-first").
   - 60s: The demo (login → dashboard → paste notes → get summary).
   - 10s: The ask ("We're building the academic OS for SA students").
9. **Practice the pitch 3 times out loud.** Not in your head. Out loud.
10. **Prepare a backup plan.** If venue Wi-Fi fails, you demo from the laptop (localhost). If the laptop dies, you show a screen recording. Record one.

#### P3 (if time — 1 hour)
11. **Fix `seed_client_fixture.py`** to use `@example.com` (D3 follow-up).
12. **Write the submission README** with the attribution paragraph (backend pre-hackathon, frontend during hackathon).
13. **Write a one-paragraph submission blurb** describing what was built.

### What is NOT in tomorrow's scope

- ❌ New features (no RAG, no push notifications, no voice input).
- ❌ Redesigning anything.
- ❌ Adding packages.
- ❌ Fixing the two-stack problem (that's for October).
- ❌ Writing tests (the demo is the test).
- ❌ Documentation for the backend.

### Acceptance criteria for Day 2

1. Frontend is deployed to a public URL and loads.
2. Frontend on the public URL successfully reaches the backend (via tunnel).
3. The demo loop runs end-to-end on the deployed frontend, 5 times in a row, without errors.
4. The summary demo produces a cached response instantly (pre-warmed).
5. The 2-minute pitch has been rehearsed 3 times out loud.
6. A backup screen recording exists.
7. The submission README includes attribution.
8. Both leaked tokens have been rotated.
9. You are in bed by 1am.

### Defect-discovery prompts for Day 2

- **Deployed frontend returns CORS error** → the backend's `cors_origins` doesn't include the Cloudflare Pages URL. Add it, restart the backend.
- **Deployed frontend can't reach the backend** → the tunnel isn't running, or the tunnel URL changed. Cloudflared URLs are ephemeral on the free tier; restart it and update `apiBase`.
- **Summary demo is slow** → the cache wasn't pre-warmed, or the demo text differs from what you pre-warmed. Verify by checking the response's `cached` field (should be `true`).
- **Login works locally but not on deployed** → the frontend's `apiBase` is still `http://127.0.0.1:8000`. Update to the tunnel URL.
- **The pitch feels too long** → cut from 60s of demo to 40s. Judges don't need to see every click; they need the impression.
- **The pitch feels too short** → you're skipping the "why this matters" line. It's the line that separates a tool from a product.

---

## §7. What I Need From You

Nothing tonight. The report is complete, the demo works, and the next actions are clear. Go to sleep.

Tomorrow morning, before you do anything else, confirm these three things:

1. **Tokens rotated.** (Required, not optional.)
2. **You've read §6 (Day 2 blueprint).** Note any scope you want to adjust.
3. **You've written down the exact text you'll use for the demo summary.** (Pre-warming depends on it.)

Then start Day 2's P0 work. If anything in the blueprint feels wrong or unclear, tell me before you begin — we adjust the plan, not the discipline.

---
