// The single registry of space types — THE extension point: a new type is a
// new entry here plus its screen, never another `{#if}` in App.svelte. A kind
// missing from the table falls back to the "unsupported" card: the space is
// shown, named, its folder left untouched — a notebook written by a future
// version degrades politely, never breaks or erases.

import TasksSpace from "./TasksSpace.svelte";
import NotesSpace from "./NotesSpace.svelte";
import UnsupportedSpace from "./UnsupportedSpace.svelte";

const REGISTRY = {
  tasks: TasksSpace,
  notes: NotesSpace,
};

/// The component that renders `kind`, or the unsupported card.
export function spaceComponent(kind) {
  return REGISTRY[kind] ?? UnsupportedSpace;
}

/// A space in the shape a space screen reads (its `source` prop): `folder` is
/// the space's root-relative path. The ONE construction — hand-built copies
/// drift. `name: null` is a screen that does not title itself.
export function sourceOf(space, { name = space.name ?? null } = {}) {
  return {
    kind: space.kind,
    known: space.known,
    folder: space.path,
    name,
    sort: space.sort ?? null,
    sortDirection: space.sortDirection ?? null,
    order: space.order ?? [],
    // The board layout this notes space chose for itself; null follows the
    // notebook's default (`layout.noteLayout`).
    noteLayout: space.noteLayout ?? null,
  };
}
