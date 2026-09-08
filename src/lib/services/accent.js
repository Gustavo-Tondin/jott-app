// The eight colours, and how a stored choice becomes CSS.
// Stored is the NAME (`"orange"`), never a hex: a name resolves to
// `var(--app-orange)`, which each region answers from its own end of the ramp
// (`neutral` is white on the sidebar, black on the canvas). A raw `#rrggbb`
// written by hand passes through untouched, and cannot follow the ground.

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
/// picker. Step 500 (pinned to 4.5:1, so white clears AA on all eight; see
/// `architecture.test.js`), not `accentFill`'s 300, which cannot carry text.
/// Does not follow the ground; the ink over it is `--app-on-solid`.
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
  const c = accentColor(value);
  if (!c) return undefined;
  // `tint: null` — the caller's element has no reader for a tint variable,
  // so writing one would be a value with no audience.
  return tint ? `${color}: ${c}; ${tint}: ${accentTint(value)}` : `${color}: ${c}`;
}
