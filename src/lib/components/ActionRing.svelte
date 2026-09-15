<script>
  // THE CARD'S ACTIONS: hold a card and they open beside the finger as a
  // column of squares; slide onto the one you want and let go. Drawn once for
  // the window (App.svelte) and driven by the gesture through
  // `services/actionRing.js` — this component never listens to a pointer, it
  // only shows where the finger already is.
  //
  // Where the column goes and which square a point falls on is
  // `services/ring.js`. The card itself is NOT drawn here: the gesture lifts
  // the real one into the drag layer, so what the column stands beside is the
  // card the finger is on.
  import Icon from "./Icon.svelte";
  import { portal } from "../actions/portal.js";
  import { afterRingCloses, setActionRing } from "../services/actionRing.js";

  /// The open column, or null: `{ actions, at, quadrant, count, box }` — the
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

  /// Opened by a CLICK (`popRing`), with no finger on it: the column stays up
  /// and each square is pressed. Anywhere else closes it — which is the
  /// column's one rule either way.
  let sticky = $derived(!!ring?.sticky);

  /// The name is written on the side the column OPENED INTO, away from the
  /// finger: that is where the screen is, and it is the one side the hand is
  /// not covering. Read off the box, not the quadrant, which a flip would
  /// contradict.
  let side = $derived(ring && ring.box.x < ring.at.x ? "before" : "after");

  /// THE COLUMN COMES DOWN FIRST, and the action runs after it: a slice that
  /// opens a panel of its own is drawn in the same pass that takes the column
  /// away, and a panel that fails to mount would leave the column standing
  /// over every screen with no way to dismiss it. A step apart, the column is
  /// already gone whatever the action does. See docs/historico.md.
  function choose(action) {
    const at = ring?.at;
    ring = null;
    slot = null;
    afterRingCloses(() => action.run?.(0, at));
  }

  function dismiss() {
    ring = null;
    slot = null;
  }

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
    <div
      class="action-ring__column"
      role="menu"
      style="left: {ring.box.x}px; top: {ring.box.y}px"
    >
      {#each ring.actions as action, i (i)}
        {#if sticky}
          <button
            class="action-ring__pill"
            class:action-ring__pill--on={slot === i}
            style="--ring-step: {i}"
            aria-label={action.label}
            onclick={() => choose(action)}
            onpointerenter={() => (slot = i)}
            onpointerleave={() => slot === i && (slot = null)}
          >
            <Icon name={action.icon} size="1.25rem" />
            {#if slot === i}
              <span class="action-ring__label action-ring__label--{side}">{action.label}</span>
            {/if}
          </button>
        {:else}
          <!-- Not a button: the finger is already captured by the gesture, and
               a second target here would only fight it. The column is
               announced as one menu, each square a row of it. -->
          <span
            class="action-ring__pill"
            class:action-ring__pill--on={slot === i}
            style="--ring-step: {i}"
            role="menuitem"
            aria-label={action.label}
          >
            <Icon name={action.icon} size="1.25rem" />
            {#if slot === i}
              <span class="action-ring__label action-ring__label--{side}">{action.label}</span>
            {/if}
          </span>
        {/if}
      {/each}
    </div>
  </div>
{/if}
