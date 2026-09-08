// Which icon a sidebar entry wears.
//
// A space has one function, and the icon says which at a glance — the
// same job the group's icon does for a group (user call, 2026-08-11). It is a
// DEFAULT, not a rule: the moment the user picks one in the colour & icon
// popup, that is the icon, exactly as before.

/// The icon of each space type, when the user has not chosen one.
export const TYPE_ICONS = {
  tasks: "list-checks",
  notes: "notepad",
  home: "house",
};

/// The fallback for a type this build has never heard of: a plain folder says
/// "something is here" without pretending to know what.
const DEFAULT_ICON = "folder";

/// The icon for a space — its own, or the one its type wears.
export function spaceIcon(space) {
  return space?.icon || TYPE_ICONS[space?.kind] || DEFAULT_ICON;
}
