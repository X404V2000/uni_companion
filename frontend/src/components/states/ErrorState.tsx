/**
 * components/states/ErrorState.tsx
 *
 * A failure the student can act on.
 *
 * WHY IT TAKES A STRING RATHER THAN AN ERROR
 * The message is produced by `describeError`, which is the single place that knows how to
 * turn a status code into a sentence. Passing the raw error here would give the UI a second
 * opportunity to invent its own vocabulary, and two error vocabularies on one screen is how
 * "Something went wrong" starts appearing next to a specific, useful message.
 *
 * WHY `role="alert"`
 * Unlike the offline banner - a persistent condition - this is an event: something the
 * student did has just failed. An alert interrupts, which is correct here and wrong there.
 */

import { describeError } from "../../lib/session";

export function ErrorState({
  message,
  onRetry,
}: {
  /** Either a ready sentence, or an error to be described. */
  message: string | unknown;
  onRetry?: () => void;
}) {
  const text = typeof message === "string" ? message : describeError(message);
  if (!text) return null;

  return (
    <div
      role="alert"
      className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-4 py-3"
    >
      <p className="text-[12px] leading-relaxed text-[var(--color-danger)]">{text}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-[11px] font-extrabold text-[var(--color-danger)] underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export default ErrorState;
