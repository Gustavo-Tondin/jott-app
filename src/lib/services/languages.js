// The languages a notebook can be WRITTEN in — a longer list than the
// interface speaks (locales/index.js): writing in Catalan needs no Catalan
// menus. Names come from the platform in the interface's language.

/// BCP 47 tags, a region only where the spelling differs by it.
export const WRITING_LANGUAGES = [
  "pt-BR", "pt-PT", "es", "en-US", "en-GB", "fr", "de", "it", "ca", "gl", "eu",
  "nl", "sv", "da", "nb", "fi", "pl", "cs", "sk", "hu", "ro", "hr", "sl", "lt",
  "lv", "et", "el", "tr", "ru", "uk",
];

/// A tag's name in the interface's language (`document.documentElement.lang`),
/// or the tag itself where the platform has no name for it.
export function languageName(tag) {
  try {
    const names = new Intl.DisplayNames([document.documentElement.lang || "en"], {
      type: "language",
    });
    const name = names.of(tag) ?? tag;
    return name.charAt(0).toLocaleUpperCase() + name.slice(1);
  } catch {
    return tag;
  }
}

/// The language an open note is drawn in: what it declares, else what its
/// text read as, else the notebook's first. Null leaves the page's own.
export const noteLangOf = ({ lang, detected } = {}, languages = []) =>
  lang || detected || languages[0] || null;
