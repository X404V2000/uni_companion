/**
 * components/ManageModulesPanel.tsx
 *
 * Add and remove modules.
 *
 * WHY A MODAL: the student taps "Manage" from the modules section on Home, so
 * the natural expectation is a panel over that section, not a jump to another
 * tab. The shell had no modal primitive, so this is a small one - a fixed
 * overlay with a scrollable sheet - rather than introducing a dialog library.
 *
 * WHY DELETION ASKS FIRST: deleting a module removes the module a student typed
 * in by hand, and there is no undo. A confirmation step is the difference
 * between a mis-tap and lost work.
 */
import { useState } from "react";

import { Icon } from "./Icon";
import { createModule, deleteModule } from "../lib/api";
import { describeError } from "../lib/session";

type ModuleRow = { id: string; code: string; name: string };

function ManageModulesPanel({
  moduleList,
  notify,
  onClose,
  onChanged,
}: {
  moduleList: ModuleRow[];
  notify: (msg: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  // Which module is awaiting delete confirmation, and which delete is running.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (adding) return;
    if (!code.trim() || !name.trim()) {
      setError("Both a module code and a full name are required.");
      return;
    }

    setAdding(true);
    setError("");
    try {
      // Code and name are both typed by the student; nothing is auto-suggested,
      // which was an explicit product decision.
      await createModule(code.trim(), name.trim());
      notify(`${code.trim()} added`);
      setCode("");
      setName("");
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (module: ModuleRow) => {
    setDeletingId(module.id);
    setError("");
    try {
      await deleteModule(module.id);
      notify(`${module.code} removed`);
      setConfirmingId(null);
      // Refresh the shared list so Home and the other tabs update too.
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        // Stop taps inside the sheet from closing it.
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-t-[22px] border-t border-[var(--color-border)] bg-[var(--color-bg)] p-5 pb-8 sm:max-w-[640px]"
        role="dialog"
        aria-modal="true"
        aria-label="Manage modules"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-extrabold text-[var(--color-fg)]">
            Your modules
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-fg-muted)]"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-[11px] text-[var(--color-danger)]"
          >
            {error}
          </p>
        )}

        {/* --- the student's modules --- */}
        <div className="space-y-2">
          {moduleList.length === 0 && (
            <p className="rounded-xl bg-[var(--color-surface)] p-4 text-center text-[11px] text-[var(--color-fg-muted)]">
              No modules yet. Add your first one below.
            </p>
          )}

          {moduleList.map((module) => (
            <div
              key={module.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-extrabold text-[var(--color-fg)]">
                  {module.code}
                </p>
                <p className="truncate text-[10px] text-[var(--color-fg-subtle)]">
                  {module.name}
                </p>
              </div>

              {confirmingId === module.id ? (
                // Two-step delete: a single tap is too easy to do by accident.
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => remove(module)}
                    disabled={deletingId === module.id}
                    className="rounded-lg bg-[var(--color-danger)] px-3 py-2 text-[10px] font-extrabold text-white disabled:opacity-50"
                  >
                    {deletingId === module.id ? "Removing..." : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[10px] font-bold text-[var(--color-fg-muted)]"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingId(module.id)}
                  aria-label={`Remove ${module.code}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-fg-muted)]"
                >
                  <Icon name="edit" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* --- add a module --- */}
        <form onSubmit={add} className="mt-5 space-y-2">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Add a module
          </p>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Module code, e.g. COS132"
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
          />
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full module name, e.g. Introduction to Programming"
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
          />
          <button
            type="submit"
            disabled={adding}
            className="w-full rounded-xl bg-[var(--color-accent)] py-3 text-xs font-extrabold text-[var(--color-fg-on-accent)] disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add module"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ManageModulesPanel;
