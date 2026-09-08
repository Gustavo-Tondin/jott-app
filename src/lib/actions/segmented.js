// The pill of a segmented control, gliding to the active item. Used on the
// TRACK (`<nav class="theme-segmented" use:segmented={memory}>`); items keep
// `theme-segmented__item--active`. It MEASURES the active item and writes
// `--seg-*` + `theme-segmented--glides` (buttons.css) — nothing at width 0
// (jsdom). With a `memory` object a rebuilt track starts where the old ended.

const ACTIVE = ".theme-segmented__item--active";
const GLIDES = "theme-segmented--glides";

/// The four numbers the pill is drawn from, written onto the track.
function paint(node, at) {
  node.style.setProperty("--seg-x", `${at.x}px`);
  node.style.setProperty("--seg-y", `${at.y}px`);
  node.style.setProperty("--seg-w", `${at.w}px`);
  node.style.setProperty("--seg-h", `${at.h}px`);
  node.classList.add(GLIDES);
}

const sameSpot = (a, b) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export function segmented(node, memory) {
  function measure({ fromMemory = false } = {}) {
    const item = node.querySelector(ACTIVE);
    const w = item?.offsetWidth ?? 0;
    if (!item || !w) {
      node.classList.remove(GLIDES);
      return;
    }
    const at = { x: item.offsetLeft, y: item.offsetTop, w, h: item.offsetHeight };
    // A rebuilt track starts where the old one ended, so the browser has a
    // value to transition FROM. Reading `offsetWidth` between the two paints
    // is what makes them two style resolutions rather than one — without it
    // the browser only ever sees the second, which is the jump this avoids.
    if (fromMemory && memory?.at && !sameSpot(memory.at, at)) {
      paint(node, memory.at);
      void node.offsetWidth;
    }
    paint(node, at);
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
