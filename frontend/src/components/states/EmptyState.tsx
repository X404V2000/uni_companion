/**
 * components/states/EmptyState.tsx
 *
 * "There is nothing here" — with the reason, and the way out.
 *
 * WHY THE ACTION IS PART OF THE COMPONENT AND NOT ALWAYS PASSED
 * An empty state that only states the emptiness is a dead end: it tells a student the screen
 * has nothing without telling them what would change that. The optional action exists so a
 * screen CAN offer the next step, and the required `hint` exists so that even without one it
 * says something more useful than "No items".
 */

import type { ReactNode } from "react";

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  /** What would change this. One short sentence. */
  hint?: string;
  /** Optional control that resolves the empty state. */
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
      <p className="text-xs font-semibold text-[var(--color-fg)]">{title}</p>
      {hint && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
          {hint}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export default EmptyState;
