# Data Collection Framework

**Purpose of this document.** It records *what* personal information Varsity
Companion collects, *why* each piece is necessary, and *how* a user's choices
about it are honoured. POPIA requires that personal information be "adequate,
relevant and not excessive" for the purpose it is processed for — the field
tables below are the evidence for that claim. If the Information Regulator asks
why a field exists, the answer is here.

**Owner:** Varsity Companion
**Policy version:** `1.0` (recorded against every consent row)
**Last updated:** 29 September 2026

---

## 1. The principle

**Collect metadata about interactions, not user content.**

There are three ways to get this wrong, and this framework avoids all three:

| Failure | Consequence |
|---|---|
| Collecting everything "just in case" | Unlawful processing; over-collection is itself a breach |
| Collecting nothing because it feels risky | The product cannot improve; the AI never gets better |
| Collecting the wrong things (content, identities) | Legal exposure with no product benefit |

---

## 2. Two categories, two justifications

### Category A — Service operation (no separate consent required)

Necessary to provide the service the user asked for, under the *contract
necessity* justification. A user cannot receive an academic tracker without
their modules and deadlines being stored.

| Data | Purpose | Justification |
|---|---|---|
| Email address | Authentication | Contract necessity |
| Hashed password (bcrypt) | Authentication | Contract necessity |
| Module codes and names | Course-aware personalisation | Contract necessity |
| Deadlines, priorities, weights | Academic tracker | Contract necessity |
| Timetable slots | Academic tracker | Contract necessity |
| AI quota usage | Cost control | Contract necessity |
| Consent decisions | Proof of compliance | Legal obligation |

Category A is **not** used to improve the product.

### Category B — Product improvement (explicit consent required)

Collected only when the user has actively opted in, and deleted immediately if
they opt out.

| Data | Decision it informs | Why it is necessary |
|---|---|---|
| Interaction events (`usage_events`) | Which features to build, fix or retire | Without it, prioritisation is guesswork |
| Feature success/failure signals | Where the app fails in practice | Reveals breakage users do not report |
| Latency measurements (`duration_ms`) | Performance regressions | Catches degradation before it is complained about |
| AI quality signals (`improvement_signals`) | Prompt and summary quality | The only direct evidence an output was useful |
| Module codes used (aggregated) | Which modules to curate materials for | Directs curation effort where demand is |

**Every field above must name a decision it informs.** A field that cannot is
not collected. This is the minimality test.

---

## 3. Category C — never collected

| Data | Why not |
|---|---|
| Raw user content (notes, assignments, summaries) | High risk, low marginal value over metadata. Not needed: the useful signal is *which output was preferred*, not what it said. |
| The AI input half of a (input, output) pair | Deliberately not retained. See §5. |
| Full names beyond display | Not needed to improve the product |
| University name per user | Aggregated demand is enough; per-user is not |
| Location data | Invasive, unnecessary |
| Device fingerprints | Invasive, unnecessary |
| Search query *text* | Not currently stored. If ever added it would be a real expansion of collection and the category most prone to accidental identifiers, so it requires its own justification first. |

---

## 4. Consent mechanics

Consent must be **informed, specific, and revocable**.

| Aspect | Implementation |
|---|---|
| **Default** | Off. No consent row means no consent. |
| **Where** | `POST /api/v1/analytics/consent` with `source` of `onboarding` or `settings` |
| **Audit** | Every grant and withdrawal is an append-only row in `user_consents`, with timestamp, source and policy version |
| **Withdrawal** | Records the withdrawal **and deletes all Category B data in the same transaction** — either both happen or neither does |
| **Proof** | `GET /api/v1/analytics/consent/history` returns the full sequence |

**Why a table rather than a boolean.** A boolean records the current state but
not the history. A user who toggles on → off → on would show `true`, with no
evidence the withdrawal ever happened. POPIA may require demonstrating that a
withdrawal was honoured, and a boolean cannot do that.

**Why withdrawal deletes immediately.** No grace period. When a user turns the
switch off, the expectation is that the data stops being *held*, not merely that
it stops *growing*. Being more generous than the law requires costs almost
nothing and removes an argument.

---

## 5. The deliberate gap: no (input, output) training pair

`ai_summary_caches` stores the generated summary and only a **SHA-256 hash** of
the input. The student's original notes are not retained.

**This is intentional.** It means there is no (input, output) pair available for
fine-tuning. Under this framework that is the correct trade: storing raw
lecture notes is the highest-risk, lowest-marginal-value data we could hold.

**Anyone tempted to "close" this gap by storing the input should not.** That
change would:
1. Introduce a category of data this framework exists to exclude (§3).
2. Require a new, separate consent — the existing consent covers *metadata*, not
   content.
3. Invalidate the minimality argument above for every other field, because the
   collection would no longer be demonstrably minimal.

The signal we actually need is behavioural: which output a user preferred. That
is captured by `improvement_signals`, without content.

---

## 6. Retention and deletion

| Data | Retention | Rationale |
|---|---|---|
| Category A | While the account is active, then the existing POPIA soft-delete window (30 days) before hard purge | Mirrors the existing policy |
| Category B | Until withdrawal, or 90 days, whichever comes first | Long enough to spot a pattern, short enough to limit exposure |
| Consent audit rows | While the account exists | Proof of compliance; a record that outlives the account would itself be a breach |
| Aggregated / anonymised | Indefinite | Not personal information once re-identification is impossible |

**On account deletion**, `ON DELETE CASCADE` on both `user_consents` and
`improvement_signals` means the existing hard purge removes them. Verified by
`test_account_deletion_cascades_to_consent_and_signals`.

**On withdrawal**, usage events and improvement signals are deleted
immediately. Consent rows are **not** deleted — the withdrawal record *is* the
audit evidence. Verified by `test_withdrawal_keeps_its_own_audit_row`.

---

## 7. Security safeguards

| Measure | Implementation |
|---|---|
| No content at rest | Neither table has a column capable of holding user text. Enforced structurally, not by discipline — asserted by `test_signal_table_columns_are_metadata_only`, which allow-lists the exact column set so an added column fails CI. |
| Bounded fields | `subject_hash` is `VARCHAR(64)` (a SHA-256 digest), so content cannot be smuggled into a hash field. |
| Tenant isolation | Both tables are per-user with `ON DELETE CASCADE`; a user's rows are unreachable by another user. |
| Valid values only | `signal` and `source` are constrained both in Pydantic and by database CHECK constraints, so an invalid value cannot be written even by a script bypassing the API. |
| Access control | All consent endpoints require authentication; a user can only read and change their own state. |
| Encryption in transit | HTTPS only; the API is not served over plain HTTP. |

---

## 8. User rights (POPIA)

| Right | Where it is exercised |
|---|---|
| To be informed | This document and the privacy notice at the point of consent |
| To object / withdraw | `POST /analytics/consent` with `granted: false` — immediate effect |
| To access | `GET /analytics/consent/history` |
| To delete | Account deletion cascades to all consent and signal rows |
| To not be subject to automated decisions | Not applicable; signals are not used for automated decision-making about users |

---

## 9. Verification

Compliance claims are only as good as their tests. These run on every change:

| Guarantee | Test |
|---|---|
| No collection without consent | `test_record_event_skipped_without_consent` |
| A missing flag is safe, not permissive | `test_record_event_defaults_to_no_write` |
| Wrappers also gated (not just the inner function) | `test_duration_events_also_gated` |
| Withdrawal stops collection | `test_withdrawal_stops_collection_immediately` |
| Withdrawal deletes existing data | `test_withdrawal_deletes_existing_category_b_data` |
| The withdrawal record survives its own purge | `test_withdrawal_keeps_its_own_audit_row` |
| Deletion cascades | `test_account_deletion_cascades_to_consent_and_signals` |
| History is provable (the boolean argument) | `test_consent_history_is_preserved` |
| Consent resolution costs one query, not one per event | `test_consent_resolution_is_one_query_per_request` |
| No content columns can be added unnoticed | `test_signal_table_columns_are_metadata_only` |
| Database enforces valid values, not just the API | `test_both_check_constraints_exist_by_name` |

---

## 10. Changing this framework

Any change that adds a field must answer, in this document:

1. **What decision does it inform?** If none, it is not collected.
2. **Which category is it — A, B or C?** Category B requires it to be gated on
   consent; Category C cannot be collected at all.
3. **Does the existing consent cover it?** If the collection expands, the
   policy version must be incremented so new consents are distinguishable from
   old ones taken under narrower terms.
