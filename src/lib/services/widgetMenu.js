// The ⋮ menu of a tasks/notes screen, built once for every type.
//
// Both screens grew the same menu independently (2026-08-05: sort submenu),
// and the two copies had already started to drift — the notes one offers no
// completion date, the tasks one leads with "Select tasks…". The shape is
// the contract, so it lives here and the differences are arguments.

import { S } from "./strings.js";

/// The sortings a widget may offer, in display order. `null` is the file
/// order; `custom` is the arrangement the user dragged.
export const SORT_LABELS = {
  null: () => S.sortFileOrder,
  name: () => S.sortByName,
  created: () => S.sortByCreated,
  completed: () => S.sortByCompleted,
  custom: () => S.sortCustom,
};

/// Builds the items of a widget's ⋮ menu (the shape `Menu.svelte` takes).
///
/// - `lead`: the type's own entries, above the shared ones;
/// - `sorts`: which orderings this type understands (a note has no completion
///   date, so the notes widget leaves that one out);
/// - `sort` / `hasOrder`: what the workspace's `.workspace.json` currently
///   says — the active one is ticked, and "custom" is dead until something
///   was dragged.
export function widgetMenu({
  lead = [],
  sorts = [null, "name", "created", "custom"],
  sort = null,
  hasOrder = false,
  onSetSort,
} = {}) {
  const tick = (value) => (sort === value ? "✓ " : "  ");
  const items = [...lead];

  // An entry the caller gave nothing for is LEFT OUT, not shown dead: a source
  // with no `.workspace.json` (a period — the Home's day, the Tasks screen)
  // has no arrangement to set, so offering it would be a promise the screen
  // cannot keep (2026-08-06).
  if (sorts.length > 0) {
    items.push({
      label: S.sortTasks,
      items: sorts.map((value) => ({
        label: tick(value) + SORT_LABELS[String(value)](),
        run: () => onSetSort?.(value),
        disabled: value === "custom" && !hasOrder,
      })),
    });
  }
  return items;
}
