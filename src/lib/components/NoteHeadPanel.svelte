<script>
  // THE NOTE'S HEAD, as a panel: its name and its banner, the two things that
  // are the note's rather than its text's. Two doors open it and both mean the
  // same thing — the title of an open note (`NoteBanner`) and the "Edit" slice
  // of a card's ring (`ActionRing`), which is why it is a component and not
  // markup inside the head.
  //
  // Where it hangs is the caller's: with `at` it is a floating panel at a
  // point (the card), without it an anchored popover (the title above it).
  import { untrack } from "svelte";
  import AccentPicker from "./AccentPicker.svelte";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import { portal } from "../actions/portal.js";
  import { clamp } from "../services/num.js";
  import { S } from "../services/strings.js";

  let {
    title = "",
    /// `{ kind: "color" | "image", value }`, or null — the note's banner as
    /// the shell holds it (services/noteActions.js, `bannerOf`).
    banner = null,
    /// `(name) => void`, or null for a panel with no name field.
    onRename = null,
    /// `(value) => void` — a colour name, an address, or null to take the
    /// banner off. Null: this notebook does not draw banners at all.
    onSet = null,
    /// `() => void` — opens the shell's image picker. Null leaves the banner
    /// to colours.
    onChooseImage = null,
    /// `{x, y}` to float at that point, null to hang from the parent.
    at = null,
    /// Closing carries what was typed, like every field of the app.
    onClose,
  } = $props();

  // The name as it was when the panel opened: it is a DRAFT from here on,
  // and a reload of the note behind it must not overwrite what is being typed.
  let draft = $state(untrack(() => title));
  let field = $state(null);
  let panel = $state(null);
  let placed = $state(null);

  /// A panel on a phone would raise the keyboard over the colours nobody asked
  /// to type into, so the field waits for a tap there; anywhere else the name
  /// is what a click on it means first.
  let compact = $derived(typeof window !== "undefined" && window.innerWidth < 768);

  $effect(() => {
    if (!compact) queueMicrotask(() => field?.select());
  });

  // Floating: kept inside the window by hand, the way `ContextMenu` does it —
  // the point IS the anchor, so there is no trigger for `keepOnScreen`.
  const MARGIN = 8;
  $effect(() => {
    if (!at || !panel) return;
    const r = panel.getBoundingClientRect();
    placed = {
      x: clamp(at.x, MARGIN, Math.max(MARGIN, window.innerWidth - r.width - MARGIN)),
      y: clamp(at.y, MARGIN, Math.max(MARGIN, window.innerHeight - r.height - MARGIN)),
    };
  });

  /// WHAT WAS TYPED IS KEPT, whichever way the panel goes: the form is
  /// submitted, the pointer lands outside, or the host simply stops drawing it
  /// (the title's popover closes from its own head). Hence the teardown —
  /// once, guarded, so the rename never runs twice.
  let settled = false;
  function commit() {
    if (settled) return;
    settled = true;
    const next = draft.trim();
    if (onRename && next && next !== title) onRename(next);
  }
  $effect(() => () => commit());

  function close() {
    commit();
    onClose?.();
  }

  /// Escape is the way out WITHOUT the rename: the typing is dropped a step
  /// before the close reads it.
  function forget(event) {
    if (event.key !== "Escape") return;
    draft = title;
    close();
  }

  function chooseImage() {
    onClose?.();
    onChooseImage?.();
  }
</script>

<svelte:window onkeydowncapture={forget} />

{#if at}
  <div
    bind:this={panel}
    class="theme-popover note-head-panel note-head-panel--loose"
    role="dialog"
    aria-label={S.noteHead}
    style={`left: ${(placed ?? at).x}px; top: ${(placed ?? at).y}px`}
    use:portal
    use:dismissable={{ active: true, onDismiss: close }}
  >
    {@render body()}
  </div>
{:else}
  <div
    class="theme-popover theme-popover--start note-head-panel"
    role="dialog"
    aria-label={S.noteHead}
    use:keepOnScreen
  >
    {@render body()}
  </div>
{/if}

{#snippet body()}
  {#if onRename}
    <form onsubmit={(e) => (e.preventDefault(), close())}>
      <input
        bind:this={field}
        class="theme-input note-head-panel__name"
        aria-label={S.noteTitleField}
        bind:value={draft}
      />
    </form>
  {/if}
  {#if onSet}
    {#if onRename}
      <span class="note-head-panel__rule" role="separator"></span>
    {/if}
    <span class="note-head-panel__label">{S.banner}</span>
    <AccentPicker
      value={banner?.kind === "color" ? banner.value : null}
      preview="fill"
      clearable={false}
      label={S.bannerColor}
      onPick={(name) => onSet(name)}
    />
    {#if onChooseImage}
      <button class="note-head-panel__action" onclick={chooseImage}>{S.bannerImage}</button>
    {/if}
    {#if banner}
      <button class="note-head-panel__action" onclick={() => onSet(null)}>
        {S.removeBanner}
      </button>
    {/if}
  {/if}
{/snippet}
