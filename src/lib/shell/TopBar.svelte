<script>
  // The compact shell's top bar (mobile wireframes, 2026-08-18).
  //
  //   [ drawer ]        [ ← → tabs ]        [ ⋮ ]
  //
  // A SEPARATE COMPONENT FROM TitleBar, not the same bar restyled. The desktop
  // bar holds the brand, the tab strip and the window buttons; this one holds
  // none of the three and holds two things that bar never had — the drawer
  // toggle and the page menu, which below 768px have nowhere else to live. One
  // component trying to be both would branch in every slot it has.
  //
  // The three groups are laid out so the middle pill lands dead centre: the
  // two end buttons are the same width, so `space-between` centres it by
  // construction rather than by a magic number.
  //
  // On Android the bar also clears the status bar, which the system draws over
  // the app (every Android 15+ app is edge-to-edge whether it asks or not).
  // The padding for it is in CSS, from `env(safe-area-inset-top)`, so a
  // desktop window resolves it to zero and pays nothing.
  import { S } from "../services/strings.js";
  import Icon from "../components/Icon.svelte";
  import PageMenu from "./PageMenu.svelte";
  import PageNav from "./PageNav.svelte";

  let {
    canBack = false,
    canForward = false,
    onBack,
    onForward,
    /// Opens the sidebar drawer. The drawer is the whole sidebar, unchanged —
    /// it is only presented differently (user call: "o sidebar esquerdo fica
    /// basicamente igual").
    onOpenDrawer,
    /// Opens the tab sheet. Null while there is no notebook: with nothing open
    /// there are no tabs to show, and a button that opens an empty sheet is a
    /// button that lies.
    onOpenTabs = null,
    /// How many tabs are open, for the button's label — the sheet is the only
    /// place they are visible now, so the button has to say there is something
    /// behind it.
    tabCount = 0,
    /// The screen's own menu, the same items the desktop header's ⋮ holds.
    menu = [],
    pageKey = "",
  } = $props();
</script>

<header class="topbar" data-region="chrome">
  <button
    class="theme-btn theme-btn--icon topbar__button"
    aria-label={S.openSidebar}
    onclick={() => onOpenDrawer?.()}
  >
    <Icon name="sidebar-simple" size="1.125rem" />
  </button>

  <!-- One pill around the three travelling controls: back, forward, and the
       tabs. They are grouped because they are all about WHICH PAGE you are on,
       as against the drawer (where you go) and the ⋮ (what you do here). -->
  <div class="topbar__pill">
    <PageNav {canBack} {canForward} {onBack} {onForward} />
    {#if onOpenTabs}
      <button
        class="theme-btn theme-btn--icon topbar__button"
        aria-label={S.openTabs(tabCount)}
        onclick={() => onOpenTabs()}
      >
        <Icon name="tabs" size="1.125rem" />
      </button>
    {/if}
  </div>

  <PageMenu items={menu} {pageKey} />
</header>
