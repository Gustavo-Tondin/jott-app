<script>
  // A dropdown menu: the caller owns the trigger (a snippet receiving
  // `{ open, toggle }`) and passes `items`; choosing one closes the menu and
  // runs it. Closes on outside pointer and on Escape (swallowed, so it does
  // not also close what is behind it). Rows are `MenuItems`, shared with the
  // right-click menu.
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import MenuItems from "./MenuItems.svelte";

  let { items = [], align = "end", trigger } = $props();

  let open = $state(false);

  const toggle = () => (open = !open);
  const close = () => (open = false);
</script>

<div class="menu" use:dismissable={{ active: open, onDismiss: close }}>
  {@render trigger({ open, toggle })}
  {#if open}
    <ul
      class="theme-popover theme-popover--{align} menu__list menu__list--{align}"
      use:keepOnScreen
    >
      <MenuItems
        {items}
        onChoose={(item, gesture) => {
          close();
          item.run?.(gesture);
        }}
      />
    </ul>
  {/if}
</div>
