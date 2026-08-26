<script>
  // The document tabs, inside the title bar.
  //
  // Presentation only: every decision about what a tab *is* lives in
  // `tabs.js`, so this file can be read as "draw these, report gestures".
  import { S } from "../services/strings.js";
  import { currentView } from "./tabs.js";
  import { reorderable } from "../actions/reorder.js";
  import Icon from "../components/Icon.svelte";
  import { dotStyle } from "../services/accent.js";

  let {
    tabs = [],
    active = 0,
    titleOf,
    colorOf,
    onSelect,
    onClose,
    onOpenNew,
    onMove,
    /// Inside the bottom sheet, below 768px (shell/compact.js): the same tabs
    /// stacked instead of strung across a strip, because a phone has no strip
    /// to string them across. What changes is the AXIS — of the layout, of the
    /// reordering drag, and of the + at the end — not what a tab is.
    compact = false,
  } = $props();

  let bar;
  /// While closing with the mouse, tabs keep the width they had.
  ///
  /// This is the browser behaviour worth copying: the × of the next tab lands
  /// under the pointer that just clicked, so closing several in a row is one
  /// gesture instead of a hunt. Widths are released when the pointer leaves.
  let locked = $state(false);

  function closeAt(index) {
    if (bar && !compact && tabs.length > 2) {
      for (const el of bar.querySelectorAll(".tabs__item")) {
        el.style.width = `${el.getBoundingClientRect().width}px`;
      }
      locked = true;
    }
    onClose?.(index);
  }

  function unlock() {
    if (!locked) return;
    locked = false;
    for (const el of bar?.querySelectorAll(".tabs__item") ?? [])
      el.style.width = "";
  }

  // Middle click closes, the way it does everywhere else.
  function onAuxClick(event, index) {
    if (event.button === 1) {
      event.preventDefault();
      closeAt(index);
    }
  }

  // Reordering is the shared `reorderable` action (lib/actions/reorder.js): the
  // tabs are just its first user. It carries the tab under the pointer, glides
  // the others aside, and swallows the click a drag would otherwise fire — so a
  // plain click still selects, a drag only reorders.
</script>

<!-- The mouse handler lives on the wrapper, not on the tablist: attaching
     it to the role would make the list itself look interactive, when what is
     interactive are the tabs inside it. The wrapper is also a drag region, so
     the window moves when the pointer grabs the empty space between tabs. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="tabs"
  class:tabs--compact={compact}
  bind:this={bar}
  onmouseleave={unlock}
  data-tauri-drag-region={compact ? undefined : true}
>
  <!-- The list fills the strip, so its empty gaps are the likeliest place to
       grab the window when few tabs are open — it must be a drag region too.
       The tabs and buttons inside carry no such attribute, so they stay
       clickable and still reorder by native drag. -->
  <div
    class="tabs__list"
    role="tablist"
    data-tauri-drag-region={compact ? undefined : true}
    use:reorderable={{
      axis: compact ? "y" : "x",
      item: ".tabs__item",
      onReorder: onMove,
    }}
  >
    {#each tabs as tab, i (i)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="tabs__item"
        class:tabs__item--active={i === active}
        role="presentation"
        onauxclick={(e) => onAuxClick(e, i)}
      >
        <!-- The dot names the space the tab comes from by colour: strong
             on the active tab, faded on the rest. -->
        <span
          class="theme-dot tabs__dot"
          style={dotStyle(colorOf?.(currentView(tab)))}
          aria-hidden="true"
        ></span>
        <button
          class="tabs__label"
          role="tab"
          aria-selected={i === active}
          title={titleOf(currentView(tab))}
          onclick={() => onSelect?.(i)}
        >
          {titleOf(currentView(tab))}
        </button>
        {#if tabs.length > 1}
          <button
            class="theme-btn--icon tabs__close"
            aria-label={S.closeTab}
            onclick={() => closeAt(i)}
          >
            <Icon name="x-bold" size="0.75rem" />
          </button>
        {/if}
      </div>
    {/each}
  </div>

  {#if onOpenNew}
    <button
      class="tabs__add"
      class:theme-btn--icon={!compact}
      aria-label={S.newTab}
      onclick={() => onOpenNew?.()}
    >
      <Icon name="plus" size="1rem" />
      {#if compact}<span class="tabs__add-label">{S.newTab}</span>{/if}
    </button>
  {/if}
</div>
