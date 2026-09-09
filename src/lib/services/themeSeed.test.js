import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { seedFrom, themeTokens } from "./themeSeed.js";

// From disk, not `?raw`: vitest stubs CSS imports to an empty string, and the
// point of the last test is the REAL file (the architecture tests read the
// stylesheets the same way, for the same reason).
const factory = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../styles/themes/jott.css"),
  "utf8",
);

describe("seedFrom", () => {
  test("the factory alone comes out as its own tokens, in one root rule", () => {
    const seeded = seedFrom({ factory: ":root {\n  --theme-color-blue-500: #111;\n  --theme-radius-md: 0.5rem;\n}" });
    expect(seeded).toBe(
      "/* A Jott theme: the palette, the spacing and the radius the app draws\n" +
        "   with. Colours run seven steps (100 pale → 700 deep); the modes decide\n" +
        "   which step goes where. Edit and save — the app repaints. */\n" +
        ":root {\n  --theme-color-blue-500: #111;\n  --theme-radius-md: 0.5rem;\n}\n",
    );
  });

  test("the worn theme's tokens win, and only its tokens come along", () => {
    // Duplicating a full stylesheet — one that also restyles regions — yields
    // a PALETTE: what it said about `--theme-*`, over the factory, and none
    // of its `--app-*` or selectors.
    const worn =
      '[data-region="canvas"] { --app-bg: #fdf6e3; --theme-color-blue-500: #222; }\n' +
      "/* --theme-color-blue-500: #999; a comment does not count */";
    const seeded = seedFrom({ factory: ":root { --theme-color-blue-500: #111; --theme-color-red-500: #a00; }", worn });
    expect(seeded).toContain("--theme-color-blue-500: #222;");
    expect(seeded).toContain("--theme-color-red-500: #a00;");
    expect(seeded).not.toContain("--app-bg");
    expect(seeded).not.toContain("data-region");
    expect(themeTokens(null).size).toBe(0);
  });

  test("the real factory theme seeds every token it declares, and nothing else", () => {
    // The one that matters: this is the file the button actually copies.
    const seeded = seedFrom({ factory });
    const tokens = themeTokens(seeded);
    expect(tokens.size).toBe(themeTokens(factory).size);
    // grounds + the eight × the grid + status × the four it is read at + space + radius
    expect(tokens.size).toBe(5 + 8 * 7 + 3 * 4 + 12 + 6);
    expect(seeded).toMatch(/^\/\*[\s\S]*\*\/\n:root \{\n/);
    expect(seeded).not.toMatch(/data-(theme|mode|region)/);
    expect(seeded).toContain("--theme-color-blue-500:");
    expect(seeded).toContain("--theme-space-8:");
  });
});
