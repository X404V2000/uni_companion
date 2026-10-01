/**
 * app/(auth)/sign-in.tsx — login and signup.
 *
 * WHY ONE SCREEN FOR BOTH
 * -----------------------
 * The web client uses a single page with a mode toggle, and students expect the
 * same. Two nearly-identical screens would also drift apart. The mode switch
 * changes the fields, the button label and the validation, nothing else.
 *
 * SESSION RESTORATION IS NOT DONE HERE
 * ------------------------------------
 * A stored token is validated against /auth/me in the root layout, not trusted
 * blindly on this screen. Trusting it here would flash the dashboard for a
 * fraction of a second before an expired token bounced the student back, which
 * reads as a bug. The root layout holds the splash until that check resolves.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Card, Field } from "../../src/components/ui";
import { describeError, useLogin, useSignup } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { colors, radius, space, type as typography } from "../../src/theme";

type Mode = "login" | "signup";

export default function SignInScreen() {
  // The session, not the router. markSignedIn() flips the route guard, which
  // is what actually moves the student on to the tabs. Navigating first used
  // to resolve to no route at all and silently bounced back to this screen.
  const session = useSession();
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Field-level errors are kept separate from the form-level banner so a
  // mistyped email is flagged next to the email field rather than in a message
  // at the top of the screen.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const login = useLogin();
  const signup = useSignup();
  const pending = login.isPending || signup.isPending;

  /**
   * Validate before hitting the network.
   *
   * The backend also validates, but a round trip to learn that an email is
   * missing is a wasted request on a connection where requests are expensive.
   */
  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "Enter your email address.";
    else if (!email.includes("@")) errors.email = "That doesn't look like an email.";

    if (!password) errors.password = "Enter your password.";
    // Mirrors the backend's 8-character minimum for new accounts. The login
    // minimum stays at 6 so an older account still works.
    else if (mode === "signup" && password.length < 8) {
      errors.password = "Use at least 8 characters.";
    }

    if (mode === "signup" && !fullName.trim()) {
      errors.fullName = "Enter your full name.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit() {
    setFormError(null);
    if (!validate()) return;

    try {
      if (mode === "login") {
        await login.mutateAsync({ email: email.trim(), password });
      } else {
        await signup.mutateAsync({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
        });
        // Signing up and then having to log in is friction for no reason, so
        // the account is used immediately.
        await login.mutateAsync({ email: email.trim(), password });
      }
      // No navigation call here on purpose. Flipping the session makes the
      // root layout's guard admit the (tabs) group, and the router renders it.
      await session.markSignedIn();
    } catch (error) {
      setFormError(describeError(error));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // On iOS the keyboard covers the submit button without this. Android
      // handles it via the window resize mode, so applying it there doubles the
      // offset and leaves a gap.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Text style={styles.brandTop}>VARSITY</Text>
          <Text style={styles.brandBottom}>COMPANION</Text>
          <Text style={styles.tagline}>Your course-aware study assistant</Text>
        </View>

        <Card>
          {/* Mode toggle */}
          <View style={styles.toggle}>
            {(["login", "signup"] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setMode(m);
                  // Clear errors: they belong to the previous form.
                  setFieldErrors({});
                  setFormError(null);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                style={[styles.toggleItem, mode === m && styles.toggleItemActive]}
              >
                <Text
                  style={[
                    styles.toggleLabel,
                    mode === m && styles.toggleLabelActive,
                  ]}
                >
                  {m === "login" ? "Log in" : "Sign up"}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "signup" && (
            <Field
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Thandi Mokoena"
              autoCapitalize="words"
              autoComplete="name"
              error={fieldErrors.fullName}
              testID="fullname-input"
            />
          )}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@university.ac.za"
            // Email is never capitalised, and autocorrect would fight the user
            // on every keystroke.
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={fieldErrors.email}
            testID="email-input"
          />

          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            error={fieldErrors.password}
            testID="password-input"
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          {!!formError && (
            <View style={styles.banner} accessibilityLiveRegion="polite">
              <Text style={styles.bannerText}>{formError}</Text>
            </View>
          )}

          <Button
            label={mode === "login" ? "Log in" : "Create account"}
            onPress={submit}
            loading={pending}
            testID="submit-button"
          />

          <Text style={styles.legal}>
            By continuing you agree to our terms and privacy policy.
          </Text>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: space.xl,
  },
  brand: { alignItems: "center", marginBottom: space.xxl },
  brandTop: {
    ...typography.display,
    color: colors.fg,
    letterSpacing: 2,
  },
  brandBottom: {
    ...typography.display,
    color: colors.accent,
    letterSpacing: 2,
    marginTop: -4,
  },
  tagline: {
    ...typography.caption,
    color: colors.fgMuted,
    marginTop: space.sm,
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.sunk,
    borderRadius: radius.sm,
    padding: space.xs,
    marginBottom: space.lg,
  },
  toggleItem: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm - 2,
  },
  toggleItemActive: { backgroundColor: colors.raised },
  toggleLabel: { ...typography.body, color: colors.fgMuted },
  toggleLabelActive: { color: colors.fg, fontWeight: "600" },
  banner: {
    backgroundColor: "rgba(232,92,106,0.12)",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.md,
  },
  bannerText: { ...typography.caption, color: colors.danger },
  legal: {
    ...typography.caption,
    color: colors.fgSubtle,
    textAlign: "center",
    marginTop: space.lg,
  },
});
