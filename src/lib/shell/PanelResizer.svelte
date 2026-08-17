<script>
  // The draggable edge of a side panel — the sidebar's and the right panel's,
  // written once (2026-08-17).
  //
  // The two differ in three things and nothing else: which limits apply, which
  // neighbour is being measured, and which way the pointer's travel counts —
  // the right panel's handle sits on the side its width grows AWAY from. All
  // three follow from `sign`, so the caller only says which side it is on.
  //
  // A separator that can be MOVED is a widget, and ARIA has a name for it: a
  // focusable separator, which takes a value and the arrow keys. The linter
  // only knows the static kind, hence the two ignores below. Making it
  // operable from the keyboard is not politeness — without it the width is a
  // control only a mouse can reach.
  import { S } from "../services/strings.js";
  import { draggedWidth } from "./sidebarWidth.js";

  let {
    /// `{ min, max, default }` — SIDEBAR or PANEL.
    limits,
    /// `1` when the panel grows to the RIGHT of this handle (the sidebar),
    /// `-1` when it grows to the left (the right panel).
    sign = 1,
    /// The width right now, or null while it is whatever the stylesheet says.
    width = null,
    label = "",
    /// `(px) => void`, on every move of the gesture.
    onWidth,
    /// `(px) => void`, once, on release — the value worth remembering.
    onCommit,
    /// `(boolean) => void` — true for the length of a drag, so the shell can
    /// stop animating the widths while the pointer holds them.
    onResizing,
  } = $props();

  const neighbour = (handle) =>
    sign > 0 ? handle.previousElementSibling : handle.nextElementSibling;

  /// Grabs the edge. The pointer is captured by the handle, so the drag
  /// survives the pointer crossing into the panel it is resizing.
  function startResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    // Where it starts is how wide the panel ACTUALLY is right now — measured,
    // not assumed, because until the first drag the width comes from the
    // stylesheet.
    const startWidth =
      neighbour(handle)?.getBoundingClientRect().width ?? limits.default;
    const startX = event.clientX;
    handle.setPointerCapture?.(event.pointerId);
    onResizing?.(true);

    let latest = width;
    const move = (e) => {
      latest = draggedWidth(startWidth, sign * (e.clientX - startX), limits);
      onWidth?.(latest);
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      onResizing?.(false);
      // Once per drag, on release — not on every pointer move.
      if (latest) onCommit?.(latest);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  /// The same edge from the keyboard.
  function nudgeResize(event) {
    const step = event.shiftKey ? 32 : 8;
    const by = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    if (!by) return;
    event.preventDefault();
    const next = draggedWidth(width ?? limits.default, sign * by, limits);
    if (!next) return;
    onWidth?.(next);
    onCommit?.(next);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="shell__resizer"
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={width ?? limits.default}
  aria-valuetext={S.sidebarWidthValue(width ?? limits.default)}
  tabindex="0"
  onpointerdown={startResize}
  onkeydown={nudgeResize}
></div>
