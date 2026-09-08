// Whether Android lets this app open the user's own folders. Not a Tauri
// command: the Activity starts the Settings screen and hears the result, so
// `MainActivity` hangs `window.JottAndroid` on the page. The permission is
// needed because `Android/data/<package>` is unreadable to any other app and
// SAF answers `content://` URIs `std::fs` cannot open. See docs/platform-gotchas.md#android

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

/// Opens the SYSTEM's folder chooser: `{ cancelled }`, `{ path }` when the
/// folder is one the core can open, `{}` when the Activity could not turn the
/// volume into a path (the caller falls back to the app's own browser), and
/// `null` where there is no bridge at all. The SAF URI only NAMES the folder;
/// the Activity converts it to a path and proves it readable and writable first.
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
/// Only the EDGE is reported, and only by Android: nothing in the page can see
/// it inside a WebView (MainActivity says why). Without it the caret kept
/// blinking and the formatting strip floated over a keyboard no longer there.
export function onKeyboardHidden(fn) {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("android-keyboard-hidden", fn);
  return () => document.removeEventListener("android-keyboard-hidden", fn);
}
