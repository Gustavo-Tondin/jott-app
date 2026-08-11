// The colour a workspace READS as, which is not always the colour stored in
// its own `.workspace.json`.
//
// Colour belongs to the group (user call 2026-08-04): a workspace inside one
// follows it, and its own colour — the one it had while loose — stops counting
// until it leaves. Without a single answer to this the sidebar said one thing
// (it inherits, through --group-color) and the workspace title and the tab dot
// said another (they read `ws.color` directly), so joining a group left the
// old colour behind in two places.

/// Maps folder name → colour for every workspace, the group winning over the
/// member. `null` means "no colour of its own" and the CSS falls back to the
/// theme brand.
export function workspaceColors(workspaces = [], groups = []) {
  const fromGroup = new Map();
  for (const group of groups) {
    for (const name of group.workspaces ?? []) {
      fromGroup.set(name, group.color ?? null);
    }
  }
  const colors = {};
  for (const ws of workspaces) {
    colors[ws.folderName] = fromGroup.has(ws.folderName)
      ? fromGroup.get(ws.folderName)
      : (ws.color ?? null);
  }
  return colors;
}
