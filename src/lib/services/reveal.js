// Shows where a file lives. The desktop spawns its file manager (the core
// turns a file into the folder around it). Android has nothing to spawn: the
// Activity asks the system's Files app to open the folder, and only where no
// app will is the path copied instead — said through `revealed`.

import { writable } from "svelte/store";

import { api } from "./api.js";
import { announce } from "./announce.js";
import { S } from "./strings.js";

const bridge = () => (typeof window === "undefined" ? undefined : window.JottAndroid);

/// `{ folder }` copied because nothing could open it, for the shell to say.
export const revealed = writable(null);

/// Whether folders open in the phone's Files app, which hides what a hidden
/// folder (`.jott/`) holds until "Show hidden files" is on in its ⋮ menu.
export function opensInFilesApp() {
  return typeof bridge()?.openFolder === "function";
}

/// Opens the folder that holds the root-relative `path` (empty: the notebook
/// root). Answers `"opened"` or `"copied"`.
export async function revealFolder(path = null) {
  const android = bridge();
  if (!android?.openFolder) {
    await api.openInFileManager(path);
    return "opened";
  }
  const folder = await api.folderPath(path);
  let opened = false;
  try {
    opened = android.openFolder(folder) === true;
  } catch (e) {
    console.warn("[jott] reveal: the Activity could not open the folder", e);
  }
  if (opened) return "opened";
  await navigator.clipboard.writeText(folder);
  // An object, so copying the same path twice is still news.
  revealed.set({ folder });
  announce(S.pathCopied);
  return "copied";
}
