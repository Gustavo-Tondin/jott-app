// The pill of a segmented control, gliding to the active item. Used on the
// TRACK (`<nav class="theme-segmented" use:segmented>`); items keep
// `theme-segmented__item--active`. It MEASURES the active item and writes
// `--seg-*` + `theme-segmented--glides` (buttons.css) — nothing at width 0
// (jsdom). Options: `memory`, so a rebuilt track starts where the old ended;
// `active`/`glides`, so a control that is not a segmented one (the week strip
// of the Home) borrows the movement without wearing the class.

const ACTIVE = ".theme-segmented__item--active";
const GLIDES = "theme-segmented--glides";

/// The four numbers the pill is drawn from, written onto the track.
function paint(node, glides, at) {
  const fresh = !node.classList.contains(glides);
  node.style.setProperty("--seg-x", `${at.x}px`);
  node.style.setProperty("--seg-y", `${at.y}px`);
  node.style.setProperty("--seg-w", `${at.w}px`);
  node.style.setProperty("--seg-h", `${at.h}px`);
  node.classList.add(glides);
  if (fresh) place(node);
}

/// A pill that has just appeared is PLACED, not flown in: WebKit transitions
/// a new `::before` from the initial `translate`, the track's corner. The
/// layout read makes the transition exist so it can be finished.
function place(node) {
  if (typeof node.getAnimations !== "function") return;
  void node.offsetWidth;
  for (const anim of node.getAnimations({ subtree: true })) {
    if (anim.effect?.target === node && anim.effect.pseudoElement === "::before") anim.finish();
  }
}

const sameSpot = (a, b) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export function segmented(node, options = {}) {
  const { memory = null, active = ACTIVE, glides = GLIDES } = options;

  function measure({ fromMemory = false } = {}) {
    const item = node.querySelector(active);
    const w = item?.offsetWidth ?? 0;
    if (!item || !w) {
      node.classList.remove(glides);
      return;
    }
    const at = { x: item.offsetLeft, y: item.offsetTop, w, h: item.offsetHeight };
    // A rebuilt track starts where the old one ended, so the browser has a
    // value to transition FROM. Reading `offsetWidth` between the two paints
    // is what makes them two style resolutions rather than one — without it
    // the browser only ever sees the second, which is the jump this avoids.
    if (fromMemory && memory?.at && !sameSpot(memory.at, at)) {
      paint(node, glides, memory.at);
      void node.offsetWidth;
    }
    paint(node, glides, at);
    if (memory) memory.at = at;
  }

  measure({ fromMemory: true });

  // The track's OWN class is what `measure` writes, and writing an attribute
  // is a mutation even when the value does not change — observing it would
  // loop. Only the items are watched; the track's own attributes are ours.
  const classes = new MutationObserver((records) => {
    if (records.some((r) => r.target !== node || r.type === "childList")) measure();
  });
  classes.observe(node, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  const size =
    typeof ResizeObserver === "function" ? new ResizeObserver(() => measure()) : null;
  size?.observe(node);

  return {
    destroy() {
      classes.disconnect();
      size?.disconnect();
    },
  };
}
