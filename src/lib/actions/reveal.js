// `use:reveal` — marks an element `is-visible` once it has scrolled into
// view, so the sheet can let it arrive (the Timeline's rows rise and fade
// in as the reader scrolls, 2026-08-27).
//
// One IntersectionObserver per element, disconnected the moment it fires:
// the entrance happens once, and an element that scrolled back out does not
// leave again — a screen that keeps vanishing behind you is a screen that
// is hard to read. The motion itself is the sheet's (`timeline.css`), spelt
// in `--app-duration-*`, which is what makes a reader's reduced-motion
// setting turn it off without this file knowing.
//
// No observer (jsdom, an old engine): visible at once. An action that threw
// here would take every action mounted after it down with it — the same
// lesson `measure.js` learned.
export function reveal(node, options = {}) {
  const { margin = "0px 0px -10% 0px", enabled = true } = options;
  // Told not to (the Home's recap, one short block that is already on
  // screen): visible at once, the same as having no observer.
  if (!enabled || typeof IntersectionObserver !== "function") {
    node.classList.add("is-visible");
    return {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        node.classList.add("is-visible");
        observer.disconnect();
      }
    },
    { rootMargin: margin },
  );
  observer.observe(node);
  return {
    destroy() {
      observer.disconnect();
    },
  };
}
