// Finding an icon by name or by what it is about (the picker, 2026-09-07).
//
// Two halves. `loadIconLibrary` is the ONE door to the heavy module
// (`iconLibrary.js`): a memoised dynamic import, so the 1512 glyphs are read
// once per window and never at start-up. `searchIcons` is pure — it ranks a
// list of `{name, tags}` against what was typed and knows nothing about SVG,
// which is what makes it testable without the library.

let loading = null;

/// The whole Phosphor set, read the first time and cached: resolves to
/// `{SVGS, ENTRIES}` (services/iconLibrary.js).
export function loadIconLibrary() {
  loading ??= import("./iconLibrary.js");
  return loading;
}

/// The words of a query, lower-cased; hyphens split like spaces so that
/// "list checks" and "list-checks" ask the same thing.
export function termsOf(query) {
  return (query ?? "")
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean);
}

// How well one entry answers one term. Every term has to land somewhere for
// the entry to match at all; the score only orders the ones that do. The
// name outranks its tags, and the start of the name outranks the middle:
// typing "book" should put `book` before `bookmark` before `notebook`, and
// all three before `library`, which only carries "book" as a tag.
function scoreTerm(entry, term) {
  const { name } = entry;
  if (name === term) return 8;
  if (name.startsWith(term)) return 5;
  if (name.split("-").some((word) => word.startsWith(term))) return 3;
  if (name.includes(term)) return 2;
  if (entry.tags.some((tag) => tag.split(/\s+/).some((word) => word.startsWith(term)))) return 1;
  return 0;
}

/// The entries that match `query`, best first; an empty query is the list
/// as given. Ties keep the order they came in, which is how a curated
/// prefix (`leadFirst`) stays ahead of the alphabet.
export function searchIcons(entries, query) {
  const terms = termsOf(query);
  if (terms.length === 0) return entries;
  const scored = [];
  for (const entry of entries) {
    let score = 0;
    for (const term of terms) {
      const s = scoreTerm(entry, term);
      if (s === 0) {
        score = 0;
        break;
      }
      score += s;
    }
    if (score > 0) scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.entry);
}

/// `entries` with the named ones moved to the front, in the order of
/// `names`; a name the list does not have is skipped, not invented.
export function leadFirst(entries, names) {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const lead = names.map((n) => byName.get(n)).filter(Boolean);
  const rest = entries.filter((e) => !names.includes(e.name));
  return [...lead, ...rest];
}
