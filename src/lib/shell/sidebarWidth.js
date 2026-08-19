// How wide the two side panels may be, and what a dragged value resolves to.
//
// The rule lives here rather than in the shell because it is the one part of
// the drag that has nothing to do with pointers: given a number from anywhere
// — the machine preferences file, a keyboard nudge, a pointer — what width
// does the app actually use? That question is answerable without a DOM, so it
// is answered under test.
//
// Pixels, not rem, on purpose: this is a real screen measurement, the same
// exception the resize grips and the drop zones make. Everything the CSS
// itself declares stays in rem.

/// The left sidebar. Narrower than the minimum and it stops being a sidebar:
/// the notebook name in the footer and the group rows have nowhere to go.
/// Wider than the maximum and the centre panel — the actual work — is the
/// side show. The default is what the stylesheet ships
/// (`--theme-sidebar-left`).
export const SIDEBAR = { min: 176, max: 480, default: 220 };

/// The right panel (task inspector / suggestions). Its floor is higher: it
/// holds a date picker and a row of controls, not a list of names. Default is
/// `--theme-sidebar-right`.
// The floor was 208 until 2026-08-19, and it was the width of one row of the
// formatting panel's six headings — so dragging the panel narrower simply
// stopped there and the panel read as un-resizable (user report). The bar
// wraps at any width; what a floor has to protect is the inspector's fields
// still being usable, and 176 is the same one the sidebar keeps.
export const PANEL = { min: 176, max: 560, default: 240 };

// Kept as named exports because they read better in the tests that guard the
// range, and because the shell asks for the sidebar's default by name.
export const MIN_SIDEBAR = SIDEBAR.min;
export const MAX_SIDEBAR = SIDEBAR.max;
export const DEFAULT_SIDEBAR = SIDEBAR.default;

/// A width the app is willing to use, or `null` when there is no answer.
///
/// `null` matters: it is what tells the shell to leave the CSS token alone
/// instead of pinning the panel to a number, so the stylesheet stays the
/// single source of the default.
export function clampWidth(value, limits = SIDEBAR) {
  const px = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof px !== "number" || !Number.isFinite(px)) return null;
  return Math.min(limits.max, Math.max(limits.min, Math.round(px)));
}

/// The width a drag lands on: where it started, plus how far the pointer went.
/// The right panel passes a negative travel for the same gesture, because its
/// handle is on the side the width grows away from.
export const draggedWidth = (startWidth, dx, limits = SIDEBAR) =>
  clampWidth(startWidth + dx, limits);
