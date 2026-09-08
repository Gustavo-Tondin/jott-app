// Whether to offer the app a place in the desktop's application menu. The
// bridge owns the facts (is there an entry to write, is one there, was the
// offer waved away); this owns the one POLICY question: does the launch show
// the offer? A module, like `update.js`, because the rule is worth a test.

import { api } from "./api.js";

/// The launch-time look: the state when there is something to OFFER, else
/// `null` (packaged install, entry present, refused, no such command). A
/// STALE entry is rewritten without asking — an in-place update replaces
/// only the `.AppImage`, and the user already said yes. Silent on failure.
export async function offerIfDue() {
  try {
    const state = await api.desktopEntryState();
    if (!state?.supported) return null;

    if (state.installed) {
      if (state.stale) await api.setDesktopEntry(true);
      return null;
    }
    if (state.dismissed) return null;
    return state;
  } catch {
    return null;
  }
}

/// Writes the entry. The click was the consent; the error is the caller's to
/// show, because the caller is what has somewhere to show it.
export function addToMenu() {
  return api.setDesktopEntry(true);
}

/// Takes it away again.
export function removeFromMenu() {
  return api.setDesktopEntry(false);
}

/// "No thanks" — remembered on this machine so the offer is made once.
export function dismiss() {
  return api.dismissDesktopEntry();
}
