// The languages the app ships and the audit of a dictionary against the
// source table. No import of the bridge here, so `npm run i18n` runs it in
// plain node; the runtime half (loading, applying) is services/locale.js.

/// By BCP 47 tag. `en` is the source: nothing to load. A new language is one
/// line here and one file beside this one — and a case in `Lang` (core).
export const LANGUAGES = {
  en: { name: "English", load: null },
  "pt-BR": { name: "Português (Brasil)", load: () => import("./pt-BR.js") },
};

/// Whether a pair's English is still what the source says. A function
/// compares as source with the whitespace squeezed out (a reflow is not a
/// change); anything else compares as data.
export function same(en, source) {
  const fn = typeof en === "function";
  if (fn !== (typeof source === "function")) return false;
  return fn ? squeeze(en) === squeeze(source) : JSON.stringify(en) === JSON.stringify(source);
}

const squeeze = (fn) => String(fn).replace(/\s+/g, "");

/// Source keys with nothing to translate: they only look up other keys
/// (`actionNames`, `undoOffers`), which a dictionary translates instead.
export const DERIVED = new Set(["undoOfferText", "actionName"]);

/// What a dictionary gets wrong against the source, worst first:
/// `orphans` — keys the source no longer has (a rename left them behind);
/// `malformed` — not a `[en, translation]` pair, or a shape the source key
/// does not have; `broken` — a function or table whose English moved on,
/// which the runtime cannot fall back from (it trusts functions);
/// `stale` — a string whose English moved on, shown in English by itself;
/// `missing` — source keys the dictionary does not cover yet (never DERIVED).
export function audit(source, dict) {
  const orphans = [];
  const malformed = [];
  const broken = [];
  const stale = [];
  for (const [key, pair] of Object.entries(dict)) {
    if (!(key in source)) {
      orphans.push(key);
      continue;
    }
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      !pair.every((half) => sameShape(half, source[key]))
    ) {
      malformed.push(key);
      continue;
    }
    if (same(pair[0], source[key])) continue;
    (typeof pair[0] === "string" ? stale : broken).push(key);
  }
  const keys = Object.keys(source).filter((key) => !DERIVED.has(key));
  const missing = keys.filter((key) => !(key in dict));
  const total = keys.length;
  return { orphans, malformed, broken, stale, missing, covered: total - missing.length, total };
}

const sameShape = (a, b) => typeof a === typeof b && Array.isArray(a) === Array.isArray(b);
