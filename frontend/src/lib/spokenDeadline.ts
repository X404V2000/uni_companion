/**
 * lib/spokenDeadline.ts
 *
 * Turns a spoken sentence into the parts of a deadline form.
 *
 * WHAT THIS IS AND IS NOT
 * -----------------------
 * It is a small set of explicit patterns, not natural-language understanding. It
 * handles what students actually say to a deadline field - "practical three due
 * friday", "test two next tuesday" - and returns a CONFIDENCE with the result.
 *
 * The caller fills the fields but NEVER submits. The student sees what was
 * understood, corrects anything wrong, and presses Save themselves. That is not
 * caution for its own sake: a misheard date that saves itself is a missed
 * deadline, which is the one failure this app exists to prevent.
 *
 * WHY IT IS PURE
 * --------------
 * No DOM, no React, no clock reads except the injected `today`. That makes every
 * case testable, including "next Tuesday" on each day of the week - the kind of
 * thing that is wrong for months before anyone notices.
 */

export type SpokenDeadline = {
  /** The task title, with the date words removed. */
  title: string;
  /** Local date-time string suitable for an <input type="datetime-local">. */
  due: string | null;
  /** Words that were recognised as a date, for showing the student what changed. */
  dateWords: string | null;
  /** Whether anything usable was extracted. */
  confident: boolean;
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date as the value an <input type="datetime-local"> expects. */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Default due time for a spoken date.
 *
 * Spoken deadlines almost never include a time ("due Friday"), but a deadline
 * with no time is ambiguous and usually means end of day. 23:59 is chosen
 * deliberately over 00:00: a student told "Friday" expects the whole of Friday,
 * and a midnight deadline would show as already passed on Friday morning.
 */
const DEFAULT_HOUR = 23;
const DEFAULT_MINUTE = 59;

function withTime(date: Date): Date {
  const d = new Date(date);
  d.setHours(DEFAULT_HOUR, DEFAULT_MINUTE, 0, 0);
  return d;
}

/** "three" / "3" -> 3, else null. */
function parseCount(word: string): number | null {
  const numeric = Number(word);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 31) return numeric;
  return NUMBER_WORDS[word] ?? null;
}

export function parseSpokenDeadline(text: string, today: Date = new Date()): SpokenDeadline {
  const original = text.trim();
  let rest = original.toLowerCase();
  let due: Date | null = null;
  let dateWords: string | null = null;

  /** Remove matched words from the title candidate. */
  const consume = (match: string) => {
    const pattern = new RegExp(`\\b${match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    rest = rest.replace(pattern, " ").replace(/\s+/g, " ").trim();
  };

  // --- Explicit priority order: most specific first -------------------------
  // "day after tomorrow" must be tried before "tomorrow", or it becomes
  // tomorrow plus a stray "day after".

  // 1. "day after tomorrow"
  if (/\bday after tomorrow\b/.test(rest)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    due = withTime(d);
    dateWords = "day after tomorrow";
    consume("day after tomorrow");
  }

  // 2. "tomorrow" / "today"
  if (!due) {
    if (/\btomorrow\b/.test(rest)) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      due = withTime(d);
      dateWords = "tomorrow";
      consume("tomorrow");
    } else if (/\btoday\b/.test(rest)) {
      due = withTime(new Date(today));
      dateWords = "today";
      consume("today");
    }
  }

  // 3. "in N days"
  if (!due) {
    const m = rest.match(/\bin (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/);
    if (m) {
      const n = parseCount(m[1]);
      if (n !== null) {
        const d = new Date(today);
        d.setDate(d.getDate() + n);
        due = withTime(d);
        dateWords = `in ${n} day${n === 1 ? "" : "s"}`;
        consume(m[0]);
      }
    }
  }

  // 4. "next friday" / "on monday" / bare weekday
  if (!due) {
    const m = rest.match(/\b(next |this |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) {
      const targetDay = WEEKDAYS.indexOf(m[2]);
      const explicitNext = (m[1] ?? "").trim() === "next";
      const d = new Date(today);
      let delta = (targetDay - d.getDay() + 7) % 7;
      // A bare weekday means the NEXT occurrence. Saying "Friday" on a Friday
      // means today, which is what a student means when they say it in a hurry.
      // "next friday" always skips ahead by a full week if today is Friday.
      if (delta === 0 && explicitNext) delta = 7;
      d.setDate(d.getDate() + delta);
      due = withTime(d);
      dateWords = (m[1] ?? "") + m[2];
      consume(m[0]);
    }
  }

  // 5. "26 october" / "26 oct" / "october 26"
  if (!due) {
    const months = [
      "january","february","march","april","may","june",
      "july","august","september","october","november","december",
    ];
    const m = rest.match(
      /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/,
    );
    if (m) {
      const day = parseCount(m[1]);
      const monthIdx = months.findIndex((name) => name.startsWith(m[2]));
      if (day !== null && monthIdx >= 0) {
        const d = new Date(today.getFullYear(), monthIdx, day);
        // A date already gone this year means next year's deadline.
        if (d.getTime() < today.getTime()) d.setFullYear(d.getFullYear() + 1);
        due = withTime(d);
        dateWords = m[0];
        consume(m[0]);
      }
    }
  }

  // --- Build the title ------------------------------------------------------
  // The lowering/restore round trip was wrong: it kept words that the cleaned
  // title merely CONTAINED, so "practical three due tomorrow" left the word
  // "due" in the title. Match word by word against the cleaned set instead.
  //
  // A student says "practical three DUE tomorrow" - the filler belongs to the
  // date phrase, not to the name of the task.
  const FILLER = new Set(["due", "on", "by", "for", "is", "it's", "its", "the", "at", "this", "next"]);

  const keptFromRest = rest
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w.replace(/[^\w'-]/g, "").toLowerCase()));

  // Restore original casing from the ORIGINAL text, since `rest` was lowered.
  // Words are matched positionally after removing the filler from the original.
  // The date phrase must be removed from the ORIGINAL too, or its words leak
  // into the title: "essay due tomorrow" gave "Essay tomorrow". `dateWords` is
  // the exact phrase that was matched, so removing it is precise.
  const dateFreeSource = dateWords
    ? original.replace(new RegExp(dateWords.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ")
    : original;

  const originalWords = dateFreeSource.split(/\s+/).filter((w) => {
    const clean = w.replace(/[^\w'-]/g, "").toLowerCase();
    return clean && !FILLER.has(clean);
  });

  let title = (originalWords.length ? originalWords.join(" ") : keptFromRest.join(" "))
    .replace(/\s+/g, " ")
    .trim();

  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);

  // A title made only of filler ("due") is not a title. Without this, saying
  // "due tomorrow" produced a deadline literally called "Due", which would
  // appear in the student's list as a meaningless entry.
  if (keptFromRest.length === 0) title = "";

  return {
    title,
    due: due ? toLocalInputValue(due) : null,
    dateWords,
    // Confident only when there is BOTH something to call it and a date. A date
    // with no title is not something the form can save.
    confident: Boolean(title && due),
  };
}
