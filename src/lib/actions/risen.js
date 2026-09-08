// `use:risen` — reports through `onRisen(bool)` when an element's top edge
// has risen UNDER the compact shell's floating top bar (topbar.css reads the
// flip). One hairline probe INSIDE the box (outside it is clipped away by
// `overflow: clip`) and an IntersectionObserver — no scroll listener, nothing
// moved. No observer (jsdom): nothing has risen, and nothing throws.
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
