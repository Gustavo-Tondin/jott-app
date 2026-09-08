// Promise-based replacements for `window.prompt` and `window.confirm`.
// WebKitGTK does not implement `prompt` (it returns null), and the system
// `confirm` cannot be themed or say a second sentence. `askName` resolves to
// the typed string, or null on cancel, exactly like prompt did.

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

/// Asks the user to confirm. Resolves to `true` or `false`. `detail` is the
/// consequence; `code` one line set apart, to be READ; `danger` the verb on
/// the confirming button, never "OK"; `remember` the notebook setting this
/// question obeys, by key — a question already turned off is not asked.
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
/// nothing is destroyed.
export const DELETING = {
  detail: S.goesToTrash,
  danger: S.deleteAction,
  remember: "confirmDeletes",
};

/// The single active "New task" request, or null. `NewTaskDialog` renders it.
export const taskRequest = writable(null);

/// Opens the New task popup and resolves to the INTENT the user composed —
/// `{ text, list, due, repeat… }` — or null. It stops at the intent: writing
/// it is `taskCompose`'s job, so every caller creates a task the same way.
export function askTask({ lists = [], defaultList = null, dateFormat, f } = {}) {
  return new Promise((resolve) => {
    taskRequest.set({ lists, defaultList, dateFormat, f, resolve });
  });
}
