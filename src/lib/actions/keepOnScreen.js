// A floating panel that can never be clipped — `use:keepOnScreen` on the
// panel element of any popover (menus, pickers, calendars).
//
// Three problems, one action. (1) A popover inside a scroll container (the
// sidebar) is clipped by it wherever it is nudged — a scroll region always
// cuts its own overflow, so nudging is not enough (found in real use,
// 2026-08-04). The panel is PORTALED instead: moved to <body> and positioned
// `fixed` at its anchor's spot, out of reach of every ancestor overflow.
// (2) Near a window edge the panel is clamped back inside an 8px margin,
// which also covers the maximized window. (3) With no room under the anchor it
// opens ABOVE it rather than being clamped over it — and what counts as room
// stops at the top of the on-screen keyboard, which no browser measurement
// reports inside an Android WebView (see keyboardInset).
//
// The anchor is the panel's original parent — the popup wrapper that also
// carries `dismissable`. The panel keeps a way back to it (`data-popout` +
// `__popoutAnchor`), which is how `dismissable` still counts a click on the
// portaled panel as "inside" (see its isInside).

const MARGIN = 8;
const GAP = 4;

/// How much of the bottom of the window the on-screen keyboard is sitting on.
///
/// It has to be ASKED FOR: inside an Android WebView the keyboard shrinks
/// nothing the page can see — `innerHeight` and `visualViewport.height` both
/// stay at the full screen with the keyboard plainly covering the bottom third
/// (measured on the emulator, 2026-08-18). The activity publishes the inset it
/// reads from the window and the page turns it into `--theme-keyboard` on the
/// root (MainActivity.kt, shell/keyboard.js), and that token is the one place
/// a popover can learn about it. Zero everywhere else, every desktop
/// included.
function keyboardInset() {
  if (typeof getComputedStyle !== "function") return 0;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-keyboard")
    .trim();
  return Number.parseFloat(value) || 0;
}

export function keepOnScreen(node, params) {
  const anchor = node.parentElement;
  // Where the panel grows from its anchor: under it (a dropdown, the default)
  // or beside it (a submenu, which must not cover the row that opened it).
  const beside = params?.side === "inline";
  // A box the panel must clear, named by selector and looked up from the
  // anchor. It is cleared in whichever axis the panel OPENS in, and stays
  // lined up with the button in the other one — so the panel belongs to a
  // button and sits beside the whole thing that button is in. The format
  // bar's folded groups need it: a button inside a padded bar ends its box
  // 8px before the bar does, so a panel that cleared only the button opened
  // 4px UNDER the bar's own edge (user report, 2026-08-19; measured at -4px
  // in WebKitGTK). The same 4px lands INSIDE the bar when the bar is a
  // vertical rail and the panel opens sideways (2026-08-21), which is why
  // `clears` is not a block-axis rule.
  const clears = params?.clears
    ? (anchor?.closest?.(params.clears) ?? null)
    : null;
  // The .theme-popover--end/--start intent survives the portal: it decides
  // which edge of the anchor the panel grows from.
  const endAligned = node.classList.contains("theme-popover--end");

  // The portal drops the panel into <body>, out of the region it was opened
  // from — and with it every colour role, which is inherited (styles/themes/*.css).
  // A menu opened on the white canvas would come back painted in the black
  // chrome's ink. Carrying the anchor's region across is what keeps a panel
  // looking like the thing that opened it.
  const region = anchor?.closest?.("[data-region]")?.dataset.region;
  if (region) node.dataset.region = region;

  // Portal. Svelte tears the node down by detaching the node itself, so it
  // leaves cleanly from <body> too.
  node.dataset.popout = "";
  node.__popoutAnchor = anchor;
  document.body.appendChild(node);
  node.style.position = "fixed";
  // Neutralise the absolute-positioning contract the panel carries from its
  // own stylesheet; the fixed placement is written inline by place().
  //
  // BOTH AXES, and the block one is not decoration: `place()` writes `top`,
  // and a panel that also declares `inset-block-end` (the folded groups of the
  // format bar, which open UPWARDS from their button) ends up over-constrained
  // — top and bottom both set, height auto — so the browser solves for the
  // height and the box collapses. Measured in WebKitGTK, the app's own engine:
  // 40px of buttons became a 12px band of padding with the glyphs spilling out
  // of it (user report, 2026-08-19). Same for `inset-block-start`, since
  // `place()` positions by `top`.
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
      // No room UNDER the anchor: open upwards. Clamping instead — which is
      // what this did — slides the panel up over the button that opened it,
      // and on a phone it slid it under the keyboard, because the composer
      // that anchors it is itself pinned just above the keyboard (user report,
      // 2026-08-18). Only when there is room up there; otherwise the clamp
      // below is still the least bad answer.
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
  // …and it moves when the KEYBOARD arrives, which fires no event of its own:
  // the composer that anchors these panels is pinned above it, so it travels
  // half the screen while the panel would sit where it was opened. The one
  // signal there is, is `--theme-keyboard` being written onto the root
  // (shell/keyboard.js) — so the style attribute of that element is what is
  // watched. Costs nothing where nothing writes it.
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
