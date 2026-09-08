// `use:portal` — moves a `fixed` panel that carries its own coordinates to
// <body>. An ancestor with `transform`/`translate`/`filter`/`perspective` is
// the containing block of every fixed descendant (the drawer slides with
// `translate`), and no z-index gets out of it — only leaving does.
// `keepOnScreen` is the sibling for a panel that has an anchor.

export function portal(node) {
  // Colour roles are inherited and <body> is in no region: the region the
  // panel was opened in travels with it, unless it names one.
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
