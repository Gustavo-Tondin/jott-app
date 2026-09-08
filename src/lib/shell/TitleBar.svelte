<script>
  // The custom title bar of a frameless window: [ brand | tabs | controls ].
  // The brand column is exactly as wide as the sidebar below it, rail
  // included, so the tabs start where the centre panel starts and take all
  // the room up to the window controls. This bar is the ONLY way to move or
  // close the window (it renders before a notebook is open): `data-tauri-drag-region`.
  import WindowControls from "./WindowControls.svelte";
  // The drawn logo. Both files are authored white and rewritten to
  // `fill: currentColor`, so the brand takes the theme's ink.
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
    /// Whether the bar draws the logo at all. Off on the notebooks screen,
    /// where the logo IS the screen; the column stays (it is as wide as the
    /// sidebar, and the window is dragged by it), holding nothing.
    brand = true,
  } = $props();
</script>

<header class="titlebar" class:titlebar--rail={rail} data-tauri-drag-region>
  <!-- Full logo when there is room, the mark alone on the rail: the wordmark
       does not fit in 3.5rem, and the J is the same shape either way. One or
       the other, never both — the word is already inside the full one. -->
  <div class="titlebar__brand" data-tauri-drag-region aria-label="Jott">
    {#if !brand}
      <!-- nothing: the screen below is drawing the logo itself -->
    {:else if rail}
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
