/**
 * app/(tabs)/index.tsx — Home.
 *
 * THE MOST IMPORTANT SCREEN TO GET RIGHT
 * --------------------------------------
 * This is what a student sees first, and it is where "the app is broken" is
 * decided. So it is built to never show a bare spinner forever and never show a
 * blank screen without explanation:
 *
 *   loading          -> a spinner that says what it is waiting for
 *   cold backend     -> "waking the server up", because Render's free tier sleeps
 *   error            -> the reason in plain language, with a Retry control
 *   empty            -> what to do next, not just "nothing here"
 *   loaded           -> real modules, deadlines and activity
 *
 * The web client shipped for days with Home silently truncating its deadline
 * list, which made adding a deadline look broken. The count line below exists
 * specifically so a truncated list cannot hide again.
 */
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, EmptyState, Loading, ScreenHeader } from "../../src/components/ui";
import {
  describeError,
  useActivity,
  useDashboard,
  useModules,
} from "../../src/lib/queries";
import { describeDue } from "../../src/lib/dates";
import { colors, moduleColor, radius, space, type as typography } from "../../src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const dashboard = useDashboard();
  const modules = useModules();
  const activity = useActivity(6);

  const refreshing =
    dashboard.isRefetching || modules.isRefetching || activity.isRefetching;

  const refresh = useCallback(() => {
    void dashboard.refetch();
    void modules.refetch();
    void activity.refetch();
  }, [dashboard, modules, activity]);

  // ---------------------------------------------------------------------
  // First load. Only a spinner if there is genuinely nothing to show yet -
  // a background refetch must not blank the screen the student is reading.
  // ---------------------------------------------------------------------
  if (dashboard.isLoading && !dashboard.data) {
    return <Loading message="Loading your dashboard…" />;
  }

  if (dashboard.isError && !dashboard.data) {
    const message = describeError(dashboard.error);
    // Render's free tier sleeps, and the first request can take up to a minute.
    // Saying so is the difference between "this app is broken" and "this app is
    // waking up". ApiError with status 0 means the request never completed.
    const waking = message.toLowerCase().includes("reach the server");

    return (
      <View style={[styles.flex, { paddingTop: insets.top + space.lg }]}>
        <EmptyState
          title={waking ? "Waking the server up" : "Couldn't load your dashboard"}
          hint={
            waking
              ? "The free server sleeps when idle. This first load can take up to a minute — try again."
              : message
          }
          action={<Button label="Try again" onPress={refresh} testID="retry-button" />}
        />
      </View>
    );
  }

  const data = dashboard.data;
  const totalOpen = data?.total_open_tasks ?? 0;
  const shown = data?.urgent_tasks?.length ?? 0;
  const moduleList = modules.data ?? [];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <ScreenHeader
        title="Home"
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />

      {/* Summary tiles */}
      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <Text style={styles.tileValue}>{moduleList.length}</Text>
          <Text style={styles.tileLabel}>Modules</Text>
        </Card>
        <Card style={styles.tile}>
          <Text style={[styles.tileValue, totalOpen > 0 && styles.tileValueWarn]}>
            {totalOpen}
          </Text>
          <Text style={styles.tileLabel}>Open tasks</Text>
        </Card>
      </View>

      {/* Deadlines */}
      <Text style={styles.sectionTitle}>Deadlines</Text>
      {shown === 0 ? (
        <Card>
          <EmptyState
            title="No deadlines yet"
            hint="Add one from the Planner tab and it will appear here, soonest first."
            action={
              <Button
                label="Open Planner"
                variant="secondary"
                onPress={() => router.push("/planner")}
              />
            }
          />
        </Card>
      ) : (
        <>
          {data?.urgent_tasks?.map((task) => {
            const due = describeDue(task.due_date);
            return (
              <Card key={task.id} style={due.overdue ? styles.cardOverdue : undefined}>
                <View style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text style={styles.taskTitle} numberOfLines={2}>
                      {task.title}
                    </Text>
                    {!!task.module_code && (
                      <Text style={styles.taskMeta}>{task.module_code}</Text>
                    )}
                  </View>
                  <Text
                    style={[styles.due, due.overdue && styles.dueOverdue]}
                    accessibilityLabel={due.label}
                  >
                    {due.label}
                  </Text>
                </View>
              </Card>
            );
          })}
          {/*
            Only shown when the list is genuinely incomplete. Silently displaying
            five of eleven deadlines is how the web version looked broken.
          */}
          {totalOpen > shown && (
            <Text style={styles.truncationNote}>
              Showing {shown} of {totalOpen} open tasks — open the Planner for all of them.
            </Text>
          )}
        </>
      )}

      {/* Modules */}
      <Text style={styles.sectionTitle}>Your modules</Text>
      {moduleList.length === 0 ? (
        <Card>
          <EmptyState
            title="No modules yet"
            hint="Modules are entered by hand — your course, your codes. Add the first one to unlock summaries and resources."
            action={
              <Button
                label="Add a module"
                variant="secondary"
                onPress={() => router.push("/settings")}
              />
            }
          />
        </Card>
      ) : (
        <View style={styles.moduleGrid}>
          {moduleList.slice(0, 6).map((m) => {
            const tint = moduleColor(m.code);
            return (
              <View
                key={m.id}
                style={[styles.moduleChip, { backgroundColor: tint.bg, borderColor: tint.fg }]}
              >
                <Text style={[styles.moduleCode, { color: tint.fg }]}>{m.code}</Text>
                <Text style={styles.moduleName} numberOfLines={1}>
                  {m.name}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Recent activity — the student's own, never anything pre-seeded */}
      <Text style={styles.sectionTitle}>Recent activity</Text>
      {(activity.data ?? []).length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            Nothing yet. Your activity will show here as you use the app.
          </Text>
        </Card>
      ) : (
        <Card>
          {activity.data!.map((item, i) => (
            <View
              key={`${item.event_type}-${i}`}
              style={[styles.activityRow, i > 0 && styles.activityDivider]}
            >
              {/*
                The backend's ActivityItem carries event_type, module_code and
                created_at. There is no description field — an earlier draft of
                this screen read one, and every row would have rendered
                "undefined". The event type is humanised here instead of
                inventing a field the API does not send.
              */}
              <Text style={styles.activityText}>
                {item.event_type.replace(/_/g, " ")}
                {item.module_code ? ` · ${item.module_code}` : ""}
              </Text>
              {!!item.created_at && (
                <Text style={styles.activityTime}>
                  {new Date(item.created_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
              )}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },

  tiles: { flexDirection: "row", gap: space.md },
  tile: { flex: 1, alignItems: "center", paddingVertical: space.lg },
  tileValue: { ...typography.display, color: colors.fg },
  tileValueWarn: { color: colors.warning },
  tileLabel: { ...typography.label, color: colors.fgMuted, marginTop: space.xs },

  sectionTitle: {
    ...typography.title,
    color: colors.fg,
    marginTop: space.xl,
    marginBottom: space.md,
  },

  cardOverdue: {
    borderColor: colors.danger,
    backgroundColor: "rgba(232,92,106,0.08)",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  rowMain: { flex: 1 },
  taskTitle: { ...typography.bodyStrong, color: colors.fg },
  taskMeta: { ...typography.caption, color: colors.fgMuted, marginTop: 2 },
  due: { ...typography.caption, color: colors.fgMuted, fontWeight: "600" },
  dueOverdue: { color: colors.danger },
  truncationNote: {
    ...typography.caption,
    color: colors.fgSubtle,
    marginTop: space.xs,
    marginBottom: space.sm,
  },

  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  moduleChip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minWidth: "47%",
    flexGrow: 1,
  },
  moduleCode: { ...typography.bodyStrong },
  moduleName: { ...typography.caption, color: colors.fgMuted, marginTop: 2 },

  muted: { ...typography.caption, color: colors.fgMuted },
  activityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    gap: space.md,
  },
  activityDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  activityText: { ...typography.body, color: colors.fg, flex: 1 },
  activityTime: { ...typography.caption, color: colors.fgSubtle },
});
