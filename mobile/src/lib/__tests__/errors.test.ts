/**
 * src/lib/__tests__/errors.test.ts — the two error-classification guards.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The app makes two decisions about a failed request, and both were originally
 * made by searching the error MESSAGE for a word:
 *
 *   1. Should the student be signed out?   was: message.includes("session")
 *   2. Is the server waking up, or broken? was: message.includes("reach the server")
 *
 * Both are the same defect: they depend on prose that lives elsewhere in the
 * codebase. Rewording a sentence in `describeError()` is a copy edit with no
 * apparent risk, and it would silently change behaviour with no failing test, no
 * warning, and no type error. The only place it would surface is on a device, in
 * front of a student.
 *
 * These tests pin the classification to HTTP status so the prose can no longer
 * affect behaviour.
 */
import { ApiError } from "../api";
import { isUnreachable } from "../queries";
import { isRejectedCredential } from "../session";

describe("isUnreachable — is this a cold start or a fault?", () => {
  it("treats status 0 as unreachable", () => {
    // api.ts sets 0 when fetch itself throws: no connection, DNS failure,
    // timeout. The request never reached a server, which is the only condition
    // that can legitimately be a sleeping backend.
    expect(isUnreachable(new ApiError("Network error", 0, null))).toBe(true);
  });

  it("does NOT treat a server error as unreachable", () => {
    // A 500 means the server answered. It is awake. Showing "starting the
    // server" here would be a lie that delays the student seeing a real problem.
    expect(isUnreachable(new ApiError("Internal server error", 500, null))).toBe(false);
    expect(isUnreachable(new ApiError("Bad gateway", 502, null))).toBe(false);
    expect(isUnreachable(new ApiError("Gateway timeout", 504, null))).toBe(false);
  });

  it("does NOT treat an auth failure as unreachable", () => {
    expect(isUnreachable(new ApiError("Not authenticated", 401, null))).toBe(false);
    expect(isUnreachable(new ApiError("Forbidden", 403, null))).toBe(false);
  });

  it("is unaffected by the wording of the message", () => {
    // THE POINT OF THE TEST. The old implementation read the message text, so
    // the exact sentence in describeError() controlled behaviour. Both of these
    // carry the SAME status and must therefore classify identically, no matter
    // what they say.
    const a = new ApiError("Can't reach the server. Check your connection.", 0, null);
    const b = new ApiError("totally different wording", 0, null);
    expect(isUnreachable(a)).toBe(isUnreachable(b));
    expect(isUnreachable(a)).toBe(true);
  });

  it("does not treat an untyped error as unreachable", () => {
    // A programming error inside a query must not be presented to the student as
    // "the server is waking up", which would hide a real bug behind a wait.
    expect(isUnreachable(new TypeError("x is not a function"))).toBe(false);
    expect(isUnreachable(null)).toBe(false);
    expect(isUnreachable(undefined)).toBe(false);
  });
});

describe("the two guards are independent", () => {
  it("a 401 is rejected but not unreachable", () => {
    const e = new ApiError("Token invalid", 401, null);
    expect(isRejectedCredential(e)).toBe(true);
    expect(isUnreachable(e)).toBe(false);
  });

  it("an unreachable server is not a rejected credential", () => {
    // The original sign-out bug: an unreachable server must NOT log the student
    // out, because the token may be perfectly valid.
    const e = new ApiError("Failed to reach session service", 0, null);
    expect(isRejectedCredential(e)).toBe(false);
    expect(isUnreachable(e)).toBe(true);
  });
});

describe("the decoupling property, which is source-level not behavioural", () => {
  /**
   * WHY THIS TEST READS THE SOURCE INSTEAD OF CALLING THE FUNCTION.
   *
   * I established, by exhaustive check over all 601 statuses, that the old
   * message-matching implementation and the new status-based one are
   * BEHAVIOURALLY EQUIVALENT. `describeError` returns a fixed sentence per
   * status and never echoes the input message, so no input makes them disagree.
   *
   * That means no behavioural test can protect this refactor. Every test I wrote
   * to try passed under both implementations, which makes them worthless as
   * regression tests - and I nearly committed them.
   *
   * The property that matters is structural: classification must not depend on
   * the wording of a sentence declared somewhere else. That is checkable by
   * reading the source, so that is what these do. It is a weaker kind of test
   * than a behavioural one, and it is the strongest kind available here. Saying
   * so is better than pretending otherwise.
   */

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path") as typeof import("path");

  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

  /** Strip comments so the explanatory prose cannot satisfy or trip the check. */
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("isUnreachable does not inspect the error message", () => {
    const src = codeOnly(read("queries.ts"));
    const body = src.slice(
      src.indexOf("export function isUnreachable"),
      src.indexOf("}", src.indexOf("export function isUnreachable")),
    );
    expect(body).not.toMatch(/includes\(|toLowerCase\(|message/);
    expect(body).toMatch(/status === 0/);
  });

  it("isRejectedCredential does not inspect the error message", () => {
    const src = codeOnly(read("session.tsx"));
    const body = src.slice(
      src.indexOf("export function isRejectedCredential"),
      src.indexOf("}", src.indexOf("export function isRejectedCredential")),
    );
    expect(body).not.toMatch(/includes\(|toLowerCase\(|message/);
    expect(body).toMatch(/401/);
    expect(body).toMatch(/403/);
  });
});
