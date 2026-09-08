// Document tabs — the model, with no Svelte in it. A tab holds its own
// navigation history (back and forward belong to the tab, as in a browser);
// a *view* is the plain object the screens use, and tabs add no vocabulary.

import { movedItem } from "../services/spaceOrder.js";

/// Stable identity of a view, used to tell "already open" from "open again".
export function viewId(view) {
  if (!view) return "";
  switch (view.kind) {
    case "list":
      return `list:${view.list}`;
    case "note":
      return `note:${view.folder}/${view.path}`;
    case "space":
      return `sp:${view.sp}`;
    default:
      return view.kind;
  }
}

const tabOf = (view) => ({ views: [view], at: 0 });

/// The view a tab is showing.
export const currentView = (tab) => tab?.views[tab.at] ?? null;

export const canGoBack = (tab) => !!tab && tab.at > 0;
export const canGoForward = (tab) => !!tab && tab.at < tab.views.length - 1;

/// Opens `view`: focuses the tab already showing it, or appends one — a click
/// on the same list never fills the bar with copies. `focus: false` is the
/// browser's middle click: opened or found, and the tab you are on stays in front.
export function open(tabs, active, view, { focus = true } = {}) {
  const id = viewId(view);
  const existing = tabs.findIndex((tab) => viewId(currentView(tab)) === id);
  if (existing >= 0) return { tabs, active: focus ? existing : active };
  return { tabs: [...tabs, tabOf(view)], active: focus ? tabs.length : active };
}

/// Navigates the active tab to `view`, in place. Anything ahead is dropped,
/// as a browser does: a new path from here makes the old forward unreachable.
export function navigate(tabs, active, view) {
  const tab = tabs[active];
  if (!tab) return open(tabs, active, view);
  // The same screen told something new (Settings, with a section): the
  // entry is refreshed in place, never repeated.
  if (viewId(currentView(tab)) === viewId(view)) {
    if (currentView(tab) === view) return { tabs, active };
    const views = tab.views.map((v, i) => (i === tab.at ? view : v));
    return { tabs: tabs.map((t, i) => (i === active ? { ...t, views } : t)), active };
  }

  const views = [...tab.views.slice(0, tab.at + 1), view];
  return {
    tabs: tabs.map((t, i) => (i === active ? { views, at: views.length - 1 } : t)),
    active,
  };
}

export function back(tabs, active) {
  const tab = tabs[active];
  if (!canGoBack(tab)) return { tabs, active };
  return {
    tabs: tabs.map((t, i) => (i === active ? { ...t, at: t.at - 1 } : t)),
    active,
  };
}

export function forward(tabs, active) {
  const tab = tabs[active];
  if (!canGoForward(tab)) return { tabs, active };
  return {
    tabs: tabs.map((t, i) => (i === active ? { ...t, at: t.at + 1 } : t)),
    active,
  };
}

/// Closes a tab. The last one is never closed — an app with no tab open has
/// nothing to show and no way back.
export function close(tabs, active, index) {
  if (tabs.length <= 1) return { tabs, active };

  const next = tabs.filter((_, i) => i !== index);
  // Closing the tab you are on lands you on its neighbour; closing one to
  // the left keeps you where you were.
  let at = active;
  if (index < active) at = active - 1;
  else if (index === active) at = Math.min(active, next.length - 1);
  return { tabs: next, active: at };
}

/// Moves a tab, keeping the same one focused.
export function move(tabs, active, from, to) {
  if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) {
    return { tabs, active };
  }
  const next = movedItem(tabs, from, to);

  // Follow the tab the user was on, wherever it ended up.
  let at = active;
  if (active === from) at = to;
  else if (from < active && to >= active) at = active - 1;
  else if (from > active && to <= active) at = active + 1;
  return { tabs: next, active: at };
}

/// Replaces the view of whichever tab is showing `fromId` — a document renamed
/// under an open tab: the tab follows the file.
export function replaceView(tabs, fromId, view) {
  return tabs.map((tab) => {
    if (viewId(currentView(tab)) !== fromId) return tab;
    const views = [...tab.views];
    views[tab.at] = view;
    return { ...tab, views };
  });
}
