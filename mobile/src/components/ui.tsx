/**
 * src/components/ui.tsx — the small shared primitives.
 *
 * WHY THESE EXIST
 * ---------------
 * Every screen needs a button, a card and a text input that look the same. Inline
 * styles repeated across seven screens drift within a week: one screen's button
 * gains slightly different padding, another uses the wrong border colour, and the
 * app starts to look assembled rather than designed.
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is not a UI kit. There are five components here, chosen because they
 * appear on nearly every screen. If a sixth is needed for exactly one screen it
 * belongs inline in that screen, not here.
 *
 * ACCESSIBILITY DEFAULTS
 * ----------------------
 * Buttons carry `accessibilityRole` and `accessibilityState`, and every touch
 * target is at least 44 points tall, which is the minimum both Apple and Google
 * specify. This also makes the components drivable by the Playwright harness,
 * which locates elements the same way a screen reader does.
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { colors, radius, space, type as typography } from "../theme";

/** Minimum touch target. Below this, taps start to miss on a real phone. */
const MIN_TOUCH = 44;

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  /** Used by the test harness to find the control unambiguously. */
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  testID,
}: ButtonProps) {
  // A button that is loading is also not pressable: without this, a double tap
  // during a slow request fires two submissions.
  const inert = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        // Opacity rather than a colour change, so the disabled state reads the
        // same for every variant.
        inert && styles.buttonInert,
        pressed && !inert && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.fgOnAccent : colors.accent}
        />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === "primary" && styles.buttonLabelPrimary,
            variant !== "primary" && styles.buttonLabelSecondary,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  /** Shown under the input in the danger colour. Keeps validation next to the cause. */
  error?: string | null;
};

export function Field({ label, error, style, ...rest }: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        style={[styles.input, !!error && styles.inputError, style]}
        placeholderTextColor={colors.fgSubtle}
        // The caret and selection must be visible against the dark surface, or
        // selecting text is guesswork.
        selectionColor={colors.accent}
        accessibilityLabel={label}
      />
      {!!error && (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A screen title with an optional right-hand action. */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

/**
 * The empty state.
 *
 * `hint` is not optional by accident: "nothing here" without a next step is the
 * dead end that made the web app's Find Materials look broken. Every empty state
 * in this app says what to do next.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
      {action}
    </View>
  );
}

/** Full-screen spinner with an optional message, for first loads. */
export function Loading({ message }: { message?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} size="large" />
      {!!message && <Text style={styles.loadingText}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  buttonGhost: { backgroundColor: "transparent" },
  buttonInert: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { ...typography.bodyStrong },
  // The corrected on-accent token: 7.2:1 against the accent, meeting AAA.
  buttonLabelPrimary: { color: colors.fgOnAccent },
  buttonLabelSecondary: { color: colors.fg },

  fieldWrap: { marginBottom: space.md },
  fieldLabel: {
    ...typography.label,
    color: colors.fgMuted,
    textTransform: "uppercase",
    marginBottom: space.xs,
  },
  input: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.sunk,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.fg,
    ...typography.body,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { ...typography.caption, color: colors.danger, marginTop: space.xs },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.md,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: space.lg,
    gap: space.md,
  },
  headerText: { flex: 1 },
  headerTitle: { ...typography.display, color: colors.fg },
  headerSubtitle: { ...typography.caption, color: colors.fgMuted, marginTop: space.xs },

  empty: {
    padding: space.xl,
    alignItems: "center",
    gap: space.sm,
  },
  emptyTitle: { ...typography.bodyStrong, color: colors.fg },
  emptyHint: {
    ...typography.caption,
    color: colors.fgMuted,
    textAlign: "center",
    marginBottom: space.sm,
  },

  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md },
  loadingText: { ...typography.caption, color: colors.fgMuted },
});
