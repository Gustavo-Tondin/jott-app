// The eight colours, and how a stored choice becomes CSS.
//
// A space, a group, a tag and the app itself all pick from the SAME eight
// (user call, 2026-08-13; `neutral` added 2026-08-17). What is stored is the
// NAME — `"orange"` — never a hex, and that is the whole point: each colour
// runs a seven-step tonal ramp, and which end of it a colour shows depends on
// the ground it lands on. The black sidebar reads from the light end, the
// white canvas from the dark end (styles/tokens.css, styles/themes/*.css). A
// hex cannot do that; a name resolves to `var(--accent-orange)`, which every
// region has already answered for itself.
//
// `neutral` is the white↔black family, and it is one colour rather than two
// for the same reason: white over black and black over white are the two ends
// of one ramp, exactly like light blue and dark blue. Picking it on the
// sidebar gives white; the same space's title on the canvas gives black.
//
// Tolerance, not migration: a notebook written before this (or by hand) may
// hold a raw `#rrggbb`. It is passed through untouched — a colour the user
// chose is theirs, even if the app would no longer offer it. It simply does
// not follow the ground, because it cannot.

/// The eight, in palette order. This array IS the order every swatch row
/// draws, so the palette reads the same in the space popup, the tag
/// manager and the settings screen.
export const ACCENTS = [
  "yellow",
  "orange",
  "pink",
  "green",
  "blue",
  "red",
  "purple",
  "neutral",
];

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

/// A rung of the colour's SIX-STEP emphasis ladder, 1 (strongest) to 6
/// (faintest) — the same ladder H1–H6 stand on (styles/roles.css). Which
/// tones a rung resolves to is the region's call, as always.
///
/// A raw colour has no ladder to climb: rung 1 is the colour itself, and the
/// rest fade toward the ground, which is the closest a lone hex can get.
export function accentRung(value, rung) {
  if (!value) return null;
  if (isAccent(value)) return `var(--accent-${value}-${rung})`;
  const fade = [100, 90, 80, 68, 58, 48][rung - 1] ?? 100;
  return fade === 100 ? value : `color-mix(in srgb, ${value} ${fade}%, transparent)`;
}

/// The FILL of a coloured surface — a note's banner (2026-08-18).
///
/// The one colour of the app that does not change with the ground it lands on:
/// nothing is written on a banner, so there is no contrast to protect, and a
/// yellow note is yellow in all three themes (styles/roles.css). A raw colour
/// written by hand is itself, as everywhere else.
export function accentFill(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--accent-${value}-fill)`;
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

/// The inline `style` of a `.theme-dot`: the place's colour, or empty so the
/// class's own fallback (the app's accent) answers. Four components computed
/// this line by hand before it lived here.
export function dotStyle(value) {
  const c = accentColor(value);
  return c ? `--dot: ${c}` : "";
}

/// The two together, as the inline `style` a component sets on the element
/// that owns the colour. Empty string when there is no choice, so the element
/// keeps the theme's accent.
export function accentStyle(value, { color = "--accent-color", tint = "--accent-tint-color" } = {}) {
  const c = accentColor(value);
  if (!c) return "";
  // `tint: null` — the caller's element has no reader for a tint variable,
  // so writing one would be a value with no audience.
  return tint ? `${color}: ${c}; ${tint}: ${accentTint(value)}` : `${color}: ${c}`;
}
