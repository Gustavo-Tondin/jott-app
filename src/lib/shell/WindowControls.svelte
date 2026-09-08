<script>
  // The window's own minimize / maximize / close, Adwaita-style — the window
  // is frameless, so these are the only ones. Which buttons, in what order,
  // on which side comes from the SYSTEM (`org.gnome.desktop.wm.preferences
  // button-layout`, read once at boot). A name the setting does not give is
  // not drawn; a name this build does not know is skipped, not guessed.
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { S } from "../services/strings.js";

  let {
    /// The button names for this side, in order — `["minimize","close"]`.
    buttons = [],
  } = $props();

  const win = getCurrentWindow();

  const ACTIONS = {
    minimize: { label: () => S.minimizeWindow, run: () => win.minimize() },
    maximize: { label: () => S.maximizeWindow, run: () => win.toggleMaximize() },
    close: { label: () => S.closeWindow, run: () => win.close() },
  };

  // Guarded: this bar is the only way to close a frameless window, so a caller
  // handing over something that is not a list draws nothing instead of
  // throwing and taking the whole title bar with it.
  let shown = $derived((Array.isArray(buttons) ? buttons : []).filter((name) => name in ACTIONS));
</script>

{#if shown.length > 0}
  <div class="window-controls" data-tauri-drag-region>
    {#each shown as name (name)}
      <button
        class="window-controls__button window-controls__button--{name}"
        aria-label={ACTIONS[name].label()}
        title={ACTIONS[name].label()}
        onclick={ACTIONS[name].run}
      >
        <svg viewBox="0 0 16 16" class="window-controls__glyph" aria-hidden="true">
          {#if name === "minimize"}
            <line x1="4.5" y1="8" x2="11.5" y2="8" />
          {:else if name === "maximize"}
            <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
          {:else}
            <line x1="4.8" y1="4.8" x2="11.2" y2="11.2" />
            <line x1="11.2" y1="4.8" x2="4.8" y2="11.2" />
          {/if}
        </svg>
      </button>
    {/each}
  </div>
{/if}
