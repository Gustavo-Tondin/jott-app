// The WHOLE vendored Phosphor set (regular, ~1500 SVGs, ~760 KB) plus each
// icon's search tags. Never import it statically — `services/iconSearch.js`
// pulls it in with a dynamic `import()`. `eager: true` is deliberate: a lazy
// glob is one request per tile while the grid scrolls. `tags.json` is
// Phosphor's own metadata (`@phosphor-icons/core`, MIT), as `{name: [tag, …]}`.

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
