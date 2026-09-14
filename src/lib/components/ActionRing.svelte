<script>
  // THE ACTION RING: hold a card and its actions open around the finger; drag
  // to the one you want and let go. Drawn once for the window (App.svelte) and
  // driven by the gesture through `services/actionRing.js` — this component
  // never listens to a pointer, it only shows where the finger already is.
  //
  // The geometry (which quarter, where each pill sits) is `services/ring.js`.
  // The card itself is NOT drawn here: the gesture lifts the real one into the
  // drag layer, so what the ring surrounds is the card the finger is on.
  import Icon from "./Icon.svelte";
  import { portal } from "../actions/portal.js";
  import { setActionRing } from "../services/actionRing.js";
  import { ringSlots } from "../services/ring.js";

  /// The open ring, or null: `{ actions, at, quadrant, count, radius }` — the
  /// very object the gesture reads, handed over as it opens.
  let ring = $state.raw(null);
  let slot = $state(null);

  $effect(() => {
    setActionRing({
      open(next) {
        ring = next;
        slot = null;
      },
      hover(on) {
        slot = on;
      },
      close() {
        ring = null;
        slot = null;
      },
    });
    return () => setActionRing(null);
  });

  let pills = $derived(ring ? ringSlots(ring.count, ring.quadrant, ring.radius) : []);
  /// Opened by a CLICK (`popRing`), with no finger on it: the ring stays up
  /// and each slice is pressed. Anywhere else closes it — which is the ring's
  /// one rule either way.
  let sticky = $derived(!!ring?.sticky);

  function choose(action) {
    const at = ring?.at;
    ring = null;
    slot = null;
    action.run?.(0, at);
  }

  function dismiss() {
    ring = null;
    slot = null;
  }
  /// The label sits on the side the ring came FROM — the inside of the
  /// screen. A ring that opened rightwards puts its labels to the left of the
  /// pills, or the first one is written off the edge of a phone (seen on
  /// Android, 2026-09-14).
  let side = $derived(ring?.quadrant.x === 1 ? "end" : "start");

  function onKey(event) {
    if (sticky && event.key === "Escape") dismiss();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if ring}
  <!-- Outside the window, so it declares its own region: colour roles are
       inherited, and the drag layer's ground is nobody's (CLAUDE.md, colour).
       `portal` because an ancestor with a translate — the drawer — is the
       containing block of every fixed thing inside it. -->
  <div class="action-ring" class:action-ring--sticky={sticky} data-region="canvas" use:portal>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="action-ring__wash" onclick={sticky ? dismiss : null}></div>
    {#each pills as pill, i (i)}
      {@const action = ring.actions[i]}
      <div
        class="action-ring__slice"
        class:action-ring__slice--on={slot === i}
        style="--ring-x: {pill.x}px; --ring-y: {pill.y}px; --ring-at-x: {ring.at
          .x}px; --ring-at-y: {ring.at.y}px; --ring-step: {i}"
      >
        {#if sticky}
          <!-- Pressed, because nothing is holding the pointer: this ring was
               opened by a click on the card's ⋮. NO `title`: the ring says the
               name itself, beside the pill, and the system's tooltip landed on
               top of that (seen in the app, 2026-09-14). -->
          <button
            class="action-ring__pill"
            aria-label={action.label}
            onclick={() => choose(action)}
            onpointerenter={() => (slot = i)}
            onpointerleave={() => slot === i && (slot = null)}
          >
            <Icon name={action.icon} size="1.25rem" />
          </button>
        {:else}
          <!-- Not a button: the finger is already captured by the gesture, and
               a second target here would only fight it. The ring is announced
               as one menu, each slice a row of it. -->
          <span class="action-ring__pill" role="menuitem" aria-label={action.label}>
            <Icon name={action.icon} size="1.25rem" />
          </span>
        {/if}
        {#if slot === i}
          <span class="action-ring__label action-ring__label--{side}">{action.label}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}
