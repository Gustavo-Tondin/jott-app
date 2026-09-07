// `use:risen` — tells when an element's top edge has reached the top of the
// scroller it lives in, that is, when it has risen UNDER whatever floats
// there (the compact shell's top bar, App.svelte).
//
// It exists because the floating bar paints nothing: what shows behind its
// buttons is the ground the page happens to be standing on, and in the
// compact shell that ground changes as the page moves. At rest it is the
// chrome — the page header on every screen, the Home's head — and once the
// canvas has risen all the way it is the canvas. The buttons read the region
// the bar declares, so the whole flip is one attribute (topbar.css); this is
// the only thing that has to know WHEN.
//
// NO SCROLL LISTENER, and nothing here moves anything. A scroll handler lands
// a frame after the compositor has moved the page, which is why the Home's
// sheet is sticky and flow alone (shell.css) — but the question here is not
// "how far", it is a single crossing, and that is exactly what an
// IntersectionObserver answers: one callback at the edge, off the scroll path.
//
// THE PROBE IS INSIDE THE BOX. One hairline pinned at the element's own top,
// which is what makes the crossing observable without the observer having to
// be told the bar's height: the probe leaves the scrollport at the very
// moment the element's top edge does. It has to be INSIDE and not one pixel
// above, because the boxes this watches carry `overflow: clip` (the Home's
// sheet, an open note) — a probe outside the box is clipped away, and a
// clipped probe never intersects anything.
//
// No observer (jsdom, an old engine): nothing has risen. An action that threw
// here would take every action mounted after it down with it — the lesson
// `measure.js` learned.
export function risen(node, options = {}) {
  let current = options;
  let observer = null;
  let probe = null;

  const enabledIn = (o) => o.enabled ?? true;

  function stop() {
    observer?.disconnect();
    observer = null;
    probe?.remove();
    probe = null;
  }

  function start() {
    if (!enabledIn(current) || typeof IntersectionObserver !== "function") {
      current.onRisen?.(false);
      return;
    }
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    // Absolute against the node, which the compact canvas already is
    // (shell.css). Zero footprint in the flow, and transparent to a finger.
    probe.style.cssText =
      "position:absolute;inset-block-start:0;inset-inline:0;block-size:1px;pointer-events:none";
    node.append(probe);
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) current.onRisen?.(!entry.isIntersecting);
      },
      { root: current.root ?? null },
    );
    observer.observe(probe);
  }

  start();
  return {
    update(next) {
      // Svelte hands a fresh options object on every render; only the two
      // things the observer was BUILT from are worth tearing it down for.
      // The callback is read from `current` when it fires, so it is never
      // stale without a restart.
      const rebuild =
        next.root !== current.root || enabledIn(next) !== enabledIn(current);
      current = next;
      if (rebuild) {
        stop();
        start();
      }
    },
    destroy: stop,
  };
}
