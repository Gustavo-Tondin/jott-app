// The frontend's structural invariants, guarded the same way core's
// invariants.rs guards the write path: by reading the source itself.
//
// The separation decided on 2026-07-27 (roadmap, Fase 10 "Reorganização
// Estrutura/Estilo/Função") is only worth anything if it cannot silently
// erode: a component is skeleton + wiring, everything visual lives in
// src/styles/, and a theme can reach any hook because nothing hides behind
// Svelte's scoping hash.
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, ext) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p, ext);
    return e.name.endsWith(ext) ? [p] : [];
  });
}

// The trees the tests below walk, read once.
const SVELTE = [join(src, "App.svelte"), ...walk(join(src, "lib"), ".svelte")];
const LIB_JS = walk(join(src, "lib"), ".js");
const SOURCES = [...SVELTE, ...LIB_JS.filter((f) => !f.endsWith(".test.js"))];
const STYLES = walk(join(src, "styles"), ".css");
const SHEETS = [
  ...walk(join(src, "styles", "controls"), ".css"),
  ...walk(join(src, "styles", "components"), ".css"),
];

describe("frontend architecture", () => {
  test("no component carries a <style> block — the visual layer lives in styles/", () => {
    const offenders = SVELTE
      .filter((f) => readFileSync(f, "utf8").includes("<style"))
      .map((f) => basename(f));
    expect(offenders).toEqual([]);
  });

  test("no plain stylesheet uses Svelte's :global()", () => {
    // 2026-08-17, from a user report: the title bar's logo was invisible
    // because titlebar.css sized it through `.titlebar__wordmark
    // :global(svg)`. `:global()` only means something inside a component's
    // own <style> block — which this project has none of. To a browser it is
    // an unknown pseudo-class, and the WHOLE rule is dropped, silently. The
    // logo had no height and nobody had ever seen it.
    // Comments stripped first: the file that caused this test explains the
    // mistake by name, and a rule about selectors must not fire on prose.
    const offenders = [...STYLES, join(src, "app.css")]
      .filter((f) =>
        readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").includes(":global("),
      )
      .map((f) => basename(f));
    expect(offenders).toEqual([]);
  });

  test("every stylesheet on disk is imported by the aggregator", () => {
    // Not just components/: a theme dropped into styles/themes/ passes every
    // colour test in this file (they all read the directory) and ships zero
    // bytes of CSS unless app.css imports it. The whole styles/ tree is the
    // unit — a sheet that exists but is not imported is a silent no-op.
    const app = readFileSync(join(src, "app.css"), "utf8");
    const missing = STYLES
      // The import in app.css is written with forward slashes; the path from
      // disk arrives with backslashes on Windows, where CI runs this too.
      .map((f) => f.slice(f.indexOf("styles")).replaceAll("\\", "/"))
      .filter((rel) => !app.includes(`./${rel}`));
    expect(missing).toEqual([]);
  });

  test("the editor sheets are the only ones with rules outside @layer", () => {
    // Unlayered beats layered no matter the specificity, so a sheet that
    // loses its `@layer` wrapper silently jumps above every layered sheet —
    // a style that "works" for the wrong reason. Two exceptions, by name:
    // components/editor*.css must stay unlayered to tie with CodeMirror's
    // injected <style> (their headers explain), and themes/* are imported
    // unlayered by design so a theme wins without a specificity fight
    // (app.css explains). Everything else keeps every style rule under an
    // @layer ancestor — at-rules like @media may wrap it on the way.
    const exempt = new Set([
      "components/editor.css",
      "components/editor-search.css",
      "components/editor-tables.css",
      // The factory theme is written into notebooks byte for byte, where it
      // is injected plain — so the layer is app.css's `@import … layer()`.
      "themes/jott.css",
      "modes/jott.css",
      "modes/light.css",
      "modes/dark.css",
    ]);
    const offenders = [];
    for (const f of STYLES) {
      // Separators normalised: on Windows `relative` answers with a
      // backslash, and the exemptions above are written with a slash — the
      // editor.css exemption missed, and the CI failed there only.
      const rel = relative(join(src, "styles"), f).split(sep).join("/");
      if (exempt.has(rel)) continue;
      const css = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/url\([^)]*\)/g, "");
      const stack = [];
      for (const [, chunk, brace] of css.matchAll(/([^{}]*)([{}])/g)) {
        if (brace === "}") {
          stack.pop();
          continue;
        }
        const prelude = chunk.split(";").pop().trim();
        if (!prelude.startsWith("@") && !stack.includes("@layer"))
          offenders.push(`${basename(f)}: ${prelude}`);
        stack.push(prelude.startsWith("@layer") ? "@layer" : "rule");
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every length is in rem — px is only for a real device measurement", () => {
    // Decided 2026-08-06: a rigid px interface ignores the reader who raised
    // their font size. A media-query breakpoint is about the screen, not the
    // type, so it stays in px; comments and data: URIs are not lengths.
    const offenders = [];
    const strip = (css) =>
      css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/url\([^)]*\)/g, "")
        .replace(/@media[^{]*\{/g, "");
    for (const f of [...STYLES, join(src, "app.css")]) {
      // `-?` and the leading-dot branch: `-2px` and `.5px` are lengths too,
      // and the old lookbehind quietly skipped both.
      for (const m of strip(readFileSync(f, "utf8")).matchAll(
        /(?<![\w.-])-?(?:\d+(?:\.\d+)?|\.\d+)px\b/g,
      )) {
        offenders.push(`${basename(f)}: ${m[0]}`);
      }
    }
    // An icon's `size` prop becomes a CSS length too (--icon-size).
    for (const f of SVELTE) {
      for (const m of readFileSync(f, "utf8").matchAll(/size="[\d.]+px"/g)) {
        offenders.push(`${basename(f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // The colour system (2026-08-13). Its whole value is that reading one line
  // tells you what a colour IS; these three tests are what keep it that way.
  // ---------------------------------------------------------------------------

  // The three MODES (2026-08-26; they were the three "themes" until the
  // palette became the theme): each assigns the app's roles for the two
  // regions, reading the theme's tokens.
  const themes = () =>
    walk(join(src, "styles", "modes"), ".css").map((f) => [
      basename(f),
      readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
    ]);

  test("no role in a theme reads another role", () => {
    // THE rule (styles/modes/jott.css). `--app-bg: var(--ground)` and
    // `--ground: var(--theme-color-black)` was the old shape: two files to answer
    // "what colour is the sidebar?".
    //
    // What is forbidden is a role reading a ROLE. A literal is fine, and
    // `var(--theme-color-*)` is just a literal with a name — the app's own palette,
    // which the three shipped themes share. A theme with colours of its own
    // writes hexes and reads nothing (user question, 2026-08-13: an earlier
    // version of this test REQUIRED `--theme-color-*`, which quietly forbade the
    // one thing a theme exists to do).
    const offenders = [];
    for (const [name, css] of themes()) {
      for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        for (const ref of m[2].matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
          // `--app-canvas-*` counts as a role too: it is theme-assigned and
          // component-read exactly like `--app-*` (tabs.css reads it), so
          // `--app-bg: var(--app-canvas-ground)` would be the forbidden
          // two-hop chain wearing a different prefix.
          if (ref[1].startsWith("--app-")) {
            offenders.push(`${name}: ${m[1]} reads the role ${ref[1]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every theme assigns the same set of roles", () => {
    // A theme that forgets a role does not fail loudly — it inherits whatever
    // the previous one left on the element, which is a colour from a different
    // design. Comparing the sets is what turns that into a red test.
    // Against the UNION of every theme's keys, not against one of them picked
    // as a reference: with a reference, dropping a key FROM the reference is
    // invisible — the missing key is missing from the yardstick too.
    const declared = themes().map(([name, css]) => [
      name,
      new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1])),
    ]);
    const union = new Set(declared.flatMap(([, set]) => [...set]));
    const gaps = declared.flatMap(([name, set]) =>
      [...union].filter((key) => !set.has(key)).map((key) => `${name}: ${key}`),
    );
    expect(gaps.sort()).toEqual([]);
  });

  test("every theme gives a floating panel the region's two neutrals, swapped", () => {
    // A bottom sheet is a panel raised over the page, and the app has two
    // neutrals per mode: the sheet takes the raised step for its ground, so
    // everything inside it has the other one to stand on. Forget it in one
    // theme and the sheet inherits the region's pair unswapped — cards the
    // same colour as the sheet they sit on, which is what the task inspector
    // looked like on a phone (user report, 2026-08-18).
    //
    // What is checked is that the pair is REVERSED, not which colours: a theme
    // with its own palette is free to choose them.
    const gaps = [];
    for (const [name, css] of themes()) {
      const region = (which) => {
        const m = css.match(
          new RegExp(`\\[data-region="${which}"\\][^{]*\\{([^}]*)\\}`),
        );
        const body = m?.[1] ?? "";
        return {
          bg: body.match(/--app-bg:\s*([^;]+);/)?.[1]?.trim(),
          surface: body.match(/--app-surface:\s*([^;]+);/)?.[1]?.trim(),
        };
      };
      const canvas = region("canvas");
      const rule = css.match(/([^};]*\.sheet[^{]*)\{([^}]*)\}/);
      // The dialog is the same shape by another route and takes the same pair
      // (user call, 2026-08-18): both names, or one of them is a flat wash.
      if (rule && !rule[1].includes(".theme-modal"))
        gaps.push(`${name}: the modal does not share the sheet's ground`);
      const sheetBody = rule?.[2] ?? "";
      const sheet = {
        bg: sheetBody.match(/--app-bg:\s*([^;]+);/)?.[1]?.trim(),
        surface: sheetBody.match(/--app-surface:\s*([^;]+);/)?.[1]?.trim(),
      };
      if (!sheet.bg || !sheet.surface) {
        gaps.push(`${name}: no .sheet ground`);
        continue;
      }
      if (sheet.bg !== canvas.surface || sheet.surface !== canvas.bg)
        gaps.push(`${name}: sheet is not the canvas pair swapped`);
    }
    expect(gaps).toEqual([]);
  });

  test("a component reads --app-*, never --theme-*", () => {
    // THE three layers (2026-08-26): a THEME writes `--theme-*`, a MODE reads
    // them and writes `--app-*`, a COMPONENT reads `--app-*`. A sheet or a
    // script reaching into `--theme-*` would paint from the palette directly
    // — right in the factory theme, wrong the day a notebook's theme moves a
    // token the modes had a say about. Sheets, App.svelte and every module
    // under lib/ except the tests and the seed (whose job is the theme file).
    const files = [
      ...SHEETS,
      join(src, "styles", "base.css"),
      join(src, "styles", "touch.css"),
      ...SOURCES.filter((f) => !f.endsWith("themeSeed.js")),
    ];
    const offenders = [];
    for (const f of files) {
      if (!existsSync(f)) continue;
      const text = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/<!--[\s\S]*?-->/g, "");
      for (const m of text.matchAll(/--theme-[a-z0-9-]+/g)) {
        offenders.push(`${relative(src, f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("a mode writes --app-* only, and the factory theme writes --theme-* only, as literals", () => {
    // The other two edges of the same triangle. A mode (and roles.css, the
    // shared mode) that wrote `--theme-*` would be a theme in disguise; a
    // theme that wrote `--app-*` or read anything with `var()` would be a
    // mode in disguise — and the one file the app writes into notebooks has
    // to be the pure form, because it is the example everyone copies.
    const offenders = [];
    for (const [name, css] of [
      ...themes(),
      ["roles.css", readFileSync(join(src, "styles", "roles.css"), "utf8")],
    ]) {
      for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--theme-[a-z0-9-]+)\s*:/g)) {
        offenders.push(`${name} writes ${m[1]}`);
      }
    }
    const factory = readFileSync(join(src, "styles", "themes", "jott.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    for (const m of factory.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      if (!m[1].startsWith("--theme-")) offenders.push(`themes/jott.css writes ${m[1]}`);
      if (/var\(/.test(m[2])) offenders.push(`themes/jott.css: ${m[1]} reads ${m[2].trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  test("the select's caret is a byte copy of the theme's gray", () => {
    // A `url()` cannot read a custom property, so the arrow of `.theme-select`
    // carries the hex by hand (controls/forms.css). This is what says when the two
    // drift; the themable version is a follow-up.
    const gray = readFileSync(join(src, "styles", "themes", "jott.css"), "utf8").match(
      /--theme-color-gray:\s*#([0-9a-fA-F]{6})/,
    )?.[1];
    const caret = readFileSync(join(src, "styles", "controls", "forms.css"), "utf8").match(
      /stroke='%23([0-9a-fA-F]{6})'/,
    )?.[1];
    expect(gray).toBeTruthy();
    expect(caret?.toLowerCase()).toBe(gray.toLowerCase());
  });

  test("status is read through the status roles, never a colour of the eight by name", () => {
    // The colour grammar (2026-08-26): priority, overdue, a notice's tone
    // are STATUS — fixed, so they keep their meaning when the accent is red
    // or green — and a component sheet reaches them as `--app-danger`,
    // `--app-warning`, `--app-success` (and their `-tint`). Spelling
    // `--app-4` in a sheet is the same value today and a different one
    // the day a theme moves its danger; the notice did exactly that.
    const offenders = [];
    for (const f of SHEETS) {
      const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/var\(\s*(--app-(?:red|yellow|green)[a-z0-9-]*)/g)) {
        offenders.push(`${relative(src, f)}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every role a component reads is assigned by every theme", () => {
    // Catches the other direction: a stylesheet reaching for a `--app-*`
    // that no theme defines renders as nothing at all. Checked against EACH
    // theme, not the union of all of them: a role assigned only in dark.css
    // is a role the other two themes leave unset, and the union would never
    // notice. `--app-canvas-*` is in scope for the same reason as above — it is
    // a theme-assigned role by another name.
    const shared = new Set();
    // roles.css holds the ones that are the same in every theme, plus the
    // accent branch — they count as assigned in all of them.
    for (const m of readFileSync(join(src, "styles", "roles.css"), "utf8").matchAll(
      /(--app-[a-z0-9-]+)\s*:/g,
    )) {
      shared.add(m[1]);
    }
    const perTheme = themes().map(([name, css]) => [
      name,
      new Set([
        ...shared,
        ...[...css.matchAll(/(--app-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
      ]),
    ]);
    // The metrics (spacing, radius, type, layout, motion) are tokens.css's,
    // the same in every mode — so they count as assigned everywhere, and a
    // component reading a `--app-*` nobody declares is caught whichever
    // layer should have answered.
    for (const m of readFileSync(join(src, "styles", "tokens.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .matchAll(/(--app-[a-z0-9-]+)\s*:/g)) {
      for (const [, set] of perTheme) set.add(m[1]);
    }
    const missing = new Set();
    for (const f of SHEETS) {
      const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/var\(\s*(--app-[a-z0-9-]+)/g)) {
        for (const [theme, set] of perTheme) {
          if (!set.has(m[1])) missing.add(`${basename(f)}: ${m[1]} not assigned by ${theme}`);
        }
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // The tonal scale (2026-08-17). Its whole value is that the step NUMBER means
  // something — `blue-500` and `yellow-500` carry the same weight and the same
  // contrast — so these two tests measure the hexes rather than trust them.
  // ---------------------------------------------------------------------------

  const TARGET = { 100: 92, 200: 80, 300: 70, 400: 58, 500: 48, 600: 34, 700: 18 };
  const GROUND = { dark: "#1e1e1e", light: "#fbfbfb" };

  /// CIE L* — the definition of a tone, and what the step numbers name.
  function lstar(hex) {
    const channel = (c) => {
      const v = parseInt(hex.slice(c, c + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const y = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y;
  }

  /// WCAG contrast, which is luminance and NOT tone — the reason four of the
  /// steps are pinned to a ratio instead of to their target tone.
  function ratio(a, b) {
    const rl = (hex) => {
      const channel = (c) => {
        const v = parseInt(hex.slice(c, c + 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    };
    const [lo, hi] = [rl(a), rl(b)].sort((x, y) => x - y);
    return (hi + 0.05) / (lo + 0.05);
  }

  /// OKLCH chroma of a hex: how coloured it is, whatever its hue.
  function chroma(hex) {
    const lin = [1, 3, 5].map((c) => {
      const v = parseInt(hex.slice(c, c + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const M1 = [
      [0.4122214708, 0.5363325363, 0.0514459929],
      [0.2119034982, 0.6806995451, 0.1073969566],
      [0.0883024619, 0.2817188376, 0.6299787005],
    ];
    const M2 = [
      [0.2104542553, 0.793617785, -0.0040720468],
      [1.9779984951, -2.428592205, 0.4505937099],
      [0.0259040371, 0.7827717662, -0.808675766],
    ];
    const apply = (m, v) => m.map((row) => row.reduce((s, k, i) => s + k * v[i], 0));
    const [, a, b] = apply(M2, apply(M1, lin).map(Math.cbrt));
    return Math.hypot(a, b);
  }

  /// The oklab midpoint of two hexes — what `color-mix(in oklab, a, b)` is,
  /// and what a half rung of the emphasis ladder resolves to.
  function midpoint(a, b) {
    const lin = (hex) =>
      [1, 3, 5].map((c) => {
        const v = parseInt(hex.slice(c, c + 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    const M1 = [
      [0.4122214708, 0.5363325363, 0.0514459929],
      [0.2119034982, 0.6806995451, 0.1073969566],
      [0.0883024619, 0.2817188376, 0.6299787005],
    ];
    const M2 = [
      [0.2104542553, 0.793617785, -0.0040720468],
      [1.9779984951, -2.428592205, 0.4505937099],
      [0.0259040371, 0.7827717662, -0.808675766],
    ];
    const apply = (m, v) => m.map((row) => row.reduce((s, k, i) => s + k * v[i], 0));
    const toLab = (hex) => apply(M2, apply(M1, lin(hex)).map(Math.cbrt));
    const [la, lb] = [toLab(a), toLab(b)];
    const lab = la.map((v, i) => (v + lb[i]) / 2);
    // Back out: invert M2, cube, invert M1. The inverses are spelled rather
    // than solved — this is a test, not a colour library.
    const M2i = [
      [1, 0.3963377774, 0.2158037573],
      [1, -0.1055613458, -0.0638541728],
      [1, -0.0894841775, -1.291485548],
    ];
    const M1i = [
      [4.0767416621, -3.3077115913, 0.2309699292],
      [-1.2684380046, 2.6097574011, -0.3413193965],
      [-0.0041960863, -0.7034186147, 1.707614701],
    ];
    const rgb = apply(M1i, apply(M2i, lab).map((v) => v ** 3));
    return (
      "#" +
      rgb
        .map((v) => {
          const c = Math.max(0, Math.min(1, v));
          const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
          return Math.round(s * 255)
            .toString(16)
            .padStart(2, "0");
        })
        .join("")
    );
  }

  // The eight SLOTS: seven numbered hues plus `neutral` (services/accent.js).
  const HUES = ["1", "2", "3", "4", "5", "6", "7", "neutral"];
  const palette = () => {
    const css = readFileSync(join(src, "styles", "themes", "jott.css"), "utf8");
    const steps = {};
    // Family names may hyphenate and a hex pasted from Figma may arrive
    // uppercase — a parser that only reads `[a-z]+` and lowercase hex would
    // skip such a colour and every test built on it would go green while
    // measuring nothing. That silent-skip shape already bit once (the ladder
    // test's first version); the count test below is the backstop.
    for (const m of css.matchAll(/--theme-color-([a-z0-9][a-z0-9-]*?)-(\d00):\s*(#[0-9a-fA-F]{6})/g)) {
      (steps[m[1]] ??= {})[m[2]] = m[3].toLowerCase();
    }
    return steps;
  };

  const STATUS = ["danger", "warning", "success"];
  /// What a family is REQUIRED to carry. The eight run the whole grid; status
  /// runs the five a status colour is ever read at — the ink per ground (300,
  /// 500), the wash behind it (700, 100) and the fill (200: a swipe's square,
  /// a priority swatch). A status colour is never a heading, so no ladder.
  const stepsFor = (name) => (STATUS.includes(name) ? [100, 200, 300, 500, 700] : [100, 200, 300, 400, 500, 600, 700]);

  test("the palette is eight families of seven steps, and three of five", () => {
    // The count is the parser's proof of coverage: a ninth colour, or a step
    // written in a shape the regex above cannot read, changes a number here
    // instead of silently dropping out of every measurement.
    // The eight, plus the three STATUS families (2026-08-26) — seeded from
    // red/yellow/green and kept as families of their own, so a theme that
    // moves its red does not move the error notice with it.
    const families = palette();
    expect(Object.keys(families).sort()).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "danger", "neutral", "success", "warning"],
    );
    for (const [name, steps] of Object.entries(families)) {
      expect(Object.keys(steps).map(Number).sort((a, b) => a - b), `${name}'s steps`).toEqual(
        stepsFor(name),
      );
    }
  });

  test("nothing reads a status step the palette no longer carries", () => {
    // The trim above is only safe while the modes ask for those four and no
    // other. This is what catches a mode reaching for `--theme-color-danger-400`
    // and getting an empty custom property, which paints nothing and says nothing.
    const offenders = [];
    for (const [file, css] of themes()) {
      for (const m of css.matchAll(/--theme-color-(danger|warning|success)-(\d00)/g)) {
        if (!stepsFor(m[1]).includes(Number(m[2]))) offenders.push(`${file}: ${m[0]}`);
      }
    }
    for (const dir of ["modes", "components", "controls"]) {
      for (const f of readdirSync(join(src, "styles", dir))) {
        const css = readFileSync(join(src, "styles", dir, f), "utf8");
        for (const m of css.matchAll(/--theme-color-(danger|warning|success)-(\d00)/g)) {
          if (!stepsFor(m[1]).includes(Number(m[2]))) offenders.push(`${f}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every colour hits the same tone at the same step", () => {
    // A step whose tone drifts is a step whose number lies, and the moment one
    // colour's 500 is lighter than another's the app is back where it started:
    // a yellow accent unreadable on the canvas while a purple one was fine.
    // The tolerance is 4 L*, which is the cap the contrast correction may
    // spend (styles/tokens.css).
    const offenders = [];
    for (const [name, steps] of Object.entries(palette())) {
      for (const step of stepsFor(name)) {
        const target = TARGET[step];
        const hex = steps[step];
        if (!hex) {
          offenders.push(`${name}: no step ${step}`);
          continue;
        }
        const drift = Math.abs(lstar(hex) - target);
        if (drift > 4) offenders.push(`${name}-${step}: L* ${lstar(hex).toFixed(0)} ≠ ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the solid accent carries its ink, for all eight", () => {
    // The promise `--app-*-solid` makes (styles/roles.css): a notebook's
    // card is that notebook's colour with its name written across it, the same
    // colour on every theme — so the ink over it is fixed, and the fill has to
    // clear AA against that ink whichever of the eight was picked.
    //
    // The role is read off the sheet rather than assumed to be step 500: the
    // moment someone moves it to 400 for a brighter card, this is what says
    // the text stopped being readable.
    const roles = readFileSync(join(src, "styles", "roles.css"), "utf8");
    const ink = roles.match(/--app-on-solid:\s*var\((--theme-color-[a-z0-9-]+)\)/);
    expect(ink, "roles.css assigns --app-on-solid from the palette").toBeTruthy();
    const tokens = readFileSync(join(src, "styles", "themes", "jott.css"), "utf8");
    const inkHex = tokens
      .match(new RegExp(`${ink[1]}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
      ?.toLowerCase();
    expect(inkHex, `tokens.css defines ${ink[1]}`).toBeTruthy();

    const families = palette();
    const offenders = [];
    for (const m of roles.matchAll(
      /--app-([a-z0-9]+)-solid:\s*var\(--theme-color-\1-(\d00)\)/g,
    )) {
      const hex = families[m[1]]?.[m[2]];
      if (!hex) {
        offenders.push(`${m[1]}-solid: no palette step ${m[2]}`);
        continue;
      }
      const got = ratio(hex, inkHex);
      if (got < 4.5) offenders.push(`${m[1]}-solid: ${got.toFixed(2)}:1 < 4.5:1`);
    }
    // All eight, so a colour added to the palette without a solid rung is a
    // notebook whose card cannot be drawn.
    expect(offenders).toEqual([]);
    // `--app-on-solid` is the ink, not a rung — it is what the eight are
    // written IN, and counting it as a ninth colour is how this line first
    // went green against nine.
    expect(
      [...roles.matchAll(/--app-(?!on-)[a-z0-9]+-solid:/g)].length,
      "one solid rung per colour",
    ).toBe(HUES.length);
  });

  test("status roles read the status families, never a hue", () => {
    // `--app-danger: var(--theme-color-4-300)` was the shape until
    // 2026-08-26. A theme may make its red sea-green; the error stays red.
    const offenders = [];
    for (const [name, css] of themes()) {
      // A role may also mix two STATUS steps: the warning leans amber on its wash.
      const status = String.raw`var\(--theme-color-(?:danger|warning|success)-\d00\)`;
      const mixed = new RegExp(`^color-mix\\(in oklab, ${status}(?: \\d+%)?, ${status}(?: \\d+%)?\\)$`);
      for (const m of css.matchAll(/(--app-(danger|warning|success)(?:-tint|-fill|-on-tint)?)\s*:\s*([^;]+);/g)) {
        const value = m[3].trim();
        if (!new RegExp(`^var\\(--theme-color-${m[2]}-\\d00\\)$`).test(value) && !mixed.test(value)) {
          offenders.push(`${name}: ${m[1]} reads ${value}`);
        }
      }
      for (const m of css.matchAll(/--app-emphasis\s*:\s*([^;]+);/g)) {
        if (!/^var\(--theme-color-success-\d00\)$/.test(m[1].trim())) {
          offenders.push(`${name}: --app-emphasis reads ${m[1].trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every step that carries text clears its contrast floor", () => {
    // The promise the scale makes to a screen: take step 300 on the sidebar or
    // step 500 on the canvas and the text is readable, whichever of the eight
    // the user picked. 4.5:1 is WCAG AA for body text, 7:1 what the emphasis
    // steps above them are for.
    const floors = [
      [200, GROUND.dark, 7],
      [300, GROUND.dark, 4.5],
      [500, GROUND.light, 4.5],
      [600, GROUND.light, 7],
    ];
    const offenders = [];
    let measured = 0;
    for (const [name, steps] of Object.entries(palette())) {
      // Only the steps the family carries: status has no 600, and asking
      // for one reads `undefined` — which threw here rather than passing, but
      // a silent skip is what a looser version of this loop would have done.
      for (const [step, ground, floor] of floors.filter(([s]) => stepsFor(name).includes(s))) {
        const got = ratio(steps[step], ground);
        measured += 1;
        if (got < floor) offenders.push(`${name}-${step}: ${got.toFixed(2)}:1 < ${floor}:1`);
      }
    }
    expect(offenders).toEqual([]);
    // 8 families x 4 floors + 3 status x the three floors they carry.
    expect(measured, "floors actually measured").toBe(8 * 4 + 3 * 3);
  });

  test("a status fill carries the dark ink, on both grounds", () => {
    // The swipe's square and the priority swatch are status-200 with the
    // on-brand ink (black) drawn over them, whichever ground they sit on.
    const black = readFileSync(join(src, "styles", "themes", "jott.css"), "utf8")
      .match(/--theme-color-black:\s*(#[0-9a-fA-F]{6})/)[1];
    const families = palette();
    const offenders = STATUS.filter((name) => ratio(families[name][200], black) < 4.5).map(
      (name) => `${name}-200: ${ratio(families[name][200], black).toFixed(2)}:1`,
    );
    expect(offenders).toEqual([]);
  });

  test("status surfaces carry the same chroma, so none looks faded beside another", () => {
    // The fill and the two washes of danger and success match the warning's
    // absolute chroma. A hue the gamut cannot hold that light (a pale red)
    // falls short only by what two L* darker could not win back.
    const families = palette();
    const offenders = [];
    for (const step of [100, 200, 700]) {
      const reference = chroma(families.warning[step]);
      for (const name of ["danger", "success"]) {
        const got = chroma(families[name][step]);
        if (Math.abs(got - reference) > 0.015) {
          offenders.push(`${name}-${step}: C ${got.toFixed(3)} vs warning ${reference.toFixed(3)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every emphasis ladder gets weaker one rung at a time", () => {
    // The rung a heading stands on has to be quieter than the one above it, on
    // the ground it is actually read against — otherwise the colour stops
    // agreeing with the size, which is what "it changes colour every other
    // level" looked like before there were six rungs (user report,
    // 2026-08-17).
    //
    // The floor is on rungs 1–4. The tail is MEANT to be faint — the user
    // asked for six distinct colours knowing H6 would be weak — and how faint
    // depends on the ground: the light theme's chrome sits on #ECEBEA, half a
    // step darker than its canvas, and dark text loses contrast there. So the
    // same ladder ends at 3.3:1 on the page and 2.6:1 on the frame, which is
    // where the six rungs stop being a promise about legibility and start
    // being one about ORDER — that part is checked on every rung.
    const steps = palette();

    // Every literal in the palette, including the grounds (`--theme-color-black`,
    // `--theme-color-white-tint`), which are not part of the tonal grid.
    const literals = Object.fromEntries(
      [
        ...readFileSync(join(src, "styles", "themes", "jott.css"), "utf8").matchAll(
          /(--theme-color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g,
        ),
      ].map((m) => [m[1], m[2].toLowerCase()]),
    );

    /// A theme value → a hex. Either a palette entry or the oklab midpoint of
    /// two of them, which is what a half rung is.
    const resolve = (value) => {
      const mix = value.match(
        /color-mix\(in oklab,\s*var\((--theme-color-[a-z0-9-]+)\),\s*var\((--theme-color-[a-z0-9-]+)\)\)/,
      );
      if (mix) return midpoint(literals[mix[1]], literals[mix[2]]);
      const one = value.match(/^var\((--theme-color-[a-z0-9-]+)\)$/);
      return one ? (literals[one[1]] ?? null) : null;
    };

    const offenders = [];
    let laddersChecked = 0;
    for (const [file, css] of themes()) {
      // A region's ground and its accents are not always declared in the same
      // rule (light.css splits them), so grounds are collected per region
      // across the whole file first.
      const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
        // Deduped: default.css names each region twice in one selector (once
        // under [data-theme], once under the :root fallback), and a block that
        // looked like two regions used to be skipped as if it were neither.
        regions: [...new Set([...m[1].matchAll(/data-region="(\w+)"/g)].map((r) => r[1]))],
        body: m[2],
      }));
      const grounds = {};
      for (const b of blocks) {
        const bg = b.body.match(/--app-bg:\s*([^;]+);/);
        if (bg) for (const region of b.regions) grounds[region] = resolve(bg[1].trim());
      }
      for (const b of blocks) {
        for (const region of b.regions) {
          const ground = grounds[region];
          if (!ground) continue;
          for (const name of Object.keys(steps)) {
            const rungs = [];
            for (let i = 1; i <= 6; i++) {
              const m = b.body.match(new RegExp(`--app-${name}-${i}:\\s*([^;]+);`));
              if (m) rungs.push(resolve(m[1].trim()));
            }
            if (rungs.length !== 6) continue;
            laddersChecked += 1;
            const ratios = rungs.map((hex) => ratio(hex, ground));
            ratios.forEach((r, i) => {
              if (i > 0 && r >= ratios[i - 1])
                offenders.push(
                  `${file} ${region} ${name}: rung ${i + 1} is not quieter than ${i}`,
                );
              if (i < 4 && r < 3)
                offenders.push(`${file} ${region} ${name}: rung ${i + 1} at ${r.toFixed(1)}:1`);
            });
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // A ground or a value this parser cannot read would make every ladder skip
    // silently, and the test would pass by measuring nothing — which it did
    // when it was first written. 8 colours × 2 regions × 3 themes.
    expect(laddersChecked).toBe(48);
  });

  test("no component wears a modifier without the class it modifies", () => {
    // `theme-btn--primary` paints a fill and nothing else: the padding, the
    // radius and the type all come from `theme-btn`. Worn alone it renders as
    // the browser's own button with a coloured background, which is exactly
    // how the rename dialog's OK button shipped (user report, 2026-08-19).
    //
    // `theme-btn--icon` is the documented exception — it carries its own reset
    // so a lone glyph works with or without the base (controls/buttons.css says so).
    // A tag is read as a whole — `class="…"` AND `class:x` directives — so a
    // modifier applied through a directive is held to the same rule. The
    // scanner walks to the tag's real `>`: an attribute may hold an arrow
    // function, and stopping at the `>` of `=>` would split the tag and hide
    // the directives after it.
    const tagsOf = (markup) => {
      const tags = [];
      for (let i = 0; i < markup.length; i++) {
        if (markup[i] !== "<" || !/[a-zA-Z]/.test(markup[i + 1] ?? "")) continue;
        let depth = 0;
        let j = i + 1;
        for (; j < markup.length; j++) {
          const c = markup[j];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          else if (c === '"' || c === "'" || c === "`") {
            for (j++; j < markup.length && markup[j] !== c; j++);
          } else if (c === ">" && depth === 0) break;
        }
        tags.push(markup.slice(i, j + 1));
        i = j;
      }
      return tags;
    };
    const offenders = [];
    for (const file of SVELTE) {
      for (const tag of tagsOf(readFileSync(file, "utf8"))) {
        const classes = [
          ...[...tag.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)),
          ...[...tag.matchAll(/class:([\w-]+)/g)].map((m) => m[1]),
        ];
        for (const name of classes) {
          if (!name.startsWith("theme-") || !name.includes("--")) continue;
          if (name === "theme-btn--icon") continue;
          const base = name.split("--")[0];
          if (!classes.includes(base))
            offenders.push(`${basename(file)}: ${name} without ${base}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("component stylesheets keep every top-level selector on a class", () => {
    // An element selector at the top level of a global sheet leaks onto the
    // whole app (scoping no longer protects it). Descendants of a class
    // (`.home__divider hr`) are fine — only the FIRST token must be a class.
    // A real brace walk, not a regex over `}…{` seams: the old shape never
    // saw the first rule after a nested at-rule opened (`@media (…) { div{`
    // has a `{` on its left, not a `}`), so a leak inside a media query
    // passed. Every style rule is checked at any depth — nesting under
    // @media/@container does not stop an element selector from applying
    // app-wide.
    const offenders = [];
    for (const f of SHEETS) {
      const css = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/url\([^)]*\)/g, "");
      for (const [, chunk, brace] of css.matchAll(/([^{}]*)([{}])/g)) {
        if (brace !== "{") continue;
        const prelude = chunk.split(";").pop().trim();
        if (prelude.startsWith("@")) continue;
        // A keyframe step (`from`, `to`, `40%`) is not a selector: it names a
        // point on an animation that only plays where a class asks for it.
        if (/^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(prelude)) continue;
        for (const sel of prelude.split(",")) {
          const first = sel.trim();
          if (first && !first.startsWith(".") && !first.startsWith(":root"))
            offenders.push(`${basename(f)}: ${first}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the settings search never writes out a label it could derive", () => {
    // The index has two halves (2026-08-21): the functions' half is read from
    // `features.js`, and each section's `index()` (its `<script module>`)
    // covers what exists only as markup. The moment a hand-written half
    // repeats a label the table already carries, that switch has two names to
    // keep in step and the drift is silent — so the split is read off the
    // source rather than trusted.
    const sections = walk(join(src, "lib", "screens", "settings"), ".svelte")
      .map((f) => [basename(f), readFileSync(f, "utf8")])
      .filter(([, text]) => text.includes("export const index"));
    expect(sections.length).toBeGreaterThan(0);
    const offenders = sections
      .filter(([, text]) => /S\.feature[A-Z]/.test(text.slice(0, text.indexOf("</script>"))))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  test("no two strings answer to the same name", () => {
    // A repeated key in `S` is not an error anywhere: the last one wins and
    // the first quietly disappears, so a label turns into whatever else was
    // called that (a settings row rendering a function's source, 2026-09-08).
    const text = readFileSync(join(src, "lib", "services", "strings.js"), "utf8");
    // `S` itself, not the private maps beside it — those hold command names,
    // and one of those may legitimately read like a label.
    const table = text.slice(text.indexOf("export const S = {"));
    const seen = new Set();
    const twice = [];
    for (const [, key] of table.matchAll(/^ {2}([A-Za-z]\w*):/gm)) {
      if (seen.has(key)) twice.push(key);
      seen.add(key);
    }
    expect(seen.size).toBeGreaterThan(100);
    expect(twice).toEqual([]);
  });

  test("no test fakes the Tauri bridge on its own", () => {
    // 2026-08-21: four incompatible shapes of this mock lived in the tree — a
    // hoisted `vi.fn`, a closure one, an inert one, and a partial stub of
    // services/api.js one level up. Each new test copied whichever it landed
    // beside, and a stub could drift from the command the app really sends
    // without anything saying a word. There is one stub now
    // (lib/test/bridge.js), aliased onto the real modules in vite.config.js;
    // a mock here is the start of the fifth shape.
    const faking = /vi\s*\.\s*mock\(\s*["'](?:@tauri-apps\/|[^"']*\/api\.js)/;
    const offenders = LIB_JS.filter((f) => f.endsWith(".test.js"))
      .filter((f) => faking.test(readFileSync(f, "utf8")))
      .map((f) => basename(f));
    expect(offenders).toEqual([]);
  });

  test("the bridge stub is reached by tests only", () => {
    // It imports vitest. Anything shipping to the app that pulled it in would
    // take the test runner along with it.
    const offenders = SOURCES
      .filter((f) => !f.endsWith(join("test", "bridge.js")))
      .filter((f) => readFileSync(f, "utf8").includes("test/bridge.js"))
      .map((f) => basename(f));
    expect(offenders).toEqual([]);
  });
});

// The version used to be typed into four files that had to agree, and
// packaging/release.sh compared them afterwards. Comparing is not preventing:
// package-lock.json sat on 0.22.0 for a whole version while the other four
// said 0.23.0, because it was not one of the four being compared. The copies
// were removed on 2026-08-21 — Cargo.toml holds it, because cargo is the only
// tool involved that cannot read a version out of another file, and everything
// else derives.
//
// These live here rather than only in release.sh because CI runs `npm test`
// before it packages a tag, and a guard nobody has to remember to run is the
// only kind that holds.
describe("the version lives in one file", () => {
  const repo = join(src, "..");
  const read = (...p) => readFileSync(join(repo, ...p), "utf8");
  const source = read("Cargo.toml").match(
    /^\[workspace\.package\][\s\S]*?^version = "([^"]+)"/m,
  );

  test("Cargo.toml declares it under [workspace.package]", () => {
    expect(source?.[1]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test.each(["package.json", join("src-tauri", "tauri.conf.json")])(
    "%s has no version key — it derives by saying nothing",
    (file) => {
      // Typing one back in is the silent regression: the file would simply win
      // over the source. tauri.conf.json omitting `version` is what makes the
      // Tauri CLI fall back to the Cargo manifest, and package.json is private
      // with nothing in the repo reading its version.
      expect(Object.keys(JSON.parse(read(file)))).not.toContain("version");
    },
  );

  test.each([join("core", "Cargo.toml"), join("src-tauri", "Cargo.toml")])(
    "%s inherits the version instead of repeating it",
    (file) => {
      // A literal here compiles, tests and passes every other check — and
      // ships a binary announcing the wrong version through CARGO_PKG_VERSION.
      expect(read(file)).toMatch(/^version\.workspace = true$/m);
    },
  );

  test("the PKGBUILD reads Cargo.toml instead of carrying a number", () => {
    const pkgbuild = read("packaging", "linux", "PKGBUILD");
    expect(pkgbuild).not.toMatch(/^pkgver=\d/m);
    expect(pkgbuild).toContain("Cargo.toml");
  });
});

// The bridge has two ends — `services/api.js` names a command, `src-tauri/src/
// lib.rs` registers it — and nothing but a click at runtime used to say
// whether they agreed. A wrapper for a command Rust dropped fails the first
// time it is called; a command Rust registers that no wrapper names is code
// the front cannot reach. Both directions are read from the source here.
describe("the bridge's two ends agree", () => {
  const repo = join(src, "..");
  const named = new Set(
    [...readFileSync(join(src, "lib", "services", "api.js"), "utf8").matchAll(
      /invoke\("([a-z_]+)"/g,
    )].map((m) => m[1]),
  );
  const handler = readFileSync(join(repo, "src-tauri", "src", "lib.rs"), "utf8").match(
    /generate_handler!\[([\s\S]*?)\]/,
  );
  const registered = new Set(
    [...handler[1].replace(/\/\/[^\n]*/g, "").matchAll(/commands::\w+::(\w+)/g)].map(
      (m) => m[1],
    ),
  );

  // Registered in Rust, called by nobody in `src/` (2026-08-21). Each stays
  // compiled in on purpose — a second frontend, or a screen that is not
  // written yet — and is listed HERE so that a wrapper silently losing its
  // last caller shows up as a failing test rather than as dead weight.
  const UNCALLED = [
    // The snapshot carries the open notebook; nothing asks for it alone.
    "current_notebook",
    // Three views the snapshot also carries (info.lists, counts, conflicts).
    "list_names",
    "list_counts",
    "list_conflicts",
    // A tasks space is ONE list since 2026-08-13, made with the space; no
    // screen offers a second list, so `create_list` is unreachable from the
    // UI today. The command stays for the hand-made extra list the format
    // still allows.
    "create_list",
    // The sidebar reads groups from the snapshot.
    "groups",
    // The tag catalogue arrives with the tasks that carry it.
    "tags",
    // Only the cross-space move is offered; `move_note_to_space` covers a
    // move inside one space too.
    "move_note",
  ];

  test("every command the front names is registered", () => {
    expect([...named].filter((c) => !registered.has(c)).sort()).toEqual([]);
  });

  test("every registered command is named by the front, or listed as uncalled", () => {
    const allowed = new Set([...named, ...UNCALLED]);
    expect([...registered].filter((c) => !allowed.has(c)).sort()).toEqual([]);
  });

  test("the uncalled list holds only commands that are really uncalled", () => {
    // An entry that gained a wrapper again is a stale line here.
    expect(UNCALLED.filter((c) => named.has(c))).toEqual([]);
    expect(UNCALLED.filter((c) => !registered.has(c))).toEqual([]);
  });
});

// A question that can be switched off has THREE ends, and two of them are in
// different languages: the dialog names a setting (`remember: "x"`), the shell
// installs it into the confirm policy from the notebook's layout, and the
// bridge has to put it in that layout. The third end was the one missing
// (2026-08-31) — `confirmDeletes` saved, showed correctly in Settings, and
// never reached the layout, so "don't ask again" asked again forever. Nothing
// failed and nothing logged; the switch was simply inert.
describe("a question that can be switched off is wired end to end", () => {
  const repo = join(src, "..");
  // Every setting a dialog offers to stop asking, by key — read from the
  // whole tree and not from a list, because a list is one more place to
  // forget: the question added tomorrow has to be found without anyone
  // remembering this file exists.
  const remembered = new Set(
    SOURCES
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/remember:\s*"(\w+)"/g)])
      .map((m) => m[1]),
  );

  const shell = readFileSync(join(src, "App.svelte"), "utf8");
  const layout = readFileSync(
    join(repo, "src-tauri", "src", "commands", "notebook.rs"),
    "utf8",
  ).match(/pub struct NotebookLayout \{([\s\S]*?)\n\}/)[1];
  const camel = (snake) => snake.replace(/_(\w)/g, (_, c) => c.toUpperCase());
  const inLayout = new Set(
    [...layout.matchAll(/pub (\w+):/g)].map((m) => camel(m[1])),
  );

  test("there is at least one, or this test is watching nothing", () => {
    expect(remembered.size).toBeGreaterThan(0);
  });

  test("every one of them rides in the notebook's layout", () => {
    expect([...remembered].filter((key) => !inLayout.has(key)).sort()).toEqual([]);
  });

  test("and the shell reads every one of them into the confirm policy", () => {
    const policy = shell.match(/setConfirmPolicy\(\{([\s\S]*?)\n\s*\}\);/)[1];
    expect(
      [...remembered].filter((key) => !policy.includes(`${key}: layout.${key}`)).sort(),
    ).toEqual([]);
  });
});

// Every branch writes to the changelog, and the release page is built from it:
// a merge resolved badly leaves markers, or a second copy of a section that
// the release reads only half of.
describe("CHANGELOG.md", () => {
  const lines = readFileSync(join(src, "..", "CHANGELOG.md"), "utf8").split("\n");

  test("carries no conflict markers", () => {
    expect(lines.filter((l) => /^(<<<<<<<|=======|>>>>>>>)( |$)/.test(l))).toEqual([]);
  });

  test("names each version once, and each heading once within it", () => {
    const repeated = [];
    const versions = new Set();
    let headings = new Set();
    for (const l of lines) {
      if (l.startsWith("## ")) {
        if (versions.has(l)) repeated.push(l);
        versions.add(l);
        headings = new Set();
      } else if (l.startsWith("### ")) {
        if (headings.has(l)) repeated.push(`${[...versions].at(-1)} › ${l}`);
        headings.add(l);
      }
    }
    expect(repeated).toEqual([]);
  });

  test("never lists the same bullet twice", () => {
    const bullets = lines.filter((l) => l.startsWith("- "));
    expect(bullets.filter((b, i) => bullets.indexOf(b) !== i)).toEqual([]);
  });
});
