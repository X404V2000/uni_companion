/**
 * components/states/LoadingSkeleton.tsx
 *
 * A placeholder shown while a screen's data is being fetched.
 *
 * WHY A SKELETON AND NOT A SPINNER
 * A spinner says "something is happening"; a skeleton says "content is coming, and it will
 * be roughly this shape". The second is more useful on a slow connection, because the screen
 * does not jump when the data lands - the space is already reserved. On a phone on campus
 * wifi that difference is most of the perceived speed.
 *
 * WHY `aria-hidden` AND A SEPARATE LIVE REGION
 * The bars are decoration; announcing them would read as meaningless punctuation. The load
 * state is announced once through the `role="status"` wrapper instead, so a screen reader
 * hears "Loading" rather than a string of empty boxes.
 */

export function LoadingSkeleton({
  rows = 3,
  label = "Loading",
}: {
  rows?: number;
  /** Announced to assistive technology. Keep it short. */
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <span className="sr-only">{label}</span>
      {/* aria-hidden on the visual: it conveys nothing a screen reader can use. */}
      <div aria-hidden="true" className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-full bg-[var(--color-raised)]"
            // Decreasing widths so the block reads as text rather than as a table.
            style={{ width: `${[92, 78, 64, 84, 70][i % 5]}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default LoadingSkeleton;
