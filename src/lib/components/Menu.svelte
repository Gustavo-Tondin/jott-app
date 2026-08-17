<script>
  // A reusable dropdown menu: you provide the trigger (a `trigger` snippet that
  // receives `{ open, toggle }`), and a flat list of `items` — each
  // `{ label, run, disabled? }`. Choosing an item closes the menu and runs it.
  //
  // Closes on outside pointer, on Escape (swallowed, so it does not also close
  // whatever is behind it), and whenever `items` identity changes.
  //
  // An item may also carry a `context`, drawn ahead of the label in a faded
  // grey: `Tasks/`**Inbox**. It is for the case where the label alone does not
  // identify the thing (a notebook holds several lists called "Inbox") but the
  // qualifier is not what you are reading — the leaf is (user call,
  // 2026-08-06). It counts toward the key, or two same-named leaves would be
  // one duplicate key and Svelte would abort the whole list.
  //
  // An item may instead carry `items: [...]` — a SUBMENU (2026-08-05). It shows
  // a caret and opens its own panel beside the row, which is what keeps a long
  // menu (sort by five things, move to any space) readable: the top level
  // stays a short list of decisions. An empty submenu is a disabled row —
  // "Move widget to" with nowhere to move says so instead of opening nothing.
  //
  // The first reusable menu in the app; PageHeader has its own inline one from
  // before this existed and can adopt this later.
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import Icon from "./Icon.svelte";

  let { items = [], align = "end", trigger } = $props();

  let open = $state(false);
  // Which submenu is unfolded (its label, or null). Reset with the menu, so
  // reopening never shows the panel the last visit left open.
  let openSub = $state(null);

  function toggle() {
    open = !open;
    openSub = null;
  }

  function close() {
    open = false;
    openSub = null;
  }

  function choose(item) {
    if (item.disabled) return;
    close();
    item.run?.();
  }

  const isSubmenu = (item) => Array.isArray(item.items);
</script>

<div class="menu" use:dismissable={{ active: open, onDismiss: close }}>
  {@render trigger({ open, toggle })}
  {#if open}
    <ul class="theme-popover theme-popover--{align} menu__list menu__list--{align}" use:keepOnScreen>
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
            <button
              class="menu__link"
              disabled={item.disabled}
              onclick={() => choose(item)}
            >
              {#if item.context}<span class="menu__context">{item.context}/</span>{/if}{item.label}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
