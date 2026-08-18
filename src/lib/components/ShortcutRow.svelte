<script>
  // One line of the shortcuts table: what a command is called, and the key
  // that asks for it — click the key to record a new one.
  //
  // Recording is a real key press rather than a text field, because a chord is
  // not text: it has to survive being written down and read back the same
  // (`services/keys.js`), and asking someone to TYPE "Mod+Shift+F" would make
  // every spelling mistake a broken binding.
  import { chordOf, formatChord, isBindable } from "../services/keys.js";
  import { conflictOf } from "../services/commands.js";
  import { S } from "../services/strings.js";

  let { command, chord = null, bound, disabled = false, onBind } = $props();

  let recording = $state(false);
  let rejected = $state(null);

  function onKeydown(event) {
    // Escape leaves without changing anything — the one key that cannot be
    // recorded, because it is the way out of recording.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      recording = false;
      rejected = null;
      return;
    }

    const next = chordOf(event);
    // Modifiers alone are the way to a chord, not a chord: holding Ctrl to
    // reach Ctrl+Shift+F must not be recorded as anything.
    if (!next) return;

    if (!isBindable(next)) {
      rejected = S.shortcutNotBindable;
      return;
    }
    const clash = conflictOf(command.id, next, bound);
    if (clash) {
      rejected = S.shortcutTaken(clash.label());
      return;
    }
    recording = false;
    rejected = null;
    onBind?.(next);
  }
</script>

<div class="settings__row shortcut-row">
  <span class="settings__label">{command.label()}</span>

  <div class="shortcut-row__keys">
    {#if recording}
      <!-- svelte-ignore a11y_autofocus -->
      <button
        type="button"
        class="theme-btn theme-btn--outline theme-btn--xs shortcut-row__recording"
        autofocus
        onkeydown={onKeydown}
        onblur={() => ((recording = false), (rejected = null))}
        >{rejected ?? S.pressAKey}</button
      >
    {:else}
      <button
        type="button"
        class="theme-btn theme-btn--outline theme-btn--xs shortcut-row__chord"
        class:shortcut-row__chord--none={!chord}
        {disabled}
        title={S.changeShortcut}
        onclick={() => ((recording = true), (rejected = null))}
        >{chord ? formatChord(chord) : S.noShortcut}</button
      >
      {#if chord && !disabled}
        <button
          type="button"
          class="theme-btn--icon shortcut-row__clear"
          aria-label={S.clearShortcut}
          title={S.clearShortcut}
          onclick={() => onBind?.(null)}>×</button
        >
      {/if}
    {/if}
  </div>
</div>
