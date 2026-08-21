// What the shell writes on the document's root element, from one place.
//
// The root is where a value goes when it has to reach BOTH regions at once —
// the window and the drawer are siblings, the theme wraps everything, the
// platform is read by CSS that no component is told about. Each writer is the
// same two lines (set when there is a value, remove when there is none), and
// the pact is the same too: an absent attribute or property is what the
// stylesheet answers with its own default, so "none" is spelled by removing,
// never by writing an empty string.

/// Writes a custom property on the root, or removes it when `value` is null.
export function setRootVar(name, value, root = document.documentElement) {
  if (value === null || value === undefined) root.style.removeProperty(name);
  else root.style.setProperty(name, value);
}

/// Writes each `data-*` attribute of `values` on the root (`{ theme: "dark" }`
/// → `data-theme="dark"`), removing the ones whose value is null.
export function setRootData(values, root = document.documentElement) {
  for (const [name, value] of Object.entries(values)) {
    if (value === null || value === undefined) delete root.dataset[name];
    else root.dataset[name] = value;
  }
}
