// The system's own icon for a kind of file.
//
// A note can carry a video, a PDF, a spreadsheet — anything the library
// holds — and what the app can draw of one is a chip with its name. The chip
// reads better with the icon the desktop already uses for that kind of file
// (user call, 2026-08-19): it is the picture the person has been trained on
// by every file manager they have ever opened.
//
// Answered by the bridge (`commands::file_icon`), because only the system
// knows its own icon theme. `null` where there is no such thing — a phone, a
// desktop with no theme entry for that type — and the chip keeps the
// extension it drew for itself. Nothing here is essential; it is a nicety
// that must never be a failure.
//
// Cached by EXTENSION, not by file: the icon for `.pdf` is the icon for every
// PDF, and a note with twelve of them must not cross the bridge twelve times.

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
