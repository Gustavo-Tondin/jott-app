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
  // ...WITH ONE EXCEPTION, and it is not a mobile one: on a DESKTOP window
  // dragged below 768px this bar replaces the title bar, and the title bar is
  // the only thing that can close a frameless window (user report,
  // 2026-08-18 — "os botões de fechar o app estão sumindo"). So the window
  // controls come along, on whichever side the system puts them, and the pill
  // gives up dead centre for them. On Android there are none: the OS owns the
  // window there, which is exactly what `mobile` answers (shell/platform.js).
  //
  // On Android the bar also clears the status bar, which the system draws over
  // the app (every Android 15+ app is edge-to-edge whether it asks or not).
  // The padding for it is in CSS, from `env(safe-area-inset-top)`, so a
  // desktop window resolves it to zero and pays nothing.
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
    /// Opens the sidebar drawer. The drawer is the whole sidebar, unchanged —
    /// it is only presented differently (user call: "o sidebar esquerdo fica
    /// basicamente igual").
    onOpenDrawer,
    /// Whether that drawer is already open. Then the button is HIDDEN, not
    /// removed (user call, 2026-08-18): the open drawer carries its own close
    /// button, and two of them end up side by side — but a button that leaves
    /// the row when it goes takes the pill's centring with it, and the whole
    /// bar shifts as the drawer opens.
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
  } = $props();
</script>

<!-- The drag region is what lets a narrow desktop window still be moved by its
     bar; on Android nothing reads the attribute and it costs nothing. -->
<header class="topbar" data-region="chrome" data-tauri-drag-region>
  <!-- THE WINDOW'S BUTTONS ARE NOT PART OF THE SPREAD (user call, 2026-08-18).
       The app's three controls share the width between them — that is what
       centres the pill — and the window's own buttons sit outside that
       sharing, at the very edge, with the app's last control up against them.
       Two containers, not one row of five: the app's controls keep their
       raised squares, the window's keep their discs, and only the app's ones
       move when the bar gets wider.

       On Android neither of these renders and the spread is the whole bar,
       exactly as the wireframe draws it. -->
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

    <!-- One pill around the three travelling controls: back, forward, and the
         tabs. They are grouped because they are all about WHICH PAGE you are
         on, as against the drawer (where you go) and the ⋮ (what you do
         here). -->
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
