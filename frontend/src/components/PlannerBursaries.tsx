/**
 * components/PlannerBursaries.tsx
 *
 * Bursary closing dates inside the Planner, beside academic deadlines.
 *
 * WHY THIS IS A SEPARATE SECTION, NOT MERGED INTO THE TASK LIST
 * ------------------------------------------------------------
 * Merging them would have been tidier to look at and worse to use: the two
 * kinds of deadline do not behave the same, and mixing them would have meant
 * either adding "Done" to a bursary (a button that cannot do anything - the
 * application happens on someone else's website) or removing it from academic
 * tasks, which students rely on.
 *
 * Two groups with one heading each is honest about that difference and still
 * puts every closing date on one screen, which was the whole point of F3.
 *
 * WHY IT SHOWS ONLY BURSARIES CLOSING WITHIN THE PLANNER WINDOW
 * -------------------------------------------------------------
 * The Planner is about what is coming up. A bursary closing in four months
 * belongs in the Bursaries tab, where the student goes to look for money. Here
 * it would bury the assignments that are actually due.
 *
 * WHY IT RENDERS NOTHING WHEN THE REQUEST FAILS
 * ---------------------------------------------
 * This section sits inside a screen that must keep working. A failure here
 * quietly disappears rather than putting a red box above the student's
 * deadlines - the Bursaries tab is where a failure is worth reporting, and it
 * does.
 */
import { useEffect, useState } from "react";

import type { BursaryMatch } from "../lib/bursaryApi";
import { getBursaryMatches } from "../lib/bursaryApi";
import { Icon } from "./Icon";

/** A bursary closing further out than this is not "coming up". */
const WINDOW_DAYS = 30;
const MAX_SHOWN = 5;

export default function PlannerBursaries({ onOpenBursaries }: { onOpenBursaries: () => void }) {
  const [items, setItems] = useState<BursaryMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await getBursaryMatches();
        if (!cancelled) setItems(page.items);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const soon = items
    .filter((b) => b.days_left !== null && b.days_left >= 0 && b.days_left <= WINDOW_DAYS)
    // The API already sorts by score then date. For a deadline view the date is
    // what matters, so re-sort: a student planning a week needs the soonest.
    .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))
    .slice(0, MAX_SHOWN);

  if (soon.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-teal)]">
          Funding deadlines
        </p>
        <button
          onClick={onOpenBursaries}
          className="text-[10px] font-bold text-[var(--color-fg-subtle)] underline"
        >
          All bursaries
        </button>
      </div>

      {soon.map((bursary) => {
        const days = bursary.days_left ?? 0;
        const urgent = days <= 7;
        return (
          <div
            key={bursary.id}
            className="flex items-center gap-3 rounded-2xl border border-[var(--color-teal)]/30 bg-[var(--color-teal)]/5 p-3.5"
          >
            <div
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold ${
                urgent
                  ? "bg-[var(--color-danger)] text-white"
                  : "bg-[var(--color-teal)]/15 text-[var(--color-teal)]"
              }`}
            >
              {days === 0 ? "!" : `${days}d`}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-extrabold">{bursary.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-[var(--color-fg-subtle)]">
                {/* The BURSARY badge is what stops a student treating this as an
                    assignment they can tick off. */}
                <span className="mr-1.5 rounded bg-[var(--color-teal)]/15 px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-[var(--color-teal)]">
                  Bursary
                </span>
                {days === 0 ? "Closes today" : `Closes in ${days} day${days === 1 ? "" : "s"}`}
              </p>
            </div>
            <a
              href={bursary.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-[10px] font-extrabold text-[var(--color-teal)]"
            >
              Apply
              <Icon name="chevron" className="ml-1 inline h-3 w-3" />
            </a>
          </div>
        );
      })}
    </section>
  );
}
