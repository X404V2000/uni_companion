import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
import AddDeadlineForm from "./AddDeadlineForm";
import ManageModulesPanel from "./ManageModulesPanel";
import {
  getActivity,
  getDashboard,
  summarize,
  type AccountProfile,
  type ActivityItem,
  type DashboardData,
} from "../lib/api";
import { describeError } from "../lib/session";

/**
 * Rotating accent palette for module cards.
 *
 * Module colours come from the design tokens rather than the data, because the
 * backend stores no colour - it would be one more field to keep in sync for a
 * purely presentational choice.
 */
const MODULE_ACCENTS = [
  { color: "var(--color-module-a)", pale: "var(--color-module-a-pale)" },
  { color: "var(--color-module-b)", pale: "var(--color-module-b-pale)" },
  { color: "var(--color-module-c)", pale: "var(--color-module-c-pale)" },
] as const;

/**
 * Format a due date for a deadline row.
 *
 * An absent or unparseable date yields placeholders rather than "Invalid Date" -
 * a deadline with a bad date is still a deadline worth showing.
 */
function formatDue(due: string | undefined): {
  day: string;
  month: string;
  time: string;
} {
  if (!due) return { day: "--", month: "---", time: "" };
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return { day: "--", month: "---", time: "" };
  return {
    day: String(date.getDate()),
    month: date.toLocaleString("en-ZA", { month: "short" }),
    time: date.toLocaleTimeString("en-ZA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

/**
 * Human label for how far away a deadline is.
 *
 * Rounded to whole days, and a deadline later today reads "today" rather than
 * "0 days", which is what a student actually needs to know.
 */
function dueLabel(due: string | undefined): string {
  if (!due) return "";
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/**
 * Presentation for each activity event type.
 *
 * The activity endpoint returns six event types. An unknown type falls back to
 * a neutral entry, so a future event type added server-side shows something
 * sensible instead of crashing the dashboard.
 */
const ACTIVITY_STYLES: Record<
  string,
  { icon: IconName; label: string; bg: string; color: string }
> = {
  SUMMARY_GENERATED: {
    icon: "document",
    label: "AI summary created",
    bg: "var(--color-module-a-pale)",
    color: "var(--color-accent)",
  },
  SUMMARY_CACHE_HIT: {
    icon: "document",
    label: "AI summary reopened",
    bg: "var(--color-module-a-pale)",
    color: "var(--color-accent)",
  },
  MATERIALS_SEARCHED: {
    icon: "search",
    label: "Materials searched",
    bg: "var(--color-module-b-pale)",
    color: "var(--color-success)",
  },
  SYNC_PUSHED: {
    icon: "wifi",
    label: "Library synced",
    bg: "var(--color-module-b-pale)",
    color: "var(--color-teal)",
  },
  DASHBOARD_VIEWED: {
    icon: "home",
    label: "Opened the dashboard",
    bg: "var(--color-module-c-pale)",
    color: "var(--color-warning)",
  },
  MODULE_SHARE: {
    icon: "arrow",
    label: "Shared a module",
    bg: "var(--color-module-c-pale)",
    color: "var(--color-warning)",
  },
};

const ACTIVITY_FALLBACK = {
  icon: "clock" as IconName,
  label: "Activity",
  bg: "var(--color-module-c-pale)",
  color: "var(--color-fg-muted)",
};

/**
 * Relative age of an activity item.
 *
 * Written out rather than using a library, and floored rather than rounded, so
 * something 90 minutes old reads "1 hour ago" and not "2 hours ago".
 */
function ageLabel(created: string | null | undefined): string {
  if (!created) return "";
  const then = new Date(created).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function OverviewTab({
  onTabChange,
  notify,
  profile,
  moduleList,
  onModulesChanged,
}: {
  onTabChange: (tab: string) => void;
  notify: (msg: string) => void;
  profile: AccountProfile | null;
  moduleList: Array<{ id: string; code: string; name: string }>;
  onModulesChanged: () => void;
}) {
  // Whether the inline add-deadline form is showing.
  const [showAddDeadline, setShowAddDeadline] = useState(false);

  // Whether the manage-modules sheet is open.
  const [showManageModules, setShowManageModules] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  /**
   * Load the dashboard and the module list together.
   *
   * Both are needed for the first paint, so they are awaited as a pair rather
   * than sequentially - two round trips in parallel instead of one after the
   * other.
   *
   * Individual failures are tolerated: a student with no modules yet must still
   * see their deadlines, so a modules failure does not blank the screen.
   */
  const loadDashboard = async () => {
    {
      setLoading(true);
      setError("");
      const [dashResult, activityResult] = await Promise.allSettled([
        getDashboard(),
        getActivity(5),
      ]);

      if (dashResult.status === "fulfilled") setDashboard(dashResult.value);
      if (activityResult.status === "fulfilled") {
        setActivity(activityResult.value);
      }

      // Only a dashboard failure is fatal - without it there is no deadline or
      // quota data at all, so the screen would be misleading.
      if (dashResult.status === "rejected") {
        setError(describeError(dashResult.reason));
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Deadlines</p>
            <h3 className="mt-1 font-display text-base font-extrabold">
              Your deadlines
              {/* Without a total, a truncated list reads as the whole list. */}
              {dashboard?.total_open_tasks ? (
                <span className="ml-1 text-[11px] font-bold text-[var(--color-fg-subtle)]">
                  ({dashboard.urgent_tasks.length} of {dashboard.total_open_tasks})
                </span>
              ) : null}
            </h3>
          </div>
          <button
            onClick={() => onTabChange("Study Planner")}
            className="text-[11px] font-bold text-[var(--color-success)]"
          >
            View planner
          </button>
        </div>
        <div className="space-y-3">
          {(dashboard?.urgent_tasks ?? []).map((task) => {
            const { day, month, time } = formatDue(task.due_date);
            const label = dueLabel(task.due_date);
            return (
              <div
                key={task.id}
                className={`flex items-center gap-4 rounded-2xl p-3.5 ${
                  label === "overdue"
                    ? "bg-[var(--color-danger)]/10"
                    : "bg-[var(--color-bg)]"
                }`}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-surface)] text-center shadow-sm">
                  <span className="text-[9px] font-extrabold uppercase text-[var(--color-fg-muted)]">
                    {month}
                  </span>
                  <span className="-mt-1 text-base font-extrabold text-[var(--color-fg)]">
                    {day}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-extrabold">{task.title}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">
                    {task.module_code ? `${task.module_code} · ` : ""}
                    {time}
                  </p>
                </div>
                {label && (
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-extrabold ${
                      label === "overdue"
                        ? "bg-[var(--color-danger)]/20 text-[var(--color-danger)]"
                        : "bg-[var(--color-surface)] text-[var(--color-teal)]"
                    }`}
                  >
                    {label}
                  </span>
                )}
              </div>
            );
          })}

          {!loading && (dashboard?.urgent_tasks ?? []).length === 0 && (
            <p className="rounded-2xl bg-[var(--color-bg)] p-4 text-center text-xs text-[var(--color-fg-muted)]">
              Nothing due in the next few days.
            </p>
          )}
        </div>

        {showAddDeadline ? (
          <div className="mt-4">
            <AddDeadlineForm
              moduleList={moduleList}
              notify={notify}
              onCreated={() => {
                setShowAddDeadline(false);
                // The list below shows only the soonest deadlines, so a task due
                // further out can fall outside it and look as though it was
                // never saved. Confirm explicitly rather than relying on the
                // row appearing.
                const saved = "Deadline saved.";
                notify(saved);
                void loadDashboard();
              }}
              onCancel={() => setShowAddDeadline(false)}
              onModulesChanged={onModulesChanged}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowAddDeadline(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border-strong)] py-3 text-[11px] font-bold text-[var(--color-fg-muted)] transition active:bg-[var(--color-bg)]"
          >
            <Icon name="plus" className="h-4 w-4" />
            Add deadline
          </button>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Modules</p>
            <h2 className="mt-1 font-display text-lg font-extrabold">Your modules</h2>
          </div>
          <button
            onClick={() => setShowManageModules(true)}
            className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-success)]"
          >
            Manage <Icon name="chevron" className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-3">
          {moduleList.map((module, index) => {
            const accent = MODULE_ACCENTS[index % MODULE_ACCENTS.length];
            return (
              <button
                key={module.id}
                onClick={() => notify(`${module.code} selected`)}
                className="module-card group flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-[0_4px_16px_rgba(0,0,0,0.30)] transition active:-translate-y-0.5"
                style={{ "--module-color": accent.color } as CSSProperties}
              >
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold tracking-[0.06em]"
                  style={{ backgroundColor: accent.pale, color: accent.color }}
                >
                  {/* Codes are free text typed by the student, so they may have
                      no space at all. Splitting on " " and indexing [1] would
                      render "undefined" for a code like "COS132". */}
                  {module.code.split(" ")[0]}
                  {module.code.includes(" ") && (
                    <>
                      <br />
                      {module.code.split(" ").slice(1).join(" ")}
                    </>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold">{module.name}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">
                    {module.code}
                  </p>
                </div>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-bg)] text-[var(--color-fg-subtle)] transition group-active:bg-[var(--color-surface)] group-active:text-white">
                  <Icon name="arrow" className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}

          {!loading && moduleList.length === 0 && (
            <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-xs text-[var(--color-fg-muted)]">
              No modules yet. Add one to get started.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Recent</p>
            <h2 className="mt-1 font-display text-base font-extrabold">Recent activity</h2>
          </div>
          <button className="text-[11px] font-bold text-[var(--color-success)]">View all</button>
        </div>
        <div className="divide-y divide-[var(--color-surface)]">
          {activity.map((item) => {
            const style = ACTIVITY_STYLES[item.event_type] ?? ACTIVITY_FALLBACK;
            return (
              <button
                key={item.id}
                onClick={() => notify(style.label)}
                className="flex w-full items-center gap-3.5 py-3.5 text-left first:pt-0 last:pb-0"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ backgroundColor: style.bg, color: style.color }}
                >
                  <Icon name={style.icon} className="h-[17px] w-[17px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-extrabold">
                    {style.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[var(--color-fg-subtle)]">
                    {item.module_code ? `${item.module_code} · ` : ""}Activity
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-fg-subtle)]">
                  <Icon name="clock" className="h-3 w-3" />
                  {ageLabel(item.created_at)}
                </span>
              </button>
            );
          })}

          {!loading && activity.length === 0 && (
            <p className="py-4 text-center text-xs text-[var(--color-fg-muted)]">
              No activity yet.
            </p>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[20px] bg-[var(--color-surface)] p-5">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full border-[18px] border-white/30" />
        <div className="relative flex items-start gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-teal)] text-white shadow-md shadow-[var(--color-teal)]/20">
            <Icon name="search" className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--color-fg-subtle)]">Materials</p>
            <button
              onClick={() => onTabChange("Find Materials")}
              className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--color-surface)] px-4 py-2.5 text-[11px] font-bold text-white transition active:bg-[var(--color-raised)]"
            >
              Search materials
              <Icon name="arrow" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showManageModules && (
        <ManageModulesPanel
          moduleList={moduleList}
          notify={notify}
          onClose={() => setShowManageModules(false)}
          onChanged={() => {
            // Refresh the shared list so Home, the pickers and the planner all
            // see the change without a reload.
            onModulesChanged();
            void loadDashboard();
          }}
        />
      )}
    </div>
  );
}


export default OverviewTab;
