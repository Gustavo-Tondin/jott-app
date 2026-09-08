// The stylesheet of a theme the reader brought into their notebook
// (`.jott/themes/`), put into the document from one place, as `rootStyle.js`
// does. LAST IN THE HEAD and unlayered, which is what makes it win over the
// app's own (unlayered) themes — and lets a theme that only assigns
// `[data-region]` paint, since no shipped theme rule matches its name.

/// The element's id, so the same tag is reused across every change instead of
/// stacking one per switch.
const ELEMENT_ID = "jott-user-theme";

/// Puts `css` in the document, or removes it when `css` is null. Idempotent:
/// writing the same text again does nothing (the watcher reports one save
/// several times).
export function applyUserTheme(css, doc = document) {
  const existing = doc.getElementById(ELEMENT_ID);

  if (css === null || css === undefined) {
    existing?.remove();
    return;
  }

  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }

  const style = doc.createElement("style");
  style.id = ELEMENT_ID;
  style.textContent = css;
  doc.head.append(style);
}

/// What is in the document right now — null when no notebook theme is worn.
/// For tests, and for the one caller that has to know whether to bother.
export function userThemeApplied(doc = document) {
  return doc.getElementById(ELEMENT_ID)?.textContent ?? null;
}
