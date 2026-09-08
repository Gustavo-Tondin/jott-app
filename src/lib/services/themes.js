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

/// How tall a note card on the board may grow. What actually gives a card
/// its height is the number of PREVIEW lines it draws (`--app-card-lines`,
/// styles/tokens.css), so the cut always lands between lines. A Display
/// choice: the same board is a wall of cards on a monitor and a column on a
/// phone.
export const CARD_HEIGHTS = [
  { key: "short", label: () => S.cardHeightShort },
  { key: "medium", label: () => S.cardHeightMedium },
  { key: "tall", label: () => S.cardHeightTall },
];

export const DEFAULT_CARD_HEIGHT = "tall";

/// The attribute value to write, or null for the height the app ships as —
/// the same pact `noteFontSizeAttribute` keeps.
export function cardHeightAttribute(stored) {
  const known = CARD_HEIGHTS.some((height) => height.key === stored);
  return known && stored !== DEFAULT_CARD_HEIGHT ? stored : null;
}

/// The theme (the palette) to name on <html>, or null for the app's own. A
/// name the NOTEBOOK carries (`.jott/themes/`) is named only once its
/// stylesheet is in the document (`worn`), or a full theme keyed on its name
/// would match nothing. An unknown or deleted theme reads as the app's own;
/// the notebook KEEPS the name (a display decision, never written back).
export function paletteAttribute(stored, worn = null) {
  return stored && stored === worn ? stored : null;
}
