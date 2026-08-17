// The colour a space READS as, which is not always the colour stored in
// its own `.space.json`.
//
// Colour belongs to the group (user call 2026-08-04): a space inside one
// follows it, and its own colour — the one it had while loose — stops counting
// until it leaves. Without a single answer to this the sidebar said one thing
// (it inherits, through --group-color) and the space title and the tab dot
// said another (they read `sp.color` directly), so joining a group left the
// old colour behind in two places.

/// Maps folder name → colour for every space, the group winning over the
/// member. `null` means "no colour of its own" and the CSS falls back to the
/// theme brand.
export function spaceColors(spaces = [], groups = []) {
  const fromGroup = new Map();
  for (const group of groups) {
    for (const name of group.spaces ?? []) {
      fromGroup.set(name, group.color ?? null);
    }
  }
  const colors = {};
  for (const sp of spaces) {
    colors[sp.path] = fromGroup.has(sp.path)
      ? fromGroup.get(sp.path)
      : (sp.color ?? null);
  }
  return colors;
}
