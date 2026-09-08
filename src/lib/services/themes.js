// The MODES the app ships, which one is on, and the theme's name. A MODE is
// a CSS file assigning the colour roles for the two regions from the theme's
// tokens (jott, light, dark — all loaded, each scoped to its name, so a
// switch is one attribute on <html>). A THEME is the palette, the app's own
// or one in `.jott/themes/`. This list is the ONLY place a mode's name is known.

import { S } from "./strings.js";

/// In the order the settings screen offers them.
export const MODES = [
  { key: "jott", label: () => S.modeJott, hint: () => S.modeJottHint },
  { key: "light", label: () => S.modeLight, hint: () => S.modeLightHint },
  { key: "dark", label: () => S.modeDark, hint: () => S.modeDarkHint },
];

/// What the app ships as, and what an unknown or missing name falls back to.
export const DEFAULT_MODE = "jott";

/// Whether a name is one of the app's three modes.
export function isMode(name) {
  return MODES.some((mode) => mode.key === name);
}

/// The mode to put on <html>, or null for the one the app ships as — absent
/// is the stylesheet's own default (`modes/jott.css` answers
/// `:root:not([data-mode])`). An unknown name reads as the default too, or
/// the attribute would match no stylesheet and leave the app with no colour roles.
export function modeAttribute(stored) {
  return isMode(stored) && stored !== DEFAULT_MODE ? stored : null;
}

/// Whether H1–H6 (and the titles sharing their scale) take the accent or
/// plain ink. A look setting like the theme, not a colour: it moves which
/// ramp `--app-heading-*` reads (styles/roles.css). Only `ink` is ever
/// written; the accent is the default, so the attribute is absent.
export const HEADING_COLORS = [
  {
    key: "accent",
    label: () => S.headingColorAccent,
    hint: () => S.headingColorAccentHint,
  },
  { key: "ink", label: () => S.headingColorInk, hint: () => S.headingColorInkHint },
];

export const DEFAULT_HEADING_COLOR = "accent";

/// How big a note's body is drawn. A NOTE setting, travelling with the
/// notebook (reading taste); the interface's zoom is a machine preference.
/// Cheap because the editor is built in `em`: one size on the editor root
/// moves the whole document in proportion.
export const NOTE_FONT_SIZES = [
  { key: "small", label: () => S.noteSizeSmall },
  { key: "medium", label: () => S.noteSizeMedium },
  { key: "large", label: () => S.noteSizeLarge },
];

export const DEFAULT_NOTE_FONT_SIZE = "medium";

/// The attribute value to write, or null for the size the app ships as —
/// the same pact `themeAttribute` keeps: the default is what the stylesheet
/// answers with no attribute at all.
export function noteFontSizeAttribute(stored) {
  const known = NOTE_FONT_SIZES.some((size) => size.key === stored);
  return known && stored !== DEFAULT_NOTE_FONT_SIZE ? stored : null;
}

/// How tall a note card on the board may grow, as the number of PREVIEW
/// LINES it draws (`--app-card-lines`, styles/tokens.css) — so the cut always
/// lands between lines. The RANGE is the interface's: the core keeps the
/// number and judges nothing. A Display choice, like the note's size.
export const CARD_LINES = { min: 3, max: 16, default: 12 };

/// The line count to draw with: the stored one when it is a number the
/// slider can reach, the app's own otherwise — a value from a newer build
/// (or a hand-edited file) reads as the default instead of a broken card.
export function cardLines(stored) {
  const lines = Math.round(Number(stored));
  if (!Number.isFinite(lines)) return CARD_LINES.default;
  return Math.min(CARD_LINES.max, Math.max(CARD_LINES.min, lines));
}

/// What to write on the root, or null for the app's own — the same pact
/// `noteFontSizeAttribute` keeps: the default is spelled by writing nothing.
export function cardLinesVar(stored) {
  const lines = cardLines(stored);
  return lines === CARD_LINES.default ? null : String(lines);
}

/// The theme (the palette) to name on <html>, or null for the app's own. A
/// name the NOTEBOOK carries (`.jott/themes/`) is named only once its
/// stylesheet is in the document (`worn`), or a full theme keyed on its name
/// would match nothing. An unknown or deleted theme reads as the app's own;
/// the notebook KEEPS the name (a display decision, never written back).
export function paletteAttribute(stored, worn = null) {
  return stored && stored === worn ? stored : null;
}
