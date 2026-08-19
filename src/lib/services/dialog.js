// A promise-based replacement for window.prompt (reestruturação 2026-07-30).
//
// WebKitGTK — the webview Tauri uses on Linux — does not implement
// window.prompt: it returns null, so every "name this" flow silently did
// nothing (the widget-creation bug). This is the app's own naming dialog:
// `await askName(...)` resolves to the typed string, or null on cancel, exactly
// like prompt did — but it actually works, and it is themeable.

import { writable } from "svelte/store";
import { S } from "./strings.js";

/// The single active request, or null. `NameDialog` renders from this.
export const nameRequest = writable(null);

/// Asks the user for a name. Resolves to the trimmed string, or null on cancel.
export function askName(title, value = "", { placeholder = "", confirm = "OK" } = {}) {
  return new Promise((resolve) => {
    nameRequest.set({ title, value, placeholder, confirm, resolve });
  });
}

/// The single active confirmation, or null. `ConfirmDialog` renders from this.
export const confirmRequest = writable(null);

/// The notebook settings that can turn a question off, and how to save one.
/// Installed once by the shell — the only thing that holds the notebook — so
/// any screen can ask without carrying settings down through props.
let policy = { settings: {}, save: () => {} };

export function setConfirmPolicy(next) {
  policy = { ...policy, ...next };
}

/// Asks the user to confirm something. Resolves to `true` or `false`.
///
/// **Replaces `window.confirm` for the same reason `askName` replaced
/// `window.prompt`** (2026-08-19): the system dialog is not the app's — it
/// cannot be themed, and it can say a title and nothing else. A question about
/// deleting has a second sentence to say: what breaks, and where the thing
/// goes.
///
///   - `detail` — the consequence, in the app's own words.
///   - `code` — one line set apart, for something to be READ rather than
///     prose: the host a download would contact.
///   - `danger` — what the confirming button is called. Never "OK"; the verb.
///   - `remember` — the notebook setting this question obeys, by key. Given
///     one, the dialog offers "don't ask again", and a question already turned
///     off is not asked at all. Only honest where the answer is undoable —
///     every delete in this app goes to the trash, and a download only ever
///     adds a file.
export function askConfirm(title, { detail = "", code = "", danger = "OK", remember = "" } = {}) {
  if (remember && policy.settings?.[remember] === false) return Promise.resolve(true);
  return new Promise((resolve) => {
    confirmRequest.set({
      title,
      detail,
      code,
      danger,
      remember,
      resolve(answer) {
        if (answer?.stopAsking && remember) policy.save(remember);
        resolve(!!answer?.ok);
      },
    });
  });
}

/// What every delete in this app says, because it is true of all of them:
/// nothing is destroyed. Written once — two screens were carrying a copy.
export const DELETING = {
  detail: S.goesToTrash,
  danger: S.deleteAction,
  remember: "confirmDeletes",
};

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
