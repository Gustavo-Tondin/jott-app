<script>
  // A reusable dropdown menu: you provide the trigger (a `trigger` snippet that
  // receives `{ open, toggle }`), and a flat list of `items` — each
  // `{ label, run, disabled? }`. Choosing an item closes the menu and runs it.
  //
  // Closes on outside pointer, and on Escape (swallowed, so it does not also
  // close whatever is behind it) — both from the `dismissable` action.
  //
  // What an item may carry, and how a row is drawn, is `MenuItems` — shared
  // with the right-click menu, which differs from this one only in where the
  // panel goes.
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
