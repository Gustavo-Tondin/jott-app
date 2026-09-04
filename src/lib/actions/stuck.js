// `use:stuck={onChange}` — tells a STICKY element when it is pinned.
//
// The Home's collapsed head on a phone (wireframe "Home Screen Mobile -
// Scrolled Down", 2026-09-04): the dark head with the calendar scrolls away
// with the page, and a thin bar — the name of the place and the day — sticks
// under the floating top bar in its stead. Nothing in CSS says "I am stuck",
// so a sentinel is planted just before the element and watched: the moment
// the sentinel passes above the line the element pins to, the element is
// stuck, and the shell can turn the top bar's buttons light to sit on the
// canvas that now scrolls under them.
//
// The line is read off the element's own `top` (its sticky offset), and the
// root is the nearest scroller — the same walk the caret makes
// (services/caretScroll.js). No observer (jsdom): never stuck, which is the
// page at rest.
import { scrollableAround } from "../services/caretScroll.js";

export function stuck(node, onChange) {
  if (typeof IntersectionObserver !== "function") return {};
  const sentinel = document.createElement("span");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "display:block;block-size:0;";
  node.before(sentinel);

  const top = parseFloat(getComputedStyle(node).top) || 0;
  const observer = new IntersectionObserver(
    ([entry]) => {
      const line = (entry.rootBounds?.top ?? 0) + top;
      onChange?.(!entry.isIntersecting && entry.boundingClientRect.top < line);
    },
    { root: scrollableAround(node), rootMargin: `-${Math.round(top)}px 0px 0px 0px` },
  );
  observer.observe(sentinel);
  return {
    update(next) {
      onChange = next;
    },
    destroy() {
      observer.disconnect();
      sentinel.remove();
    },
  };
}
