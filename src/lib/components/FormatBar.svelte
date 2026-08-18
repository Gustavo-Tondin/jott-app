<script>
  // The formatting controls of an open note.
  //
  // One component, framed twice — the right panel on a desktop, a strip that
  // rides above the keyboard on a phone (user call, 2026-08-18). The same
  // shape the right panel already uses for the inspector and the suggestions:
  // what it HOLDS is written once, and where it sits is the shell's business.
  //
  // Every button presses the very command its chord presses. Not a lookalike:
  // the same function out of `markdownCommands.js`, found by the same id the
  // registry uses. That is what makes the tooltip honest — it reads the chord
  // bound RIGHT NOW, so it keeps telling the truth after a rebinding, which a
  // key written into the button never would.
  import Icon from "./Icon.svelte";
  import { COMMANDS } from "../services/commands.js";
  import { bound } from "../services/shortcuts.js";
  import { formatChord } from "../services/keys.js";
  import { S } from "../services/strings.js";

  let {
    /// `(id) => void` — run the command with this id against the open note.
    onRun,
    /// Laid out as a column (the desktop panel) or as a scrolling row (the
    /// strip above the keyboard).
    layout = "column",
  } = $props();

  /// The commands the panel draws, in registry order — the ones that named an
  /// icon. A command without one is reachable by key and by the settings
  /// screen; the panel is the shortlist of what a hand reaches for while
  /// writing, not a mirror of the list.
  const shown = COMMANDS.filter((command) => command.scope === "editor" && command.icon);

  /// `Bold [Ctrl+B]` — the name, and the chord when there is one.
  function hint(command) {
    const chord = $bound.get(command.id);
    return chord ? `${command.label()} [${formatChord(chord)}]` : command.label();
  }
</script>

<div
  class="format-bar format-bar--{layout}"
  role="toolbar"
  aria-label={S.formatting}
  aria-orientation={layout === "row" ? "horizontal" : "vertical"}
>
  {#each shown as command (command.id)}
    <button
      type="button"
      class="theme-btn--icon format-bar__button"
      title={hint(command)}
      aria-label={hint(command)}
      aria-keyshortcuts={$bound.get(command.id) ?? undefined}
      onclick={() => onRun?.(command.id)}
    >
      <Icon name={command.icon} size="1.125rem" />
    </button>
  {/each}
</div>
