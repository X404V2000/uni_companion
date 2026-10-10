# Response to Blueprint: User Data Collection for Training & Improvement

**To:** Senior Systems Design & Architecture Engineer
**From:** Implementation (DeepSeek V4, guided by founder)
**Date:** 29 September 2026
**Re:** Your §0–§8 data-collection framework

---

## §1. Verdict

**The framework is sound, and I endorse it as written.** Metadata over content,
consent over legitimate interest, revocable, deleted on account deletion,
aggregated after 90 days. That is the correct shape, and §2's "no raw content"
constraint is the decision that keeps this defensible.

I verified the codebase against §5 rather than assuming, and found **three
factual corrections and four gaps** that should be settled before the
implementation slot. None of them change the framework — they change the
implementation work.

---

## §2. Corrections to §5 (verified against the code)

### 2.1 Consent cannot default to `false` on the existing `users` table

§5 says: *"Add `consent_to_improvement: bool` field (default false)"*.

That is correct for a **new column**, but it creates a subtle problem: the
column is `NULL`/`false` for every existing user, and `users` has other
NOT NULL consent fields with a documented invariant (see
`app/models/user.py` lines 90–98):

```
- Both fields are NOT NULL: a user CANNOT sign up without
  agreeing to BOTH documents.
```

So this table's existing convention is **"consent is mandatory at signup"**.
Adding an *optional* consent column to the same table puts two opposite
semantics side by side, where a future reader can easily mistake one for the
other.

**Recommendation:** either
- (a) prefix it clearly, e.g. `improvement_consent_granted` / `improvement_consent_at`, or
- (b) put it in its own table (`user_consents`), which also gives you the audit
  history §7.8 asks for. See §3.2 below.

### 2.2 A boolean cannot satisfy acceptance criterion §7.8

§7.8 requires: *"The consent state is auditable (we can prove when consent was
given/withdrawn)."*

A single `bool` **cannot** prove that. It records the *current* state, not the
history. If a user toggles on → off → on, the boolean says `true` and there is
no evidence of the withdrawal in between.

**This matters legally**, not just technically: under POPIA you may need to
demonstrate *when* consent was obtained and that a withdrawal was honoured
promptly. A boolean cannot do that.

**Recommendation:** an append-only `user_consents` table:

```
id, user_id -> users.id ON DELETE CASCADE
purpose            -- 'product_improvement' (extensible later)
granted            -- bool: true = granted, false = withdrawn
policy_version     -- which privacy notice text they saw
recorded_at        -- audit timestamp
source             -- 'onboarding' | 'settings'
```

Current state = the most recent row for that purpose. History is preserved.
This satisfies §7.8 and costs one small table.

### 2.3 `record_event` gating has a **performance** cost, not just a logic change

§5 says: *"Gate `record_event` on consent status."*

`record_event` is called on **five hot paths** — dashboard view, materials
search, sync push, summary generation, summary cache hit:

```
app/api/v1/dashboard.py:34    DASHBOARD_VIEWED
app/api/v1/materials.py:67    MATERIALS_SEARCHED
app/api/v1/sync.py:38         SYNC_PUSHED
app/api/v1/ai.py:79           SUMMARY_GENERATED / SUMMARY_CACHE_HIT
app/services/analytics_service.py:87,99   internal
```

A naive implementation would add a **`SELECT` on `users` for every one of those
calls**, doubling the query count on the dashboard — the most-hit endpoint in
the app.

**Recommendation:** resolve consent once per request and pass it in, or include
it on the already-loaded `current_user` object (it is loaded by
`get_current_user` on every authenticated request anyway). Never add a query
inside `record_event`.

### 2.4 One correction to §2 Category B

§2 lists *"Search queries (sanitised, no PII)"* as Category B.

**Search queries are already being handled indirectly** — `MATERIALS_SEARCHED`
events are recorded, but **the query string is not stored** (the schema has
`event_type`, `module_code`, `created_at`, `duration_ms` only). So today you get
*"a search happened in COS132"* but not *what was searched for*.

Adding the query text is a **real expansion** of collection, and it is the
category most likely to contain accidental PII (a student may paste an email
address or a name into a search box). If you want it:

- store it **hashed** for frequency analysis, or
- accept only queries that match a known-safe pattern, or
- keep it out of Category B entirely.

**My recommendation: leave query text out for now.** The marginal product value
is lower than the risk, and §2's own principle — "collect the minimum" —
argues against it.

---

## §3. Gaps that are not in the blueprint

### 3.1 The blueprint does not say what "improvement" actually consumes

The framework says *what we collect*, but not *how it is used*. Without that, we
cannot verify minimality — and minimality is the whole legal argument.

Specifically: **what decision will each field inform?**

| Field | Decision it informs | Verdict |
|---|---|---|
| `usage_events` | Which features to build/retire | ✅ justifies itself |
| `duration_ms` | Performance regressions | ✅ justifies itself |
| Quality signal (thumbs up/down) | Prompt/summary quality | ✅ justifies itself |
| Module codes (aggregated) | Materials curation priority | ✅ justifies itself |

All four pass. **But the blueprint should state this table explicitly**, because
it is the artefact you produce if the Information Regulator ever asks "why did
you need this field?" Right now that reasoning exists in your head, not on
paper.

### 3.2 The quality signal needs a design decision now, because it affects the schema

§6 defers *"the specific implementation of quality signals (thumbs up/down UI)"*.

That is reasonable — **but the storage shape should be decided now**, because
it determines the schema, and the schema determines the migration.

The valuable signal for a generation product is not binary approval; it is
**comparison**. "This summary was helpful" is weak. "Summary A was better than
summary B" is strong, and is what actually improves a prompt.

**Recommendation:** design the signal table to allow both:

```
id, user_id -> CASCADE
sample_type        -- 'summary' | 'recommendation' | 'brief_qa' | 'search_ranking'
subject_hash       -- links to the AI cache row (the content_hash already exists)
signal             -- 'helpful' | 'unhelpful' | 'preferred_over'
compared_with      -- nullable; the row this was preferred over
created_at
```

This is cheap now and impossible to retrofit later without losing the data
collected in the meantime.

### 3.3 The blueprint does not address the `ai_summary_caches` input gap

This is the finding from my earlier investigation, and it is **not** covered by
the framework.

`ai_summary_caches` stores:

```
content_hash   -- a SHA-256 fingerprint of the INPUT
summary_text   -- the generated OUTPUT
```

**The input is never stored.** So today, even for a consented user, you have
outputs with no prompts. That is not trainable and not even reliably
reviewable — you cannot tell whether a bad summary was a bad prompt or bad
input.

Under this framework (no raw content), that gap **stays open by design** — and
that is the right call. But it should be stated explicitly, because otherwise
someone will later "fix" it by storing raw notes, which is exactly the breach
the framework exists to prevent.

**Recommendation:** add a line to §2 Category C noting that the input half of
the AI pair is deliberately not retained, and why.

### 3.4 Withdrawal semantics are under-specified

§3.4 says: *"flipping the switch off stops collection immediately. Existing
data: retained per retention policy."*

Two questions the blueprint leaves open:

1. **Does "stop collection" include the existing 90-day window?** If a user
   withdraws on day 10, does their day 1–10 data remain until day 90, or is it
   deleted on withdrawal?

   POPIA does not mandate deletion on withdrawal, but a user who turns the
   switch off and is told "we keep what we already took" may find that
   surprising. **Recommendation: delete Category B rows on withdrawal**, or
   state the retention clearly at the moment of withdrawal.

2. **Is the withdrawal timestamp recorded?** It must be, or §7.8 cannot be
   proven satisfied for a withdrawal (only for a grant).

---

## §4. What I would implement (once you confirm)

Scoped to your framework, with the corrections above:

| File | Change |
|---|---|
| `alembic/versions/0012_improvement_consent_and_signals.py` | New: `user_consents` + `improvement_signals` tables |
| `app/models/analytics.py` | Add `UserConsent`, `ImprovementSignal` models |
| `app/services/consent_service.py` | New: `has_consent()`, `grant()`, `withdraw()`, `current_state()` |
| `app/services/analytics_service.py` | Gate `record_event`; take consent as an argument (no extra query) |
| `app/api/v1/analytics.py` | `POST /analytics/consent`, `GET /analytics/consent` |
| `app/api/v1/ai.py` | Optional `POST /ai/summaries/{hash}/signal` for the quality signal |
| `app/schemas/analytics.py` | `ConsentRequest`, `ConsentState`, `SignalRequest` |
| `tests/test_consent_api.py` | New: consent lifecycle, gating, withdrawal, deletion cascade |
| `tests/test_migration_chain.py` | `EXPECTED_HEAD` → `0012` |
| `plan/MIGRATION_LOG.md` | Add the `0012` row |

**No new packages.** POPIA-relevant tests to include:

- data is **not** recorded when consent is absent
- withdrawal stops collection **immediately**
- account deletion **cascades** to consent + signal rows
- consent state is **auditable** (grant and withdrawal both timestamped)
- no raw content is stored anywhere in the new tables

---

## §5. Questions for you before I build

1. **Consent table vs column** — do you accept §2.2's `user_consents` table, or
   would you rather keep a boolean on `users` and accept that §7.8 cannot be
   fully met?

2. **Withdrawal semantics** — delete Category B data on withdrawal, or retain
   it for the 90-day window with clear disclosure? (§3.4.1)

3. **Quality signal shape** — do you want pairwise comparison
   (`preferred_over`) in the first implementation, or binary thumbs only?
   (§3.2 — affects the schema, so it needs deciding now)

4. **The `ai_summary_caches` input gap** — confirm that leaving it open is
   intentional, so it is documented rather than rediscovered later. (§3.3)

---

## §6. The bottom line

Your framework is right. The corrections above are about making it
**implementable and provable** rather than changing its direction:

- a boolean cannot satisfy your own audit criterion (§2.2)
- gating `record_event` naively doubles queries on the hottest endpoint (§2.3)
- the valuable signal is comparative, and its shape must be decided before the
  migration, not after (§3.2)
- minimality needs to be written down, because that table is the artefact you
  show a regulator (§3.1)

**Answer §5 and I will write the implementation blueprint request or build it
directly, whichever you prefer.**
