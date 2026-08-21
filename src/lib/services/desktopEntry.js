// Whether to offer the app a place in the desktop's application menu.
//
// The bridge owns the facts — is there an entry to write at all, is one
// already there, was the offer waved away. This module owns the one POLICY
// question those three answer: does the launch show the offer?
//
// It is a module rather than three lines in `App.svelte` for the same reason
// `update.js` is: the rule is worth a test, and the screen that shows it
// should not be the place that decides it.

import { api } from "./api.js";

/// The launch-time look. Resolves to the state when there is something to
/// OFFER, and to `null` in every other case — a packaged install, an entry
/// that is already there and current, an offer already refused, or a bridge
/// that does not know the command (an older build, or the mobile bundle).
///
/// It also does one thing without asking: **refresh an entry that has gone
/// stale.** An in-place update replaces the `.AppImage` and nothing else, so a
/// version with a redrawn icon or a new name would leave every integrated
/// machine showing the old one forever. Rewriting it is not a new decision —
/// the user already said yes to being in the menu, and this is that same
/// answer applied to the current files. Silent for the same reason: there is
/// no question to ask.
///
/// Silent on failure like the update check: not being in the menu is not a
/// problem worth interrupting a launch over.
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
