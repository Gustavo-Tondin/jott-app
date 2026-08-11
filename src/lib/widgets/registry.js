// The single registry of widget types (phase 7.5).
//
// This is THE extension point of the product: a new widget type is a new
// entry here plus its component — never another `{#if}` in App.svelte, never
// a screen that has to learn about it. Community widgets, when they come,
// plug into the same table.
//
// A kind missing from the table falls back to the "unsupported" card: the
// widget is shown, named, and its folder is left untouched — a template
// written for a future version must degrade politely, never break or erase.

import TasksWidget from "./TasksWidget.svelte";
import NotesWidget from "./NotesWidget.svelte";
import UnsupportedWidget from "./UnsupportedWidget.svelte";

const REGISTRY = {
  tasks: TasksWidget,
  notes: NotesWidget,
};

/// The component that renders `kind`, or the unsupported card.
export function widgetComponent(kind) {
  return REGISTRY[kind] ?? UnsupportedWidget;
}
