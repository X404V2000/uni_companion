/**
 * src/lib/__tests__/session.test.ts — the sign-out decision.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The app decides whether to sign a student out when a request fails. Getting it
 * wrong in one direction logs them out on a connection blip; wrong in the other
 * leaves them stuck on a screen that cannot load.
 *
 * The original implementation decided by searching the error MESSAGE for the word
 * "session". That is wrong in both directions and untestable, because it depends
 * on prose a later edit can silently change:
 *
 *   - "Failed to reach session service"  → contains "session" → signed out on a
 *     NETWORK failure, which is the exact opposite of the intent.
 *   - A 401 whose body says "Token invalid" → contains none of the three words →
 *     never signed out, so the student is stuck.
 *
 * These tests pin the corrected behaviour: the decision is made on HTTP status.
 */
import { ApiError } from "../api";
import { isRejectedCredential } from "../session";

describe("isRejectedCredential", () => {
  it("signs the student out on a 401", () => {
    // The credential is genuinely no longer valid.
    expect(isRejectedCredential(new ApiError("Not authenticated", 401, null))).toBe(true);
  });

  it("signs the student out on a 403", () => {
    expect(isRejectedCredential(new ApiError("Forbidden", 403, null))).toBe(true);
  });

  it("does NOT sign out when the server was unreachable", () => {
    // status 0 is what api.ts sets when fetch itself throws. The request never
    // arrived, so the token cannot have been rejected.
    expect(isRejectedCredential(new ApiError("Network error", 0, null))).toBe(false);
  });

  it("does NOT sign out on a server error", () => {
    // A 500 is the backend's problem, not the student's. Signing them out here
    // would mean a backend deploy bug logs out every student mid-session.
    expect(isRejectedCredential(new ApiError("Internal server error", 500, null))).toBe(false);
  });

  it("does NOT sign out on a timeout or rate limit", () => {
    expect(isRejectedCredential(new ApiError("Too many attempts", 429, null))).toBe(false);
    expect(isRejectedCredential(new ApiError("Gateway timeout", 504, null))).toBe(false);
  });

  it("does NOT sign out on a message containing the word 'session'", () => {
    // THE SPECIFIC BUG. The old implementation read the message text, so this
    // exact string would have signed the student out on a network failure.
    const networkError = new ApiError("Failed to reach session service", 0, null);
    expect(isRejectedCredential(networkError)).toBe(false);
  });

  it("does NOT sign out on a 401 whose message lacks the old keywords", () => {
    // The inverse bug: a real rejection the old string-match would have missed.
    // Status is what decides, so the message is irrelevant.
    expect(isRejectedCredential(new ApiError("Token invalid", 401, null))).toBe(true);
  });

  it("does not treat an untyped error as a rejection", () => {
    // A fetch TypeError, or a programming error, is not evidence the credential
    // is bad. Failing closed here would log students out on unrelated bugs.
    expect(isRejectedCredential(new TypeError("Failed to fetch"))).toBe(false);
    expect(isRejectedCredential(new Error("undefined is not a function"))).toBe(false);
    expect(isRejectedCredential(null)).toBe(false);
    expect(isRejectedCredential(undefined)).toBe(false);
    expect(isRejectedCredential("a string")).toBe(false);
  });
});
