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
