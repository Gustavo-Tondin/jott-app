<script>
  // The Home's + on a compact screen, and the two buttons it opens
  // (user call, 2026-08-18 — the only piece of the mobile design with no
  // wireframe of its own: "deve abrir embaixo outros dois botões azul
  // flutuantes, escrito task e note").
  //
  // WHY IT ASKS AT ALL, when nothing else in the app does any more: every
  // other screen composes for the space it is in, because a space is either
  // tasks or notes. Home is the one screen that is neither — it shows the
  // day's tasks AND the day's notes — so it is the one place where "new what?"
  // is a real question rather than a menu in front of an answer already known.
  //
  // It does not create anything itself. It reports which half was picked, and
  // the screen that owns the notebook's folders does the writing (HomeView) —
  // the same split the desktop capture box keeps.
  import { dismissable } from "../actions/dismissable.js";
  import { S } from "../services/strings.js";
  import Icon from "./Icon.svelte";

  let {
    /// Whether each half is reachable at all (a notebook may have tasks or
    /// notes switched off). With one of them off the + composes it directly:
    /// a choice of one is not a choice.
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
  <button
    class="capture-fab__toggle"
    aria-label={S.capture}
    aria-expanded={both ? open : undefined}
    {disabled}
    onclick={press}
  >
    <Icon name="plus-bold" size="1.5rem" />
  </button>

  <!-- Below the +, as asked. Only mounted while open: two labelled buttons
       parked under the header is the composer the wireframe deliberately does
       not have. -->
  {#if both && open}
    <div class="capture-fab__choices">
      <button class="capture-fab__choice" onclick={() => pick("task")}>
        {S.task}
      </button>
      <button class="capture-fab__choice" onclick={() => pick("note")}>
        {S.note}
      </button>
    </div>
  {/if}
</div>
