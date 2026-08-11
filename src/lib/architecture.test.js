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
