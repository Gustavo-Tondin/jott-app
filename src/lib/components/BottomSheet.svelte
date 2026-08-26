<script>
  // A panel that rises from the bottom of the screen (mobile wireframes,
  // 2026-08-18) — what the right-hand panel and the tab strip become below
  // 768px, where there is no room beside the content for either of them.
  //
  // It is Modal's contract with a different position, and it keeps the two
  // rules that are easy to lose in a copy (see Modal.svelte):
  //
  //   - the scrim closes only on ITSELF, or a pointer-up inside the sheet
  //     would dismiss it;
  //   - Escape is SWALLOWED, so it does not also close whatever is behind.
  //
  // What it adds is the drag. The wireframe draws a grab handle at the top,
  // and a handle that cannot be grabbed is a lie about how the panel works —
  // so it is a real drag: pull it down past a third of its height and it goes,
  // let go short of that and it springs back. Pointer events, so it answers a
  // mouse on a narrow desktop window exactly as it answers a thumb.
  //
  // NOT a `<dialog>`: the sheet holds the task inspector, which stays usable
  // while the list behind it is still being read, and a modal dialog would
  // make everything behind it inert.
  //
  // It declares the CANVAS, the same call Modal makes and for the same reason:
  // a sheet is CONTENT — a task being edited, a list of open documents —
  // raised over the page, so it is made of the page's material rather than the
  // frame's. The wireframes draw it light on the factory theme, which is what
  // the canvas is.
  //
  // ON THE SCRIM, the outermost element, so it holds wherever the sheet is
  // mounted. Declared on the inner panel instead, the sheets rendered outside
  // `.window` (the tabs) sat in no region and `--app-scrim` resolved to
  // nothing — the veil was invisible and the page behind stayed lit.
  import { S } from "../services/strings.js";
  import { onBack } from "../services/back.js";

  let {
    /// What the sheet is called, for the screen reader.
    label = "",
    /// How tall it may grow, as a share of the screen. The wireframe draws the
    /// tab sheet short (it is a list of three) and the inspector tall (it is a
    /// form), so the caller says which it is.
    maxHeight = "72svh",
    /// The block hook of the caller, so a grep for the block finds markup and
    /// CSS together — the same pact Modal keeps.
    sheetClass = "",
    onClose,
    children,
  } = $props();

  /// How far the sheet has been pulled down, in px. Non-zero only during a
  /// drag: on release it either closes or returns to 0.
  let pulled = $state(0);
  let sheet = $state();
  let from = 0;

  /// Past this share of its own height, letting go closes it. A third is the
  /// figure both platforms' own sheets use: far enough that a shaky grip does
  /// not dismiss, near enough that the gesture does not feel like work.
  const DISMISS_AT = 1 / 3;

  // The same call Modal makes, for the same reason: a sheet is the thing a
  // back press should close, and this is where every sheet in the app passes
  // (services/back.js).
  $effect(() => onBack(() => (onClose?.(), true)));

  function onPointerDown(event) {
    // Ignore anything but the primary button/finger: a right-click on the
    // handle is a context menu, not a drag.
    if (event.button !== 0) return;
    from = event.clientY;
    pulled = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    // Downward only. Dragging up must not stretch the sheet past its top —
    // it has a height, and pulling it taller would uncover the gap below it.
    pulled = Math.max(0, event.clientY - from);
  }

  function onPointerUp(event) {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const height = sheet?.offsetHeight ?? 0;
    const far = height > 0 && pulled > height * DISMISS_AT;
    pulled = 0;
    if (far) onClose?.();
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="sheet-scrim"
  data-region="canvas"
  role="presentation"
  onpointerdown={(e) => e.target === e.currentTarget && onClose?.()}
  onkeydown={onKey}
>
  <div
    bind:this={sheet}
    class="sheet {sheetClass}"
    class:sheet--dragging={pulled > 0}
    role="dialog"
    aria-label={label}
    style="--sheet-max: {maxHeight}; --sheet-pulled: {pulled}px"
  >
    <!-- The handle is also a button: a drag is the only way to dismiss by
         gesture, and a gesture is not reachable from a keyboard or a screen
         reader. Tapping it closes. -->
    <button
      class="sheet__handle"
      aria-label={S.closeSheet}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onclick={() => onClose?.()}
    >
      <span class="sheet__grip" aria-hidden="true"></span>
    </button>
    <div class="sheet__body">
      {@render children()}
    </div>
  </div>
</div>
