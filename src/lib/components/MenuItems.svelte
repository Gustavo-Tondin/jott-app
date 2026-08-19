<script>
  // The ROWS of a menu — everything both menus of the app have in common.
  //
  // `Menu` opens a panel under a trigger and `ContextMenu` opens one at the
  // pointer: that is the whole difference between them, and it lives in where
  // the panel goes. What an item IS — a label, an optional `context` drawn
  // ahead of it in grey, a `checked` mark for the chosen row of a choice
  // group, a `disabled` state, a `run`, or an `items` array that makes it a
  // submenu — was written out twice, forty lines each, and a change to one of
  // them (the submenu's flip, the composite key) had to be remembered in the
  // other.
  //
  // `checked` is tri-state on purpose: `true` draws the tick, `false` draws
  // the empty slot that keeps siblings aligned, `undefined` means the row is
  // not part of a choice group and gets no slot at all. Before it existed,
  // four callers spelled the mark four ways — two of them through `context`,
  // which renders with a trailing slash, so rows literally read "✓/Grid".
  //
  // It renders `<li>`s, not the list: the panel element is the host's, because
  // it is the host that anchors and positions it (`use:keepOnScreen`).
  //
  // `openSub` is per-mount on purpose. Both hosts mount this inside the block
  // that shows the panel, so reopening a menu always starts folded — no reset
  // effect on either side.
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import Icon from "./Icon.svelte";

  let {
    items = [],
    /// `(item) => void` — the host closes its panel and runs the item. A
    /// disabled row never reaches it.
    onChoose,
  } = $props();

  /// Which submenu is unfolded, by its label.
  let openSub = $state(null);

  const isSubmenu = (item) => Array.isArray(item.items);

  function choose(item) {
    if (item.disabled) return;
    onChoose?.(item);
  }
</script>

<!-- The key carries the `context` too: two same-named leaves (a notebook holds
     several lists called Inbox) would otherwise be one duplicate key, and
     Svelte aborts rendering the whole list. -->
{#each items as item (`${item.context ?? ""}/${item.label}`)}
  <li class="menu__item">
    {#if isSubmenu(item)}
      <!-- An empty submenu is a disabled row: "Move to" with nowhere to move
           says so, instead of opening nothing. -->
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
        <ul class="theme-popover menu__list menu__sub" use:keepOnScreen={{ side: "inline" }}>
          {#each item.items as sub (sub.label)}
            <li class="menu__item">
              <button class="menu__link" disabled={sub.disabled} onclick={() => choose(sub)}
                >{#if sub.checked !== undefined}<span class="menu__check"
                    >{sub.checked ? "✓" : ""}</span
                  >{/if}{sub.label}</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <button class="menu__link" disabled={item.disabled} onclick={() => choose(item)}>
        {#if item.checked !== undefined}<span class="menu__check">{item.checked ? "✓" : ""}</span
          >{/if}{#if item.context}<span class="menu__context">{item.context}/</span
          >{/if}{item.label}
      </button>
    {/if}
  </li>
{/each}
