/**
 * src/components/WakingUp.tsx — the cold-start state.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Render's free tier sleeps after ~15 minutes of inactivity. The next request
 * takes up to 86 seconds to answer — measured, not estimated. Nothing is wrong
 * with the app or the backend during that window; the backend is being started.
 *
 * Previously this showed an error card with a "Try again" button. That is the
 * wrong response to a condition that resolves itself: it asks the student to
 * diagnose something, at the exact moment they are least able to, and it tells
 * them the dashboard "couldn't load" when the truth is "it is loading, slowly".
 * For a student opening the app at 23:00 to check a deadline, that reads as a
 * broken app.
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 * Retries automatically, and shows a countdown so the wait is legible. The
 * student can still tap to retry immediately. If the retries are exhausted the
 * component hands control back to the caller to render a real error state,
 * because at that point "unreachable" has persisted long enough that it is
 * probably a genuine network fault rather than a waking server.
 *
 * WHY THE COUNTDOWN MATTERS
 * -------------------------
 * An indefinite spinner and a hang look identical to a user. A number that
 * decreases is evidence the app is working, which is the difference between a
 * student waiting and a student force-quitting.
 */
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui";
import { colors, radius, space, type as typography } from "../theme";

/** Seconds between automatic retries. */
const RETRY_INTERVAL_SECONDS = 15;
/** How many automatic retries before we stop and report honestly. */
const MAX_AUTO_RETRIES = 6;

type Props = {
  /** Called to re-issue the failed request. Should return a promise. */
  onRetry: () => Promise<unknown> | void;
  /** Called once the automatic retries are exhausted. */
  onGiveUp: () => void;
};

export function WakingUp({ onRetry, onGiveUp }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(RETRY_INTERVAL_SECONDS);
  const [attempt, setAttempt] = useState(1);
  const [retrying, setRetrying] = useState(false);

  // Refs, not state: the tick below must read the current values without the
  // interval being torn down and rebuilt on every change, which would reset the
  // countdown each time it fired.
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;

        // Countdown reached zero: retry.
        if (attemptRef.current >= MAX_AUTO_RETRIES) {
          onGiveUp();
          return 0;
        }
        void (async () => {
          setRetrying(true);
          try {
            await onRetry();
          } finally {
            setRetrying(false);
            setAttempt((a) => a + 1);
            setSecondsLeft(RETRY_INTERVAL_SECONDS);
          }
        })();
        return RETRY_INTERVAL_SECONDS;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [onRetry, onGiveUp]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Starting the server</Text>
      <Text style={styles.body}>
        The study server sleeps when nobody is using it, and takes up to a minute
        to wake. Your work is safe — nothing has been lost.
      </Text>

      <View style={styles.progress}>
        <Text style={styles.countdown}>
          {retrying ? "Checking…" : `Retrying in ${secondsLeft}s`}
        </Text>
        <Text style={styles.attempt}>
          Attempt {attempt} of {MAX_AUTO_RETRIES}
        </Text>
      </View>

      <Button
        label="Try now"
        variant="secondary"
        onPress={() => {
          setSecondsLeft(RETRY_INTERVAL_SECONDS);
          void (async () => {
            setRetrying(true);
            try {
              await onRetry();
            } finally {
              setRetrying(false);
            }
          })();
        }}
        testID="retry-button"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.md,
  },
  title: { ...typography.title, color: colors.fg },
  body: {
    ...typography.body,
    color: colors.fgMuted,
    textAlign: "center",
    maxWidth: 340,
  },
  progress: {
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    marginTop: space.sm,
  },
  countdown: { ...typography.bodyStrong, color: colors.accent },
  attempt: { ...typography.caption, color: colors.fgSubtle },
});
