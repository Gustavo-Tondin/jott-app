// A promise-based replacement for window.prompt (reestruturação 2026-07-30).
//
// WebKitGTK — the webview Tauri uses on Linux — does not implement
// window.prompt: it returns null, so every "name this" flow silently did
// nothing (the widget-creation bug). This is the app's own naming dialog:
// `await askName(...)` resolves to the typed string, or null on cancel, exactly
// like prompt did — but it actually works, and it is themeable.

import { writable } from "svelte/store";

/// The single active request, or null. `NameDialog` renders from this.
export const nameRequest = writable(null);

/// Asks the user for a name. Resolves to the trimmed string, or null on cancel.
export function askName(title, value = "", { placeholder = "", confirm = "OK" } = {}) {
  return new Promise((resolve) => {
    nameRequest.set({ title, value, placeholder, confirm, resolve });
  });
}

/// The single active "New task" request, or null. `NewTaskDialog` renders it.
export const taskRequest = writable(null);

/// Opens the New task popup (wireframe "New task popup.pdf", 2026-08-06) and
/// resolves to the INTENT the user composed — `{ text, list, due, repeat… }` —
/// or null if they closed it.
///
/// It stops at the intent on purpose: writing it is `taskCompose`'s job, so
/// every caller creates a task the same way whether it came from this dialog
/// or from the bar pinned to the Tasks screen.
export function askTask({ lists = [], defaultList = null, dateFormat, f } = {}) {
  return new Promise((resolve) => {
    taskRequest.set({ lists, defaultList, dateFormat, f, resolve });
  });
}
