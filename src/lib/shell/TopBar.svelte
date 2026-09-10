<script>
  // The compact shell's top bar: [ drawer ] [ ← → tabs ] [ ⋮ ]. A SEPARATE
  // component from TitleBar: it holds the drawer toggle and the page menu,
  // never brand or tab strip. The two end buttons are the same width, so
  // `space-between` centres the pill. A desktop window below 768px also gets
  // the window controls here — the only way to close a frameless window.
  import { S } from "../services/strings.js";
  import Icon from "../components/Icon.svelte";
  import PageMenu from "./PageMenu.svelte";
  import PageNav from "./PageNav.svelte";
  import WindowControls from "./WindowControls.svelte";

  let {
    canBack = false,
    canForward = false,
    onBack,
    onForward,
    /// Opens the sidebar drawer — the whole sidebar, presented differently.
    onOpenDrawer,
    /// Whether that drawer is already open. Then the button is HIDDEN, not
    /// removed: a button that leaves the row takes the pill's centring with
    /// it, and the whole bar shifts as the drawer opens.
    drawerOpen = false,
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
    /// The device owns the window frame (Android): no window buttons, and
    /// nothing to drag the window by. Anywhere else this bar has to carry both.
    mobile = false,
    /// Which window buttons go on each side, from the system — the same shape
    /// the title bar takes (shell/windowButtons.js).
    buttons = { left: [], right: ["minimize", "maximize", "close"] },
    /// Over the page rather than above it: the bar is lifted out of the flow
    /// and paints nothing, so the screen scrolls UNDER it and the buttons float
    /// on their own pills. Every screen asks; the page header reserves the
    /// bar's height itself (page-header.css).
    over = false,
    /// Which ground the bar's buttons sit on, and it CHANGES under them: the
    /// bar paints nothing, so the buttons wear what is behind them — the
    /// chrome at rest, the canvas once the page has risen under the bar. The
    /// flip is one attribute; the shell watches for it (App.svelte, actions/risen.js).
    region = "chrome",
  } = $props();
</script>

<!-- The drag region is what lets a narrow desktop window still be moved by its
     bar; on Android nothing reads the attribute and it costs nothing. -->
<header
  class="topbar"
  class:topbar--over={over}
  data-region={region}
  data-tauri-drag-region
>
  <!-- THE WINDOW'S BUTTONS ARE NOT PART OF THE SPREAD: the app's three
       controls share the width (that is what centres the pill); the window's
       sit outside it, at the edge. On Android neither renders. -->
  {#if !mobile}
    <WindowControls buttons={buttons.left} />
  {/if}

  <div class="topbar__controls">
    <button
      class="theme-btn theme-btn--icon topbar__button topbar__button--drawer"
      class:topbar__button--hidden={drawerOpen}
      aria-label={S.openSidebar}
      inert={drawerOpen}
      onclick={() => onOpenDrawer?.()}
    >
      <Icon name="sidebar-simple" size="1.125rem" />
    </button>

    <!-- One pill around back, forward and the tabs: all about WHICH PAGE you
         are on, as against the drawer (where you go) and the ⋮ (what you do). -->
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
  </div>

  {#if !mobile}
    <WindowControls buttons={buttons.right} />
  {/if}
</header>
