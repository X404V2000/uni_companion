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
 * WHY THERE IS NO ROUTE GUARD HERE ANY MORE
 * -----------------------------------------
 * The first version wrapped the groups in `Stack.Protected guard={...}`. Signing
 * in worked - the API returned 200 and the token was stored - but the tab bar
 * then navigated by URL without ever swapping the screen. Tapping Planner changed
 * the address to /planner and left Home mounted.
 *
 * The cause is the nesting: a `Tabs` navigator mounted inside a conditional
 * `Stack.Protected` group is mounted once and then does not respond to pushes
 * within itself. The guard is evaluated at the Stack level, and the Tabs
 * navigator beneath it keeps whichever screen it first resolved.
 *
 * The fix is the pattern expo-router's own authentication guidance uses: declare
 * the groups unconditionally so both are always part of the navigation tree, and
 * redirect from inside each group's own layout. Each group then owns its own
 * decision, and the navigators beneath are never conditionally mounted.
 */
import { Stack } from "expo-router";
import { enableScreens } from "react-native-screens";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Render's free tier sleeps. This is the difference between "the app
      // loaded" and "the app failed" on the first request of a session.
      refetchOnWindowFocus: false,
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
