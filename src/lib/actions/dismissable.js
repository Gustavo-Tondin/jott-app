// Closes a transient surface on outside pointerdown or Escape. Used on the
// popup's ROOT (trigger + panel) — else the trigger's own click reopens it:
//   <div use:dismissable={{ active: open, onDismiss: () => (open = false) }}>
// CAPTURE phase; Escape is swallowed so the surface behind stays; the
// listeners exist only while `active`, so the wrapper may stay mounted.

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
