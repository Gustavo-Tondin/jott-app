// Turning one of the app's own stylesheets into the starting point of a
// notebook theme (2026-08-25).
//
// A theme assigns both regions IN FULL — that is the contract, and it is what
// keeps every role one hop from a colour instead of a chain. The cost is
// volume: ~170 declarations. Nobody types those from a documentation page, so
// the app writes the first version out of the look already on screen.
//
// What has to change on the way is the SELECTOR. The app's themes are keyed on
// their own name (`[data-theme="default"]`), which the copy must not keep — it
// would answer to the wrong theme, and to the app's rather than to the new
// one. Dropping the key entirely is what the new file wants: with `data-theme`
// naming a theme the app does not ship, none of the app's theme rules match,
// so a bare `[data-region="chrome"]` is the only thing painting. It is also
// simply nicer to edit — the name is not repeated down the file, and renaming
// the folder cannot break it.

/// Every form the app's own themes key themselves on.
const KEYED = /\[data-(?:theme|mode)="[^"]*"\]|:root:not\(\[data-(?:theme|mode)\]\)/g;

/// Everything up to a rule's `{`: its comments and its selector list.
const PRELUDE = /([^{}]*)\{/g;

/// A selector list with the same selector in it twice, said once.
///
/// Two keyed selectors that lose their key become the same selector — which is
/// exactly what happens to every rule in `default.css`, since it answers both
/// to its name and to no-attribute-at-all. Correct either way; this is so the
/// file a person opens does not repeat itself.
///
/// Conservative on purpose: anything before the last comment is carried over
/// untouched, and a list whose parts are all different is returned exactly as
/// it came — including its indentation.
function collapseDuplicates(prelude) {
  const commentEnds = prelude.lastIndexOf("*/");
  const head = commentEnds === -1 ? "" : prelude.slice(0, commentEnds + 2);
  const list = commentEnds === -1 ? prelude : prelude.slice(commentEnds + 2);

  const parts = list
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  if (parts.length < 2 || unique.length === parts.length) return prelude;

  return `${head}${head ? "\n" : ""}${unique.join(",\n")} `;
}

/// The stylesheet of the theme in use, ready to be written as a new one.
///
/// Pure text: no DOM, no parser. The input is one of three files this
/// repository owns, so the shapes it has to survive are known — and a theme
/// copied from a notebook (which carries no key at all) goes through
/// untouched, which is what makes "duplicate this theme" the same operation.
export function seedFrom(css) {
  return css
    // A key in front of a descendant: `[data-theme="x"] [data-region="y"]`.
    // The lookahead is what keeps `[data-theme="x"] {` out of it — there the
    // key IS the selector, and the next rule below turns it into `:root`.
    .replace(new RegExp(`(?:${KEYED.source})\\s+(?=[.:\\[#*a-zA-Z])`, "g"), "")
    // A key standing alone, as the whole selector.
    .replace(KEYED, ":root")
    .replace(PRELUDE, (_, prelude) => `${collapseDuplicates(prelude)}{`);
}
