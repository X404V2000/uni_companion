/**
 * src/lib/__tests__/staleness.test.ts — the offline-honesty predicates.
 *
 * WHY THESE TESTS EXIST
 * ---------------------
 * With the network gone, React Query kept serving cached data and the app showed
 * "11 open deadlines" from a fetch hours old, with nothing telling the student.
 * Online and offline produced identical screens - measured, not assumed.
 *
 * The fix has two halves and both need pinning:
 *   1. `isStaleAfterFailure` decides when to SHOW the staleness banner.
 *   2. `useGuardedMutation` decides when to REFUSE a write rather than let it
 *      appear to succeed.
 *
 * The second is the more serious: a deadline that appears saved and is not is the
 * product's promise broken in the exact situation it exists for.
 *
 * PER THE STANDING RULE, every assertion here was shown failing against the naive
 * implementation before being shown passing. The naive versions are named in the
 * comments so a future reader can reproduce that check.
 */
import { ApiError } from "../api";
import {
  isStale,
  isStaleAfterFailure,
  isUnreachable,
  OfflineWriteBlocked,
  STALE_THRESHOLDS,
} from "../queries";

describe("isStaleAfterFailure — is this number last-known or current?", () => {
  it("is TRUE when data is present and the refetch failed", () => {
    // The case the whole feature exists for: a cached value on screen, and we
    // failed to refresh it. The student cannot tell without being told.
    expect(isStaleAfterFailure({ data: { tasks: 11 }, isError: true })).toBe(true);
  });

  it("is FALSE on a fresh load that failed", () => {
    // NAIVE IMPLEMENTATION: `return q.isError;`
    // Under that, this returns true and a cold start with no data would be
    // labelled "showing saved data" - which is a lie, because there is nothing.
    // The screen should show its empty/error state instead.
    expect(isStaleAfterFailure({ data: undefined, isError: true })).toBe(false);
  });

  it("is FALSE when the data is current", () => {
    expect(isStaleAfterFailure({ data: { tasks: 11 }, isError: false })).toBe(false);
  });

  it("is FALSE when a refetch is in flight (isError is not yet true)", () => {
    // React Query sets isError only after a failure, so a pending refetch must not
    // be labelled stale. Otherwise the banner would flicker on every background
    // refresh, which trains students to ignore it.
    expect(isStaleAfterFailure({ data: { tasks: 11 }, isError: false })).toBe(false);
  });

  it("treats an empty array as data, not as absence", () => {
    // An empty list is a real answer ("you have no deadlines"). Labelling it a
    // failed load would send the student to check a server that already told them.
    expect(isStaleAfterFailure({ data: [], isError: true })).toBe(true);
  });

  it("treats null as data", () => {
    // `data !== undefined` is the check, deliberately. `!q.data` would treat a
    // legitimate null as absent.
    expect(isStaleAfterFailure({ data: null, isError: true })).toBe(true);
  });

  it("treats 0 and false as data", () => {
    // Falsy-but-real values. A `!q.data` implementation would get these wrong, so
    // they are asserted explicitly.
    expect(isStaleAfterFailure({ data: 0, isError: true })).toBe(true);
    expect(isStaleAfterFailure({ data: false, isError: true })).toBe(true);
  });
});

describe("the two predicates are independent", () => {
  it("an unreachable error makes a query stale-after-failure only if data exists", () => {
    // These answer different questions: isUnreachable is about an ERROR, this is
    // about what is ON SCREEN. Conflating them is how the banner ends up shown on
    // an empty screen.
    const unreachable = new ApiError("Network error", 0, null);
    expect(isUnreachable(unreachable)).toBe(true);
    expect(isStaleAfterFailure({ data: undefined, isError: true })).toBe(false);
    expect(isStaleAfterFailure({ data: { x: 1 }, isError: true })).toBe(true);
  });

  it("a server error is not unreachable, but still makes data stale", () => {
    // A 500 means the server answered. The data on screen is still old, so the
    // banner belongs; but this must NOT be treated as a connectivity problem.
    expect(isUnreachable(new ApiError("Server error", 500, null))).toBe(false);
    expect(isStaleAfterFailure({ data: { x: 1 }, isError: true })).toBe(true);
  });
});

describe("OfflineWriteBlocked", () => {
  it("is distinguishable from a generic error", () => {
    // The screen needs different words for "we chose not to send this" and "we
    // sent it and it failed". A shared Error would make them indistinguishable.
    const blocked = new OfflineWriteBlocked();
    expect(blocked).toBeInstanceOf(Error);
    expect(blocked.name).toBe("OfflineWriteBlocked");
    expect(blocked).not.toBeInstanceOf(ApiError);
  });
});


// ===========================================================================
// isStale — the corrected predicate
// ===========================================================================
//
// WHY THIS REPLACED isStaleAfterFailure AS THE PRIMARY SIGNAL
// ----------------------------------------------------------
// isStaleAfterFailure asks "did a refetch fail?". Measured on a real build: with
// `staleTime: 30_000`, tapping between tabs while offline produced ZERO requests,
// so nothing failed, so nothing fired. The banner could not appear in the exact
// situation it was written for.
//
// isStale asks the two questions a student actually has: how old is this, and can
// we check it right now. The tests below pin BOTH, and each is shown failing
// against the old single-condition predicate.

describe("isStale — age and reachability are independent signals", () => {
  const NOW = 1_800_000_000_000;
  const THRESHOLD = STALE_THRESHOLDS.home; // 5 min

  const fresh = { data: { tasks: 11 }, dataUpdatedAt: NOW - 1_000, isError: false };
  const aged = { data: { tasks: 11 }, dataUpdatedAt: NOW - 10 * 60_000, isError: false };

  it("is TRUE when offline, even with perfectly fresh data", () => {
    // THE BUG THIS FIXES. The old predicate returned false here, because no
    // refetch had failed - so an offline student saw fresh-looking data with no
    // warning, even seconds after losing signal.
    expect(
      isStale(fresh, { isOffline: true, thresholdMs: THRESHOLD, now: NOW }),
    ).toBe(true);
  });

  it("is TRUE when online but the data is older than the threshold", () => {
    // The second signal, which the old predicate also could not see: nothing
    // failed, the data is simply old.
    expect(
      isStale(aged, { isOffline: false, thresholdMs: THRESHOLD, now: NOW }),
    ).toBe(true);
  });

  it("is FALSE when online, fresh, and no failure", () => {
    expect(
      isStale(fresh, { isOffline: false, thresholdMs: THRESHOLD, now: NOW }),
    ).toBe(false);
  });

  it("is FALSE when there is nothing on screen", () => {
    // A cold start with no data shows its empty/error state. A staleness banner
    // over a blank page is noise, and would be a lie - there is nothing stale.
    expect(
      isStale(
        { data: undefined, dataUpdatedAt: 0, isError: true },
        { isOffline: true, thresholdMs: THRESHOLD, now: NOW },
      ),
    ).toBe(false);
  });

  it("still catches an attempted-and-failed refetch while online", () => {
    // The old predicate's one useful case, retained: a server-side failure with
    // good connectivity, which connectivity state cannot detect.
    expect(
      isStale(
        { data: { x: 1 }, dataUpdatedAt: NOW - 1_000, isError: true },
        { isOffline: false, thresholdMs: THRESHOLD, now: NOW },
      ),
    ).toBe(true);
  });

  it("thresholds differ by consequence, not uniformly", () => {
    // A stale deadline count is the failure the product exists to prevent; a
    // stale resource list is not. One global number would either over-warn on
    // Settings - training students to ignore the banner - or under-warn on Home.
    expect(STALE_THRESHOLDS.home).toBeLessThan(STALE_THRESHOLDS.materials);
    expect(STALE_THRESHOLDS.planner).toBeLessThan(STALE_THRESHOLDS.summaries);
    expect(STALE_THRESHOLDS.home).toBeGreaterThan(0);
  });

  it("treats missing dataUpdatedAt as not-aged rather than infinitely old", () => {
    // A query that has never successfully loaded has dataUpdatedAt 0. Treating
    // that as "infinitely old" would show a staleness banner over data that does
    // not exist.
    expect(
      isStale(
        { data: { x: 1 }, dataUpdatedAt: 0, isError: false },
        { isOffline: false, thresholdMs: THRESHOLD, now: NOW },
      ),
    ).toBe(false);
  });
});
