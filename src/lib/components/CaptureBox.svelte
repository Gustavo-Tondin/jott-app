<script>
  // The Home's capture box — the first thing on the screen, and the reason
  // Home exists (2026-08-13 wireframe "Home screen - default").
  //
  // ONE box for both halves of the app. Before this, Home asked twice: a "New
  // task" button in the tasks header opened a dialog, and a separate textarea
  // with a "save to" select sat down in the notes block. Two shapes, two
  // places, and neither was where the eye lands when the screen opens. Now the
  // question is asked once, at the top, and a segmented Task/Note says where
  // the answer goes.
  //
  // It stays deliberately thin: one line of text and a destination. Anything
  // with a due date, a repeat or a priority is a task the composer dialog
  // handles better, and the ⋮ of the block below still opens it.
  import Icon from "./Icon.svelte";
  import { S } from "../services/strings.js";
  import { dotStyle as dotStyleOf } from "../services/accent.js";

  let {
    /// `"task"` / `"note"` — which half is armed. Kept here, not by the host:
    /// nothing outside this box reacts to it until something is submitted.
    kind = $bindable("task"),
    /// The day, already formatted — shown at the top right, so the box says
    /// what "today" means without the header having to repeat it.
    date = "",
    /// The colour of the place, as a NAME (services/accent.js) — the dot after
    /// the title, the same mark the compact header draws (shell/PageHeader).
    /// Null on a space with no colour of its own: the CSS falls back to the
    /// app's accent.
    dot = null,
    /// Whether each half is reachable at all (a notebook may have notes or
    /// tasks switched off). With one of them off the segmented control goes
    /// away: a choice of one is not a choice.
    canTask = true,
    canNote = true,
    disabled = false,
    /// `({ kind, text }) => void` — the box clears itself only if this
    /// resolves, so a write that failed does not silently eat what was typed.
    onSubmit,
  } = $props();

  let text = $state("");
  let field = $state();

  /// The place's colour as CSS; unset falls back to the app's accent in the
  /// class itself (services/accent.js).
  let dotStyle = $derived(dotStyleOf(dot));

  // With only one half available it is the armed one, whatever `kind` says.
  let both = $derived(canTask && canNote);
  let armed = $derived(both ? kind : canTask ? "task" : "note");

  async function submit() {
    const clean = text.trim();
    if (!clean || disabled) return;
    await onSubmit?.({ kind: armed, text: clean });
    text = "";
    field?.focus();
  }

  /// Enter sends, Shift+Enter is a new line. A captured thought is almost
  /// always one line, and reaching for the button breaks the flow.
  function onKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }
</script>

<form
  class="capture"
  onsubmit={(e) => (e.preventDefault(), submit())}
>
  <!-- The head spans the WHOLE card, so the day lands on the card's right edge
       — the same edge the ＋ under it stands on (user call, 2026-08-18). Inside
       the body it stopped short by the button's width plus a gap, and read as
       floating in the middle of the row.

       It is named after the SCREEN, not after the question it asks (user call,
       2026-08-18): below 768px the header says "Home" over the same block, and
       one place cannot go by two names depending on the width of the window.
       The question survives as the segmented control's label, which is the one
       spot where it is still asking something. The dot beside it is the mark
       the compact header carries — the colour of where you are. -->
  <div class="capture__head">
    <h2 class="capture__question">
      {S.home}
      <span class="theme-dot" style={dotStyle} aria-hidden="true"></span>
    </h2>
    {#if date}<span class="capture__date">{date}</span>{/if}
  </div>

  <div class="capture__main">
  <div class="capture__body">
    <div class="capture__field">
      <!-- A square that says "this becomes a task", not a control: ticking it
           here would mean creating something already done. It is the tasks
           half's mark, so the notes half does not draw it. -->
      {#if armed === "task"}
        <span class="capture__mark" aria-hidden="true"></span>
      {:else}
        <Icon name="note" size="1.125rem" />
      {/if}
      <textarea
        bind:this={field}
        class="capture__input"
        rows="1"
        placeholder={armed === "task" ? S.newTaskPlaceholder : S.newNotePlaceholder}
        aria-label={armed === "task" ? S.newTask : S.newNoteAction}
        bind:value={text}
        {disabled}
        onkeydown={onKeydown}
      ></textarea>
    </div>

    {#if both}
      <div class="theme-segmented capture__kinds" role="group" aria-label={S.captureQuestion}>
        <button
          type="button"
          class="theme-segmented__item"
          class:theme-segmented__item--active={kind === "task"}
          aria-pressed={kind === "task"}
          onclick={() => (kind = "task")}>{S.task}</button
        >
        <button
          type="button"
          class="theme-segmented__item"
          class:theme-segmented__item--active={kind === "note"}
          aria-pressed={kind === "note"}
          onclick={() => (kind = "note")}>{S.note}</button
        >
      </div>
    {/if}
  </div>

  <!-- The one loud thing on the screen. It is square and large because it is
       the box's verb: everything to its left is what you are about to make. -->
  <button
    type="submit"
    class="capture__submit"
    disabled={disabled || !text.trim()}
    aria-label={S.captureAction(armed)}
    title={S.captureAction(armed)}
  >
    <Icon name="plus-bold" size="1.5rem" />
  </button>
  </div>
</form>
