<script>
  // The Home's +, and the two buttons it opens — Task and Note. It asks
  // because Home is the one screen that is neither tasks nor notes, so "new
  // what?" is a real question there. It creates nothing itself: it reports
  // which half was picked, and the shell writes.
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
  <!-- ABOVE the +: the choices rise out of it towards the thumb. Only
       mounted while open. -->
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
