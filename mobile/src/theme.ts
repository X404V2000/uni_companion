/**
 * src/theme.ts — the design system, ported from the web client.
 *
 * WHY A SHARED THEME AND NOT A UI KIT
 * -----------------------------------
 * The mobile app must look like the product, not like a generic Expo template.
 * The web client already defines this palette in frontend/src/index.css, so the
 * values are copied from there rather than invented. Both clients then read as
 * one product, and a change to the palette is a change to one set of numbers in
 * two places rather than a redesign.
 *
 * CONTRAST VALUES ARE THE CORRECTED ONES
 * --------------------------------------
 * The original palette in the Week 4 Day 1 spec had two failures against WCAG:
 *   --color-fg-subtle   #8A8278 measured 4.16:1 (needs 4.5:1 for body text)
 *   --color-fg-on-accent #1C1814 measured 6.88:1 (needs 7:1 for AAA)
 * Both were corrected in the web client and the corrected values are used here:
 *   #9C9488 (5.26:1) and #171310 (7.20:1).
 * Do not revert these to the spec's originals - the spec was wrong.
 *
 * WHY NOT PURE BLACK AND WHITE
 * ----------------------------
 * #000 background with #FFF text causes halation on OLED panels, which is what
 * most of the target students use. The warm off-black and off-white below avoid
 * it while keeping contrast high.
 */

export const colors = {
  // Surfaces
  bg: "#1C1814",
  surface: "#262220",
  raised: "#2E2A26",
  sunk: "#16130F",

  // Borders
  border: "#3A342E",
  borderStrong: "#4A423A",

  // Text — never pure white, for the halation reason above
  fg: "#EDE8E0",
  fgMuted: "#B8B0A6",
  fgSubtle: "#9C9488", // corrected from #8A8278
  fgOnAccent: "#171310", // corrected from #1C1814

  // Brand
  accent: "#FF7A5C",
  accentHover: "#FF5F3D",
  teal: "#6BC5B8",

  // Status. Named by meaning, not by hue, so a palette change does not require
  // renaming every call site.
  success: "#6BBF85",
  warning: "#E8A852",
  danger: "#E85C6A",

  // Module accents, for giving each module card a consistent identity
  moduleA: "#FF7A5C",
  moduleAPale: "#2E1E1A",
  moduleB: "#6BC5B8",
  moduleBPale: "#1A2826",
  moduleC: "#E8A852",
  moduleCPale: "#2A2418",
} as const;

/**
 * Spacing scale. Multiples of 4, which is the smallest unit that renders
 * consistently across device pixel ratios.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Corner radii. Kept few — more than three and a UI starts to look incoherent. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/**
 * Type scale.
 *
 * Sizes are point values, not pixel strings: React Native's unit is
 * density-independent and already handles scaling. Line heights are absolute
 * rather than multipliers because uneven default leading is the most common
 * cause of a mobile UI looking unpolished.
 */
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "600" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const },
} as const;

/**
 * Pick a module accent deterministically from a module code.
 *
 * WHY DETERMINISTIC: the same module must always get the same colour, or the UI
 * looks like it is shuffling itself between renders. Hashing the code keeps it
 * stable with no stored state.
 */
export function moduleColor(code: string): { fg: string; bg: string } {
  const palette = [
    { fg: colors.moduleA, bg: colors.moduleAPale },
    { fg: colors.moduleB, bg: colors.moduleBPale },
    { fg: colors.moduleC, bg: colors.moduleCPale },
  ];
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) % 997;
  }
  return palette[hash % palette.length];
}
