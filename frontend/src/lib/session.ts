/**
 * Session helpers for the re-wired shell.
 *
 * Split out from api.ts so the token lifecycle has one owner. api.ts already
 * owns the token in localStorage, and duplicating that logic here would create
 * two sources of truth that drift.
 */
import { ApiError, clearToken, getMe, getToken, type AccountProfile } from "./api";

/** Where the shell remembers that a session exists. */
const MARKER = "vc.session";

/**
 * Restore an existing session on page load.
 *
 * The marker only records that a token was issued, never the user. The token is
 * then validated against the server, so a stale or revoked token is rejected
 * rather than trusted. Checking the marker alone would let an expired session
 * render the dashboard before the first failed request.
 *
 * Returns null when there is no valid session, which is a normal outcome and
 * not an error.
 */
export async function restoreSession(): Promise<AccountProfile | null> {
  if (!getToken()) return null;

  try {
    return await getMe();
  } catch {
    // Token is present but unusable - expired, revoked, or signed with a key
    // that has since rotated. Clearing it means the user gets a login screen
    // rather than a dashboard that fails on every action.
    clearToken();
    localStorage.removeItem(MARKER);
    return null;
  }
}

/** Record that a session was established. */
export function rememberSession(): void {
  localStorage.setItem(MARKER, "1");
}

/** Forget the session locally. */
export function forgetSession(): void {
  clearToken();
  localStorage.removeItem(MARKER);
}

/**
 * Turn an unknown thrown value into something worth showing a user.
 *
 * api.ts raises ApiError with a server-supplied detail where available, but a
 * network failure arrives as a bare TypeError ("Failed to fetch"), which means
 * nothing to a student. Those are translated here so the login screen can say
 * something true and actionable.
 */
export function describeError(error: unknown): string {
  // STATUS FIRST, PROSE SECOND.
  //
  // The previous version only string-matched "Failed to fetch", so every HTTP failure
  // that carried a status was flattened into whatever the backend happened to say - or
  // into a generic sentence if it said nothing useful. `ApiError.status` was available
  // the whole time and was not being used. Matching on prose is fragile: the string
  // changes with the browser, the locale, and the fetch implementation.
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return "Cannot reach the server. Check your connection and try again.";
    }
    if (error.status === 401) {
      return "Your session expired. Please sign in again.";
    }
    if (error.status === 429) {
      // NEUTRAL, DELIBERATELY. This helper is shared, so a 429 raised by a rate-limited
      // LOGIN would otherwise be told "Daily summary limit reached" - a specific and
      // wrong claim about which limit was hit. Naming the general situation is honest;
      // a caller that knows the context can say more.
      return "Too many requests. Wait a moment and try again.";
    }
    if (error.status === 503) {
      return "That service is temporarily unavailable. Try again in a moment.";
    }
    if (error.status >= 500) {
      return "The server had a problem. Try again shortly.";
    }
    // A 4xx detail is written for a human, so prefer it over anything generic.
    if (error.message.trim()) return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);

    if (message.includes("Failed to fetch")) {
      return "Cannot reach the server. Check your connection and try again.";
    }
    // The backend returns 503 with a clear detail when no AI key is configured;
    // pass that through rather than flattening it to a generic failure.
    if (message.trim()) return message;
  }
  return "Something went wrong. Please try again.";
}
