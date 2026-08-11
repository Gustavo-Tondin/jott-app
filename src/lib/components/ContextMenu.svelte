<script>
  // The right-click menu: the same list `Menu` draws, opened AT THE POINTER
  // instead of under a trigger.
  //
  // It is a separate component rather than a mode of `Menu` because the two
  // differ in the only thing `Menu` really owns — where the panel goes and what
  // opens it. Everything else is shared: `.theme-popover` for the surface, the
  // `dismissable` action for closing, and item shapes that read the same
  // (`label`, `context`, `disabled`, `run`, and `items` for a submenu).
  //
  // Open it by handing `at` a point; clear it to null to close.
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import Icon from "./Icon.svelte";

  let {
    /// `{ x, y }` in client coordinates, or null when closed.
    at = null,
    items = [],
    onClose,
  } = $props();

  let openSub = $state(null);

  // Reopening somewhere else must not show the submenu the last visit left
  // unfolded — the menu is new even though the component is not.
  $effect(() => {
    at;
    openSub = null;
  });

  function choose(item) {
    if (item.disabled) return;
    onClose?.();
    item.run?.();
  }

  const isSubmenu = (item) => Array.isArray(item.items);

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
      {#each items as item (`${item.context ?? ""}/${item.label}`)}
        <li class="menu__item">
          {#if isSubmenu(item)}
            <button
              class="menu__link menu__link--sub"
              disabled={item.disabled || item.items.length === 0}
              aria-expanded={openSub === item.label}
              onclick={() => (openSub = openSub === item.label ? null : item.label)}
            >
              <span class="menu__label">{item.label}</span>
              <Icon name="caret-right" size="0.75rem" />
            </button>
            {#if openSub === item.label}
              <ul
                class="theme-popover menu__list menu__sub"
                use:keepOnScreen={{ side: "inline" }}
              >
                {#each item.items as sub (sub.label)}
                  <li class="menu__item">
                    <button
                      class="menu__link"
                      disabled={sub.disabled}
                      onclick={() => choose(sub)}>{sub.label}</button
                    >
                  </li>
                {/each}
              </ul>
            {/if}
          {:else}
            <button class="menu__link" disabled={item.disabled} onclick={() => choose(item)}>
              {#if item.context}<span class="menu__context">{item.context}/</span>{/if}{item.label}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}
