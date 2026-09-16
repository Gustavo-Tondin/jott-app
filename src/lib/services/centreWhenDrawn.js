// Bringing something the app just navigated to into the middle of its
// scroller. The target is usually not drawn yet — the screen reads its files
// first — so the selector is looked for on each frame for a while, and the
// first match is centred once.

/// How long to keep looking before giving up: a slow read on the phone, not
/// a screen that never draws the element.
export const CENTRE_WAIT_MS = 1500;

/// Centres the first element matching `selector` as soon as it exists.
/// Returns a function that stops looking.
export function centreWhenDrawn(selector, { root = document, wait = CENTRE_WAIT_MS } = {}) {
  const until = performance.now() + wait;
  let frame = 0;
  const look = () => {
    const target = root.querySelector(selector);
    if (target) {
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      target.scrollIntoView?.({ block: "center", behavior: still ? "auto" : "smooth" });
      return;
    }
    if (performance.now() < until) frame = requestAnimationFrame(look);
  };
  frame = requestAnimationFrame(look);
  return () => cancelAnimationFrame(frame);
}
