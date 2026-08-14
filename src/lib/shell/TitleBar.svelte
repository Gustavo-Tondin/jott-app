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
  // The drawn logo, not a letter in the UI font (2026-08-14). Both files are
  // authored white and rewritten to `fill: currentColor`, so the brand takes
  // the ink of whatever theme is on instead of only reading on a black frame.
  import mark from "../../assets/brand/mark.svg?raw";
  import wordmark from "../../assets/brand/wordmark.svg?raw";

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
  <!-- Full logo when there is room, the mark alone on the rail: the wordmark
       does not fit in 3.5rem, and the J is the same shape either way. One or
       the other, never both — the word is already inside the full one. -->
  <div class="titlebar__brand" data-tauri-drag-region aria-label="Jott">
    {#if rail}
      <span class="titlebar__mark" aria-hidden="true">{@html mark}</span>
    {:else}
      <span class="titlebar__wordmark" aria-hidden="true">{@html wordmark}</span>
    {/if}
  </div>

  <WindowControls buttons={buttons.left} />

  <div class="titlebar__tabs" data-tauri-drag-region>
    {@render children?.()}
  </div>

  <WindowControls buttons={buttons.right} />
</header>
