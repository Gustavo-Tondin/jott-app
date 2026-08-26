// The eight colours, and how a stored choice becomes CSS.
//
// A space, a group, a tag and the app itself all pick from the SAME eight
// (user call, 2026-08-13; `neutral` added 2026-08-17). What is stored is the
// NAME — `"orange"` — never a hex, and that is the whole point: each colour
// runs a seven-step tonal ramp, and which end of it a colour shows depends on
// the ground it lands on. The black sidebar reads from the light end, the
// white canvas from the dark end (styles/tokens.css, styles/themes/*.css). A
// hex cannot do that; a name resolves to `var(--app-orange)`, which every
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

/// The eight, in the order the rainbow goes around FROM BLUE — the app's
/// own — with `neutral` closing the circle (user call, 2026-08-26; it was the
/// Figma swatch order before). This array IS the order every swatch row
/// draws, and the order the sidebar's rainbow deals (services/spaceColors.js),
/// so the picker and the column agree.
export const ACCENTS = [
  "blue",
  "purple",
  "pink",
  "red",
  "orange",
  "yellow",
  "green",
  "neutral",
];

/// The seven hues — the eight without `neutral`.
export const HUES = ACCENTS.filter((name) => name !== "neutral");

/// What the app ships as, and what an unknown or missing name falls back to.
export const DEFAULT_ACCENT = "blue";

/// True for one of the eight.
export function isAccent(value) {
  return typeof value === "string" && ACCENTS.includes(value);
}

/// The CSS value for a stored colour choice: a ground-aware `var()` for one of
/// the eight, the value itself for a raw colour, and `null` for "no colour of
/// its own" — callers fall back to the theme accent, usually by leaving the
/// custom property unset so its `var(…, fallback)` applies.
export function accentColor(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value})`;
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
  if (isAccent(value)) return `var(--app-${value}-${rung})`;
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
  if (isAccent(value)) return `var(--app-${value}-fill)`;
  return value;
}

/// The SOLID fill of a coloured surface that carries text — the card each
/// notebook gets on the picker (2026-08-24).
///
/// Its sibling `accentFill` above is the fill of a surface with nothing on it
/// (a note's banner), and it sits at the palette's vivid step 300. A card with
/// a title and a line of counts written across it cannot: 300 is the step that
/// reads AS text on a dark ground, not the step that carries text.
///
/// So this one is step 500 — the step the palette pins to 4.5:1 against a
/// light ground, which is the same promise read the other way round: white on
/// it clears AA for all eight colours, and a test measures it
/// (`architecture.test.js`). Like the banner's fill and for the same reason,
/// it does not follow the ground it lands on: a notebook's colour is what the
/// user recognizes it by across the room, and it must be the same colour on
/// every theme. The ink that goes over it is `--app-on-solid`.
export function accentSolid(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value}-solid)`;
  return value;
}

/// The matching tint — the quiet fill behind something wearing this colour (a
/// selected sidebar row, a highlighted card). For one of the eight it is the
/// ground's own tint step; for a raw colour there is nothing to look up, so it
/// is mixed down from the colour itself, which is what the app did everywhere
/// before the palette existed.
export function accentTint(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value}-tint)`;
  return `color-mix(in srgb, ${value} 18%, transparent)`;
}

/// The matching LINE — the quiet outline of something wearing this colour
/// (the badge's border). The ground's own `-line` for one of the eight; a raw
/// colour is mixed down, like its tint.
export function accentLine(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value}-line)`;
  return `color-mix(in srgb, ${value} 45%, transparent)`;
}

/// The inline `style` of a `.theme-badge` wearing a colour — the ORIGIN
/// badge, the one that says which space an item came from (2026-08-26).
/// Text on rung 2 (the ladder's second step clears 4.5:1 on both grounds,
/// which is what 10px text needs), outline on the colour's line. `undefined`
/// when there is no colour, so the class's neutral defaults answer — which
/// is exactly what a `#tag` badge is.
export function badgeStyle(value) {
  const c = accentRung(value, 2);
  return c ? `--badge-color: ${c}; --badge-line: ${accentLine(value)}` : undefined;
}

/// The inline `style` of a `.theme-dot`: the place's colour, or `undefined`
/// so the class's own fallback (the app's accent) answers — `undefined` is
/// what makes Svelte leave the attribute off, where an empty string would
/// write `style=""`. Four components computed this line by hand before it
/// lived here.
export function dotStyle(value) {
  return swatchStyle(value, "base");
}

/// The inline `style` of a swatch that PREVIEWS a choice — the picker's
/// buttons. `preview` names the step the choice will paint with, so the
/// swatch is the colour the person gets and not a cousin of it: `"base"` for
/// a dot or a badge (the region's own step), `"fill"` for a banner (step
/// 300), `"solid"` for a card with text on it (step 500). Until 2026-08-26
/// the banner's picker drew the base and painted the fill — a dark yellow
/// chosen, a light yellow received.
export function swatchStyle(value, preview = "base") {
  const c =
    preview === "fill" ? accentFill(value) : preview === "solid" ? accentSolid(value) : accentColor(value);
  return c ? `--dot: ${c}` : undefined;
}

/// The two together, as the inline `style` a component sets on the element
/// that owns the colour. `undefined` when there is no choice (the attribute
/// is left off and the element keeps the theme's accent) — two call sites
/// used to append `|| undefined` and a third passed the empty string on.
export function accentStyle(value, { color = "--accent-color", tint = "--accent-tint-color" } = {}) {
  const c = accentColor(value);
  if (!c) return undefined;
  // `tint: null` — the caller's element has no reader for a tint variable,
  // so writing one would be a value with no audience.
  return tint ? `${color}: ${c}; ${tint}: ${accentTint(value)}` : `${color}: ${c}`;
}
