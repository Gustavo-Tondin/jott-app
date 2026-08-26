// The MODES the app ships, and which one is on — and the theme's name.
//
// Two questions since 2026-08-26, not one. A MODE is a CSS file that assigns
// the app's colour roles for the two regions, reading the theme's tokens
// (styles/modes/jott.css says how to write one): jott (black frame, white
// page), light, dark. All three are loaded at once and each scopes its
// selectors to its own name, so switching is a single attribute on <html>.
// A THEME is the palette — `--theme-color-*`, and the radius and spacing
// scales — the app's own (styles/themes/jott.css) or one the notebook carries
// in `.jott/themes/<name>.css`; a theme wears any mode.
//
// This list is the ONLY place the app knows a mode's name. Adding one is:
// write the CSS file, import it in app.css, add a line here.

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

/// The mode to put on <html>, or null for the one the app ships as — the
/// pact every root attribute keeps: absent is the stylesheet's own default
/// (`modes/jott.css` also answers to `:root:not([data-mode])`). A name that is
/// not a mode reads as the default too, rather than as an attribute matching
/// no stylesheet at all, which would leave the app with no colour roles.
export function modeAttribute(stored) {
  return isMode(stored) && stored !== DEFAULT_MODE ? stored : null;
}

/// Whether H1–H6 (and the titles that share their scale) take the accent or
/// plain ink — the second runtime choice about colour, next to the theme and
/// the accent itself (2026-08-17). It lives here rather than in accent.js
/// because it is a look setting like the theme, not a colour: what it moves is
/// which ramp `--app-heading-*` reads, resolved in styles/roles.css.
///
/// Only `ink` is ever written to the document; the accent is the app's own, so
/// the attribute is absent and the default rule answers.
export const HEADING_COLORS = [
  {
    key: "accent",
    label: () => S.headingColorAccent,
    hint: () => S.headingColorAccentHint,
  },
  { key: "ink", label: () => S.headingColorInk, hint: () => S.headingColorInkHint },
];

export const DEFAULT_HEADING_COLOR = "accent";

/// How big a note's body is drawn (2026-08-18).
///
/// A NOTE setting and not an interface one: it travels with the notebook,
/// because it is reading taste and follows the writer to another screen. The
/// interface's own zoom (Ctrl+= / Ctrl+-) is the other question and is a
/// machine preference.
///
/// It is cheap because the editor was already built in `em`: the heading
/// sizes in `editor.css` are multiples of the body, so one size on the root of
/// the editor moves the whole document in proportion.
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

/// The theme (the palette) to name on <html>, or null for the app's own.
///
/// An empty setting means "the palette the app ships as" — nothing on the
/// root. A name the NOTEBOOK carries (`.jott/themes/`, 2026-08-25) is named
/// only once its stylesheet is actually in the document, which is what `worn`
/// says: until then the attribute stays off, because a palette-only theme
/// needs no attribute at all (its `:root` tokens are what the modes read),
/// and a full theme keyed on its own name would otherwise match no
/// stylesheet.
///
/// A name from a build that is not this one, or a theme whose file was
/// deleted while it was in use, reads as the app's own the same way. The
/// notebook KEEPS the name either way (the core never validates a look, and
/// a theme removed by a sync should come back when it does), so this is a
/// display decision every time it is read, not a value written back.
export function paletteAttribute(stored, worn = null) {
  return stored && stored === worn ? stored : null;
}
