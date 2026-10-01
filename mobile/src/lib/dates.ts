/**
 * src/lib/dates.ts — date helpers shared by the screens.
 *
 * WHY THESE MOVED OUT OF THE ROUTE FILES
 * --------------------------------------
 * They were defined inside app/(tabs)/index.tsx and app/(tabs)/planner.tsx. A
 * test cannot import from those paths: the parentheses in the route group name
 * are parsed by TypeScript as a regex group, not as a directory. They are also
 * pure functions with no React dependency, so src/lib is where they belonged
 * anyway.
 *
 * WHY THEY ARE WORTH TESTING AT ALL
 * ---------------------------------
 * Both have produced wrong output in this project before:
 *   - a deadline rendered as "Due in -2d" instead of "Overdue by 2d"
 *   - `new Date("2026-10-05")` parsed as UTC midnight, showing a deadline on the
 *     previous day for anyone behind Greenwich
 * Both are silent. Neither throws. Only a test catches them.
 */

/** Human-readable gap to a deadline. Pure function, so it is trivially testable. */
export function describeDue(due: string | null | undefined): {
  label: string;
  overdue: boolean;
} {
  if (!due) return { label: "No due date", overdue: false };
  const when = new Date(due).getTime();
  if (Number.isNaN(when)) return { label: "No due date", overdue: false };

  const diffMs = when - Date.now();
  const overdue = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60000);

  let label: string;
  if (mins < 60) label = `${mins}m`;
  else if (mins < 60 * 24) label = `${Math.round(mins / 60)}h`;
  else label = `${Math.round(mins / (60 * 24))}d`;

  return { label: overdue ? `Overdue by ${label}` : `Due in ${label}`, overdue };
}

/** Convert a YYYY-MM-DD string from the date field into an ISO instant. */
export function toIso(dueDate: string): string | null {
  const trimmed = dueDate.trim();
  if (!trimmed) return null;

  // Parsed as local midnight then converted, so "2026-10-05" means the start of
  // that day for the student rather than 02:00 in a different timezone.
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  // Reject dates that do not exist. JavaScript rolls "2026-02-30" forward to
  // 2 March instead of failing, so a student who mistypes a day would silently
  // save their deadline on a different date - and a wrong deadline is worse
  // than a rejected one, because nothing on screen looks amiss.
  //
  // Comparing the round-tripped parts is what catches the roll: the parsed date
  // no longer matches what was typed.
  const [y, m, d] = trimmed.split("-").map(Number);
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() + 1 !== m ||
    parsed.getDate() !== d
  ) {
    return null;
  }

  return parsed.toISOString();
}
