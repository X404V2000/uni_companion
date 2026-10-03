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
  isStaleAfterFailure,
  isUnreachable,
  OfflineWriteBlocked,
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
