/**
 * components/PlannerTab.tsx
 *
 * The study planner: list the student's deadlines and add new ones.
 *
 * WHY THE FORM IS INLINE: the previous build's "Add deadline" button only fired
 * a toast. The form is deliberately part of this component rather than a modal,
 * because there is no modal primitive in the shell and adding one is a design
 * decision beyond a re-wire.
 *
 * The module list was previously an empty dead end ("No modules yet") with no
 * way out. Here, when there are no modules, the create-module form is offered
 * directly so the student is never stuck.
 */
import { useEffect, useState } from "react";

import { Icon } from "./Icon";
import AddDeadlineForm from "./AddDeadlineForm";
import { EmptyState, ErrorState, LoadingSkeleton } from "./states";
import { completeTask, getTasks } from "../lib/api";
import { describeError } from "../lib/session";

type ModuleRow = { id: string; code: string; name: string };
type Task = {
  id: string;
  title: string;
  module_id?: string;
  due_date?: string;
  priority?: string;
  task_type?: string;
  is_completed?: boolean;
  weight_percentage?: number | null;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const TASK_TYPES = ["ASSIGNMENT", "EXAM", "TEST", "QUIZ"] as const;

/** Format an ISO due date for display, tolerating a missing value. */
/**
 * How long until a deadline, in words a student can act on.
 *
 * WHY RELATIVE RATHER THAN AN ABSOLUTE TIMESTAMP
 * "26 Sept 2026, 23:59" is precise and requires arithmetic to be useful. The question a
 * student is actually asking is "how long have I got", and "Due tomorrow" answers it
 * without a calculation. The exact timestamp is not lost - `formatDueExact` still
 * provides it as the row's tooltip, so precision stays one hover away.
 *
 * THE TRAP THIS AVOIDS
 * The obvious implementation is `Math.ceil((due - now) / 86_400_000)`, which is wrong:
 * a deadline at 23:00 TODAY is less than 24 hours away, so it rounds up to "tomorrow".
 * The comparison has to be between CALENDAR DAYS in the student's own timezone, which is
 * what the two startOfDay calls below do. A date at 23:00 today is due today, not
 * tomorrow because UTC rolled over.
 */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatDue(due: string | undefined): string {
  if (!due) return "No date";
  const date = new Date(due);
  // An unparseable date must not render "NaN days overdue". The previous version
  // tolerated this and the tolerance is kept.
  if (Number.isNaN(date.getTime())) return "No date";

  const days = Math.round(
    (startOfLocalDay(date) - startOfLocalDay(new Date())) / 86_400_000,
  );

  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/** The exact timestamp, kept for the tooltip so relative labels lose no precision. */
function formatDueExact(due: string | undefined): string {
  if (!due) return "No date";
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function PlannerTab({
  notify,
  moduleList,
  onModulesChanged,
}: {
  notify: (msg: string) => void;
  moduleList: ModuleRow[];
  onModulesChanged: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add-deadline form.
  const [showForm, setShowForm] = useState(false);

  // Inline module creation, for when the list is empty.

  const loadTasks = async () => {
    setLoading(true);
    try {
      const rows = await getTasks();
      setTasks(Array.isArray(rows) ? (rows as Task[]) : []);
      setError("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, []);

  const markComplete = async (taskId: string) => {
    try {
      await completeTask(taskId);
      notify("Marked complete");
      await loadTasks();
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Deadlines
          </p>
          <h2 className="mt-1 font-display text-lg font-extrabold">Study planner</h2>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-xl bg-[var(--color-accent)] px-3 py-2 text-[11px] font-extrabold text-[var(--color-fg-on-accent)]"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          {showForm ? "Cancel" : "Add deadline"}
        </button>
      </div>

      {error && <ErrorState message={error} />}

      {/* The shared form handles the no-modules case itself, offering
          module creation instead of a dead end. */}
      {showForm && (
        <AddDeadlineForm
          moduleList={moduleList}
          notify={notify}
          onCreated={() => {
            setShowForm(false);
            void loadTasks();
          }}
          onCancel={() => setShowForm(false)}
          onModulesChanged={onModulesChanged}
        />
      )}


      <div className="space-y-3">
        {loading && <LoadingSkeleton rows={4} label="Loading your deadlines" />}

        {!loading &&
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-xs font-extrabold ${
                    task.is_completed ? "line-through opacity-50" : ""
                  }`}
                >
                  {task.title}
                </p>
                <p
                  className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]"
                  // The relative label is what a student reads; the exact timestamp is
                  // one hover away, so switching to relative loses no precision.
                  title={formatDueExact(task.due_date)}
                >
                  {moduleList.find((m) => m.id === task.module_id)?.code ?? "—"} ·{" "}
                  {formatDue(task.due_date)}
                  {task.priority ? ` · ${task.priority}` : ""}
                </p>
              </div>
              {!task.is_completed && (
                <button
                  onClick={() => markComplete(task.id)}
                  className="shrink-0 rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-[10px] font-extrabold text-[var(--color-success)]"
                >
                  Done
                </button>
              )}
            </div>
          ))}

        {/* No `action` here on purpose. "Add deadline" is already a permanent button in
            this screen's header, so repeating it would be duplicate copy rather than a new
            way out - and adding a control is outside the scope of a state-component swap.
            The hint names the same button without restating the control. */}
        {!loading && tasks.length === 0 && (
          <EmptyState
            title="No deadlines yet"
            hint="Add one with the button above and it will appear here."
          />
        )}
      </div>
    </div>
  );
}

export default PlannerTab;
