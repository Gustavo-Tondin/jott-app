// The pill of a segmented control, gliding to the active item. Used on the
// TRACK (`<nav class="theme-segmented" use:segmented>`); items keep
// `theme-segmented__item--active`. It MEASURES the active item and writes
// `--seg-*` + `theme-segmented--glides` (buttons.css) — nothing at width 0
// (jsdom). Options: `memory`, so a rebuilt track starts where the old ended;
// `active`/`glides`, so a control that is not a segmented one (the week strip
// of the Home) borrows the movement without wearing the class.

const ACTIVE = ".theme-segmented__item--active";
const GLIDES = "theme-segmented--glides";

/// The state that takes the SPRING off the travel: an item flush with the
/// track's edge has no room for the overshoot, and on a track that scrolls
/// (the Home's week) that overshoot is simply cut off. A track that measures
/// nothing keeps the spring.
const AT_EDGE = "is-at-edge";

function atEdge(node, at) {
  const room = node.clientWidth;
  return !!room && (at.x <= 1 || at.x + at.w >= room - 1);
}

/// The four numbers the pill is drawn from, written onto the track.
function paint(node, glides, at) {
  node.style.setProperty("--seg-x", `${at.x}px`);
  node.style.setProperty("--seg-y", `${at.y}px`);
  node.style.setProperty("--seg-w", `${at.w}px`);
  node.style.setProperty("--seg-h", `${at.h}px`);
  node.classList.add(glides);
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
    // The curve is a CLASS and not a variable, and it settles one
    // `offsetWidth` before the move: a `var()` inside `transition` does not
    // reach the pseudo-element in time (docs/platform-gotchas.md).
    const edge = atEdge(node, at);
    if (edge !== node.classList.contains(AT_EDGE)) {
      node.classList.toggle(AT_EDGE, edge);
      void node.offsetWidth;
    }
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
