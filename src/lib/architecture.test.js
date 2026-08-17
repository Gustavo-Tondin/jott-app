// The frontend's structural invariants, guarded the same way core's
// invariants.rs guards the write path: by reading the source itself.
//
// The separation decided on 2026-07-27 (roadmap, Fase 10 "Reorganização
// Estrutura/Estilo/Função") is only worth anything if it cannot silently
// erode: a component is skeleton + wiring, everything visual lives in
// src/styles/, and a theme can reach any hook because nothing hides behind
// Svelte's scoping hash.
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, ext) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p, ext);
    return e.name.endsWith(ext) ? [p] : [];
  });
}

describe("frontend architecture", () => {
  test("no component carries a <style> block — the visual layer lives in styles/", () => {
    const offenders = [join(src, "App.svelte"), ...walk(join(src, "lib"), ".svelte")]
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
    const offenders = [...walk(join(src, "styles"), ".css"), join(src, "app.css")]
      .filter((f) =>
        readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").includes(":global("),
      )
      .map((f) => basename(f));
    expect(offenders).toEqual([]);
  });

  test("every component stylesheet is imported by the aggregator", () => {
    const app = readFileSync(join(src, "app.css"), "utf8");
    const missing = readdirSync(join(src, "styles", "components"))
      .filter((f) => f.endsWith(".css"))
      .filter((f) => !app.includes(`./styles/components/${f}`));
    expect(missing).toEqual([]);
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
    for (const f of [
      ...walk(join(src, "styles"), ".css"),
      join(src, "app.css"),
    ]) {
      for (const m of strip(readFileSync(f, "utf8")).matchAll(
        /(?<![\w.-])\d+(?:\.\d+)?px\b/g,
      )) {
        offenders.push(`${basename(f)}: ${m[0]}`);
      }
    }
    // An icon's `size` prop becomes a CSS length too (--icon-size).
    for (const f of [join(src, "App.svelte"), ...walk(join(src, "lib"), ".svelte")]) {
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

  const themes = () =>
    walk(join(src, "styles", "themes"), ".css").map((f) => [
      basename(f),
      readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
    ]);

  test("no role in a theme reads another role", () => {
    // THE rule (styles/themes/default.css). `--theme-bg: var(--ground)` and
    // `--ground: var(--palette-black)` was the old shape: two files to answer
    // "what colour is the sidebar?".
    //
    // What is forbidden is a role reading a ROLE. A literal is fine, and
    // `var(--palette-*)` is just a literal with a name — the app's own palette,
    // which the three shipped themes share. A theme with colours of its own
    // writes hexes and reads nothing (user question, 2026-08-13: an earlier
    // version of this test REQUIRED `--palette-*`, which quietly forbade the
    // one thing a theme exists to do).
    const offenders = [];
    for (const [name, css] of themes()) {
      for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        for (const ref of m[2].matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
          if (ref[1].startsWith("--theme-") || ref[1].startsWith("--accent-")) {
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

  test("every role a component reads is assigned by every theme", () => {
    // Catches the other direction: a stylesheet reaching for a `--theme-*`
    // that no theme defines renders as nothing at all.
    const assigned = new Set(
      themes().flatMap(([, css]) => [...css.matchAll(/(--theme-[a-z0-9-]+)\s*:/g)].map((m) => m[1])),
    );
    // roles.css holds the ones that are the same in every theme, plus the
    // accent branch — they count as assigned too.
    for (const m of readFileSync(join(src, "styles", "roles.css"), "utf8").matchAll(
      /(--theme-[a-z0-9-]+)\s*:/g,
    )) {
      assigned.add(m[1]);
    }
    const missing = new Set();
    const sheets = [
      join(src, "styles", "controls.css"),
      ...walk(join(src, "styles", "components"), ".css"),
    ];
    for (const f of sheets) {
      const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/var\(\s*(--theme-[a-z0-9-]+)/g)) {
        // Metrics (spacing, radius, type, layout, motion) live in tokens.css.
        if (/^--theme-(space|radius|text|weight|tracking|leading|font|transition|sidebar|titlebar|content|window)/.test(m[1]))
          continue;
        if (!assigned.has(m[1])) missing.add(`${basename(f)}: ${m[1]}`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  test("component stylesheets keep every top-level selector on a class", () => {
    // An element selector at the top level of a global sheet leaks onto the
    // whole app (scoping no longer protects it). Descendants of a class
    // (`.home__divider hr`) are fine — only the FIRST token must be a class.
    const offenders = [];
    for (const f of walk(join(src, "styles", "components"), ".css")) {
      const css = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/@layer components \{/g, "")
        .replace(/^\}/gm, "");
      for (const m of css.matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
        for (const sel of m[2].split(",")) {
          const first = sel.trim();
          if (first && !first.startsWith(".") && !first.startsWith(":root"))
            offenders.push(`${basename(f)}: ${first}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
