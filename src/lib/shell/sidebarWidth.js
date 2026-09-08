// How wide the two side panels may be, and what a dragged value resolves to —
// answerable without a DOM, so answered under test. Pixels, not rem: a real
// screen measurement, the same exception the resize grips make.

import { clamp } from "../services/num.js";

/// The left sidebar. Below the floor the footer's notebook name and the group
/// rows have nowhere to go; past the ceiling the centre panel is the side
/// show. The default is the stylesheet's (`--app-sidebar-left`).
export const SIDEBAR = { min: 176, max: 480, default: 220 };

/// The right panel (task inspector / suggestions). The floor protects the
/// inspector's fields, not the formatting bar (which wraps at any width);
/// default is `--app-sidebar-right`.
export const PANEL = { min: 176, max: 560, default: 240 };

// Kept as named exports because they read better in the tests that guard the
// range.
export const MIN_SIDEBAR = SIDEBAR.min;
export const MAX_SIDEBAR = SIDEBAR.max;

/// A width the app is willing to use, or `null` when there is no answer —
/// which tells the shell to leave the CSS token alone, so the stylesheet stays
/// the single source of the default.
export function clampWidth(value, limits = SIDEBAR) {
  const px = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof px !== "number" || !Number.isFinite(px)) return null;
  return clamp(Math.round(px), limits.min, limits.max);
}

/// The width a drag lands on: where it started, plus how far the pointer went.
/// The right panel passes a negative travel for the same gesture, because its
/// handle is on the side the width grows away from.
export const draggedWidth = (startWidth, dx, limits = SIDEBAR) =>
  clampWidth(startWidth + dx, limits);
