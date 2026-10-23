/**
 * components/StudyPlanCard.tsx
 *
 * "About 9 hours of work this week across 3 deadlines - start with this."
 *
 * WHY THIS EXISTS ON HOME
 * -----------------------
 * The deadlines list answers "what is due". It does not answer the question a
 * student asks at 11pm: "can I actually get through this?" Totalling the work
 * and naming the first thing to open turns a list into a plan.
 *
 * WHY IT RENDERS NOTHING WHEN THERE IS NOTHING DUE
 * ------------------------------------------------
 * A card saying "0 hours this week" is noise in the best case and discouraging
 * in the worst. A failure must also look absent rather than broken: if the plan
 * cannot be fetched, the card disappears quietly instead of adding a red box to
 * the screen a student opens most.
 *
 * WHY THE ASSUMPTION IS ON SCREEN
 * -------------------------------
 * The hours are an estimate from a fixed rule (4 hours per assignment or test,
 * 12 per exam, scaled by weight). Showing that sentence is what makes the number
 * discussable rather than arbitrary - and it comes from the API, so the wording
 * and the calculation cannot drift apart.
 */
import { useEffect, useState } from "react";

import { api } from "../lib/api";
import { Icon } from "./Icon";

type PlanTask = {
  id: string;
  title: string;
  module_code: string | null;
  task_type: string;
  due_on: string;
  days_left: number;
  weight_percentage: number | null;
  estimated_hours: number;
  reason: string;
};

type StudyPlan = {
  week_days: number;
  task_count: number;
  total_hours: number;
  focus: PlanTask[];
  assumption_note: string;
};

export default function StudyPlanCard({ onOpenPlanner }: { onOpenPlanner: () => void }) {
  const [plan, setPlan] = useState<StudyPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api<StudyPlan>("/api/v1/study-plan");
        if (!cancelled) setPlan(result);
      } catch {
        // Silent by design - see the header note.
        if (!cancelled) setPlan(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!plan || plan.task_count === 0 || plan.focus.length === 0) return null;

  const hours = plan.total_hours;
  const tasks = plan.task_count;

  return (
    <section className="rounded-[20px] border border-[var(--color-teal)]/40 bg-[var(--color-teal)]/10 p-5">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-teal)]">
        This week
      </p>
      <h3 className="mt-1 font-display text-base font-extrabold text-[var(--color-fg)]">
        About {hours} hour{hours === 1 ? "" : "s"} of work across {tasks}{" "}
        deadline{tasks === 1 ? "" : "s"}
      </h3>

      <ol className="mt-3 space-y-2.5">
        {plan.focus.map((task, index) => (
          <li key={task.id} className="flex gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-teal)] text-[10px] font-extrabold text-[var(--color-bg)]">
              {index + 1}
            </span>
            <span className="min-w-0 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
              <span className="block font-bold text-[var(--color-fg)]">
                {task.module_code ? `${task.module_code} — ` : ""}
                {task.title}
              </span>
              {/* The API's own sentence, so the reasoning is never inventable
                  by the client: "due in 2 days, worth 40%". */}
              {task.reason} · about {task.estimated_hours}h
            </span>
          </li>
        ))}
      </ol>

      <button
        onClick={onOpenPlanner}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-teal)] py-2.5 text-[11px] font-extrabold text-[var(--color-bg)]"
      >
        Open planner
        <Icon name="chevron" className="h-3.5 w-3.5" />
      </button>

      <p className="mt-2.5 text-center text-[9px] leading-relaxed text-[var(--color-fg-subtle)]">
        {plan.assumption_note}
      </p>
    </section>
  );
}
