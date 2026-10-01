/**
 * app/(auth)/_layout.tsx — the unauthenticated half of the app.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * It holds the mirror of the guard in app/(tabs)/_layout.tsx: a student who is
 * already signed in should never see the login screen, including on a cold start
 * where the token is restored from the keystore.
 *
 * Both group layouts own their own decision rather than the root layout gating
 * them, because conditionally mounting a navigator is what broke tab switching.
 * See the comment in (tabs)/_layout.tsx for the full explanation.
 */
import { Redirect, Stack } from "expo-router";

import { useSession } from "../../src/lib/session";

export default function AuthLayout() {
  const { status } = useSession();

  if (status === "signed-in") return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
