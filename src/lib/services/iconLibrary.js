// The WHOLE vendored Phosphor set, regular weight, as one module.
//
// This is the heavy half of the icon picker (2026-09-07): 1512 SVG strings
// (~760 KB) plus the search tags of each. It is never imported statically —
// `services/iconSearch.js` pulls it in with a dynamic `import()`, so the app
// starts with the ~100 glyphs of `components/icons.js` and only reads this
// chunk the first time a picker opens, or the first time a sidebar entry
// wears an icon that is not in the bundle.
//
// `eager: true` is deliberate: a lazy glob would make 1512 chunks of 500
// bytes, one request per tile while the grid scrolls. One chunk, read once
// from the app's own files, is the cheaper shape for a local app.
//
// `tags.json` is Phosphor's own metadata (`@phosphor-icons/core`,
// `src/icons.ts`, MIT — same licence as the SVGs beside it), reduced to
// `{name: [tag, …]}` for the 1512 names on disk and with the `*new*`
// release marker dropped. It is what makes "coffee" find `coffee`,
// `coffee-bean` AND `mug`, which no name search could.

import TAGS from "../../assets/icons/phosphor/tags.json";

const files = import.meta.glob("../../assets/icons/phosphor/regular/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

/// Every regular icon by name: `{acorn: "<svg …>", …}`.
export const SVGS = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [path.slice(path.lastIndexOf("/") + 1, -4), svg]),
);

/// The searchable list, alphabetical: `[{name, tags}, …]`.
export const ENTRIES = Object.keys(SVGS)
  .sort()
  .map((name) => ({ name, tags: TAGS[name] ?? [] }));
