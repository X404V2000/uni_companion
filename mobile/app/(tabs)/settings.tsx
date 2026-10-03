/**
 * app/(tabs)/settings.tsx — account, modules, and privacy.
 *
 * WHY SETTINGS HOLDS MODULE MANAGEMENT
 * ------------------------------------
 * The web client has a separate sidebar entry for modules. A phone has room for
 * five tabs, and module management is something a student does once at the start
 * of a semester and then rarely. It belongs here, not in the daily-use tabs.
 *
 * WHAT THIS SCREEN OWNS
 * ---------------------
 *   - the signed-in student's real profile (from /auth/me, never hardcoded)
 *   - module add/remove
 *   - the POPIA consent toggle, so a decision made at first summary can be
 *     changed later without hunting for it
 *   - sign out
 */
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, EmptyState, Field, ScreenHeader } from "../../src/components/ui";
import { StaleBanner } from "../../src/components/StaleBanner";
import { useConsent } from "../../src/lib/consent";
import { useSession } from "../../src/lib/session";
import {
  useProfile,
  describeError,
  isStaleAfterFailure,
  signOut,
  useAddModule,
  useDeleteModule,
  useModules,
} from "../../src/lib/queries";
import { colors, moduleColor, radius, space, type as typography } from "../../src/theme";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  const profile = useProfile();
  const modules = useModules();
  // True when the server is known to be unreachable. Derived from the profile
  // read, which Settings already makes on mount.
  const offline = isStaleAfterFailure(profile);

  const addModule = useAddModule();
  const deleteModule = useDeleteModule();
  const consent = useConsent();
  const session = useSession();

  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const moduleList = modules.data ?? [];

  async function submitModule() {
    setError(null);
    const c = code.trim().toUpperCase();
    const n = name.trim();

    if (c.length < 3) {
      setError("Module codes are at least 3 characters, for example COS132.");
      return;
    }
    if (n.length < 3) {
      // The full name is what the AI works from, so it is not optional. A bare
      // code gives the summariser and the recommendation engine nothing.
      setError("Enter the full module name — that is what the AI reads.");
      return;
    }
    if (moduleList.some((m) => m.code.toUpperCase() === c)) {
      setError(`${c} is already in your module list.`);
      return;
    }

    try {
// Refuse rather than fail late, for the same reason as the Planner write:
// a module that appears added and is not is a lie the student acts on.
if (offline) {
  setError("Can't add a module while offline.");
  return;
}
      await addModule.mutateAsync({ code: c, name: n });
      setCode("");
      setName("");
      setShowAdd(false);
    } catch (e) {
      setError(describeError(e));
    }
  }

  function confirmDelete(moduleId: string, moduleCode: string) {
    // A destructive action asks first, and names what it is about to remove.
    Alert.alert(
      `Remove ${moduleCode}?`,
      "This removes the module and its timetable slots. Your other modules are unaffected.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            if (offline) {
              setError("Can't delete a module while offline.");
              return;
            }
            void deleteModule.mutateAsync(moduleId);
          },
        },
      ],
    );
  }

  async function handleSignOut() {
    // Clearing the session is what moves the student back to the auth flow -
    // the same guard that lets them in also lets them out. Calling signOut()
    // alone cleared the token but left the guard admitting the tabs.
    await signOut();
    await session.markSignedOut();
  }

  const me = profile.data;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={modules.isRefetching || profile.isRefetching}
            onRefresh={() => {
              void modules.refetch();
              void profile.refetch();
            }}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {isStaleAfterFailure(profile) ? (
          <StaleBanner
            onRetry={() => void profile.refetch()}
            dataUpdatedAt={profile.dataUpdatedAt}
          />
        ) : null}

        <ScreenHeader title="Settings" />

        {/* Profile — real fields from /auth/me */}
        <Text style={styles.sectionTitle}>Account</Text>
        <Card>
          <Text style={styles.profileName}>{me?.full_name ?? "—"}</Text>
          <Text style={styles.profileLine}>{me?.email ?? ""}</Text>
          {!!me?.university && <Text style={styles.profileLine}>{me.university}</Text>}
          {!!me?.field_of_study && (
            <Text style={styles.profileLine}>
              {[me.field_of_study, me.year_of_study ? `Year ${me.year_of_study}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}
        </Card>

        {/* Modules */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Modules</Text>
          <Button
            label={showAdd ? "Close" : "Add"}
            variant="secondary"
            onPress={() => setShowAdd((v) => !v)}
            testID="add-module-toggle"
          />
        </View>

        {showAdd && (
          <Card>
            <Field
              label="Module code"
              value={code}
              onChangeText={setCode}
              placeholder="COS132"
              autoCapitalize="characters"
              autoCorrect={false}
              testID="module-code-input"
            />
            <Field
              label="Full module name"
              value={name}
              onChangeText={setName}
              placeholder="Introduction to Programming"
              autoCapitalize="words"
              testID="module-name-input"
            />
            {!!error && (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <Button
              label="Add module"
              onPress={submitModule}
              loading={addModule.isPending}
              testID="save-module-button"
            />
          </Card>
        )}

        {moduleList.length === 0 && !showAdd ? (
          <Card>
            <EmptyState
              title="No modules yet"
              hint="Modules are typed in by you — nothing is pre-filled. Add your first one to unlock summaries and resources."
              action={<Button label="Add a module" onPress={() => setShowAdd(true)} />}
            />
          </Card>
        ) : (
          moduleList.map((m) => {
            const tint = moduleColor(m.code);
            return (
              <Card key={m.id}>
                <View style={styles.moduleRow}>
                  <View style={[styles.moduleDot, { backgroundColor: tint.fg }]} />
                  <View style={styles.moduleText}>
                    <Text style={styles.moduleCode}>{m.code}</Text>
                    <Text style={styles.moduleName} numberOfLines={2}>
                      {m.name}
                    </Text>
                  </View>
                  <Button
                    label="Remove"
                    variant="ghost"
                    onPress={() => confirmDelete(m.id, m.code)}
                  />
                </View>
              </Card>
            );
          })
        )}

        {/* Privacy */}
        <Text style={styles.sectionTitle}>Privacy</Text>
        <Card>
          <Text style={styles.privacyTitle}>Product improvement data</Text>
          <Text style={styles.privacyBody}>
            Records which features you use, so we can see what works. Never the text
            of your notes, your summaries, or anything you upload.
          </Text>
          <Text style={styles.privacyState}>
            {consent.loading
              ? "Checking…"
              : consent.granted
                ? "Currently: allowed"
                : "Currently: not allowed"}
          </Text>
          <Button
            label={consent.granted ? "Turn off" : "Turn on"}
            variant="secondary"
            disabled={consent.loading}
            testID="consent-toggle"
            onPress={() => {
              void consent.update(!consent.granted, "settings").catch((e) => {
                Alert.alert("Could not save that", describeError(e));
              });
            }}
          />
        </Card>

        {/* Session */}
        <Text style={styles.sectionTitle}>Session</Text>
        <Button label="Sign out" variant="secondary" onPress={handleSignOut} testID="signout-button" />

        <Text style={styles.footer}>
          Varsity Companion · Mobile V1{"\n"}
          Offline sync and file upload arrive in a later release.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },

  sectionTitle: {
    ...typography.title,
    color: colors.fg,
    marginTop: space.lg,
    marginBottom: space.md,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.lg,
    marginBottom: space.md,
  },

  profileName: { ...typography.title, color: colors.fg },
  profileLine: { ...typography.caption, color: colors.fgMuted, marginTop: 2 },

  moduleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  moduleDot: { width: 10, height: 10, borderRadius: 5 },
  moduleText: { flex: 1 },
  moduleCode: { ...typography.bodyStrong, color: colors.fg },
  moduleName: { ...typography.caption, color: colors.fgMuted, marginTop: 2 },

  privacyTitle: { ...typography.bodyStrong, color: colors.fg },
  privacyBody: { ...typography.caption, color: colors.fgMuted, marginTop: space.xs },
  privacyState: {
    ...typography.caption,
    color: colors.accent,
    marginTop: space.sm,
    marginBottom: space.md,
  },

  error: {
    backgroundColor: "rgba(232,92,106,0.12)",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.md,
  },
  errorText: { ...typography.caption, color: colors.danger },

  footer: {
    ...typography.caption,
    color: colors.fgSubtle,
    textAlign: "center",
    marginTop: space.xxl,
    lineHeight: 18,
  },
});
