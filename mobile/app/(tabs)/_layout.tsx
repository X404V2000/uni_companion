/**
 * app/(tabs)/_layout.tsx — the bottom tab bar.
 *
 * WHY FIVE TABS AND NOT SEVEN
 * ---------------------------
 * The web client has seven destinations because a browser has room for a sidebar.
 * A phone does not: past five items the labels truncate and the touch targets
 * fall below the 44-point minimum. So "Modules" moves inside Home (where the
 * module list already lives) and "Settings" moves into a header control, leaving
 * the five that a student actually opens daily.
 *
 * ICONS ARE TEXT, NOT A GLYPH FONT
 * --------------------------------
 * An icon font is another dependency and another thing to fail to load on a slow
 * connection. These are single characters that render from the system font, which
 * is why they cannot break.
 */
import { Redirect, Tabs } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { useSession } from "../../src/lib/session";
import { colors, type as typography } from "../../src/theme";

/** Tab bar height. Above 49 the iOS safe area double-pads on some devices. */
const TAB_HEIGHT = 58;

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text
      style={[styles.icon, focused && styles.iconFocused]}
      // The parent Tabs.Screen supplies the accessible label, so this glyph is
      // decoration and must not be announced twice.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const { status } = useSession();

  // The guard for this half of the app.
  //
  // WHY A REDIRECT HERE AND NOT A CONDITIONAL GROUP IN THE ROOT
  // ----------------------------------------------------------
  // Wrapping this whole Tabs navigator in a conditional Stack.Protected group in
  // the root layout let the app sign in but broke the tab bar: tapping a tab
  // changed the URL and left Home mounted, because a Tabs navigator inside a
  // conditionally mounted group keeps whichever screen it first resolved.
  //
  // Redirecting from inside the group keeps the navigator permanently mounted,
  // so normal tab navigation works, and the access decision still happens.
  if (status !== "signed-in") return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.fgSubtle,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarAccessibilityLabel: "Home",
          tabBarIcon: ({ focused }) => <TabIcon glyph="◉" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: "Planner",
          tabBarAccessibilityLabel: "Planner",
          tabBarIcon: ({ focused }) => <TabIcon glyph="▤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="summaries"
        options={{
          title: "Summaries",
          tabBarAccessibilityLabel: "AI Summaries",
          tabBarIcon: ({ focused }) => <TabIcon glyph="✦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="materials"
        options={{
          title: "Materials",
          tabBarAccessibilityLabel: "Find Materials",
          tabBarIcon: ({ focused }) => <TabIcon glyph="⌕" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarAccessibilityLabel: "Settings",
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚙" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: TAB_HEIGHT,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  item: { paddingTop: 6 },
  label: { ...typography.label, marginBottom: 6 },
  icon: { fontSize: 20, color: colors.fgSubtle, lineHeight: 24 },
  iconFocused: { color: colors.accent },
});
