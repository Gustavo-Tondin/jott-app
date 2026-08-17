<script>
  // The right-click menu: the same rows `Menu` draws (`MenuItems`), opened AT
  // THE POINTER instead of under a trigger.
  //
  // It stays a component of its own rather than a mode of `Menu` because the
  // two differ in the only thing a menu really owns — where the panel goes and
  // what opens it. Everything else is shared: `.theme-popover` for the
  // surface, `dismissable` for the closing, and the item shapes.
  //
  // Open it by handing `at` a point; clear it to null to close.
  import { dismissable } from "../actions/dismissable.js";
  import MenuItems from "./MenuItems.svelte";

  let {
    /// `{ x, y }` in client coordinates, or null when closed.
    at = null,
    items = [],
    onClose,
  } = $props();

  // Kept inside the window by hand rather than through `keepOnScreen`: that
  // action measures an element anchored to a trigger, and this one has no
  // trigger — the pointer IS the anchor.
  const MARGIN = 8;
  let panel = $state(null);
  let placed = $state(null);

  $effect(() => {
    if (!at || !panel) {
      placed = null;
      return;
    }
    const r = panel.getBoundingClientRect();
    placed = {
      x: Math.max(MARGIN, Math.min(at.x, window.innerWidth - r.width - MARGIN)),
      y: Math.max(MARGIN, Math.min(at.y, window.innerHeight - r.height - MARGIN)),
    };
  });
</script>

{#if at}
  <div
    bind:this={panel}
    class="theme-popover context-menu"
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
          onChoose={(item) => {
            onClose?.();
            item.run?.();
          }}
        />
      {/key}
    </ul>
  </div>
{/if}
