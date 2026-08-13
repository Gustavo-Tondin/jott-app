// The seven complementary colours, and how a stored choice becomes CSS.
//
// A workspace, a group, a tag and the app itself all pick from the SAME seven
// (user call, 2026-08-13). What is stored is the NAME — `"orange"` — never a
// hex, and that is the whole point: each of the seven has four steps, and
// which two a colour shows depends on the ground it lands on. The black
// sidebar gets the light half, the white canvas gets the dark half
// (styles/tokens.css, styles/themes/*.css). A hex cannot do that; a name
// resolves to `var(--accent-orange)`, which every region has already answered
// for itself.
//
// Tolerance, not migration: a notebook written before this (or by hand) may
// hold a raw `#rrggbb`. It is passed through untouched — a colour the user
// chose is theirs, even if the app would no longer offer it. It simply does
// not follow the ground, because it cannot.

/// The seven, in palette order. This array IS the order every swatch row
/// draws, so the palette reads the same in the workspace popup, the tag
/// manager and the settings screen.
export const ACCENTS = ["yellow", "orange", "pink", "green", "blue", "red", "purple"];

/// What the app ships as, and what an unknown or missing name falls back to.
export const DEFAULT_ACCENT = "blue";

/// True for one of the seven.
export function isAccent(value) {
  return typeof value === "string" && ACCENTS.includes(value);
}

/// The CSS value for a stored colour choice: a ground-aware `var()` for one of
/// the seven, the value itself for a raw colour, and `null` for "no colour of
/// its own" — callers fall back to the theme accent, usually by leaving the
/// custom property unset so its `var(…, fallback)` applies.
export function accentColor(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--accent-${value})`;
  return value;
}

/// The matching tint — the quiet fill behind something wearing this colour (a
/// selected sidebar row, a highlighted card). For one of the seven it is the
/// ground's own tint step; for a raw colour there is nothing to look up, so it
/// is mixed down from the colour itself, which is what the app did everywhere
/// before the palette existed.
export function accentTint(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--accent-${value}-tint)`;
  return `color-mix(in srgb, ${value} 18%, transparent)`;
}

/// Tag name → the CSS value its pill should be painted with, ready for
/// `--tag-color`. The three screens that draw task cards each built this map
/// by hand from the catalogue, and each of them handed the raw stored value
/// straight to CSS — which is exactly where a name had to become a `var()`.
/// Tags with no colour are left out, so the pill falls back to the theme.
export function tagColors(tags = []) {
  const map = {};
  for (const tag of tags ?? []) {
    const value = accentColor(tag?.color);
    if (value) map[tag.name] = value;
  }
  return map;
}

/// The two together, as the inline `style` a component sets on the element
/// that owns the colour. Empty string when there is no choice, so the element
/// keeps the theme's accent.
export function accentStyle(value, { color = "--accent-color", tint = "--accent-tint-color" } = {}) {
  const c = accentColor(value);
  if (!c) return "";
  return `${color}: ${c}; ${tint}: ${accentTint(value)}`;
}
