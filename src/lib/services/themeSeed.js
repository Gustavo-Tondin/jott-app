// The starting point of a new theme ("New theme from this one"): the factory
// file's `--theme-*` tokens with the worn theme's overrides on top, as one
// `:root` rule. Only `--theme-*` come along — the copy is a palette, never
// regions or modes (styles/themes/jott.css is the contract). Pure text, no DOM:
// `getComputedStyle` would answer with `--app-*` resolved and the literals lost.

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
