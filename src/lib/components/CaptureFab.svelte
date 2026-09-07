<script>
  // The Home's +, and the two buttons it opens — Task and Note (user call,
  // 2026-08-18: "deve abrir embaixo outros dois botões azul flutuantes,
  // escrito task e note"; gone with the calendar on 2026-09-04, asked back on
  // 2026-09-07: "gostaria que continuasse assim").
  //
  // WHY IT ASKS AT ALL, when nothing else in the app does any more: every
  // other screen composes for the space it is in, because a space is either
  // tasks or notes. Home is the one screen that is neither — it shows the
  // day's tasks AND the day's notes — so it is the one place where "new what?"
  // is a real question rather than a menu in front of an answer already known.
  //
  // It does not create anything itself. It reports which half was picked, and
  // the shell does the writing — the same split the first version kept.
  import { dismissable } from "../actions/dismissable.js";
  import { S } from "../services/strings.js";
  import Icon from "./Icon.svelte";

  let {
    /// Whether each half is reachable at all (a notebook may have tasks or
    /// notes switched off, or nowhere to write one). With one of them off the
    /// + composes it directly: a choice of one is not a choice.
    canTask = true,
    canNote = true,
    disabled = false,
    /// `("task" | "note") => void`
    onPick,
  } = $props();

  let open = $state(false);
  let both = $derived(canTask && canNote);

  function pick(kind) {
    open = false;
    onPick?.(kind);
  }

  function press() {
    if (both) open = !open;
    else pick(canNote ? "note" : "task");
  }
</script>

<div
  class="capture-fab"
  class:capture-fab--open={open}
  use:dismissable={{ active: open, onDismiss: () => (open = false) }}
>
  <!-- ABOVE the +, now that the + lives in the bottom corner (2026-09-04):
       the choices rise out of it towards the thumb. Only mounted while open. -->
  {#if both && open}
    <div class="capture-fab__choices">
      <button class="capture-fab__choice" onclick={() => pick("note")}>
        {S.note}
      </button>
      <button class="capture-fab__choice" onclick={() => pick("task")}>
        {S.task}
      </button>
    </div>
  {/if}

  <button
    class="capture-fab__toggle"
    aria-label={S.capture}
    aria-expanded={both ? open : undefined}
    {disabled}
    onclick={press}
  >
    <Icon name="plus-bold" size="1.5rem" />
  </button>
</div>
