/**
 * src/lib/consent.ts — POPIA consent, client side.
 *
 * THE RULE THIS ENFORCES
 * ----------------------
 * Usage events are Category B data under POPIA: they may only be stored once the
 * student has agreed. The backend already refuses to write them without consent
 * (see app/services/analytics_service.py), and this module makes the client
 * behave the same way rather than relying on the server to catch it.
 *
 * Defence in depth is the point. If the client sends events the server drops them
 * anyway, so sending them is wasted bandwidth on a connection where bandwidth is
 * the scarce resource - which is the whole reason this app exists.
 *
 * CONSENT IS READ ONCE PER SESSION, NOT PER EVENT
 * -----------------------------------------------
 * The backend resolves consent once per request and hangs it on the user object,
 * specifically to avoid a database round trip per event. The mobile equivalent is
 * to fetch the state after login, keep it in memory, and update it only when the
 * student changes it.
 *
 * THE ENDPOINTS ALREADY EXIST — NO BACKEND WORK WAS NEEDED
 * --------------------------------------------------------
 *   POST /api/v1/analytics/consent   grant or withdraw
 *   GET  /api/v1/analytics/consent   current state
 * Both shipped with migration 0012.
 *
 * WIRE SHAPE IS TAKEN FROM THE SCHEMAS, NOT GUESSED
 * -------------------------------------------------
 * First draft of this file assumed a `purpose` query parameter on GET, a
 * `purpose` and `policy_version` field on POST, and a `recorded_at` response
 * field. Reading app/schemas/analytics.py showed all three were wrong: the
 * request carries only `granted` and `source`, the response carries
 * `granted`, `policy_version` and `updated_at`, and the route takes no query
 * parameters at all. The shapes below match the real schema.
 */
import { useCallback, useEffect, useState } from "react";

import { api } from "./api";

/**
 * Where the consent decision was made.
 *
 * The backend constrains this to a closed set with a database CHECK constraint,
 * so it is a union here rather than a free string: a typo becomes a compile
 * error instead of a 422 at runtime.
 */
export type ConsentSource = "onboarding" | "settings";

/** Response of GET and POST /api/v1/analytics/consent. */
export type ConsentState = {
  granted: boolean;
  policy_version: string | null;
  updated_at: string | null;
};

/** Read the current state. Read-only on the server; never mutates. */
export async function fetchConsent(): Promise<ConsentState> {
  return api<ConsentState>("/api/v1/analytics/consent");
}

/**
 * Grant or withdraw.
 *
 * On the server, withdrawing also deletes this user's Category B data in the
 * same transaction, so a withdrawal can never be recorded while the data it
 * refers to survives. That is deliberate and is why this call is not treated as
 * a lightweight toggle in the UI.
 */
export async function setConsent(
  granted: boolean,
  source: ConsentSource,
): Promise<ConsentState> {
  return api<ConsentState>("/api/v1/analytics/consent", {
    method: "POST",
    body: { granted, source },
  });
}

/**
 * Consent state for the current session.
 *
 * `granted` is `null` until the first fetch resolves. That tri-state matters:
 * "not yet known" must never be treated as "declined", or a student who has
 * already consented is re-asked on every launch and their events are dropped in
 * the meantime.
 */
export function useConsent() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = await fetchConsent();
        if (!cancelled) setGranted(state.granted);
      } catch {
        // A failure here must not block the app. "Not granted" is the
        // privacy-safe default: no telemetry is sent, and the student is simply
        // asked again later.
        if (!cancelled) setGranted(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (next: boolean, source: ConsentSource) => {
    const previous = granted;
    // Optimistic: the student tapped, so the control should move immediately.
    setGranted(next);
    try {
      const state = await setConsent(next, source);
      setGranted(state.granted);
      return state;
    } catch (error) {
      // Never lie about consent. If the server refused, the control must snap
      // back rather than show a state we did not manage to record.
      setGranted(previous);
      throw error;
    }
  }, [granted]);

  return { granted, loading, update };
}
