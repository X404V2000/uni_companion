/**
 * components/ResetPasswordPage.tsx
 *
 * Set a new password from a recovery token.
 *
 * WHY THIS IS OUTSIDE THE AUTH GATE
 * ---------------------------------
 * The student using it is locked out - they cannot sign in, so they can never
 * reach a screen that requires a session. This page is rendered before the
 * `authenticated` check, exactly like the sign-in screen.
 *
 * WHY THE TOKEN COMES FROM THE URL
 * --------------------------------
 * The admin generates it and sends it directly (WhatsApp, SMS, in person). The
 * student opens `/reset?token=...` and lands on a page that already knows what
 * to do. Asking them to paste a 43-character secret by hand is how recovery
 * fails at the last step.
 *
 * WHY THERE IS NO "FORGOT PASSWORD" LINK ON THE SIGN-IN SCREEN
 * -----------------------------------------------------------
 * There is no self-service flow to link to: email is not configured, so recovery
 * is human. A link that opened "check your email" would be a dead end and a
 * promise the product cannot keep. The sign-in screen instead tells the student
 * to ask for a link, which is true.
 *
 * WHY THE CONFIRMATION IS NOT A TOAST
 * -----------------------------------
 * On success the student is sent back to sign in. That redirect is the feedback;
 * a toast would flash and vanish during the transition, which is the same
 * mistake that made "Account deleted" invisible after a delete.
 */
import { useMemo, useState } from "react";

import { api } from "../lib/api";
import { describeError } from "../lib/session";
import { Icon } from "./Icon";

const MIN_PASSWORD = 8;

export default function ResetPasswordPage({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  // Read once. The token must survive the student typing, but it does not need
  // to react to URL changes.
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token")?.trim() ?? "";
  }, []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // A missing token is not the student's fault and there is nothing they can do
  // on this page, so say exactly what happened and how to fix it.
  if (!token) {
    return (
      <Shell>
        <h1 className="font-display text-xl font-extrabold">Recovery link missing</h1>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
          This page needs a recovery link from your lecturer or from support. Ask
          for one, then open the link they send you.
        </p>
        <BackButton onClick={onBackToSignIn} />
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-teal)]/15">
          <Icon name="check" className="h-5 w-5 text-[var(--color-teal)]" />
        </div>
        <h1 className="mt-3 font-display text-xl font-extrabold">Password updated</h1>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
          Sign in with your new password.
        </p>
        <button
          onClick={onBackToSignIn}
          className="mt-5 w-full rounded-xl bg-[var(--color-teal)] py-3 text-xs font-extrabold text-[var(--color-bg)]"
        >
          Go to sign in
        </button>
      </Shell>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD) {
      setError(`Your new password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await api("/api/v1/password-reset/complete", {
        method: "POST",
        body: { token, new_password: password },
      });
      setDone(true);
    } catch (err) {
      // The API returns one sentence for invalid, used or expired. Do not guess
      // which - the student's next step is the same either way.
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <h1 className="font-display text-xl font-extrabold">Set a new password</h1>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
        Choose something you will remember. This link works once and expires 30
        minutes after it was created.
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs outline-none"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          autoComplete="new-password"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs outline-none"
        />

        {error && (
          <p role="alert" className="text-[11px] leading-relaxed text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[var(--color-teal)] py-3 text-xs font-extrabold text-[var(--color-bg)] disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Set new password"}
        </button>
      </form>

      <BackButton onClick={onBackToSignIn} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-[var(--color-teal)]" />
          <span className="font-display text-sm font-extrabold">Varsity Companion</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-4 w-full text-center text-[11px] font-bold text-[var(--color-fg-subtle)] underline"
    >
      Back to sign in
    </button>
  );
}
