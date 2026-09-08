// `use:reveal` — marks an element `is-visible` once it scrolls into view; the
// motion is the sheet's (`timeline.css`, in `--app-duration-*`, so reduced
// motion turns it off without this file knowing). Fires once, then
// disconnects: an element scrolled back out does not leave again. Without an
// IntersectionObserver (jsdom): visible at once, never a throw (see measure.js).
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
