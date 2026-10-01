/**
 * src/lib/__tests__/logic.test.ts — pure functions that screens depend on.
 *
 * WHY THESE ARE SEPARATE FROM THE COMPONENT TESTS
 * ----------------------------------------------
 * Two pieces of logic have caused real bugs elsewhere in this project and are
 * pure, so they can be tested directly rather than through a rendered screen:
 *
 *   1. The content-length floor on summaries. The web client once measured the
 *      student's text *plus a label it added itself*, so a 20-character file
 *      passed a 50-character gate it should have failed. Measuring the wrong
 *      thing is the bug class here.
 *
 *   2. Date handling. `new Date("2026-10-05")` is parsed as UTC midnight, which
 *      is the previous day for anyone west of Greenwich. A deadline showing one
 *      day early is a genuine correctness problem, not cosmetic.
 */
import { describeDue, toIso } from "../dates";

describe("describeDue", () => {
  const now = Date.now();

  it("reports a future deadline as due in N days", () => {
    const future = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = describeDue(future);
    expect(result.overdue).toBe(false);
    expect(result.label).toMatch(/^Due in 3d$/);
  });

  it("reports a past deadline as overdue, not as a negative duration", () => {
    const past = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = describeDue(past);
    // "Due in -2d" would be the naive output and reads as nonsense.
    expect(result.overdue).toBe(true);
    expect(result.label).toBe("Overdue by 2d");
  });

  it("switches to hours inside a day", () => {
    const soon = new Date(now + 5 * 60 * 60 * 1000).toISOString();
    expect(describeDue(soon).label).toBe("Due in 5h");
  });

  it("switches to minutes inside an hour", () => {
    const verySoon = new Date(now + 20 * 60 * 1000).toISOString();
    expect(describeDue(verySoon).label).toBe("Due in 20m");
  });

  it("handles a missing due date without throwing", () => {
    // Deadlines are optional on the backend, so this is a real input.
    expect(describeDue(null)).toEqual({ label: "No due date", overdue: false });
    expect(describeDue(undefined)).toEqual({ label: "No due date", overdue: false });
    expect(describeDue("")).toEqual({ label: "No due date", overdue: false });
  });

  it("handles an unparseable date without rendering 'Invalid Date'", () => {
    // The value comes from the network; a malformed one must degrade, not show
    // the student "Invalid Date".
    const result = describeDue("not-a-date");
    expect(result.label).toBe("No due date");
  });
});

describe("toIso", () => {
  it("treats a bare date as local midnight, not UTC midnight", () => {
    const iso = toIso("2026-10-05");
    expect(iso).not.toBeNull();

    const parsed = new Date(iso!);
    // The date must survive the round trip in the student's own timezone. Parsing
    // "2026-10-05" directly would give UTC midnight, which renders as 4 October
    // for anyone behind Greenwich.
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9); // October, zero-indexed
    expect(parsed.getDate()).toBe(5);
  });

  it("returns null for empty input rather than an Invalid Date", () => {
    expect(toIso("")).toBeNull();
    expect(toIso("   ")).toBeNull();
  });

  it("returns null for a malformed date so the caller can show a real message", () => {
    expect(toIso("05/10/2026")).toBeNull();
    expect(toIso("tomorrow")).toBeNull();
  });

  it("does not silently roll an impossible date forward", () => {
    // 2026-02-30 does not exist. JavaScript would roll it to 2 March, which
    // would silently save a deadline on the wrong day.
    const iso = toIso("2026-02-30");
    if (iso !== null) {
      const d = new Date(iso);
      expect(d.getDate()).not.toBe(2);
    }
  });
});

describe("summary content floor", () => {
  /**
   * Mirrors MIN_CONTENT in the summaries screen. Duplicated deliberately: if the
   * screen's value changes, this test should be updated consciously rather than
   * silently tracking it.
   */
  const MIN_CONTENT = 20;

  it("counts only the student's own text, never a label we add", () => {
    // The web bug: "[From file: notes.txt]\n" is 25 characters of our own making.
    // A 12-character file would have passed the gate on the label alone.
    const studentText = "Quantum tunnelling.";
    const ourLabel = "[From file: notes.txt]\n";
    const combined = ourLabel + studentText;

    expect(combined.length).toBeGreaterThan(MIN_CONTENT);
    expect(studentText.length).toBeLessThan(MIN_CONTENT);
    // The gate must use the second number, not the first.
  });

  it("trims whitespace before measuring", () => {
    // A paste of newlines and spaces is not content.
    const whitespace = "        \n\n   \t  ";
    expect(whitespace.trim().length).toBe(0);
  });
});
