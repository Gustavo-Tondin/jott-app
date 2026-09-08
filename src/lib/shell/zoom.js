// The interface zoom (Ctrl+= / Ctrl+- / Ctrl+0): one `font-size` on the root
// scales everything, because every measure is `rem`. A MACHINE preference,
// like the sidebar's width — it answers to a monitor, not to a notebook. The
// rule lives here, DOM-free, so it is answered under test (cf. sidebarWidth.js).

import { clamp } from "../services/num.js";

/// The ladder. A ladder rather than a multiplier so the steps are the same
/// going up and coming back down, and so 100% is always reachable by
/// pressing the key.
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/// A zoom the app is willing to use. Clamped like the widths are, and for
/// the same reason: a value hand-edited into the preferences file must not
/// leave the app unusable with no way back to a readable size.
export const clampZoom = (z) =>
  clamp(z, ZOOM_STEPS[0], ZOOM_STEPS[ZOOM_STEPS.length - 1]);

/// One step along the ladder from `current`, in `direction` (±1). A value
/// off the ladder snaps to the first step at or above it, so stepping from
/// an odd stored zoom still lands on the ladder.
export function steppedZoom(current, direction) {
  const at = ZOOM_STEPS.indexOf(current);
  const from = at >= 0 ? at : ZOOM_STEPS.findIndex((z) => z >= current);
  return ZOOM_STEPS[clamp(from + direction, 0, ZOOM_STEPS.length - 1)];
}

/// The root `font-size` a zoom means — empty at 100%, so the stylesheet's
/// own base stays in charge. 16px is the browser's base, and the number
/// every `rem` token was written against (`styles/tokens.css`).
export const zoomFontSize = (zoom) => (zoom === 1 ? "" : `${16 * zoom}px`);
