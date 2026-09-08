// The pill of a segmented control, gliding from the old choice to the new one.
//
// Used on the TRACK:
//   <nav class="theme-segmented" use:segmented>
//     <button class="theme-segmented__item theme-segmented__item--active">…
//
// The control itself knows nothing about this action: each item still carries
// `theme-segmented__item--active`, and without the action (or before it has
// measured anything) that item is simply drawn solid, as it always was. What
// the action adds is a SECOND painting of the same fact — one pill, drawn by
// the track, that slides to wherever the active item is — and the class
// `theme-segmented--glides`, which tells controls/buttons.css to let the pill carry
// the colour and the item go transparent. Two things never say "active" at
// once: the pill is only drawn once it has been measured, and the item is
// only cleared once the pill is drawn.
//
// It MEASURES rather than counts. Three controls share this (the Tasks strip,
// the capture box's Task/Note, the option rows in Settings) and their items
// are not the same width — "Inbox" and "This week" are not — so the pill has
// to be told both where and how wide, in pixels, from the item itself.
//
// Three things move the pill, each watched separately:
//   - the active class changing hands     → a MutationObserver on the items
//   - the track changing size              → a ResizeObserver (a font loading,
//                                             the window narrowing, the
//                                             compact strip going full width)
//   - the items themselves being replaced  → the same MutationObserver, on
//                                             childList (Today switched off)
//
// Nothing here animates: the CSS transition on the pill does, and the first
// measurement arrives before the pill exists, so nothing slides in from the
// corner on mount.
//
// WHICH IS EXACTLY WRONG FOR A TRACK THAT IS REBUILT ON EVERY CLICK, and the
// Tasks screen is one: its strip is drawn by a snippet the screen hands to
// TasksSpace, and TasksSpace lives inside the `{#key sub}` that replaces the
// list on every tab (TasksView.svelte). The nav the user clicks is destroyed
// by that click, so the pill of the new one has no past to travel from and
// simply appears at the new tab — while the list behind it slides. Reported
// as "the animation only goes to the right" (user, on device, 2026-08-31).
//
// So the caller may hand this action a MEMORY: any object it owns and keeps
// across the rebuild. The action stashes the last geometry there, and a track
// that mounts finding a DIFFERENT one paints itself at the remembered place
// first, forces the layout, and only then moves — which is the same transition
// the surviving track gets, started by hand. Without a memory (every other
// segmented control in the app, all of which outlive their clicks) nothing
// about the behaviour changes.
//
// jsdom has no layout and no ResizeObserver (docs/platform-gotchas.md). With
// every width at zero the pill is never drawn, the item stays solid, and the
// screen tests see the control they always saw.

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
