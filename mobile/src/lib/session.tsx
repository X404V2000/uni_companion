/**
 * src/lib/session.tsx — who is signed in, shared across the whole app.
 *
 * THE BUG THIS FIXES
 * ------------------
 * The first version of the root layout held a `session` state of its own and
 * rendered the sign-in screen inside a `Stack.Protected guard={signed-out}`.
 * Signing in worked — the API returned 200 and the token was stored — but the
 * app bounced straight back to the login screen.
 *
 * The cause: sign-in called `router.replace("/")`, but the root layout's
 * `session` was still "signed-out", so the `(tabs)` group was guard-disabled and
 * "/" resolved to no route at all. The router then fell back to the only
 * available route, which was the login screen. Nothing threw. Nothing logged. It
 * simply looked like login did not work.
 *
 * The structural mistake was that the component which performs a login had no way
 * to tell the component which gates the routes that a login had happened. A
 * shared context is the fix: one source of truth, settable from anywhere, read by
 * the guard.
 *
 * WHY NOT JUST RE-MOUNT OR POLL
 * -----------------------------
 * Re-mounting loses the whole navigation stack. Polling means the app is
 * briefly, reliably wrong. One piece of state that every screen agrees on is
 * simpler and has no failure mode.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { clearToken, getMe, loadToken } from "./api";

export type SessionStatus = "checking" | "signed-in" | "signed-out";

export type SessionUser = {
  id?: string;
  email?: string;
  full_name?: string;
} | null;

type SessionValue = {
  status: SessionStatus;
  user: SessionUser;
  /** Call after a successful login. The guard re-evaluates immediately. */
  markSignedIn: () => Promise<void>;
  /** Call to sign out. Clears the credential and returns to the auth flow. */
  markSignedOut: () => Promise<void>;
  /** Re-read the profile, e.g. after editing it. */
  refreshUser: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [user, setUser] = useState<SessionUser>(null);

  const refreshUser = useCallback(async () => {
    try {
      const me = await getMe();
      setUser((me as SessionUser) ?? null);
    } catch {
      // A failed profile read does not sign anyone out; the token may still be
      // valid on a flaky connection.
    }
  }, []);

  // Cold start: read the keystore, then prove the token still works.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await loadToken();
      if (cancelled) return;

      if (!token) {
        setStatus("signed-out");
        return;
      }

      try {
        await refreshUser();
        if (!cancelled) setStatus("signed-in");
      } catch (error) {
        // Distinguish a rejected token from an unreachable server. Only the
        // former should sign the student out; the latter would log them out
        // every time they open the app on a bad connection.
        const message = error instanceof Error ? error.message : "";
        const rejected =
          message.toLowerCase().includes("expired") ||
          message.toLowerCase().includes("not authenticated") ||
          message.toLowerCase().includes("session");

        if (rejected) {
          await clearToken();
          if (!cancelled) {
            setUser(null);
            setStatus("signed-out");
          }
        } else if (!cancelled) {
          setStatus("signed-in");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const markSignedIn = useCallback(async () => {
    // The token is already stored by login(). This flips the gate and loads the
    // profile, in that order, so the guard is satisfied before the tabs render.
    setStatus("signed-in");
    await refreshUser();
  }, [refreshUser]);

  const markSignedOut = useCallback(async () => {
    await clearToken();
    setUser(null);
    setStatus("signed-out");
  }, []);

  const value = useMemo(
    () => ({ status, user, markSignedIn, markSignedOut, refreshUser }),
    [status, user, markSignedIn, markSignedOut, refreshUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    // A loud failure is right here: a screen outside the provider would silently
    // read a default and never navigate, which is the exact class of bug this
    // module exists to remove.
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return ctx;
}
