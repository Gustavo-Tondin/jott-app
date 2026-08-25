import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { seedFrom } from "./themeSeed.js";

// From disk, not `?raw`: vitest stubs CSS imports to an empty string, and the
// point of the last test is the REAL file (the architecture tests read the
// stylesheets the same way, for the same reason).
const defaultTheme = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../styles/themes/default.css"),
  "utf8",
);

describe("seedFrom", () => {
  test("drops the key in front of a region", () => {
    expect(seedFrom('[data-theme="dark"] [data-region="chrome"] { --a: 1; }')).toBe(
      '[data-region="chrome"] { --a: 1; }',
    );
  });

  test("a key standing alone becomes the root", () => {
    expect(seedFrom('[data-theme="dark"] { --a: 1; }')).toBe(":root { --a: 1; }");
  });

  test("the default theme's doubled selector collapses", () => {
    // default.css answers to its name AND to no-attribute-at-all, so that it
    // dresses the app before the setting has been read. A copy needs neither.
    expect(seedFrom('[data-theme="default"],\n:root:not([data-theme]) {\n  --a: 1;\n}')).toBe(
      ":root {\n  --a: 1;\n}",
    );
    // The descendant pair collapses the same way — one selector, said once.
    expect(
      seedFrom(
        '[data-theme="default"] [data-region="chrome"],\n' +
          ':root:not([data-theme]) [data-region="chrome"] {\n  --a: 1;\n}',
      ),
    ).toBe('[data-region="chrome"] {\n  --a: 1;\n}');
  });

  test("a stylesheet with no key at all is left exactly as it was", () => {
    // Which is what "duplicate the theme I am wearing" runs into: a notebook
    // theme carries no key.
    const css = '[data-region="canvas"] { --theme-bg: #fdf6e3; }';
    expect(seedFrom(css)).toBe(css);
  });

  test("the real factory theme comes out with no key left in it", () => {
    // The one that matters: this is the file the button actually copies.
    const seeded = seedFrom(defaultTheme);

    expect(seeded).not.toMatch(/\[data-theme=/);
    expect(seeded).not.toMatch(/:root:not\(\[data-theme\]\)/);
    // And it still assigns both regions, which is the whole point of copying
    // this file rather than writing an empty one.
    expect(seeded).toContain('[data-region="chrome"]');
    expect(seeded).toContain('[data-region="canvas"]');
    expect(seeded).toContain("--theme-bg");
  });
});
