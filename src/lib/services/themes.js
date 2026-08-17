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

/// True for one this build can actually draw.
export function isTheme(value) {
  return THEMES.some((theme) => theme.key === value);
}

/// The theme to put on <html>. An empty setting means "the one the app ships
/// as"; a name from a newer build is NOT forced back to the default here —
/// the notebook keeps it (the core never validates a look), and the CSS simply
/// matches nothing, which lands on the `:root:not([data-theme])` fallback that
/// default.css also answers to.
export function themeAttribute(stored) {
  return stored || DEFAULT_THEME;
}
