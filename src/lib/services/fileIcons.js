// The system's own icon for a kind of file, answered by the bridge
// (`commands::file_icon`). `null` where there is none (a phone, no theme entry)
// and the chip keeps the extension it drew for itself: a nicety that must never
// be a failure. Cached by EXTENSION, not by file — a note with twelve PDFs
// crosses the bridge once.

import { api } from "./api.js";
import { extensionOf } from "./paths.js";

const cache = new Map();

/// A `data:` URL for the system's icon, or `null`. Never rejects: a missing
/// icon is not an error the user should hear about.
export function fileIcon(name) {
  const kind = extensionOf(name);
  if (!kind) return Promise.resolve(null);
  if (!cache.has(kind)) {
    cache.set(
      kind,
      api
        .fileIcon(`file.${kind}`)
        .then((url) => url ?? null)
        .catch(() => null),
    );
  }
  return cache.get(kind);
}

/// Forgets what it learned — for tests, and for the day the icon theme
/// changes under a running app.
export function forgetIcons() {
  cache.clear();
}
