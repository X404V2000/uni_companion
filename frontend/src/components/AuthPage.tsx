import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { login, signup } from "../lib/api";
import { describeError, rememberSession } from "../lib/session";

function AuthPage({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);

  // Controlled inputs. The form previously had no state at all, so there was
  // nothing to send even once a handler existed.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /**
   * Whether the "how do I recover my account" panel is open.
   *
   * The link existed and did nothing: it was a <button> with no handler, so a
   * locked-out student clicked the most obvious way out and nothing happened.
   * That is worse than no link at all - it reads as the app being broken at the
   * exact moment the student most needs it to work.
   */
  const [showRecovery, setShowRecovery] = useState(false);

  /**
   * Submit against the real backend.
   *
   * `pending` guards a double submit: the request takes a round trip, and
   * without it a second tap creates a duplicate signup or a second token.
   */
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError("");
    setPending(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        // api.ts sends terms_version and privacy_version itself; the extra
        // object is optional profile detail the signup form does not collect.
        await signup(email.trim(), password, fullName.trim());
        // Signup does not return a token, so log in straight away rather than
        // making the student type the same credentials twice.
        await login(email.trim(), password);
      }
      rememberSession();
      onSuccess();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="relative overflow-hidden bg-[var(--color-surface)] px-6 pb-10 pt-14 text-white">
        <div className="auth-orbit auth-orbit-one" />
        <div className="auth-orbit auth-orbit-two" />
        <div className="relative z-10 flex items-center gap-3 mb-8">
          <div className="logo-mark bg-[var(--color-surface)]">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="font-display text-[17px] font-extrabold leading-none tracking-[-0.03em]">
              Scrapy
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-teal)]">
              Mog
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-teal)]">
          </p>
        </div>
      </div>

      <section className="flex-1 px-5 pt-8 pb-10">
        <div className="mb-7 grid grid-cols-2 rounded-xl bg-[var(--color-surface)] p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-[9px] py-3 text-xs font-extrabold transition ${
              mode === "login"
                ? "bg-[var(--color-surface)] text-[var(--color-surface)] shadow-sm"
                : "text-[var(--color-fg-subtle)]"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-[9px] py-3 text-xs font-extrabold transition ${
              mode === "signup"
                ? "bg-[var(--color-surface)] text-[var(--color-surface)] shadow-sm"
                : "text-[var(--color-fg-subtle)]"
            }`}
          >
            Sign up
          </button>
        </div>

        <div className="mb-7">
        </div>

        {/*
          RECOVERY PANEL.

          Never says "check your email": there is no email delivery yet, so that
          would be a promise the product cannot keep and a student would sit
          waiting for a message that never arrives. It says what is true - a
          person sends you a link - and gives the one thing the student can act
          on right now, which is who to ask.

          It replaces the form rather than sitting above it, so a locked-out
          student is not looking at a password box they cannot fill.
        */}
        {showRecovery ? (
          <div className="rounded-2xl border border-[var(--color-teal)]/40 bg-[var(--color-teal)]/8 p-5">
            <h2 className="font-display text-base font-extrabold">Get back into your account</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
              Recovery is handled by a person, not automatically, so that a
              locked-out account is never left to a waiting email.
            </p>

            <ol className="mt-4 space-y-3 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
              <li className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-teal)] text-[10px] font-extrabold text-[var(--color-bg)]">
                  1
                </span>
                <span>
                  Message support and say <strong>“I am locked out”</strong> with
                  the email address you signed up with.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-teal)] text-[10px] font-extrabold text-[var(--color-bg)]">
                  2
                </span>
                <span>
                  You will get back a <strong>recovery link</strong>. It works
                  once and expires after 30 minutes.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-teal)] text-[10px] font-extrabold text-[var(--color-bg)]">
                  3
                </span>
                <span>
                  Open the link, choose a new password, and sign in as usual.
                </span>
              </li>
            </ol>

            <p className="mt-4 rounded-xl bg-[var(--color-bg)]/60 p-3 text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
              Only the person holding the link can use it, and it stops working
              the moment it has been used. If it has expired, ask for a new one —
              that costs nothing and cancels the old link.
            </p>

            <button
              type="button"
              onClick={() => setShowRecovery(false)}
              className="mt-4 w-full rounded-xl bg-[var(--color-surface)] py-3 text-[11px] font-extrabold text-[var(--color-fg)]"
            >
              Back to sign in
            </button>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold text-[var(--color-fg-muted)]">Full name</span>
              <span className="relative block">
                <Icon name="user" className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--color-fg-muted)]" />
                <input
                  required
                  autoComplete="name"
                  placeholder="e.g. Thando Mokoena"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="h-14 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-11 pr-4 text-sm outline-none transition placeholder:text-[var(--color-fg-muted)] focus:border-[var(--color-teal)] focus:ring-3 focus:ring-[var(--color-teal)]/10"
                />
              </span>
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-[11px] font-bold text-[var(--color-fg-muted)]">Email address</span>
            <span className="relative block">
              <Icon name="mail" className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--color-fg-muted)]" />
              <input
                required
                type="email"
                autoComplete="email"
                placeholder="student@university.ac.za"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-14 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-11 pr-4 text-sm outline-none transition placeholder:text-[var(--color-fg-muted)] focus:border-[var(--color-teal)] focus:ring-3 focus:ring-[var(--color-teal)]/10"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 flex items-center justify-between text-[11px] font-bold text-[var(--color-fg-muted)]">
              Password
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setShowRecovery(true);
                    setError("");
                  }}
                  className="font-bold text-[var(--color-success)] underline-offset-2 hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </span>
            <span className="relative block">
              <Icon name="lock" className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--color-fg-muted)]" />
              <input
                required
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === "signup" ? 8 : 6}
                className="h-14 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-11 pr-12 text-sm outline-none transition placeholder:text-[var(--color-fg-muted)] focus:border-[var(--color-teal)] focus:ring-3 focus:ring-[var(--color-teal)]/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <Icon name="eye" className="h-[18px] w-[18px]" />
              </button>
            </span>
          </label>

          {mode === "signup" && (
            <label className="flex items-start gap-3 pt-1 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              <input required type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-success)]" />
              <span>
                I agree to the{" "}
                <button type="button" className="font-bold text-[var(--color-success)]">Terms of Use</button>
                {" "}and{" "}
                <button type="button" className="font-bold text-[var(--color-success)]">Privacy Policy</button>.
              </span>
            </label>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-4 py-3 text-[12px] leading-relaxed text-[var(--color-danger)]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-surface)] text-sm font-extrabold text-white shadow-lg shadow-[var(--color-surface)]/15 transition active:scale-[0.98]"
          >
            {mode === "login" ? "Log in to your account" : "Create free account"}
            <Icon name="arrow" className="h-4 w-4" />
          </button>
        </form>
        )}

        <div className="my-7 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
            Secure student access
          </span>
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <div className="flex items-center justify-center gap-2 text-center text-[11px] text-[var(--color-fg-subtle)]">
          <Icon name="lock" className="h-3.5 w-3.5 text-[var(--color-teal)]" />
          Your study data stays private and protected.
        </div>
      </section>
    </main>
  );
}


export default AuthPage;
