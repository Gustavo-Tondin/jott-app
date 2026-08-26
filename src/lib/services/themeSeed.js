// The starting point of a new theme: the PALETTE in use, as a file.
//
// "New theme from this one" (Settings › Display, 2026-08-25) writes a theme
// the reader will edit. Since 2026-08-26 a theme is `:root { --theme-… }` —
// the colours, the spacing, the radius — and nothing about regions or modes,
// which is what lets one palette wear the jott, light and dark modes alike
// (styles/themes/jott.css says the whole contract). So the seed is the
// factory file's tokens, with whatever the theme being worn overrides on
// top: duplicate the app's own and you get the app's own; duplicate a theme
// and you get its values, even out of a full stylesheet that also restyles
// regions (only its `--theme-*` come along — the copy is a palette).
//
// Pure text, no DOM: `getComputedStyle` would answer with the mode's `--app-*`
// resolved and the theme's literals lost, and a test could not run it.

/// A `--theme-*` declaration, wherever it sits in a stylesheet.
const TOKEN = /(--theme-[a-z0-9-]+)\s*:\s*([^;{}]+);/g;

/// Every `--theme-*` token in `css`, last one wins.
export function themeTokens(css) {
  const tokens = new Map();
  for (const m of (css ?? "").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(TOKEN)) {
    tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

/// The stylesheet of a new theme: the factory tokens, overridden by the worn
/// theme's, as one `:root` rule — the shape the app writes into a notebook.
export function seedFrom({ factory, worn = null }) {
  const tokens = themeTokens(factory);
  for (const [name, value] of themeTokens(worn)) tokens.set(name, value);
  const lines = [...tokens].map(([name, value]) => `  ${name}: ${value};`);
  return [
    "/* A Jott theme: the palette, the spacing and the radius the app draws",
    "   with. Colours run seven steps (100 pale → 700 deep); the modes decide",
    "   which step goes where. Edit and save — the app repaints. */",
    ":root {",
    ...lines,
    "}",
    "",
  ].join("\n");
}
