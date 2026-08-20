// Whether Android lets this app open the user's own folders.
//
// WHY THIS IS NOT A TAURI COMMAND — the answer belongs to the Activity: it is
// the Activity that starts the Settings screen where the permission is
// granted, and the Activity that hears the result. Reaching it from Rust would
// mean JNI for two booleans. Instead `MainActivity` hangs a small object on the
// page (`window.JottAndroid`), which is the mirror image of the CSS variables
// it already writes down the same WebView.
//
// WHY THE PERMISSION AT ALL — the notebook is a folder of .md files that a
// sync client reads. An app's own external container
// (`Android/data/<package>`) cannot be read by any OTHER app since Android 11,
// and stays unreadable even to one holding all-files access, because that path
// is carved out of the permission. The Storage Access Framework, the other way
// out, answers with a `content://` URI that `std::fs` cannot open — and the
// core speaks `std::fs` throughout. This is the same trade Obsidian makes.
//
// Everywhere that is not Android there is no bridge and nothing to ask: the
// desktop opens the system's own folder picker.

const bridge = () => (typeof window === "undefined" ? undefined : window.JottAndroid);

/// `"granted"`, `"denied"`, or `"notNeeded"` where the platform never asks.
export function storageAccess() {
  const android = bridge();
  if (!android?.granted) return "notNeeded";
  try {
    return android.granted() ? "granted" : "denied";
  } catch {
    // A bridge that throws is a bridge that cannot answer; treating that as
    // "no permission needed" keeps the app usable in its private folder rather
    // than stranding it on a screen whose only button does nothing.
    return "notNeeded";
  }
}

/// Opens the system screen where the permission is granted. Answers nothing:
/// the user leaves the app to decide, and the Activity fires
/// `android-storage-changed` on the way back (see `watchStorageAccess`).
export function requestStorageAccess() {
  bridge()?.request?.();
}

/// Calls `fn` whenever the answer may have changed. Returns the unsubscribe.
export function watchStorageAccess(fn) {
  if (typeof document === "undefined") return () => {};
  const listener = () => fn(storageAccess());
  document.addEventListener("android-storage-changed", listener);
  return () => document.removeEventListener("android-storage-changed", listener);
}

/// Opens the SYSTEM's folder chooser and answers what came back:
/// `{ cancelled }` when the user backed out, `{ path }` when the folder is one
/// the core can open, and `{}` when neither — a folder on a volume the
/// Activity could not turn into a path, where the caller falls back to the
/// app's own browser.
///
/// WHY THE SYSTEM PICKER AT ALL, given that the Storage Access Framework
/// answers with a `content://` URI the core cannot open (which is why the
/// in-app browser exists): the URI is used only to NAME the folder. The
/// Activity converts it back to a path and proves the path is readable and
/// writable before answering, which is sound precisely because the app already
/// holds all-files access. What was missing was never the access — it was the
/// screen a phone user expects when an app asks where to keep its files (user
/// report on device, 2026-08-20).
///
/// Answers `null` where there is no bridge at all, so a caller can tell "the
/// platform does not do this" from "the user said no".
export function pickFolderNatively() {
  const android = bridge();
  if (!android?.pickFolder) return Promise.resolve(null);
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (event) => {
      document.removeEventListener("android-folder-picked", done);
      resolve(event.detail ?? {});
    };
    document.addEventListener("android-folder-picked", done);
    android.pickFolder();
  });
}

/// Calls `fn` when the on-screen keyboard goes away. Returns the unsubscribe.
///
/// Only the EDGE is reported, and only by Android: nothing in the page can see
/// this on its own — the three web answers are all inert inside a WebView, and
/// MainActivity says why at length. Dismissing the keyboard with the back
/// gesture is the case it exists for: without it the note kept the focus, the
/// caret went on blinking, and the formatting strip stayed floating above a
/// keyboard that was no longer there.
export function onKeyboardHidden(fn) {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("android-keyboard-hidden", fn);
  return () => document.removeEventListener("android-keyboard-hidden", fn);
}
