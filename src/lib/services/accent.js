// The eight colours, and how a stored choice becomes CSS.
// Stored is the NAME (`"orange"`), never a hex. A name resolves to
// `var(--app-orange)` — ONE colour, the same on the dark chrome and the light
// canvas, because a mark is not read and has no contrast to protect. What IS
// read takes `accentInk`, which still answers from the region's end of the
// ramp. A raw `#rrggbb` written by hand passes through untouched.

/// The eight, in rainbow order from blue (the app's own), `neutral` closing
/// the circle. This array IS the order every swatch row draws and the order
/// the sidebar's rainbow deals (services/spaceColors.js).
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

/// The CSS value for a stored colour choice — the colour as a MARK: a dot, a
/// pill, a bar, any surface with nothing written on it. One value for both
/// grounds (the palette's vivid step 300), the value itself for a raw colour,
/// and `null` for "no colour of its own" — callers fall back to the theme
/// accent, usually by leaving the custom property unset so its
/// `var(…, fallback)` applies.
export function accentColor(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value})`;
  return value;
}

/// The colour when it is READ — a letter, a hairline, a focus ring, a caret.
/// This one still follows the ground (300 on a dark region, 500 on a light
/// one), because `accentColor` no longer does: the vivid step is 2.2:1 against
/// the white canvas, under the 3:1 a stroke needs and the 4.5:1 a word needs.
/// A raw colour has no ink of its own and answers itself.
export function accentInk(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value}-ink)`;
  return value;
}

/// A rung of the colour's SIX-STEP emphasis ladder, 1 (strongest) to 6
/// (faintest) — the ladder H1–H6 stand on (styles/roles.css). A raw colour has
/// no ladder: rung 1 is the colour itself, the rest fade toward the ground.
export function accentRung(value, rung) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value}-${rung})`;
  const fade = [100, 90, 80, 68, 58, 48][rung - 1] ?? 100;
  return fade === 100 ? value : `color-mix(in srgb, ${value} ${fade}%, transparent)`;
}

/// The FILL of a coloured surface — a note's banner. The one colour that does
/// not change with the ground: nothing is written on a banner, so there is no
/// contrast to protect (styles/roles.css).
export function accentFill(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value}-fill)`;
  return value;
}

/// The SOLID fill of a surface that carries text — the notebook card on the
/// picker. The same vivid step every other fill wears; what makes it carry
/// text is the ink over it, `--app-on-solid`, which is the dark ground and
/// clears 7:1 on all eight (see `architecture.test.js`). Ground-blind.
export function accentSolid(value) {
  if (!value) return null;
  if (isAccent(value)) return `var(--app-${value}-solid)`;
  return value;
}

/// The matching tint — the quiet fill behind something wearing this colour.
/// The ground's own tint step for one of the eight; a raw colour is mixed down.
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

/// The inline `style` of a `.theme-badge` wearing a colour — the ORIGIN badge.
/// Text on rung 2 (clears 4.5:1 on both grounds, which 10px text needs),
/// outline on the colour's line. `undefined` with no colour, so the class's
/// neutral defaults answer — which is what a `#tag` badge is.
export function badgeStyle(value) {
  const c = accentRung(value, 2);
  return c ? `--badge-color: ${c}; --badge-line: ${accentLine(value)}` : undefined;
}

/// The inline `style` of a `.theme-dot`: the place's colour, or `undefined`
/// so the class's fallback answers — `undefined` makes Svelte leave the
/// attribute off, where an empty string would write `style=""`.
export function dotStyle(value) {
  return swatchStyle(value, "base");
}

/// The inline `style` of a swatch that PREVIEWS a choice — the picker's
/// buttons. `preview` names the step the choice will paint with, so the swatch
/// is the colour the person gets: `"base"` for a dot or a badge, `"fill"` for
/// a banner (step 300), `"solid"` for a card with text on it (step 500).
export function swatchStyle(value, preview = "base") {
  const c =
    preview === "fill" ? accentFill(value) : preview === "solid" ? accentSolid(value) : accentColor(value);
  return c ? `--dot: ${c}` : undefined;
}

/// The two together, as the inline `style` set on the element that owns the
/// colour. `undefined` when there is no choice (attribute left off, theme
/// accent kept).
export function accentStyle(value, { color = "--accent-color", tint = "--accent-tint-color" } = {}) {
  // The ink, not the mark: every reader of `--accent-color` draws a word or a
  // hairline (the note group's title and rule, the sidebar section's bar).
  const c = accentInk(value);
  if (!c) return undefined;
  // `tint: null` — the caller's element has no reader for a tint variable,
  // so writing one would be a value with no audience.
  return tint ? `${color}: ${c}; ${tint}: ${accentTint(value)}` : `${color}: ${c}`;
}
