<script>
  // The ROWS of a menu, shared by `Menu` (under a trigger) and `ContextMenu`
  // (at the pointer). An item: `{label, context?, checked?, disabled?, run?,
  // swatch?, items?}` — `items` makes a submenu. `checked` is tri-state: true
  // ticks, false keeps the empty slot so siblings align, undefined = no slot.
  // Renders `<li>`s only — the panel is the host's; `openSub` is per-mount.
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import Icon from "./Icon.svelte";

  let {
    items = [],
    /// `(item, gesture) => void` — the host closes its panel and runs the
    /// item; a disabled row never reaches it. `gesture` is `{newTab: true}`
    /// when the row was pressed with the MIDDLE button.
    onChoose,
  } = $props();

  /// Which submenu is unfolded, by its label.
  let openSub = $state(null);

  const isSubmenu = (item) => Array.isArray(item.items);

  function choose(item, gesture = {}) {
    if (item.disabled) return;
    onChoose?.(item, gesture);
  }

  /// The middle button on a row.
  function middle(event, item) {
    if (event.button !== 1) return;
    event.preventDefault();
    choose(item, { newTab: true });
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
              <button
                class="menu__link"
                disabled={sub.disabled}
                onclick={() => choose(sub)}
                onauxclick={(e) => middle(e, sub)}
                >{#if sub.checked !== undefined}<span class="menu__check"
                    >{sub.checked ? "✓" : ""}</span
                  >{/if}{#if sub.swatch}<span
                    class="theme-dot menu__swatch"
                    style={`--dot: ${sub.swatch}`}
                  ></span>{/if}{sub.label}</button
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
        onauxclick={(e) => middle(e, item)}
      >
        {#if item.checked !== undefined}<span class="menu__check">{item.checked ? "✓" : ""}</span
          >{/if}{#if item.swatch}<span
            class="theme-dot menu__swatch"
            style={`--dot: ${item.swatch}`}
          ></span>{/if}{#if item.context}<span class="menu__context">{item.context}/</span
          >{/if}{item.label}
      </button>
    {/if}
  </li>
{/each}
