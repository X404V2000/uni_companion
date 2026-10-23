/**
 * components/BursariesTab.tsx
 *
 * Bursaries: funding the student can actually apply for, soonest closing first.
 *
 * WHY THIS SCREEN LEADS WITH THE CLOSING DATE
 * -------------------------------------------
 * A student does not miss a bursary because they could not find it. They miss
 * it because nobody told them it closed on Friday. So the date is the loudest
 * thing on every card, and anything closing within two weeks is in the danger
 * colour. The name and provider matter; the deadline decides.
 *
 * WHY MATCH REASONS ARE SHOWN IN FULL
 * -----------------------------------
 * The reason is the feature, not decoration. "For Computer Science students" is
 * what makes a student believe the list is about them and open the link. It is
 * also what holds the backend honest: when the matcher was too loose it printed
 * "For Computer Science students" under a nursing bursary, and that was visible
 * only because the reason is rendered rather than assumed.
 *
 * WHY THERE IS NO "SAVE" OR "MARK APPLIED"
 * ----------------------------------------
 * Saving implies we can track it, and we cannot: the application happens on the
 * provider's site, not ours. A button that says "saved" and does nothing when
 * the student applies would be a false promise, the same mistake the module
 * cards made (they showed a toast and went nowhere).
 */
import { useEffect, useState } from "react";

import { describeError } from "../lib/session";
import { getBursaryMatches, type BursaryMatch } from "../lib/bursaryApi";
import { Icon } from "./Icon";

/** Anything under this many days is urgent enough to colour red. */
const URGENT_DAYS = 14;

function daysLabel(days: number | null): string {
  if (days === null) return "No closing date published";
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  // Date-only strings from the API are 'YYYY-MM-DD'. Parsed as UTC by default,
  // which can shift a day in a negative-offset timezone; append local midnight
  // so the calendar date shown is the calendar date the provider published.
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function BursaryCard({ bursary }: { bursary: BursaryMatch }) {
  const days = bursary.days_left;
  const urgent = days !== null && days >= 0 && days <= URGENT_DAYS;
  const closesOn = formatDate(bursary.closes_on);

  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold leading-snug text-[var(--color-fg)]">
            {bursary.name}
          </h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
            {bursary.provider}
          </p>
        </div>
        {days === 0 && (
          <span className="shrink-0 rounded-full bg-[var(--color-danger)] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-white">
            Today
          </span>
        )}
      </div>

      {/* The deadline, as the loudest line on the card. */}
      <p
        className={`mt-3 flex items-center gap-1.5 text-[12px] font-extrabold ${
          urgent ? "text-[var(--color-danger)]" : "text-[var(--color-fg-muted)]"
        }`}
      >
        <Icon name="clock" className="h-3.5 w-3.5" />
        {daysLabel(days)}
        {closesOn && (
          <span className="font-normal text-[var(--color-fg-subtle)]">· {closesOn}</span>
        )}
      </p>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
        {bursary.description}
      </p>

      {/*
        Why this bursary is here. Never empty; the API guarantees a reason.

        The urgency reason ("Closes in 3 days") is filtered out here because the
        deadline is already the loudest line on the card - rendering it twice
        wasted the chips for the reason that actually explains the match
        ("For Computer Science students"). The API still returns it, because a
        different client may have nowhere else to show it.
      */}
      {(() => {
        const matchOnly = bursary.match_reasons.filter(
          (r) => !/^closes/i.test(r),
        );
        if (matchOnly.length === 0) return null;
        return (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {matchOnly.map((reason) => (
              <li
                key={reason}
                className="rounded-full bg-[var(--color-teal)]/10 px-2 py-1 text-[9px] font-bold text-[var(--color-teal)]"
              >
                {reason}
              </li>
            ))}
          </ul>
        );
      })()}

      {/*
        A real <a href>, not a button calling window.open: it is a link, it works
        with the keyboard, and on a phone it offers to open in the provider's
        app. The application happens on their site - we never copy their form,
        because a stale copy of a deadline is how a student misses the real one.
      */}
      <a
        href={bursary.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-teal)] py-2.5 text-[11px] font-extrabold text-[var(--color-bg)] transition active:-translate-y-0.5"
      >
        Apply on {bursary.provider.split(" / ")[0]} site
        <Icon name="chevron" className="h-3.5 w-3.5" />
      </a>
    </article>
  );
}

export default function BursariesTab() {
  const [items, setItems] = useState<BursaryMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await getBursaryMatches();
        if (!cancelled) setItems(page.items);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await getBursaryMatches()).items);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
          Funding
        </p>
        <h2 className="mt-1 font-display text-lg font-extrabold">Bursaries for you</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
          Matched to your field, year and institution. Soonest closing first.
        </p>
      </div>

      {loading && (
        <p className="rounded-2xl bg-[var(--color-bg)] p-4 text-center text-xs text-[var(--color-fg-muted)]">
          Finding bursaries…
        </p>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-4">
          <p role="alert" className="text-[11px] leading-relaxed text-[var(--color-danger)]">
            {error}
          </p>
          <button
            onClick={() => void retry()}
            className="mt-2 text-[11px] font-bold text-[var(--color-teal)] underline"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        /*
          Honest empty state. The most likely cause is that the curated list is
          still being filled, not that the student did something wrong, so do not
          blame them and do not invent results.
        */
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
          <p className="text-xs font-bold text-[var(--color-fg)]">
            No matching bursaries yet
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
            We only list bursaries we have checked against the provider&apos;s own
            page, so the list grows slowly. Check back soon.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
            {items.length} match{items.length === 1 ? "" : "es"}
          </p>
          <div className="space-y-3">
            {items.map((bursary) => (
              <BursaryCard key={bursary.id} bursary={bursary} />
            ))}
          </div>
          <p className="pt-1 text-center text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
            Always confirm the closing date on the provider&apos;s page before relying on it.
          </p>
        </>
      )}
    </div>
  );
}
