// Moves an element to <body>, out of reach of whatever was containing it —
// `use:portal` on a floating panel that has no anchor to be measured against.
//
// WHY A FLOATING PANEL CAN STILL BE TRAPPED. `position: fixed` is normally
// measured against the viewport, and that is what a menu opened at the pointer
// counts on: it is placed at the pointer's own client coordinates. But an
// ancestor carrying `transform`, `translate`, `filter` or `perspective`
// becomes the containing block for every fixed descendant — so the panel is
// then measured against THAT box, and clipped by it.
//
// Which is exactly what the mobile drawer does. It slides with `translate`
// (styles/components/shell.css), so the sidebar's right-click menu was being
// placed inside the drawer's 240px and cut off at its edge — half a word of
// "Rename" and nothing else (user report on device, 2026-08-20). No z-index
// reaches out of a containing block; only leaving it does.
//
// The sibling of the portal inside `keepOnScreen`, which solves the same
// problem for a panel that HAS an anchor (and has to keep measuring against
// it). This one is for a panel that carries its own coordinates.
//
//   <div class="theme-popover" use:portal style="left: …; top: …">
//
// Svelte tears a node down by detaching the node itself, so a portaled panel
// leaves <body> as cleanly as it would have left its original parent.

export function portal(node) {
  // The colour roles are INHERITED (styles/themes/*.css), and <body> is in no
  // region at all — a menu dropped there comes back with no ground and no ink
  // (the trap the drawer, the sheets and the format bar's folded panel each
  // document). So the region it was opened in travels with it, unless it was
  // told which one to wear.
  if (!node.dataset.region) {
    const region = node.parentElement?.closest?.("[data-region]")?.dataset.region;
    if (region) node.dataset.region = region;
  }

  document.body.appendChild(node);

  return {
    destroy() {
      node.remove();
    },
  };
}
