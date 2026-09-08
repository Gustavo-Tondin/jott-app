<script>
  // The ? beside a row, a subtitle or a section's title: the explanation a
  // setting needs, kept off the page until asked for. One popover per tip,
  // closed by a click outside or Escape (actions/dismissable.js), kept on
  // screen the way every other panel is.
  import { dismissable } from "../../actions/dismissable.js";
  import { keepOnScreen } from "../../actions/keepOnScreen.js";
  import { S } from "../../services/strings.js";
  import Icon from "../../components/Icon.svelte";

  let {
    /// What the tip is about — the row's own label, for the screen reader.
    label,
    /// One paragraph, or several.
    text,
  } = $props();

  let open = $state(false);
  let paragraphs = $derived(Array.isArray(text) ? text : [text]);

  // The trigger is a span in a button's role, not a <button>: the ? sits
  // INSIDE the row's <label>, where a <button> is a second labelled control
  // (invalid HTML, and two answers to "the switch called X"). The click is
  // cancelled so the label does not toggle its switch on the way.
  function toggle(event) {
    event.preventDefault();
    open = !open;
  }
  function onKey(event) {
    if (event.key === "Enter" || event.key === " ") toggle(event);
  }
</script>

<span
  class="settings__help"
  use:dismissable={{ active: open, onDismiss: () => (open = false) }}
>
  <span
    role="button"
    tabindex="0"
    class="theme-btn--icon settings__help-btn"
    class:settings__help-btn--open={open}
    aria-label={S.helpAbout(label)}
    aria-expanded={open}
    onclick={toggle}
    onkeydown={onKey}
  >
    <Icon name="question" size="1rem" />
  </span>
  {#if open}
    <div class="theme-popover theme-popover--start settings__help-panel" role="note" use:keepOnScreen>
      {#each paragraphs as paragraph}
        <p class="settings__help-paragraph">{paragraph}</p>
      {/each}
    </div>
  {/if}
</span>
