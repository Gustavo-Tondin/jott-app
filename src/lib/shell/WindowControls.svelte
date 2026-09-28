<script>
  // The window's own minimize / maximize / close — the window is frameless,
  // so these are the only ones. Which buttons, in what order,
  // on which side comes from the SYSTEM (`org.gnome.desktop.wm.preferences
  // button-layout`, read once at boot). A name the setting does not give is
  // not drawn; a name this build does not know is skipped, not guessed.
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { S } from "../services/strings.js";
  import Icon from "../components/Icon.svelte";

  let {
    /// The button names for this side, in order — `["minimize","close"]`.
    buttons = [],
  } = $props();

  const win = getCurrentWindow();

  const ACTIONS = {
    minimize: { icon: "minus", label: () => S.minimizeWindow, run: () => win.minimize() },
    maximize: { icon: "square", label: () => S.maximizeWindow, run: () => win.toggleMaximize() },
    close: { icon: "x", label: () => S.closeWindow, run: () => win.close() },
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
        <Icon name={ACTIONS[name].icon} size="0.875rem" />
      </button>
    {/each}
  </div>
{/if}
