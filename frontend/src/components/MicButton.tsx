/**
 * components/MicButton.tsx
 *
 * The microphone control, shared by AI Summaries and the deadline form.
 *
 * WHY ONE COMPONENT FOR BOTH
 * --------------------------
 * Two screens needing the same button is exactly the situation that produces
 * two slightly different microphones: one that stops on pause, one that does
 * not; one that hides when unsupported, one that fails when tapped. One
 * component means one behaviour to fix.
 *
 * WHY IT HIDES WHEN UNSUPPORTED
 * -----------------------------
 * On a browser without the Web Speech API - iOS Safari is the common one - a
 * mic button that appears and then does nothing is worse than no button. The
 * student concludes the app is broken rather than that their browser lacks a
 * feature. Typing still works and nothing suggests otherwise.
 *
 * WHY THE ERRORS ARE SPOKEN PLAINLY
 * ---------------------------------
 * "not-allowed" means nothing to a student holding a phone. Each failure is
 * turned into a sentence that names the next action.
 */
import { useEffect } from "react";

import type { SpeechState } from "../lib/useSpeech";
import { Icon } from "./Icon";

export default function MicButton({
  isSupported,
  state,
  interim,
  error,
  onToggle,
  label = "Dictate",
}: {
  isSupported: boolean;
  state: SpeechState;
  interim: string;
  error: string;
  onToggle: () => void;
  label?: string;
}) {
  // Nothing to offer: render nothing rather than a control that cannot work.
  if (!isSupported) return null;

  const listening = state === "listening";
  /**
   * The moment the button is tapped it says "Starting…".
   *
   * Some engines accept the start call and then never respond at all (Chrome
   * without a working speech service). Without this intermediate state the
   * button looks unchanged for four seconds, which reads as a dead control.
   */
  const starting = state === "starting";

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={listening}
        aria-label={listening ? "Stop dictation" : "Dictate with your voice"}
        className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-extrabold transition ${
          listening
            ? "bg-[var(--color-danger)] text-white"
            : starting
              ? "border border-[var(--color-teal)] bg-[var(--color-teal)]/15 text-[var(--color-teal)]"
              : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-muted)]"
        }`}
      >
        {/* A pulsing dot while the microphone is live, so it is never ambiguous
            whether the app is listening. */}
        {listening ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
        ) : (
          <Icon name="mic" className="h-3.5 w-3.5" />
        )}
        {listening ? "Listening…" : starting ? "Starting…" : label}
      </button>

      {/* Words as they are recognised. Shown but never committed until final,
          so a half-guessed word cannot silently enter the student's notes. */}
      {listening && interim && (
        <p className="px-1 text-[10px] italic leading-relaxed text-[var(--color-fg-subtle)]">
          {interim}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="max-w-[220px] px-1 text-[10px] leading-relaxed text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Clears a stale speech error when the surrounding form is reset. */
export function useClearSpeechError(clearError: () => void, deps: unknown[]) {
  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
