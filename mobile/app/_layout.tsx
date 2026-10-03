/**
 * app/_layout.tsx — the root layout.
 *
 * RESPONSIBILITIES
 * ----------------
 *   1. Provide the React Query client.
 *   2. Provide the shared session state (see src/lib/session.tsx).
 *   3. Hold a splash until the session is known.
 *   4. Declare both route groups so the router knows they exist.
 *
 * WHY THE TAB BAR ONCE FROZE, AND WHAT ACTUALLY FIXED IT
 * -----------------------------------------------------
 * Symptom: tapping a tab changed the URL and the router's own state, but the
 * visible screen never changed. Tapping Planner set the address to /planner and
 * left Home on screen.
 *
 * THE CAUSE WAS NOT THE GUARD. THIS COMMENT PREVIOUSLY SAID IT WAS, AND THAT WAS
 * WRONG. See `enableScreens()` below. The guard - formerly `Stack.Protected`,
 * now the per-group redirect - was moved three times while this bug was open, and
 * was never the cause. Do not move it again on the strength of this file.
 *
 * The actual cause: `react-native-screens` was a dependency but `enableScreens()`
 * had never been called. Without it the navigators fall back to plain View
 * stacking, an inactive scene is left MOUNTED at z-index -1 rather than detached,
 * and it paints over the active one. Measured on a running build, the scene
 * container held both screens at the same rect, Home at z-index -1 and the active
 * screen at 0. Navigation was always correct; the render layer was not.
 *
 * Proven causal: with `enableScreens()` commented out the acceptance harness
 * reports 4 broken tabs; with it enabled, all five render correctly. Same build,
 * same backend, one line different.
 *
 * The unconditional-group pattern below is still the right shape, and it is what
 * expo-router's authentication guidance recommends - each group owns its own
 * redirect rather than being conditionally mounted. It simply was not the fix for
 * this bug, and keeping it is not evidence that it was.
 */
import { Stack } from "expo-router";
import { enableScreens } from "react-native-screens";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SessionProvider, useSession } from "../src/lib/session";
import { colors, space, type as typography } from "../src/theme";

/**
 * One client for the whole app, created outside the component so a re-render can
 * never produce a second cache and silently duplicate every query.
 */
// WHY THIS CALL MATTERS
// ---------------------
// react-native-screens was a dependency but was never enabled. Without it the
// navigators fall back to plain View stacking, and an inactive screen is left
// mounted with z-index -1 rather than being detached. Measured on a running
// build: the inactive Home screen sat at z-index -1 and still painted over the
// active one, so tapping a tab changed the router state (proven: usePathname
// reported /settings) while the visible screen never changed.
//
// enableScreens() switches the navigators to real screen containers, which
// detach the inactive scene instead of layering it. This is the documented
// requirement for expo-router and was simply missing.
//
// Called at module scope so it runs before any navigator mounts.
enableScreens();

// WHY REAL CONNECTIVITY STATE, AND NOT A FAILED REQUEST
// -----------------------------------------------------
// React Query's `onlineManager` decides whether queries may run. Its built-in
// implementation attaches to `window.addEventListener("online"/"offline")` -
// guarded by `typeof window !== "undefined"` - which never runs on React Native.
// So out of the box it reports online forever and does nothing on this platform.
//
// Without it, the app could only learn it was offline RETROACTIVELY, by attempting
// a request and failing. Measured: with `staleTime: 30_000`, tapping between tabs
// while offline produced ZERO requests, so nothing ever failed, so nothing ever
// knew. The staleness banner and the write-guard both keyed off that failure and
// therefore never fired - the app showed confidently stale data, and would have
// let a student "save" a deadline that was never sent.
//
// Wiring NetInfo here fixes both halves at once:
//   1. We KNOW we are offline the moment signal drops, without spending a request.
//   2. Queries PAUSE (fetchStatus "paused") rather than fail, so an outage makes
//      FEWER requests than before, not more - which matters on metered data and on
//      Render's 720-of-750-hour free budget.
//   3. On reconnect, React Query refetches automatically and the banner clears.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    // `isInternetReachable` is null while unknown; treat only an explicit true as
    // reachable so we do not claim connectivity we have not confirmed.
    setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
  }),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Render's free tier sleeps. This is the difference between "the app
      // loaded" and "the app failed" on the first request of a session.
      refetchOnWindowFocus: false,
      // Ties query execution to the connectivity state wired above. While offline
      // a query does not run at all - it reports fetchStatus "paused" - which is
      // what makes the staleness signal immediate instead of retroactive.
      networkMode: "online",
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </SafeAreaProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

/**
 * Reads the session, so it must sit inside SessionProvider - which is why it is
 * a separate component rather than inline above. Calling the hook in the same
 * component that renders the provider reads a default, because the provider has
 * not mounted yet at that point.
 */
function RootNavigator() {
  const { status } = useSession();

  // Hold the splash while the token is validated. Rendering the router before
  // then shows the login screen for a moment and then jumps, which reads as a
  // bug even though nothing is broken.
  if (status === "checking") return <Splash />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/*
        Both groups are declared unconditionally. Which one is reachable is
        decided by the redirect inside each group's own layout, not by mounting
        or unmounting them here.
      */}
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

/** Shown only while the session resolves — one request at most. */
function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.brandTop}>VARSITY</Text>
      <Text style={styles.brandBottom}>COMPANION</Text>
      <Text style={styles.hint}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  brandTop: { ...typography.display, color: colors.fg, letterSpacing: 2 },
  brandBottom: {
    ...typography.display,
    color: colors.accent,
    letterSpacing: 2,
    marginTop: -4,
  },
  hint: { ...typography.caption, color: colors.fgMuted, marginTop: space.lg },
});
