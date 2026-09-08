// `use:keepOnScreen` on a popover's panel: portaled to <body> and placed
// `fixed` at its anchor (the original parent, which also carries
// `dismissable`), clamped inside an 8px margin, opening ABOVE when there is no
// room under — and room stops at the on-screen keyboard (`--app-keyboard`).
// The panel keeps `data-popout` + `__popoutAnchor` so `dismissable` finds it.

const MARGIN = 8;
const GAP = 4;

/// The keyboard's cover of the window, from `--app-keyboard` (shell/keyboard.js):
/// inside an Android WebView no browser measurement reports it. Zero elsewhere.
function keyboardInset() {
  if (typeof getComputedStyle !== "function") return 0;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-keyboard")
    .trim();
  return Number.parseFloat(value) || 0;
}

export function keepOnScreen(node, params) {
  const anchor = node.parentElement;
  // Where the panel grows from its anchor: under it (a dropdown, the default)
  // or beside it (a submenu, which must not cover the row that opened it).
  const beside = params?.side === "inline";
  // A box the panel must clear (by selector, from the anchor) in the axis it
  // OPENS in, staying lined up with the button in the other: a button inside a
  // padded bar ends short of the bar's edge — in a rail as much as in a strip.
  const clears = params?.clears
    ? (anchor?.closest?.(params.clears) ?? null)
    : null;
  // The .theme-popover--end/--start intent survives the portal: it decides
  // which edge of the anchor the panel grows from.
  const endAligned = node.classList.contains("theme-popover--end");

  // Colour roles are inherited and <body> is in no region: carry the anchor's
  // region across, or the panel comes back in the wrong ink.
  const region = anchor?.closest?.("[data-region]")?.dataset.region;
  if (region) node.dataset.region = region;

  // Portal. Svelte tears the node down by detaching the node itself, so it
  // leaves cleanly from <body> too.
  node.dataset.popout = "";
  node.__popoutAnchor = anchor;
  document.body.appendChild(node);
  node.style.position = "fixed";
  // Neutralise the panel's own absolute-positioning contract in BOTH axes:
  // `place()` writes `top`, and a stylesheet `inset-block-end` left standing
  // over-constrains the box, so the browser solves the height to nothing.
  node.style.insetInlineStart = "auto";
  node.style.insetInlineEnd = "auto";
  node.style.insetBlockStart = "auto";
  node.style.insetBlockEnd = "auto";

  let raf = null;

  function place() {
    if (!anchor?.isConnected) return;
    const a = anchor.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    // jsdom (and a not-yet-laid-out mount) reports an empty rect.
    if (rect.width === 0 && rect.height === 0) return;

    // The bottom of the space a panel may use: the window, less whatever the
    // keyboard is covering.
    const floor = window.innerHeight - keyboardInset() - MARGIN;

    // The edges the panel opens from: the anchor's, pushed out to the box it
    // was told to clear.
    const c = clears?.isConnected ? clears.getBoundingClientRect() : null;
    const under = Math.max(a.bottom, c ? c.bottom : a.bottom);
    const over = Math.min(a.top, c ? c.top : a.top);

    let left = endAligned ? a.right - rect.width : a.left;
    let top = under + GAP;
    if (beside) {
      // The inline twins of `under`/`over`, for the axis this panel opens in.
      const after = Math.max(a.right, c ? c.right : a.right);
      const before = Math.min(a.left, c ? c.left : a.left);
      left = after + GAP;
      top = a.top;
      // No room on the right: flip to the other side rather than being
      // clamped on top of the menu that opened it.
      if (left + rect.width > window.innerWidth - MARGIN) {
        left = before - GAP - rect.width;
      }
    } else if (top + rect.height > floor) {
      // No room UNDER the anchor: open upwards when there is room above —
      // clamping would slide the panel over its button, or under the keyboard.
      const above = over - GAP - rect.height;
      if (above >= MARGIN) top = above;
    }
    left = Math.min(left, window.innerWidth - MARGIN - rect.width);
    left = Math.max(MARGIN, left);
    top = Math.min(top, floor - rect.height);
    top = Math.max(MARGIN, top);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }

  function schedule() {
    if (typeof requestAnimationFrame !== "function") return place();
    if (raf != null) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      place();
    });
  }

  // Now, for the first paint; scheduled again for anything layout settles
  // late (fonts, the panel's own content growing).
  place();
  schedule();
  const observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  observer?.observe(node);
  window.addEventListener("resize", schedule);
  // The anchor moves when anything scrolls (the sidebar, the content pane);
  // capture phase sees every scroll container.
  window.addEventListener("scroll", schedule, true);
  // …and it moves when the KEYBOARD arrives, which fires no event: the one
  // signal is `--app-keyboard` being written on the root's style attribute.
  const roots =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(schedule)
      : null;
  roots?.observe(document.documentElement, { attributeFilter: ["style"] });

  return {
    destroy() {
      observer?.disconnect();
      roots?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (raf != null && typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(raf);
      // The portal orphaned the node from the subtree Svelte tears down —
      // when the unmount removes an ancestor, nobody would remove the panel
      // sitting in <body>. Leave nothing behind.
      node.remove();
    },
  };
}
