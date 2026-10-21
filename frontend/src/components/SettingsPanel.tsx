/**
 * components/SettingsPanel.tsx
 *
 * The settings screen: account, privacy consent, sign out, delete account.
 *
 * WHY THIS EXISTS (TASK-0004, users 1 and 2)
 * ------------------------------------------
 * Two of eleven users reported:
 *
 *   "cannot get access settings"
 *   "you cannot delete account after creating it"
 *
 * Neither was a broken feature. The web client had NO settings screen at all: no route, no
 * component, nothing behind the gear icon. But the backend had implemented both halves -
 * `DELETE /api/v1/auth/account` with password re-authentication, and the POPIA consent
 * endpoints - and nothing in the interface reached them.
 *
 * That is worse than a missing button. The right to have your data removed existed in the
 * API and was unreachable in the product, in an app that holds student academic data. For
 * POPIA a right you cannot exercise is not a right.
 *
 * WHY A FULL-SCREEN PANEL RATHER THAN A MODAL
 * -------------------------------------------
 * The shell has no modal primitive, and adding one is a design decision larger than this
 * task. A panel that replaces the tab content reuses the existing header/back pattern and
 * is the smaller change.
 *
 * WHY DELETE REQUIRES THE PASSWORD
 * --------------------------------
 * The endpoint deliberately requires it. A left-open session on a shared machine must not be
 * able to destroy an account. The client does not implement a shortcut around that, and it
 * does not clear the session on a wrong password - a failed delete must leave the student
 * exactly where they were, able to try again or walk away.
 */
import { useEffect, useState } from "react";

import { Icon } from "./Icon";
import { ApiError, api, getMe, logout } from "../lib/api";
import { describeError } from "../lib/session";

type Profile = { email?: string; full_name?: string };

export default function SettingsPanel({
  onBack,
  onSignedOut,
}: {
  onBack: () => void;
  onSignedOut: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);

  // Consent. `granted` starts as null so the toggle can render a neutral state until the
  // server has told us the truth - rendering "off" before we know would display a decision
  // the student may not have made.
  const [consent, setConsent] = useState<boolean | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState("");

  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const me = await getMe();
        if (!cancelled) setProfile(me as Profile);
      } catch {
        // The profile is context, not the point of the screen. A failure here must not
        // block consent or deletion, so it degrades to blank rather than an error state.
      }

      try {
        const state = await api<{ granted: boolean }>("/api/v1/analytics/consent");
        if (!cancelled) setConsent(Boolean(state.granted));
      } catch (err) {
        if (!cancelled) setConsentError(describeError(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleConsent() {
    if (consent === null || consentBusy) return;
    const next = !consent;

    setConsentBusy(true);
    setConsentError("");
    // Optimistic, then corrected on failure. A toggle that waits for a round trip on a
    // slow connection reads as broken, and this setting is not destructive.
    setConsent(next);

    try {
      await api("/api/v1/analytics/consent", {
        method: "POST",
        body: { granted: next },
      });
    } catch (err) {
      setConsent(!next);
      setConsentError(describeError(err));
    } finally {
      setConsentBusy(false);
    }
  }

  async function signOut() {
    // Delegates to the shell's sign-out path rather than duplicating it, so the
    // server-first ordering is defined in exactly one place.
    await logout();
    onSignedOut();
  }

  async function deleteAccount() {
    if (deleteBusy) return;
    if (!password.trim()) {
      setDeleteError("Enter your password to confirm.");
      return;
    }

    setDeleteBusy(true);
    setDeleteError("");

    try {
      await api("/api/v1/auth/account", {
        method: "DELETE",
        body: { password },
      });
      // No toast here. The toast renders inside the authenticated shell, and this call
      // immediately tears that shell down - so the message would be created and destroyed
      // in the same frame, never seen. The login screen IS the confirmation: the student is
      // signed out and cannot sign back in, which is the consequence they were warned about.
      onSignedOut();
    } catch (err) {
      // A wrong password must leave the student exactly where they were.
      if (err instanceof ApiError && err.status === 401) {
        setDeleteError("That password is not correct.");
      } else {
        setDeleteError(describeError(err));
      }
      setPassword("");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[480px] px-4 py-3 sm:max-w-[640px]">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-[11px] font-extrabold text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
      >
        <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
        Back
      </button>

      <h1 className="mb-5 font-display text-2xl font-extrabold">Settings</h1>

      {/* ── Account ─────────────────────────────────────────────────────── */}
      <section className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
          Account
        </p>
        <p className="text-sm font-bold text-[var(--color-fg)]">{profile?.full_name || "—"}</p>
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{profile?.email || "—"}</p>
      </section>

      {/* ── Privacy ─────────────────────────────────────────────────────── */}
      <section className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
          Privacy
        </p>

        <button
          onClick={() => void toggleConsent()}
          disabled={consent === null || consentBusy}
          role="switch"
          aria-checked={consent === true}
          className="flex w-full items-center justify-between gap-4 text-left disabled:opacity-60"
        >
          <span>
            <span className="block text-sm font-bold text-[var(--color-fg)]">
              Help improve Varsity Companion
            </span>
            <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
              Anonymous usage signals only. No notes, no assignment text.
            </span>
          </span>
          {/* A plain track-and-knob switch rather than a library component - one more
              dependency for a two-state control is not worth it. */}
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              consent === true ? "bg-[var(--color-accent)]" : "bg-[var(--color-raised)]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--color-fg)] transition-all ${
                consent === true ? "left-[22px]" : "left-0.5"
              }`}
            />
          </span>
        </button>

        {consentError && (
          <p role="alert" className="mt-3 text-[11px] text-[var(--color-danger)]">
            {consentError}
          </p>
        )}
      </section>

      {/* ── Session ─────────────────────────────────────────────────────── */}
      <section className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
          Session
        </p>
        <button
          onClick={() => void signOut()}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-3 text-xs font-extrabold text-[var(--color-fg)] transition-colors hover:bg-[var(--color-raised)]"
        >
          Sign out
        </button>
      </section>

      {/* ── Delete ──────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 p-5">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-danger)]">
          Delete account
        </p>

        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="w-full rounded-xl border border-[var(--color-danger)]/50 py-3 text-xs font-extrabold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
          >
            Delete my account
          </button>
        ) : (
          <div>
            {/* The consequence, stated as a fact rather than as a plea. */}
            <p className="text-xs leading-relaxed text-[var(--color-fg-muted)]">
              This deactivates your account and removes your data. You will be signed out.
              This cannot be undone.
            </p>

            <label className="mt-4 block">
              <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                Current password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-danger)]"
              />
            </label>

            {deleteError && (
              <p role="alert" className="mt-3 text-[11px] text-[var(--color-danger)]">
                {deleteError}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setShowDelete(false);
                  setPassword("");
                  setDeleteError("");
                }}
                disabled={deleteBusy}
                className="flex-1 rounded-xl border border-[var(--color-border)] py-2.5 text-xs font-extrabold text-[var(--color-fg-muted)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void deleteAccount()}
                disabled={deleteBusy}
                className="flex-1 rounded-xl bg-[var(--color-danger)] py-2.5 text-xs font-extrabold text-[var(--color-fg-on-accent)] disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
