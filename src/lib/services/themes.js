// The themes the app ships, and which one is on.
//
// A theme is a CSS file that assigns the colour roles for the app's two
// regions (styles/themes/default.css says how to write one). All of them are
// loaded at once and each scopes its selectors to its own name, so switching
// is a single attribute on <html> — no dynamic import, no flash, and the same
// mechanism a user theme dropped in `.jott/themes/<name>.css` will use post-v1.
//
// This list is the ONLY place the app knows a theme's name. Adding one is:
// write the CSS file, import it in app.css, add a line here.

import { S } from "./strings.js";

/// In the order the settings screen offers them.
export const THEMES = [
  {
    key: "default",
    label: () => S.themeDefault,
    hint: () => S.themeDefaultHint,
  },
  { key: "light", label: () => S.themeLight, hint: () => S.themeLightHint },
  { key: "dark", label: () => S.themeDark, hint: () => S.themeDarkHint },
];

/// What the app ships as, and what an unknown or missing name falls back to.
export const DEFAULT_THEME = "default";

/// Whether H1–H6 (and the titles that share their scale) take the accent or
/// plain ink — the second runtime choice about colour, next to the theme and
/// the accent itself (2026-08-17). It lives here rather than in accent.js
/// because it is a look setting like the theme, not a colour: what it moves is
/// which ramp `--theme-heading-*` reads, resolved in styles/roles.css.
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

/// The theme to put on <html>. An empty setting means "the one the app ships
/// as"; a name from a newer build is NOT forced back to the default here —
/// the notebook keeps it (the core never validates a look), and the CSS simply
/// matches nothing, which lands on the `:root:not([data-theme])` fallback that
/// default.css also answers to.
export function themeAttribute(stored) {
  return stored || DEFAULT_THEME;
}
