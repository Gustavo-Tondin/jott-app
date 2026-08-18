<script>
  // The screen's ⋮ — the page menu, wherever the page menu currently lives.
  //
  // Its own component for the same reason PageNav is: the desktop header holds
  // it, and the compact top bar holds it below 768px. What travels with it, and
  // is the reason it must not be copied, is the rule below about `pageKey`.
  import { S } from "../services/strings.js";
  import Icon from "../components/Icon.svelte";
  import Menu from "../components/Menu.svelte";

  let {
    items = [],
    /// What page this menu belongs to. A menu left hanging over a screen the
    /// user has already left acts on the WRONG THING, so changing this rebuilds
    /// the menu, which closes it. Keyed here rather than inside Menu itself,
    /// because the app's other menus have no page to change under them.
    pageKey = "",
  } = $props();
</script>

<!-- The ⋮ is always drawn, even on a page that offers nothing yet: the bar is
     arrows · title · menu, and dropping one of the three leaves the row
     lopsided and the title adrift (user call, 2026-08-06). With no items it is
     plainly inert, not missing. -->
{#if items.length > 0}
  {#key pageKey}
    <Menu {items}>
      {#snippet trigger({ toggle })}
        <button
          class="theme-btn theme-btn--icon page-menu__toggle"
          aria-label={S.pageMenu}
          onclick={toggle}
        >
          <Icon name="dots-three" size="1.125rem" />
        </button>
      {/snippet}
    </Menu>
  {/key}
{:else}
  <button
    class="theme-btn theme-btn--icon page-menu__toggle"
    aria-label={S.pageMenu}
    disabled
  >
    <Icon name="dots-three" size="1.125rem" />
  </button>
{/if}
