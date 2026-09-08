<script>
  // The right-click menu: the same rows `Menu` draws (`MenuItems`), opened AT
  // THE POINTER. A component of its own because the two differ in where the
  // panel goes and what opens it; `.theme-popover`, `dismissable` and the
  // item shapes are shared. Open by handing `at` a point; null closes.
  import { dismissable } from "../actions/dismissable.js";
  import { portal } from "../actions/portal.js";
  import { onBack } from "../services/back.js";
  import { clamp } from "../services/num.js";
  import MenuItems from "./MenuItems.svelte";

  let {
    /// `{ x, y }` in client coordinates, or null when closed.
    at = null,
    items = [],
    onClose,
    /// Which region's colours to wear, for an instance mounted OUTSIDE every
    /// region (the canvas menu is rendered at the top of the app, so a scrolling
    /// panel cannot clip it): there `--app-surface`/`--app-line` resolve to
    /// nothing. An instance inside a region leaves this unset and inherits.
    region = undefined,
  } = $props();

  // PORTALED to <body> (`use:portal`): `position: fixed` is measured against
  // the viewport only while no ancestor carries a transform, and the mobile
  // drawer slides with `translate`. Kept inside the window by hand, not with
  // `keepOnScreen`: that action anchors to a trigger, and the pointer IS the anchor.
  const MARGIN = 8;
  let panel = $state(null);
  let placed = $state(null);

  // An open menu is the first thing a back press should close — otherwise
  // back closes the DRAWER out from under the menu it opened. Registered only
  // while the menu is open (services/back.js).
  $effect(() => (at ? onBack(() => (onClose?.(), true)) : undefined));

  $effect(() => {
    if (!at || !panel) {
      placed = null;
      return;
    }
    const r = panel.getBoundingClientRect();
    placed = {
      // The margin wins over the far edge when the panel is wider than the
      // window: the panel is cut on the right, never pushed off the left.
      x: clamp(at.x, MARGIN, Math.max(MARGIN, window.innerWidth - r.width - MARGIN)),
      y: clamp(at.y, MARGIN, Math.max(MARGIN, window.innerHeight - r.height - MARGIN)),
    };
  });
</script>

{#if at}
  <div
    bind:this={panel}
    class="theme-popover context-menu"
    data-region={region}
    use:portal
    style={`left: ${(placed ?? at).x}px; top: ${(placed ?? at).y}px`}
    use:dismissable={{ active: true, onDismiss: () => onClose?.() }}
  >
    <ul class="menu__list context-menu__list">
      <!-- Reopening somewhere else is a NEW menu even though the component
           stayed mounted: remounting the rows is what folds away the submenu
           the last visit left open. -->
      {#key at}
        <MenuItems
          {items}
          onChoose={(item, gesture) => {
            onClose?.();
            item.run?.(gesture);
          }}
        />
      {/key}
    </ul>
  </div>
{/if}
