/**
 * src/components/StaleBanner.tsx — the honest staleness signal.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * With the network gone, React Query keeps serving cached data and a failed
 * background refetch leaves `isError === false` when data is present. So the app
 * rendered "11 open deadlines" from a fetch four hours old with **nothing** telling
 * the student. Measured on a real build: online and offline produced identical
 * screens.
 *
 * That is the founder's stated non-negotiable failing - a student on a bus with no
 * signal checking whether a deadline is still outstanding gets a confident answer
 * that may be days stale.
 *
 * WHY A BANNER AND NOT AN ERROR STATE
 * -----------------------------------
 * The data is not wrong. It is old, and it is still the best information the device
 * has. Replacing it with an error screen would destroy the only useful thing on
 * screen. Labelling it costs honesty and nothing else.
 *
 * WHY `warning` AND NOT `danger`
 * -----------------------------
 * Danger means "this is broken, stop". Warning means "read this, then decide". The
 * student can still act on what they see; they just need to know what it is. Using
 * the alarm colour here would train them to ignore it everywhere.
 *
 * WHY IT SAYS "COULDN'T REACH THE SERVER" RATHER THAN "YOU'RE OFFLINE"
 * We do not actually know the device is offline - we know one request failed. A
 * captive portal, a backend restart, or a flights-mode toggle all look the same from
 * here. Stating what we observed rather than inferring a cause is the same discipline
 * as `isUnreachable` being a status check rather than a guess about the network.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, type as typography } from "../theme";

type Props = {
  /** Re-run the failed query. Provided by the screen, so the banner owns no state. */
  onRetry: () => void;
  /**
   * Optional timestamp of the cached data. Shown when available because "3h ago" is
   * far more actionable than "some time ago" - it is the difference between a student
   * trusting the list and going to check.
   */
  dataUpdatedAt?: number;
};

/** Turn a timestamp into the shortest honest description of its age. */
function describeAge(ts: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function StaleBanner({ onRetry, dataUpdatedAt }: Props) {
  const age = dataUpdatedAt ? describeAge(dataUpdatedAt) : null;

  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={styles.textCol}>
        <Text style={styles.title}>Showing saved data</Text>
        <Text style={styles.body}>
          {age
            ? `Last updated ${age}. Couldn't reach the server.`
            : "Couldn't reach the server, so this may be out of date."}
        </Text>
      </View>
      {/*
        A real, tappable control with a 44pt target - not a styled Text. The
        PROJECT_HISTORY §7 regression is exactly this: a control that looked
        interactive and was not. A student tapping Retry must get a retry.
      */}
      <Pressable
        onPress={onRetry}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="Retry loading data"
        testID="stale-banner-retry"
      >
        <Text style={styles.actionText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  textCol: { flex: 1, gap: 2 },
  title: { ...typography.captionStrong, color: colors.warningText },
  body: { ...typography.caption, color: colors.warningText, opacity: 0.9 },
  action: {
    minHeight: 44,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  actionText: { ...typography.captionStrong, color: colors.warningText },
});
