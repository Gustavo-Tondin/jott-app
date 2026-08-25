// The stylesheet of a theme the reader brought into their notebook
// (`.jott/themes/`, 2026-08-25), put into the document.
//
// Sibling of `rootStyle.js`, and for the same reason: this is a thing written
// on the document itself rather than on any component, from one place. The
// three themes the app ships are `@import`ed by `app.css` and picked by the
// `data-theme` attribute; a notebook's theme cannot be imported — it is not on
// disk where the bundle is — so its text arrives over the bridge and is put in
// a `<style>` of its own.
//
// LAST IN THE HEAD, and unlayered, which is what makes it win: the app's own
// themes are unlayered too (`app.css` explains why), so between two unlayered
// rules of the same specificity the later one takes it. Being last also means
// a theme that names no selector of its own — assigning `[data-region]`
// directly — still paints, because with `data-theme` set to a name the app
// does not ship, none of the app's own theme rules match at all.

/// The element's id, so the same tag is reused across every change instead of
/// stacking one per switch.
const ELEMENT_ID = "jott-user-theme";

/// Puts `css` in the document, or removes it entirely when `css` is null.
///
/// Idempotent, and cheap to call from an effect: writing the same text again
/// does nothing, which matters because the watcher can report a stylesheet
/// several times for one save.
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
