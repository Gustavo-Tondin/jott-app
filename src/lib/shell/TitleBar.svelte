<script>
  // The custom title bar of a frameless window.
  //
  //   [ brand | tabs (children) | window controls ]
  //
  // The brand column is exactly as wide as the left sidebar below it — rail
  // included — so the tab strip starts where the centre panel starts. The tabs
  // then take everything up to the window controls (user call, 2026-08-06):
  // they are the widest thing in the bar, and the space they used to leave on
  // the right belonged to a panel that is often closed.
  //
  // The window is frameless (no OS decorations), so this bar is the ONLY way to
  // move, maximize or close the window — it renders even before a notebook is
  // open. Empty areas carry `data-tauri-drag-region`: the OS drags the window
  // by them and double-click maximizes, exactly like a native title bar.
  import WindowControls from "./WindowControls.svelte";

  let {
    children,
    /// The left sidebar is collapsed to its icon rail: the brand column follows
    /// it down, and the wordmark goes — it does not fit in 3.5rem, and the tabs
    /// would rather have the room.
    rail = false,
    /// Which window buttons go on each side, from the system.
    buttons = { left: [], right: ["minimize", "maximize", "close"] },
  } = $props();
</script>

<header class="titlebar" class:titlebar--rail={rail} data-tauri-drag-region>
  <div class="titlebar__brand" data-tauri-drag-region>
    <span class="titlebar__mark">J</span>
    {#if !rail}<span class="titlebar__wordmark">Jott</span>{/if}
  </div>

  <WindowControls buttons={buttons.left} />

  <div class="titlebar__tabs" data-tauri-drag-region>
    {@render children?.()}
  </div>

  <WindowControls buttons={buttons.right} />
</header>
