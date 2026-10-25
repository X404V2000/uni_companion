/**
 * components/AddDeadlineForm.tsx
 *
 * A reusable add-deadline form.
 *
 * WHY IT IS EXTRACTED: the form existed only inside PlannerTab, so the Home tab's
 * "Add deadline" button had nothing to open and fired a toast instead. Tapping it
 * did nothing, which reads as a broken feature even though the same form worked
 * one tab away.
 *
 * Extracting it means both entry points share one implementation - including the
 * datetime-local to ISO conversion and the no-modules fallback - instead of the
 * Home tab growing a second, subtly different copy.
 */
import { useEffect, useState } from "react";

import { Icon } from "./Icon";
import { createModule, createTask } from "../lib/api";
import MicButton from "./MicButton";
import { useSpeech } from "../lib/useSpeech";
import { parseSpokenDeadline } from "../lib/spokenDeadline";
import { describeError } from "../lib/session";

type ModuleRow = { id: string; code: string; name: string };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const TASK_TYPES = ["ASSIGNMENT", "EXAM", "TEST", "QUIZ"] as const;

function AddDeadlineForm({
  moduleList,
  notify,
  onCreated,
  onCancel,
  onModulesChanged,
}: {
  moduleList: ModuleRow[];
  notify: (msg: string) => void;
  onCreated: () => void;
  onCancel?: () => void;
  onModulesChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [dueDate, setDueDate] = useState("");
  /**
   * "Practical three due friday" -> fills the title and the due date.
   *
   * It FILLS THE FORM, it does not submit it. A misheard date that saved itself
   * is a missed deadline, and this app exists to prevent exactly that. The
   * student sees the result, corrects anything wrong, and presses Save.
   */
  const speech = useSpeech({
    onFinal: (text) => {
      const parsed = parseSpokenDeadline(text);
      if (parsed.title) setTitle(parsed.title);
      if (parsed.due) setDueDate(parsed.due);
      // Telling the student which words became the date is what makes a wrong
      // guess noticeable before they save it.
      setHeard(
        parsed.dateWords
          ? `Heard “${text}” — using ${parsed.dateWords} as the due date.`
          : `Heard “${text}” — no date in that. Set one below.`,
      );
    },
  });

  /** Last thing the microphone understood, shown so the student can judge it. */
  const [heard, setHeard] = useState("");

  const [priority, setPriority] = useState<string>("MEDIUM");
  const [taskType, setTaskType] = useState<string>("ASSIGNMENT");
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  // Default the select to the first module once the list arrives, otherwise the
  // form submits with an empty module_id and the backend rejects it.
  useEffect(() => {
    if (!moduleId && moduleList.length > 0) setModuleId(moduleList[0].id);
  }, [moduleList, moduleId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (!title.trim() || !moduleId || !dueDate) {
      setError("A title, module and due date are all required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      // datetime-local yields a local wall-clock string with no timezone, which
      // the backend would either reject or read as UTC. Convert to ISO here so
      // the deadline lands at the time the student actually picked.
      await createTask({
        moduleId,
        title: title.trim(),
        dueDate: new Date(dueDate).toISOString(),
        priority: priority as (typeof PRIORITIES)[number],
        taskType: taskType as (typeof TASK_TYPES)[number],
        weightPercentage: weight ? Number(weight) : null,
      });
      notify("Deadline added");
      setTitle("");
      setDueDate("");
      setWeight("");
      onCreated();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const addModule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    try {
      // Code and full name are both typed by the student; nothing is
      // auto-suggested, which was an explicit product decision.
      await createModule(newCode.trim(), newName.trim());
      notify(`${newCode.trim()} added`);
      setNewCode("");
      setNewName("");
      onModulesChanged();
    } catch (err) {
      setError(describeError(err));
    }
  };

  // A deadline must belong to a module, so with none the only useful form is
  // the one that creates the first module.
  if (moduleList.length === 0) {
    return (
      <form
        onSubmit={addModule}
        className="space-y-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
      >
        <p className="text-xs font-extrabold">Add your first module</p>
        <p className="text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
          Deadlines belong to a module, so add one to get started.
        </p>
        {error && (
          <p role="alert" className="text-[11px] text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <input
          required
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          placeholder="Module code, e.g. COS132"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
        />
        <input
          required
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Full module name, e.g. Introduction to Programming"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-[var(--color-teal)] py-3 text-xs font-extrabold text-[var(--color-bg)]"
          >
            Add module
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-[var(--color-border)] px-4 text-xs font-bold text-[var(--color-fg-muted)]"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
    >
      {/* Dictate the whole deadline: "practical three due friday" fills both the
          title and the date. It never saves - see the parser's note on why. */}
      <MicButton
        isSupported={speech.isSupported}
        state={speech.state}
        interim={speech.interim}
        error={speech.error}
        onToggle={speech.toggle}
        label="Speak the deadline"
      />

      {heard && (
        <p className="rounded-xl bg-[var(--color-bg)] px-3 py-2 text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
          {heard}
        </p>
      )}

      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What is due? e.g. Database Design Project"
        className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
      />

      <select
        value={moduleId}
        onChange={(e) => setModuleId(e.target.value)}
        className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold text-[var(--color-fg)] outline-none"
      >
        {moduleList.map((m) => (
          <option key={m.id} value={m.id}>
            {m.code} — {m.name}
          </option>
        ))}
      </select>

      <input
        required
        type="datetime-local"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-fg)] outline-none"
      />

      <div className="flex gap-3">
        <select
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className="h-11 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold text-[var(--color-fg)] outline-none"
        >
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="h-11 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold text-[var(--color-fg)] outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <input
        type="number"
        min="0"
        max="100"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="Weight toward final mark (%, optional)"
        className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
      />

      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-[var(--color-accent)] py-3 text-xs font-extrabold text-[var(--color-fg-on-accent)] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save deadline"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--color-border)] px-4 text-xs font-bold text-[var(--color-fg-muted)]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default AddDeadlineForm;
