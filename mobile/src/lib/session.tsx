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

import { ApiError, clearToken, getMe, loadToken } from "./api";

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

/**
 * Did the server actually reject this credential, or did we simply fail to reach
 * it?
 *
 * Exported so it can be unit-tested directly. This branch previously decided by
 * searching the error message for the word "session", which is a defect
 * generator: an unreachable server phrased that way would sign a student out.
 *
 * `status === 0` is set by api.ts when fetch itself throws - DNS failure, no
 * connection, CORS. The request never reached the server, so the token cannot
 * have been rejected.
 */
export function isRejectedCredential(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401 || error.status === 403;
  }
  // Anything that is not our typed error (a TypeError from fetch, a programming
  // error) is not evidence that the credential is bad.
  return false;
}

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
        // Distinguish a rejected token from an unreachable server, and decide by
        // HTTP STATUS, never by the text of the message.
        //
        // WHY NOT STRING MATCHING
        // -----------------------
        // This previously read:
        //   message.includes("expired") || ... .includes("session")
        // which is wrong in both directions. A network error phrased "Failed to
        // reach session service" contains "session" and would sign the student
        // out on a connection blip. A 401 whose body happens to use none of
        // those words signs them out never, leaving them stuck on an
        // authenticated screen that cannot load. An error message is prose, and
        // prose changes; a status code is a contract.
        //
        // ApiError carries `status` and is set to 0 for a request that never
        // completed. 401/403 mean the credential is genuinely rejected; anything
        // else, including a timeout or a 5xx, is treated as "the server is
        // unreachable" and the student stays signed in.
        const rejected = isRejectedCredential(error);

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
