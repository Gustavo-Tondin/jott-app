// Closing a transient surface — the one behaviour every popup in the app
// needs, as one reusable Svelte action (the sibling of `reorderable`).
//
// A menu, a colour palette, a tag picker, a calendar: each closes when the
// pointer goes down outside it, and when Escape is pressed. Four components
// wrote that out themselves, and the details are exactly where a copy drifts:
//
//   - CAPTURE phase, not bubble. A popup opened from inside the inspector has
//     to see the event before the shell does.
//   - Escape is SWALLOWED (stopPropagation). Without it, one Escape closes the
//     calendar *and* the inspector behind it — the edit the user was making.
//   - The listeners exist only while the surface is OPEN. A popup that keeps a
//     document listener after closing fires on every click for the rest of the
//     session.
//
// Used on the popup's ROOT — the wrapper holding both the trigger and the
// panel, not the panel alone:
//
//   <div use:dismissable={{ active: open, onDismiss: () => (open = false) }}>
//
// That matters. If "inside" were only the panel, clicking the trigger to close
// would count as an outside click: pointerdown closes it, the click that
// follows toggles it back open, and the popup never closes by its own button.
//
// `active` is what mounts and unmounts the listeners, so the action can live on
// a wrapper that is always in the DOM while the panel inside it comes and goes.

export function dismissable(node, params) {
  let opts = params ?? {};
  let listening = false;

  // "Inside" includes a panel that keepOnScreen portaled to <body>: the
  // click lands outside the wrapper's subtree, but the panel carries a way
  // back to its anchor — follow it (chains too, for a popup inside a popup).
  const isInside = (target) => {
    let el = target instanceof Element ? target : target?.parentElement;
    while (el) {
      if (node.contains(el)) return true;
      const portaled = el.closest("[data-popout]");
      if (!portaled) return false;
      el = portaled.__popoutAnchor;
    }
    return false;
  };

  const onPointerDown = (event) => {
    if (!isInside(event.target)) opts.onDismiss?.();
  };

  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    // Only this surface closes: whatever is behind it must not also react.
    event.stopPropagation();
    if (opts.preventDefault) event.preventDefault();
    opts.onDismiss?.();
  };

  function listen(should) {
    if (should === listening) return;
    listening = should;
    const bind = should ? "addEventListener" : "removeEventListener";
    document[bind]("pointerdown", onPointerDown, true);
    document[bind]("keydown", onKeyDown, true);
  }

  listen(opts.active !== false);

  return {
    update(next) {
      opts = next ?? {};
      listen(opts.active !== false);
    },
    destroy() {
      listen(false);
    },
  };
}
