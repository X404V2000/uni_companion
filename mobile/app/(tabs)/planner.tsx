/**
 * app/(tabs)/planner.tsx — deadlines.
 *
 * WHAT THIS SCREEN MUST GET RIGHT
 * -------------------------------
 * On the web client, "add deadline" appeared to do nothing for a day. The cause
 * was two separate bugs: the form was on a different tab, and the dashboard list
 * was truncated so a newly added task could not be seen even after it saved. Both
 * looked like the save had failed.
 *
 * So this screen does three things deliberately:
 *   1. The add form is here, where deadlines are listed - not elsewhere.
 *   2. A successful save is confirmed explicitly, not just implied by the list.
 *   3. The list shows how many there are, so a silent truncation cannot hide.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
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
import {
  describeError,
  isStaleAfterFailure,
  useAddDeadline,
  useCompleteTask,
  useDashboard,
  useModules,
} from "../../src/lib/queries";
import { toIso } from "../../src/lib/dates";
import { colors, radius, space, type as typography } from "../../src/theme";

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();

  const dashboard = useDashboard();
  const modules = useModules();
  // True when we already know the server cannot be reached.
  //
  // Derived from the primary read being stale-after-failure. That is the honest
  // signal available without a connectivity library: if the read we just made
  // failed while we still hold cached data, the write will fail too. Checking the
  // read rather than the last write matters, because the write that would tell us
  // is the very one we are trying to prevent.
  const offline = isStaleAfterFailure(dashboard);

  // The last refusal, so the screen can explain WHY the button is disabled rather
  // than leaving a dead control with no reason - the PROJECT_HISTORY §7 regression
  // is exactly a control that looked actionable and did nothing.
  const [blockedReason, setBlockedReason] = useState("");

  const addDeadline = useAddDeadline();
  const completeTask = useCompleteTask();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [moduleCode, setModuleCode] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const moduleList = modules.data ?? [];
  const tasks = dashboard.data?.urgent_tasks ?? [];
  const totalOpen = dashboard.data?.total_open_tasks ?? 0;

  function resetForm() {
    setTitle("");
    setDueDate("");
    setError(null);
  }

  async function submit() {
    setError(null);
    setSaved(null);

    if (!title.trim()) {
      setError("Give the deadline a title.");
      return;
    }
    if (title.trim().length < 2) {
      setError("That title is too short.");
      return;
    }

    const iso = toIso(dueDate);
    if (dueDate.trim() && !iso) {
      // Caught here rather than sent, so the student is told immediately instead
      // of receiving a 422 they cannot interpret.
      setError("Use the date format YYYY-MM-DD, for example 2026-10-05.");
      return;
    }

    // createTask takes moduleId (a UUID) and dueDate, not module_code and
    // due_date. Resolving the code to an id here is the whole reason the module
    // picker sets a code and this line looks up its id.
    const selected = moduleList.find(
      (m) => m.code === (moduleCode || moduleList[0]?.code),
    );
    if (!selected) {
      setError("Choose a module for this deadline.");
      return;
    }

    // REFUSE BEFORE SENDING, NOT AFTER FAILING.
    //
    // If this mutation were allowed to run offline it would fail after a delay -
    // and the confirmation below would already have been reached in the
    // optimistic case, telling the student "Saved" for something that was never
    // persisted. They would find out when they missed the deadline, which is the
    // single worst failure this product can produce.
    if (offline) {
      const reason = "Can't save while offline. Your deadline has not been added.";
      setError(reason);
      setBlockedReason(reason);
      return;
    }

    try {
      await addDeadline.mutateAsync({
        moduleId: selected.id,
        title: title.trim(),
        dueDate: iso ?? new Date().toISOString(),
      });
      resetForm();
      setShowForm(false);
      setBlockedReason("");
      // Named explicitly so there is no doubt the save worked.
      setSaved(`Saved "${title.trim()}".`);
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isRefetching}
            onRefresh={() => void dashboard.refetch()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {isStaleAfterFailure(dashboard) ? (
          <StaleBanner
            onRetry={() => void dashboard.refetch()}
            dataUpdatedAt={dashboard.dataUpdatedAt}
          />
        ) : null}

        <ScreenHeader
          title="Planner"
          subtitle={
            totalOpen === 0
              ? "No open deadlines"
              : `${totalOpen} open deadline${totalOpen === 1 ? "" : "s"}`
          }
          right={
            <Button
              label={offline ? "Offline" : "Add"}
              onPress={() => setShowForm(true)}
              testID="add-deadline-button"
            />
          }
        />

        {!!saved && (
          <View style={styles.success} accessibilityLiveRegion="polite">
            <Text style={styles.successText}>{saved}</Text>
          </View>
        )}

        {dashboard.isLoading && !dashboard.data ? (
          <Card>
            <Text style={styles.muted}>Loading your deadlines…</Text>
          </Card>
        ) : tasks.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing due yet"
              hint="Add your first deadline and it will appear here, soonest first."
              action={<Button label="Add a deadline" onPress={() => setShowForm(true)} />}
            />
          </Card>
        ) : (
          tasks.map((task) => {
            const due = task.due_date ? new Date(task.due_date) : null;
            const overdue = !!due && due.getTime() < Date.now();
            return (
              <Card key={task.id} style={overdue ? styles.overdue : undefined}>
                <View style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text style={styles.title} numberOfLines={2}>
                      {task.title}
                    </Text>
                    <Text style={styles.meta}>
                      {[task.module_code, due ? due.toLocaleDateString() : "No due date"]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Button
                    label="Done"
                    variant="secondary"
                    onPress={() => void completeTask.mutateAsync(task.id)}
                    testID={`complete-${task.id}`}
                  />
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Add form. A modal rather than an inline panel, so the list behind it
          does not shift and the student is not distracted while typing. */}
      <Modal
        visible={showForm}
        animationType="slide"
        transparent
        onRequestClose={() => setShowForm(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + space.lg }]}>
            <Text style={styles.modalTitle}>New deadline</Text>

            <Field
              label="What is due"
              value={title}
              onChangeText={setTitle}
              placeholder="Lab report 3"
              testID="title-input"
            />

            <Field
              label="Due date"
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              testID="due-input"
            />

            <Text style={styles.fieldLabel}>Module</Text>
            {moduleList.length === 0 ? (
              // Without a module there is nothing to attach the deadline to, so
              // the dead end is stated rather than leaving an empty picker.
              <Text style={styles.muted}>
                No modules yet. Add one from Settings first.
              </Text>
            ) : (
              <View style={styles.chips}>
                {moduleList.map((m) => (
                  <Button
                    key={m.id}
                    label={m.code}
                    variant={moduleCode === m.code ? "primary" : "secondary"}
                    onPress={() => setModuleCode(m.code)}
                  />
                ))}
              </View>
            )}

            {!!error && (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setShowForm(false);
                  resetForm();
                }}
              />
              <Button
                label="Save deadline"
                onPress={submit}
                loading={addDeadline.isPending}
                disabled={moduleList.length === 0}
                testID="save-deadline-button"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },

  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  rowMain: { flex: 1 },
  title: { ...typography.bodyStrong, color: colors.fg },
  meta: { ...typography.caption, color: colors.fgMuted, marginTop: 2 },
  overdue: { borderColor: colors.danger, backgroundColor: "rgba(232,92,106,0.08)" },
  muted: { ...typography.caption, color: colors.fgMuted },

  success: {
    backgroundColor: "rgba(107,191,133,0.12)",
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.md,
  },
  successText: { ...typography.caption, color: colors.success },

  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  modalTitle: { ...typography.title, color: colors.fg, marginBottom: space.lg },
  fieldLabel: {
    ...typography.label,
    color: colors.fgMuted,
    textTransform: "uppercase",
    marginBottom: space.xs,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  error: {
    backgroundColor: "rgba(232,92,106,0.12)",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.md,
  },
  errorText: { ...typography.caption, color: colors.danger },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: space.md },
});
