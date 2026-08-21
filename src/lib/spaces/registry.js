// The single registry of space types (phase 7.5).
//
// This is THE extension point of the product: a new type of space is a new
// entry here plus its screen — never another `{#if}` in App.svelte, never a
// screen that has to learn about it. Community types, when they come, plug
// into the same table.
//
// A kind missing from the table falls back to the "unsupported" card: the
// space is shown, named, and its folder is left untouched — a notebook
// written by a future version must degrade politely, never break or erase.

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

/// A space in the shape a space screen reads (its `source` prop): the folder
/// is the space's root-relative path. One construction — App.svelte's two
/// fixed screens and SpaceView each hand-built this, and the copies had
/// already drifted (one carried an `options` key the bridge never sends).
/// `name: null` is a screen that does not title itself.
export function sourceOf(space, { name = space.name ?? null } = {}) {
  return {
    kind: space.kind,
    known: space.known,
    folder: space.path,
    name,
    sort: space.sort ?? null,
    order: space.order ?? [],
    // The board layout this notes space chose for itself; null follows the
    // notebook's default (`layout.noteLayout`).
    noteLayout: space.noteLayout ?? null,
  };
}
